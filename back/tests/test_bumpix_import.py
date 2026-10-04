import copy
import tempfile
import unittest
from pathlib import Path

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from bumpix_fixtures import ACCOUNT, snapshot, add_photo, write_package, write_index


class ImportTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        from models import Base, Client, ClientNote, Studio, User, StudioMember, Lesson, Reservation
        from models.bumpix import BumpixClient, BumpixEvent, BumpixMedia, BumpixSnapshot, BumpixJournalLink
        from services.bumpix_import.service import Importer
        self.models = (Client, ClientNote, BumpixClient, BumpixEvent, BumpixMedia, BumpixSnapshot)
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.engine = create_async_engine('sqlite+aiosqlite:///' + str(self.root / 'test.sqlite'))
        tables = [m.__table__ for m in (Studio, User, StudioMember, Lesson, Reservation, BumpixJournalLink) + self.models]
        async with self.engine.begin() as db:
            await db.run_sync(lambda conn: Base.metadata.create_all(conn, tables=tables))
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False)
        async with self.sessions.begin() as db:
            db.add_all([Studio(id=1, name='Test studio'), Studio(id=2, name='Other studio'),
                        User(id=1, email='owner@example.test', name='Owner', hashed_password='dummy'),
                        User(id=2, email='trainer@example.test', name='Trainer', hashed_password='dummy')])
            await db.flush()
            db.add_all([StudioMember(studio_id=1, user_id=1, name='Owner', role='owner', status='active'),
                        StudioMember(studio_id=1, user_id=2, name='Trainer', role='trainer', status='active')])
        self.importer = Importer(self.sessions, self.root / 'uploads')

    async def asyncTearDown(self):
        await self.engine.dispose()
        self.temp.cleanup()

    def export(self, data=None, cid='1.100'):
        from services.bumpix_import.archive import open_export
        data = data or snapshot(cid)
        photos = dict([add_photo(data), add_photo(data, 'avatar', color='blue')]) if not data['media'] else {}
        path, _ = write_package(self.root, data, photos)
        return open_export(path)

    async def counts(self):
        async with self.sessions() as db:
            return [await db.scalar(select(func.count()).select_from(model)) for model in self.models]

    async def apply(self, export, mapping=None):
        return await self.importer.apply(export, studio_id=1, owner_email='owner@example.test',
                                         account_key=ACCOUNT, mapping=mapping or {})

    async def test_preview_never_mutates_database_or_copies_media(self):
        with self.export() as export:
            report = await self.importer.preview(export, 1, 'owner@example.test')
            self.assertTrue(report['ready'])
        self.assertEqual(await self.counts(), [0] * 6)
        self.assertFalse((self.root / 'uploads').exists())

    async def test_repeat_is_idempotent_and_photos_keep_their_event_and_avatar_owners(self):
        with self.export() as export:
            first = await self.apply(export, {'masters': {'1.1': 2}})
            second = await self.apply(export, {'masters': {'1.1': 2}})
        self.assertTrue(first['complete'])
        self.assertTrue(second['complete'])
        self.assertEqual(second['items'][0]['action'], 'skip')
        self.assertEqual(await self.counts(), [1, 1, 1, 3, 2, 1])
        async with self.sessions() as db:
            Client, _, _, Event, Media, _ = self.models
            client = await db.scalar(select(Client))
            self.assertFalse(client.notifs_enabled)
            events = (await db.scalars(select(Event))).all()
            self.assertEqual({e.status for e in events}, {'new', 'completed', 'canceled'})
            self.assertEqual({e.teacher_user_id for e in events}, {2})
            media = (await db.scalars(select(Media))).all()
            self.assertEqual({m.kind for m in media}, {'event', 'avatar'})
            self.assertIsNone(next(m for m in media if m.kind == 'avatar').event_id)
            self.assertIsNotNone(next(m for m in media if m.kind == 'event').event_id)

    async def test_same_snapshot_preserves_crm_edits_and_repairs_missing_photo(self):
        with self.export() as export:
            await self.apply(export)
            async with self.sessions.begin() as db:
                client = await db.scalar(select(self.models[0]))
                client.name = 'Edited locally'
                media = await db.scalar(select(self.models[4]))
                (self.root / 'uploads' / media.path).unlink()
            result = await self.apply(export)
            self.assertTrue(result['complete'])
            self.assertTrue((self.root / 'uploads' / media.path).is_file())
        async with self.sessions() as db:
            self.assertEqual((await db.scalar(select(self.models[0]))).name, 'Edited locally')

    async def test_changed_source_updates_managed_fields_and_keeps_version_history(self):
        with self.export() as export:
            await self.apply(export)
        data = snapshot(name='Changed source name')
        with self.export(data) as export:
            result = await self.apply(export)
        self.assertTrue(result['complete'])
        self.assertEqual((await self.counts())[-1], 2)
        async with self.sessions() as db:
            self.assertEqual((await db.scalar(select(self.models[0]))).name, 'Changed source name')

    async def test_conflicting_source_and_crm_edit_blocks_all_clients_before_writing(self):
        with self.export() as export:
            await self.apply(export)
        async with self.sessions.begin() as db:
            (await db.scalar(select(self.models[0]))).name = 'Local change'
        data = snapshot(name='Source change')
        path, sid = write_package(self.root, data)
        other = snapshot('1.101', name='Another client')
        path2, sid2 = write_package(self.root, other)
        write_index(self.root, [('1.100', path, sid), ('1.101', path2, sid2)])
        from services.bumpix_import.archive import open_export
        with open_export(self.root) as export:
            report = await self.apply(export)
        self.assertFalse(report['complete'])
        self.assertEqual((await self.counts())[0], 1)

    async def test_existing_contact_requires_mapping_and_link_keeps_real_profile(self):
        async with self.sessions.begin() as db:
            db.add(self.models[0](id=42, studio_id=1, name='Real CRM name', phone='+420123456789'))
        with self.export(snapshot(phone='+420123456789')) as export:
            blocked = await self.apply(export)
            self.assertFalse(blocked['complete'])
            self.assertEqual(blocked['items'][0]['candidates'], [42])
            linked = await self.apply(export, {'clients': {'1.100': 42}})
            self.assertTrue(linked['complete'])
        self.assertEqual((await self.counts())[0], 1)
        async with self.sessions() as db:
            self.assertEqual((await db.get(self.models[0], 42)).name, 'Real CRM name')

    async def test_wrong_owner_account_client_or_master_studio_cannot_write(self):
        async with self.sessions.begin() as db:
            db.add(self.models[0](id=42, studio_id=2, name='Foreign client'))
        with self.export() as export:
            with self.assertRaises(ValueError):
                await self.importer.apply(export, 2, 'owner@example.test', ACCOUNT)
            with self.assertRaises(ValueError):
                await self.importer.apply(export, 1, 'owner@example.test', 'b' * 64)
            result = await self.apply(export, {'clients': {'1.100': 42}})
            self.assertFalse(result['complete'])
            with self.assertRaises(ValueError):
                await self.apply(export, {'masters': {'1.1': 999}})
        self.assertEqual((await self.counts())[2], 0)

    async def test_different_source_clients_sharing_phone_require_explicit_decision(self):
        paths = []
        for cid in ('1.10', '1.100'):
            path, sid = write_package(self.root, snapshot(cid, name='Shared', phone='+420123456789'))
            paths.append((cid, path, sid))
        write_index(self.root, paths)
        from services.bumpix_import.archive import open_export
        with open_export(self.root) as export:
            report = await self.apply(export)
            self.assertFalse(report['complete'])
            report = await self.apply(export, {'clients': {'1.10': 'create', '1.100': 'create'}})
            self.assertTrue(report['complete'])
        self.assertEqual((await self.counts())[0], 2)

    async def test_source_master_mapping_is_kept_for_a_later_client(self):
        with self.export() as export:
            await self.apply(export, {'masters': {'1.1': 2}})
        with self.export(snapshot('1.101', name='Later client')) as export:
            result = await self.apply(export)
        self.assertTrue(result['complete'])
        async with self.sessions() as db:
            teachers = (await db.scalars(select(self.models[3].teacher_user_id))).all()
            self.assertEqual(set(teachers), {2})

    async def test_new_photo_revision_retains_prior_version_without_duplicate_current_photo(self):
        data = snapshot()
        images = dict([add_photo(data)])
        path, _ = write_package(self.root, data, images)
        from services.bumpix_import.archive import open_export
        with open_export(path) as export:
            await self.apply(export)
        data2 = snapshot()
        images2 = dict([add_photo(data2, color='blue')])
        data2['media'][0]['revision'] = '8'
        data2['events'][0]['view']['media'][0]['revision'] = '8'
        path2, _ = write_package(self.root, data2, images2)
        with open_export(path2) as export:
            self.assertTrue((await self.apply(export))['complete'])
            self.assertTrue((await self.apply(export))['complete'])
        async with self.sessions() as db:
            photos = (await db.scalars(select(self.models[4]))).all()
            self.assertEqual(len(photos), 2)
            self.assertEqual(sum(p.is_current for p in photos), 1)
            self.assertEqual((await self.counts())[-1], 2)

    async def test_history_removed_on_refresh_is_retained_as_previous_version(self):
        with self.export() as export:
            await self.apply(export)
        data = snapshot()
        removed = data['events'].pop()['view']['id']
        for key in data['groups']:
            data['groups'][key] = [eid for eid in data['groups'][key] if eid != removed]
            data['counts'][key] = len(data['groups'][key])
        data['history_ids'].remove(removed)
        data['history_count'] -= 1
        with self.export(data) as export:
            self.assertTrue((await self.apply(export))['complete'])
        async with self.sessions() as db:
            events = (await db.scalars(select(self.models[3]))).all()
            self.assertEqual(len(events), 3)
            self.assertEqual(sum(e.is_current for e in events), 2)

    async def test_reading_filters_pagination_and_master_scope(self):
        from types import SimpleNamespace
        from services.bumpix_import.reading import event_page, bindings_for
        with self.export() as export:
            await self.apply(export, {'masters': {'1.1': 2}})
        ctx = SimpleNamespace(studio_id=1, role='owner', user=SimpleNamespace(id=1))
        async with self.sessions() as db:
            cid = await db.scalar(select(self.models[0].id))
            for category, status in (('new', 'new'), ('completed', 'completed'), ('canceled', 'canceled')):
                page = await event_page(db, ctx, cid, category, 0, 50)
                self.assertEqual(page['total'], 1)
                self.assertEqual(page['items'][0]['status'], status)
            self.assertEqual((await event_page(db, ctx, cid, 'all', 1, 1))['total'], 3)
            self.assertEqual((await event_page(db, ctx, cid, 'history', 0, 50))['total'], 3)
            trainer = SimpleNamespace(studio_id=1, role='trainer', user=SimpleNamespace(id=2))
            self.assertEqual((await event_page(db, trainer, cid, 'all', 0, 50))['total'], 3)
            foreign = SimpleNamespace(studio_id=2, role='owner', user=SimpleNamespace(id=1))
            with self.assertRaises(ValueError):
                await bindings_for(db, foreign, cid)

    async def test_mid_batch_failure_rolls_back_one_card_and_resume_keeps_prior_success(self):
        from unittest.mock import patch
        from services.bumpix_import.archive import open_export
        entries = []
        for cid, name in (('1.100', 'First'), ('1.101', 'Second')):
            path, sid = write_package(self.root, snapshot(cid, name=name))
            entries.append((cid, path, sid))
        write_index(self.root, entries)
        save = self.importer._save
        async def broken(db, package, *args):
            result = await save(db, package, *args)
            if package.client_id == '1.101':
                raise ValueError('Injected transaction failure')
            return result
        with open_export(self.root) as export:
            with patch.object(self.importer, '_save', broken):
                report = await self.apply(export)
            self.assertFalse(report['complete'])
            self.assertEqual((await self.counts())[0], 1)
            report = await self.apply(export)
            self.assertTrue(report['complete'])
        self.assertEqual((await self.counts())[0], 2)

    async def test_refresh_contact_collision_requires_explicit_current_client_mapping(self):
        with self.export(snapshot(name='Alice', phone='+420123456789')) as export:
            self.assertTrue((await self.apply(export))['complete'])
        async with self.sessions.begin() as db:
            alice_id = await db.scalar(select(self.models[0].id))
            db.add(self.models[0](id=42, studio_id=1, name='Bob', phone='+420987654321'))
        with self.export(snapshot(name='Alice', phone='+420987654321')) as export:
            preview = await self.importer.preview(export, 1, 'owner@example.test')
            self.assertFalse(preview['ready'])
            self.assertEqual(preview['items'][0]['candidates'], [42])
            self.assertFalse((await self.apply(export))['complete'])
            self.assertTrue((await self.apply(export, {'clients': {'1.100': alice_id}}))['complete'])

    async def test_legacy_native_phone_normalization_stops_duplicate_creation(self):
        async with self.sessions.begin() as db:
            db.add(self.models[0](id=42, studio_id=1, name='Existing person', phone='8 (999) 123-45-67'))
        with self.export(snapshot(name='Source person', phone='+7 999 123-45-67')) as export:
            preview = await self.importer.preview(export, 1, 'owner@example.test')
            self.assertFalse(preview['ready'])
            self.assertEqual(preview['items'][0]['candidates'], [42])

    async def test_partial_master_remap_is_consistent_for_the_entire_source_account(self):
        with self.export(snapshot('1.100', name='First')) as export:
            await self.apply(export, {'masters': {'1.1': 2}})
        with self.export(snapshot('1.101', name='Second')) as export:
            await self.apply(export)
        with self.export(snapshot('1.100', name='First')) as export:
            self.assertTrue((await self.apply(export, {'masters': {'1.1': 1}}))['complete'])
        async with self.sessions() as db:
            self.assertEqual(set((await db.scalars(select(self.models[3].teacher_user_id))).all()), {1})
        with self.export(snapshot('1.102', name='Third')) as export:
            self.assertTrue((await self.apply(export))['complete'])
        async with self.sessions() as db:
            self.assertEqual(set((await db.scalars(select(self.models[3].teacher_user_id))).all()), {1})

    async def test_verified_native_contact_cannot_be_replaced_by_source_refresh(self):
        with self.export(snapshot(phone='+420123456789')) as export:
            await self.apply(export)
        async with self.sessions.begin() as db:
            client = await db.scalar(select(self.models[0]))
            client.phone_verified = True
            cid = client.id
        with self.export(snapshot(phone='+420987654321')) as export:
            self.assertFalse((await self.importer.preview(export, 1, 'owner@example.test'))['ready'])
            self.assertFalse((await self.apply(export, {'clients': {'1.100': cid}}))['complete'])
        async with self.sessions() as db:
            client = await db.get(self.models[0], cid)
            self.assertEqual(client.phone, '+420123456789')
            self.assertTrue(client.phone_verified)


if __name__ == '__main__':
    unittest.main()
