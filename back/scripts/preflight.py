"""Проверка конфигурации перед переездом на боевой режим.

Отвечает на один вопрос: если сейчас включить приём настоящих денег, что сломается?
Проверяются только те вещи, которые НЕ видны из кода и молчат до первой оплаты —
секреты, адреса, режим ключей, живой каталог цен.

Запуск из back/:
    python -m scripts.preflight            # проверить и показать отчёт
    python -m scripts.preflight --sync     # заодно залить каталог цен в Stripe

Коды выхода: 0 — всё чисто (возможны предупреждения), 1 — есть блокеры.
Годится как шаг деплоя: `python -m scripts.preflight || exit 1`.

Ничего не меняет, кроме `--sync` (он идемпотентен). Денег не двигает.
"""
import asyncio
import os
import sys
from urllib.parse import urlparse

from dotenv import load_dotenv

load_dotenv()

# Блокеры (приём денег сломается) и предупреждения (работать будет, но неправильно).
_ERRORS: list[str] = []
_WARNINGS: list[str] = []


def _err(text: str) -> None:
    _ERRORS.append(text)


def _warn(text: str) -> None:
    _WARNINGS.append(text)


def _is_local(url: str | None) -> bool:
    return urlparse(url or "").hostname in ("localhost", "127.0.0.1", None)


def check_urls() -> None:
    """Адреса, на которые ходят Stripe и браузер.

    BACKEND_URL с localhost значит, что вебхуки Stripe физически некуда доставить,
    а WEB_APP_URL с localhost — что после оплаты владельца вернёт на несуществующую
    страницу. Оба дефолтятся на localhost, то есть молчат, если про них забыть.
    """
    backend, web = os.getenv("BACKEND_URL"), os.getenv("WEB_APP_URL")
    if _is_local(backend):
        _err(f"BACKEND_URL={backend or '(не задан)'} — Stripe не доставит вебхук на localhost")
    if _is_local(web):
        _err(f"WEB_APP_URL={web or '(не задан)'} — возврат с оплаты уедет на localhost")

    origins = os.getenv("CORS_ORIGINS")
    if not origins:
        _warn("CORS_ORIGINS не задан — разрешён только WEB_APP_URL; фронт на другом домене получит CORS-ошибку")
    elif web and web.rstrip("/") not in {o.strip().rstrip("/") for o in origins.split(",")}:
        _warn(f"WEB_APP_URL={web} отсутствует в CORS_ORIGINS — браузер не пустит запросы фронта")


def check_stripe_keys() -> None:
    """Ключи и режим. Смешать test и live — значит принимать оплаты, которых нет."""
    secret = os.getenv("STRIPE_SECRET_KEY", "")
    publishable = os.getenv("STRIPE_PUBLISHABLE_KEY", "")
    if not secret:
        _err("STRIPE_SECRET_KEY не задан — приём оплат выключен целиком")
        return
    if not publishable:
        _err("STRIPE_PUBLISHABLE_KEY не задан — форма оплаты в кассе не отрисуется")

    secret_live = secret.startswith("sk_live_") or secret.startswith("rk_live_")
    pub_live = publishable.startswith("pk_live_")
    if publishable and secret_live != pub_live:
        _err("STRIPE_SECRET_KEY и STRIPE_PUBLISHABLE_KEY из РАЗНЫХ режимов (test/live)")
    if not secret_live:
        _warn("Stripe в ТЕСТОВОМ режиме — настоящие деньги не принимаются")


def check_webhook_secrets() -> None:
    """Два эндпоинта — два разных секрета.

    Общий секрет делает подпись одного эндпоинта годной для другого, то есть стирает
    границу между деньгами студий (касса, Connect) и деньгами Velora (тариф).
    """
    connect = os.getenv("STRIPE_WEBHOOK_SECRET", "")
    billing = os.getenv("STRIPE_BILLING_WEBHOOK_SECRET", "")
    if not connect:
        _err("STRIPE_WEBHOOK_SECRET не задан — /checkout/webhook/stripe отбросит ВСЕ события, оплаты клиентов не проведутся")
    if not billing:
        _err("STRIPE_BILLING_WEBHOOK_SECRET не задан — /billing/webhook/stripe отбросит все события, тариф не активируется после оплаты")
    if connect and billing and connect == billing:
        _err("STRIPE_WEBHOOK_SECRET и STRIPE_BILLING_WEBHOOK_SECRET совпадают — заведите эндпоинтам разные секреты")


