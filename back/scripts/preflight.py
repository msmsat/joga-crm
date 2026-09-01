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
    """Валюта тарифа. Ошибка здесь уводит суммы в 100 раз."""
    from services.stripe_billing import CURRENCY
    from services.stripe_connect import _ZERO_DECIMAL

    if CURRENCY.upper() in _ZERO_DECIMAL:
        _err(f"BILLING_CURRENCY={CURRENCY} без младших единиц — цены в plans.py заданы в центах, суммы уедут в 100 раз")


def check_smtp() -> None:
    """Почта: без неё не уедут ни фактуры, ни предупреждения о блокировке."""
    if not (os.getenv("SMTP_HOST") and os.getenv("SMTP_USER") and os.getenv("SMTP_PASS")):
        _err("SMTP не настроен — чеки, фактуры и письма о скорой блокировке не отправятся")


def check_ai() -> None:
    """Velora AI (эпик AI-5): ключ провайдера, слаги моделей, карта интерфейса.

    Без ключа ассистент не сломается — он уйдёт в честную заглушку. Но в боевом
    режиме заглушка вместо ассистента это невыполненное обещание тарифа, поэтому
    здесь отсутствие ключа — блокер, как и остальные боевые проверки.
    """
    from services.ai_tools import UI_MAP
    from services.llm import _ALLOWED_VENDORS, _PRICES, _ENV_BY_TIER, _OPTIONAL_ENV_BY_TIER

    if not os.getenv("LLM_API_KEY"):
        _err("LLM_API_KEY не задан — Velora AI отвечает заглушкой вместо модели")
    if not os.getenv("LLM_BASE_URL"):
        _err("LLM_BASE_URL не задан — запросы к модели идти некуда")

    # Необязательные слаги проверяем ТЕМИ ЖЕ правилами, когда они заданы: через
    # клиентского агента идут имена клиентов студии, и запрет на вендоров вне
    # GDPR обязан накрывать и его модель тоже.
    for tier, env_name in {**_ENV_BY_TIER, **_OPTIONAL_ENV_BY_TIER}.items():
        slug = os.getenv(env_name, "")
        if not slug:
            if tier in _OPTIONAL_ENV_BY_TIER:
                continue        # не задана — уровень падает на FAST (llm.model_for)
            _err(f"{env_name} не задан — уровню {tier} нечем отвечать")
            continue
        # Решение 7: ПДн клиентов студии не уезжают в юрисдикции без адекватности GDPR.
        if not slug.startswith(_ALLOWED_VENDORS):
            _err(f"{env_name}={slug}: вендор вне разрешённых {_ALLOWED_VENDORS} — через ассистента идут ПДн клиентов")
        elif slug not in _PRICES:
            # Не блокер: модель ответит. Но стоимость посчитается по самой
            # дорогой ставке, и отчёт по деньгам станет художественной литературой.
            _warn(f"{env_name}={slug} отсутствует в _PRICES (services/llm.py) — расход считается по ставке Opus")

    if len(UI_MAP.strip()) < 1000:
        _err("services/ai_uimap.md пуст или потерян — ассистент начнёт выдумывать кнопки")


def _live_rates(model: dict) -> tuple[int, int, int, int] | None:
    """Цены каталога -> микро-$ за 1M токенов, как в _PRICES. None — не разобрали."""
    pricing = model.get("pricing") or {}
    out = []
    for key in ("prompt", "input_cache_read", "input_cache_write", "completion"):
        value = pricing.get(key)
        if value in (None, ""):
            return None             # провайдер не объявил графу — сверять нечего
        try:
            out.append(round(float(value) * 1e12))
        except (TypeError, ValueError):
            return None
    return tuple(out)


