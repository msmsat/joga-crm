"""Вебхук Stripe по оплате тарифа — единственный источник истины о статусе платежа.

Публичный, без JWT (Stripe наш токен не носит) и без гейта подписки: просроченный
тариф не повод потерять оплату, которой его и продлевают.

Порядок строгий: подпись → счёт → сверка суммы → идемпотентность → активация.
На валидное событие ВСЕГДА 200 — 4xx/5xx заставит Stripe ретраить, а обработка
уже прошла (тот же принцип, что в вебхуке кассы).
"""
import logging

import calendar
from datetime import datetime

from fastapi import APIRouter, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import async_session_maker
from models import StudioBillingPlan, BillingInvoice, PaymentCard
from services import stripe_billing
from .checkout import BACKEND_URL
from .plans import PLANS

logger = logging.getLogger(__name__)
router = APIRouter()

# `completed` — обычная карта. `async_payment_succeeded` — отложенные методы
# (банковский перевод): у них completed приходит ещё неоплаченным, и без второго
# типа события такая оплата не активировала бы тариф никогда.
_PAID_EVENTS = ("checkout.session.completed", "checkout.session.async_payment_succeeded")
# Денег не будет: страница протухла или банк отказал по отложенному методу.
_DEAD_EVENTS = ("checkout.session.expired", "checkout.session.async_payment_failed")
# Деньги вернулись (возврат из дашборда Stripe или наш POST /refund).
_REFUND_EVENT = "charge.refunded"


def _add_months(dt: datetime, months: int) -> datetime:
    """dt ± months. Без dateutil: перенос года в обе стороны, день клампится к длине месяца."""
    month_index = dt.month - 1 + months
    year = dt.year + month_index // 12
    month = month_index % 12 + 1
    day = min(dt.day, calendar.monthrange(year, month)[1])
    return dt.replace(year=year, month=month, day=day)


def amount_matches(invoice: BillingInvoice, amount_total: int | None, currency: str | None) -> bool:
    """Заплатили ровно за этот счёт и в его валюте.

    Подпись доказывает, что событие от Stripe, но не то, что заплатили сколько
    просили: без сверки оплата на 1 крону активировала бы Business на два года.
    Поля, которого в событии нет, не проверяем — иначе сокращённый ответ сломал
    бы активацию честно оплаченного счёта.
    """
    if amount_total is not None and int(amount_total) != invoice.amount:
        logger.error(
            "Stripe billing: сумма не сходится по счёту %s — пришло %s, ожидалось %s",
            invoice.id, amount_total, invoice.amount,
        )
        return False
    if currency is not None and str(currency).lower() != stripe_billing.CURRENCY:
        logger.error(
            "Stripe billing: валюта не сходится по счёту %s — пришло %s, ожидалось %s",
            invoice.id, currency, stripe_billing.CURRENCY,
        )
        return False
    return True


async def find_invoice(db: AsyncSession, session) -> BillingInvoice | None:
    """Счёт по событию. Ищем по metadata.invoice_id, а не по session_id: его мы
    узнаём только из ответа Stripe, и запись в БД могла не доехать — счёт от
    этого не перестаёт существовать.

    Только getattr: у StripeObject нет `.get()`, а подписка `[...]` на
    отсутствующем ключе кидает KeyError — и то и другое уронило бы разбор события
    с деньгами. Тот же капкан описан в stripe_connect.account_status.
    """
    metadata = getattr(session, "metadata", None)
    invoice_id = getattr(metadata, "invoice_id", None) if metadata is not None else None
    if not invoice_id:
        logger.info("Stripe billing: в событии нет metadata.invoice_id")
        return None
    return (await db.execute(
        select(BillingInvoice).where(BillingInvoice.id == int(invoice_id))
    )).scalar_one_or_none()


