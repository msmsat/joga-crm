"""Preview, explicit matching and resumable per-client transactions."""
import asyncio
from collections import Counter
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.exc import SQLAlchemyError
from models import Client, ClientNote, Studio, StudioMember, User
from models.bumpix import BumpixClient, BumpixEvent, BumpixMedia, BumpixSnapshot
from .matching import candidates, native_values, shares_identity
from .media import store_photos
from .validation import event_times, identity, photo_key, sha


class Importer:
    def __init__(self, sessions, storage_root):
        self.sessions = sessions
        self.storage_root = storage_root

    async def _authorize(self, db, studio_id, owner_email):
        if type(studio_id) is not int or studio_id < 1:
            raise ValueError('A positive studio ID is required')
        owner = await db.scalar(select(User).join(StudioMember, StudioMember.user_id == User.id).where(
            User.email == owner_email.strip().lower(), StudioMember.studio_id == studio_id,
            StudioMember.role == 'owner', StudioMember.status == 'active'))
        if owner is None:
            raise ValueError('Selected account is not an active owner of the target studio')
        return owner

    async def _mapping(self, db, export, studio_id, mapping):
        if not isinstance(mapping, dict) or set(mapping) - {'clients', 'masters'}:
            raise ValueError('Mapping may contain only clients and masters')
        client_map, masters = mapping.get('clients', {}), mapping.get('masters', {})
        if not isinstance(client_map, dict) or not isinstance(masters, dict):
            raise ValueError('Mapping clients/masters must be objects')
        ids = {p.client_id for p in export.packages}
        targets = []
        for cid, target in client_map.items():
            identity(cid)
            if cid not in ids or (target != 'create' and (type(target) is not int or target < 1)):
                raise ValueError('Invalid source client/target in mapping')
            if target != 'create':
                targets.append(target)
        if len(targets) != len(set(targets)):
            raise ValueError('Two source clients cannot be mapped to one CRM card')
        available_masters = {e['view']['master_id'] for p in export.packages for e in p.snapshot['events']}
        for mid, user_id in masters.items():
            identity(mid)
            if mid not in available_masters or type(user_id) is not int or user_id < 1:
                raise ValueError('Invalid source master mapping')
            member = await db.scalar(select(StudioMember).where(
                StudioMember.studio_id == studio_id, StudioMember.user_id == user_id,
                StudioMember.status == 'active', StudioMember.role.in_(['owner', 'admin', 'trainer'])))
            if member is None:
                raise ValueError('Mapped master is not an active staff member of the target studio')
        return client_map, masters

    async def _plan(self, db, package, studio_id, account, client_map):
        cid, profile = package.client_id, package.snapshot['profile']
        binding = await db.scalar(select(BumpixClient).where(
            BumpixClient.studio_id == studio_id, BumpixClient.account_key == account,
            BumpixClient.source_client_id == cid))
        item = {'source_client_id': cid, 'snapshot_id': package.snapshot_id, 'action': 'create',
                'source_name': str(profile.get('name') or ''),
                'client_id': None, 'candidates': [], 'errors': [], 'warnings': [],
                'events': len(package.snapshot['events']), 'photos': len(package.snapshot['media'])}
        target = client_map.get(cid)
        if binding:
            client = await db.get(Client, binding.client_id)
            if not client or client.studio_id != studio_id:
                item['errors'].append('Existing source binding points outside the target studio')
                return item
            item['client_id'] = client.id
            item['action'] = 'skip' if binding.snapshot_id == package.snapshot_id else 'update'
            if target is not None and target != client.id:
                item['errors'].append('An existing source ID cannot be rebound to another CRM card')
            if binding.managed_values:
                values, warnings = native_values(profile)
                item['warnings'].extend(warnings)
                proposed = {}
                for field, old in binding.managed_values.items():
                    new, current = values[field], getattr(client, field)
                    if current not in (old, new) and new != old:
                        item['errors'].append('Source and CRM both changed field: ' + field)
                    if current == old and current != new:
                        proposed[field] = new
                if 'phone' in proposed and client.phone_verified:
                    item['errors'].append('Verified CRM phone cannot be replaced from an unverified source; resolve contact verification in CRM first')
                if proposed:
                    others = (await db.scalars(select(Client).where(Client.studio_id == studio_id, Client.id != client.id))).all()
                    item['candidates'] = candidates(proposed, others)
                    item['candidate_details'] = [{'client_id': c.id, 'name': ' '.join(p for p in (c.name, c.last_name) if p)}
                                                 for c in others if c.id in item['candidates']]
                    if item['candidates'] and target != client.id:
                        item['errors'].append('Updated contact/name matches another CRM card; map this source ID to its current CRM ID to acknowledge')
            old_comment = str(binding.payload['profile'].get('comment') or '')
            new_comment = str(profile.get('comment') or '')
            note = await db.get(ClientNote, binding.note_id) if binding.note_id else None
            if old_comment and (not note or note.client_id != client.id or note.studio_id != studio_id):
                item['errors'].append('Imported profile note was removed or reassigned in CRM')
            elif note and new_comment != old_comment and note.text not in (old_comment, new_comment):
                item['errors'].append('Source and CRM both changed the profile note')
        else:
            clients = (await db.scalars(select(Client).where(Client.studio_id == studio_id))).all()
            item['candidates'] = candidates(profile, clients)
            item['candidate_details'] = [{'client_id': c.id, 'name': ' '.join(p for p in (c.name, c.last_name) if p)}
                                         for c in clients if c.id in item['candidates']]
            if type(target) is int:
                client = next((c for c in clients if c.id == target), None)
                if not client:
                    item['errors'].append('Mapped CRM client does not belong to the target studio')
                elif await db.scalar(select(BumpixClient.id).where(
                        BumpixClient.studio_id == studio_id, BumpixClient.account_key == account, BumpixClient.client_id == target)):
                    item['errors'].append('Mapped CRM client is already bound to another source client')
                else:
                    item['client_id'], item['action'] = target, 'link'
            else:
                try:
                    _, item['warnings'] = native_values(profile)
                except ValueError as exc:
                    item['errors'].append(str(exc))
                if item['candidates'] and target != 'create':
                    item['errors'].append('Possible existing CRM card: explicit mapping is required')
        # A source event can never migrate between clients, even on refresh.
        source_ids = [e['view']['id'] for e in package.snapshot['events']]
        if source_ids:
            foreign = await db.scalar(select(BumpixEvent.id).where(
                BumpixEvent.studio_id == studio_id, BumpixEvent.account_key == account,
                BumpixEvent.source_event_id.in_(source_ids),
                BumpixEvent.binding_id != (binding.id if binding else -1)).limit(1))
            if foreign:
                item['errors'].append('Source event is already assigned to a different client')
        if item['errors']:
            item['action'] = 'conflict'
        return item

    async def preview(self, export, studio_id, owner_email, mapping=None):
        mapping = mapping or {}
        async with self.sessions() as db:
            owner = await self._authorize(db, studio_id, owner_email)
            client_map, masters = await self._mapping(db, export, studio_id, mapping)
            items = [await self._plan(db, p, studio_id, export.account_key, client_map) for p in export.packages]
            # Detect ambiguities within the incoming batch before the first insert.
            for index, item in enumerate(items):
                if item['action'] != 'create' or client_map.get(item['source_client_id']) == 'create':
                    continue
                profile = export.packages[index].snapshot['profile']
                if any(shares_identity(profile, p.snapshot['profile']) for j, p in enumerate(export.packages) if j != index):
                    item['errors'].append('Source clients share name/contact: choose create or an explicit CRM mapping')
                    item['action'] = 'conflict'
            mapped = dict(masters)
            existing = (await db.scalars(select(BumpixEvent).where(
                BumpixEvent.studio_id == studio_id, BumpixEvent.account_key == export.account_key,
                BumpixEvent.teacher_user_id.is_not(None)))).all()
            ambiguous_masters = set()
            for event in existing:
                if event.master_source_id in mapped and mapped[event.master_source_id] != event.teacher_user_id and event.master_source_id not in masters:
                    ambiguous_masters.add(event.master_source_id)
                mapped.setdefault(event.master_source_id, event.teacher_user_id)
            mids = sorted({e['view']['master_id'] for p in export.packages for e in p.snapshot['events']})
            if ambiguous_masters & set(mids):
                for item in items:
                    item['errors'].append('Prior master mappings disagree; supply explicit masters mapping')
                    item['action'] = 'conflict'
            master_names = {m.get('0'): m.get('2', '') for p in export.packages for m in p.snapshot['lookups'].get('masters', []) if isinstance(m, dict)}
            team = (await db.scalars(select(StudioMember).where(StudioMember.studio_id == studio_id,
                StudioMember.status == 'active', StudioMember.role.in_(['owner', 'admin', 'trainer'])))).all()
            return {'format': 1, 'mode': 'preview', 'ready': all(not i['errors'] for i in items),
                    'complete': False, 'studio_id': studio_id, 'owner_id': owner.id,
                    'account_key': export.account_key, 'fingerprint': export.fingerprint,
                    'mapping': mapping, 'unmapped_masters': [mid for mid in mids if mid not in mapped],
                    'masters': [{'source_master_id': mid, 'source_name': master_names.get(mid, ''), 'teacher_user_id': mapped.get(mid)} for mid in mids],
                    'target_team': [{'user_id': m.user_id, 'name': m.name, 'role': m.role} for m in team],
                    'items': items, 'counts': dict(Counter(i['action'] for i in items))}

    async def _save(self, db, package, studio_id, account, owner_id, client_map, masters, paths):
        # Native note edits do not acquire the studio lock. Lock their row before
        # reading the three-way baseline, so an edit committed first is observed.
        locked = await db.scalar(select(BumpixClient).where(
            BumpixClient.studio_id == studio_id, BumpixClient.account_key == account,
            BumpixClient.source_client_id == package.client_id).with_for_update())
        target = locked.client_id if locked else client_map.get(package.client_id)
        if type(target) is int:
            await db.scalar(select(Client).where(Client.id == target, Client.studio_id == studio_id).with_for_update())
        if locked and locked.note_id:
            await db.scalar(select(ClientNote).where(ClientNote.id == locked.note_id).with_for_update())
        plan = await self._plan(db, package, studio_id, account, client_map)
        if plan['errors']:
            raise ValueError('Database changed since preview: ' + '; '.join(plan['errors']))
        data = package.snapshot
        binding = await db.scalar(select(BumpixClient).where(
            BumpixClient.studio_id == studio_id, BumpixClient.account_key == account,
            BumpixClient.source_client_id == package.client_id))
        values, _ = native_values(data['profile']) if plan['action'] == 'create' or (binding and binding.managed_values) else ({}, [])
        if not binding:
            if plan['action'] == 'link':
                client = await db.get(Client, plan['client_id'])
            else:
                client = Client(studio_id=studio_id, **values, source='bumpix', notifs_enabled=False, reminders_enabled=False)
                db.add(client)
                await db.flush()
            binding = BumpixClient(studio_id=studio_id, account_key=account, source_client_id=package.client_id,
                                   client_id=client.id, snapshot_id=package.snapshot_id, payload=data,
                                   managed_values=values if plan['action'] == 'create' else {})
            db.add(binding)
            await db.flush()
            old_comment = ''
        else:
            client = await db.get(Client, binding.client_id)
            old_comment = str(binding.payload['profile'].get('comment') or '')
            for field, old in binding.managed_values.items():
                if getattr(client, field) == old:
                    setattr(client, field, values[field])
            if binding.managed_values:
                binding.managed_values = values
        comment = str(data['profile'].get('comment') or '')
        if comment or binding.note_id:
            if binding.note_id:
                note = await db.get(ClientNote, binding.note_id)
                if note.text == old_comment:
                    note.text = comment
                    if comment != old_comment:
                        note.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
            elif comment:
                note = ClientNote(client_id=client.id, studio_id=studio_id, author_id=owner_id, text=comment, photos=[])
                db.add(note)
                await db.flush()
                binding.note_id = note.id
        if not await db.scalar(select(BumpixSnapshot.id).where(
                BumpixSnapshot.binding_id == binding.id, BumpixSnapshot.snapshot_id == package.snapshot_id)):
            db.add(BumpixSnapshot(binding_id=binding.id, snapshot_id=package.snapshot_id, payload=data))
        binding.snapshot_id, binding.payload, binding.updated_at = package.snapshot_id, data, datetime.now(timezone.utc).replace(tzinfo=None)
        # A source master is an account-wide identity. An explicit remapping
        # updates all its imported visits under the same studio transaction,
        # including visits outside the selected client subset.
        for mid, teacher in masters.items():
            await db.execute(update(BumpixEvent).where(BumpixEvent.studio_id == studio_id,
                BumpixEvent.account_key == account, BumpixEvent.master_source_id == mid
                ).values(teacher_user_id=teacher).execution_options(synchronize_session=False))
        events = (await db.scalars(select(BumpixEvent).where(BumpixEvent.binding_id == binding.id))).all()
        by_id = {e.source_event_id: e for e in events}
        mapped_events = (await db.execute(select(BumpixEvent.master_source_id, BumpixEvent.teacher_user_id).where(
            BumpixEvent.studio_id == studio_id, BumpixEvent.account_key == account,
            BumpixEvent.teacher_user_id.is_not(None)))).all()
        persisted_masters = {}
        for mid, teacher in mapped_events:
            if mid in persisted_masters and persisted_masters[mid] != teacher and mid not in masters:
                raise ValueError('Conflicting prior master mappings; provide an explicit masters mapping')
            persisted_masters[mid] = teacher
        for event in events:
            event.is_current = False
        for source in data['events']:
            view = source['view']
            eid = view['id']
            event = by_id.get(eid)
            if not event:
                event = BumpixEvent(studio_id=studio_id, account_key=account, binding_id=binding.id,
                                    client_id=client.id, source_event_id=eid)
                db.add(event)
                by_id[eid] = event
            event.master_source_id = view['master_id']
            event.teacher_user_id = masters.get(view['master_id'], persisted_masters.get(view['master_id']))
            event.start_time, event.end_time = event_times(view)
            event.status, event.payload, event.is_current = view['status'], source, True
            event.groups = [key for key, ids in data['groups'].items() if eid in ids]
            if eid in data['history_ids']:
                event.groups = event.groups + ['history']
            event.group_mask = sum(mask for label, mask in {'t1': 1, 't2': 2, 't3': 4, 't4': 8, 't5': 16, 'history': 32}.items() if label in event.groups)
            event.income, event.outlay = str(view.get('income') or '0'), str(view.get('outlay') or '0')
        await db.flush()
        photos = (await db.scalars(select(BumpixMedia).where(BumpixMedia.binding_id == binding.id))).all()
        photos_by_key = {(p.kind, p.source_owner_id, p.image_id, p.revision): p for p in photos}
        for photo in photos:
            photo.is_current = False
        for source in data['media']:
            key = photo_key(source)
            photo = photos_by_key.get(key)
            if photo and photo.sha256 != source['sha256']:
                raise ValueError('Photo content changed without a new source revision')
            if not photo:
                photo = BumpixMedia(studio_id=studio_id, binding_id=binding.id, kind=source['kind'],
                                    source_owner_id=source['owner_id'], image_id=source['image_id'], revision=source['revision'])
                db.add(photo)
            photo.event_id = by_id[source['owner_id']].id if source['kind'] == 'event' else None
            photo.path, photo.sha256, photo.bytes, photo.is_current = paths[source['path']], source['sha256'], source['bytes'], True
        await db.flush()
        plan['client_id'] = client.id
        plan['committed'] = True
        return plan

    async def apply(self, export, studio_id, owner_email, account_key, mapping=None, progress=None):
        if sha(account_key) != export.account_key:
            raise ValueError('Expected Bumpix account key does not match the export')
        report = await self.preview(export, studio_id, owner_email, mapping)
        report['mode'] = 'apply'
        if not report['ready']:
            return report
        completed = []
        for package in export.packages:
            try:
                paths = await asyncio.to_thread(store_photos, package, self.storage_root, studio_id, account_key)
                async with self.sessions.begin() as db:
                    # Same studio lock as native booking mutation paths; uniqueness is the second guard.
                    await db.scalar(select(Studio).where(Studio.id == studio_id).with_for_update())
                    owner = await self._authorize(db, studio_id, owner_email)
                    client_map, masters = await self._mapping(db, export, studio_id, mapping or {})
                    saved = await self._save(db, package, studio_id, account_key, owner.id, client_map, masters, paths)
                completed.append(saved)
                if progress:
                    progress(completed[-1], len(completed), len(export.packages))
            except (ValueError, OSError, SQLAlchemyError) as exc:
                # Do not print DB exception strings: they can include contacts and connection details.
                report['error'] = str(exc) if isinstance(exc, ValueError) else 'Import failed: ' + type(exc).__name__
                report['failed_source_client_id'] = package.client_id
                break
        report['items'] = completed + [i for i in report['items'] if i['source_client_id'] not in {c['source_client_id'] for c in completed}]
        report['counts'] = dict(Counter(i['action'] for i in completed))
        report['complete'] = len(completed) == len(export.packages) and not report.get('error')
        return report
