"""Конфиги 5 программ лояльности: карты, скидки, сертификаты, абонементы, рефералка.

Каждая программа — одна строка на студию (unique studio_id). При первом GET
строка создаётся с дефолтами модели (get-or-create). PATCH включает/настраивает.
Всё — только owner; чужая студия недоступна (скоуп по ctx.studio_id).
"""
from typing import Type, TypeVar

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from dependencies import require_role, StudioContext
from models import (
    StudioLoyaltyConfig,
    StudioDiscountConfig,
    StudioCertificateConfig,
    StudioReferralConfig,
)
from schemas.loyalty import (
    LoyaltyConfigRead, LoyaltyConfigUpdate,
    DiscountConfigRead, DiscountConfigUpdate,
    CertificateConfigRead, CertificateConfigUpdate,
    ReferralConfigRead, ReferralConfigUpdate,
)

router = APIRouter()

M = TypeVar("M")


async def _get_or_create(model: Type[M], studio_id: int, db: AsyncSession) -> M:
    """Строка конфига студии; создаём с дефолтами модели, если её ещё нет."""
    row = (await db.execute(
        select(model).where(model.studio_id == studio_id)
    )).scalar_one_or_none()
    if row is None:
        row = model(studio_id=studio_id)
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return row


async def _patch(model: Type[M], body: BaseModel, studio_id: int, db: AsyncSession) -> M:
    row = await _get_or_create(model, studio_id, db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    await db.commit()
    await db.refresh(row)
    return row


# ─── Карты лояльности ───────────────────────────────────────────────────────────
@router.get("/config", response_model=LoyaltyConfigRead)
async def get_loyalty_config(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    return await _get_or_create(StudioLoyaltyConfig, ctx.studio_id, db)


@router.patch("/config", response_model=LoyaltyConfigRead)
async def update_loyalty_config(
    body: LoyaltyConfigUpdate,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    return await _patch(StudioLoyaltyConfig, body, ctx.studio_id, db)


# ─── Скидки ─────────────────────────────────────────────────────────────────────
@router.get("/discounts", response_model=DiscountConfigRead)
async def get_discount_config(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    return await _get_or_create(StudioDiscountConfig, ctx.studio_id, db)


@router.patch("/discounts", response_model=DiscountConfigRead)
async def update_discount_config(
    body: DiscountConfigUpdate,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    return await _patch(StudioDiscountConfig, body, ctx.studio_id, db)


# ─── Сертификаты ────────────────────────────────────────────────────────────────
@router.get("/certificates-config", response_model=CertificateConfigRead)
async def get_certificate_config(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    return await _get_or_create(StudioCertificateConfig, ctx.studio_id, db)


@router.patch("/certificates-config", response_model=CertificateConfigRead)
async def update_certificate_config(
    body: CertificateConfigUpdate,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    return await _patch(StudioCertificateConfig, body, ctx.studio_id, db)


# Абонементы переехали в routers/loyalty/packages.py под /catalog (задача 19,
# V3-3) — раздел «Абонементы» теперь живёт в Каталоге, а не в Лояльности.


# ─── Рефералка ──────────────────────────────────────────────────────────────────
@router.get("/referral", response_model=ReferralConfigRead)
async def get_referral_config(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    return await _get_or_create(StudioReferralConfig, ctx.studio_id, db)


@router.patch("/referral", response_model=ReferralConfigRead)
async def update_referral_config(
    body: ReferralConfigUpdate,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    return await _patch(StudioReferralConfig, body, ctx.studio_id, db)
