"""Списание и возврат занятия абонемента: −1 при записи на занятие, +1 при
любой отмене — кем бы она ни была сделана (клиент, тренер, админ, владелец) и
прошло занятие или нет.

Ссылка на списанный абонемент лежит в Reservation.subscription_id: возврат
всегда идёт ровно на тот абонемент, с которого списали, а обнуление ссылки
делает и списание, и возврат идемпотентными (повторный вызов ничего не меняет).

Ни одна функция не коммитит — вызывается внутри транзакции роутера.
"""
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from activity import log_activity
from models import (
    Client, ClientLoyaltyCard, ClientSubscription, Reservation,
    StudioSubscriptionProgramConfig, SubscriptionPackage,
)
from services.notifier import notify
from services.pricing import resolve_price


async def charge_reservation(
    db: AsyncSession, studio_id: int, reservation: Reservation, sub: Optional[ClientSubscription]
) -> Optional[int]:
    """−1 занятие с абонемента sub и привязка его к записи.

    Возвращает остаток занятий или None, если списывать нечего (абонемента нет —
    клиент платит разово) либо запись уже списана. Абонемент подбирает вызывающий
    (services.booking_access.find_eligible_subscription) — он знает тип занятия.
    """
    if sub is None or reservation.subscription_id is not None:
        return None

    sub.used_classes += 1
    reservation.subscription_id = sub.id
    remaining = sub.total_classes - sub.used_classes
    if remaining <= 0:
        sub.status = "finished"
        await _try_auto_renew(db, studio_id, reservation.client_id, sub)
    return remaining


async def refund_reservation(db: AsyncSession, reservation: Reservation) -> None:
    """+1 занятие назад на тот же абонемент при отмене записи.

    Записи без списания (разовые, старые) не трогает. Закончившийся абонемент
    снова становится активным — занятие ведь вернулось.
    """
    if reservation.subscription_id is None:
        return

    sub = await db.get(ClientSubscription, reservation.subscription_id)
    reservation.subscription_id = None  # снимаем ссылку до проверки — второй возврат уже no-op
    if sub is None:
        return

    sub.used_classes = max(0, sub.used_classes - 1)
    if sub.status == "finished" and sub.used_classes < sub.total_classes:
        sub.status = "active"


async def notify_subscription_remaining(
    db: AsyncSession, studio_id: int, client_id: int, remaining: Optional[int]
) -> None:
    """Остаток 1–2 → c5 клиенту и a6 админу; кончился → c6. Вызывать после commit."""
    if remaining is None:
        return
    if remaining in (1, 2):
        await notify(db, studio_id, "client", "c5", {"client_id": client_id, "remaining": remaining})
        client = (await db.execute(select(Client).where(Client.id == client_id))).scalar_one_or_none()
        if client is not None:
            await notify(db, studio_id, "admin", "a6", {
                "client_name": f"{client.name} {client.last_name or ''}".strip(),
                "remaining": remaining,
            })
    elif remaining <= 0:
        await notify(db, studio_id, "client", "c6", {"client_id": client_id, "remaining": 0})


async def _try_auto_renew(
    db: AsyncSession, studio_id: int, client_id: int, finished_sub: ClientSubscription
) -> None:
    """Автопродление абонемента за счёт депозита (V5-7, Блок 4.2). MVP без
    эквайринга: списываем цену пакета с депозита клиента, если хватает.
    Не хватает / выключено / пакет снят с продажи → только событие в ленте.
    # ponytail: автопродление только с депозита; автосписание с карты — эпик эквайринга
    """
    # Импорт внутри функции: services не должен тянуть routers на этапе импорта модуля.
    from routers.clients.loyalty import apply_deposit_change, register_purchase
    from routers.clients.subscriptions import attach_subscription

    if finished_sub.package_id is None:
        return

    config = (await db.execute(
        select(StudioSubscriptionProgramConfig).where(StudioSubscriptionProgramConfig.studio_id == studio_id)
    )).scalar_one_or_none()
    client = (await db.execute(select(Client).where(Client.id == client_id))).scalar_one()
    finished_title = f"Абонемент закончился у {client.name} {client.last_name or ''}".strip()

    if config is None or not config.auto_renewal:
        log_activity(db, studio_id, "client", title=finished_title, entity_type="client", entity_id=client_id)
        return

    package = (await db.execute(
        select(SubscriptionPackage).where(SubscriptionPackage.id == finished_sub.package_id)
    )).scalar_one_or_none()
    if package is None or not package.is_active:
        log_activity(db, studio_id, "client", title=finished_title, entity_type="client", entity_id=client_id)
        return

    resolved = await resolve_price(db, studio_id, client_id, package.price)
    card = (await db.execute(
        select(ClientLoyaltyCard).where(ClientLoyaltyCard.client_id == client_id)
    )).scalar_one_or_none()
    deposit_balance = card.deposit_balance if card is not None else 0

    if deposit_balance < resolved.final_price:
        log_activity(db, studio_id, "client", title=finished_title, entity_type="client", entity_id=client_id)
        return

    await attach_subscription(db, studio_id, client_id, package, None, mark_paid=True, price=0)
    await apply_deposit_change(client_id, studio_id, -resolved.final_price, "Автопродление абонемента", db)
    await register_purchase(db, studio_id, client_id, resolved.final_price)
    log_activity(db, studio_id, "client", title=f"Абонемент автопродлён (депозит): {client.name} {client.last_name or ''}".strip(),
                 entity_type="client", entity_id=client_id)
