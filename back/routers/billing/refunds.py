"""Возвраты: владелец возвращает платёж за тариф, подписка откатывается.

POST инициирует возврат в Stripe; сам откат (счёт→refunded, expires_at −= период)
прилетает событием `charge.refunded` в вебхук — единственный источник истины.
Здесь только гварды доступа/состояния и вызов Stripe.
"""
import logging
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from ratelimit import limiter
from dependencies import require_role, StudioContext
from models import BillingInvoice
from services import stripe_billing

logger = logging.getLogger(__name__)
router = APIRouter()

# Самообслуживаемый возврат — ТОЛЬКО за тариф. Комиссия с офлайн-продаж
# (`offline_fee`) и минимальный месячный платёж (`min_fee`) — это оплата уже
# оказанной услуги, и вернуть их себе кнопкой значило бы стереть долг:
# `platform_fee.suspension_reason` не считает refunded-счёт блокирующим, а
# начисления (OfflineTransactionFee) уже помечены выставленными и во второй счёт
# не попадут. Владелец на тарифе «процент» оплачивал бы счёт, тут же возвращал
# деньги — и снимал с себя блокировку навсегда, ничего не заплатив.
REFUNDABLE_KIND = "subscription"

# Окно самообслуживаемого возврата. Без него оплаченный на 24 месяца тариф можно
# отработать двадцать месяцев и вернуть целиком: гварда по возрасту счёта не было
# вообще. 14 дней — то же окно, что даёт закон ЕС на отказ от цифровой услуги;
# позже возврат делает поддержка руками, решением человека.
REFUND_WINDOW_DAYS = 14


@router.post("/invoices/{invoice_id}/refund")
# Каждый вызов инициирует движение денег в Stripe. Возврат нажимают единицы раз,
# а не потоком; от двойного возврата защищает ключ идемпотентности ниже, лимит —
# только от зациклившегося ретрая.
@limiter.limit("10/minute")
async def refund_invoice(
    request: Request,
    invoice_id: int,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Возврат оплаченного счёта своей студии. 404 чужой/несуществующий, 409 не-paid."""
    invoice = (await db.execute(
        select(BillingInvoice).where(
            BillingInvoice.id == invoice_id,
            BillingInvoice.studio_id == ctx.studio_id,
        )
    )).scalar_one_or_none()
    if invoice is None:
        raise HTTPException(status_code=404, detail="Счёт не найден")

    # Возвращаем только оплаченный. refunded/pending/failed → 409 (второй refund тоже сюда).
    if invoice.status != "paid":
        raise HTTPException(status_code=409, detail="Возврат возможен только для оплаченного счёта")
    if invoice.kind != REFUNDABLE_KIND:
        raise HTTPException(status_code=409, detail={
            "code": "billing.refund_not_allowed",
            "message": "Возврат комиссии и минимального платежа — только через поддержку",
        })
    if invoice.paid_at is not None and invoice.paid_at < datetime.utcnow() - timedelta(days=REFUND_WINDOW_DAYS):
        raise HTTPException(status_code=409, detail={
            "code": "billing.refund_window_passed",
            "message": f"Вернуть оплату можно в течение {REFUND_WINDOW_DAYS} дней — напишите в поддержку",
        })
    if not invoice.stripe_invoice_id and not invoice.order_id:
        raise HTTPException(status_code=409, detail="У счёта нет платёжного заказа")

    # Возврат делается по платежу. У счетов подписки его достаём из Stripe
    # (services/stripe_billing.refund_target_for_invoice — карта даёт payment_intent,
    # IBAN/баланс даёт charge), у легаси-счетов разовой оплаты — по order_id
    # (pi_… продление по карте, cs_… обычная Checkout Session).
    try:
        if invoice.stripe_invoice_id:
            target = await stripe_billing.refund_target_for_invoice(invoice.stripe_invoice_id)
        elif invoice.order_id:
            target = await stripe_billing.refund_target_for_legacy_order(invoice.order_id)
        else:
            target = None
        if not target:
            raise RuntimeError("у счёта нет платежа, пригодного для возврата")
        # Ключ идемпотентности — по НАШЕМУ счёту: два нажатия «Вернуть» подряд и
        # ретрай после таймаута обязаны дать РОВНО ОДИН возврат. Гварда по статусу
        # выше это не обеспечивает: `refunded` проставляет вебхук, а он придёт уже
        # после того, как второй запрос уйдёт в Stripe.
        await stripe_billing.refund(target, idempotency_key=f"rf:{invoice.id}")
    except Exception as exc:
        logger.exception("Возврат не удался, счёт %s", invoice.id)
        raise HTTPException(status_code=502, detail={
            "code": "billing.stripe_error", "message": "Stripe отклонил возврат",
        }) from exc

    # Статус НЕ меняем здесь — придёт charge.refunded. Фронт перезапросит /billing/invoices.
    return {"status": "ok"}
