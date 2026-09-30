from calendar import monthrange
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, delete, extract
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from dependencies import require_role, StudioContext
from models import (
    Hall, Lesson, Reservation, StaffBusyInterval, StaffDayOverride, StaffWorkingHours,
    StudioMember, User,
)
from schemas import (
    StaffWeekScheduleResponse, StaffMonthScheduleResponse,
    StaffTodayScheduleResponse, StaffCancelLessonResponse,
    StaffDayOverrideItem, StaffDayOverrideRequest,
)
from schemas.staff.staff import StaffBusyIntervalCreate, StaffBusyIntervalItem, StaffScheduleEditorRequest, StaffWorkingHoursItem
from services import booking, schedule_guard, booking_time, lesson_time
from services.schedule_guard import lock_studio

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
                "breaks": wh.breaks or [],
                "off_label": wh.off_label,
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
    day_start=datetime.combine(day,datetime.min.time())
    rows=(await db.execute(select(Lesson).where(Lesson.teacher_id==staff_id,Lesson.studio_id==studio_id,
        Lesson.status!="cancelled",Lesson.start_time<day_start+timedelta(days=1),
        Lesson.start_time>=day_start-timedelta(days=2)))).scalars().all()
    return any(l.start_time+timedelta(minutes=l.duration_min+(l.buffer_after_min or 0))>day_start for l in rows)


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
    # HB-06: замок студии — до любой правки графика (§6.2 п.5).
    studio = await schedule_guard.lock_studio(db, studio_id)
    await _assert_staff_in_studio(staff_id, studio_id, db)

    try:
        day = date.fromisoformat(payload.date)
    except ValueError:
        raise HTTPException(status_code=422, detail="Некорректная дата")

    # Прошлое не редактируется: график задним числом расходится с тем, что
    # реально было проведено и оплачено.
    if day < lesson_time.local_now(studio).date():
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

    if payload.is_working is not True:
        # Закрытие дня может обрезать доступность НИЖЕ уже принятой
        # записи (§6.2 п.5); возврат к недельному графику тоже может закрыть день.
        await db.flush()
        conflicts = await schedule_guard.assert_future_assignments_valid(
            db, studio, user_id=staff_id)
        schedule_guard.raise_if_conflicts(conflicts)

    from services.staff_schedule_editor import assert_future_fits
    if payload.is_working is not True:
        await db.flush()
        await assert_future_fits(db,studio,staff_id,changed_dates={day,day+timedelta(days=1)})
    await db.commit()

    # is_working в ответе — то, что отметил владелец; null означает «по графику».
    return {"date": day.isoformat(), "is_working": bool(payload.is_working)}


# ─── /staff/{staff_id}/schedule/busy — перерывы/отсутствия (HB-05) ───────────
#
# Отдельный CRUD, а не поле карточки сотрудника: интервалов у человека может
# быть много и на разные даты, это расписание, а не профиль. Читает и меняет
# `services/resource_hours.available_intervals` (HB-08 добавит поверх учёт
# уже поставленных Lesson — здесь только собственная занятость специалиста).

