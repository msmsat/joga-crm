"""Клиент Stripe Connect: подключение аккаунта студии и приём оплат на её счёт.

Схема — **direct charges на Standard-аккаунт**: платформа держит один секретный
ключ (свой), а каждый запрос уходит с заголовком `Stripe-Account: acct_…`. Деньги
садятся сразу на баланс студии, платформа их не касается и комиссию с транзакций
не берёт (`application_fee_amount` не передаётся — Velora зарабатывает подпиской).

Секретные ключи студий мы не храним и не спрашиваем: в этом весь смысл Connect.

Прямой модуль без абстракций — тот же паттерн, что `services/stripe_billing.py`
(там платформенный аккаунт Velora, здесь — счета студий).
"""
import asyncio
import logging
import os

import stripe
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

stripe.api_key = os.getenv("STRIPE_SECRET_KEY", "")
WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")
# Публичный по определению — уезжает во фронт вместе с client_secret сессии.
# Отдаём его с бэка, а не через VITE_-переменную: вся конфигурация Stripe тогда
# живёт в одном .env, и смена ключа не требует пересборки фронта.
PUBLISHABLE_KEY = os.getenv("STRIPE_PUBLISHABLE_KEY", "")

# Валюты без младших единиц: сумма передаётся как есть, без ×100.
# https://docs.stripe.com/currencies#zero-decimal
_ZERO_DECIMAL = {"BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"}


def configured() -> bool:
    """False = ключ платформы не прописан в .env; Connect выключен целиком."""
    return bool(stripe.api_key)


def to_minor_units(amount: int, currency: str) -> int:
    """Цена CRM (целые кроны/евро) → сумма для Stripe (галержи/центы)."""
    return amount if currency.upper() in _ZERO_DECIMAL else amount * 100


async def create_account(email: str | None) -> str:
    """Пустой Standard-аккаунт. Все данные студия введёт сама на страницах Stripe.

    ponytail: страну не передаём — Stripe берёт страну платформы. Для студий из
    другой страны сюда нужно прокинуть код страны, но в Studio такого поля нет
    (в онбординге спрашивается только часовой пояс/валюта/язык).
    """
    account = await asyncio.to_thread(stripe.Account.create, type="standard", email=email)
    return account.id


async def register_payment_method_domain(account_id: str, domain: str) -> None:
    """Разрешает Apple Pay / Google Pay / Link на нашем домене для этой студии.

    Без регистрации кошельки в форме просто не появятся — Stripe их скрывает.
    При direct charges домен регистрируется ОТДЕЛЬНО для каждого подключённого
    аккаунта (у платформы свой список, он не наследуется).

    Ошибки глушим: домен уже зарегистрирован, аккаунт ещё не верифицирован,
    localhost — всё это не повод ронять подключение. Кошельки просто не появятся.
    """
    try:
        await asyncio.to_thread(
            stripe.PaymentMethodDomain.create, domain_name=domain, stripe_account=account_id,
        )
        logger.info("Stripe: домен %s зарегистрирован для %s", domain, account_id)
    except Exception as exc:
        logger.info("Stripe: домен %s для %s не зарегистрирован (%s)", domain, account_id, exc)


async def onboarding_url(account_id: str, return_url: str, refresh_url: str) -> str:
    """Одноразовая ссылка на форму Stripe. Живёт минуты — генерируем по клику,
    не храним (протухшая ведёт на refresh_url, откуда фронт просит новую)."""
    link = await asyncio.to_thread(
        stripe.AccountLink.create,
        account=account_id, return_url=return_url, refresh_url=refresh_url,
        type="account_onboarding",
    )
    return link.url


async def account_status(account_id: str) -> tuple[bool, bool, bool]:
    """(charges_enabled, details_submitted, requirements_due) — истина только у Stripe.

    Свой флаг «подключено» держать нельзя: Stripe ставит выплаты и приём на паузу
    сам (не пройдена верификация, истёк документ), и наш флаг начнёт врать.

    `requirements_due` отделяет «Stripe проверяет, подожди» от «Stripe ждёт данные
    от тебя». Оба состояния выглядят как charges_enabled=false, но действие у
    владельца противоположное — без этого он будет ждать того, что не произойдёт.
    """
    account = await asyncio.to_thread(stripe.Account.retrieve, account_id)
    # У StripeObject нет .get() — обращение к отсутствующему полю кидает
    # AttributeError, поэтому только getattr с дефолтом.
    requirements = getattr(account, "requirements", None)
    due = (getattr(requirements, "currently_due", None) or []) if requirements else []
    past_due = (getattr(requirements, "past_due", None) or []) if requirements else []
    return (
        bool(account.charges_enabled),
        bool(account.details_submitted),
        bool(due or past_due),
    )


