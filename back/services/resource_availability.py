"""Bounded, batched availability loader shared by CRM, Mini-app and confirm."""
from datetime import date, datetime, time, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import or_, select, text

from models import (BranchWorkingHours, Hall, Lesson, Service, StaffBranchAssignment,
                    StaffBusyInterval, StaffDayOverride, StaffWorkingHours, Studio,
                    StudioBranch, StudioMember, StudioWorkingHours)
from models.base import user_services
from schemas.schedule import hybrid
from services.booking_rules import load_rules
from services.resource_slots import Availability, AvailabilityData, generate


def reject(code, status=409):
    raise HTTPException(status_code=status, detail={"code": code})


async def load(db, *, studio_id: int, service_id: int, branch_id: int,
               date_from: date, date_to: date, teacher_id: int | None = None,
               hall_id: int | None = None, exclude_lesson_id: int | None = None) -> AvailabilityData:
    if not 1 <= (date_to - date_from).days + 1 <= 31:
        reject("INVALID_DATE_RANGE", 422)
    studio = (await db.execute(select(Studio).where(Studio.id == studio_id)
        .execution_options(populate_existing=True))).scalar_one_or_none()
    if studio is None:
        reject("NOT_FOUND", 404)
    if "resource" not in hybrid.AVAILABLE_BOOKING_MODES or studio.booking_mode not in {"resource", "hybrid"}:
        reject("BOOKING_MODE_DISABLED")
    if not studio.strict_schedule_enabled:
        reject("STRICT_SCHEDULE_REQUIRED")
    service = (await db.execute(select(Service).where(Service.id == service_id,
        Service.studio_id == studio_id).execution_options(populate_existing=True))).scalar_one_or_none()
    if service is None:
        reject("NOT_FOUND", 404)
    if service.booking_mode != "resource" or not service.is_bookable or service.service_type == "group":
        reject("SERVICE_UNAVAILABLE")
    branch = (await db.execute(select(StudioBranch.id).where(
        StudioBranch.id == branch_id, StudioBranch.studio_id == studio_id))).scalar_one_or_none()
    if branch is None:
        reject("NOT_FOUND", 404)
    if hall_id is not None:
        hall = (await db.execute(select(Hall.id).where(Hall.id == hall_id,
            Hall.studio_id == studio_id, Hall.branch_id == branch_id, Hall.is_active.is_(True)))).scalar_one_or_none()
        if hall is None:
            reject("NOT_FOUND", 404)
    staff_query = select(StudioMember.user_id).join(user_services,
        user_services.c.user_id == StudioMember.user_id).join(StaffBranchAssignment,
        StaffBranchAssignment.user_id == StudioMember.user_id).where(
        StudioMember.studio_id == studio_id, StudioMember.status == "active", StudioMember.role == "trainer",
        user_services.c.service_id == service_id, StaffBranchAssignment.studio_id == studio_id,
        StaffBranchAssignment.branch_id == branch_id)
    if teacher_id is not None:
        staff_query = staff_query.where(StudioMember.user_id == teacher_id)
    teachers = list((await db.execute(staff_query.distinct())).scalars().all())
    data = AvailabilityData(studio, service, await load_rules(db, studio_id), teachers, hall_id=hall_id)
    # The number of SELECTs is independent of both slot count and staff count.
    queries = {
        "studio_hours": select(StudioWorkingHours).where(StudioWorkingHours.studio_id == studio_id),
        "branch_hours": select(BranchWorkingHours).where(BranchWorkingHours.branch_id == branch_id),
        "staff_hours": select(StaffWorkingHours).where(StaffWorkingHours.studio_id == studio_id,
                                                    StaffWorkingHours.user_id.in_(teachers)),
        "overrides": select(StaffDayOverride).where(StaffDayOverride.studio_id == studio_id,
            StaffDayOverride.user_id.in_(teachers), StaffDayOverride.day >= date_from - timedelta(days=2),
            StaffDayOverride.day <= date_to + timedelta(days=1)),
    }
    # Covers snapshots in other zones and buffers on either side of the requested days.
    lower = datetime.combine(date_from - timedelta(days=3), time.min)
    upper = datetime.combine(date_to + timedelta(days=4), time.min)
    targets = Lesson.teacher_id.in_(teachers)
    if hall_id is not None:
        targets = or_(targets, Lesson.hall_id == hall_id)
    lessons = select(Lesson).where(Lesson.studio_id == studio_id, Lesson.status != "cancelled", targets,
        Lesson.start_time - Lesson.buffer_before_min * text("INTERVAL '1 minute'") < upper,
        Lesson.start_time + (Lesson.duration_min + Lesson.buffer_after_min) * text("INTERVAL '1 minute'") > lower)
    if exclude_lesson_id is not None:
        lessons = lessons.where(Lesson.id != exclude_lesson_id)
    queries["lessons"] = lessons
    queries["busy"] = select(StaffBusyInterval).where(StaffBusyInterval.studio_id == studio_id,
        StaffBusyInterval.user_id.in_(teachers), StaffBusyInterval.start_time < upper,
        StaffBusyInterval.end_time > lower)
    for name, query in queries.items():
        setattr(data, name, list((await db.execute(query.execution_options(populate_existing=True))).scalars().all()))
    return data


async def availability(db, *, now: datetime | None = None, client: bool = True, **scope) -> Availability:
    data = await load(db, **scope)
    return generate(data, date_from=scope["date_from"], date_to=scope["date_to"],
                    now=now or datetime.now(timezone.utc), client=client)
