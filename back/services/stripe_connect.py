"""Клиент Stripe Connect: подключение аккаунта студии и приём оплат на её счёт.

Схема — **direct charges на Standard-аккаунт**: платформа держит один секретный
ключ (свой), а каждый запрос уходит с заголовком `Stripe-Account: acct_…`. Деньги
садятся сразу на баланс студии.

Комиссию платформа берёт только на тарифах «процент» и «комбо» — через
`application_fee_amount` (Stripe сам переводит долю на аккаунт Velora). Сколько
удержать, решает `services/platform_fee.py`; на тарифе-подписке это ноль, и поле
не передаётся вообще — Velora зарабатывает подпиской.

Секретные ключи студий мы не храним и не спрашиваем: в этом весь смысл Connect.

Прямой модуль без абстракций — тот же паттерн, что `services/stripe_billing.py`
(там платформенный аккаунт Velora, здесь — счета студий).
"""
import asyncio
import logging
import os

import stripe
from dotenv import load_dotenv

from services import stripe_env

load_dotenv()

logger = logging.getLogger(__name__)

# Тот же страж, что в stripe_billing: боевой ключ на машине разработчика не должен
# заводить аккаунты студий и платёжные сессии. Кричим на импорте, останавливаем —
# в guard_write у каждой записи.
stripe_env.log_status()

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
    stripe_env.guard_write("создание подключённого аккаунта")
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


def _payment_intent_data(application_fee_minor: int, receipt_email: str | None) -> dict | None:
    """`payment_intent_data` сессии или None, если добавлять туда нечего.

    `application_fee_amount` — доля платформы с direct charge на тарифах
    «процент» и «комбо» (считает services/platform_fee.py). Ноль НЕ передаём:
    на тарифе-подписке платформа с транзакций студии не берёт ничего, а
    `application_fee_amount=0` — это лишний повод для Stripe придраться к запросу.

    `receipt_email` — квитанцию клиенту шлёт сам Stripe от лица студии, своей
    рассылки чеков за оплату занятий мы не держим.
    """
    data: dict = {}
    if application_fee_minor > 0:
        data["application_fee_amount"] = application_fee_minor
    if receipt_email:
        data["receipt_email"] = receipt_email
    return data or None


async def create_checkout_session(
    account_id: str,
    amount_minor: int,
    currency: str,
    description: str,
    metadata: dict,
    application_fee_minor: int = 0,
    receipt_email: str | None = None,
    client_reference_id: str | None = None,
    idempotency_key: str | None = None,
) -> tuple[str, str]:
    """Оплата на счёт студии → (session_id, client_secret).

    Ключевое — `stripe_account`: без него платёж уйдёт на аккаунт платформы,
    то есть не туда.

    `ui_mode=embedded_page` + `redirect_on_completion=never` — форма живёт в
    модалке Velora и никуда не редиректит; об успехе фронт узнаёт из onComplete и
    идёт подтверждать оплату на бэк. Поэтому success_url/cancel_url тут не нужны.

    `embedded_page` — новое имя бывшего `embedded`; старое значение API отвергает
    начиная с версии 2026-07-29 (её и шлёт stripe==15.4.0).

    `client_reference_id` — id НАШЕЙ попытки оплаты. Он же уезжает в метаданные:
    поле читается прямо из объекта сессии в вебхуке, а метаданные переживают
    любые правки формата полей. По нему заявка находится обратно, даже если id
    сессии мы записать не успели (routers/checkout/stripe_pay.apply_paid).

    `idempotency_key` — ключ той же попытки. Повтор запроса (двойной клик,
    ретрай сети, потерянный HTTP-ответ) возвращает ТУ ЖЕ сессию вместо второй:
    иначе у одной заявки оказывалось бы две платёжные формы.
    """
    stripe_env.guard_write("создание платёжной сессии студии")
    intent_data = _payment_intent_data(application_fee_minor, receipt_email)
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
        **({"payment_intent_data": intent_data} if intent_data else {}),
        **({"client_reference_id": client_reference_id} if client_reference_id else {}),
        **({"idempotency_key": idempotency_key} if idempotency_key else {}),
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
    application_fee_minor: int = 0,
    receipt_email: str | None = None,
    client_reference_id: str | None = None,
    idempotency_key: str | None = None,
) -> tuple[str, str]:
    """Оплата на счёт студии → (session_id, url) хостед-страницы Stripe.

    В отличие от `create_checkout_session` (embedded, для кассы CRM — форма
    живёт в модалке Velora), здесь клиент мини-приложения уходит на страницу
    Stripe снаружи (`tg.openLink`, без Stripe.js на клиенте) и возвращается по
    `success_url`/`cancel_url` — поэтому обычный hosted-режим, не embedded.

    `client_reference_id` и `idempotency_key` — то же самое и ровно за тем же,
    что у встроенной формы кассы: обратная ссылка на нашу заявку и защита от
    второй сессии на одну попытку оплаты.
    """
    stripe_env.guard_write("создание платёжной страницы студии")
    intent_data = _payment_intent_data(application_fee_minor, receipt_email)
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
        **({"payment_intent_data": intent_data} if intent_data else {}),
        **({"client_reference_id": client_reference_id} if client_reference_id else {}),
        **({"idempotency_key": idempotency_key} if idempotency_key else {}),
    )
    return session.id, session.url


