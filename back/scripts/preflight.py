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


def check_platform_email() -> None:
    """Адрес, на который платформа получает уведомления о собственном доходе.

    Не блокер — деньги без него ходят как обычно, но поступления придётся
    выискивать в дашборде Stripe и сводить со студиями руками.
    """
    if not os.getenv("PLATFORM_BILLING_EMAIL"):
        _warn(
            "PLATFORM_BILLING_EMAIL не задан — уведомления о поступлениях "
            "(оплата тарифа, комиссия) никуда не отправляются"
        )


def check_secret_key() -> None:
    """Ключ подписи JWT. Дефолтный или короткий = подделываемые сессии."""
    key = os.getenv("SECRET_KEY", "")
    if not key:
        _err("SECRET_KEY не задан")
    elif len(key) < 32 or key.lower() in ("secret", "changeme", "your-secret-key"):
        _err("SECRET_KEY слишком короткий или дефолтный — токены можно подделать")


def check_legal_docs() -> None:
    """Условия и Политика — сделка с клиентом, а не украшение.

    Проверяем две вещи, которые молчат до спора: что документы вообще лежат на
    месте (галочка при регистрации ссылается на них), и что в Условиях не
    остались квадратные скобки-заглушки — договор с «[FULL NAME]» вместо
    продавца не доказывает ничего.

    Даты редакций сверяются с legal.TERMS_VERSION: разъехавшись, они делают
    сохранённое согласие непроверяемым — в БД одна версия, в тексте другая.
    """
    import re
    from pathlib import Path

    import legal

    static = Path(__file__).resolve().parent.parent / "static"
    for name in ("terms.html", "privacy.html"):
        path = static / name
        if not path.exists():
            _err(f"static/{name} отсутствует — ссылка из формы регистрации ведёт в 404")
            continue

        text = path.read_text(encoding="utf-8")
        # Сами заглушки в текст ошибки не тащим: в них бывают чешские диакритики
        # (DIČ), а консоль Windows под cp1251 на них падает вместе со всем отчётом.
        blanks = set(re.findall(r"\[[A-ZА-Я][^\]]{2,40}\]", text))
        if blanks:
            _err(f"static/{name}: осталось незаполненных мест в квадратных скобках — {len(blanks)}")
        if legal.TERMS_VERSION not in text:
            _err(
                f"static/{name} не содержит редакцию {legal.TERMS_VERSION} — "
                f"версия в тексте разошлась с legal.TERMS_VERSION, согласия станут непроверяемыми"
            )


async def check_stripe_account() -> None:
    """Живой аккаунт платформы. Ключ есть — это ещё не значит, что деньги ходят.

    Аккаунт, не прошедший активацию (не заполнены данные компании, не привязан
    банковский счёт), отдаёт `charges_enabled=false`, и Stripe отклоняет КАЖДЫЙ
    платёж — и тариф, и кассу студий. Из кода это не видно: ключ валидный, запросы
    уходят, а первая же оплата возвращает ошибку клиенту.

    Заодно проверяем Connect: без включённого в дашборде Connect создание аккаунта
    студии (`Account.create`) падает, то есть кнопка «Подключить Stripe» ломается.
    """
    import stripe
    from services import stripe_connect  # выставляет stripe.api_key

    if not stripe_connect.configured():
        return

    try:
        account = await asyncio.to_thread(stripe.Account.retrieve)
    except Exception as exc:
        _err(f"Stripe не принял ключ платформы: {exc}")
        return

    if not account.details_submitted:
        _err("аккаунт платформы Stripe не активирован (details_submitted=false) — заполните данные компании в дашборде")
    if not account.charges_enabled:
        _err("аккаунт платформы Stripe не принимает платежи (charges_enabled=false) — оплата тарифа и касса студий вернут ошибку")

    try:
        await asyncio.to_thread(stripe.Account.list, limit=1)
    except Exception as exc:
        _err(f"Stripe Connect недоступен ({exc}) — студия не сможет подключить приём оплат")


