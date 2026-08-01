"""Возвраты: владелец возвращает платёж за тариф, подписка откатывается.

POST инициирует возврат в Stripe; сам откат (счёт→refunded, expires_at −= период)
прилетает событием `charge.refunded` в вебхук — единственный источник истины.
Здесь только гварды доступа/состояния и вызов Stripe.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from dependencies import require_role, StudioContext
from models import BillingInvoice
from services import stripe_billing

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/invoices/{invoice_id}/refund")
async def refund_invoice(
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
    if not invoice.order_id:
        raise HTTPException(status_code=409, detail="У счёта нет платёжного заказа")

    # Возврат делается по платежу, а в счёте лежит id сессии — платёж достаём из неё.
    # Продление по сохранённой карте пишет сразу pi_… , сессии у него нет.
    try:
        if invoice.order_id.startswith("pi_"):
            payment_intent = invoice.order_id
        else:
            session = await stripe_billing.fetch_session(invoice.order_id)
            intent = getattr(session, "payment_intent", None)
            payment_intent = intent if isinstance(intent, str) else getattr(intent, "id", None)
        if not payment_intent:
            raise RuntimeError("в сессии нет платежа")
        await stripe_billing.refund(payment_intent)
    except Exception as exc:
        logger.exception("Возврат не удался, счёт %s", invoice.id)
        raise HTTPException(status_code=502, detail={
            "code": "billing.stripe_error", "message": "Stripe отклонил возврат",
        }) from exc

    # Статус НЕ меняем здесь — придёт charge.refunded. Фронт перезапросит /billing/invoices.
    return {"status": "ok"}