@router.get("/{staff_id}/schedule/busy", response_model=list[StaffBusyIntervalItem])
async def list_busy_intervals(
    staff_id: int,
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    studio_id = ctx.studio_id
    await _assert_staff_in_studio(staff_id, studio_id, db)

    conditions = [
        StaffBusyInterval.user_id == staff_id,
        StaffBusyInterval.studio_id == studio_id,
    ]
    if date_from is not None:
        conditions.append(StaffBusyInterval.end_time > datetime.combine(date_from, datetime.min.time()))
    if date_to is not None:
        conditions.append(StaffBusyInterval.start_time < datetime.combine(date_to, datetime.min.time()) + timedelta(days=1))

    rows = (await db.execute(
        select(StaffBusyInterval).where(*conditions).order_by(StaffBusyInterval.start_time)
    )).scalars().all()
    return rows


@router.post("/{staff_id}/schedule/busy", status_code=201, response_model=StaffBusyIntervalItem)
async def create_busy_interval(
    staff_id: int,
    payload: StaffBusyIntervalCreate,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    studio_id = ctx.studio_id
    studio = await schedule_guard.lock_studio(db, studio_id)
    await _assert_staff_in_studio(staff_id, studio_id, db)

    if booking_time.resolve_interval(payload.start_time, payload.end_time, studio.tz_iana) is None:
        raise HTTPException(422, detail="Укажите однозначное местное время и часовой пояс студии")
    row = StaffBusyInterval(
        user_id=staff_id, studio_id=studio_id,
        start_time=payload.start_time, end_time=payload.end_time,
        reason=payload.reason,
        tz_iana=studio.tz_iana,
    )
    db.add(row)
    await db.flush()
    from services.staff_schedule_editor import assert_future_fits
    await assert_future_fits(db,studio,staff_id,changed_dates={payload.start_time.date()+timedelta(days=n) for n in range((payload.end_time.date()-payload.start_time.date()).days+1)})
    conflicts = await schedule_guard.assert_future_assignments_valid(db, studio, user_id=staff_id)
    schedule_guard.raise_if_conflicts(conflicts)
    await db.commit()
    await db.refresh(row)
    return row


@router.delete("/{staff_id}/schedule/busy/{interval_id}", response_model=dict)
async def delete_busy_interval(
    staff_id: int,
    interval_id: int,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    await lock_studio(db, ctx.studio_id)
    studio_id = ctx.studio_id
    await _assert_staff_in_studio(staff_id, studio_id, db)

    row = (await db.execute(
        select(StaffBusyInterval).where(
            StaffBusyInterval.id == interval_id,
            StaffBusyInterval.user_id == staff_id,
            StaffBusyInterval.studio_id == studio_id,
        )
    )).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Интервал не найден")

    await db.delete(row)
    await db.commit()
    return {"ok": True}


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
    await lock_studio(db, ctx.studio_id)
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
    # Тот же переход домена, что и при отмене занятия из Журнала: занятие
    # возвращается на абонемент, долг снимается, окна отмены не применяются —
    # людей снимает не их решение, а решение студии.
    for reservation in lesson.reservations:
        if reservation.status != "cancelled":
            await booking.cancel(
                db, studio_id=lesson.studio_id, reservation_id=reservation.id,
                actor="staff", reason="занятие отменено", enforce_policy=False)

    await db.commit()

    return {"ok": True, "lesson_id": lesson_id, "cancelled_reservations": len(lesson.reservations)}


@router.get("/{staff_id}/schedule/editor")
async def get_schedule_editor(staff_id:int,week_start:date,ctx:StudioContext=Depends(require_role("owner")),db:AsyncSession=Depends(get_db)):
    await _assert_staff_in_studio(staff_id,ctx.studio_id,db)
    if week_start.weekday()!=0:
        raise HTTPException(422,detail="Неделя должна начинаться с понедельника")
    from services.staff_hours import effective_hours
    from services.staff_schedule_editor import load_hours
    from types import SimpleNamespace
    hours,overrides,_=await load_hours(db,staff_id,ctx.studio_id)
    days=[]
    for n in range(7):
        day=week_start+timedelta(days=n)
        row=effective_hours(hours,overrides,day)
        if row is None:
            row=SimpleNamespace(is_open=n<5,open_time="09:00",close_time="18:00",breaks=[],off_label=None)
        days.append({"date":day.isoformat(),"day_of_week":n,"is_open":row.is_open,"open_time":row.open_time,
            "close_time":row.close_time,"breaks":getattr(row,"breaks",None) or [],"off_label":getattr(row,"off_label",None),
            "is_override":any(o.day==day for o in overrides)})
    return {"staff_id":staff_id,"week_start":week_start.isoformat(),"days":days}


@router.put("/{staff_id}/schedule/editor")
async def save_schedule_editor(staff_id:int,payload:StaffScheduleEditorRequest,ctx:StudioContext=Depends(require_role("owner")),db:AsyncSession=Depends(get_db)):
    studio=await lock_studio(db,ctx.studio_id)
    await _assert_staff_in_studio(staff_id,ctx.studio_id,db)
    try:
        monday=date.fromisoformat(payload.week_start)
        if monday.weekday()!=0:
            raise ValueError()
    except ValueError:
        raise HTTPException(422,detail="Некорректное начало недели")
    from services.staff_schedule_editor import assert_future_fits
    affected=set()
    for item in payload.days:
        day=monday+timedelta(days=item.day_of_week)
        affected.update((day,day+timedelta(days=1)))
        if payload.repeat_weekly:
            row=(await db.execute(select(StaffWorkingHours).where(StaffWorkingHours.user_id==staff_id,StaffWorkingHours.studio_id==ctx.studio_id,StaffWorkingHours.day_of_week==item.day_of_week))).scalar_one_or_none()
            if row is None:
                row=StaffWorkingHours(user_id=staff_id,studio_id=ctx.studio_id,day_of_week=item.day_of_week)
                db.add(row)
            for key,value in item.model_dump().items():
                setattr(row,key,value)
            # The selected date now follows the template. Keep exceptions on
            # other dates, and never rewrite historical dated schedules.
            if day >= lesson_time.local_now(studio).date():
                await db.execute(delete(StaffDayOverride).where(
                    StaffDayOverride.user_id == staff_id,
                    StaffDayOverride.studio_id == ctx.studio_id,
                    StaffDayOverride.day == day))
            # Old generated working-day marks must follow the updated template.
            # Dated exceptions carrying their own hours and explicit days off survive.
            await db.execute(delete(StaffDayOverride).where(StaffDayOverride.user_id==staff_id,StaffDayOverride.studio_id==ctx.studio_id,
                StaffDayOverride.day>=lesson_time.local_now(studio).date(),StaffDayOverride.is_working.is_(True),
                StaffDayOverride.hours.is_(None),extract("isodow",StaffDayOverride.day)==item.day_of_week+1))
        else:
            if day<lesson_time.local_now(studio).date():
                raise HTTPException(409,detail="Прошедшие дни менять нельзя")
            row=(await db.execute(select(StaffDayOverride).where(StaffDayOverride.user_id==staff_id,StaffDayOverride.studio_id==ctx.studio_id,StaffDayOverride.day==day))).scalar_one_or_none()
            if row is None:
                row=StaffDayOverride(user_id=staff_id,studio_id=ctx.studio_id,day=day)
                db.add(row)
            row.is_working=item.is_open
            row.hours=item.model_dump()
    await db.flush()
    await assert_future_fits(db,studio,staff_id,changed_dates=None if payload.repeat_weekly else affected,
        changed_weekdays={d.day_of_week for d in payload.days} if payload.repeat_weekly else None)
    schedule_guard.raise_if_conflicts(await schedule_guard.assert_future_assignments_valid(db,studio,user_id=staff_id))
    await db.commit()
    return {"ok":True}
