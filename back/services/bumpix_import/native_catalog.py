"""Stable catalogue identities for source service combinations."""
import hashlib
from sqlalchemy import select, insert
from models import Service, user_services
from models.bumpix import BumpixServiceLink


def key_for(source):
    raw, view = source.get('raw', {}), source['view']
    ids = str(raw.get('e') or '')
    if not ids:
        ids = ','.join(unit.split(':')[0] for unit in str(raw.get('6') or '').split(',') if unit)
    return ids or 'name:' + hashlib.sha256(str(view.get('services') or '').encode()).hexdigest()


async def service_for(db, studio_id, account, source, teacher_id, price, duration, decisions):
    key = key_for(source)
    link = await db.scalar(select(BumpixServiceLink).where(BumpixServiceLink.studio_id == studio_id,
        BumpixServiceLink.account_key == account, BumpixServiceLink.source_key == key))
    target = decisions.get(key)
    if link:
        if target is not None and target != link.service_id:
            raise ValueError('Source service cannot silently change its catalogue binding')
        service = await db.get(Service, link.service_id) if link.service_id else None
        if not service or service.studio_id != studio_id:
            raise ValueError('Imported catalogue service was deleted; resolve its binding')
    else:
        service = await db.get(Service, target) if target else None
        if target and (not service or service.studio_id != studio_id):
            raise ValueError('Mapped service does not belong to target studio')
        if not service:
            title = str(source['view'].get('services') or 'Заняття')
            if len(title) > 150:
                raise ValueError('Source service title exceeds the native field; map a catalogue service explicitly')
            service = Service(studio_id=studio_id, name=title, price=price, duration_min=duration)
            db.add(service)
            await db.flush()
        db.add(BumpixServiceLink(studio_id=studio_id, account_key=account, source_key=key, service_id=service.id))
    # An owner with assigned services is a master throughout CRM. No role change.
    assigned = await db.scalar(select(user_services.c.user_id).where(
        user_services.c.user_id == teacher_id, user_services.c.service_id == service.id))
    if assigned is None:
        await db.execute(insert(user_services).values(user_id=teacher_id, service_id=service.id))
    return service
