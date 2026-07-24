from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from activity import log_activity
from database import get_db
from dependencies import get_scoped_lesson, get_studio_context, StudioContext
from models import (
    Client, ClientLoyaltyCard, ClientSubscription,
    Reservation, StudioSubscriptionProgramConfig, SubscriptionPackage,
)
from routers.clients.loyalty import apply_deposit_change, register_purchase
from routers.clients.subscriptions import attach_subscription
from schemas.schedule.reservations import ReservationCreate, ReservationRead
from services.booking_access import assert_can_book
from services.notifier import notify
from services.pricing import resolve_price

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

    await assert_can_book(db, body.client_id, lesson)

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
    await notify(db, ctx.studio_id, "admin", "a1", {
        "lesson_name": lesson.name,
        "client_name": f"{client.name} {client.last_name or ''}".strip(),
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

    lesson = await get_scoped_lesson(reservation.lesson_id, ctx, db)  # 404 чужая студия

    if reservation.status == "cancelled":
        raise HTTPException(status_code=409, detail="Запись уже отменена")

    is_last_minute = lesson.start_time - datetime.now() < timedelta(hours=1)
    reservation.status = "cancelled"
    reservation.cancelled_at = datetime.now()
    await db.commit()
    await db.refresh(reservation)

    if is_last_minute:
        client = (await db.execute(
            select(Client).where(Client.id == reservation.client_id)
        )).scalar_one_or_none()
        if client is not None:
            await notify(db, ctx.studio_id, "admin", "a2", {
                "lesson_name": lesson.name,
                "client_name": f"{client.name} {client.last_name or ''}".strip(),
            })
    return ReservationRead.model_validate(reservation)


async def _try_auto_renew(db: AsyncSession, studio_id: int, client_id: int, finished_sub: ClientSubscription) -> None:
    """Автопродление абонемента за счёт депозита (V5-7, Блок 4.2). MVP без
    эквайринга: списываем цену пакета с депозита клиента, если хватает.
    Не хватает / выключено / пакет снят с продажи → только событие в ленте.
    Не коммитит — вызывается внутри транзакции attend_reservation.
    # ponytail: автопродление только с депозита; автосписание с карты — эпик эквайринга
    """
    if finished_sub.package_id is None:
        return

    config = (await db.execute(
        select(StudioSubscriptionProgramConfig).where(StudioSubscriptionProgramConfig.studio_id == studio_id)
    )).scalar_one_or_none()
    client = (await db.execute(select(Client).where(Client.id == client_id))).scalar_one()

    if config is None or not config.auto_renewal:
        log_activity(db, studio_id, "client", title=f"Абонемент закончился у {client.name} {client.last_name or ''}".strip(),
                      entity_type="client", entity_id=client_id)
        return

    package = (await db.execute(
        select(SubscriptionPackage).where(SubscriptionPackage.id == finished_sub.package_id)
    )).scalar_one_or_none()
    if package is None or not package.is_active:
        log_activity(db, studio_id, "client", title=f"Абонемент закончился у {client.name} {client.last_name or ''}".strip(),
                      entity_type="client", entity_id=client_id)
        return

    resolved = await resolve_price(db, studio_id, client_id, package.price)
    card = (await db.execute(
        select(ClientLoyaltyCard).where(ClientLoyaltyCard.client_id == client_id)
    )).scalar_one_or_none()
    deposit_balance = card.deposit_balance if card is not None else 0

    if deposit_balance < resolved.final_price:
        log_activity(db, studio_id, "client", title=f"Абонемент закончился у {client.name} {client.last_name or ''}".strip(),
                      entity_type="client", entity_id=client_id)
        return

    await attach_subscription(db, studio_id, client_id, package, None, mark_paid=True, price=0)
    await apply_deposit_change(client_id, studio_id, -resolved.final_price, "Автопродление абонемента", db)
    await register_purchase(db, studio_id, client_id, resolved.final_price)
    log_activity(db, studio_id, "client", title=f"Абонемент автопродлён (депозит): {client.name} {client.last_name or ''}".strip(),
                 entity_type="client", entity_id=client_id)


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
                await _try_auto_renew(db, ctx.studio_id, reservation.client_id, sub)

        await db.commit()
        await db.refresh(reservation)

        await notify(db, ctx.studio_id, "client", "c8",
                     {"client_id": reservation.client_id, "lesson_name": lesson.name})

        # Уведомления после коммита: остаток 1–2 → c5/a6; кончился/истёк → c6.
        if remaining is not None:
            if remaining in (1, 2):
                await notify(db, ctx.studio_id, "client", "c5",
                             {"client_id": reservation.client_id, "remaining": remaining})
                client = (await db.execute(
                    select(Client).where(Client.id == reservation.client_id)
                )).scalar_one_or_none()
                if client is not None:
                    await notify(db, ctx.studio_id, "admin", "a6", {
                        "client_name": f"{client.name} {client.last_name or ''}".strip(),
                        "remaining": remaining,
                    })
            elif remaining <= 0:
                await notify(db, ctx.studio_id, "client", "c6",
                             {"client_id": reservation.client_id, "remaining": 0})
    return ReservationRead.model_validate(reservation)
