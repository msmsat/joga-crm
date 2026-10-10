"""Именованные скидки студии (DiscountCampaign): список, охват групп, CRUD.

Программа «Скидки» (StudioDiscountConfig) — тумблер над всеми ними сразу;
правила, общие для всех (суммирование, кешбэк), живут там же —
routers/loyalty/configs.py. Применяет скидки движок цены
(services/pricing.resolve_price), здесь — только управление.

Создать действующую скидку — значит хотеть, чтобы скидки работали: новая
(и включённая обратно) скидка включает и программу. Иначе владелец, впервые
открывший раздел, заводил бы скидку, которая молча не применяется, — строка
программы создаётся выключенной при первом же чтении.

Всё — только owner, скоуп по ctx.studio_id. Чужие услуги, абонементы и
клиенты — 404, как несуществующие: не подсказываем, что такой id где-то есть.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from dependencies import require_role, StudioContext
from models import Client, DiscountCampaign, Service, StudioDiscountConfig, SubscriptionPackage
from schemas.loyalty import (
    DiscountCampaignCreate, DiscountCampaignRead, DiscountCampaignUpdate, DiscountReachRead,
)
from schemas.loyalty.discounts import DiscountClient
from services import discount_campaigns

router = APIRouter()


def _full_name(name: Optional[str], last_name: Optional[str]) -> str:
    return f"{name or ''} {last_name or ''}".strip()


async def _names(db: AsyncSession, studio_id: int, ids: set[int]) -> dict[int, str]:
    if not ids:
        return {}
    rows = (await db.execute(
        select(Client.id, Client.name, Client.last_name)
        .where(Client.studio_id == studio_id, Client.id.in_(ids))
    )).all()
    return {row.id: _full_name(row.name, row.last_name) for row in rows}


def _read(campaign: DiscountCampaign, names: dict[int, str], today) -> DiscountCampaignRead:
    return DiscountCampaignRead.model_validate(campaign).model_copy(update={
        # Удалённый клиент из скидки просто выпадает — карточка не показывает «?».
        "clients": [DiscountClient(id=cid, name=names[cid]) for cid in campaign.client_ids or [] if cid in names],
        "status": discount_campaigns.status(campaign, today),
    })


async def _one(db: AsyncSession, studio_id: int, campaign: DiscountCampaign) -> DiscountCampaignRead:
    today = await discount_campaigns.studio_today(db, studio_id)
    return _read(campaign, await _names(db, studio_id, set(campaign.client_ids or [])), today)


async def _check_owned(db: AsyncSession, studio_id: int, body: DiscountCampaignCreate) -> None:
    """Услуги, абонементы и клиенты — этой студии. Проверяем только то, что
    действует: список услуг у скидки «на всё» не применяется и хранится лишь
    как черновик выбора."""
    checks = (
        (Service, body.service_ids if body.applies_to == "selected" else [], "loyalty.discount_service_not_found",
         "Услуга не найдена"),
        (SubscriptionPackage, body.package_ids if body.applies_to == "selected" else [],
         "loyalty.discount_package_not_found", "Абонемент не найден"),
        (Client, body.client_ids if body.audience == "clients" else [], "loyalty.discount_client_not_found",
         "Клиент не найден"),
    )
    for model, ids, code, message in checks:
        if not ids:
            continue
        found = set((await db.execute(
            select(model.id).where(model.id.in_(ids), model.studio_id == studio_id)
        )).scalars().all())
        if found != set(ids):
            raise HTTPException(status_code=404, detail={"code": code, "message": message})


async def _enable_program(db: AsyncSession, studio_id: int) -> None:
    cfg = (await db.execute(
        select(StudioDiscountConfig).where(StudioDiscountConfig.studio_id == studio_id)
    )).scalar_one_or_none()
    if cfg is None:
        db.add(StudioDiscountConfig(studio_id=studio_id, is_enabled=True))
    elif not cfg.is_enabled:
        cfg.is_enabled = True


async def _get(db: AsyncSession, studio_id: int, campaign_id: int) -> DiscountCampaign:
    campaign = (await db.execute(
        select(DiscountCampaign).where(DiscountCampaign.id == campaign_id, DiscountCampaign.studio_id == studio_id)
    )).scalar_one_or_none()
    if campaign is None:
        raise HTTPException(status_code=404, detail={"code": "loyalty.discount_not_found", "message": "Скидка не найдена"})
    return campaign


@router.get("/discount-campaigns", response_model=List[DiscountCampaignRead])
async def list_discount_campaigns(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    campaigns = (await db.execute(
        select(DiscountCampaign)
        .where(DiscountCampaign.studio_id == ctx.studio_id)
        .order_by(DiscountCampaign.created_at.desc(), DiscountCampaign.id.desc())
    )).scalars().all()
    # Имена клиентов всех скидок — одним запросом, а не по запросу на скидку.
    names = await _names(db, ctx.studio_id, {cid for c in campaigns for cid in c.client_ids or []})
    today = await discount_campaigns.studio_today(db, ctx.studio_id)
    return [_read(c, names, today) for c in campaigns]


@router.get("/discount-campaigns/reach", response_model=DiscountReachRead)
async def discount_reach(
    segments: List[str] = Query(default=[]),
    birthday_window_days: int = Query(default=3, ge=0, le=30),
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Сколько клиентов в каждой группе сейчас и во всех выбранных вместе."""
    chosen = [s for s in segments if s in discount_campaigns.SEGMENT_KEYS]
    return DiscountReachRead(**await discount_campaigns.reach(db, ctx.studio_id, chosen, birthday_window_days))


@router.post("/discount-campaigns", response_model=DiscountCampaignRead, status_code=201)
async def create_discount_campaign(
    body: DiscountCampaignCreate,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    await _check_owned(db, ctx.studio_id, body)
    campaign = DiscountCampaign(studio_id=ctx.studio_id, **body.model_dump())
    db.add(campaign)
    if campaign.is_active:
        await _enable_program(db, ctx.studio_id)
    await db.commit()
    await db.refresh(campaign)
    return await _one(db, ctx.studio_id, campaign)


@router.patch("/discount-campaigns/{campaign_id}", response_model=DiscountCampaignRead)
async def update_discount_campaign(
    campaign_id: int,
    body: DiscountCampaignUpdate,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    campaign = await _get(db, ctx.studio_id, campaign_id)
    patch = body.model_dump(exclude_unset=True)
    current = DiscountCampaignCreate.model_fields.keys()
    try:
        merged = DiscountCampaignCreate(**{
            **{field: getattr(campaign, field) for field in current},
            **patch,
        })
    except ValidationError as exc:
        message = exc.errors()[0].get("msg", "").removeprefix("Value error, ")
        raise HTTPException(status_code=422, detail={"code": "loyalty.discount_invalid", "message": message})
    await _check_owned(db, ctx.studio_id, merged)
    was_active = campaign.is_active
    for field, value in merged.model_dump().items():
        setattr(campaign, field, value)
    if campaign.is_active and not was_active:
        await _enable_program(db, ctx.studio_id)
    await db.commit()
    await db.refresh(campaign)
    return await _one(db, ctx.studio_id, campaign)


@router.delete("/discount-campaigns/{campaign_id}", status_code=204)
async def delete_discount_campaign(
    campaign_id: int,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Удаление не трогает прошедших продаж: чек хранит сумму и название скидки
    снимком (services/reservation_payment.discount_lines)."""
    campaign = await _get(db, ctx.studio_id, campaign_id)
    await db.delete(campaign)
    await db.commit()
    return Response(status_code=204)
