"""Персональные скидки клиента — ClientOffer (V5-5, задача 2).

Оффер живёт в БД как реальный объект: значение, срок, использован ли —
вместо текста в письме. Источники: сценарий (`renewal_offer`, задача 3),
ручная выдача владельцем, будущая кампания. Погашается в той же транзакции,
что и продажа (задача 4) — здесь только CRUD и поиск активного оффера.
Всё — только owner, скоуп по ctx.studio_id.
"""
from datetime import date, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from dependencies import require_role, StudioContext
from models import Client, ClientOffer
from schemas.loyalty import ClientOfferCreate, ClientOfferRead

router = APIRouter()


@router.get("/offers", response_model=List[ClientOfferRead])
async def list_offers(
    client_id: Optional[int] = None,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    query = select(ClientOffer).where(ClientOffer.studio_id == ctx.studio_id)
    if client_id is not None:
        query = query.where(ClientOffer.client_id == client_id)
    rows = (await db.execute(query.order_by(ClientOffer.created_at.desc()))).scalars().all()
    return rows


@router.post("/offers", response_model=ClientOfferRead, status_code=201)
async def create_offer(
    body: ClientOfferCreate,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    client = (await db.execute(
        select(Client).where(Client.id == body.client_id, Client.studio_id == ctx.studio_id)
    )).scalar_one_or_none()
    if client is None:
        raise HTTPException(status_code=404, detail="Клиент не найден")

    offer = ClientOffer(
        studio_id=ctx.studio_id,
        client_id=body.client_id,
        discount_type=body.discount_type,
        value=body.value,
        reason="manual",
        scope=body.scope,
        valid_until=body.valid_until,
    )
    db.add(offer)
    await db.commit()
    await db.refresh(offer)
    return offer


@router.patch("/offers/{offer_id}/cancel", response_model=ClientOfferRead)
async def cancel_offer(
    offer_id: int,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    offer = (await db.execute(
        select(ClientOffer).where(
            ClientOffer.id == offer_id,
            ClientOffer.studio_id == ctx.studio_id,
        )
    )).scalar_one_or_none()
    if offer is None:
        raise HTTPException(status_code=404, detail="Оффер не найден")
    if offer.is_used:
        raise HTTPException(status_code=409, detail="Оффер уже использован")

    offer.is_used = True
    offer.used_at = datetime.utcnow()
    await db.commit()
    await db.refresh(offer)
    return offer


async def find_active_offer(
    studio_id: int, client_id: int, scope: str, db: AsyncSession,
) -> Optional[ClientOffer]:
    """Активный, не использованный, не просроченный оффер клиента в данном
    scope. Один клиент — один активный оффер на scope (см. задачу 3)."""
    return (await db.execute(
        select(ClientOffer).where(
            ClientOffer.studio_id == studio_id,
            ClientOffer.client_id == client_id,
            ClientOffer.scope == scope,
            ClientOffer.is_used.is_(False),
            (ClientOffer.valid_until.is_(None)) | (ClientOffer.valid_until >= date.today()),
        ).order_by(ClientOffer.created_at.desc())
    )).scalars().first()
