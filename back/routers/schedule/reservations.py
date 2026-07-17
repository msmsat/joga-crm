from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_scoped_lesson, get_studio_context, StudioContext
from models import Client, ClientSubscription, Reservation
from schemas.schedule.reservations import ReservationCreate, ReservationRead
from services.notifier import notify

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

    client = (await db.execute(
        select(Client.id).where(Client.id == body.client_id, Client.studio_id == ctx.studio_id)
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

    reservation = Reservation(
        client_id=body.client_id,
        lesson_id=body.lesson_id,
        spot_number=booked + 1,
        status="active",
        booking_channel="manual",
    )
    db.add(reservation)
    await db.commit()
    await db.refresh(reservation)

    await notify(db, ctx.studio_id, "client", "c1", {
        "client_id": body.client_id,
        "lesson_name": lesson.name,
        "start_time": lesson.start_time.strftime("%d.%m %H:%M"),
    })
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

    await get_scoped_lesson(reservation.lesson_id, ctx, db)  # 404 чужая студия

    if reservation.status == "cancelled":
        raise HTTPException(status_code=409, detail="Запись уже отменена")

    reservation.status = "cancelled"
    reservation.cancelled_at = datetime.now()
    await db.commit()
    await db.refresh(reservation)
    return ReservationRead.model_validate(reservation)


@router.patch("/reservations/{reservation_id}/attend", response_model=ReservationRead)
async def attend_reservation(
    reservation_id: int,
    ctx: StudioContext = Depends(get_studio_context),
    db: AsyncSession = Depends(get_db),
):
    """Отметить, что клиент пришёл: status=attended + Client.last_visit_date.

    Скоуп занятия (404 чужая студия / 403 тренер на чужом) — get_scoped_lesson.
    Повторная отметка идемпотентна: статус уже attended — просто возвращаем запись.
    """
    reservation = (await db.execute(
        select(Reservation).where(Reservation.id == reservation_id)
    )).scalar_one_or_none()
    if reservation is None:
        raise HTTPException(status_code=404, detail="Запись не найдена")

    await get_scoped_lesson(reservation.lesson_id, ctx, db)  # 404/403 по студии/роли

    if reservation.status != "attended":
        reservation.status = "attended"
        # last_visit_date нужен retention/рефералке (Эпик 3/4). Обновляем только при
        # переходе — повторная отметка ничего не трогает (идемпотентность).
        await db.execute(
            update(Client)
            .where(Client.id == reservation.client_id)
            .values(last_visit_date=date.today())
        )

        # Списание занятия с активного абонемента (задача 5b). Замороженный не трогаем.
        # Списываем только в этой же ветке — повтор attend не спишет второй раз.
        sub = (await db.execute(
            select(ClientSubscription).where(
                ClientSubscription.client_id == reservation.client_id,
                ClientSubscription.status == "active",
                ClientSubscription.is_frozen == False,
                ClientSubscription.used_classes < ClientSubscription.total_classes,
            ).order_by(ClientSubscription.expires_at)
        )).scalars().first()
        remaining = None
        if sub is not None:
            sub.used_classes += 1
            remaining = sub.total_classes - sub.used_classes
            if remaining <= 0:
                sub.status = "finished"

        await db.commit()
        await db.refresh(reservation)

        # Уведомления после коммита: остаток 1–2 → c5; кончился/истёк → c6.
        if remaining is not None:
            if remaining in (1, 2):
                await notify(db, ctx.studio_id, "client", "c5",
                             {"client_id": reservation.client_id, "remaining": remaining})
            elif remaining <= 0:
                await notify(db, ctx.studio_id, "client", "c6",
                             {"client_id": reservation.client_id, "remaining": 0})
    return ReservationRead.model_validate(reservation)
