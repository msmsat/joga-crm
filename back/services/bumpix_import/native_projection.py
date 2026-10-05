"""Populate existing CRM entities; source IDs stay private migration metadata."""
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from sqlalchemy import select
from models import ClientNote, Lesson, Reservation, Studio, StudioMember
from models.bumpix import BumpixJournalLink, BumpixMedia
from services.members import full_name
from .native_catalog import service_for
from .native_planning import appointment_values
from .matching import native_field, native_kwargs
from .native_guards import check_booking_change, check_retirement, has_financial_state


def photo_url(client_id, photo_id):
    return f'/clients/{client_id}/media/{photo_id}'


async def synchronize_native(db, binding, client, events, photos, options, decisions):
    studio = await db.get(Studio, binding.studio_id)
    baseline = dict(binding.managed_values or {})
    avatar = next((p for p in photos if p.kind == 'avatar' and p.is_current), None)
    desired_avatar = photo_url(client.id, avatar.id) if avatar else None
    if ('avatar_url' not in baseline and client.avatar_url is None) or client.avatar_url == baseline.get('avatar_url') and 'avatar_url' in baseline:
        client.avatar_url = desired_avatar
    baseline['avatar_url'] = desired_avatar
    binding.managed_values = baseline
    if not events:
        return
    members = {m.user_id: m for m in (await db.scalars(select(StudioMember).where(
        StudioMember.studio_id == binding.studio_id, StudioMember.status == 'active'))).all()}
    for event in events:
        link = await db.scalar(select(BumpixJournalLink).where(BumpixJournalLink.event_id == event.id).with_for_update())
        if not event.is_current:
            if link and link.lesson_id:
                retired = await db.get(Lesson, link.lesson_id, with_for_update=True, populate_existing=True)
                reservation = await db.get(Reservation, link.reservation_id, with_for_update=True, populate_existing=True) if link.reservation_id else None
                if retired:
                    managed = (link.managed_values or {}).get('lesson', {})
                    check_retirement(retired, reservation, managed)
                    retired.status = 'cancelled'
                    retired.source_status = 'removed'
                if reservation and reservation.booking_channel in ('import', 'bumpix') and not has_financial_state(reservation):
                    reservation.status = 'cancelled'
                    reservation.closed_at = reservation.closed_at or datetime.now(timezone.utc).replace(tzinfo=None)
                retired_values = dict(link.managed_values or {})
                retired_lesson = dict(retired_values.get('lesson', {}))
                retired_lesson['status'] = 'cancelled'
                retired_values['lesson'] = retired_lesson
                if reservation:
                    retired_values['reservation_status'] = reservation.status
                    retired_values['reservation_closed_at'] = native_field(reservation.closed_at)
                link.managed_values = retired_values
            continue
        if link and link.lesson_id is None:
            continue  # A human deleted this lesson: never create it again.
        teacher = members.get(event.teacher_user_id)
        if not teacher or teacher.role not in ('owner', 'trainer'):
            raise ValueError('Every source master needs an active native specialist mapping')
        proposed = appointment_values(event.payload, teacher.user_id, options['timezone'])
        photo_refs = [photo_url(client.id, p.id) for p in photos if p.is_current and p.event_id == event.id]
        proposed['photos'] = photo_refs
        lesson = await db.get(Lesson, link.lesson_id, with_for_update=True, populate_existing=True) if link else None
        if link and not lesson:
            raise ValueError('Imported native lesson binding is inconsistent')
        service = await service_for(db, binding.studio_id, binding.account_key, event.payload,
            teacher.user_id, proposed['price'], proposed['duration_min'], decisions)
        proposed['service_id'] = service.id
        if lesson:
            old = (link.managed_values or {}).get('lesson', {})
            reservation = await db.get(Reservation, link.reservation_id, with_for_update=True, populate_existing=True) if link.reservation_id else None
            effective = {field: new if field in old and native_field(getattr(lesson, field)) == old[field]
                         else native_field(getattr(lesson, field)) for field, new in proposed.items()}
            check_booking_change(lesson, reservation, effective)
            for field, new in proposed.items():
                current = native_field(getattr(lesson, field))
                if field in old and current not in (old[field], new) and new != old[field]:
                    raise ValueError('Source and CRM changed appointment field: ' + field)
                if field in old and current == old[field]:
                    setattr(lesson, field, native_kwargs({field: new})[field] if field == 'birth_date' else
                            datetime.fromisoformat(new) if field == 'start_time' else new)
                elif not old and field in ('notes', 'photos') and not current:
                    setattr(lesson, field, new)  # Upgrade old future projections.
        else:
            lesson = Lesson(studio_id=binding.studio_id, teacher_name=full_name(teacher),
                total_spots=1, level='', equipment='',
                booking_mode='event', buffer_before_min=0, buffer_after_min=0,
                **dict(proposed, start_time=datetime.fromisoformat(proposed['start_time'])))
            db.add(lesson)
            await db.flush()
            zone = ZoneInfo(options['timezone'])
            ended = event.end_time.replace(tzinfo=zone).astimezone(timezone.utc) <= datetime.now(timezone.utc)
            reservation = Reservation(client_id=client.id, lesson_id=lesson.id, spot_number=1,
                status='cancelled' if event.status == 'canceled' else 'active', booking_channel='import',
                # Past imports never trigger automatic cash, attendance or messages.
                closed_at=event.end_time.replace(tzinfo=zone).astimezone(timezone.utc).replace(tzinfo=None)
                    if ended or event.status != 'new' else None)
            db.add(reservation)
            await db.flush()
            link = BumpixJournalLink(event_id=event.id, lesson_id=lesson.id, reservation_id=reservation.id)
            db.add(link)
        if lesson.teacher_id == teacher.user_id:
            lesson.teacher_name = full_name(teacher)
        old_values = link.managed_values or {}
        reservation = await db.get(Reservation, link.reservation_id, with_for_update=True)
        if not reservation or reservation.lesson_id != lesson.id or reservation.client_id != client.id:
            raise ValueError('Imported reservation binding is inconsistent')
        imported_reservation = reservation.booking_channel in ('import', 'bumpix') and not has_financial_state(reservation)
        desired_status = 'cancelled' if proposed['status'] == 'cancelled' else 'active'
        ended_at = event.end_time.replace(tzinfo=ZoneInfo(options['timezone'])).astimezone(timezone.utc)
        # Keep the explicitly confirmed historical attendance on later ordinary
        # imports. Manual no-show/cancellation remains authoritative.
        if (old_values.get('historical_cash') and event.status == 'completed'
                and ended_at <= datetime.now(timezone.utc) and not reservation.no_show
                and desired_status != 'cancelled'):
            desired_status = 'attended'
        desired_closed = ended_at.replace(tzinfo=None) if ended_at <= datetime.now(timezone.utc) or event.status != 'new' else None
        if imported_reservation:
            old_status = old_values.get('reservation_status', 'active')
            if reservation.status == old_status:
                reservation.status = desired_status
            old_closed = old_values.get('reservation_closed_at')
            if native_field(reservation.closed_at) == old_closed or not old_values and reservation.closed_at is None:
                reservation.closed_at = desired_closed
        lesson.source_status = event.status
        lesson.source_details = {'income': event.income, 'outlay': event.outlay,
            'discount': event.payload.get('raw', {}).get('d'),
            'service_units': event.payload.get('raw', {}).get('6'),
            'reminders': event.payload.get('raw', {}).get('8'), 'payment_known': False,
            'attendance_known': False}
        stamp = event.start_time.strftime('%Y-%m-%d %H:%M')
        note_text = stamp + ' — ' + str(event.payload['view'].get('services') or lesson.name)
        comment = str(event.payload['view'].get('comment') or '')
        if comment:
            note_text += '\n\n' + comment
        old_values = link.managed_values or {}
        note = await db.get(ClientNote, link.note_id, with_for_update=True) if link.note_id else None
        if note:
            if note.client_id != client.id or note.studio_id != binding.studio_id or note.lesson_id != lesson.id:
                raise ValueError('Imported event note is assigned to a different client/lesson')
            old_note = old_values.get('note', {})
            for field, new in {'text': note_text, 'photos': photo_refs}.items():
                if field in old_note and getattr(note, field) not in (old_note[field], new) and new != old_note[field]:
                    raise ValueError('Source and CRM changed appointment note field: ' + field)
                if field in old_note and getattr(note, field) == old_note[field]:
                    setattr(note, field, new)
        elif not old_values.get('note_created'):
            note = ClientNote(studio_id=binding.studio_id, client_id=client.id, author_id=teacher.user_id,
                lesson_id=lesson.id, text=note_text, photos=photo_refs,
                created_at=event.start_time.replace(tzinfo=ZoneInfo(options['timezone'])).astimezone(timezone.utc).replace(tzinfo=None))
            db.add(note)
            await db.flush()
            link.note_id = note.id
        link.managed_values = {**old_values, 'lesson': proposed, 'note': {'text': note_text, 'photos': photo_refs}, 'note_created': True,
            'reservation_status': desired_status, 'reservation_closed_at': native_field(desired_closed)}
    await db.flush()