@router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    """Колбэк Stripe по оплате тарифа."""
    event = stripe_billing.parse_webhook(
        await request.body(), request.headers.get("stripe-signature", ""),
    )
    if event is None:
        return {"status": "ignored"}

    # Тариф платят ПЛАТФОРМЕ, и событий подключённых аккаунтов тут быть не может.
    # У них заполнено `account`, а metadata в сессии на своём аккаунте задаёт его
    # владелец — без этой проверки студия выписывала бы себе оплаченный счёт,
    # заплатив ту же сумму самой себе (деньги садятся на её же баланс). Та же
    # проверка живёт в кассе: checkout/stripe_pay.py, apply_paid.
    connected = getattr(event, "account", None)
    if connected:
        logger.warning("Stripe billing: событие подключённого аккаунта %s отброшено", connected)
        return {"status": "ignored"}

    # У StripeObject (stripe 15.x) НЕТ метода .get() — это не dict. Обращение к
    # возможно отсутствующему полю только через getattr с дефолтом, иначе
    # AttributeError роняет хендлер в 500, и Stripe трое суток ретраит впустую.
    obj = event["data"]["object"]
    event_type = event["type"]

    async with async_session_maker() as db:
        if event_type in _PAID_EVENTS:
            # Оплата может быть отложенной — активируем только когда деньги списаны.
            if getattr(obj, "payment_status", None) != "paid":
                return {"status": "ok"}
            invoice = await find_invoice(db, obj)
            if invoice is None:
                logger.info("Stripe billing: счёт по событию %s не найден", obj["id"])
                return {"status": "ok"}
            if not amount_matches(invoice, getattr(obj, "amount_total", None), getattr(obj, "currency", None)):
                return {"status": "ok"}
            await apply_status(db, invoice, "paid", session_id=obj["id"])

        elif event_type in _DEAD_EVENTS:
            invoice = await find_invoice(db, obj)
            if invoice is not None:
                await apply_status(db, invoice, "failed")

        elif event_type == _REFUND_EVENT:
            # Здесь приходит Charge, а не Session: счёт ищем по metadata платежа,
            # которую мы прокинули в payment_intent_data при создании оплаты.
            invoice = await find_invoice(db, obj)
            if invoice is not None:
                await apply_status(db, invoice, "refunded")

    return {"status": "ok"}


async def apply_status(
    db: AsyncSession, invoice: BillingInvoice, status: str, *, session_id: str | None = None,
) -> bool:
    """Переводит счёт в статус, подтверждённый Stripe. True — если что-то изменилось.

    Общая точка вебхука, ручной сверки (POST /invoices/{id}/sync) и продления по
    сохранённой карте: переход один и тот же, откуда бы правда ни пришла.
    Идемпотентно — повтор конечного статуса по уже переведённому счёту ничего не
    делает, поэтому ретраи Stripe не начисляют тариф дважды.
    """
    if invoice.status == status:
        return False
    # Оплаченный счёт назад в failed не роняем: expired-событие по брошенной
    # вкладке может прийти уже ПОСЛЕ успешной оплаты с другого устройства.
    if invoice.status == "paid" and status == "failed":
        return False
    # Возврат — конечное состояние. Сессия у Stripe так и осталась payment_status=paid,
    # поэтому без этой строки «Сверить» (POST /invoices/{id}/sync) по возвращённому
    # счёту начисляло бы период второй раз — уже без денег.
    if invoice.status == "refunded":
        return False

    if status == "paid":
        await _activate(db, invoice, session_id)
    elif status == "refunded":
        await _refund(db, invoice)
    elif status == "failed":
        invoice.status = "failed"
    else:
        return False

    await db.commit()
    return True


async def _activate(db: AsyncSession, invoice: BillingInvoice, session_id: str | None) -> None:
    """paid → счёт оплачен + активация/продление подписки + сохранение карты."""
    invoice.status = "paid"
    invoice.paid_at = datetime.utcnow()
    invoice.payment_method = invoice.payment_method or "card"
    if session_id:
        invoice.order_id = session_id
    # Гарантированный чек (эпик B5): свой receipt_url провайдера мы получим только
    # запросом, поэтому по умолчанию — наш эндпоинт. Идемпотентно, не перезаписываем.
    if not invoice.pdf_url:
        invoice.pdf_url = f"{BACKEND_URL}/billing/invoices/{invoice.id}/receipt.pdf"

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

    if session_id and invoice.user_id:
        await _save_card(db, invoice, session_id)


