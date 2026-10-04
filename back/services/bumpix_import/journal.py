"""Explicit, atomic projection of future source appointments; no cash imports."""
from collections import Counter
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from zoneinfo import ZoneInfo
from sqlalchemy import select
from models import Studio, StudioMember, Service, Lesson, Reservation, Client, StaffBusyInterval
from models.bumpix import BumpixClient, BumpixEvent, BumpixJournalLink
from .service import Importer
from .validation import sha
from services import lesson_time, booking_time
from services.members import is_specialist_clause, full_name


def service_key(event):
    """Exact ordered source service ID list; no float conversion or inferred bundle."""
    raw = event.payload.get('raw', {})
    ids = str(raw.get('e') or '').split(',')
    if not ids or not all(ids):
        ids = [unit.split(':')[0] for unit in str(raw.get('6') or '').split(',') if unit]
    return ','.join(ids)


def instant(wall, zone):
    a, b = wall.replace(tzinfo=zone, fold=0), wall.replace(tzinfo=zone, fold=1)
    if a.utcoffset() != b.utcoffset() or a.astimezone(timezone.utc).astimezone(zone).replace(tzinfo=None) != wall:
        raise ValueError('ambiguous/nonexistent source wall time; resolve explicitly')
    return a.astimezone(timezone.utc)


def target_id(value):
    if type(value) is not int or value < 1:
        raise ValueError('mapping requires a positive integer CRM ID')
    return value


