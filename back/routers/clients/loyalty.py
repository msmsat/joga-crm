"""Баллы лояльности клиента: ручной бонус (кнопка «Бонус») и история.

Автоначисление при оплате живёт в `accrue_points` — его дёргает finances/operations.py
после создания доходной операции с client_id. Курс — points_exchange_rate из конфига
карт: баллы = amount / rate (рубли за 1 балл). Программа выключена → авто молча
пропускается, ручной бонус работает всегда.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from dependencies import require_role, StudioContext
from models import (
    Client, ClientLoyaltyCard, LoyaltyPointTransaction, StudioLoyaltyConfig,
)
from schemas.loyalty import BonusCreate, PointsBalanceRead, PointTransactionRead

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


async def _apply_points(
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


async def accrue_points(db: AsyncSession, studio_id: int, client_id: int, amount: int) -> None:
    """Автоначисление при оплате. Программа выключена → молча пропускаем.

    amount — сумма операции в копейках; rate — рубли за 1 балл. Не коммитит:
    вызывается внутри транзакции операции, коммитит вызывающий.
    """
    cfg = (await db.execute(
        select(StudioLoyaltyConfig).where(StudioLoyaltyConfig.studio_id == studio_id)
    )).scalar_one_or_none()
    if cfg is None or not cfg.is_enabled or cfg.points_exchange_rate <= 0:
        return
    points = (amount // 100) // cfg.points_exchange_rate  # копейки → рубли → баллы
    if points <= 0:
        return
    await _apply_points(client_id, studio_id, points, "Начисление за оплату", db)


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
    card = await _apply_points(client_id, ctx.studio_id, body.amount, body.description, db)
    await db.commit()
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
