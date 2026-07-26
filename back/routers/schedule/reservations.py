from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_scoped_lesson, get_studio_context, StudioContext
from models import Client, Reservation
from schemas.schedule.reservations import ReservationCreate, ReservationRead
from services.booking_access import assert_can_book
from services.notifier import notify
from services.subscription_charge import (
    charge_reservation, notify_subscription_remaining, refund_reservation,
)

router = APIRouter()


@router.post("/reservations", response_model=ReservationRead, status_code=status.HTTP_201_CREATED)
async def create_reservation(
    body: ReservationCreate,
    ctx: StudioContext = Depends(get_studio_context),
    db: AsyncSession = Depends(get_db),
):
    """Записать клиента на занятие. Лимит мест и запрет двойной записи —
    та же логика, что в POST /clients/{id}/booking (book_lesson).

    Записывать/снимать клиентов могут только владелец и администратор (ТЗ 2.3).
    Клиент проверяется по studio_id — чужой клиент даёт 404.
    """
    if ctx.role == "trainer":
        raise HTTPException(status_code=403, detail="Записывать клиентов могут владелец и администратор")

    lesson = await get_scoped_lesson(body.lesson_id, ctx, db)
    # Отменённое занятие «уже не считается» — на него нельзя записать (как в
    # публичной брони, public.py: cancelled → 404), значит и c1/a1/t1 не шлём.
    if lesson.status == "cancelled":
        raise HTTPException(status_code=400, detail="Занятие отменено — запись невозможна")
    # Записать менее чем за 2 часа до начала нельзя (правило Журнала).
    # ponytail: фикс-окно 2ч; вынести в настройки студии — если попросят.
    if lesson.start_time < datetime.now() + timedelta(hours=2):
        raise HTTPException(status_code=400, detail="Записать на занятие можно не позднее чем за 2 часа до начала")

    client = (await db.execute(
        select(Client).where(Client.id == body.client_id, Client.studio_id == ctx.studio_id)
    )).scalar_one_or_none()
    if client is None:
        raise HTTPException(status_code=404, detail="Клиент не найден")

    booked = (await db.execute(
        select(func.count(Reservation.id)).where(
            Reservation.lesson_id == body.lesson_id,
            Reservation.status != "cancelled",
        )
    )).scalar() or 0
    if booked >= lesson.total_spots:
        raise HTTPException(status_code=400, detail="Все места заняты")

    duplicate = (await db.execute(
        select(Reservation.id).where(
            Reservation.client_id == body.client_id,
            Reservation.lesson_id == body.lesson_id,
            Reservation.status != "cancelled",
        )
    )).scalar_one_or_none()
    if duplicate is not None:
        raise HTTPException(status_code=409, detail="Клиент уже записан на это занятие")

    sub = await assert_can_book(db, body.client_id, lesson)

    reservation = Reservation(
        client_id=body.client_id,
        lesson_id=body.lesson_id,
        spot_number=booked + 1,
        status="active",
        booking_channel="manual",
    )
    db.add(reservation)
    remaining = await charge_reservation(db, ctx.studio_id, reservation, sub)
    await db.commit()
    await db.refresh(reservation)

    client_full_name = f"{client.name} {client.last_name or ''}".strip()
    await notify(db, ctx.studio_id, "client", "c1", {
        "client_id": body.client_id,
        "lesson_name": lesson.name,
        "start_time": lesson.start_time.strftime("%d.%m %H:%M"),
    })
    await notify(db, ctx.studio_id, "admin", "a1", {
        "lesson_name": lesson.name,
        "client_name": client_full_name,
    })
    # Тренеру этого занятия (t1) — только если у занятия задан teacher_id.
    if lesson.teacher_id is not None:
        await notify(db, ctx.studio_id, "trainer", "t1", {
            "trainer_id": lesson.teacher_id,
            "lesson_name": lesson.name,
            "client_name": client_full_name,
            "start_time": lesson.start_time.strftime("%d.%m %H:%M"),
        })
    await notify_subscription_remaining(db, ctx.studio_id, body.client_id, remaining)
    return ReservationRead.model_validate(reservation)


