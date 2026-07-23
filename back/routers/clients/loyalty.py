"""Баллы лояльности клиента: ручной бонус (кнопка «Бонус») и история.

Автоначисление при оплате живёт в `accrue_points` — его дёргает finances/operations.py
после создания доходной операции с client_id. Курс — points_exchange_rate из конфига
карт: баллы = amount / rate (рубли за 1 балл). Программа выключена → авто молча
пропускается, ручной бонус работает всегда.
"""
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from dependencies import require_role, StudioContext
from models import (
    Account, Client, ClientLoyaltyCard, DepositTransaction, LoyaltyPointTransaction, Operation,
    ReferralRecord, StudioDiscountConfig, StudioLoyaltyConfig, StudioReferralConfig,
)
from schemas.loyalty import (
    BonusCreate, DepositBalanceRead, DepositCreate, DepositTransactionRead, PointsBalanceRead, PointTransactionRead,
)
from services.notifier import send_telegram

router = APIRouter()


async def _get_or_create_card(client_id: int, studio_id: int, db: AsyncSession) -> ClientLoyaltyCard:
    card = (await db.execute(
        select(ClientLoyaltyCard).where(ClientLoyaltyCard.client_id == client_id)
    )).scalar_one_or_none()
    if card is None:
        card = ClientLoyaltyCard(client_id=client_id, studio_id=studio_id)
        db.add(card)
        await db.flush()  # нужен card для дальнейшего изменения баланса в той же транзакции
    return card


async def apply_points_change(
    client_id: int, studio_id: int, points: int, description: str, db: AsyncSession
) -> ClientLoyaltyCard:
    """Меняет баланс и пишет транзакцию. Минус на балансе — 400. НЕ коммитит."""
    card = await _get_or_create_card(client_id, studio_id, db)
    if card.points_balance + points < 0:
        raise HTTPException(status_code=400, detail="Недостаточно баллов на балансе")
    card.points_balance += points
    db.add(LoyaltyPointTransaction(
        studio_id=studio_id, client_id=client_id, points=points, description=description,
    ))
    return card


_EXPIRY_DAYS = {"3m": 90, "6m": 180, "1y": 365}


async def expire_points(db: AsyncSession, studio_id: int, client_id: int) -> int:
    """Ленивое сгорание баллов старше StudioLoyaltyConfig.expiry_period (V5-7,
    Блок 3). Без FIFO-леджера — агрегатная формула по LoyaltyPointTransaction:
    earned_old (начислено до cutoff) минус spent_total (списано когда-либо,
    включая прошлые сгорания) — эквивалент FIFO («любое списание гасит самые
    старые начисления»), идемпотентна: повторный вызов даёт 0. Не коммитит.
    """
    cfg = (await db.execute(
        select(StudioLoyaltyConfig).where(StudioLoyaltyConfig.studio_id == studio_id)
    )).scalar_one_or_none()
    if cfg is None or cfg.expiry_period not in _EXPIRY_DAYS:
        return 0

    cutoff = datetime.utcnow() - timedelta(days=_EXPIRY_DAYS[cfg.expiry_period])

    earned_old = (await db.execute(
        select(func.coalesce(func.sum(LoyaltyPointTransaction.points), 0)).where(
            LoyaltyPointTransaction.client_id == client_id,
            LoyaltyPointTransaction.points > 0,
            LoyaltyPointTransaction.created_at < cutoff,
        )
    )).scalar_one()
    spent_total = (await db.execute(
        select(func.coalesce(func.sum(LoyaltyPointTransaction.points), 0)).where(
            LoyaltyPointTransaction.client_id == client_id,
            LoyaltyPointTransaction.points < 0,
        )
    )).scalar_one()

    expired_now = max(0, earned_old + spent_total)  # spent_total <= 0
    if expired_now > 0:
        # ponytail: агрегатный lazy-expire вместо FIFO-леджера; помесячный breakdown — если попросят
        await apply_points_change(client_id, studio_id, -expired_now, "Сгорание баллов", db)
    return expired_now


