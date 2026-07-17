from datetime import date, datetime, time, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_scoped_lesson, get_studio_context, StudioContext
from models import Client, Hall, Lesson, Reservation, StudioMember, User
from schemas.schedule.lessons import (
    LessonCreateRequest, LessonDetail, LessonRead, LessonUpdateRequest,
)
from services.notifier import notify


def _lesson_read(lesson: Lesson, booked_count: int) -> LessonRead:
    return LessonRead.model_validate({
        **{c: getattr(lesson, c) for c in (
            "id", "name", "teacher_name", "teacher_id", "hall_id", "start_time",
            "duration_min", "price", "level", "equipment", "total_spots",
            "service_id", "status",
        )},
        "booked_count": booked_count,
    })

router = APIRouter()


@router.get("/lessons", response_model=List[LessonRead])
async def list_lessons(
    date_from: date = Query(...),
    date_to: date = Query(...),
    hall_id: Optional[int] = Query(default=None),
    ctx: StudioContext = Depends(get_studio_context),
    db: AsyncSession = Depends(get_db),
):
    """Занятия студии за окно дат [date_from; date_to] включительно.

    Тренер видит только свои занятия (ТЗ 2.3). booked_count считается одним
    подзапросом с GROUP BY — без N+1.
    """
    window_start = datetime.combine(date_from, time.min)
    window_end = datetime.combine(date_to, time.min) + timedelta(days=1)  # эксклюзивно

    # Подсчёт записанных (не cancelled) по всем занятиям окна одним GROUP BY.
    booked_sq = (
        select(
            Reservation.lesson_id.label("lesson_id"),
            func.count(Reservation.id).label("booked_count"),
        )
        .where(Reservation.status != "cancelled")
        .group_by(Reservation.lesson_id)
        .subquery()
    )

    # Только скалярные колонки — не грузим relationship reservations (иначе lazy-load
    # в async-контексте). booked_count берём из GROUP BY-подзапроса.
    stmt = (
        select(
            Lesson.id, Lesson.name, Lesson.teacher_name, Lesson.teacher_id,
            Lesson.hall_id, Lesson.start_time, Lesson.duration_min, Lesson.price,
            Lesson.level, Lesson.equipment, Lesson.total_spots, Lesson.service_id,
            Lesson.status, func.coalesce(booked_sq.c.booked_count, 0).label("booked_count"),
        )
        .outerjoin(booked_sq, booked_sq.c.lesson_id == Lesson.id)
        .where(
            Lesson.studio_id == ctx.studio_id,
            Lesson.start_time >= window_start,
            Lesson.start_time < window_end,
        )
        .order_by(Lesson.start_time)
    )
    if hall_id is not None:
        stmt = stmt.where(Lesson.hall_id == hall_id)
    if ctx.role == "trainer":
        stmt = stmt.where(Lesson.teacher_id == ctx.user.id)

    rows = (await db.execute(stmt)).mappings().all()
    return [LessonRead.model_validate(row) for row in rows]


@router.get("/lessons/{lesson_id}", response_model=LessonDetail)
async def get_lesson(
    lesson_id: int,
    ctx: StudioContext = Depends(get_studio_context),
    db: AsyncSession = Depends(get_db),
):
    """Полные данные занятия + список записанных клиентов (для попапа).

    Доступ через общий хелпер get_scoped_lesson: не своя студия — 404,
    тренер на чужом занятии — 403.
    """
    lesson = await get_scoped_lesson(lesson_id, ctx, db)

    booked_count = (await db.execute(
        select(func.count(Reservation.id)).where(
            Reservation.lesson_id == lesson_id,
            Reservation.status != "cancelled",
        )
    )).scalar() or 0

    lesson_data = {
        c: getattr(lesson, c) for c in (
            "id", "name", "teacher_name", "teacher_id", "hall_id", "start_time",
            "duration_min", "price", "level", "equipment", "total_spots",
            "service_id", "status",
        )
    }

    clients = (await db.execute(
        select(
            Reservation.id.label("reservation_id"),
            Reservation.client_id,
            Reservation.spot_number,
            Reservation.status,
            Client.name,
            Client.last_name,
            Client.phone,
            Client.avatar_color,
        )
        .join(Client, Client.id == Reservation.client_id)
        .where(Reservation.lesson_id == lesson_id, Reservation.status != "cancelled")
        .order_by(Reservation.spot_number)
    )).mappings().all()

    return LessonDetail.model_validate(
        {**lesson_data, "booked_count": booked_count, "booked_clients": list(clients)}
    )


async def _teacher_name_in_studio(teacher_id: int, studio_id: int, db: AsyncSession) -> str:
    """Тренер должен состоять в студии; возвращает денормализованное имя. Иначе 404."""
    teacher = (await db.execute(
        select(User)
        .join(StudioMember, StudioMember.user_id == User.id)
        .where(User.id == teacher_id, StudioMember.studio_id == studio_id)
    )).scalar_one_or_none()
    if teacher is None:
        raise HTTPException(status_code=404, detail="Тренер не найден в студии")
    return f"{teacher.name} {teacher.last_name}".strip() if teacher.last_name else teacher.name


async def _assert_hall_in_studio(hall_id: int, studio_id: int, db: AsyncSession) -> None:
    hall = (await db.execute(
        select(Hall.id).where(Hall.id == hall_id, Hall.studio_id == studio_id)
    )).scalar_one_or_none()
    if hall is None:
        raise HTTPException(status_code=404, detail="Зал не найден в студии")


