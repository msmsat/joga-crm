"""Уровни, карты клиентов и сводка страницы Лояльность (задача 3).

Уровни создаются дефолтными (Серебро/Золото/Платина) при первом GET. Карты
отдают балансы с именем клиента. Stats считает реальную выручку от держателей
карт за текущий месяц. Всё — только owner, скоуп по ctx.studio_id.
"""
from datetime import date
from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from dependencies import require_role, StudioContext
from models import Client, ClientLoyaltyCard, LoyaltyLevel, Operation
from schemas.loyalty import LoyaltyCardRead, LoyaltyLevelRead, LoyaltyStatsRead

router = APIRouter()

# Дефолтные уровни из формы LoyaltyConfig.tsx (пороги — сумма покупок в ₽).
DEFAULT_LEVELS = [
    {"name": "Серебро", "color": "#B0B0C0", "min_threshold": 0, "max_threshold": 10000, "sort_order": 0},
    {"name": "Золото", "color": "#F0C040", "min_threshold": 10000, "max_threshold": 50000, "sort_order": 1},
    {"name": "Платина", "color": "#FCAE91", "min_threshold": 50000, "max_threshold": None, "sort_order": 2},
]


async def _get_or_create_levels(studio_id: int, db: AsyncSession) -> List[LoyaltyLevel]:
    levels = (await db.execute(
        select(LoyaltyLevel)
        .where(LoyaltyLevel.studio_id == studio_id)
        .order_by(LoyaltyLevel.sort_order)
    )).scalars().all()
    if levels:
        return list(levels)
    levels = [LoyaltyLevel(studio_id=studio_id, **lvl) for lvl in DEFAULT_LEVELS]
    db.add_all(levels)
    await db.commit()
    for lvl in levels:
        await db.refresh(lvl)
    return levels


def _level_for(total_spent: int, levels: List[LoyaltyLevel]) -> int | None:
    """Уровень по сумме покупок против порогов. max_threshold=None — верхний уровень."""
    for lvl in levels:
        if total_spent >= lvl.min_threshold and (lvl.max_threshold is None or total_spent < lvl.max_threshold):
            return lvl.id
    return None


@router.get("/levels", response_model=List[LoyaltyLevelRead])
async def get_levels(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    return await _get_or_create_levels(ctx.studio_id, db)


@router.get("/cards", response_model=List[LoyaltyCardRead])
async def get_cards(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    levels = await _get_or_create_levels(ctx.studio_id, db)
    rows = (await db.execute(
        select(ClientLoyaltyCard, Client)
        .join(Client, Client.id == ClientLoyaltyCard.client_id)
        .where(ClientLoyaltyCard.studio_id == ctx.studio_id)
        .order_by(ClientLoyaltyCard.points_balance.desc())
    )).all()

    cards = []
    for card, client in rows:
        # Пересчёт уровня по актуальному total_spent против порогов.
        level_id = _level_for(card.total_spent, levels)
        if card.level_id != level_id:
            card.level_id = level_id
        name = f"{client.name} {client.last_name}".strip() if client.last_name else client.name
        cards.append(LoyaltyCardRead(
            id=card.id,
            client_id=card.client_id,
            client_name=name,
            points_balance=card.points_balance,
            total_spent=card.total_spent,
            level_id=level_id,
            created_at=card.created_at,
        ))
    await db.commit()
    return cards


@router.get("/stats", response_model=LoyaltyStatsRead)
async def get_stats(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    members = (await db.execute(
        select(func.count(ClientLoyaltyCard.id))
        .where(ClientLoyaltyCard.studio_id == ctx.studio_id)
    )).scalar_one()

    points = (await db.execute(
        select(func.coalesce(func.sum(ClientLoyaltyCard.points_balance), 0))
        .where(ClientLoyaltyCard.studio_id == ctx.studio_id)
    )).scalar_one()

    # Выручка от держателей карт = доходные операции клиентов с картой за текущий месяц.
    today = date.today()
    month_start = today.replace(day=1)
    member_ops = (
        select(Operation.amount)
        .join(ClientLoyaltyCard, ClientLoyaltyCard.client_id == Operation.client_id)
        .where(
            Operation.studio_id == ctx.studio_id,
            Operation.type == "in",
            Operation.op_date >= month_start,
        )
    ).subquery()
    revenue = (await db.execute(
        select(func.coalesce(func.sum(member_ops.c.amount), 0))
    )).scalar_one()
    op_count = (await db.execute(
        select(func.count()).select_from(member_ops)
    )).scalar_one()

    return LoyaltyStatsRead(
        members=members,
        points_in_circulation=points,
        revenue_from_members=revenue,
        avg_check=revenue // op_count if op_count else 0,
    )