async def accrue_points(db: AsyncSession, studio_id: int, client_id: int, amount: int) -> None:
    """Автоначисление при оплате. Программа выключена → молча пропускаем.

    amount — сумма операции в рублях; rate — рубли за 1 балл. Не коммитит:
    вызывается внутри транзакции операции, коммитит вызывающий.
    """
    cfg = (await db.execute(
        select(StudioLoyaltyConfig).where(StudioLoyaltyConfig.studio_id == studio_id)
    )).scalar_one_or_none()
    if cfg is None or not cfg.is_enabled or cfg.points_exchange_rate <= 0:
        return
    points = amount // cfg.points_exchange_rate  # рубли → баллы
    if points <= 0:
        return
    await apply_points_change(client_id, studio_id, points, "Начисление за оплату", db)


async def register_purchase(db: AsyncSession, studio_id: int, client_id: int, amount: int) -> None:
    """При успешной оплате: total_spent += amount, пересчёт уровня, кэшбек.

    amount — реально уплаченная сумма (после всех скидок/списаний). Не коммитит:
    вызывается внутри транзакции оплаты, коммитит вызывающий. Отдельно от
    accrue_points (баллы за оплату по курсу обмена) — это учёт для уровней
    (_level_for, cards.py) и кэшбек (отдельная механика, суммируются обе).
    """
    from routers.loyalty.cards import _get_or_create_levels, _level_for  # ponytail: локальный импорт разрывает цикл (как в pricing.py)

    if amount <= 0:
        return

    card = await _get_or_create_card(client_id, studio_id, db)
    card.total_spent += amount

    levels = await _get_or_create_levels(studio_id, db)
    card.level_id = _level_for(card.total_spent, levels)

    cfg = (await db.execute(
        select(StudioDiscountConfig).where(StudioDiscountConfig.studio_id == studio_id)
    )).scalar_one_or_none()
    if cfg is not None and cfg.is_enabled and cfg.discount_type == "cashback":
        cashback = amount * cfg.discount_value // 100
        # ponytail: единая ставка кэшбека из StudioDiscountConfig, ставки-per-level — когда появятся в UI
        if cashback > 0:
            await apply_points_change(client_id, studio_id, cashback, "Кэшбек", db)

    await _fire_referral_on_first_payment(db, studio_id, client_id)


async def _fire_referral_on_first_payment(db: AsyncSession, studio_id: int, client_id: int) -> None:
    """Триггер 'После первой оплаты' (StudioReferralConfig.trigger_condition ==
    'first_payment') — второй режим наряду с 'first_visit' (booking/public.py).
    bonus_paid гарантирует однократность так же, как у first_visit."""
    referral = (await db.execute(
        select(ReferralRecord).where(
            ReferralRecord.referred_client_id == client_id,
            ReferralRecord.status == "pending",
            ReferralRecord.bonus_paid == False,  # noqa: E712
        )
    )).scalar_one_or_none()
    if referral is None or referral.referrer_client_id is None:
        return

    cfg = (await db.execute(
        select(StudioReferralConfig).where(StudioReferralConfig.studio_id == studio_id)
    )).scalar_one_or_none()
    if cfg is None or not cfg.is_enabled or cfg.trigger_condition != "first_payment" or cfg.referrer_bonus <= 0:
        return

    description = "Реферальный бонус за приглашение"
    if cfg.bonus_type == "points":
        await apply_points_change(referral.referrer_client_id, studio_id, cfg.referrer_bonus, description, db)
    else:
        await apply_deposit_change(referral.referrer_client_id, studio_id, cfg.referrer_bonus, description, db)
    referral.status = "completed"
    referral.bonus_paid = True


async def apply_deposit_change(
    client_id: int, studio_id: int, amount: int, description: str, db: AsyncSession
) -> ClientLoyaltyCard:
    """Меняет баланс депозита и пишет транзакцию. Минус на балансе — 400. НЕ коммитит.

    Используется и HTTP-эндпоинтом пополнения/списания, и реферальным бонусом
    (booking/public.py) — там кассового счёта нет, это не платёж, а бонус.
    """
    card = await _get_or_create_card(client_id, studio_id, db)
    if card.deposit_balance + amount < 0:
        raise HTTPException(status_code=400, detail="Недостаточно средств на депозите")
    card.deposit_balance += amount
    db.add(DepositTransaction(
        studio_id=studio_id, client_id=client_id, amount=amount, description=description,
    ))
    return card