async def _booked_count(lesson_id: int, db: AsyncSession) -> int:
    return (await db.execute(
        select(func.count(Reservation.id)).where(
            Reservation.lesson_id == lesson_id,
            Reservation.status != "cancelled",
        )
    )).scalar() or 0


@router.post("/lessons", response_model=LessonRead, status_code=status.HTTP_201_CREATED)
async def create_lesson(
    body: LessonCreateRequest,
    ctx: StudioContext = Depends(get_studio_context),
    db: AsyncSession = Depends(get_db),
):
    """Создать занятие в текущей студии. teacher_name денормализуется из teacher_id."""
    # Расписание меняют только владелец и администратор (ТЗ 2.3) — тренер строго просмотр.
    if ctx.role == "trainer":
        raise HTTPException(status_code=403, detail="Расписание меняют владелец и администратор")

    if not 1 <= body.total_spots <= 50:
        raise HTTPException(status_code=400, detail="Число мест должно быть от 1 до 50")
    if body.duration_min <= 0:
        raise HTTPException(status_code=400, detail="Конец занятия должен быть позже начала")

    teacher_name = await _teacher_name_in_studio(body.teacher_id, ctx.studio_id, db)
    if body.hall_id is not None:
        await _assert_hall_in_studio(body.hall_id, ctx.studio_id, db)

    lesson = Lesson(
        studio_id=ctx.studio_id,
        name=body.name,
        teacher_id=body.teacher_id,
        teacher_name=teacher_name,
        hall_id=body.hall_id,
        start_time=body.start_time,
        duration_min=body.duration_min,
        total_spots=body.total_spots,
        price=body.price,
        level=body.level,
        equipment=body.equipment,
        service_id=body.service_id,
        status="confirmed",
    )
    db.add(lesson)
    await db.commit()
    await db.refresh(lesson)

    # Новое занятие — записей нет, booked_count = 0.
    return _lesson_read(lesson, 0)


@router.patch("/lessons/{lesson_id}", response_model=LessonRead)
async def update_lesson(
    lesson_id: int,
    body: LessonUpdateRequest,
    ctx: StudioContext = Depends(get_studio_context),
    db: AsyncSession = Depends(get_db),
):
    """Изменить/перенести/растянуть занятие. Меняются только присланные поля.
    Расписание меняют только владелец и администратор (ТЗ 2.3)."""
    if ctx.role == "trainer":
        raise HTTPException(status_code=403, detail="Расписание меняют владелец и администратор")

    lesson = await get_scoped_lesson(lesson_id, ctx, db)
    fields = body.model_dump(exclude_unset=True)

    if "duration_min" in fields and fields["duration_min"] <= 0:
        raise HTTPException(status_code=400, detail="Конец занятия должен быть позже начала")

    if "total_spots" in fields:
        spots = fields["total_spots"]
        if not 1 <= spots <= 50:
            raise HTTPException(status_code=400, detail="Число мест должно быть от 1 до 50")
        booked = await _booked_count(lesson_id, db)
        if spots < booked:
            raise HTTPException(
                status_code=400,
                detail=f"Мест не может быть меньше числа записанных ({booked})",
            )

    if "teacher_id" in fields:
        new_teacher_id = fields["teacher_id"]
        lesson.teacher_name = await _teacher_name_in_studio(new_teacher_id, ctx.studio_id, db)

    if fields.get("hall_id") is not None:
        await _assert_hall_in_studio(fields["hall_id"], ctx.studio_id, db)

    for key, value in fields.items():
        setattr(lesson, key, value)

    await db.commit()
    await db.refresh(lesson)

    return _lesson_read(lesson, await _booked_count(lesson_id, db))


@router.patch("/lessons/{lesson_id}/cancel", response_model=LessonRead)
async def cancel_lesson(
    lesson_id: int,
    ctx: StudioContext = Depends(get_studio_context),
    db: AsyncSession = Depends(get_db),
):
    """Отменить занятие: статус cancelled + каскадная отмена активных резерваций.

    Расписание меняют только владелец и администратор (ТЗ 2.3). Образец каскада —
    staff/schedule.py cancel_lesson. Резервации отменяем UPDATE-запросом (без
    lazy-load relationship в async-контексте).
    """
    if ctx.role == "trainer":
        raise HTTPException(status_code=403, detail="Расписание меняют владелец и администратор")

    lesson = await get_scoped_lesson(lesson_id, ctx, db)
    if lesson.status == "cancelled":
        raise HTTPException(status_code=409, detail="Занятие уже отменено")

    # Записанных фиксируем до каскада — им уйдёт уведомление об отмене (c3).
    booked_client_ids = (await db.execute(
        select(Reservation.client_id).where(
            Reservation.lesson_id == lesson_id, Reservation.status != "cancelled"
        )
    )).scalars().all()

    lesson.status = "cancelled"
    await db.execute(
        update(Reservation)
        .where(Reservation.lesson_id == lesson_id, Reservation.status != "cancelled")
        .values(status="cancelled", cancelled_at=datetime.now())
    )
    await db.commit()

    for client_id in booked_client_ids:
        await notify(db, ctx.studio_id, "client", "c3", {
            "client_id": client_id,
            "lesson_name": lesson.name,
            "start_time": lesson.start_time.strftime("%d.%m %H:%M"),
        })

    # После отмены все записи отменены — booked_count = 0.
    return _lesson_read(lesson, 0)
