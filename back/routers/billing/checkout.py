"""Создание платежа за тариф: выбор тарифа/периода → pending-счёт + ссылка Stripe.

Сумма считается ТОЛЬКО тут по каталогу (plans.py) — фронту не доверяем.
Каждый checkout — новый счёт; чужой или уже оплаченный не переиспользуем.

Деньги идут на платформенный аккаунт Velora (services/stripe_billing.py), а не
на аккаунт студии — приём оплат клиентов студии живёт отдельно, в кассе.
"""
import os
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from dependencies import require_role, StudioContext
from models import BillingInvoice, PaymentCard, StudioBillingPlan
from schemas.settings.billing import (
    CheckoutRequest, CheckoutResponse, RenewResponse,
    IbanCheckoutRequest, IbanCheckoutResponse,
)
from services import stripe_billing
from .plans import PLANS, PERIOD_DISCOUNTS, amount_for

router = APIRouter()

# Вебхук Stripe бьёт в бэкенд, возврат пользователя — во фронт. Оба публичные.
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000").rstrip("/")
WEB_APP_URL = os.getenv("WEB_APP_URL", "http://localhost:5173").rstrip("/")
_RETURN_URL = f"{WEB_APP_URL}/dashboard/billing?payment=return"

_NOT_CONFIGURED = {
    "code": "billing.stripe_not_configured",
    "message": "Приём оплат не настроен на сервере",
}


def _new_invoice(ctx: StudioContext, plan: str, period_months: int, **extra) -> BillingInvoice:
    """Pending-счёт по каталогу. Сумму берём только из plans.py (правило 6)."""
    return BillingInvoice(
        studio_id=ctx.studio_id,
        user_id=ctx.user.id,
        plan_name=plan,
        period_months=period_months,
        amount=amount_for(plan, period_months),
        status="pending",
        **extra,
    )


def _validate(plan: str, period_months: int) -> None:
    # Literal в схеме уже отсекает мусор до сюда; страховка на случай рассинхрона каталога.
    if plan not in PLANS or period_months not in PERIOD_DISCOUNTS:
        raise HTTPException(status_code=422, detail="Неизвестный план или период")


@router.post("/checkout", response_model=CheckoutResponse)
async def create_checkout(
    body: CheckoutRequest,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    if not stripe_billing.configured():
        raise HTTPException(status_code=503, detail=_NOT_CONFIGURED)
    _validate(body.plan, body.period_months)

    invoice = _new_invoice(ctx, body.plan, body.period_months)
    db.add(invoice)
    # Счёт коммитим ДО похода в Stripe: его id уезжает в metadata сессии и остаётся
    # единственной привязкой оплаты к счёту, если ответ Stripe потеряется по дороге.
    await db.commit()

    try:
        session_id, url = await stripe_billing.create_checkout(
            invoice_id=invoice.id,
            amount=invoice.amount,
            description=f"Velora {PLANS[body.plan]['name']}, {body.period_months} мес.",
            success_url=_RETURN_URL,
            cancel_url=f"{WEB_APP_URL}/dashboard/billing",
            customer_email=ctx.user.email,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail={
            "code": "billing.stripe_error", "message": "Stripe отклонил запрос",
        }) from exc

    invoice.order_id = session_id
    await db.commit()
    return CheckoutResponse(checkout_url=url)


def fake_iban(studio_id: int) -> str:
    # ponytail: фейковый IBAN для теста оплаты, не валидируется банком. Реальный — через провайдера.
    tail = f"{studio_id:018d}"[-18:]
    return f"DE{(studio_id * 97 % 89 + 10):02d}5001051000{tail[:10]}"


@router.post("/checkout/iban", response_model=IbanCheckoutResponse)
async def create_iban_checkout(
    body: IbanCheckoutRequest,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """IBAN-ветка оплаты: без платёжного шлюза — тестовый IBAN + pending-счёт,
    показывается в модалке для банковского перевода. В paid переводится вручную
    (реального шлюза для IBAN нет)."""
    _validate(body.plan, body.period_months)

    invoice = _new_invoice(ctx, body.plan, body.period_months, payment_method="iban")
    db.add(invoice)
    await db.flush()  # нужен invoice.id для назначения платежа

    # У перевода нет сессии Stripe — назначение платежа генерируем сами.
    invoice.order_id = f"velora-{invoice.id}-{uuid.uuid4()}"
    await db.commit()

    return IbanCheckoutResponse(
        invoice_id=invoice.id,
        invoice_number=f"INV-{datetime.utcnow().year}-{invoice.id:06d}",
        iban=fake_iban(ctx.studio_id),
        amount=invoice.amount,
        reference=invoice.order_id,
    )


@router.post("/renew", response_model=RenewResponse)
async def renew(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Продление по сохранённой карте без редиректа.

    Списываем на тот же план/период, что покупали в последний раз. В отличие от
    оплаты по ссылке итог известен сразу — вебхука не ждём, статус ставим здесь
    же общим apply_status. Крон-автосписания нет: это ручная кнопка, auto_renewal
    остаётся флагом для UI.
    """
    if not stripe_billing.configured():
        raise HTTPException(status_code=503, detail=_NOT_CONFIGURED)

    card = (await db.execute(
        select(PaymentCard).where(PaymentCard.user_id == ctx.user.id)
    )).scalar_one_or_none()
    if card is None or not card.rectoken or not card.stripe_customer_id:
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

    invoice = _new_invoice(ctx, plan.plan_name, last_paid.period_months, payment_method="card")
    db.add(invoice)
    await db.commit()

    try:
        intent_id, status = await stripe_billing.charge_saved_card(
            invoice_id=invoice.id,
            amount=invoice.amount,
            description=f"Velora {PLANS[plan.plan_name]['name']}, {invoice.period_months} мес. (продление)",
            customer_id=card.stripe_customer_id,
            payment_method_id=card.rectoken,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail={
            "code": "billing.stripe_error", "message": "Stripe отклонил запрос",
        }) from exc

    invoice.order_id = intent_id or invoice.order_id
    # Импорт здесь, а не сверху: webhook импортирует BACKEND_URL из этого модуля,
    # на уровне модуля вышел бы цикл.
    from .webhook import apply_status

    if status == "succeeded":
        await apply_status(db, invoice, "paid")
    else:
        # Отказ банка или требование 3-D Secure: карта off-session не проходит,
        # продлевать надо обычной оплатой по ссылке.
        await apply_status(db, invoice, "failed")
        raise HTTPException(status_code=402, detail={
            "code": "billing.card_declined",
            "message": "Банк отклонил списание — оплатите тариф обычным способом",
        })

    return RenewResponse(invoice_id=invoice.id)
