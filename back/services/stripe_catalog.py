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

# Налоговая категория Stripe Tax для SaaS. Без неё automatic_tax не знает ставку.
TAX_CODE = "txcd_10103001"

# Налог накидывается сверху цены (B2B SaaS: в plans.py цены без НДС). Без явного
# tax_behavior Stripe отказывается считать automatic_tax по такому Price.
TAX_BEHAVIOR = "exclusive"

# Период оплаты → интервал биллинга Stripe. Максимум интервала у Stripe — 3 года,
# так что 24 месяца проходят как year×2.
_INTERVALS: dict[int, tuple[str, int]] = {
    1:  ("month", 1),
    6:  ("month", 6),
    12: ("year", 1),
    24: ("year", 2),
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
    """Price для пары тариф×период (или её комбо-половины).

    RuntimeError, а не тихий None: без Price подписку не создать, и молчаливый
    отказ превратится в 500 где-то ниже по стеку, где причина уже не видна.
    """
    key = lookup_key(plan_id, period_months, combo)
    price = await _find_price(key)
    if price is None:
        raise RuntimeError(
            f"Price {key} не заведён в Stripe. Запустите: python -m services.stripe_catalog sync"
        )
    return price.id


if __name__ == "__main__":
    import sys

    if "sync" in sys.argv:
        for key, pid in asyncio.run(sync()).items():
            print(f"{key:24} {pid}")
    else:
        # Чистые функции — без сети.
        assert lookup_key("start", 12) == "velora_start_12m"
        assert lookup_key("business", 1) == "velora_business_1m"
        assert _product_id("pro") == "velora_pro"

        # Комбо — ПАРАЛЛЕЛЬНЫЙ набор: ключи и продукты не должны совпадать с
        # подписочными, иначе sync() перетрёт полную цену половинной.
        assert lookup_key("business", 1, combo=True) == "velora_combo_business_1m"
        assert _product_id("pro", combo=True) == "velora_combo_pro"
        _keys = {lookup_key(p, m, c) for p in PLANS for m in PERIOD_DISCOUNTS for c in (False, True)}
        assert len(_keys) == len(PLANS) * len(PERIOD_DISCOUNTS) * 2, "ключи столкнулись"
        assert _product_id("pro") != _product_id("pro", combo=True)
        # Каждый период из каталога цен обязан иметь интервал Stripe, иначе
        # sync() упадёт по KeyError уже на боевом ключе.
        assert set(_INTERVALS) == set(PERIOD_DISCOUNTS), (set(_INTERVALS), set(PERIOD_DISCOUNTS))
        # 24 месяца укладываются в лимит Stripe (максимум интервала — 3 года).
        assert _INTERVALS[24] == ("year", 2)
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
