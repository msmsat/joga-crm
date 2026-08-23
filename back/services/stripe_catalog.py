"""Каталог тарифов Velora в Stripe: Product на тариф, Price на пару тариф×период.

Цены живут в `routers/billing/plans.py` — это единственный источник истины. Здесь
только заливка их в Stripe и обратный резолв `lookup_key` → `price_id`, чтобы id
Prices не приходилось держать в конфиге и синхронизировать руками.

Prices в Stripe НЕИЗМЕНЯЕМЫ. Поменялась цена — создаётся новый Price, а
`transfer_lookup_key` переносит на него ключ и архивирует старый. Уже существующие
подписки остаются на старом Price (грандфазеринг) — это штатное поведение Stripe,
а не баг: людям, купившим по старой цене, её и оставляем.

Запуск синхронизации:  python -m services.stripe_catalog sync
"""
import asyncio
import logging
import os

import stripe
from dotenv import load_dotenv

from routers.billing.plans import PLANS, PERIOD_DISCOUNTS, amount_for, combo_amount_for

load_dotenv()

logger = logging.getLogger(__name__)

stripe.api_key = os.getenv("STRIPE_SECRET_KEY", "")
CURRENCY = os.getenv("BILLING_CURRENCY", "eur").lower()

# Налоговая категория и способ обложения живут в services/stripe_billing — там же
# ими помечаются позиции разовых счетов (комиссия, продление). Держать вторую копию
# здесь значит однажды обложить тариф иначе, чем комиссию, у одного продавца.
from services.stripe_billing import TAX_BEHAVIOR, TAX_CODE  # noqa: E402

# Период оплаты → интервал биллинга Stripe.
_INTERVALS: dict[int, tuple[str, int]] = {
    1:  ("month", 1),
    3:  ("month", 3),
    6:  ("month", 6),
    12: ("year", 1),
}


def lookup_key(plan_id: str, period_months: int, combo: bool = False) -> str:
    """Стабильный ключ Price. Префикс velora_ — чтобы не столкнуться с ценами,
    заведёнными в том же аккаунте под что-то другое.

    `combo` даёт ПАРАЛЛЕЛЬНЫЙ ключ (`velora_combo_pro_1m`) на половинную цену:
    на тарифе «фикс + процент» студия платит подпиской половину, вторую половину
    платформа добирает процентом с транзакций.
    """
    prefix = "velora_combo" if combo else "velora"
    return f"{prefix}_{plan_id}_{period_months}m"


def parse_lookup_key(key: str | None) -> tuple[str, int, bool] | None:
    """Обратное к `lookup_key`: `velora_combo_pro_12m` → ("pro", 12, True). None — не наш ключ.

    Нужно, чтобы узнать тариф и период ЖИВОЙ подписки, не держа их второй копией у
    себя: при смене тарифной модели (routers/billing/router.activate_model) подписку
    надо перевести на парный Price того же тарифа и периода, а прислать их в теле
    запроса фронт обязан не всегда.
    """
    if not key or not key.startswith("velora_"):
        return None
    combo = key.startswith("velora_combo_")
    rest = key[len("velora_combo_"):] if combo else key[len("velora_"):]
    plan_id, _, period = rest.rpartition("_")
    if plan_id not in PLANS or not period.endswith("m"):
        return None
    try:
        months = int(period[:-1])
    except ValueError:
        return None
    return (plan_id, months, combo) if months in PERIOD_DISCOUNTS else None


def _product_id(plan_id: str, combo: bool = False) -> str:
    """Product'у id задаём сами — тогда синхронизация идемпотентна без поиска.

    У комбо СВОЙ Product, а не общий с подпиской: имя продукта Stripe печатает в
    фактуре, и «Velora Pro» на половинную сумму бухгалтерия студии не сведёт.
    """
    return f"velora_combo_{plan_id}" if combo else f"velora_{plan_id}"


