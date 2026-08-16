"""Публичный каталог студии для клиентского мини-приложения (задача 10).

Без токена — только Depends(get_db), паттерн auth/register.py. Отдаём строго
публичные поля: никаких email/телефонов клиентов и внутренних id клиентов.
Свободные места = total_spots − активные Reservation.
"""
import random
from datetime import date, datetime, time, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from activity import log_activity
from database import get_db
from ratelimit import limiter
from models import Client, Service, Lesson, Reservation
from schemas._base import BaseSchema, Phone
from services.booking_access import find_eligible_subscription
from services.booking_rules import assert_bookable, booking_window, load_rules, within_widget_hours
from services.contacts import normalize, normalized_column
from services.notifier import lesson_context, notify
from services.referral import fire_referral
from services.subscription_charge import charge_reservation, notify_subscription_remaining

router = APIRouter()

_AVATAR_COLORS = [
    "#FCAE91", "#A3C9A8", "#D88C9A", "#9BB5D8", "#C8A8D8",
    "#D8C8A8", "#A8D8C8", "#D8A8B5", "#B5D8A8", "#A8B5D8",
]


class PublicService(BaseSchema):
    id: int
    name: str
    description: Optional[str]
    price: int
    duration_min: int
    category: Optional[str]
    color: Optional[str]


class PublicSlot(BaseSchema):
    lesson_id: int
    name: str
    start_time: datetime
    duration_min: int
    price: int
    level: str
    free_spots: int


@router.get("/public/{studio_id}/services", response_model=List[PublicService])
@limiter.limit("30/minute")
async def public_services(request: Request, studio_id: int, db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(Service).where(Service.studio_id == studio_id).order_by(Service.name)
    )).scalars().all()
    return rows


@router.get("/public/{studio_id}/slots", response_model=List[PublicSlot])
@limiter.limit("30/minute")
async def public_slots(
    request: Request,
    studio_id: int,
    service_id: Optional[int] = None,
    on_date: Optional[date] = Query(None, alias="date"),
    db: AsyncSession = Depends(get_db),
):
    rules = await load_rules(db, studio_id)
    # Виджет выключен — слотов нет вовсе: «Показывать виджет клиентам» значит
    # именно это (в мини-приложении расписание остаётся видимым, там у клиента
    # есть кабинет с уже купленным абонементом — здесь показывать нечего).
    if not rules.booking_active:
        return []
    lower, upper = booking_window(rules)

    # date сужает окно до одного дня, но не даёт выйти за границы правил студии.
    if on_date is not None:
        day_start = datetime.combine(on_date, time.min)
        day_end = day_start + timedelta(days=1)
        lower = max(lower, day_start)
        upper = min(upper, day_end)

    booked_sq = (
        select(
            Reservation.lesson_id.label("lesson_id"),
            func.count(Reservation.id).label("booked_count"),
        )
        .where(Reservation.status != "cancelled")
        .group_by(Reservation.lesson_id)
        .subquery()
    )
    booked = func.coalesce(booked_sq.c.booked_count, 0)

    stmt = (
        select(
            Lesson.id.label("lesson_id"), Lesson.name, Lesson.start_time,
            Lesson.duration_min, Lesson.price, Lesson.level,
            (Lesson.total_spots - booked).label("free_spots"),
        )
        .outerjoin(booked_sq, booked_sq.c.lesson_id == Lesson.id)
        .where(
            Lesson.studio_id == studio_id,
            Lesson.status != "cancelled",
            Lesson.start_time >= lower,
            Lesson.start_time < upper,
            Lesson.total_spots - booked > 0,
        )
        .order_by(Lesson.start_time)
    )
    if service_id is not None:
        stmt = stmt.where(Lesson.service_id == service_id)

    rows = (await db.execute(stmt)).mappings().all()
    # Часы работы виджета — фильтр по времени суток, в SQL их не выразить одним
    # сравнением (интервал может идти через полночь), а список слотов короткий.
    return [
        PublicSlot.model_validate(row)
        for row in rows
        if within_widget_hours(rules, row["start_time"])
    ]


class ReserveRequest(BaseSchema):
    lesson_id: int
    name: str
    # E.164, как и у ClientCreate: клиент заводится этим номером, и по нему потом
    # уходят платные шаблоны WhatsApp — код страны обязан прийти с формы.
    phone: Phone


class ReserveResponse(BaseSchema):
    reservation_id: int
    lesson_name: str
    start_time: datetime


