"""Maintain a rolling journal horizon; changing one lesson never changes its plan."""
import asyncio
import logging
from datetime import datetime, time, timedelta, timezone
from fastapi import HTTPException
from sqlalchemy import select
from models import (Hall, Lesson, RecurringLessonOccurrence, RecurringLessonTemplate,
                    Service, StudioMember)
from services import schedule_guard, studio_time, working_hours
from services.booking_rules import load_rules

logger = logging.getLogger(__name__)


async def generate_for_studio(db, studio_id: int, *, now: datetime) -> dict:
    if now.tzinfo is None:
        raise ValueError('Generation requires an aware UTC instant')
    studio = await schedule_guard.lock_studio(db, studio_id)
    if not studio_time.clock(studio).verified:
        raise ValueError('Confirm the studio timezone before generating its timetable')
    local_now = studio_time.to_local(now, studio).replace(tzinfo=None)
    rules = await load_rules(db, studio_id)
    horizon = local_now + timedelta(days=rules.booking_window_days)
    result = {'studio_id': studio_id, 'created': 0, 'existing': 0, 'conflicts': []}
    templates = (await db.scalars(select(RecurringLessonTemplate).where(
        RecurringLessonTemplate.studio_id == studio_id,
        RecurringLessonTemplate.is_enabled.is_(True)).order_by(RecurringLessonTemplate.id)
        .execution_options(populate_existing=True))).all()
    for template in templates:
        service = await db.get(Service, template.service_id, populate_existing=True)
        hall = await db.get(Hall, template.hall_id, populate_existing=True)
        member = await db.scalar(select(StudioMember).where(
            StudioMember.studio_id == studio_id, StudioMember.user_id == template.teacher_id))
        valid = (service and service.studio_id == studio_id and service.is_bookable
            and service.booking_mode == 'event' and hall and hall.studio_id == studio_id
            and hall.is_active and member and member.status == 'active'
            and member.role in ('owner', 'trainer') and template.total_spots <= hall.capacity)
        if not valid:
            result['conflicts'].append({'template_id': template.id, 'error': 'Inactive or foreign timetable resources'})
            continue
        day = max(local_now.date(), template.starts_on)
        last = min(horizon.date(), template.ends_on or horizon.date())
        while day <= last:
            if day.weekday() == template.weekday:
                start = datetime.combine(day, time.min) + timedelta(minutes=template.start_minute)
                end = start + timedelta(minutes=template.duration_min)
                # Standard journal lead time; no invented past lessons during setup/restart.
                if start >= local_now + timedelta(hours=3) and start <= horizon:
                    existing = await db.scalar(select(RecurringLessonOccurrence.id).where(
                        RecurringLessonOccurrence.template_id == template.id,
                        RecurringLessonOccurrence.local_date == day))
                    if existing is not None:
                        result['existing'] += 1
                    else:
                        try:
                            await working_hours.assert_within_working_hours(db, studio_id,
                                start_time=start, duration_min=template.duration_min,
                                teacher_id=template.teacher_id, hall_id=template.hall_id)
                            await schedule_guard.assert_interval_free(db, studio,
                                teacher_id=template.teacher_id, hall_id=template.hall_id,
                                start=start, end=end)
                        except (HTTPException, ValueError) as exc:
                            result['conflicts'].append({'template_id': template.id,
                                'date': day.isoformat(), 'error': str(getattr(exc, 'detail', exc))})
                        else:
                            lesson = Lesson(studio_id=studio_id, name=service.name,
                                teacher_id=template.teacher_id,
                                teacher_name=' '.join(filter(None, [member.name, member.last_name])),
                                hall_id=hall.id, branch_id=hall.branch_id,
                                service_id=service.id, start_time=start, tz_iana=studio.tz_iana,
                                duration_min=template.duration_min, total_spots=template.total_spots,
                                price=template.price, level='', equipment='', booking_mode='event',
                                status='confirmed')
                            db.add(lesson)
                            await db.flush()
                            db.add(RecurringLessonOccurrence(template_id=template.id,
                                local_date=day, lesson_id=lesson.id))
                            await db.flush()
                            result['created'] += 1
            day += timedelta(days=1)
    return result


async def run_due_schedules(session_maker, *, now=None) -> list[dict]:
    moment = now or datetime.now(timezone.utc)
    async with session_maker() as db:
        ids = (await db.scalars(select(RecurringLessonTemplate.studio_id).where(
            RecurringLessonTemplate.is_enabled.is_(True)).distinct())).all()
    reports = []
    for studio_id in ids:
        try:
            async with session_maker.begin() as db:
                report = await generate_for_studio(db, studio_id, now=moment)
            reports.append(report)
            if report['conflicts']:
                logger.warning('Weekly timetable studio=%s conflicts=%s', studio_id, report['conflicts'])
        except Exception:
            logger.exception('Weekly timetable replenishment failed for studio=%s', studio_id)
    return reports


def start_recurring_schedule_loop(session_maker):
    async def loop():
        while True:
            try:
                await run_due_schedules(session_maker)
            except Exception:
                logger.exception('Weekly timetable scan failed')
            await asyncio.sleep(3600)
    return asyncio.create_task(loop())