def check_billing_currency() -> None:
    """Валюта тарифа. Ошибка здесь уводит суммы в 100 раз или ломает переводы."""
    from services.stripe_billing import CURRENCY, BANK_TRANSFER_COUNTRY
    from services.stripe_connect import _ZERO_DECIMAL

    if CURRENCY.upper() in _ZERO_DECIMAL:
        _err(f"BILLING_CURRENCY={CURRENCY} без младших единиц — цены в plans.py заданы в центах, суммы уедут в 100 раз")
    if CURRENCY not in ("eur", "gbp", "usd", "jpy", "mxn", "idr"):
        _err(f"BILLING_CURRENCY={CURRENCY} не поддерживает банковские переводы Stripe — оплата по IBAN работать не будет")
    if len(BANK_TRANSFER_COUNTRY) != 2 or not BANK_TRANSFER_COUNTRY.isalpha():
        _err(f"BILLING_BANK_TRANSFER_COUNTRY={BANK_TRANSFER_COUNTRY} — нужен двухбуквенный код страны")


def check_fx_cache() -> None:
    """Кэш курсов ЕЦБ. В контейнере с эфемерной ФС переживает только том."""
    import tempfile

    path = os.getenv("FX_CACHE_PATH")
    if not path:
        _warn(
            f"FX_CACHE_PATH не задан — курсы валют кэшируются во временный каталог "
            f"({tempfile.gettempdir()}). В контейнере кэш умрёт с перезапуском; "
            f"если студии торгуют не в валюте биллинга, укажите путь на постоянный том"
        )


def check_smtp() -> None:
    """Почта: без неё не уедут ни фактуры, ни предупреждения о блокировке."""
    if not (os.getenv("SMTP_HOST") and os.getenv("SMTP_USER") and os.getenv("SMTP_PASS")):
        _err("SMTP не настроен — чеки, фактуры и письма о скорой блокировке не отправятся")


def check_secret_key() -> None:
    """Ключ подписи JWT. Дефолтный или короткий = подделываемые сессии."""
    key = os.getenv("SECRET_KEY", "")
    if not key:
        _err("SECRET_KEY не задан")
    elif len(key) < 32 or key.lower() in ("secret", "changeme", "your-secret-key"):
        _err("SECRET_KEY слишком короткий или дефолтный — токены можно подделать")


async def check_stripe_catalog(sync: bool) -> None:
    """Каталог цен на ЖИВОМ аккаунте.

    Prices из тестового режима в боевой не переносятся. Недостающий Price теперь
    заводится на месте при первой оплате (stripe_catalog.price_id), так что это не
    блокер — но лучше увидеть каталог заранее, чем во время первой продажи.
    """
    from routers.billing.plans import PERIOD_DISCOUNTS, PLANS
    from services import stripe_catalog

    if not os.getenv("STRIPE_SECRET_KEY"):
        return

    if sync:
        try:
            created = await stripe_catalog.sync()
            print(f"  каталог залит: {len(created)} Price")
            return
        except Exception as exc:
            _err(f"не удалось залить каталог цен в Stripe: {exc}")
            return

    missing = []
    for plan_id in PLANS:
        for months in PERIOD_DISCOUNTS:
            for combo in (False, True):
                key = stripe_catalog.lookup_key(plan_id, months, combo)
                try:
                    if await stripe_catalog._find_price(key) is None:
                        missing.append(key)
                except Exception as exc:
                    _err(f"Stripe не отвечает на запрос каталога: {exc}")
                    return
    if missing:
        _warn(
            f"в Stripe нет {len(missing)} из {len(PLANS) * len(PERIOD_DISCOUNTS) * 2} Price "
            f"(заведутся сами при первой оплате; залить сразу: python -m scripts.preflight --sync)"
        )


async def main(sync: bool) -> int:
    print("Velora: проверка конфигурации перед боевым режимом\n")
    check_secret_key()
    check_urls()
    check_stripe_keys()
    check_webhook_secrets()
    check_billing_currency()
    check_fx_cache()
    check_smtp()
    await check_stripe_catalog(sync)

    for text in _WARNINGS:
        print(f"  [!] {text}")
    for text in _ERRORS:
        print(f"  [X] {text}")

    if _ERRORS:
        print(f"\nБлокеров: {len(_ERRORS)}, предупреждений: {len(_WARNINGS)}. Включать боевой режим НЕЛЬЗЯ.")
        return 1
    print(f"\nБлокеров нет, предупреждений: {len(_WARNINGS)}.")
    print(
        "\nОстаётся то, что живёт в дашборде Stripe и из кода не проверяется:\n"
        "  * /billing/webhook/stripe  — события customer.subscription.*, invoice.*,\n"
        "    charge.refunded, setup_intent.succeeded. «Events on connected accounts» ВЫКЛ.\n"
        "  * /checkout/webhook/stripe — checkout.session.completed/expired/\n"
        "    async_payment_succeeded/async_payment_failed, charge.refunded,\n"
        "    charge.dispute.created, charge.dispute.closed.\n"
        "    «Events on connected accounts» ВКЛ — без этого оплаты клиентов не проведутся."
    )
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main("--sync" in sys.argv)))
