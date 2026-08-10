from calendar import monthrange
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from dependencies import require_role, StudioContext
from models import (
    Hall, Lesson, Reservation, StaffDayOverride, StaffWorkingHours, StudioMember, User,
)
from schemas import (
    StaffWeekScheduleResponse, StaffMonthScheduleResponse,
    StaffTodayScheduleResponse, StaffCancelLessonResponse,
    StaffDayOverrideItem, StaffDayOverrideRequest,
)
from services.subscription_charge import refund_reservation

router = APIRouter()


async def _assert_staff_in_studio(staff_id: int, studio_id: int, db: AsyncSession) -> None:
    result = await db.execute(
        select(StudioMember).where(
            StudioMember.user_id == staff_id,
            StudioMember.studio_id == studio_id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Сотрудник не найден")


# ─── GET /staff/{staff_id}/schedule/week ──────────────────────────────────────

@router.get("/{staff_id}/schedule/week", response_model=StaffWeekScheduleResponse)
async def get_week_schedule(
    staff_id: int,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    studio_id = ctx.studio_id
    await _assert_staff_in_studio(staff_id, studio_id, db)

    result = await db.execute(
        select(StaffWorkingHours)
        .where(
            StaffWorkingHours.user_id == staff_id,
            StaffWorkingHours.studio_id == studio_id,
        )
        .order_by(StaffWorkingHours.day_of_week)
    )
    working_hours = result.scalars().all()

    return {
        "staff_id": staff_id,
        "working_hours": [
            {
                "day_of_week": wh.day_of_week,
                "is_open": wh.is_open,
                "open_time": wh.open_time,
                "close_time": wh.close_time,
            }
            for wh in working_hours
        ],
    }


# Пн–Пт — тот же график по умолчанию, что предлагает мастер добавления сотрудника
# (front DEFAULT_WEEK_HOURS). Нужен для тех, кого завели без личного графика.
DEFAULT_OPEN_DOW = {0, 1, 2, 3, 4}


async def _load_overrides(
    staff_id: int, studio_id: int, year: int, month: int, db: AsyncSession
) -> list[StaffDayOverride]:
    _, last_day = monthrange(year, month)
    result = await db.execute(
        select(StaffDayOverride).where(
            StaffDayOverride.user_id == staff_id,
            StaffDayOverride.studio_id == studio_id,
            StaffDayOverride.day >= date(year, month, 1),
            StaffDayOverride.day <= date(year, month, last_day),
        )
    )
    return list(result.scalars().all())


async def _seed_working_days(
    staff_id: int,
    studio_id: int,
    year: int,
    month: int,
    existing: list[StaffDayOverride],
    db: AsyncSession,
) -> list[StaffDayOverride]:
    """Проставляет «работает» на дни месяца, где отметки ещё нет, — по недельному графику.

    Так график сотрудника виден отметками с самого начала, а не выводится на лету.
    Дни, где отметка уже есть, не трогаются НИКОГДА: изменение владельца не должно
    откатываться обратно к графику. Выходные строкой не пишем — «нет отметки» и
    значит «не работает». Прошлое не засеваем: его всё равно нельзя менять.
    """
    have = {o.day for o in existing}
    today = date.today()
    _, last_day = monthrange(year, month)
    if date(year, month, last_day) < today:
        return existing

    wh_rows = (await db.execute(
        select(StaffWorkingHours).where(
            StaffWorkingHours.user_id == staff_id,
            StaffWorkingHours.studio_id == studio_id,
        )
    )).scalars().all()
    open_dow = {wh.day_of_week for wh in wh_rows if wh.is_open} if wh_rows else DEFAULT_OPEN_DOW

    created = []
    for day_num in range(1, last_day + 1):
        day = date(year, month, day_num)
        if day < today or day in have or day.weekday() not in open_dow:
            continue
        row = StaffDayOverride(user_id=staff_id, studio_id=studio_id, day=day, is_working=True)
        db.add(row)
        created.append(row)

    if not created:
        return existing

    try:
        await db.commit()
    except IntegrityError:
        # Тот же месяц засеял параллельный запрос — берём то, что уже в базе.
        await db.rollback()
        return await _load_overrides(staff_id, studio_id, year, month, db)
    return existing + created


# ─── GET /staff/{staff_id}/schedule/month ─────────────────────────────────────

@router.get("/{staff_id}/schedule/month", response_model=StaffMonthScheduleResponse)
async def get_month_schedule(
    staff_id: int,
    year: Optional[int] = Query(default=None),
    month: Optional[int] = Query(default=None),
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    studio_id = ctx.studio_id
    await _assert_staff_in_studio(staff_id, studio_id, db)

    today = date.today()
    target_year = year or today.year
    target_month = month or today.month

    _, last_day = monthrange(target_year, target_month)
    month_start = datetime(target_year, target_month, 1)
    month_end = datetime(target_year, target_month, last_day, 23, 59, 59)

    result = await db.execute(
        select(Lesson)
        .options(selectinload(Lesson.hall), selectinload(Lesson.reservations))
        .where(
            Lesson.teacher_id == staff_id,
            Lesson.studio_id == studio_id,
            Lesson.start_time >= month_start,
            Lesson.start_time <= month_end,
        )
        .order_by(Lesson.start_time)
    )
    lessons = result.scalars().all()

    overrides = await _load_overrides(staff_id, studio_id, target_year, target_month, db)
    overrides = await _seed_working_days(staff_id, studio_id, target_year, target_month, overrides, db)

    return {
        "staff_id": staff_id,
        "year": target_year,
        "month": target_month,
        "day_overrides": [
            {"date": o.day.isoformat(), "is_working": o.is_working} for o in overrides
        ],
        "lessons": [
            {
                "id": l.id,
                "name": l.name,
                "start_time": l.start_time.isoformat(),
                "duration_min": l.duration_min,
                "status": l.status,
                "total_spots": l.total_spots,
                "booked_count": sum(1 for r in l.reservations if r.status != "cancelled"),
                "hall": {"id": l.hall.id, "name": l.hall.name, "color": l.hall.color}
                if l.hall else None,
            }
            for l in lessons
        ],
    }


async def _has_bookings(staff_id: int, studio_id: int, day: date, db: AsyncSession) -> bool:
    """Есть ли в этот день у тренера занятие хотя бы с одной активной записью."""
    day_start = datetime.combine(day, datetime.min.time())
    result = await db.execute(
        select(Reservation.id)
        .join(Lesson, Lesson.id == Reservation.lesson_id)
        .where(
            Lesson.teacher_id == staff_id,
            Lesson.studio_id == studio_id,
            Lesson.start_time >= day_start,
            Lesson.start_time < day_start + timedelta(days=1),
            Lesson.status != "cancelled",
            Reservation.status != "cancelled",
        )
        .limit(1)
    )
    return result.first() is not None


# ─── PUT /staff/{staff_id}/schedule/day ───────────────────────────────────────

@router.put("/{staff_id}/schedule/day", response_model=StaffDayOverrideItem)
async def set_day_override(
    staff_id: int,
    payload: StaffDayOverrideRequest,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Отметить дату как рабочую/выходную. `is_working=null` — снять отметку."""
    studio_id = ctx.studio_id
    await _assert_staff_in_studio(staff_id, studio_id, db)

    try:
        day = date.fromisoformat(payload.date)
    except ValueError:
        raise HTTPException(status_code=422, detail="Некорректная дата")

    # Прошлое не редактируется: график задним числом расходится с тем, что
    # реально было проведено и оплачено.
    if day < date.today():
        raise HTTPException(status_code=409, detail="Прошедшие дни менять нельзя")

    # День с живыми записями выходным быть не может: клиенты уже пришли бы на
    # занятие, которого по графику нет. Сначала отмени записи — потом выходной.
    if payload.is_working is False and await _has_bookings(staff_id, studio_id, day, db):
        raise HTTPException(
            status_code=409,
            detail="На этот день уже есть записи — выходным он быть не может",
        )

    existing = (await db.execute(
        select(StaffDayOverride).where(
            StaffDayOverride.user_id == staff_id,
            StaffDayOverride.studio_id == studio_id,
            StaffDayOverride.day == day,
        )
    )).scalar_one_or_none()

    if payload.is_working is None:
        if existing:
            await db.delete(existing)
    elif existing:
        existing.is_working = payload.is_working
    else:
        db.add(StaffDayOverride(
            user_id=staff_id,
            studio_id=studio_id,
            day=day,
            is_working=payload.is_working,
        ))

    await db.commit()

    # is_working в ответе — то, что отметил владелец; null означает «по графику».
    return {"date": day.isoformat(), "is_working": bool(payload.is_working)}


# ─── GET /staff/{staff_id}/schedule/today ─────────────────────────────────────

@router.get("/{staff_id}/schedule/today", response_model=StaffTodayScheduleResponse)
async def get_today_schedule(
    staff_id: int,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    studio_id = ctx.studio_id
    await _assert_staff_in_studio(staff_id, studio_id, db)

    today = date.today()
    today_start = datetime.combine(today, datetime.min.time())
    today_end = today_start + timedelta(days=1)

    result = await db.execute(
        select(Lesson)
        .options(selectinload(Lesson.hall), selectinload(Lesson.reservations))
        .where(
            Lesson.teacher_id == staff_id,
            Lesson.studio_id == studio_id,
            Lesson.start_time >= today_start,
            Lesson.start_time < today_end,
            Lesson.status != "cancelled",
        )
        .order_by(Lesson.start_time)
    )
    lessons = result.scalars().all()

    return {
        "staff_id": staff_id,
        "date": today.isoformat(),
        "lessons": [
            {
                "id": l.id,
                "name": l.name,
                "start_time": l.start_time.strftime("%H:%M"),
                "duration_min": l.duration_min,
                "total_spots": l.total_spots,
                "booked_count": sum(1 for r in l.reservations if r.status != "cancelled"),
                "hall": {"id": l.hall.id, "name": l.hall.name, "color": l.hall.color}
                if l.hall else None,
            }
            for l in lessons
        ],
    }


# ─── POST /staff/{staff_id}/schedule/{lesson_id}/cancel ───────────────────────

@router.post("/{staff_id}/schedule/{lesson_id}/cancel", response_model=StaffCancelLessonResponse)
async def cancel_lesson(
    staff_id: int,
    lesson_id: int,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    studio_id = ctx.studio_id
    await _assert_staff_in_studio(staff_id, studio_id, db)

    result = await db.execute(
        select(Lesson)
        .options(selectinload(Lesson.reservations))
        .where(
            Lesson.id == lesson_id,
            Lesson.studio_id == studio_id,
            Lesson.teacher_id == staff_id,
        )
    )
    lesson = result.scalar_one_or_none()
    if not lesson:
        raise HTTPException(status_code=404, detail="Занятие не найдено")

    if lesson.status == "cancelled":
        raise HTTPException(status_code=409, detail="Занятие уже отменено")

    lesson.status = "cancelled"
    for reservation in lesson.reservations:
        if reservation.status != "cancelled":
            reservation.status = "cancelled"
            reservation.cancelled_at = datetime.now()
            await refund_reservation(db, reservation)  # занятие возвращается на абонемент

    await db.commit()

    return {"ok": True, "lesson_id": lesson_id, "cancelled_reservations": len(lesson.reservations)}
