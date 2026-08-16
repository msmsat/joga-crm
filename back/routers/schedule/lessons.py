import logging
from datetime import date, datetime, time, timedelta
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import async_session_maker, get_db
from dependencies import get_scoped_lesson, get_studio_context, StudioContext
from models import Client, Hall, Lesson, Reservation, Service, StudioMember, User
from schemas.schedule.lessons import (
    EligibleClient, LessonCancelRequest, LessonCreateRequest, LessonDaysResponse, LessonDetail,
    LessonRead, LessonUpdateRequest,
)
from services import gcal
from services.booking_access import can_book
from services.members import full_name
from services.notifier import lesson_context, notify
from services.subscription_charge import refund_reservation
from services.working_hours import assert_within_working_hours

logger = logging.getLogger(__name__)

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
    """Тренер должен состоять в студии; возвращает денормализованное имя. Иначе 404.

    Имя берём с членства: в журнале этой студии он подписан так, как его назвал
    её владелец (docs/ROADMAP_ACCOUNTS, решение 9).
    """
    member = (await db.execute(
        select(StudioMember)
        .where(StudioMember.user_id == teacher_id, StudioMember.studio_id == studio_id)
    )).scalar_one_or_none()
    if member is None:
        raise HTTPException(status_code=404, detail="Тренер не найден в студии")
    return full_name(member)


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


async def _find_schedule_conflict(
    db: AsyncSession, studio_id: int, *, exclude_lesson_id: Optional[int],
    teacher_id: Optional[int], hall_id: Optional[int],
    start_time: datetime, duration_min: int,
) -> Optional[tuple[Lesson, str]]:
    """Активное занятие той же студии, пересекающееся по времени
    [start, start+dur) с тем же тренером ИЛИ тем же залом (N-9, задача 7).
    exclude_lesson_id — само занятие (перенос не конфликтует само с собой).
    Возвращает (занятие, resource) — resource "trainer"/"hall", то, что
    совпало; None — конфликтов нет.
    # ponytail: наивная проверка O(n) по занятиям тренера/зала за всё время;
    # индексная выборка по диапазону дат — если журнал станет большим.
    """
    conditions = []
    if teacher_id is not None:
        conditions.append(Lesson.teacher_id == teacher_id)
    if hall_id is not None:
        conditions.append(Lesson.hall_id == hall_id)
    if not conditions:
        return None

    stmt = select(Lesson).where(
        Lesson.studio_id == studio_id,
        Lesson.status != "cancelled",
        or_(*conditions),
    )
    if exclude_lesson_id is not None:
        stmt = stmt.where(Lesson.id != exclude_lesson_id)

    end_time = start_time + timedelta(minutes=duration_min)
    for other in (await db.execute(stmt)).scalars().all():
        other_end = other.start_time + timedelta(minutes=other.duration_min)
        if other.start_time < end_time and start_time < other_end:
            resource = "trainer" if teacher_id is not None and other.teacher_id == teacher_id else "hall"
            return other, resource
    return None


async def _gcal_push_task(studio_id: int, lesson_id: int) -> None:
    """Своя сессия БД — сессия исходного запроса закрыта к моменту выполнения фоновой
    задачи (образец — routers/settings/security.py::_build_and_send_archive). Google не
    должен задерживать ответ журналу, а его недоступность не должна ронять создание
    занятия (эпик 6, задача 4.3) — push_lesson сама глотает свои ошибки, этот try/except
    только на случай, если сама сессия/импорт упадёт."""
    async with async_session_maker() as db:
        try:
            await gcal.push_lesson(db, studio_id, lesson_id)
        except Exception:
            logger.exception("gcal push failed: studio=%s lesson=%s", studio_id, lesson_id)


def _schedule_gcal_push(background_tasks: BackgroundTasks | None, studio_id: int, lesson_id: int) -> None:
    # background_tasks не None только на реальном HTTP-запросе (FastAPI инжектит его по
    # типу вне зависимости от позиции/дефолта в сигнатуре) — прямые вызовы из тестов
    # (см. test_lesson_time_rules.py и соседние) его не передают, и это не должно падать.
    if background_tasks is not None:
        background_tasks.add_task(_gcal_push_task, studio_id, lesson_id)


