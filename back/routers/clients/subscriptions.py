"""Продажа абонемента клиенту (задача 5b).

Владелец продаёт клиенту пакет занятий → у клиента активный абонемент с остатком
и создаётся доходная операция категории «Абонементы» (та же, что триггерит баллы
задачи 4). Списание занятий — в PATCH .../attend (schedule/reservations.py).
"""
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from dependencies import require_role, StudioContext
from models import Account, Client, ClientSubscription, SubscriptionPackage
from routers.clients.loyalty import accrue_points
from schemas.clients.subscriptions import ClientSubscriptionRead, SubscriptionSaleCreate

router = APIRouter()

# ponytail: у SubscriptionPackage нет поля длительности — фиксированное окно 90 дней.
# Добавить duration_days в пакет и брать оттуда, если студиям понадобятся разные сроки.
_SUBSCRIPTION_VALID_DAYS = 90


def _to_read(sub: ClientSubscription) -> ClientSubscriptionRead:
    return ClientSubscriptionRead(
        id=sub.id,
        type=sub.type,
        total_classes=sub.total_classes,
        used_classes=sub.used_classes,
        remaining=sub.total_classes - sub.used_classes,
        expires_at=sub.expires_at.isoformat(),
        status=sub.status,
        is_frozen=sub.is_frozen,
    )


@router.post("/{client_id}/subscription", status_code=201, response_model=ClientSubscriptionRead)
async def sell_subscription(
    client_id: int,
    body: SubscriptionSaleCreate,
    ctx: StudioContext = Depends(require_role("owner", "admin")),
    db: AsyncSession = Depends(get_db),
):
    client = (await db.execute(
        select(Client).where(Client.id == client_id, Client.studio_id == ctx.studio_id)
    )).scalar_one_or_none()
    if client is None:
        raise HTTPException(status_code=404, detail="Клиент не найден")

    package = (await db.execute(
        select(SubscriptionPackage).where(
            SubscriptionPackage.id == body.package_id,
            SubscriptionPackage.studio_id == ctx.studio_id,
        )
    )).scalar_one_or_none()
    if package is None:
        raise HTTPException(status_code=404, detail="Пакет не найден")
    if not package.is_active:
        raise HTTPException(status_code=400, detail="Пакет снят с продажи")

    account = (await db.execute(
        select(Account).where(Account.id == body.account_id, Account.studio_id == ctx.studio_id)
    )).scalar_one_or_none()
    if account is None:
        raise HTTPException(status_code=404, detail="Счёт не найден")

    # Абонемент клиента: остаток = занятий в пакете, срок = фиксированное окно.
    sub = ClientSubscription(
        client_id=client_id,
        type=package.name,
        total_classes=package.class_count,
        used_classes=0,
        expires_at=date.today() + timedelta(days=_SUBSCRIPTION_VALID_DAYS),
        status="active",
    )
    db.add(sub)

    # Доходная операция «Абонементы» — она же триггерит начисление баллов (задача 4).
    from models import Operation  # локальный импорт: избегаем цикла на уровне модуля
    op = Operation(
        studio_id=ctx.studio_id,
        type="in",
        title=f"Абонемент «{package.name}»",
        amount=package.price,
        op_date=date.today(),
        category="Абонементы",
        method=body.payment_method,
        account_id=account.id,
        client_id=client_id,
    )
    db.add(op)
    account.balance += package.price
    await accrue_points(db, ctx.studio_id, client_id, package.price)

    await db.commit()
    await db.refresh(sub)
    return _to_read(sub)