async def check_stripe_payment_methods() -> None:
    """Способы оплаты, включённые на аккаунте платформы.

    Оплата тарифа идёт двумя ветками, и каждой нужен СВОЙ способ: карта — `card`,
    банковский перевод — `customer_balance` (routers/billing/checkout.py). Выключенный
    в дашборде способ из кода не виден никак: ключ валидный, каталог отвечает, а
    Subscription.create падает «payment method type is invalid» уже под владельцем,
    который дошёл до оплаты. Проверяется здесь по той же причине, что и Stripe Tax:
    настройки у test и live разные, и включённый в тесте перевод ничего не значит.
    """
    import stripe
    from services import stripe_connect

    if not stripe_connect.configured():
        return

    try:
        configs = await asyncio.to_thread(stripe.PaymentMethodConfiguration.list, limit=20)
    except Exception as exc:
        _warn(f"не удалось прочитать способы оплаты Stripe ({exc}) — проверьте их в дашборде вручную")
        return

    default = next((c for c in configs.data if c.is_default), None) or (
        configs.data[0] if configs.data else None
    )
    if default is None:
        _err("на аккаунте Stripe нет ни одной конфигурации способов оплаты — платить будет нечем")
        return

    # Два признака, и оба обязательны. `available` — дал ли Stripe доступ к способу
    # вообще; `display_preference` — включён ли он нами. Проверять один
    # `display_preference` мало: его можно поставить `on` и по API, и в дашборде даже
    # там, где доступа нет, — конфигурация примет, `available` останется false, а
    # оплата продолжит падать. Именно так выглядит незапрошенный bank transfer.
    for method, branch in (("card", "оплата картой"), ("customer_balance", "оплата банковским переводом")):
        option = getattr(default, method, None)
        value = getattr(getattr(option, "display_preference", None), "value", None)
        available = getattr(option, "available", None)
        if available is False:
            _err(
                f"способ оплаты {method} недоступен аккаунту Stripe (available=false) — {branch} вернёт "
                f"ошибку. Это не галка: доступ надо ЗАПРОСИТЬ в Settings → Payments → Payment methods "
                f"(для bank transfers — отдельно под каждую валюту) и дождаться одобрения"
            )
        elif value != "on":
            _err(
                f"способ оплаты {method} выключен на аккаунте Stripe ({value or 'нет в конфигурации'}) — "
                f"{branch} вернёт ошибку. Включите в Settings → Payments → Payment methods"
            )


async def check_stripe_tax() -> None:
    """Stripe Tax. Настройки у test и live РАЗНЫЕ — включённый в тесте ничего не значит.

    Все счета платформы уходят с `automatic_tax={"enabled": True}`
    (services/stripe_billing.py). Пока Tax не активирован, Stripe отвечает на них
    400, то есть не работает ни оплата тарифа, ни счёт за комиссию — целиком.
    """
    import stripe
    from services import stripe_connect

    if not stripe_connect.configured():
        return

    try:
        settings = await asyncio.to_thread(stripe.tax.Settings.retrieve)
    except Exception as exc:
        _err(f"Stripe Tax недоступен ({exc}) — счета с automatic_tax не выставятся")
        return

    if settings.status != "active":
        _err(
            f"Stripe Tax в статусе {settings.status} — счета за тариф и комиссию не выставятся. "
            f"Заполните Tax → Settings (адрес продавца, налоговая категория) и зарегистрируйте "
            f"страны, в которых собираете НДС"
        )


