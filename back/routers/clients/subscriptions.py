"""Продажа абонемента клиенту (задача 5b).

Владелец продаёт клиенту пакет занятий → у клиента активный абонемент с остатком
и создаётся доходная операция категории «Абонементы» (та же, что триггерит баллы
задачи 4). Списание занятий — в PATCH .../attend (schedule/reservations.py).
"""
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from dependencies import require_role, StudioContext
from activity import log_activity
from models import (
    Account, Client, ClientPayment, ClientSubscription, Operation,
    StudioSubscriptionProgramConfig, SubscriptionPackage,
)
from routers.clients.loyalty import accrue_points, register_purchase
from routers.finances.accounts import get_or_create_default_account
from routers.loyalty.promocodes import find_valid_promo
from schemas.clients.subscriptions import (
    ClientSubscriptionRead, ClientWallet, SubscriptionSaleCreate, SubscriptionTransferRequest,
)
from services.pricing import resolve_price

router = APIRouter()


async def attach_subscription(
    db: AsyncSession,
    studio_id: int,
    client_id: int,
    package: SubscriptionPackage,
    account: Account | None,
    *,
    mark_paid: bool,
    price: int | None = None,
    payment_method: str = "",
) -> ClientSubscription:
    """Создаёт активный абонемент клиенту и, если оплачен, проводит деньги в кассу.

    Общий кусок для продажи абонемента (`sell_subscription`) и создания клиента
    с сразу выбранным абонементом (`create_client`, CL-8.2). Не коммитит —
    вызывающий отвечает за единый commit всей транзакции.
    """
    price = package.price if price is None else price
    sub = ClientSubscription(
        client_id=client_id,
        type=package.name,
        total_classes=package.class_count,
        used_classes=0,
        expires_at=date.today() + timedelta(days=package.duration_days),
        status="active",
        package_id=package.id,  # V5-4 задача 7: для аналитики продлений
    )
    db.add(sub)

    if mark_paid:
        # price == 0 — весь абонемент погашен депозитом/сертификатом (V5-6, 1.1):
        # они уже проведены как доход при пополнении/выпуске, повторной Operation
        # на 0 ₽ заводить не нужно (двойной учёт выручки).
        if price > 0:
            op = Operation(
                studio_id=studio_id,
                type="in",
                title=f"Абонемент «{package.name}»",
                amount=price,
                op_date=date.today(),
                category="Абонементы",
                method=payment_method,
                account_id=account.id,
                client_id=client_id,
            )
            db.add(op)
            account.balance += price
        db.add(ClientPayment(
            client_id=client_id,
            amount=price,
            description=f"Абонемент «{package.name}»",
            status="success",
            action_type="subscription",
            item_key=str(package.id),
        ))
        await accrue_points(db, studio_id, client_id, price)
        await register_purchase(db, studio_id, client_id, price)

    return sub


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