async def _ensure_product(plan_id: str, name: str, combo: bool = False) -> str:
    product_id = _product_id(plan_id, combo)
    try:
        await asyncio.to_thread(stripe.Product.retrieve, product_id)
    except stripe.InvalidRequestError:
        await asyncio.to_thread(
            stripe.Product.create,
            id=product_id,
            name=f"Velora {name} (фикс + %)" if combo else f"Velora {name}",
            tax_code=TAX_CODE,
        )
        logger.info("Stripe catalog: создан продукт %s", product_id)
    return product_id


async def _find_price(key: str):
    """Активный Price по ключу или None."""
    found = await asyncio.to_thread(
        stripe.Price.list, lookup_keys=[key], active=True, limit=1,
    )
    return found.data[0] if found.data else None


async def _ensure_price(
    product_id: str, plan_id: str, period_months: int, combo: bool = False,
) -> str:
    key = lookup_key(plan_id, period_months, combo)
    amount = combo_amount_for(plan_id, period_months) if combo else amount_for(plan_id, period_months)
    interval, interval_count = _INTERVALS[period_months]

    existing = await _find_price(key)
    # `recurring` отдельной переменной, а не цепочкой через existing напрямую:
    # у разового Price это поле None, и прямой доступ к .interval уронил бы весь
    # sync() посреди цикла с AttributeError. Такой Price под нашим ключом — чужой
    # мусор; проваливаемся ниже и забираем ключ себе новым recurring-Price через
    # transfer_lookup_key.
    recurring = getattr(existing, "recurring", None) if existing is not None else None
    if recurring is not None and (
        existing.unit_amount == amount
        and existing.currency == CURRENCY
        and recurring.interval == interval
        and recurring.interval_count == interval_count
        # Price без tax_behavior роняет automatic_tax при создании подписки, а
        # поменять поле у существующего Price нельзя — только пересоздать.
        and existing.tax_behavior == TAX_BEHAVIOR
    ):
        return existing.id

    # Цена/валюта/интервал разошлись с каталогом — Price неизменяем, заводим новый.
    # transfer_lookup_key снимает ключ со старого и архивирует его сам.
    price = await asyncio.to_thread(
        stripe.Price.create,
        product=product_id,
        currency=CURRENCY,
        unit_amount=amount,
        recurring={"interval": interval, "interval_count": interval_count},
        tax_behavior=TAX_BEHAVIOR,
        lookup_key=key,
        transfer_lookup_key=True,
    )
    logger.info("Stripe catalog: создан price %s (%s, %s)", price.id, key, amount)
    return price.id


async def sync() -> dict[str, str]:
    """Привести каталог Stripe в соответствие с plans.py. Идемпотентно.

    Заливает ДВА набора: полные цены подписки и половинные цены комбо. Оба нужны
    сразу — тариф студии переключается кнопкой в интерфейсе, и Price под новый
    режим обязан существовать до того, как владелец нажмёт «Оплатить».
    """
    out: dict[str, str] = {}
    for plan_id, plan in PLANS.items():
        for combo in (False, True):
            product_id = await _ensure_product(plan_id, plan["name"], combo)
            for period_months in PERIOD_DISCOUNTS:
                out[lookup_key(plan_id, period_months, combo)] = await _ensure_price(
                    product_id, plan_id, period_months, combo,
                )
    return out