async def fetch_session(session_id: str, account_id: str):
    """Сессия Checkout целиком — для сверки потерянных оплат.

    `session_paid` отвечает только «оплачено или нет», а сверке нужны ещё статус
    самой сессии (`expired` — заявку пора закрывать) и суммы: провести продажу по
    сессии, у которой сумма разошлась с заявкой, нельзя.
    """
    return await asyncio.to_thread(
        stripe.checkout.Session.retrieve, session_id, stripe_account=account_id,
    )


# Предел перебора при поиске осиротевшей сессии. Сто страниц по сто записей:
# заведомо больше, чем аккаунт успевает создать за окно сверки, и заведомо конечно.
_SCAN_LIMIT = 10_000


async def find_session_by_reference(
    account_id: str, reference: str, created_after: int,
) -> str | None:
    """id сессии по НАШЕМУ `client_reference_id`, или None. Спасение осиротевших.

    Нужна ровно в одном случае: сессия у Stripe создана, а её id мы записать не
    успели (упал процесс между ответом Stripe и коммитом). Заявка при этом
    существует — она резервируется ПЕРВОЙ, — но найти её сессию по id нечем.

    Фильтра по `client_reference_id` у `Session.list` в этой версии API НЕТ
    (проверено по SessionListParams: created, customer, payment_intent,
    payment_link, status, subscription). Поэтому перебираем сессии аккаунта,
    созданные не раньше самой заявки, и сверяем ссылку сами.

    Перебор идёт ПО СТРАНИЦАМ (`auto_paging_iter`), а не по первой сотне: у
    занятого зала за минуты между падением и сверкой набирается больше сотни
    сессий, и нужная оказывалась на второй странице — то есть терялась молча.
    Предел всё же есть (`_SCAN_LIMIT`), иначе одна осиротевшая заявка увела бы
    часовой воркер в бесконечную выгрузку; упёрлись в него — пишем об этом в лог,
    а не возвращаем тихое «не нашли».
    """
    def _scan() -> tuple[str | None, int, bool]:
        seen = 0
        pages = stripe.checkout.Session.list(
            created={"gte": created_after}, limit=100, stripe_account=account_id,
        )
        for session in pages.auto_paging_iter():
            seen += 1
            if getattr(session, "client_reference_id", None) == reference:
                return session.id, seen, False
            if seen >= _SCAN_LIMIT:
                return None, seen, True
        return None, seen, False

    session_id, seen, exhausted = await asyncio.to_thread(_scan)
    if exhausted:
        logger.warning(
            "Stripe Connect: осиротевшая сессия %s не найдена за %s записей аккаунта %s — "
            "перебор упёрся в предел, заявку закроет срок жизни",
            reference, seen, account_id,
        )
    return session_id


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


async def refunded_application_fee(charge_id: str, account_id: str) -> int:
    """Сколько из удержанной доли платформы реально вернулось студии. 0 — ничего.

    Спрашиваем, а не считаем. Возврат платежа комиссию платформы НЕ возвращает
    автоматически: по умолчанию Stripe оставляет её нам, и снять доход из леджера
    в этом случае значило бы занизить собственную выручку и недосчитать фактуру.
    Обратная ошибка не лучше: если студия при возврате поставила галку «вернуть
    комиссию», оставленная строка леджера — документ на деньги, которых нет.
    Возвращает студия из СВОЕГО дашборда, то есть решение принимаем не мы.

    Два разных запроса не по недосмотру: сам charge живёт на аккаунте студии
    (direct charge), а `ApplicationFee` — на аккаунте платформы, это её доход.
    """
    charge = await asyncio.to_thread(
        stripe.Charge.retrieve, charge_id, stripe_account=account_id,
    )
    fee = getattr(charge, "application_fee", None)
    fee_id = fee if isinstance(fee, str) else getattr(fee, "id", None)
    if not fee_id:
        return 0
    application_fee = await asyncio.to_thread(stripe.ApplicationFee.retrieve, fee_id)
    return int(getattr(application_fee, "amount_refunded", 0) or 0)


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