@router.get("/{client_id}/wallet", response_model=ClientWallet)
async def get_wallet(
    client_id: int,
    ctx: StudioContext = Depends(require_role("owner", "admin")),
    db: AsyncSession = Depends(get_db),
):
    """Активные и архивные продукты клиента текущей студии (CL-6.5). «Разовые» —
    пустой список до первой покупки разового через кассу (CL-6.9)."""
    client = (await db.execute(
        select(Client.id).where(Client.id == client_id, Client.studio_id == ctx.studio_id)
    )).scalar_one_or_none()
    if client is None:
        raise HTTPException(status_code=404, detail="Клиент не найден")

    subs = (await db.execute(
        select(ClientSubscription).where(ClientSubscription.client_id == client_id)
    )).scalars().all()

    active, archived = [], []
    today = date.today()
    for sub in subs:
        # is_frozen не выводит в архив — заморозка временная, продукт остаётся
        # активным «на паузе» (карточка клиента показывает бейдж заморозки).
        is_active = (
            sub.status == "active"
            and sub.expires_at >= today
            and sub.used_classes < sub.total_classes
        )
        (active if is_active else archived).append(_to_read(sub))

    return ClientWallet(active=active, archived=archived)


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

    if body.account_id is None:
        account = await get_or_create_default_account(db, ctx.studio_id)
    else:
        account = (await db.execute(
            select(Account).where(Account.id == body.account_id, Account.studio_id == ctx.studio_id)
        )).scalar_one_or_none()
        if account is None:
            raise HTTPException(status_code=404, detail="Счёт не найден")

    # Цена (V5-5, задача 4): студийная скидка + персональный оффер + промокод,
    # самая выгодная клиенту (resolve_price) — не стек, если явно не включён.
    promo = None
    if body.promo_code:
        promo = await find_valid_promo(ctx.studio_id, body.promo_code, db)
    resolved = await resolve_price(db, ctx.studio_id, client_id, package.price, promo)

    sub = await attach_subscription(
        db, ctx.studio_id, client_id, package, account,
        mark_paid=True, price=resolved.final_price, payment_method=body.payment_method,
    )
    # Помечаем использованными в той же транзакции — гонка на «применили дважды» исключена.
    if resolved.promo is not None:
        resolved.promo.used_count += 1
    if resolved.offer is not None:
        resolved.offer.is_used = True
        resolved.offer.used_at = datetime.utcnow()

    await db.commit()
    await db.refresh(sub)
    return _to_read(sub)


@router.post("/{client_id}/subscriptions/{sub_id}/transfer", response_model=ClientSubscriptionRead)
async def transfer_subscription(
    client_id: int,
    sub_id: int,
    body: SubscriptionTransferRequest,
    ctx: StudioContext = Depends(require_role("owner", "admin")),
    db: AsyncSession = Depends(get_db),
):
    """Передать активный абонемент другому клиенту студии (V5-7, Блок 4.1)."""
    if body.target_client_id == client_id:
        raise HTTPException(status_code=400, detail={"code": "loyalty.transfer_self", "message": "Нельзя передать абонемент самому себе"})

    source = (await db.execute(
        select(Client).where(Client.id == client_id, Client.studio_id == ctx.studio_id)
    )).scalar_one_or_none()
    if source is None:
        raise HTTPException(status_code=404, detail="Клиент не найден")

    target = (await db.execute(
        select(Client).where(Client.id == body.target_client_id, Client.studio_id == ctx.studio_id)
    )).scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=404, detail="Получатель не найден")

    sub = (await db.execute(
        select(ClientSubscription).where(ClientSubscription.id == sub_id, ClientSubscription.client_id == client_id)
    )).scalar_one_or_none()
    if sub is None:
        raise HTTPException(status_code=404, detail="Абонемент не найден")
    today = date.today()
    if sub.status != "active" or sub.expires_at < today or sub.used_classes >= sub.total_classes:
        raise HTTPException(status_code=400, detail={"code": "loyalty.transfer_inactive", "message": "Абонемент не активен"})

    config = (await db.execute(
        select(StudioSubscriptionProgramConfig).where(StudioSubscriptionProgramConfig.studio_id == ctx.studio_id)
    )).scalar_one_or_none()
    if config is None or not config.allow_transfer:
        raise HTTPException(status_code=400, detail={"code": "loyalty.transfer_disabled", "message": "Передача абонементов выключена"})

    sub.client_id = body.target_client_id

    actor_name = f"{ctx.user.name} {ctx.user.last_name or ''}".strip()
    source_name = f"{source.name} {source.last_name or ''}".strip()
    target_name = f"{target.name} {target.last_name or ''}".strip()
    log_activity(
        db, ctx.studio_id, "client",
        title=f"Абонемент передан: {source_name} → {target_name}",
        actor_name=actor_name, entity_type="client", entity_id=source.id,
    )
    log_activity(
        db, ctx.studio_id, "client",
        title=f"Абонемент получен от {source_name}",
        actor_name=actor_name, entity_type="client", entity_id=target.id,
    )

    await db.commit()
    await db.refresh(sub)
    return _to_read(sub)