@router.patch("/reservations/{reservation_id}/cancel", response_model=ReservationRead)
async def cancel_reservation(
    reservation_id: int,
    ctx: StudioContext = Depends(get_studio_context),
    db: AsyncSession = Depends(get_db),
):
    """Снять клиента с занятия — освобождает место (booked_count уменьшится).

    Снимать клиентов могут только владелец и администратор (ТЗ 2.3).
    """
    if ctx.role == "trainer":
        raise HTTPException(status_code=403, detail="Снимать клиентов могут владелец и администратор")

    reservation = (await db.execute(
        select(Reservation).where(Reservation.id == reservation_id)
    )).scalar_one_or_none()
    if reservation is None:
        raise HTTPException(status_code=404, detail="Запись не найдена")

    lesson = await get_scoped_lesson(reservation.lesson_id, ctx, db)  # 404 чужая студия

    if reservation.status == "cancelled":
        raise HTTPException(status_code=409, detail="Запись уже отменена")

    # Снять клиента менее чем за 2 часа до начала нельзя (правило Журнала). Из-за
    # этого события a2/t2 «отмена <1ч/<2ч» больше не могут сработать отсюда —
    # блок удалён; если понадобятся, их надо врезать в другой путь отмены.
    # ponytail: фикс-окно 2ч; вынести в настройки студии — если попросят.
    if lesson.start_time < datetime.now() + timedelta(hours=2):
        raise HTTPException(status_code=400, detail="Снять с занятия можно не позднее чем за 2 часа до начала")

    reservation.status = "cancelled"
    reservation.cancelled_at = datetime.now()
    await refund_reservation(db, reservation)  # занятие возвращается на абонемент
    await db.commit()
    await db.refresh(reservation)

    # Клиента сняли с занятия (крестик в Журнале) — сообщаем ему об отмене его
    # записи (переиспользуем c3 «Отмена занятия»; работает с текущими галочками).
    await notify(db, ctx.studio_id, "client", "c3", {
        "client_id": reservation.client_id,
        "lesson_name": lesson.name,
        "start_time": lesson.start_time.strftime("%d.%m %H:%M"),
    })
    return ReservationRead.model_validate(reservation)


@router.patch("/reservations/{reservation_id}/attend", response_model=ReservationRead)
async def attend_reservation(
    reservation_id: int,
    ctx: StudioContext = Depends(get_studio_context),
    db: AsyncSession = Depends(get_db),
):
    """Отметить, что клиент пришёл: status=attended + Client.last_visit_date.

    Абонемент здесь не трогаем: занятие списывается в момент записи и
    возвращается при отмене (services/subscription_charge.py) — приход клиента
    ничего не меняет в остатке.

    Скоуп занятия (404 чужая студия / 403 тренер на чужом) — get_scoped_lesson.
    Повторная отметка идемпотентна: статус уже attended — просто возвращаем запись.
    """
    reservation = (await db.execute(
        select(Reservation).where(Reservation.id == reservation_id)
    )).scalar_one_or_none()
    if reservation is None:
        raise HTTPException(status_code=404, detail="Запись не найдена")

    lesson = await get_scoped_lesson(reservation.lesson_id, ctx, db)  # 404/403 по студии/роли

    if reservation.status != "attended":
        reservation.status = "attended"
        # last_visit_date нужен retention/рефералке (Эпик 3/4). Обновляем только при
        # переходе — повторная отметка ничего не трогает (идемпотентность).
        await db.execute(
            update(Client)
            .where(Client.id == reservation.client_id)
            .values(last_visit_date=date.today())
        )

        await db.commit()
        await db.refresh(reservation)

        await notify(db, ctx.studio_id, "client", "c8",
                     {"client_id": reservation.client_id, "lesson_name": lesson.name})
    return ReservationRead.model_validate(reservation)
