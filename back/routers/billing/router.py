"""Биллинг: каталог тарифов (источник истины о ценах) + чтение подписки студии.

Всё — только owner (ТЗ: раздел «Тариф и оплата» доступен владельцу).
Оплата/вебхуки/возвраты — отдельные задачи эпика 5; здесь только read + каталог.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from dependencies import require_role, StudioContext
from models import StudioBillingPlan, BillingInvoice, PaymentCard
from schemas.settings.billing import (
    PlansCatalogRead, PlanRead, PlanLimits,
    BillingPlanRead, InvoiceRead, PaymentCardRead,
)
from .plans import PLANS, PERIOD_DISCOUNTS
from .checkout import router as checkout_router
from .webhook import router as webhook_router
from .refunds import router as refunds_router

router = APIRouter()
router.include_router(checkout_router)
router.include_router(webhook_router)
router.include_router(refunds_router)


@router.get("/plans", response_model=PlansCatalogRead)
async def get_plans_catalog(
    ctx: StudioContext = Depends(require_role("owner")),
):
    """Каталог тарифов со скидками периодов. Статичен, но за require_role — как вся страница."""
    return PlansCatalogRead(
        plans=[
            PlanRead(id=pid, name=p["name"], price=p["price"], limits=PlanLimits(**p["limits"]))
            for pid, p in PLANS.items()
        ],
        period_discounts=PERIOD_DISCOUNTS,
    )


@router.get("/plan", response_model=BillingPlanRead)
async def get_current_plan(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Текущая подписка студии. Нет строки (до онбординга) → plan_name=none, без даты (задача 8b)."""
    row = (await db.execute(
        select(StudioBillingPlan).where(StudioBillingPlan.studio_id == ctx.studio_id)
    )).scalar_one_or_none()
    if row is None:
        return BillingPlanRead(
            plan_name="none", billing_cycle="monthly", status="none",
            expires_at=None, max_staff=0, auto_renewal=False,
        )
    return BillingPlanRead(
        plan_name=row.plan_name,
        billing_cycle=row.billing_cycle,
        status=row.status,
        expires_at=row.expires_at.isoformat() if row.expires_at else None,
        max_staff=row.max_staff,
        auto_renewal=row.auto_renewal,
    )


@router.get("/invoices", response_model=list[InvoiceRead])
async def get_invoices(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """История счетов студии, новые сверху. До первой оплаты — пусто."""
    rows = (await db.execute(
        select(BillingInvoice)
        .where(BillingInvoice.studio_id == ctx.studio_id)
        .order_by(BillingInvoice.id.desc())
    )).scalars().all()
    return [
        InvoiceRead(
            id=inv.id,
            plan_name=inv.plan_name,
            amount=inv.amount,
            payment_method=inv.payment_method,
            paid_at=inv.paid_at.isoformat() if inv.paid_at else None,
            status=inv.status,
            pdf_url=inv.pdf_url,
        )
        for inv in rows
    ]


@router.get("/cards", response_model=list[PaymentCardRead])
async def get_payment_cards(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Сохранённые карты владельца (из rectoken после первой оплаты, задача 5)."""
    rows = (await db.execute(
        select(PaymentCard).where(PaymentCard.user_id == ctx.user.id)
    )).scalars().all()
    return rows
