"""Промокоды и акции (V5-3, задача 3). Конфиг-программы нет: карточка
«включена», если у студии есть хотя бы один активный промокод. Код
нормализуется (trim + upper) на бэке — «лето25» и «ЛЕТО25 » совпадают.
Всё — только owner, скоуп по ctx.studio_id.

Промокод бывает общим или выписанным одному клиенту (`client_id`), и действует
в периоде «с `valid_from` по `valid_until`» — обе границы включительно, любая
может быть пустой. Проверяет это `find_valid_promo` — единая точка для кассы,
продажи абонемента и шага оплаты записи.
"""
from datetime import date
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from dependencies import require_role, StudioContext
from models import Client, StudioPromoCode
from schemas.loyalty import PromoCodeCheck, PromoCodeCheckResult, PromoCodeCreate, PromoCodeRead
from services.discounts import apply_discount

router = APIRouter()


def _normalize(code: str) -> str:
    return code.strip().upper()


def _full_name(name: str | None, last_name: str | None) -> str | None:
    return f"{name or ''} {last_name or ''}".strip() or None


async def _read(db: AsyncSession, promo: StudioPromoCode) -> PromoCodeRead:
    """Промокод с именем клиента, на которого он выписан (одна строка)."""
    name = None
    if promo.client_id is not None:
        row = (await db.execute(
            select(Client.name, Client.last_name).where(Client.id == promo.client_id)
        )).one_or_none()
        name = _full_name(*row) if row is not None else None
    return PromoCodeRead.model_validate(promo).model_copy(update={"client_name": name})


@router.get("/promocodes", response_model=List[PromoCodeRead])
async def list_promocodes(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    # Имена клиентов — тем же запросом (outer join), а не по запросу на код.
    rows = (await db.execute(
        select(StudioPromoCode, Client.name, Client.last_name)
        .outerjoin(Client, Client.id == StudioPromoCode.client_id)
        .where(StudioPromoCode.studio_id == ctx.studio_id)
        .order_by(StudioPromoCode.created_at.desc())
    )).all()
    return [
        PromoCodeRead.model_validate(promo).model_copy(update={"client_name": _full_name(name, last_name)})
        for promo, name, last_name in rows
    ]


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

    if body.client_id is not None:
        # Клиент чужой студии для этой студии не существует: тот же ответ, что
        # и на несуществующий id, — не подсказываем, что такой id где-то есть.
        own = (await db.execute(
            select(Client.id).where(Client.id == body.client_id, Client.studio_id == ctx.studio_id)
        )).scalar_one_or_none()
        if own is None:
            raise HTTPException(status_code=404, detail="Клиент не найден")

    promo = StudioPromoCode(
        studio_id=ctx.studio_id,
        client_id=body.client_id,
        code=code,
        discount_type=body.discount_type,
        value=body.value,
        valid_from=body.valid_from,
        valid_until=body.valid_until,
        usage_limit=body.usage_limit,
    )
    db.add(promo)
    await db.commit()
    await db.refresh(promo)
    return await _read(db, promo)


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
    return await _read(db, promo)


async def find_valid_promo(
    studio_id: int, raw_code: str, db: AsyncSession, client_id: int | None = None,
) -> StudioPromoCode:
    """Действующий промокод студии по коду — или 404/400 с причиной.

    `client_id` — кто платит. Личный промокод другому клиенту (и продаже, где
    клиент не назван) не подходит: иначе код, выписанный Анне, работал бы у
    любого, кому она его перешлёт.
    """
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
    if promo.client_id is not None and promo.client_id != client_id:
        raise HTTPException(status_code=400, detail="Промокод выписан другому клиенту")
    today = date.today()
    if promo.valid_from is not None and promo.valid_from > today:
        raise HTTPException(status_code=400, detail="Промокод ещё не действует")
    if promo.valid_until is not None and promo.valid_until < today:
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
        promo = await find_valid_promo(ctx.studio_id, body.code, db, body.client_id)
    except HTTPException as e:
        return PromoCodeCheckResult(valid=False, detail=e.detail)

    discount = apply_discount(promo, body.amount)
    return PromoCodeCheckResult(valid=True, discount=discount, final_amount=body.amount - discount)