class JournalProjector:
    def __init__(self, sessions):
        self.sessions = sessions

    async def run(self, studio_id, owner_email, account_key, mapping, *, apply=False, now=None):
        sha(account_key)
        if not isinstance(mapping, dict) or set(mapping) - {'timezone', 'currency', 'services', 'events'}:
            raise ValueError('Journal mapping supports timezone, currency, services and events only')
        services, decisions = mapping.get('services', {}), mapping.get('events', {})
        if not isinstance(services, dict) or not isinstance(decisions, dict):
            raise ValueError('services/events must be objects')
        for decision in decisions.values():
            if not isinstance(decision, dict) or set(decision) - {'service_id', 'lesson_id'}:
                raise ValueError('event decision supports service_id/lesson_id only')
        now = now or datetime.now(timezone.utc)
        if now.tzinfo is None:
            raise ValueError('now must be timezone-aware')
        async with self.sessions.begin() as db:
            studio = await db.scalar(select(Studio).where(Studio.id == studio_id).with_for_update())
            await Importer(self.sessions, None)._authorize(db, studio_id, owner_email)
            if not studio or not studio.tz_iana or mapping.get('timezone') != studio.tz_iana or not studio.currency or mapping.get('currency') != studio.currency:
                raise ValueError('Explicit source timezone/currency must match the configured target studio')
            zone = ZoneInfo(studio.tz_iana)
            bindings = (await db.scalars(select(BumpixClient).where(BumpixClient.studio_id == studio_id, BumpixClient.account_key == account_key))).all()
            if not bindings:
                raise ValueError('Source account is not imported into the selected studio')
            by_binding = {b.id: b for b in bindings}
            events = (await db.scalars(select(BumpixEvent).where(BumpixEvent.studio_id == studio_id, BumpixEvent.account_key == account_key, BumpixEvent.is_current.is_(True), BumpixEvent.status == 'new').order_by(BumpixEvent.start_time, BumpixEvent.id))).all()
            links = {l.event_id: l for l in (await db.scalars(select(BumpixJournalLink).join(BumpixEvent, BumpixJournalLink.event_id == BumpixEvent.id).where(BumpixEvent.studio_id == studio_id, BumpixEvent.account_key == account_key))).all()}
            members = {m.user_id: m for m in (await db.scalars(select(StudioMember).where(StudioMember.studio_id == studio_id, StudioMember.status == 'active', is_specialist_clause(studio_id)))).all()}
            catalog = {s.id: s for s in (await db.scalars(select(Service).where(Service.studio_id == studio_id))).all()}
            clients = set((await db.scalars(select(Client.id).where(Client.studio_id == studio_id))).all())
            # Lock rows too: ordinary event edits do not necessarily acquire Studio lock.
            native = (await db.scalars(select(Lesson).where(Lesson.studio_id == studio_id).order_by(Lesson.id).with_for_update())).all()
            reservations = (await db.scalars(select(Reservation).join(Lesson, Reservation.lesson_id == Lesson.id).where(Lesson.studio_id == studio_id, Reservation.status != 'cancelled').order_by(Reservation.id).with_for_update())).all()
            busy = (await db.scalars(select(StaffBusyInterval).where(StaffBusyInterval.studio_id == studio_id))).all()
            items, plans, batch = [], [], []
            for event in events:
                item = {'source_event_id': event.source_event_id, 'source_client_id': by_binding.get(event.binding_id).source_client_id if event.binding_id in by_binding else '', 'service_key': service_key(event), 'action': 'skip'}
                if event.id in links:
                    item['lesson_id'] = links[event.id].lesson_id
                    item['reason'] = 'already linked; CRM edits/deletion preserved'
                    items.append(item)
                    continue
                try:
                    start = instant(event.start_time, zone)
                    if start <= now:
                        continue  # Past source new records remain historical, not working bookings.
                    end = instant(event.end_time, zone)
                    if event.start_time.replace(tzinfo=zone).utcoffset() != event.end_time.replace(tzinfo=zone).utcoffset():
                        raise ValueError('source interval crosses timezone transition; resolve duration explicitly')
                    duration = (event.end_time - event.start_time).total_seconds() / 60
                    if end <= start or not duration.is_integer() or not 1 <= duration <= 1440:
                        raise ValueError('invalid source duration')
                    if event.binding_id not in by_binding or event.client_id != by_binding[event.binding_id].client_id or event.client_id not in clients:
                        raise ValueError('inconsistent client binding')
                    member = members.get(event.teacher_user_id)
                    if not member or member.role not in ('owner', 'trainer'):
                        raise ValueError('source master must be mapped to an active CRM specialist')
                    decision = decisions.get(event.source_event_id, {})
                    sid = target_id(decision.get('service_id', services.get(service_key(event))))
                    service = catalog.get(sid)
                    if not service:
                        raise ValueError('mapped service not found in target studio')
                    try:
                        amount = Decimal(event.income)
                    except InvalidOperation:
                        raise ValueError('invalid source amount') from None
                    if not amount.is_finite() or amount < 0 or amount != amount.to_integral_value() or amount > 2147483647:
                        raise ValueError('fractional/invalid source amount; no silent rounding or conversion')
                    item.update(price=int(amount), start_time=event.start_time.isoformat(), end_time=event.end_time.isoformat(), teacher_id=event.teacher_user_id, service_id=sid, payment_state='unknown')
                    existing_id = decision.get('lesson_id')
                    if existing_id is not None:
                        target_id(existing_id)
                        lesson = next((l for l in native if l.id == existing_id), None)
                        matches = [r for r in reservations if r.lesson_id == existing_id and r.client_id == event.client_id]
                        already = await db.scalar(select(BumpixJournalLink.id).where(BumpixJournalLink.lesson_id == existing_id))
                        if not lesson or lesson.status != 'confirmed' or lesson.service_id != sid or lesson_time.resolve(lesson, studio).instant != start.replace(tzinfo=None) or lesson.teacher_id != event.teacher_user_id or lesson.start_time != event.start_time or lesson.duration_min != int(duration) or len(matches) != 1 or already:
                            raise ValueError('explicit existing lesson does not match client/master/time or is already linked')
                        if existing_id in [t[1].id for t in plans if t[1] is not None]:
                            raise ValueError('two source events cannot link the same native lesson')
                        item.update(action='link', lesson_id=existing_id)
                        plans.append((event, lesson, matches[0], None, item))
                    else:
                        for lesson in native:
                            if lesson.status == 'cancelled' or lesson.teacher_id != event.teacher_user_id:
                                continue
                            left = lesson.start_time - timedelta(minutes=lesson.buffer_before_min or 0)
                            right = lesson.start_time + timedelta(minutes=lesson.duration_min + (lesson.buffer_after_min or 0))
                            when = lesson_time.resolve(lesson, studio)
                            if when.instant is None:
                                if booking_time.possibly_overlaps(left, right, start.replace(tzinfo=None), end.replace(tzinfo=None)):
                                    raise ValueError(f'overlap cannot be ruled out for native lesson {lesson.id}; confirm its timezone')
                                continue
                            left_utc = when.instant.replace(tzinfo=timezone.utc) - timedelta(minutes=lesson.buffer_before_min or 0)
                            right_utc = when.instant.replace(tzinfo=timezone.utc) + timedelta(minutes=lesson.duration_min + (lesson.buffer_after_min or 0))
                            if start < right_utc and end > left_utc:
                                raise ValueError(f'overlap with native lesson {lesson.id}; resolve or explicitly link it')
                        for block in busy:
                            if block.user_id != event.teacher_user_id:
                                continue
                            interval = booking_time.resolve_interval(block.start_time, block.end_time, block.tz_iana)
                            if interval is None:
                                if booking_time.possibly_overlaps(block.start_time, block.end_time, start.replace(tzinfo=None), end.replace(tzinfo=None)):
                                    raise ValueError(f'staff block {block.id} has unknown timezone')
                            elif start < interval[1].replace(tzinfo=timezone.utc) and end > interval[0].replace(tzinfo=timezone.utc):
                                raise ValueError(f'overlap with staff block {block.id}')
                        if any(mid == event.teacher_user_id and start < stop and end > begin for mid, begin, stop in batch):
                            raise ValueError('overlap between imported future appointments')
                        batch.append((event.teacher_user_id, start, end))
                        item['action'] = 'create'
                        plans.append((event, None, None, (service, member, int(duration), int(amount)), item))
                except (ValueError, KeyError) as exc:
                    item.update(action='conflict', error=str(exc))
                items.append(item)
            counts = dict(Counter(i['action'] for i in items))
            ready = not counts.get('conflict', 0)
            if apply and ready:
                for event, lesson, reservation, values, item in plans:
                    if lesson is None:
                        service, member, duration, price = values
                        title = str(event.payload['view'].get('services') or service.name)
                        lesson = Lesson(studio_id=studio_id, name=title[:100], teacher_name=full_name(member)[:100], teacher_id=event.teacher_user_id, start_time=event.start_time, tz_iana=studio.tz_iana, duration_min=duration, price=price, level='', equipment='', total_spots=1, service_id=service.id, status='confirmed', notes=str(event.payload['view'].get('comment') or ''), photos=[], booking_mode='event', buffer_before_min=0, buffer_after_min=0)
                        db.add(lesson)
                        await db.flush()
                        reservation = Reservation(client_id=event.client_id, lesson_id=lesson.id, spot_number=1, status='active', booking_channel='bumpix')
                        db.add(reservation)
                        await db.flush()
                    db.add(BumpixJournalLink(event_id=event.id, lesson_id=lesson.id, reservation_id=reservation.id))
                    item['lesson_id'] = lesson.id
                await db.flush()
            return {'format': 1, 'mode': 'apply' if apply else 'preview', 'account_key': account_key, 'ready': ready, 'complete': bool(apply and ready), 'counts': counts, 'items': items, 'payment_state': 'unknown', 'historical_events_are_read_only': True}