@router.post("/public/booking/{studio_id}/reserve", status_code=201, response_model=ReserveResponse)
@limiter.limit("5/minute")
async def public_reserve(
    request: Request,
    studio_id: int,
    body: ReserveRequest,
    db: AsyncSession = Depends(get_db),
):
    """Публичная бронь без токена (задача 11): клиент оставляет имя и телефон.

    find-or-create Client по телефону; проверки мест/дублей — как в book_lesson.
    Окно записи гейтится теми же правилами студии, что и public_slots
    (`assert_bookable`), иначе виджет предложил бы слот, который тут же откажет.

    «Предоплата при записи» здесь НЕ применяется: форма отдаёт имя и телефон,
    аккаунта и абонемента у человека ещё нет — гейт по абонементу закрыл бы
    публичную запись новым клиентам совсем. Настройка работает в кабинете
    клиента (мини-приложение), где абонемент есть что купить.
    """
    rules = await load_rules(db, studio_id)

    lesson = (await db.execute(
        select(Lesson).where(
            Lesson.id == body.lesson_id,
            Lesson.studio_id == studio_id,
            Lesson.status != "cancelled",
        )
    )).scalar_one_or_none()
    if lesson is None:
        raise HTTPException(status_code=404, detail="Занятие не найдено")
    assert_bookable(rules, lesson)

    # find-or-create по телефону в рамках студии; первый визит через онлайн → source=online.
    # Сравнение по цифрам: «+7 999 …» и «79999…» — тот же клиент, второй заводить нельзя
    # (то же правило, что у guard'а на POST /clients).
    client = (await db.execute(
        select(Client).where(
            Client.studio_id == studio_id,
            normalized_column(Client, "phone") == normalize("phone", body.phone),
        )
    )).scalars().first()
    is_new_client = client is None
    if client is None:
        client = Client(
            studio_id=studio_id,
            name=body.name,
            phone=body.phone,
            source="online",
            avatar_color=random.choice(_AVATAR_COLORS),
            status="new",
        )
        db.add(client)
        await db.flush()  # нужен client.id ниже
        log_activity(
            db, studio_id, "client",
            title=f"Новый клиент: {client.name}",
            actor_name="Онлайн-запись",
            entity_type="client", entity_id=client.id,
        )

    booked = (await db.execute(
        select(func.count(Reservation.id)).where(
            Reservation.lesson_id == body.lesson_id,
            Reservation.status != "cancelled",
        )
    )).scalar() or 0
    if booked >= lesson.total_spots:
        raise HTTPException(status_code=400, detail="Все места заняты")

    if not rules.repeat_booking_allowed:
        duplicate = (await db.execute(
            select(Reservation.id).where(
                Reservation.client_id == client.id,
                Reservation.lesson_id == body.lesson_id,
                Reservation.status != "cancelled",
            ).limit(1)
        )).scalar_one_or_none()
        if duplicate is not None:
            raise HTTPException(status_code=400, detail="Вы уже записаны на это занятие")

    reservation = Reservation(
        client_id=client.id,
        lesson_id=body.lesson_id,
        spot_number=booked + 1,
        status="pending" if rules.trainer_confirmation_required else "active",
        booking_channel="web",
    )
    db.add(reservation)
    # Публичная бронь не гейтится абонементом (новый клиент записывается без него),
    # поэтому списываем только если подходящий абонемент есть.
    sub = await find_eligible_subscription(db, client.id, lesson)
    remaining = await charge_reservation(db, studio_id, reservation, sub)
    await db.flush()  # нужен reservation.id для ленты
    log_activity(
        db, studio_id, "booking",
        title=f"Онлайн-запись на «{lesson.name}»",
        actor_name=client.name,
        entity_type="reservation", entity_id=reservation.id,
    )

    # Реферальный триггер first_visit: у нового клиента pending-реферал ещё не мог
    # существовать, поэтому проверяем только для существующего клиента.
    if not is_new_client:
        await fire_referral(db, studio_id, client.id, "first_visit", referred_name=client.name)

    await db.commit()
    await db.refresh(reservation)

    # «Запись подтверждена» — только за подтверждённой бронью: при включённом
    # подтверждении тренером c1 уходит после одобрения в Журнале.
    lesson_ctx = await lesson_context(db, lesson)
    if reservation.status == "active":
        await notify(db, studio_id, "client", "c1", {
            **lesson_ctx, "client_id": client.id,
        })
    await notify(db, studio_id, "admin", "a1", {
        **lesson_ctx,
        "client_name": client.name,
        # См. reservations.py: гасит a1 владельцу, который сам ведёт занятие и
        # получит t1 (notifier._recipient).
        "trainer_id": lesson.teacher_id,
    })
    # Тренеру этого занятия (t1) — только если у занятия задан teacher_id.
    if lesson.teacher_id is not None:
        await notify(db, studio_id, "trainer", "t1", {
            **lesson_ctx,
            "trainer_id": lesson.teacher_id,
            "client_name": client.name,
        })
    await notify_subscription_remaining(db, studio_id, client.id, remaining)
    return ReserveResponse(
        reservation_id=reservation.id,
        lesson_name=lesson.name,
        start_time=lesson.start_time,
    )