async def check_invoice_tax_id() -> None:
    """Свой налоговый номер на выпускаемых фактурах.

    Реквизиты ПОКУПАТЕЛЯ на фактуру уезжают (ensure_customer кладёт регистрационный
    номер в custom_fields, VAT ID — налоговым id клиента). Свой DIČ Stripe печатает
    только из `settings.invoices.default_account_tax_ids`, и по умолчанию поле пустое.

    Без него документ формально не фактура: §29 чешского закона о НДС требует DIČ
    поставщика, и студия не поставит по такому документу налог к вычету. Молчит это
    до первой проверки — из кода не видно вообще, поэтому проверяем здесь.
    """
    import stripe
    from services import stripe_connect

    if not stripe_connect.configured():
        return

    try:
        account = await asyncio.to_thread(stripe.Account.retrieve)
    except Exception:
        return  # про недоступный аккаунт уже сказал check_stripe_account

    invoices = getattr(getattr(account, "settings", None), "invoices", None)
    if not (getattr(invoices, "default_account_tax_ids", None) or []):
        _err(
            "на фактурах не печатается ВАШ налоговый номер (default_account_tax_ids пуст) — "
            "документ без DIČ поставщика не даёт студии права на вычет НДС. "
            "Дашборд Stripe → Settings → Invoices → Account tax IDs"
        )


async def check_tax_registrations() -> None:
    """Страны, в которых Stripe Tax реально начисляет налог.

    Без единой регистрации Stripe Tax не начисляет ничего: счета уходят с нулевым
    НДС, и это не reverse charge, а необложенная продажа — недобор ложится на
    платформу. Это блокер.

    Одна регистрация (страна продавца) — рабочая конфигурация, и покупателю из другой
    страны ЕС при ней уходит ДОМАШНЯЯ ставка продавца, а не ноль. Проверено вызовами
    `tax.Calculation` на боевом ключе при единственной регистрации CZ: PL, DE и SK без
    номера НДС дали 21 % `standard_rated`; ноль был только там, где номер НДС указан
    (`reverse_charge`) и вне ЕС (`not_collecting`).

    Предупреждаем не про ноль, а про порог: домашняя ставка правомерна, пока продажи
    не-плательщикам НДС по ЕС не превысили 10 000 € в год. После порога нужен OSS, и
    ставка обязана стать местной для каждой страны. Отследить порог по этим данным
    нельзя — сумма продаж живёт в Stripe (он же и мониторит), поэтому это вопрос к
    бухгалтеру, а не проверка.
    """
    import stripe
    from services import stripe_connect

    if not stripe_connect.configured():
        return

    try:
        registrations = await asyncio.to_thread(stripe.tax.Registration.list, status="active", limit=100)
        account = await asyncio.to_thread(stripe.Account.retrieve)
    except Exception as exc:
        _warn(f"не удалось прочитать налоговые регистрации Stripe Tax ({exc}) — проверьте в дашборде")
        return

    countries = {getattr(r, "country", None) for r in registrations.data} - {None}
    if not countries:
        _err(
            "в Stripe Tax нет ни одной активной налоговой регистрации — все счета уйдут "
            "с нулевым НДС. Tax → Registrations"
        )
    elif countries <= {getattr(account, "country", None)}:
        home = ", ".join(sorted(countries))
        _warn(
            f"Stripe Tax зарегистрирован только в {home} — покупателю из другой страны ЕС без "
            f"номера НДС уходит ДОМАШНЯЯ ставка {home}, а не 0 %. Это правомерно, пока продажи "
            f"не-плательщикам НДС по ЕС не превысили 10 000 € в год; после порога нужен OSS и "
            f"местная ставка каждой страны. Вопрос к бухгалтеру, порог отслеживает Stripe"
        )


