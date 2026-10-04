"""One source row per appointment in Journal, tenant/current teacher scoped."""
from sqlalchemy import select, func
from models import Client, Lesson
from models.bumpix import BumpixClient, BumpixEvent, BumpixMedia, BumpixJournalLink
from .reading import conditions, serialize_event


def range_conditions(ctx, start, end):
    if ctx.role not in ('owner', 'admin', 'trainer'):
        raise ValueError('Staff access required')
    linked = select(BumpixJournalLink.id).where(BumpixJournalLink.event_id == BumpixEvent.id).correlate(BumpixEvent).exists()
    return conditions(ctx) + [~linked, BumpixEvent.start_time >= start, BumpixEvent.start_time < end]


async def items_for(db, ctx, events):
    if not events:
        return []
    bindings = {b.id: b for b in (await db.scalars(select(BumpixClient).where(BumpixClient.studio_id == ctx.studio_id, BumpixClient.id.in_([e.binding_id for e in events])))).all()}
    clients = {c.id: c for c in (await db.scalars(select(Client).where(Client.studio_id == ctx.studio_id, Client.id.in_([e.client_id for e in events])))).all()}
    photos = (await db.scalars(select(BumpixMedia).where(BumpixMedia.studio_id == ctx.studio_id, BumpixMedia.is_current.is_(True), BumpixMedia.event_id.in_([e.id for e in events])))).all()
    results = []
    for event in events:
        binding, client = bindings.get(event.binding_id), clients.get(event.client_id)
        if not binding or not client or binding.client_id != event.client_id:
            raise ValueError('Inconsistent source client binding')
        masters = binding.payload.get('lookups', {}).get('masters', [])
        master = next((str(m.get('2') or '') for m in masters if isinstance(m, dict) and m.get('0') == event.master_source_id), '')
        results.append({'event': serialize_event(event, binding, photos), 'client_id': client.id,
            'client_name': ' '.join(n for n in (client.name, client.last_name) if n), 'master_name': master})
    return results


async def range_page(db, ctx, start, end, offset, limit):
    cond = range_conditions(ctx, start, end)
    total = await db.scalar(select(func.count()).select_from(BumpixEvent).where(*cond))
    events = (await db.scalars(select(BumpixEvent).where(*cond).order_by(BumpixEvent.start_time, BumpixEvent.id).offset(offset).limit(limit))).all()
    return {'total': total, 'offset': offset, 'limit': limit, 'items': await items_for(db, ctx, events)}


async def month_days(db, ctx, start, end, excluded, exclude_unmapped=False):
    cond = range_conditions(ctx, start, end)
    if exclude_unmapped:
        cond.append(BumpixEvent.teacher_user_id.is_not(None))
    if excluded:
        cond.append((BumpixEvent.teacher_user_id.is_(None)) | (~BumpixEvent.teacher_user_id.in_(excluded)))
    times = (await db.scalars(select(BumpixEvent.start_time).where(*cond))).all()
    return sorted({t.date().isoformat() for t in times})


async def linked_detail(db, ctx, lesson_id):
    if ctx.role not in ('owner', 'admin', 'trainer'):
        raise ValueError('Staff access required')
    cond = [Lesson.id == lesson_id, Lesson.studio_id == ctx.studio_id]
    if ctx.role == 'trainer':
        cond.append(Lesson.teacher_id == ctx.user.id)
    lesson = await db.scalar(select(Lesson).where(*cond))
    if not lesson:
        return None
    event = await db.scalar(select(BumpixEvent).join(BumpixJournalLink, BumpixJournalLink.event_id == BumpixEvent.id).where(BumpixJournalLink.lesson_id == lesson.id, *conditions(ctx)))
    if not event:
        return None
    return (await items_for(db, ctx, [event]))[0]