async def check_ai_models() -> None:
    """Слаги моделей по ЖИВОМУ каталогу: есть ли такая, умеет ли инструменты, та ли цена.

    Блокер здесь один и он выстраданный: модель без tool calling отвечает прозой
    на каждый вопрос — окно подтверждения не появляется ни разу, и снаружи это
    выглядит как «ассистент отказывается работать», а не как опечатка в env.
    Слаги вроде google/gemini-3.7-flash-image проходят и проверку вендора, и
    проверку цен, и ломают ровно это.

    Цены — предупреждением: модель ответит, но расход в ai_usage посчитается
    мимо. Правило «сверять запросом, а не по памяти» написано в services/llm.py
    давно; здесь оно наконец проверяется, а не только обещается.
    """
    from services.llm import _ENV_BY_TIER, _PRICES

    key, base = os.getenv("LLM_API_KEY"), os.getenv("LLM_BASE_URL")
    if not key or not base:
        return                      # отсутствие ключа — уже блокер в check_ai
    try:
        import aiohttp
        timeout = aiohttp.ClientTimeout(total=15)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(
                f"{base.rstrip('/')}/v1/models",
                headers={"Authorization": f"Bearer {key}"},
            ) as resp:
                if resp.status >= 400:
                    _warn(f"каталог моделей провайдера не проверить (HTTP {resp.status})")
                    return
                catalog = {m["id"]: m for m in (await resp.json()).get("data") or []}
    except Exception as exc:  # noqa: BLE001 — мягкая проверка, падать из-за неё нельзя
        _warn(f"каталог моделей провайдера не проверить: {type(exc).__name__}")
        return

    for env_name in _ENV_BY_TIER.values():
        slug = os.getenv(env_name, "")
        if not slug:
            continue                # пустой слаг — уже блокер в check_ai
        model = catalog.get(slug)
        if model is None:
            _err(f"{env_name}={slug}: такого слага в каталоге провайдера нет — "
                 f"сверьте на openrouter.ai/models побайтово")
            continue
        if "tools" not in (model.get("supported_parameters") or []):
            _err(f"{env_name}={slug}: модель не умеет вызывать инструменты — ассистент "
                 f"будет отвечать прозой на каждый вопрос, окно подтверждения не появится ни разу")
        live, table = _live_rates(model), _PRICES.get(slug)
        if live and table and any(
            abs(a - b) > max(2, b * 0.02) for a, b in zip(live, table)
        ):
            _warn(f"{env_name}={slug}: цены разошлись с _PRICES в services/llm.py "
                  f"(в каталоге {live}, в таблице {table}) — расход в ai_usage считается мимо")