async def create_checkout_session(
    account_id: str,
    amount_minor: int,
    currency: str,
    description: str,
    metadata: dict,
) -> tuple[str, str]:
    """Оплата на счёт студии → (session_id, client_secret).

    Ключевое — `stripe_account`: без него платёж уйдёт на аккаунт платформы,
    то есть не туда.

    `ui_mode=embedded_page` + `redirect_on_completion=never` — форма живёт в
    модалке Velora и никуда не редиректит; об успехе фронт узнаёт из onComplete и
    идёт подтверждать оплату на бэк. Поэтому success_url/cancel_url тут не нужны.

    `embedded_page` — новое имя бывшего `embedded`; старое значение API отвергает
    начиная с версии 2026-07-29 (её и шлёт stripe==15.4.0).
    """
    session = await asyncio.to_thread(
        stripe.checkout.Session.create,
        mode="payment",
        ui_mode="embedded_page",
        redirect_on_completion="never",
        line_items=[{
            "price_data": {
                "currency": currency.lower(),
                "product_data": {"name": description},
                "unit_amount": amount_minor,
            },
            "quantity": 1,
        }],
        metadata=metadata,
        stripe_account=account_id,
    )
    return session.id, session.client_secret


async def create_hosted_checkout_session(
    account_id: str,
    amount_minor: int,
    currency: str,
    description: str,
    metadata: dict,
    success_url: str,
    cancel_url: str,
) -> tuple[str, str]:
    """Оплата на счёт студии → (session_id, url) хостед-страницы Stripe.

    В отличие от `create_checkout_session` (embedded, для кассы CRM — форма
    живёт в модалке Velora), здесь клиент мини-приложения уходит на страницу
    Stripe снаружи (`tg.openLink`, без Stripe.js на клиенте) и возвращается по
    `success_url`/`cancel_url` — поэтому обычный hosted-режим, не embedded.
    """
    session = await asyncio.to_thread(
        stripe.checkout.Session.create,
        mode="payment",
        line_items=[{
            "price_data": {
                "currency": currency.lower(),
                "product_data": {"name": description},
                "unit_amount": amount_minor,
            },
            "quantity": 1,
        }],
        metadata=metadata,
        success_url=success_url,
        cancel_url=cancel_url,
        stripe_account=account_id,
    )
    return session.id, session.url


async def session_id_for_payment_intent(payment_intent: str, account_id: str) -> str | None:
    """Сессия, из которой вырос этот платёж, или None.

    В событиях о возврате и чарджбэке приходит Charge, а заявка в CRM живёт по
    session_id — в самом Charge его нет, связать можно только запросом.
    """
    sessions = await asyncio.to_thread(
        stripe.checkout.Session.list,
        payment_intent=payment_intent, limit=1, stripe_account=account_id,
    )
    return sessions.data[0].id if sessions.data else None


async def session_paid(session_id: str, account_id: str) -> bool:
    """Оплачена ли сессия — спрашиваем Stripe, фронту на слово не верим."""
    session = await asyncio.to_thread(
        stripe.checkout.Session.retrieve, session_id, stripe_account=account_id,
    )
    return session.payment_status == "paid"


def parse_webhook(payload: bytes, signature: str) -> dict | None:
    """Проверенное событие или None, если подпись не сошлась/секрет не задан.

    Без секрета доверять телу нельзя вообще: кто угодно постучится с «оплачено»
    и получит бесплатный абонемент.
    """
    if not WEBHOOK_SECRET:
        logger.warning("Stripe webhook: STRIPE_WEBHOOK_SECRET не задан, событие отброшено")
        return None
    try:
        return stripe.Webhook.construct_event(payload, signature, WEBHOOK_SECRET)
    except (ValueError, stripe.SignatureVerificationError) as exc:
        logger.warning("Stripe webhook: событие отброшено (%s)", exc)
        return None


if __name__ == "__main__":
    # Money-path self-check: ×100 для обычных валют, как есть — для zero-decimal.
    assert to_minor_units(1500, "CZK") == 150000
    assert to_minor_units(1500, "czk") == 150000
    assert to_minor_units(1500, "EUR") == 150000
    assert to_minor_units(1500, "JPY") == 1500
    assert to_minor_units(0, "CZK") == 0
    # Без секрета вебхука любое событие отбрасывается, а не принимается на веру.
    _saved, WEBHOOK_SECRET = WEBHOOK_SECRET, ""
    assert parse_webhook(b'{"type":"checkout.session.completed"}', "sig") is None
    WEBHOOK_SECRET = _saved
    print("stripe_connect self-check ok")
