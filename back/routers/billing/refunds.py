"""Возвраты (задача 6): владелец возвращает платёж, подписка откатывается.

POST инициирует Fondy reverse; сам откат (инвойс→refunded, expires_at −= период)
прилетает статусом `reversed` в вебхук (задача 5) — единственный источник истины.
Здесь только гварды доступа/состояния и вызов банка.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from dependencies import require_role, StudioContext
from models import BillingInvoice
from services import fondy

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

    await fondy.reverse(order_id=invoice.order_id, amount=invoice.amount)
    # Статус НЕ меняем здесь — придёт reversed-вебхук. Фронт перезапросит /billing/invoices.
    return {"status": "ok"}
