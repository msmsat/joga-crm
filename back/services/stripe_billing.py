"""Оплата подписки на саму Velora через Stripe — на платформенный аккаунт.

Это НЕ Connect: деньги идут Velora, а не студии, поэтому `stripe_account` здесь
не передаётся никуда. Приём оплат клиентов студии живёт в `stripe_connect.py` и
пересекается с этим модулем только общим секретным ключом платформы.

Прямой модуль без абстракций — тот же паттерн, что `stripe_connect.py`.
"""
import asyncio
import logging
import os
from urllib.parse import urlparse

import stripe
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# Тот же ключ платформы, что у Connect: аккаунт Velora один. Присваивание
# глобальное и идемпотентное — какой бы модуль ни импортировался первым,
# значение одно и то же.
stripe.api_key = os.getenv("STRIPE_SECRET_KEY", "")

# Отдельный эндпоинт вебхука — отдельная подпись. Локально `stripe listen` выдаёт
# один секрет на всю сессию, поэтому без своего значения берём общий: иначе на
# деве пришлось бы держать два туннеля ради одного прогона.
#
# Секрет эндпоинта — это граница между деньгами студий (касса, Connect) и деньгами
# Velora (тариф): общий секрет делает подпись одного эндпоинта годной для другого.
# Сам по себе подмену уже не даёт — событие подключённого аккаунта отбрасывается в
# routers/billing/webhook.py по полю `account`, — но на публичном адресе это
# лишний общий секрет, поэтому кричим на старте. Ронять приложение нельзя: живой
# вебхук оплаты тарифа умер бы молча вместе с продлениями.
WEBHOOK_SECRET = os.getenv("STRIPE_BILLING_WEBHOOK_SECRET") or os.getenv("STRIPE_WEBHOOK_SECRET", "")

if not os.getenv("STRIPE_BILLING_WEBHOOK_SECRET") and stripe.api_key and urlparse(
    os.getenv("BACKEND_URL", "http://localhost:8000")
).hostname not in ("localhost", "127.0.0.1"):
    logger.error(
        "Stripe billing: STRIPE_BILLING_WEBHOOK_SECRET не задан — /billing/webhook/stripe "
        "проверяет подпись общим с кассой секретом. Заведите эндпоинту свой секрет "
        "в дашборде Stripe (и НЕ включайте ему 'events on connected accounts')."
    )

# Валюта счетов за тариф. Цены в plans.py заданы в МЛАДШИХ единицах (99000 =
# 990.00), как их и ждёт Stripe, поэтому пересчёта тут нет. Валюту без младших
# единиц (JPY и подобные) сюда ставить нельзя — сумма уедет в 100 раз.
CURRENCY = os.getenv("BILLING_CURRENCY", "czk").lower()


def configured() -> bool:
    """False = ключ платформы не прописан в .env; оплата тарифа выключена целиком."""
    return bool(stripe.api_key)


async def create_checkout(
    invoice_id: int,
    amount: int,
    description: str,
    success_url: str,
    cancel_url: str,
    customer_email: str | None = None,
) -> tuple[str, str]:
    """Страница оплаты тарифа → (session_id, url).

    `metadata.invoice_id` — единственная надёжная привязка к счёту: session_id мы
    узнаём только из ответа, и если запись в БД не доедет, вебхук всё равно
    поймёт, за что заплатили.

    `customer_creation` + `setup_future_usage` сохраняют карту у Stripe, чтобы
    работала кнопка «Продлить» (charge_saved_card). Номер карты к нам не попадает
    ни на каком шаге — только идентификаторы cus_… / pm_… и маска.
    """
    metadata = {"invoice_id": str(invoice_id)}
    session = await asyncio.to_thread(
        stripe.checkout.Session.create,
        mode="payment",
        line_items=[{
            "price_data": {
                "currency": CURRENCY,
                "product_data": {"name": description},
                "unit_amount": amount,
            },
            "quantity": 1,
        }],
        success_url=success_url,
        cancel_url=cancel_url,
        metadata=metadata,
        customer_email=customer_email or None,
        customer_creation="always",
        payment_intent_data={"setup_future_usage": "off_session", "metadata": metadata},
    )
    return session.id, session.url


async def fetch_session(session_id: str):
    """Сессия с раскрытым платежом и способом оплаты — для сверки и сохранения карты.

    expand обязателен: без него в ответе лежат голые id (`pi_…`, `pm_…`), и за
    брендом карты пришлось бы ходить ещё двумя запросами.
    """
    return await asyncio.to_thread(
        stripe.checkout.Session.retrieve,
        session_id, expand=["payment_intent.payment_method"],
    )


async def refund(payment_intent: str) -> None:
    """Полный возврат платежа. Итог продублируется событием `charge.refunded`,
    поэтому статус счёта здесь не трогаем — его двигает общий apply_status."""
    await asyncio.to_thread(stripe.Refund.create, payment_intent=payment_intent)


async def charge_saved_card(
    invoice_id: int,
    amount: int,
    description: str,
    customer_id: str,
    payment_method_id: str,
) -> tuple[str, str]:
    """Списание по сохранённой карте → (payment_intent_id, status).

    В отличие от оплаты по ссылке результат известен сразу, поэтому вебхука не
    ждём. `off_session` значит «клиента у экрана нет»: карта, требующая 3-D
    Secure, сюда не пройдёт — вернётся не-succeeded, и продлевать надо обычной
    оплатой. Это не ошибка сервера, а нормальный отказ банка.
    """
    try:
        intent = await asyncio.to_thread(
            stripe.PaymentIntent.create,
            amount=amount,
            currency=CURRENCY,
            customer=customer_id,
            payment_method=payment_method_id,
            off_session=True,
            confirm=True,
            description=description,
            metadata={"invoice_id": str(invoice_id)},
        )
    except stripe.CardError as exc:
        # Банк отказал (нет денег, нужна аутентификация, карта истекла). У
        # CardError `payment_intent` — СТРОКА с id, а не объект: обращаться к ней
        # как к словарю (.get) значит уронить продление в 502 вместо честного
        # «карту отклонили». Проверено на живом declined-платеже.
        logger.info("Stripe billing: списание по сохранённой карте отклонено (%s)", exc)
        return str(getattr(exc, "payment_intent", "") or ""), "failed"
    return intent.id, intent.status


def parse_webhook(payload: bytes, signature: str) -> dict | None:
    """Проверенное событие или None, если подпись не сошлась/секрет не задан.

    Без секрета доверять телу нельзя вообще: кто угодно постучится с «оплачено»
    и получит бесплатный тариф.
    """
    if not WEBHOOK_SECRET:
        logger.warning("Stripe billing webhook: секрет не задан, событие отброшено")
        return None
    try:
        return stripe.Webhook.construct_event(payload, signature, WEBHOOK_SECRET)
    except (ValueError, stripe.SignatureVerificationError) as exc:
        logger.warning("Stripe billing webhook: событие отброшено (%s)", exc)
        return None


if __name__ == "__main__":
    # Без секрета вебхука любое событие отбрасывается, а не принимается на веру.
    _saved, WEBHOOK_SECRET = WEBHOOK_SECRET, ""
    assert parse_webhook(b'{"type":"checkout.session.completed"}', "sig") is None
    WEBHOOK_SECRET = _saved
    # Валюта тарифа обязана быть с младшими единицами: цены в plans.py — копейки.
    from services.stripe_connect import _ZERO_DECIMAL
    assert CURRENCY.upper() not in _ZERO_DECIMAL, f"BILLING_CURRENCY={CURRENCY} без младших единиц"
    print("stripe_billing self-check ok")