async def check_db_stripe_links() -> None:
    """Идентификаторы Stripe в БД обязаны существовать под ТЕКУЩИМ ключом.

    Объекты test-режима в live не переносятся, а их id по виду не отличить:
    `cus_…` и `acct_…` в обоих режимах выглядят одинаково. Значит переключение
    ключей молча оставляет в БД ссылки в никуда — студия с тестовой подпиской
    получает 502 на странице тарифа, а её касса шлёт деньги на несуществующий
    аккаунт. Единственный надёжный способ узнать — спросить Stripe про каждый id.

    Не-блокер по построению нельзя: молчание здесь и есть та ошибка, ради которой
    существует этот скрипт.
    """
    import stripe
    from sqlalchemy import text

    from services import stripe_connect

    if not stripe_connect.configured():
        return

    try:
        from database import engine

        async with engine.connect() as conn:
            rows = (await conn.execute(text(
                "SELECT stripe_customer_id AS id FROM studio_billing_plans WHERE stripe_customer_id IS NOT NULL "
                "UNION "
                "SELECT account_id FROM online_channels WHERE channel_type = 'stripe' AND account_id IS NOT NULL "
                "LIMIT 100"
            ))).scalars().all()
    except Exception as exc:
        _warn(f"не удалось прочитать ссылки на Stripe из БД ({exc}) — проверьте вручную")
        return

    stale = []
    for object_id in rows:
        retrieve = stripe.Account.retrieve if object_id.startswith("acct_") else stripe.Customer.retrieve
        try:
            await asyncio.to_thread(retrieve, object_id)
        # Два РАЗНЫХ класса на один смысл «этого объекта под текущим ключом нет».
        # Customer отвечает InvalidRequestError («No such customer»), а вот
        # подключённый аккаунт — PermissionError («key does not have access to
        # account … or that account does not exist»): чужой acct_ Stripe не
        # подтверждает даже фактом отсутствия. Это НЕ сбой связи, а ровно тот
        # ответ, ради которого проверка написана, — ловить только первый класс
        # значило бы объявить тестовый acct_ «Stripe не ответил» и замолчать
        # блокер предупреждением.
        except (stripe.InvalidRequestError, stripe.PermissionError):
            stale.append(object_id)
        except Exception as exc:
            # Сеть, протухший ключ, лимит — про остальные id ответа уже не будет,
            # и «протухших не найдено» здесь означало бы ложное «всё чисто».
            _warn(f"Stripe не ответил про {object_id} ({exc}) — проверка ссылок оборвана")
            return

    if stale:
        _err(
            f"в БД {len(stale)} из {len(rows)} ссылок на Stripe не существуют под текущим ключом "
            f"(например {stale[0]}) — это объекты другого режима. Очистите их: "
            f"UPDATE studio_billing_plans SET stripe_customer_id=NULL, stripe_subscription_id=NULL; "
            f"UPDATE online_channels SET account_id=NULL WHERE channel_type='stripe'; "
            f"DELETE FROM payment_cards;"
        )


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
    # Консоль Windows по умолчанию cp1251, а тексты проверок русские и со стрелками:
    # без этого весь скрипт валится UnicodeEncodeError на первом же `→`, то есть
    # ровно тогда, когда ему есть что сказать. `errors="replace"` — чтобы падение
    # печати никогда не было важнее самой проверки.
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            reconfigure(encoding="utf-8", errors="replace")

    print("Velora: проверка конфигурации перед боевым режимом\n")
    check_secret_key()
    check_urls()
    check_stripe_keys()
    check_webhook_secrets()
    check_billing_currency()
    check_fx_cache()
    check_smtp()
    check_platform_email()
    check_legal_docs()
    await check_stripe_account()
    await check_stripe_payment_methods()
    await check_stripe_tax()
    await check_tax_registrations()
    await check_invoice_tax_id()
    await check_stripe_catalog(sync)
    await check_db_stripe_links()

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
        "    charge.refunded, setup_intent.succeeded, customer.tax_id.updated.\n"
        "    Последнее — сверка VAT ID с VIES: без подписки на него фиктивный номер\n"
        "    НДС так и продолжит обнулять налог за счёт платформы.\n"
        "    «Events on connected accounts» ВЫКЛ.\n"
        "  * /checkout/webhook/stripe — checkout.session.completed/expired/\n"
        "    async_payment_succeeded/async_payment_failed, charge.refunded,\n"
        "    charge.dispute.created, charge.dispute.closed.\n"
        "    «Events on connected accounts» ВКЛ — без этого оплаты клиентов не проведутся."
    )
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main("--sync" in sys.argv)))
