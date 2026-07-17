"""Вебхук Fondy (задача 5) — единственный источник истины о статусе платежа.

Публичный, без JWT (паттерн auth/register.py): банк не носит наш токен.
Порядок строгий: подпись → инвойс → идемпотентность → активация/провал.

Правила эпика: подпись на каждом вебхуке (неверная → 403, тело не трогаем);
идемпотентность по order_id (approved по уже paid-инвойсу → no-op, тариф
начисляется ровно один раз); на валидный вебхук ВСЕГДА 200 — 4xx/5xx заставит
Fondy ретраить и задвоит обработку при гонке.
"""
import logging

import calendar
from datetime import datetime

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import async_session_maker
from models import StudioBillingPlan, BillingInvoice, PaymentCard
from services import fondy
from .plans import PLANS

logger = logging.getLogger(__name__)
router = APIRouter()

# Fondy order_status: одна из этих строк приходит в теле вебхука.
_APPROVED = "approved"
_FAILED = {"declined", "expired"}
_REVERSED = "reversed"


def _add_months(dt: datetime, months: int) -> datetime:
    """dt ± months. Без dateutil: перенос года в обе стороны, день клампится к длине месяца."""
    month_index = dt.month - 1 + months
    year = dt.year + month_index // 12
    month = month_index % 12 + 1
    day = min(dt.day, calendar.monthrange(year, month)[1])
    return dt.replace(year=year, month=month, day=day)


@router.post("/webhook/fondy")
async def fondy_webhook(request: Request):
    """Колбэк Fondy. Тело — form-urlencoded или JSON, в зависимости от настройки мерчанта."""
    ct = request.headers.get("content-type", "")
    if "application/json" in ct:
        payload = await request.json()
    else:
        payload = dict(await request.form())

    # 1. Подпись. Неверная → 403, база не трогается (защита от фейкового «Оплачено»).
    if not fondy.verify_signature(payload):
        logger.warning("Fondy webhook: неверная подпись, order_id=%s", payload.get("order_id"))
        return JSONResponse(status_code=403, content={"detail": "invalid signature"})

    order_id = payload.get("order_id")
    order_status = payload.get("order_status")

    async with async_session_maker() as db:
        # 2. Найти инвойс. Нет — 200 + лог (банку нельзя отвечать 404 на мусор).
        invoice = (await db.execute(
            select(BillingInvoice).where(BillingInvoice.order_id == order_id)
        )).scalar_one_or_none()
        if invoice is None:
            logger.info("Fondy webhook: инвойс не найден order_id=%s status=%s", order_id, order_status)
            return {"status": "ok"}

        # 3. Идемпотентность: повтор конечного статуса по уже переведённому инвойсу → no-op.
        if invoice.status == "paid" and order_status == _APPROVED:
            logger.info("Fondy webhook: повтор approved по paid-инвойсу %s — no-op", order_id)
            return {"status": "ok"}
        if invoice.status == "refunded" and order_status == _REVERSED:
            logger.info("Fondy webhook: повтор reversed по refunded-инвойсу %s — no-op", order_id)
            return {"status": "ok"}

        if order_status == _APPROVED:
            await _activate(db, invoice, payload)
        elif order_status == _REVERSED:
            await _refund(db, invoice)
        elif order_status in _FAILED:
            invoice.status = "failed"
        else:
            # pending/created/processing и пр. — фиксировать нечего, отвечаем 200.
            logger.info("Fondy webhook: промежуточный статус %s order_id=%s", order_status, order_id)
            return {"status": "ok"}

        await db.commit()

    return {"status": "ok"}


async def _activate(db: AsyncSession, invoice: BillingInvoice, payload: dict) -> None:
    """approved → инвойс paid + активация/продление подписки + upsert карты."""
    invoice.status = "paid"
    invoice.paid_at = datetime.utcnow()
    invoice.payment_method = payload.get("payment_system") or "card"

    # Подписка студии: продлить от максимума (сейчас / текущий expires_at), чтобы
    # оплата активной подписки добавляла период, а не начинала его с now().
    plan = (await db.execute(
        select(StudioBillingPlan).where(StudioBillingPlan.studio_id == invoice.studio_id)
    )).scalar_one_or_none()

    now = datetime.utcnow()
    base = plan.expires_at if (plan and plan.expires_at and plan.expires_at > now) else now
    new_expires = _add_months(base, invoice.period_months)
    limits = PLANS.get(invoice.plan_name, {}).get("limits", {})
    max_staff = limits.get("staff") or 9999  # None (business) = безлимит; в колонке — «очень много»

    if plan is None:
        db.add(StudioBillingPlan(
            studio_id=invoice.studio_id,
            plan_name=invoice.plan_name,
            status="active",
            expires_at=new_expires,
            max_staff=max_staff,
        ))
    else:
        plan.plan_name = invoice.plan_name
        plan.status = "active"
        plan.expires_at = new_expires
        plan.max_staff = max_staff

    # Сохранённая карта из rectoken (upsert по user_id). Номера карт не видим —
    # только маску и токен для будущего продления (задача 7).
    rectoken = payload.get("rectoken")
    if rectoken and invoice.user_id:
        masked = payload.get("masked_card", "")
        card = (await db.execute(
            select(PaymentCard).where(PaymentCard.user_id == invoice.user_id)
        )).scalar_one_or_none()
        fields = dict(
            card_last4=masked[-4:] if masked else "----",
            card_brand=payload.get("card_type", "card"),
            card_expiry=payload.get("card_bin", "")[:5] or "--/--",
            rectoken=rectoken,
        )
        if card is None:
            db.add(PaymentCard(user_id=invoice.user_id, cardholder_name="", is_primary=True, **fields))
        else:
            for k, v in fields.items():
                setattr(card, k, v)


async def _refund(db: AsyncSession, invoice: BillingInvoice) -> None:
    """reversed → инвойс refunded + откат подписки (expires_at −= period_months).

    Если после отката срок в прошлом — подписка просрочена (status=expired):
    гейт 8b перестанет её пускать. plan_name не трогаем — тариф был этот.
    """
    invoice.status = "refunded"

    plan = (await db.execute(
        select(StudioBillingPlan).where(StudioBillingPlan.studio_id == invoice.studio_id)
    )).scalar_one_or_none()
    if plan and plan.expires_at:
        plan.expires_at = _add_months(plan.expires_at, -invoice.period_months)
        if plan.expires_at <= datetime.utcnow():
            plan.status = "expired"


if __name__ == "__main__":
    # Money-path self-check: _add_months на переносе года, клампе дня и високосном.
    d = datetime
    assert _add_months(d(2026, 1, 15), 12) == d(2027, 1, 15)
    assert _add_months(d(2026, 7, 12), 6) == d(2027, 1, 12)
    assert _add_months(d(2026, 1, 31), 1) == d(2026, 2, 28)   # кламп дня
    assert _add_months(d(2028, 1, 31), 1) == d(2028, 2, 29)   # високосный
    # откат возврата (задача 6): отрицательные месяцы — обратный перенос года.
    assert _add_months(d(2027, 1, 12), -6) == d(2026, 7, 12)
    assert _add_months(d(2026, 1, 15), -12) == d(2025, 1, 15)
    assert "/webhook/fondy" in [r.path for r in router.routes]
    print("webhook self-check ok")