async def _save_card(db: AsyncSession, invoice: BillingInvoice, session_id: str) -> None:
    """Карта из завершённой сессии (upsert по user_id) — для кнопки «Продлить».

    Номера карт мы не видим и не храним: только маску, бренд и идентификаторы
    cus_…/pm_… на стороне Stripe. Сбой запроса не роняет активацию — тариф уже
    оплачен, а карта это удобство, за которым можно сходить и в следующий раз.
    """
    try:
        session = await stripe_billing.fetch_session(session_id)
    except Exception:
        logger.exception("Stripe billing: не удалось получить карту по сессии %s", session_id)
        return

    intent = getattr(session, "payment_intent", None)
    method = getattr(intent, "payment_method", None) if intent else None
    card = getattr(method, "card", None) if method else None
    customer = getattr(session, "customer", None)
    if card is None or not customer:
        return

    row = (await db.execute(
        select(PaymentCard).where(PaymentCard.user_id == invoice.user_id)
    )).scalar_one_or_none()
    fields = dict(
        card_last4=getattr(card, "last4", "") or "----",
        card_brand=getattr(card, "brand", "card"),
        card_expiry=f"{getattr(card, 'exp_month', 0):02d}/{str(getattr(card, 'exp_year', 0))[-2:]}",
        rectoken=method.id,
        stripe_customer_id=customer if isinstance(customer, str) else customer.id,
    )
    if row is None:
        db.add(PaymentCard(user_id=invoice.user_id, cardholder_name="", is_primary=True, **fields))
    else:
        for k, v in fields.items():
            setattr(row, k, v)


async def _refund(db: AsyncSession, invoice: BillingInvoice) -> None:
    """refunded → счёт возвращён + откат подписки (expires_at −= period_months).

    Если после отката срок в прошлом — подписка просрочена (status=expired):
    гейт перестанет её пускать. plan_name не трогаем — тариф был этот.
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
    import asyncio
    import types

    # apply_status: ветки без похода в БД — повтор конечного статуса, откат paid, мусор.
    _fake_db = types.SimpleNamespace(commit=lambda: asyncio.sleep(0))
    _inv = lambda status: types.SimpleNamespace(status=status)  # noqa: E731

    _declined = _inv("pending")
    assert asyncio.run(apply_status(_fake_db, _declined, "failed")) is True
    assert _declined.status == "failed"
    assert asyncio.run(apply_status(_fake_db, _inv("paid"), "paid")) is False
    assert asyncio.run(apply_status(_fake_db, _inv("refunded"), "refunded")) is False
    assert asyncio.run(apply_status(_fake_db, _inv("failed"), "failed")) is False
    assert asyncio.run(apply_status(_fake_db, _inv("pending"), "processing")) is False
    # Протухшая вкладка не должна обнулять оплату, прошедшую с другого устройства.
    _paid = _inv("paid")
    assert asyncio.run(apply_status(_fake_db, _paid, "failed")) is False
    assert _paid.status == "paid"
    # Возврат конечен: сверка по возвращённому счёту не начисляет период второй раз.
    _returned = _inv("refunded")
    assert asyncio.run(apply_status(_fake_db, _returned, "paid")) is False
    assert _returned.status == "refunded"

    # Сверка суммы: чужая сумма и чужая валюта тариф не выдают, отсутствие поля — не мешает.
    _billed = types.SimpleNamespace(id=1, amount=299000)
    assert amount_matches(_billed, 299000, stripe_billing.CURRENCY) is True
    assert amount_matches(_billed, 100, stripe_billing.CURRENCY) is False
    assert amount_matches(_billed, 299000, "xxx") is False
    assert amount_matches(_billed, None, None) is True

    # Money-path self-check: _add_months на переносе года, клампе дня и високосном.
    d = datetime
    assert _add_months(d(2026, 1, 15), 12) == d(2027, 1, 15)
    assert _add_months(d(2026, 7, 12), 6) == d(2027, 1, 12)
    assert _add_months(d(2026, 1, 31), 1) == d(2026, 2, 28)   # кламп дня
    assert _add_months(d(2028, 1, 31), 1) == d(2028, 2, 29)   # високосный
    assert _add_months(d(2027, 1, 12), -6) == d(2026, 7, 12)  # откат возврата
    assert _add_months(d(2026, 1, 15), -12) == d(2025, 1, 15)
    assert "/webhook/stripe" in [r.path for r in router.routes]
    print("billing webhook self-check ok")