async def _notify_schedule_conflict(db: AsyncSession, studio_id: int, lesson: Lesson) -> None:
    """a7: находит конфликт для текущих время/зал/тренера занятия и, если
    есть, уведомляет админа. Общий хвост для create_lesson и update_lesson."""
    conflict = await _find_schedule_conflict(
        db, studio_id, exclude_lesson_id=lesson.id,
        teacher_id=lesson.teacher_id, hall_id=lesson.hall_id,
        start_time=lesson.start_time, duration_min=lesson.duration_min,
    )
    if conflict is None:
        return
    other, resource = conflict
    await notify(db, studio_id, "admin", "a7", {
        "lesson_name": lesson.name,
        "second_lesson_name": other.name,
        "start_time": lesson.start_time.strftime("%d.%m %H:%M"),
        "resource": resource,
    })


@router.post("/lessons", response_model=LessonRead, status_code=status.HTTP_201_CREATED)
async def create_lesson(
    body: LessonCreateRequest,
    ctx: StudioContext = Depends(get_studio_context),
    db: AsyncSession = Depends(get_db),
    background_tasks: BackgroundTasks = None,
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
    await assert_within_working_hours(
        db, ctx.studio_id,
        start_time=body.start_time, duration_min=body.duration_min,
        teacher_id=body.teacher_id, hall_id=body.hall_id,
    )

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

    await _notify_schedule_conflict(db, ctx.studio_id, lesson)
    _schedule_gcal_push(background_tasks, ctx.studio_id, lesson.id)

    # Новое занятие — записей нет, booked_count = 0.
    return _lesson_read(lesson, 0)


@router.patch("/lessons/{lesson_id}", response_model=LessonRead)
async def update_lesson(
    lesson_id: int,
    body: LessonUpdateRequest,
    ctx: StudioContext = Depends(get_studio_context),
    db: AsyncSession = Depends(get_db),
    background_tasks: BackgroundTasks = None,
):
    """Изменить/перенести/растянуть занятие. Меняются только присланные поля.
    Расписание меняют только владелец и администратор (ТЗ 2.3)."""
    if ctx.role == "trainer":
        raise HTTPException(status_code=403, detail="Расписание меняют владелец и администратор")

    lesson = await get_scoped_lesson(lesson_id, ctx, db)
    fields = body.model_dump(exclude_unset=True)

    # Отменённое занятие нельзя менять — кроме причины отмены (задача 9,
    # инфо-вид отменённого занятия): она правится и после отмены.
    if lesson.status == "cancelled" and set(fields.keys()) - {"cancel_reason"}:
        raise HTTPException(status_code=400, detail="Занятие отменено, изменить его нельзя")

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

    old_teacher_id = lesson.teacher_id

    if "teacher_id" in fields:
        new_teacher_id = fields["teacher_id"]
        lesson.teacher_name = await _teacher_name_in_studio(new_teacher_id, ctx.studio_id, db)

    if "service_id" in fields and fields["service_id"] is not None:
        service = await _service_in_studio(fields["service_id"], ctx.studio_id, db)
        lesson.name = service.name

    if fields.get("hall_id") is not None:
        await _assert_hall_in_studio(fields["hall_id"], ctx.studio_id, db)

    # Занятие двигают (время/длительность) или меняют занятого им человека/зал —
    # новая комбинация должна попадать в рабочие часы всех троих. Правку, которая
    # занятие не двигает (мест, цена, причина отмены), не трогаем: часы могли
    # поменять уже после создания, и тогда карточку нельзя было бы даже дописать.
    if {"start_time", "duration_min", "teacher_id", "hall_id"} & fields.keys():
        await assert_within_working_hours(
            db, ctx.studio_id,
            start_time=fields.get("start_time", lesson.start_time),
            duration_min=fields.get("duration_min", lesson.duration_min),
            teacher_id=fields.get("teacher_id", lesson.teacher_id),
            hall_id=fields.get("hall_id", lesson.hall_id),
        )

    reschedule_fields = {"start_time", "duration_min", "hall_id"}
    is_reschedule = reschedule_fields & fields.keys()

    for key, value in fields.items():
        setattr(lesson, key, value)

    await db.commit()
    await db.refresh(lesson)

    if is_reschedule and lesson.status != "cancelled":
        # Отменённое занятие «уже не считается» — правки применяем, но никого не
        # уведомляем (ни клиента c11, ни тренера t5, ни админа a7).
        # Перенос времени/зала/длительности — уведомляем записанных клиентов (c11).
        # Образец сбора client_id — cancel_lesson. Второй короткий commit только
        # clients_notified: notify идёт после основного commit (подводный камень задачи 3).
        booked_client_ids = (await db.execute(
            select(Reservation.client_id).where(
                Reservation.lesson_id == lesson_id, Reservation.status != "cancelled"
            )
        )).scalars().all()
        lesson_ctx = await lesson_context(db, lesson)
        results = [
            await notify(db, ctx.studio_id, "client", "c11", {
                **lesson_ctx, "client_id": client_id,
            })
            for client_id in booked_client_ids
        ]
        lesson.clients_notified = any(results)

        # t5: тренеру(ам) занятия — зеркало c11, но не клиентам, а тренеру;
        # если тренер сменился вместе с переносом, уведомляем и старого, и
        # нового (N-9, задача 6).
        for trainer_id in {tid for tid in (old_teacher_id, lesson.teacher_id) if tid is not None}:
            await notify(db, ctx.studio_id, "trainer", "t5", {
                "trainer_id": trainer_id,
                "lesson_name": lesson.name,
                "start_time": lesson.start_time.strftime("%d.%m %H:%M"),
            })

        # a7: перенос мог столкнуть занятие с другим по тому же тренеру/залу.
        await _notify_schedule_conflict(db, ctx.studio_id, lesson)

        await db.commit()
        await db.refresh(lesson)
        _schedule_gcal_push(background_tasks, ctx.studio_id, lesson.id)

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
    background_tasks: BackgroundTasks = None,
):
    """Отменить занятие: статус cancelled + каскадная отмена активных резерваций.

    Расписание меняют только владелец и администратор (ТЗ 2.3). Образец каскада —
    staff/schedule.py cancel_lesson. Каждой снятой записи возвращаем занятие на
    абонемент — отмена занятия студией не должна стоить клиенту посещения.
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
    reservations = (await db.execute(
        select(Reservation).where(
            Reservation.lesson_id == lesson_id, Reservation.status != "cancelled"
        )
    )).scalars().all()
    booked_client_ids = [r.client_id for r in reservations]

    lesson.status = "cancelled"
    lesson.cancel_reason = body.reason
    now = datetime.now()
    for reservation in reservations:
        reservation.status = "cancelled"
        reservation.cancelled_at = now
        await refund_reservation(db, reservation)
    await db.commit()

    lesson_ctx = await lesson_context(db, lesson)
    results = [
        await notify(db, ctx.studio_id, "client", "c3", {
            **lesson_ctx, "client_id": client_id,
        })
        for client_id in booked_client_ids
    ]
    lesson.clients_notified = any(results)
    await db.commit()

    # t9: тренер узнаёт об отмене СВОЕГО занятия (эпик 3, задача 4 — раньше
    # такого события не было вовсе, тренер мог не знать, что занятие сняли).
    if lesson.teacher_id is not None:
        await notify(db, ctx.studio_id, "trainer", "t9", {
            "trainer_id": lesson.teacher_id,
            "lesson_name": lesson.name,
            "start_time": lesson.start_time.strftime("%d.%m %H:%M"),
        })

    _schedule_gcal_push(background_tasks, ctx.studio_id, lesson.id)

    # После отмены все записи отменены — booked_count = 0.
    return _lesson_read(lesson, 0)
