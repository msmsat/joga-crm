"""Уровни, карты клиентов и сводка страницы Лояльность (задача 3).

Уровни создаются дефолтными (Серебро/Золото/Платина) при первом GET. Карты
отдают балансы с именем клиента. Stats считает реальную выручку от держателей
карт за текущий месяц. Всё — только owner, скоуп по ctx.studio_id.
"""
from datetime import date, datetime, timedelta
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from dependencies import require_role, StudioContext
from models import Client, ClientLoyaltyCard, ClientOffer, GiftCertificate, Lesson, LoyaltyLevel, LoyaltyPointTransaction, Operation, ReferralRecord, Reservation, StudioPromoCode
from schemas.loyalty import (
    DepositStatsRead, DepositTopClient, LoyaltyCardRead, LoyaltyLevelRead, LoyaltyLevelsUpdate, LoyaltyLevelWrite, LoyaltyStatsRead,
)

router = APIRouter()

# Дефолтные уровни из формы LoyaltyConfig.tsx (пороги — сумма покупок в ₽).
DEFAULT_LEVELS = [
    {"name": "Серебро", "color": "#B0B0C0", "min_threshold": 0, "max_threshold": 10000, "sort_order": 0},
    {"name": "Золото", "color": "#F0C040", "min_threshold": 10000, "max_threshold": 50000, "sort_order": 1},
    {"name": "Платина", "color": "#FCAE91", "min_threshold": 50000, "max_threshold": None, "sort_order": 2},
]


async def _get_or_create_levels(studio_id: int, db: AsyncSession) -> List[LoyaltyLevel]:
    """НЕ коммитит — только flush (нужны id уровней). Вызывающий из GET-эндпоинта
    коммитит сам; вызывающий из чужой транзакции (register_purchase) не обязан
    видеть отдельный коммит здесь — это нарушило бы единую транзакцию оплаты."""
    levels = (await db.execute(
        select(LoyaltyLevel)
        .where(LoyaltyLevel.studio_id == studio_id)
        .order_by(LoyaltyLevel.sort_order)
    )).scalars().all()
    if levels:
        return list(levels)
    levels = [LoyaltyLevel(studio_id=studio_id, **lvl) for lvl in DEFAULT_LEVELS]
    db.add_all(levels)
    await db.flush()
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
    levels = await _get_or_create_levels(ctx.studio_id, db)
    await db.commit()
    return levels


def _validate_levels(levels: List[LoyaltyLevelWrite]) -> None:
    """Пороги непрерывны без дыр/перекрытий: первый с 0, последний с max=null,
    max[i] == min[i+1]. Список приходит уже отсортированным по sort_order."""
    if not levels:
        raise HTTPException(status_code=400, detail="Должен остаться хотя бы один уровень")
    if levels[0].min_threshold != 0:
        raise HTTPException(status_code=400, detail="Первый уровень должен начинаться с 0")
    if levels[-1].max_threshold is not None:
        raise HTTPException(status_code=400, detail="Последний уровень должен быть без верхней границы")
    for i in range(len(levels) - 1):
        cur, nxt = levels[i], levels[i + 1]
        if cur.max_threshold is None:
            raise HTTPException(status_code=400, detail=f"У уровня «{cur.name}» не может отсутствовать верхняя граница — он не последний")
        if cur.max_threshold != nxt.min_threshold:
            raise HTTPException(status_code=400, detail=f"Разрыв или перекрытие порогов между «{cur.name}» и «{nxt.name}»")


