"""Создание платежа (задача 4): выбор тарифа/периода → pending-инвойс + ссылка Fondy.

Сумма считается ТОЛЬКО тут по каталогу (plans.py) — фронту не доверяем (правило 6).
Каждый checkout — новый инвойс с уникальным order_id `velora-{invoice_id}-{uuid4}`;
старые pending протухают у Fondy сами, order_id не переиспользуем (правило 4).
"""
import os
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from dependencies import require_role, StudioContext
from models import BillingInvoice, PaymentCard, StudioBillingPlan
from schemas.settings.billing import CheckoutRequest, CheckoutResponse, RenewResponse
from services import fondy
from .plans import PLANS, PERIOD_DISCOUNTS, amount_for

router = APIRouter()

# Вебхук Fondy бьёт в бэкенд, redirect юзера — во фронт. Оба нужны публичными.
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000").rstrip("/")
WEB_APP_URL = os.getenv("WEB_APP_URL", "http://localhost:5173").rstrip("/")


@router.post("/checkout", response_model=CheckoutResponse)
async def create_checkout(
    body: CheckoutRequest,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    # Literal в схеме уже отсекает мусор до сюда; страховка на случай рассинхрона каталога.
    if body.plan not in PLANS or body.period_months not in PERIOD_DISCOUNTS:
        raise HTTPException(status_code=422, detail="Неизвестный план или период")

    amount = amount_for(body.plan, body.period_months)

    invoice = BillingInvoice(
        studio_id=ctx.studio_id,
        user_id=ctx.user.id,
        plan_name=body.plan,
        period_months=body.period_months,
        amount=amount,
        status="pending",
    )
    db.add(invoice)
    await db.flush()  # нужен invoice.id для order_id

    invoice.order_id = f"velora-{invoice.id}-{uuid.uuid4()}"
    await db.commit()

    checkout_url = await fondy.create_checkout(
        order_id=invoice.order_id,
        amount=amount,
        description=f"Velora {PLANS[body.plan]['name']}, {body.period_months} мес.",
        server_callback_url=f"{BACKEND_URL}/billing/webhook/fondy",
        response_url=f"{WEB_APP_URL}/dashboard/billing?payment=return",
    )
    return CheckoutResponse(checkout_url=checkout_url)


@router.post("/renew", response_model=RenewResponse)
async def renew(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Продление по сохранённой карте без редиректа (задача 7).

    Списываем rectoken на тот же план/период, что покупали в последний раз; итог
    (approved/declined) прилетит в тот же вебхук, что и обычная оплата. Крон-
    автосписания нет — это ручная кнопка; auto_renewal остаётся флагом для UI.
    """
    card = (await db.execute(
        select(PaymentCard).where(PaymentCard.user_id == ctx.user.id)
    )).scalar_one_or_none()
    if card is None or not card.rectoken:
        raise HTTPException(status_code=400, detail="Нет сохранённой карты для продления")

    # Что продлеваем: план — из текущей подписки, период/сумму — из последней оплаты.
    plan = (await db.execute(
        select(StudioBillingPlan).where(StudioBillingPlan.studio_id == ctx.studio_id)
    )).scalar_one_or_none()
    last_paid = (await db.execute(
        select(BillingInvoice)
        .where(BillingInvoice.studio_id == ctx.studio_id, BillingInvoice.status == "paid")
        .order_by(BillingInvoice.id.desc())
    )).scalars().first()
    if plan is None or last_paid is None or plan.plan_name not in PLANS:
        raise HTTPException(status_code=400, detail="Нет активной подписки для продления")

    period_months = last_paid.period_months
    amount = amount_for(plan.plan_name, period_months)

    invoice = BillingInvoice(
        studio_id=ctx.studio_id,
        user_id=ctx.user.id,
        plan_name=plan.plan_name,
        period_months=period_months,
        amount=amount,
        status="pending",
    )
    db.add(invoice)
    await db.flush()  # нужен invoice.id для order_id

    invoice.order_id = f"velora-{invoice.id}-{uuid.uuid4()}"
    await db.commit()

    await fondy.recurring(
        order_id=invoice.order_id,
        amount=amount,
        description=f"Velora {PLANS[plan.plan_name]['name']}, {period_months} мес. (продление)",
        rectoken=card.rectoken,
        server_callback_url=f"{BACKEND_URL}/billing/webhook/fondy",
    )
    return RenewResponse(invoice_id=invoice.id)
