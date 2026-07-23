"""Промокоды и акции (V5-3, задача 3). Конфиг-программы нет: карточка
«включена», если у студии есть хотя бы один активный промокод. Код
нормализуется (trim + upper) на бэке — «лето25» и «ЛЕТО25 » совпадают.
Всё — только owner, скоуп по ctx.studio_id.
"""
from datetime import date
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from dependencies import require_role, StudioContext
from models import StudioPromoCode
from schemas.loyalty import PromoCodeCheck, PromoCodeCheckResult, PromoCodeCreate, PromoCodeRead
from services.discounts import apply_discount

router = APIRouter()


def _normalize(code: str) -> str:
    return code.strip().upper()


@router.get("/promocodes", response_model=List[PromoCodeRead])
async def list_promocodes(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(StudioPromoCode)
        .where(StudioPromoCode.studio_id == ctx.studio_id)
        .order_by(StudioPromoCode.created_at.desc())
    )).scalars().all()
    return rows


@router.post("/promocodes", response_model=PromoCodeRead, status_code=201)
async def create_promocode(
    body: PromoCodeCreate,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    code = _normalize(body.code)
    exists = (await db.execute(
        select(StudioPromoCode.id).where(
            StudioPromoCode.studio_id == ctx.studio_id,
            StudioPromoCode.code == code,
        )
    )).scalar_one_or_none()
    if exists is not None:
        raise HTTPException(status_code=409, detail="Такой промокод уже есть")

    promo = StudioPromoCode(
        studio_id=ctx.studio_id,
        code=code,
        discount_type=body.discount_type,
        value=body.value,
        valid_until=body.valid_until,
        usage_limit=body.usage_limit,
    )
    db.add(promo)
    await db.commit()
    await db.refresh(promo)
    return promo


@router.patch("/promocodes/{promo_id}/disable", response_model=PromoCodeRead)
async def disable_promocode(
    promo_id: int,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    promo = (await db.execute(
        select(StudioPromoCode).where(
            StudioPromoCode.id == promo_id,
            StudioPromoCode.studio_id == ctx.studio_id,
        )
    )).scalar_one_or_none()
    if promo is None:
        raise HTTPException(status_code=404, detail="Промокод не найден")
    promo.is_active = False
    await db.commit()
    await db.refresh(promo)
    return promo


async def find_valid_promo(studio_id: int, raw_code: str, db: AsyncSession) -> StudioPromoCode:
    code = _normalize(raw_code)
    promo = (await db.execute(
        select(StudioPromoCode).where(
            StudioPromoCode.studio_id == studio_id,
            StudioPromoCode.code == code,
        )
    )).scalar_one_or_none()
    if promo is None:
        raise HTTPException(status_code=404, detail="Промокод не найден")
    if not promo.is_active:
        raise HTTPException(status_code=400, detail="Промокод отключён")
    if promo.valid_until is not None and promo.valid_until < date.today():
        raise HTTPException(status_code=400, detail="Срок действия промокода истёк")
    if promo.usage_limit is not None and promo.used_count >= promo.usage_limit:
        raise HTTPException(status_code=400, detail="Лимит использований промокода исчерпан")
    return promo


@router.post("/promocodes/check", response_model=PromoCodeCheckResult)
async def check_promocode(
    body: PromoCodeCheck,
    ctx: StudioContext = Depends(require_role("owner", "admin")),
    db: AsyncSession = Depends(get_db),
):
    try:
        promo = await find_valid_promo(ctx.studio_id, body.code, db)
    except HTTPException as e:
        return PromoCodeCheckResult(valid=False, detail=e.detail)

    discount = apply_discount(promo, body.amount)
    return PromoCodeCheckResult(valid=True, discount=discount, final_amount=body.amount - discount)