@router.put("/levels", response_model=List[LoyaltyLevelRead])
async def update_levels(
    body: LoyaltyLevelsUpdate,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    levels_in = sorted(body.levels, key=lambda lvl: lvl.sort_order)
    _validate_levels(levels_in)

    existing = (await db.execute(
        select(LoyaltyLevel).where(LoyaltyLevel.studio_id == ctx.studio_id)
    )).scalars().all()
    existing_by_id = {lvl.id: lvl for lvl in existing}
    kept_ids = {lvl.id for lvl in levels_in if lvl.id is not None}

    # Удалённые уровни: FK level_id → SET NULL на карточках клиентов; следующий
    # GET /cards пересчитает level_id заново по актуальным порогам (ничего не мигрируем).
    for lvl in existing:
        if lvl.id not in kept_ids:
            await db.delete(lvl)

    result: List[LoyaltyLevel] = []
    for lvl_in in levels_in:
        if lvl_in.id is not None and lvl_in.id in existing_by_id:
            row = existing_by_id[lvl_in.id]
            row.name = lvl_in.name
            row.color = lvl_in.color
            row.min_threshold = lvl_in.min_threshold
            row.max_threshold = lvl_in.max_threshold
            row.sort_order = lvl_in.sort_order
        else:
            row = LoyaltyLevel(
                studio_id=ctx.studio_id,
                name=lvl_in.name,
                color=lvl_in.color,
                min_threshold=lvl_in.min_threshold,
                max_threshold=lvl_in.max_threshold,
                sort_order=lvl_in.sort_order,
            )
            db.add(row)
        result.append(row)

    await db.commit()
    for row in result:
        await db.refresh(row)
    result.sort(key=lambda lvl: lvl.sort_order)
    return result


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
            deposit_balance=card.deposit_balance,
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

    certificates_sold = (await db.execute(
        select(func.count(GiftCertificate.id))
        .where(GiftCertificate.studio_id == ctx.studio_id)
    )).scalar_one()

    referrals_completed = (await db.execute(
        select(func.count(ReferralRecord.id))
        .where(ReferralRecord.studio_id == ctx.studio_id, ReferralRecord.status == "completed")
    )).scalar_one()

    active_promocodes = (await db.execute(
        select(func.count(StudioPromoCode.id))
        .where(StudioPromoCode.studio_id == ctx.studio_id, StudioPromoCode.is_active == True)  # noqa: E712
    )).scalar_one()

    deposit_clients = (await db.execute(
        select(func.count(ClientLoyaltyCard.id))
        .where(ClientLoyaltyCard.studio_id == ctx.studio_id, ClientLoyaltyCard.deposit_balance > 0)
    )).scalar_one()

    # Активные персональные скидки (V5-5, задача 7) — та же граница, что и
    # find_active_offer: не использован, не просрочен.
    active_offers = (await db.execute(
        select(func.count(ClientOffer.id))
        .where(
            ClientOffer.studio_id == ctx.studio_id,
            ClientOffer.is_used.is_(False),
            (ClientOffer.valid_until.is_(None)) | (ClientOffer.valid_until >= today),
        )
    )).scalar_one()

    # Вернулось клиентов: держатели карты с ≥2 посещённых занятий за последние 90 дней.
    since = datetime.combine(today - timedelta(days=90), datetime.min.time())
    returned_clients = (await db.execute(
        select(func.count())
        .select_from(
            select(Reservation.client_id)
            .join(Lesson, Lesson.id == Reservation.lesson_id)
            .join(ClientLoyaltyCard, ClientLoyaltyCard.client_id == Reservation.client_id)
            .where(
                ClientLoyaltyCard.studio_id == ctx.studio_id,
                Reservation.status == "attended",
                Lesson.start_time >= since,
            )
            .group_by(Reservation.client_id)
            .having(func.count() >= 2)
            .subquery()
        )
    )).scalar_one()

    # Стоимость бонусов: сумма начисленных (положительных) баллов за текущий месяц, 1 балл = 1 ₽.
    bonus_cost = (await db.execute(
        select(func.coalesce(func.sum(LoyaltyPointTransaction.points), 0))
        .where(
            LoyaltyPointTransaction.studio_id == ctx.studio_id,
            LoyaltyPointTransaction.points > 0,
            LoyaltyPointTransaction.created_at >= month_start,
        )
    )).scalar_one()

    return LoyaltyStatsRead(
        members=members,
        points_in_circulation=points,
        revenue_from_members=revenue,
        avg_check=revenue // op_count if op_count else 0,
        program_counters={
            "loyalty": members,
            "discounts": active_offers,
            "certificates": certificates_sold,
            "referral": referrals_completed,
            "promocodes": active_promocodes,
            "deposit": deposit_clients,
        },
        returned_clients=returned_clients,
        bonus_cost=bonus_cost,
        roi=round(revenue / bonus_cost, 2) if bonus_cost else 0.0,
    )


@router.get("/deposit-stats", response_model=DepositStatsRead)
async def get_deposit_stats(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    total_balance = (await db.execute(
        select(func.coalesce(func.sum(ClientLoyaltyCard.deposit_balance), 0))
        .where(ClientLoyaltyCard.studio_id == ctx.studio_id)
    )).scalar_one()

    rows = (await db.execute(
        select(ClientLoyaltyCard, Client)
        .join(Client, Client.id == ClientLoyaltyCard.client_id)
        .where(ClientLoyaltyCard.studio_id == ctx.studio_id, ClientLoyaltyCard.deposit_balance > 0)
        .order_by(ClientLoyaltyCard.deposit_balance.desc())
        .limit(5)
    )).all()
    top_clients = [
        DepositTopClient(
            client_id=card.client_id,
            client_name=f"{client.name} {client.last_name}".strip() if client.last_name else client.name,
            deposit_balance=card.deposit_balance,
        )
        for card, client in rows
    ]

    return DepositStatsRead(total_balance=total_balance, top_clients=top_clients)