async def _client_or_404(client_id: int, studio_id: int, db: AsyncSession) -> None:
    exists = (await db.execute(
        select(Client.id).where(Client.id == client_id, Client.studio_id == studio_id)
    )).scalar_one_or_none()
    if exists is None:
        raise HTTPException(status_code=404, detail="Клиент не найден")


@router.post("/{client_id}/bonus", status_code=201, response_model=PointsBalanceRead)
async def add_bonus(
    client_id: int,
    body: BonusCreate,
    ctx: StudioContext = Depends(require_role("owner", "admin")),
    db: AsyncSession = Depends(get_db),
):
    await _client_or_404(client_id, ctx.studio_id, db)
    await expire_points(db, ctx.studio_id, client_id)
    card = await apply_points_change(client_id, ctx.studio_id, body.amount, body.description, db)
    await db.commit()

    tg_id = (await db.execute(
        select(Client.tg_id).where(Client.id == client_id, Client.studio_id == ctx.studio_id)
    )).scalar_one_or_none()
    if tg_id:
        await send_telegram(tg_id, f"Вам начислено {body.amount} баллов: {body.description}")

    return PointsBalanceRead(points_balance=card.points_balance)


@router.get("/{client_id}/loyalty-history", response_model=list[PointTransactionRead])
async def loyalty_history(
    client_id: int,
    ctx: StudioContext = Depends(require_role("owner", "admin")),
    db: AsyncSession = Depends(get_db),
):
    await _client_or_404(client_id, ctx.studio_id, db)
    rows = (await db.execute(
        select(LoyaltyPointTransaction)
        .where(
            LoyaltyPointTransaction.client_id == client_id,
            LoyaltyPointTransaction.studio_id == ctx.studio_id,
        )
        .order_by(LoyaltyPointTransaction.created_at.desc(), LoyaltyPointTransaction.id.desc())
    )).scalars().all()
    return rows


@router.post("/{client_id}/deposit", status_code=201, response_model=DepositBalanceRead)
async def apply_deposit(
    client_id: int,
    body: DepositCreate,
    ctx: StudioContext = Depends(require_role("owner", "admin")),
    db: AsyncSession = Depends(get_db),
):
    """Пополнение (amount > 0) или списание (amount < 0) депозита. В минус — 400.
    Пополнение через кассу создаёт доходную операцию (образец — продажа абонемента)."""
    await _client_or_404(client_id, ctx.studio_id, db)

    account = None
    if body.amount > 0:
        if body.account_id is None:
            raise HTTPException(status_code=400, detail="При пополнении нужно указать счёт")
        account = (await db.execute(
            select(Account).where(Account.id == body.account_id, Account.studio_id == ctx.studio_id)
        )).scalar_one_or_none()
        if account is None:
            raise HTTPException(status_code=404, detail="Счёт не найден")

    card = await apply_deposit_change(client_id, ctx.studio_id, body.amount, body.description, db)

    if account is not None:
        db.add(Operation(
            studio_id=ctx.studio_id,
            type="in",
            title=body.description,
            amount=body.amount,
            op_date=date.today(),
            category="Депозит",
            method="",
            account_id=account.id,
            client_id=client_id,
        ))
        account.balance += body.amount

    await db.commit()
    return DepositBalanceRead(deposit_balance=card.deposit_balance)


@router.get("/{client_id}/deposit-history", response_model=list[DepositTransactionRead])
async def deposit_history(
    client_id: int,
    ctx: StudioContext = Depends(require_role("owner", "admin")),
    db: AsyncSession = Depends(get_db),
):
    await _client_or_404(client_id, ctx.studio_id, db)
    rows = (await db.execute(
        select(DepositTransaction)
        .where(
            DepositTransaction.client_id == client_id,
            DepositTransaction.studio_id == ctx.studio_id,
        )
        .order_by(DepositTransaction.created_at.desc(), DepositTransaction.id.desc())
    )).scalars().all()
    return rows
