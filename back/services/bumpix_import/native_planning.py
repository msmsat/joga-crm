"""Validate native appointments and future conflicts before the first insert."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from zoneinfo import ZoneInfo
from sqlalchemy import select
from models import Studio, StudioMember, Lesson, Service, StaffBusyInterval, Reservation
from models.bumpix import BumpixClient, BumpixEvent, BumpixJournalLink, BumpixServiceLink
from .validation import event_times
from .journal import instant
from .native_catalog import key_for
from .matching import native_field
from .native_guards import check_booking_change, check_retirement


def appointment_values(source, teacher, timezone_name):
    view = source['view']
    start, end = event_times(view)
    duration = int((end - start).total_seconds() // 60)
    if not 1 <= duration <= 1440:
        raise ValueError('Invalid native appointment duration')
    try:
        amount = Decimal(str(view.get('income') or '0'))
    except InvalidOperation:
        raise ValueError('Invalid appointment price') from None
    if not amount.is_finite() or amount < 0 or amount != amount.to_integral_value() or amount > 2147483647:
        raise ValueError('Source price cannot be represented exactly; resolve explicitly')
    title = str(view.get('services') or 'Заняття')
    if len(title) > 150:
        raise ValueError('Source appointment title exceeds the native name field')
    return {'name': title, 'teacher_id': teacher, 'start_time': start.isoformat(), 'tz_iana': timezone_name,
            'duration_min': duration, 'price': int(amount), 'status': 'cancelled' if view['status'] == 'canceled' else 'confirmed',
            'notes': str(view.get('comment') or '')}


async def plan_native(db, export, studio_id, masters, options, services, *, locking=False, client_id=None):
    packages = [p for p in export.packages if client_id is None or p.client_id == client_id]
    rows = (await db.execute(select(BumpixEvent, BumpixJournalLink, Lesson, BumpixClient.source_client_id)
        .join(BumpixJournalLink, BumpixJournalLink.event_id == BumpixEvent.id)
        .join(BumpixClient, BumpixClient.id == BumpixEvent.binding_id)
        .outerjoin(Lesson, Lesson.id == BumpixJournalLink.lesson_id)
        .where(BumpixEvent.studio_id == studio_id, BumpixEvent.account_key == export.account_key))).all()
    selected_packages = {p.client_id for p in packages}
    if not any(p.snapshot['events'] for p in packages) and not any(cid in selected_packages and lesson for _, _, lesson, cid in rows):
        return {}, {}
    studio = await db.get(Studio, studio_id)
    if not studio or not studio.tz_iana or options.get('timezone') != studio.tz_iana or not studio.currency or options.get('currency') != studio.currency:
        raise ValueError('Native import requires --timezone and --currency matching target studio settings')
    zone = ZoneInfo(studio.tz_iana)
    members = {m.user_id: m for m in (await db.scalars(select(StudioMember).where(
        StudioMember.studio_id == studio_id, StudioMember.status == 'active'))).all()}
    linked = {event.source_event_id: (link, lesson) for event, link, lesson, _ in rows}
    previous_keys = {event.source_event_id: key_for(event.payload) for event, _, _, _ in rows}
    rids = [link.reservation_id for _, link, _, _ in rows if link.reservation_id]
    rq = select(Reservation).where(Reservation.id.in_(rids)).order_by(Reservation.id)
    reservations = {r.id: r for r in (await db.scalars(
        rq.with_for_update().execution_options(populate_existing=True) if locking else rq)).all()}
    query = select(Lesson).where(Lesson.studio_id == studio_id, Lesson.status != 'cancelled').order_by(Lesson.id)
    existing = (await db.scalars(query.with_for_update() if locking else query)).all()
    busy = (await db.scalars(select(StaffBusyInterval).where(StaffBusyInterval.studio_id == studio_id))).all()
    incoming = {e['view']['id'] for p in packages for e in p.snapshot['events']}
    replaced_ids = {l.id for _, _, l, cid in rows if cid in selected_packages and l}
    selected = {p.client_id for p in export.packages}
    # Master remapping must cover all its clients to avoid contradictory identities.
    prior = (await db.execute(select(BumpixEvent.master_source_id, BumpixEvent.teacher_user_id, BumpixClient.source_client_id)
        .join(BumpixClient, BumpixClient.id == BumpixEvent.binding_id)
        .where(BumpixEvent.studio_id == studio_id, BumpixEvent.account_key == export.account_key))).all()
    if any(mid in masters and teacher != masters[mid] and cid not in selected for mid, teacher, cid in prior):
        raise ValueError('Changing a source master requires selecting all of that master\'s imported clients')
    catalogue = {s.id: s for s in (await db.scalars(select(Service).where(Service.studio_id == studio_id))).all()}
    service_links = {l.source_key: l.service_id for l in (await db.scalars(select(BumpixServiceLink).where(
        BumpixServiceLink.studio_id == studio_id, BumpixServiceLink.account_key == export.account_key))).all()}
    errors, counts, batch = {}, {}, []
    now = datetime.now(timezone.utc)
    for package in packages:
        problems, actions = [], []
        for event, link, lesson, cid in rows:
            if cid == package.client_id and event.source_event_id not in incoming and lesson:
                try:
                    check_retirement(lesson, reservations.get(link.reservation_id), (link.managed_values or {}).get('lesson', {}))
                except ValueError as exc:
                    problems.append(f'Appointment {event.source_event_id}: {exc}')
        for source in package.snapshot['events']:
            view, eid = source['view'], source['view']['id']
            try:
                teacher = masters.get(view['master_id'])
                member = members.get(teacher)
                if not member or member.role not in ('owner', 'trainer'):
                    raise ValueError('Map every source master to an active owner/master or trainer')
                proposed = appointment_values(source, teacher, studio.tz_iana)
                key = key_for(source)
                target = services.get(key, service_links.get(key))
                if key in service_links and not service_links[key]:
                    raise ValueError('Imported catalogue service was deleted')
                if target is not None and (type(target) is not int or target not in catalogue):
                    raise ValueError('Mapped catalogue service is outside the target studio')
                if key in service_links and key in services and services[key] != service_links[key]:
                    raise ValueError('Source service binding cannot be changed silently')
                if target is not None:
                    proposed['service_id'] = target
                if eid in linked:
                    link, lesson = linked[eid]
                    if lesson and link.managed_values:
                        baseline = link.managed_values.get('lesson', {})
                        if key != previous_keys[eid] and 'service_id' in baseline and lesson.service_id != baseline['service_id'] and target != lesson.service_id:
                            raise ValueError('Source and CRM changed the appointment service')
                        for field, new in proposed.items():
                            if field in baseline:
                                old = baseline[field]
                                current = native_field(getattr(lesson, field))
                                if current not in (old, new) and new != old:
                                    raise ValueError('Source and CRM changed appointment field: ' + field)
                    if not lesson:
                        actions.append('skip_deleted')
                        continue
                    if key != previous_keys[eid]:
                        check_booking_change(lesson, reservations.get(link.reservation_id),
                            {'service_id': target if target is not None else 'new source service'})
                    baseline = (link.managed_values or {}).get('lesson', {})
                    for field, new in list(proposed.items()):
                        current = native_field(getattr(lesson, field))
                        if field not in baseline or current != baseline[field]:
                            proposed[field] = current
                    check_booking_change(lesson, reservations.get(link.reservation_id), proposed)
                begin = datetime.fromisoformat(proposed['start_time'])
                end = begin + timedelta(minutes=proposed['duration_min'])
                teacher = proposed['teacher_id']
                effective_zone = ZoneInfo(proposed['tz_iana'] or studio.tz_iana)
                if proposed['status'] != 'cancelled' and instant(end, effective_zone) > now:
                    if not proposed['tz_iana']:
                        raise ValueError('Future native appointment has an unconfirmed timezone')
                    if begin.replace(tzinfo=effective_zone).utcoffset() != end.replace(tzinfo=effective_zone).utcoffset():
                        raise ValueError('Future interval crosses a timezone transition; resolve duration explicitly')
                    retained = linked[eid][1] if eid in linked else None
                    before = retained.buffer_before_min or 0 if retained else 0
                    after = retained.buffer_after_min or 0 if retained else 0
                    start_utc = instant(begin, effective_zone) - timedelta(minutes=before)
                    end_utc = instant(end, effective_zone) + timedelta(minutes=after)
                    for lesson in existing:
                        if lesson.teacher_id != teacher or lesson.id in replaced_ids:
                            continue
                        if not lesson.tz_iana:
                            from services import booking_time
                            if booking_time.possibly_overlaps(lesson.start_time - timedelta(minutes=lesson.buffer_before_min or 0),
                                lesson.start_time + timedelta(minutes=lesson.duration_min + (lesson.buffer_after_min or 0)),
                                start_utc.replace(tzinfo=None), end_utc.replace(tzinfo=None)):
                                raise ValueError(f'Native lesson {lesson.id} has unknown timezone and may overlap')
                            continue
                        lesson_zone = ZoneInfo(lesson.tz_iana)
                        left = instant(lesson.start_time, lesson_zone) - timedelta(minutes=lesson.buffer_before_min or 0)
                        right = instant(lesson.start_time + timedelta(minutes=lesson.duration_min), lesson_zone) + timedelta(minutes=lesson.buffer_after_min or 0)
                        if start_utc < right and end_utc > left:
                            raise ValueError(f'Future appointment overlaps native lesson {lesson.id}')
                    from services import booking_time
                    for block in busy:
                        if block.user_id != teacher:
                            continue
                        interval = booking_time.resolve_interval(block.start_time, block.end_time, block.tz_iana)
                        if interval is None:
                            if booking_time.possibly_overlaps(block.start_time, block.end_time, start_utc.replace(tzinfo=None), end_utc.replace(tzinfo=None)):
                                raise ValueError(f'Staff block {block.id} has unknown timezone')
                        elif start_utc < interval[1].replace(tzinfo=timezone.utc) and end_utc > interval[0].replace(tzinfo=timezone.utc):
                            raise ValueError(f'Future appointment overlaps staff block {block.id}')
                    if any(mid == teacher and start_utc < stop and end_utc > first for mid, first, stop in batch):
                        raise ValueError('Future source appointments overlap for the same master')
                    batch.append((teacher, start_utc, end_utc))
                actions.append('update' if eid in linked else 'create')
            except ValueError as exc:
                problems.append(f'Appointment {eid}: {exc}')
        errors[package.client_id] = problems
        counts[package.client_id] = {action: actions.count(action) for action in set(actions)}
    return errors, counts
