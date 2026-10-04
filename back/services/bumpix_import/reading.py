"""Tenant and master scoped reads; no paths/foreign URLs exposed to callers."""
from sqlalchemy import select, func, or_, and_
from models import Client, Lesson, Reservation
from models.bumpix import BumpixClient, BumpixEvent, BumpixMedia, BumpixJournalLink

FILTERS = {'all_source': ('t1', 1), 'new': ('t2', 2), 'completed': ('t3', 4),
           'canceled': ('t4', 8), 'online': ('t5', 16), 'history': ('history', 32)}


async def bindings_for(db, ctx, client_id):
    if ctx.role not in ('owner', 'admin', 'trainer'):
        raise ValueError('Client not found')
    client = await db.scalar(select(Client).where(Client.id == client_id, Client.studio_id == ctx.studio_id))
    if not client:
        raise ValueError('Client not found')
    bindings = (await db.scalars(select(BumpixClient).where(
        BumpixClient.client_id == client_id, BumpixClient.studio_id == ctx.studio_id))).all()
    if ctx.role == 'trainer':
        own = await db.scalar(select(BumpixEvent.id).where(*conditions(ctx, client_id)).limit(1))
        if not own:
            # The original CRM client scope includes native booking history too.
            native = await db.scalar(select(Reservation.id).join(Lesson, Reservation.lesson_id == Lesson.id).where(
                Reservation.client_id == client_id, Lesson.studio_id == ctx.studio_id, Lesson.teacher_id == ctx.user.id).limit(1))
            if not native:
                raise ValueError('Client not found')
    return bindings


def teacher_scope(ctx):
    linked = select(BumpixJournalLink.id).where(BumpixJournalLink.event_id == BumpixEvent.id).correlate(BumpixEvent).exists()
    current = select(BumpixJournalLink.id).join(Lesson, Lesson.id == BumpixJournalLink.lesson_id).where(
        BumpixJournalLink.event_id == BumpixEvent.id, Lesson.studio_id == ctx.studio_id,
        Lesson.teacher_id == ctx.user.id).correlate(BumpixEvent).exists()
    return or_(and_(~linked, BumpixEvent.teacher_user_id == ctx.user.id), current)


def conditions(ctx, client_id=None, category='all'):
    cond = [BumpixEvent.studio_id == ctx.studio_id, BumpixEvent.is_current.is_(True)]
    if client_id is not None:
        cond.append(BumpixEvent.client_id == client_id)
    if ctx.role == 'trainer':
        cond.append(teacher_scope(ctx))
    if category != 'all':
        if category not in FILTERS:
            raise ValueError('Unknown event category')
        cond.append(BumpixEvent.group_mask.op('&')(FILTERS[category][1]) != 0)
    return cond


def photo_response(photo, client_id):
    return {'id': photo.id, 'kind': photo.kind, 'source_owner_id': photo.source_owner_id,
            'image_id': photo.image_id, 'revision': photo.revision, 'sha256': photo.sha256, 'bytes': photo.bytes,
            'url': f'/clients/{client_id}/bumpix/media/{photo.id}'}


async def event_page(db, ctx, client_id, category, offset, limit):
    bindings = await bindings_for(db, ctx, client_id)
    by_id = {b.id: b for b in bindings}
    cond = conditions(ctx, client_id, category)
    total = await db.scalar(select(func.count()).select_from(BumpixEvent).where(*cond))
    events = (await db.scalars(select(BumpixEvent).where(*cond).order_by(
        BumpixEvent.start_time.desc(), BumpixEvent.id.desc()).offset(offset).limit(limit))).all()
    photos = (await db.scalars(select(BumpixMedia).where(
        BumpixMedia.studio_id == ctx.studio_id, BumpixMedia.event_id.in_([e.id for e in events]),
        BumpixMedia.is_current.is_(True)))).all() if events else []
    items = []
    for event in events:
        if event.binding_id not in by_id:
            raise ValueError('Inconsistent event binding')
        items.append(serialize_event(event, by_id[event.binding_id], photos))
    return {'total': total, 'offset': offset, 'limit': limit, 'items': items}


def serialize_event(event, binding, photos):
    return {'id': event.id, 'source_event_id': event.source_event_id,
        'source_client_id': binding.source_client_id, 'master_source_id': event.master_source_id,
        'teacher_user_id': event.teacher_user_id, 'start_time': event.start_time, 'end_time': event.end_time,
        'status': event.status, 'source_groups': event.groups,
        'details': {k: v for k, v in event.payload['view'].items() if k != 'media'},
        'raw_event': event.payload['raw'],
        'photos': [photo_response(p, event.client_id) for p in photos if p.event_id == event.id]}
