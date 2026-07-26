"""Биллинг: каталог тарифов (источник истины о ценах) + чтение подписки студии.

Всё — только owner (ТЗ: раздел «Тариф и оплата» доступен владельцу).
Оплата/вебхуки/возвраты — отдельные задачи эпика 5; здесь только read + каталог.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from dependencies import require_role, StudioContext
from models import StudioBillingPlan, BillingInvoice, PaymentCard
from schemas.settings.billing import (
    PlansCatalogRead, PlanRead, PlanLimits,
    BillingPlanRead, InvoiceRead, PaymentCardRead,
    ActivateModelRequest, AutopaySettingsUpdate,
)
from .plans import PLANS, PERIOD_DISCOUNTS, PERCENT_ONLY_RATE, COMBO_PERCENT_RATE, COMBO_FIXED
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


def _to_plan_read(row: StudioBillingPlan) -> BillingPlanRead:
    return BillingPlanRead(
        plan_name=row.plan_name,
        billing_cycle=row.billing_cycle,
        status=row.status,
        expires_at=row.expires_at.isoformat() if row.expires_at else None,
        max_staff=row.max_staff,
        auto_renewal=row.auto_renewal,
        billing_mode=row.billing_mode,
        percent_rate=row.percent_rate,
        fixed_base_amount=row.fixed_base_amount,
        notify_before_days=row.notify_before_days,
        notify_before_autocharge=row.notify_before_autocharge,
        email_receipt_enabled=row.email_receipt_enabled,
        sms_notification_enabled=row.sms_notification_enabled,
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
    return _to_plan_read(row)


@router.post("/model", response_model=BillingPlanRead)
async def activate_model(
    body: ActivateModelRequest,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Переключение тарифной модели (подписка / % / фикс+%). Оплата подписки — отдельно, через /checkout."""
    row = (await db.execute(
        select(StudioBillingPlan).where(StudioBillingPlan.studio_id == ctx.studio_id)
    )).scalar_one_or_none()
    if row is None:
        row = StudioBillingPlan(studio_id=ctx.studio_id, plan_name=body.plan or "pro")
        db.add(row)
    row.billing_mode = body.mode
    if body.mode == "percent":
        row.percent_rate, row.fixed_base_amount = PERCENT_ONLY_RATE, None
    elif body.mode == "combo":
        disc = PERIOD_DISCOUNTS[body.period_months or 1]
        row.percent_rate = COMBO_PERCENT_RATE
        row.fixed_base_amount = round(COMBO_FIXED[body.plan or "pro"] * (1 - disc))
        row.plan_name = body.plan or row.plan_name
    else:
        row.percent_rate = None
        row.fixed_base_amount = None
        row.plan_name = body.plan or row.plan_name
    await db.commit()
    await db.refresh(row)
    return _to_plan_read(row)


@router.patch("/autopay", response_model=BillingPlanRead)
async def update_autopay(
    body: AutopaySettingsUpdate,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Тумблеры вкладки «Способ оплаты» (частичный апдейт). Автосписание — только по карте (аудит §4)."""
    row = (await db.execute(
        select(StudioBillingPlan).where(StudioBillingPlan.studio_id == ctx.studio_id)
    )).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=400, detail="Нет активной подписки")

    if body.auto_renewal:
        card = (await db.execute(select(PaymentCard).where(
            PaymentCard.user_id == ctx.user.id, PaymentCard.method_type == "card"
        ))).scalar_one_or_none()
        if card is None:
            raise HTTPException(status_code=400, detail="Автосписание доступно только при оплате картой")

    for field in ("auto_renewal", "email_receipt_enabled", "notify_before_autocharge", "sms_notification_enabled"):
        value = getattr(body, field)
        if value is not None:
            setattr(row, field, value)

    await db.commit()
    await db.refresh(row)
    return _to_plan_read(row)


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
