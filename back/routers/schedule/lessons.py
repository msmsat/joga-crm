from datetime import date, datetime, time, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_scoped_lesson, get_studio_context, StudioContext
from models import Client, Hall, Lesson, Reservation, Service, StudioMember, User
from schemas.schedule.lessons import (
    EligibleClient, LessonCancelRequest, LessonCreateRequest, LessonDaysResponse, LessonDetail,
    LessonRead, LessonUpdateRequest,
)
from services.booking_access import can_book
from services.notifier import notify

MIN_CREATE_LEAD = timedelta(hours=3)
MIN_CHANGE_LEAD = timedelta(hours=2)


_LESSON_FIELDS = (
    "id", "name", "teacher_name", "teacher_id", "hall_id", "start_time",
    "duration_min", "price", "level", "equipment", "total_spots",
    "service_id", "status", "cancel_reason", "clients_notified",
)


def _lesson_read(lesson: Lesson, booked_count: int) -> LessonRead:
    return LessonRead.model_validate({
        **{c: getattr(lesson, c) for c in _LESSON_FIELDS},
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
            Lesson.status, Lesson.cancel_reason, Lesson.clients_notified,
            Service.color.label("service_color"),
            func.coalesce(booked_sq.c.booked_count, 0).label("booked_count"),
        )
        .outerjoin(booked_sq, booked_sq.c.lesson_id == Lesson.id)
        .outerjoin(Service, Service.id == Lesson.service_id)
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


@router.get("/lessons/days", response_model=LessonDaysResponse)
async def list_lesson_days(
    month: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
    ctx: StudioContext = Depends(get_studio_context),
    db: AsyncSession = Depends(get_db),
):
    """Даты месяца, в которых есть неотменённые занятия — точки мини-календаря
    Журнала (задача 5 V4-5). Гонять полный список занятий месяца ради точек
    расточительно, поэтому отдельный лёгкий эндпоинт с DISTINCT по дате.

    Тренер видит точки только своих занятий — тот же скоуп, что list_lessons.
    """
    year, mon = (int(p) for p in month.split("-"))
    window_start = datetime(year, mon, 1)
    window_end = datetime(year + 1, 1, 1) if mon == 12 else datetime(year, mon + 1, 1)

    stmt = (
        select(func.date(Lesson.start_time).distinct())
        .where(
            Lesson.studio_id == ctx.studio_id,
            Lesson.status != "cancelled",
            Lesson.start_time >= window_start,
            Lesson.start_time < window_end,
        )
    )
    if ctx.role == "trainer":
        stmt = stmt.where(Lesson.teacher_id == ctx.user.id)

    rows = (await db.execute(stmt)).scalars().all()
    days = sorted({d.isoformat() if hasattr(d, "isoformat") else str(d) for d in rows})
    return LessonDaysResponse(days=days)


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

    service_color = None
    if lesson.service_id is not None:
        service_color = (await db.execute(
            select(Service.color).where(Service.id == lesson.service_id)
        )).scalar_one_or_none()

    lesson_data = {c: getattr(lesson, c) for c in _LESSON_FIELDS}
    lesson_data["service_color"] = service_color

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


@router.get("/lessons/{lesson_id}/eligible-clients", response_model=List[EligibleClient])
async def get_eligible_clients(
    lesson_id: int,
    ctx: StudioContext = Depends(get_studio_context),
    db: AsyncSession = Depends(get_db),
):
    """Клиенты студии, которых можно записать на это занятие (CL-6.4) — только те,
    для кого пройдёт assert_can_book (право по абонементу, ядро — CL-6.1). Zero
    Trust: фронт не решает, кто подходит, только рисует то, что вернул бэк.

    Доступ через get_scoped_lesson: не своя студия — 404, тренер на чужом — 403.
    Уже записанные на это занятие (кроме отменённых) в список не попадают.
    """
    lesson = await get_scoped_lesson(lesson_id, ctx, db)

    already_booked = (await db.execute(
        select(Reservation.client_id).where(
            Reservation.lesson_id == lesson_id,
            Reservation.status != "cancelled",
        )
    )).scalars().all()

    clients = (await db.execute(
        select(Client).where(
            Client.studio_id == ctx.studio_id,
            Client.id.notin_(already_booked) if already_booked else True,
        )
    )).scalars().all()

    # ponytail: N клиентов × запрос абонементов — приемлемо для MVP-объёмов;
    # при росте — один JOIN. Ядро гейта (find_eligible_subscription) переиспользуется
    # как булева-проверка can_book, без исключений в цикле.
    eligible = []
    for client in clients:
        if await can_book(db, client.id, lesson):
            eligible.append(EligibleClient(
                id=client.id,
                name=client.name,
                last_name=client.last_name,
                phone=client.phone,
                avatar_color=client.avatar_color,
            ))
    return eligible


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


async def _service_in_studio(service_id: int, studio_id: int, db: AsyncSession) -> Service:
    """Услуга должна принадлежать студии — иначе 404 (образец: _assert_hall_in_studio)."""
    service = (await db.execute(
        select(Service).where(Service.id == service_id, Service.studio_id == studio_id)
    )).scalar_one_or_none()
    if service is None:
        raise HTTPException(status_code=404, detail="Услуга не найдена в студии")
    return service


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
    if body.start_time < datetime.now() + MIN_CREATE_LEAD:
        raise HTTPException(
            status_code=400,
            detail="Создавать занятие можно не позднее чем за 3 часа до начала",
        )

    teacher_name = await _teacher_name_in_studio(body.teacher_id, ctx.studio_id, db)
    if body.hall_id is not None:
        await _assert_hall_in_studio(body.hall_id, ctx.studio_id, db)
    service = await _service_in_studio(body.service_id, ctx.studio_id, db)

    lesson = Lesson(
        studio_id=ctx.studio_id,
        name=service.name,
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

    # Правка только причины отмены (задача 9, инфо-вид отменённого занятия) —
    # правило времени не применяется: занятие уже прошло/отменено, ничего не переносим.
    if set(fields.keys()) != {"cancel_reason"}:
        now = datetime.now()
        if lesson.start_time < now + MIN_CHANGE_LEAD:
            raise HTTPException(
                status_code=400,
                detail="Изменять занятие можно не позднее чем за 2 часа до начала",
            )
        new_start = fields.get("start_time")
        if new_start is not None and new_start < now + MIN_CHANGE_LEAD:
            raise HTTPException(
                status_code=400,
                detail="Изменять занятие можно не позднее чем за 2 часа до начала",
            )

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

    if "service_id" in fields and fields["service_id"] is not None:
        service = await _service_in_studio(fields["service_id"], ctx.studio_id, db)
        lesson.name = service.name

    if fields.get("hall_id") is not None:
        await _assert_hall_in_studio(fields["hall_id"], ctx.studio_id, db)

    reschedule_fields = {"start_time", "duration_min", "hall_id"}
    is_reschedule = reschedule_fields & fields.keys()

    for key, value in fields.items():
        setattr(lesson, key, value)

    await db.commit()
    await db.refresh(lesson)

    if is_reschedule:
        # Перенос времени/зала/длительности — уведомляем записанных клиентов (c11).
        # Образец сбора client_id — cancel_lesson. Второй короткий commit только
        # clients_notified: notify идёт после основного commit (подводный камень задачи 3).
        booked_client_ids = (await db.execute(
            select(Reservation.client_id).where(
                Reservation.lesson_id == lesson_id, Reservation.status != "cancelled"
            )
        )).scalars().all()
        results = [
            await notify(db, ctx.studio_id, "client", "c11", {
                "client_id": client_id,
                "lesson_name": lesson.name,
                "start_time": lesson.start_time.strftime("%d.%m %H:%M"),
            })
            for client_id in booked_client_ids
        ]
        lesson.clients_notified = any(results)
        await db.commit()
        await db.refresh(lesson)

    return _lesson_read(lesson, await _booked_count(lesson_id, db))


@router.delete("/lessons/{lesson_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lesson(
    lesson_id: int,
    ctx: StudioContext = Depends(get_studio_context),
    db: AsyncSession = Depends(get_db),
):
    """Настоящее удаление занятия — для отката только что созданного (undo, V4-3).

    Не подменяет cancel: пользовательская отмена оставляет занятие в базе со
    статусом cancelled. DELETE существует для цикла «создал-передумал», чтобы не
    копить мусорные отменённые занятия, а не для стирания истории — поэтому
    занятие с активными записями удалить нельзя.
    """
    if ctx.role == "trainer":
        raise HTTPException(status_code=403, detail="Расписание меняют владелец и администратор")

    lesson = await get_scoped_lesson(lesson_id, ctx, db)
    if await _booked_count(lesson_id, db) > 0:
        raise HTTPException(
            status_code=409,
            detail="На занятие записаны клиенты — сначала снимите их или отмените занятие",
        )

    await db.delete(lesson)
    await db.commit()


@router.patch("/lessons/{lesson_id}/cancel", response_model=LessonRead)
async def cancel_lesson(
    lesson_id: int,
    body: LessonCancelRequest = LessonCancelRequest(),
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
    if lesson.start_time < datetime.now() + MIN_CHANGE_LEAD:
        raise HTTPException(
            status_code=400,
            detail="Отменять занятие можно не позднее чем за 2 часа до начала",
        )

    # Записанных фиксируем до каскада — им уйдёт уведомление об отмене (c3).
    booked_client_ids = (await db.execute(
        select(Reservation.client_id).where(
            Reservation.lesson_id == lesson_id, Reservation.status != "cancelled"
        )
    )).scalars().all()

    lesson.status = "cancelled"
    lesson.cancel_reason = body.reason
    await db.execute(
        update(Reservation)
        .where(Reservation.lesson_id == lesson_id, Reservation.status != "cancelled")
        .values(status="cancelled", cancelled_at=datetime.now())
    )
    await db.commit()

    results = [
        await notify(db, ctx.studio_id, "client", "c3", {
            "client_id": client_id,
            "lesson_name": lesson.name,
            "start_time": lesson.start_time.strftime("%d.%m %H:%M"),
        })
        for client_id in booked_client_ids
    ]
    lesson.clients_notified = any(results)
    await db.commit()

    # После отмены все записи отменены — booked_count = 0.
    return _lesson_read(lesson, 0)