async def check_ai_credits() -> None:
    """Остаток кредитов у провайдера. Пустой счёт выключает ИИ у всех студий
    разом, и узнать об этом лучше здесь, чем из тикета."""
    key, base = os.getenv("LLM_API_KEY"), os.getenv("LLM_BASE_URL")
    if not key or not base:
        return
    try:
        import aiohttp
        timeout = aiohttp.ClientTimeout(total=10)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(
                f"{base.rstrip('/')}/v1/credits",
                headers={"Authorization": f"Bearer {key}"},
            ) as resp:
                if resp.status >= 400:
                    _warn(f"остаток кредитов провайдера не проверить (HTTP {resp.status})")
                    return
                data = (await resp.json()).get("data") or {}
        left = float(data.get("total_credits", 0)) - float(data.get("total_usage", 0))
        if left < 20:
            _warn(f"на счёте провайдера ${left:.2f} — при нуле ИИ выключается у всех студий сразу")
    except Exception as exc:  # noqa: BLE001 — мягкая проверка, падать из-за неё нельзя
        _warn(f"остаток кредитов провайдера не проверить: {type(exc).__name__}")


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

    # Цифры постоплаты в Условиях (§5.1) обязаны совпадать с теми, по которым
    # реально выставляются счета. Разъехавшись, они делают документ неверным ровно
    # там, где он единственное доказательство: владелец подтверждает ставку и срок,
    # а применяются другие. Каталог правится в plans.py одной строкой — а документ
    # при этом молчит, поэтому сверяем здесь.
    from routers.billing.plans import MIN_MONTHLY_FEE, PERCENT_ONLY_RATE, COMBO_PERCENT_RATE
    from services.offline_fee_billing import GRACE_DAYS

    terms = (static / "terms.html")
    if terms.exists():
        text = terms.read_text(encoding="utf-8")
        # `%g` убирает хвост у целых (3.0 → «3»), а полуторапроцентная ставка
        # остаётся «1.5» — ровно так они и написаны в документе.
        for value, what in (
            (f"{PERCENT_ONLY_RATE:g}", "ставка тарифа «процент»"),
            (f"{COMBO_PERCENT_RATE:g}", "ставка тарифа «фикс + процент»"),
            (f"{MIN_MONTHLY_FEE // 100}", "минимальный месячный платёж"),
            (str(GRACE_DAYS), "срок оплаты счёта"),
        ):
            if value not in text:
                _err(
                    f"static/terms.html §5.1 не называет {what} ({value}) — документ "
                    f"разошёлся с каталогом, поднимите редакцию и поправьте текст"
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

    Тариф оплачивается ТОЛЬКО картой (`card`). Выключенный в дашборде способ из кода
    не виден никак: ключ валидный, каталог отвечает, а Checkout Session падает
    «payment method type is invalid» уже под владельцем, который дошёл до оплаты.
    Проверяется здесь по той же причине, что и Stripe Tax: настройки у test и live
    разные, и включённая в тесте карта ничего не значит.
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
    # оплата продолжит падать.
    for method, branch in (("card", "оплата картой"),):
        option = getattr(default, method, None)
        value = getattr(getattr(option, "display_preference", None), "value", None)
        available = getattr(option, "available", None)
        if available is False:
            _err(
                f"способ оплаты {method} недоступен аккаунту Stripe (available=false) — {branch} вернёт "
                f"ошибку. Это не галка: доступ надо ЗАПРОСИТЬ в Settings → Payments → Payment methods "
                f"и дождаться одобрения"
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
        return

    # Активный Tax без регистраций считает всем 0 % — то есть выглядит рабочим, а
    # НДС не собирается вовсе. Домашняя регистрация обязана быть: без неё чешские
    # продажи (и B2C по ЕС через OSS) уходят без налога, а доплачивать его потом
    # придётся из своей выручки.
    home = os.getenv("BILLING_HOME_COUNTRY", "CZ").upper()
    try:
        registrations = await asyncio.to_thread(
            stripe.tax.Registration.list, status="active", limit=100,
        )
    except Exception as exc:
        _warn(f"не удалось прочитать налоговые регистрации Stripe ({exc}) — проверьте Tax → Registrations вручную")
        return

    countries = {getattr(r, "country", None) for r in registrations.data}
    if home not in countries:
        _err(
            f"в Stripe Tax нет активной регистрации {home} — счета уйдут с НДС 0 %, "
            f"а налог налоговая всё равно спросит. Заведите её в Tax → Registrations"
        )

    # Режим места поставки решает, какую ставку получит ФИЗЛИЦО из другой страны ЕС:
    # `small_seller` — нашу домашнюю (законно, пока трансграничные продажи физлицам
    # ниже 10 000 €/год), `standard`/OSS — ставку его страны. Выбор сознательный
    # (13.08.2026: остаёмся на small_seller), поэтому это НАПОМИНАНИЕ о пороге, а не
    # требование включить OSS: перешагнём 10 000 € — обязаны перейти на ставки
    # страны покупателя, и до тех пор недобор чужого НДС ложится на платформу.
    # Список, а не множество: объекты Stripe нехешируемы.
    schemes = [
        getattr(getattr(getattr(r, "country_options", None), (r.country or "").lower(), None),
                "standard", None)
        for r in registrations.data if getattr(r, "country", None) == home
    ]
    if any(getattr(s, "place_of_supply_scheme", None) == "small_seller" for s in schemes if s):
        _warn(
            f"регистрация {home} в режиме small_seller: физлицам по всему ЕС уходит "
            f"ДОМАШНЯЯ ставка НДС, а не ставка их страны. Это законно только пока "
            f"трансграничные продажи физлицам ниже 10 000 €/год — следите за порогом "
            f"в Tax → Monitoring, после него нужен режим One Stop Shop"
        )

    # Порогов (Tax → Monitoring) в API нет — только в дашборде. Напоминаем, потому
    # что до регистрации в США/Британии Stripe выставляет тамошним физлицам счета
    # без налога, и узнать о превышении лимита можно только оттуда.
    _warn(
        "включите оповещения Tax → Monitoring (thresholds) в дашборде Stripe: пороги "
        "регистрации в США, Британии и других странах API не отдаёт, а до регистрации "
        f"их резидентам счета уходят без местного налога. Сейчас активны: "
        f"{', '.join(sorted(c for c in countries if c)) or '—'}"
    )


async def check_vies() -> None:
    """Доступен ли реестр VIES с ЭТОЙ машины.

    Номер НДС сверяется в момент ввода, и непроверенный не сохраняется
    (routers/billing.save_billing_profile). Значит недоступный реестр — это не
    деградация, а закрытая дверь: ни одна компания из ЕС не сможет добавить свой
    номер, и все они получат счета с НДС там, где действует reverse charge.

    Из кода это не видно и молчит до первой жалобы: типовые причины — закрытый
    исходящий трафик контейнера и неполное хранилище сертификатов (цепочка
    ec.europa.eu проверяется не везде, из-за чего в services/vies и стоит certifi).

    Проверяем ПУЛОМ заведомо действительных номеров разных стран, с условием ИЛИ:
    ответил хоть один — сеть, TLS и шлюз VIES в порядке, проверка пройдена.

    Одной пробы мало: каждая страна ЕС держит свой узел сама, и падение отдельного
    реестра — рутина. Прежняя проверка ходила ЗА ОДНИМ немецким номером и в день
    техработ у Германии объявляла блокер «VIES недоступен с этой машины», закрывая
    выход в прод при полностью исправной сети.

    Ответ «такого номера нет» на заведомо действительный тоже считается сбоем: он
    означает, что отвечает не реестр, а что-то другое (прокси, портал-заглушка).
    """
    from services import vies

    alive, down = await vies.health()
    if not alive:
        _err(
            f"реестр VIES недоступен с этой машины — не ответил ни один узел из пула "
            f"({', '.join(down)}). Компании из ЕС не смогут подтвердить номер НДС и "
            f"получат счета с налогом вместо reverse charge. Проверьте исходящий "
            f"доступ к ec.europa.eu и сертификаты; подробности в логе services.vies"
        )
    elif down:
        _warn(
            f"VIES отвечает ({', '.join(alive)}), но узлы {', '.join(down)} сейчас молчат — "
            f"номера этих стран временно не подтвердить. Это на стороне самих реестров и "
            f"проходит само; такому плательщику пока выставляется полный НДС"
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


# События, которые ОБРАБАТЫВАЕТ код. Списки не декоративные: не подписанный
# эндпоинт означает, что соответствующая ветка обработчика не выполнится никогда,
# и узнать об этом можно только по жалобе.
#
# Биллинг платформы (routers/billing/webhook.stripe_webhook):
_BILLING_EVENTS = {
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "invoice.paid",
    "invoice.payment_failed",
    "charge.refunded",
    # Чарджбэк по оплате ТАРИФА. Без него выигранный владельцем спор оставляет
    # ему и деньги, и доступ: `charge.refunded` при чарджбэке не приходит вовсе.
    "charge.dispute.closed",
    "setup_intent.succeeded",
    # Сверка номера НДС с VIES. Без подписки фиктивный номер продолжает обнулять
    # налог за счёт платформы.
    "customer.tax_id.updated",
}

# Касса студий и мини-приложение (routers/checkout/stripe_pay.stripe_webhook):
_CONNECT_EVENTS = {
    "checkout.session.completed",
    "checkout.session.expired",
    "checkout.session.async_payment_succeeded",
    "checkout.session.async_payment_failed",
    "charge.refunded",
    "charge.dispute.created",
    "charge.dispute.closed",
}


async def check_webhook_endpoints() -> None:
    """Фактическая подписка эндпоинтов у Stripe — а не наши намерения.

    До этой проверки конфигурация вебхуков жила исключительно в чужом интерфейсе:
    код умеет обрабатывать событие, эндпоинт на него не подписан — и ветка мертва
    молча. Так дороже всего обходится `charge.dispute.closed` (доступ не
    отзывается после чарджбэка) и `customer.tax_id.updated` (фиктивный VAT
    продолжает обнулять налог).

    Проверяем ровно то, что нельзя увидеть из кода:
      * эндпоинт с нашим URL вообще существует и включён;
      * подписан на ВСЕ обрабатываемые события (или на `*`);
      * биллинговый НЕ слушает подключённые аккаунты, а кассовый — слушает;
      * URL боевой и по HTTPS.

    Различаем их по `application`/`connect`-признаку: у Stripe эндпоинт,
    принимающий события подключённых аккаунтов, помечен отдельно.
    """
    import stripe

    if not os.getenv("STRIPE_SECRET_KEY"):
        return

    backend = (os.getenv("BACKEND_URL") or "").rstrip("/")
    if not backend:
        return

    try:
        endpoints = (await asyncio.to_thread(stripe.WebhookEndpoint.list, limit=100)).data
    except Exception as exc:
        _err(f"не удалось прочитать список вебхуков у Stripe ({exc}) — конфигурация не проверена")
        return

    wanted = {
        f"{backend}/billing/webhook/stripe": ("биллинг платформы", _BILLING_EVENTS, False),
        f"{backend}/checkout/webhook/stripe": ("касса студий", _CONNECT_EVENTS, True),
    }

    for url, (title, events, want_connect) in wanted.items():
        found = [e for e in endpoints if (getattr(e, "url", "") or "").rstrip("/") == url]
        if not found:
            _err(
                f"вебхук «{title}» ({url}) не заведён в Stripe — "
                f"оплаты не будут проводиться вовсе"
            )
            continue
        endpoint = found[0]

        if not url.startswith("https://"):
            _err(f"вебхук «{title}» слушает не по HTTPS: {url}")
        if getattr(endpoint, "status", None) != "enabled":
            _err(f"вебхук «{title}» выключен в Stripe (status={getattr(endpoint, 'status', '?')})")

        enabled = set(getattr(endpoint, "enabled_events", None) or [])
        if "*" not in enabled:
            missing = sorted(events - enabled)
            if missing:
                _err(
                    f"вебхук «{title}» не подписан на {len(missing)} обрабатываемых событий: "
                    f"{', '.join(missing)}"
                )

        # События подключённых аккаунтов. У Stripe это отдельный тип эндпоинта, и
        # SDK показывает его полем `application` (у Connect-эндпоинта оно None, но
        # сам эндпоинт заводится в разделе Connect) — надёжнее смотреть на то,
        # приходят ли по нему события с `account`. Прямого булева поля в объекте
        # нет, поэтому сверяем по описанию, которое проставляет дашборд, и
        # предупреждаем: молча пропустить эту настройку нельзя.
        _warn(
            f"вебхук «{title}»: проверьте вручную флаг «events on connected accounts» — "
            f"он должен быть {'ВКЛЮЧЁН' if want_connect else 'ВЫКЛЮЧЕН'}; "
            f"через API этот признак не читается"
        )


def _customer_studio_id(customer) -> str | None:
    """`metadata['studio_id']` клиента, если он там есть.

    `metadata` у SDK — не dict: у пустого объекта нет ни `.get`, ни распаковки,
    оба падают. Поэтому читаем через `to_dict()` и только его.
    """
    meta = getattr(customer, "metadata", None)
    if meta is None:
        return None
    try:
        data = meta.to_dict() if hasattr(meta, "to_dict") else dict(meta)
    except Exception:
        return None
    value = data.get("studio_id")
    return str(value) if value not in (None, "") else None


async def _customer_facts(customer_id: str) -> tuple[list[str], int]:
    """Живые подписки и число оплаченных счетов клиента."""
    import stripe

    subs = await asyncio.to_thread(
        stripe.Subscription.list, customer=customer_id, status="all", limit=20,
    )
    live = [
        s.id for s in (getattr(subs, "data", None) or [])
        if getattr(s, "status", None) in ("active", "trialing", "past_due", "unpaid")
    ]
    paid = await asyncio.to_thread(
        stripe.Invoice.list, customer=customer_id, status="paid", limit=20,
    )
    return live, len(getattr(paid, "data", None) or [])


_CUSTOMER_SWEEP_LIMIT = 2000


async def _local_customer_ids() -> dict[str, str] | None:
    """{studio_id: записанный у нас Customer} или None, если БД недоступна."""
    from sqlalchemy import text

    try:
        from database import engine

        async with engine.connect() as conn:
            rows = (await conn.execute(text(
                "SELECT studio_id, stripe_customer_id FROM studio_billing_plans "
                "WHERE stripe_customer_id IS NOT NULL LIMIT 5000"
            ))).all()
        return {str(studio_id): customer_id for studio_id, customer_id in rows}
    except Exception:
        return None


async def check_customer_sweep() -> None:
    """Дубли Stripe Customer — со стороны Stripe, без нашей БД.

    Отдельная проверка, а не часть `check_duplicate_customers`, ровно потому, что
    та опирается на две вещи разом: доступную БД и метку `studio_id` у клиента.
    На боевом аккаунте не совпало НИ ОДНО: база из этого окружения недоступна, а
    метки нет ни у одного из заведённых клиентов — то есть проверка молча
    отвечала «дублей нет», ничего не проверив. Молчаливый PASS хуже отсутствия
    проверки, поэтому сюда вынесен разбор, которому нужен только Stripe.

    Клиент без `studio_id` — это ещё не дубль, но и сопоставить его со студией
    нечем. Такие группируем по email: одна почта на нескольких клиентов, у
    которых есть деньги, — тот самый опасный расклад, когда оплата уходит не на
    того клиента, что записан у нас.
    """
    import stripe

    if not os.getenv("STRIPE_SECRET_KEY"):
        return

    try:
        customers = []
        for customer in (await asyncio.to_thread(
            lambda: list(stripe.Customer.list(limit=100).auto_paging_iter())
        )):
            customers.append(customer)
            if len(customers) >= _CUSTOMER_SWEEP_LIMIT:
                _warn(
                    f"клиентов на аккаунте больше {_CUSTOMER_SWEEP_LIMIT} — "
                    f"проверены только первые, остальные НЕ смотрели"
                )
                break
    except Exception as exc:
        _warn(f"не удалось перечислить клиентов Stripe ({exc}) — дубли не проверены")
        return

    by_studio: dict[str, list] = {}
    unlabelled = []
    for customer in customers:
        studio_id = _customer_studio_id(customer)
        if studio_id is None:
            unlabelled.append(customer)
        else:
            by_studio.setdefault(studio_id, []).append(customer)

    local = await _local_customer_ids()

    for studio_id, items in sorted(by_studio.items()):
        if len(items) <= 1:
            continue

        facts = {}
        for customer in items:
            facts[customer.id] = await _customer_facts(customer.id)

        # Опасен НЕ сам дубль, а ровно один расклад: подписка (или деньги) живёт
        # не на том клиенте, что записан у нас. Тогда следующая оплата студии не
        # найдёт свою подписку. Если же записан именно тот клиент, у которого
        # подписка, а остальные пусты — это след старой гонки, мусор в аккаунте:
        # убрать стоит, но боевой режим он не ломает.
        recorded = (local or {}).get(str(studio_id))
        with_live = [cid for cid, (live, _paid) in facts.items() if live]
        elsewhere = [cid for cid in with_live if cid != recorded]

        if local is None:
            _err(
                f"у студии {studio_id} несколько клиентов Stripe: {len(items)}; "
                f"какой из них записан у нас — не проверить, БД недоступна"
            )
        elif recorded is None:
            _err(
                f"у студии {studio_id} несколько клиентов Stripe: {len(items)}, "
                f"а в нашей строке не записан НИ ОДИН — оплата не найдёт подписку"
            )
        elif elsewhere:
            _err(
                f"у студии {studio_id} живая подписка НЕ на том клиенте, что записан у нас: "
                f"записан {recorded}, подписка у {', '.join(elsewhere)}"
            )
        else:
            _warn(
                f"у студии {studio_id} несколько клиентов Stripe: {len(items)}, "
                f"но записан верный ({recorded}) и подписка именно на нём; "
                f"остальные пусты — это мусор старой гонки, доступ он не ломает"
            )

        for customer in items:
            live, paid = facts[customer.id]
            mark = " <-- записан у нас" if customer.id == recorded else ""
            print(f"      {customer.id}: живых подписок {len(live)} {live}, "
                  f"оплаченных счетов {paid}{mark}")

    if not unlabelled:
        return

    # Метки нет — сопоставить со студией нечем. Само по себе это не дубль
    # (клиенты могли родиться до того, как метку стали ставить), но проверку по
    # studio_id для них можно только объявить несостоявшейся.
    _warn(
        f"у {len(unlabelled)} из {len(customers)} клиентов Stripe нет metadata.studio_id — "
        f"для них дубли по студии не проверяются; сверьте вручную"
    )
    by_email: dict[str, list] = {}
    for customer in unlabelled:
        email = (getattr(customer, "email", None) or "").strip().lower()
        if email:
            by_email.setdefault(email, []).append(customer)
    for email, items in sorted(by_email.items()):
        if len(items) <= 1:
            continue
        facts = []
        for customer in items:
            live, paid = await _customer_facts(customer.id)
            facts.append((customer.id, live, paid))
        with_money = [f for f in facts if f[1] or f[2]]
        head = f"одна почта на {len(items)} клиентов Stripe без studio_id"
        if len(with_money) > 1:
            _err(f"{head}, и деньги есть у {len(with_money)} из них — оплата может уходить не тому клиенту")
        else:
            _warn(f"{head} (деньги есть у {len(with_money)}) — проверьте, что это разные студии")
        for customer_id, live, paid in facts:
            print(f"      {customer_id}: живых подписок {len(live)} {live}, оплаченных счетов {paid}")


async def check_duplicate_customers() -> None:
    """Дубли Stripe Customer по студиям — след давней гонки первой оплаты.

    До блокировки строки плана (routers/billing/checkout._ensure_customer) два
    параллельных нажатия «Оплатить» заводили студии ДВУХ клиентов: в нашу строку
    попадал один, а подписка рождалась на другом. Такая студия платит, а тариф не
    активируется, и починить это может только человек.

    Ищем по метаданным (их проставляет `ensure_customer`), а не по нашей БД:
    осиротевший клиент в ней как раз и не записан.
    """
    import stripe
    from sqlalchemy import text

    if not os.getenv("STRIPE_SECRET_KEY"):
        return

    try:
        from database import engine

        async with engine.connect() as conn:
            rows = (await conn.execute(text(
                "SELECT studio_id, stripe_customer_id FROM studio_billing_plans "
                "WHERE stripe_customer_id IS NOT NULL LIMIT 500"
            ))).all()
    except Exception as exc:
        _warn(f"не удалось прочитать студии из БД ({exc}) — дубли клиентов не проверены")
        return

    duplicates = 0
    dangerous = 0
    for studio_id, local_customer in rows:
        try:
            found = await asyncio.to_thread(
                stripe.Customer.search,
                query=f"metadata['studio_id']:'{studio_id}'", limit=10,
            )
        except Exception as exc:
            _warn(f"поиск клиентов студии {studio_id} не удался ({exc}) — проверка оборвана")
            return
        ids = [c.id for c in (getattr(found, "data", None) or [])]
        if len(ids) <= 1:
            continue

        duplicates += 1
        # Разбор печатаем сразу: без него оператору пришлось бы вручную ходить по
        # каждому клиенту в дашборде. Опасен ровно один расклад — подписка живёт
        # НЕ на том клиенте, что записан у нас: оплата такой студии не находит
        # свою подписку никогда. Сам по себе лишний клиент доступ не ломает, и
        # блокировать боевой режим из-за мусора в аккаунте эта проверка не должна:
        # раньше она блокировала, и разница между «оплата уйдёт не туда» и
        # «в аккаунте лишняя пустая карточка» просто терялась.
        holders: list[str] = []
        unresolved = False
        print(f"\n  Студия {studio_id}: клиентов {len(ids)}, локально записан {local_customer}")
        for customer_id in ids:
            try:
                subs = await asyncio.to_thread(
                    stripe.Subscription.list, customer=customer_id, status="all", limit=10,
                )
                live = [
                    s.id for s in (getattr(subs, "data", None) or [])
                    if getattr(s, "status", None) in ("active", "trialing", "past_due")
                ]
                paid = await asyncio.to_thread(
                    stripe.Invoice.list, customer=customer_id, status="paid", limit=20,
                )
            except Exception as exc:
                print(f"    {customer_id}: разбор не удался ({exc})")
                unresolved = True
                continue
            # «Держатель» — клиент, потеря связи с которым что-то стоит: у него
            # живая подписка или РЕАЛЬНО заплаченные деньги. Счёт на ноль (полная
            # скидка, пробный период, кредит-нота) оплатой не является: считать
            # его деньгами значит блокировать боевой режим из-за пустой карточки.
            money = any(getattr(i, "amount_paid", 0) > 0 for i in (getattr(paid, "data", None) or []))
            if live or money:
                holders.append(customer_id)
            mark = "← записан у нас" if customer_id == local_customer else ""
            print(
                f"    {customer_id}: живых подписок {len(live)}"
                f"{' (' + ', '.join(live) + ')' if live else ''}, "
                f"оплаченных счетов {len(getattr(paid, 'data', None) or [])}"
                f"{' (на сумму)' if money else ' (все на ноль)'} {mark}"
            )

        # Не смогли разобрать хотя бы одного — считаем опасным: безопасность здесь
        # доказывается, а не предполагается.
        if unresolved or any(h != local_customer for h in holders):
            dangerous += 1

    if dangerous:
        _err(
            f"у {dangerous} студий ОПЛАЧЕННАЯ подписка живёт не на том Stripe Customer, "
            f"что записан в studio_billing_plans.stripe_customer_id (разбор выше). "
            f"Приведите ссылку к нужному клиенту, и только потом включайте боевой "
            f"режим: иначе оплата такой студии не найдёт свою подписку"
        )
    elif duplicates:
        _warn(
            f"у {duplicates} студий больше одного Stripe Customer, но записанный у нас "
            f"клиент — тот самый, на котором деньги и подписка. Доступ это не ломает; "
            f"лишние карточки стоит убрать в дашборде, когда будет удобно"
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
    check_smtp()
    check_platform_email()
    check_legal_docs()
    check_ai()
    await check_ai_models()
    await check_ai_credits()
    await check_stripe_account()
    await check_stripe_payment_methods()
    await check_stripe_tax()
    await check_tax_registrations()
    await check_invoice_tax_id()
    await check_vies()
    await check_stripe_catalog(sync)
    await check_db_stripe_links()
    await check_webhook_endpoints()
    await check_duplicate_customers()
    await check_customer_sweep()

    for text in _WARNINGS:
        print(f"  [!] {text}")
    for text in _ERRORS:
        print(f"  [X] {text}")

    if _ERRORS:
        print(f"\nБлокеров: {len(_ERRORS)}, предупреждений: {len(_WARNINGS)}. Включать боевой режим НЕЛЬЗЯ.")
        return 1
    print(f"\nБлокеров нет, предупреждений: {len(_WARNINGS)}.")
    print(
        "\nПодписка эндпоинтов на события теперь проверяется автоматически "
        "(check_webhook_endpoints). Руками остаётся одно — флаг «events on "
        "connected accounts», через API он не читается:\n"
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