async def price_id(plan_id: str, period_months: int, combo: bool = False) -> str:
    """Price для пары тариф×период (или её комбо-половины). Заводит недостающий.

    Раньше здесь был RuntimeError с просьбой запустить `sync` руками. Это значило,
    что переезд на БОЕВОЙ аккаунт Stripe ломал первую же оплату: Prices из тестового
    режима не переносятся, каталог на живом аккаунте пуст, и про забытый ручной шаг
    узнавала студия, а не мы.

    Заводим на месте тем же кодом, что и `sync()`: цены живут в plans.py, операция
    идемпотентна (`lookup_key` + `transfer_lookup_key`), а параллельные вызовы
    сходятся на одном ключе. `sync()` остаётся — им удобно залить каталог заранее и
    увидеть его целиком, но обязательным шагом он больше не является.
    """
    if plan_id not in PLANS or period_months not in PERIOD_DISCOUNTS:
        raise RuntimeError(f"Неизвестный тариф или период: {plan_id}/{period_months}")

    key = lookup_key(plan_id, period_months, combo)
    price = await _find_price(key)
    if price is not None:
        return price.id

    logger.warning("Stripe catalog: Price %s не найден — заводим на месте", key)
    product_id = await _ensure_product(plan_id, PLANS[plan_id]["name"], combo)
    return await _ensure_price(product_id, plan_id, period_months, combo)


if __name__ == "__main__":
    import sys

    if "sync" in sys.argv:
        for key, pid in asyncio.run(sync()).items():
            print(f"{key:24} {pid}")
    else:
        # Чистые функции — без сети.
        assert lookup_key("s2", 12) == "velora_s2_12m"
        assert lookup_key("unlimited", 1) == "velora_unlimited_1m"
        assert _product_id("s15") == "velora_s15"

        # Комбо — ПАРАЛЛЕЛЬНЫЙ набор: ключи и продукты не должны совпадать с
        # подписочными, иначе sync() перетрёт полную цену половинной.
        assert lookup_key("unlimited", 1, combo=True) == "velora_combo_unlimited_1m"
        assert _product_id("s15", combo=True) == "velora_combo_s15"
        _keys = {lookup_key(p, m, c) for p in PLANS for m in PERIOD_DISCOUNTS for c in (False, True)}
        assert len(_keys) == len(PLANS) * len(PERIOD_DISCOUNTS) * 2, "ключи столкнулись"
        assert _product_id("s15") != _product_id("s15", combo=True)

        # parse_lookup_key обязан быть точным обратным к lookup_key на ВСЁМ каталоге:
        # по нему activate_model выбирает Price для живой подписки, и ошибка здесь
        # означает смену тарифа студии на чужой.
        for _p in PLANS:
            for _m in PERIOD_DISCOUNTS:
                for _c in (False, True):
                    assert parse_lookup_key(lookup_key(_p, _m, _c)) == (_p, _m, _c)
        # Чужой мусор в ключе не должен читаться как наш тариф.
        assert parse_lookup_key(None) is None
        assert parse_lookup_key("") is None
        assert parse_lookup_key("stripe_default_price") is None
        assert parse_lookup_key("velora_unknown_1m") is None    # нет такого плана
        assert parse_lookup_key("velora_s2_24m") is None        # нет такого периода
        assert parse_lookup_key("velora_s2_xm") is None         # период не число
        assert parse_lookup_key("velora_s2") is None            # без периода
        # Каждый период из каталога цен обязан иметь интервал Stripe, иначе
        # sync() упадёт по KeyError уже на боевом ключе.
        assert set(_INTERVALS) == set(PERIOD_DISCOUNTS), (set(_INTERVALS), set(PERIOD_DISCOUNTS))
        assert _INTERVALS[3] == ("month", 3)
        assert _INTERVALS[12] == ("year", 1)
        # Валюта тарифа обязана быть с младшими единицами: цены в plans.py — центы.
        from services.stripe_connect import _ZERO_DECIMAL
        assert CURRENCY.upper() not in _ZERO_DECIMAL, f"BILLING_CURRENCY={CURRENCY} без младших единиц"

        # Регрессия на обрыв sync(): у разового Price recurring = None, и обращение
        # к .interval раньше роняло весь прогон. Проверяем сам паттерн доступа.
        import inspect
        _src = inspect.getsource(_ensure_price)
        assert "existing.recurring.interval" not in _src, "recurring читается без защиты"
        assert "getattr(existing, \"recurring\", None)" in _src
        print("stripe_catalog self-check ok")
