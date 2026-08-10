# Настоящая оплата тарифа: EUR + Stripe Subscriptions + IBAN — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить фейковую IBAN-ветку оплаты тарифа настоящим банковским переводом через Stripe, переведя биллинг с разовых платежей на Stripe Subscriptions в EUR.

**Architecture:** Stripe — источник истины о подписке, сроке и статусе; наша БД зеркалит их из вебхука. Карта и IBAN — не две интеграции, а два значения `collection_method`/`payment_settings` одной подписки на студию. Контракты `POST /billing/checkout` и `POST /billing/checkout/iban` сохраняют форму ответа, чтобы фронт не правился.

**Tech Stack:** Python 3.14, FastAPI, SQLAlchemy (asyncpg), Alembic, Pydantic, `stripe` 15.4.0.

**Спека:** [docs/superpowers/specs/2026-08-07-billing-stripe-subscriptions-iban-design.md](../specs/2026-08-07-billing-stripe-subscriptions-iban-design.md)

## Global Constraints

- **Валюта — `eur`.** `BILLING_CURRENCY=eur`. Stripe принимает банковские переводы только в EUR/GBP/USD/JPY/MXN/IDR; CZK не поддерживается.
- **Цены (центы/мес):** Старт `3900`, Pro `9900`, Business `23900`. Скидки периода не меняются: `{1: 0.0, 6: 0.20, 12: 0.30, 24: 0.40}`.
- **IBAN выпускается в Германии:** `bank_transfer.eu_bank_transfer.country = "DE"`.
- **Tax code SaaS:** `txcd_10103001`. `automatic_tax={"enabled": True}` на каждой подписке и Checkout Session.
- **Формы ответов `CheckoutResponse` и `IbanCheckoutResponse` не ломать** — фронт не правится. В `IbanCheckoutResponse` можно только ДОБАВЛЯТЬ необязательные поля.
- **Паттерн проекта:** каждый тронутый модуль сохраняет/получает `if __name__ == "__main__":` self-check с `assert`. Запуск: `python -m <module>` из `back/`.
- **Тесты запускать ТОЛЬКО пофайлово** (`pytest back/tests/test_x.py`): они пишут в dev-БД, а тесты уведомлений шлют реальные письма. Всю папку не гонять.
- **`StripeObject` — не dict.** У него нет `.get()`, а `obj["нет_такого"]` кидает `KeyError`. Доступ к необязательным полям только `getattr(obj, "field", default)`.
- **Вебхук всегда отвечает 200** на валидное событие. 4xx/5xx заставят Stripe ретраить уже обработанное.
- **Git:** по `CLAUDE.md` коммиты только с явного разрешения пользователя. Шаги «Commit» ниже выполнять, спросив подтверждение на первом из них.
- **Никогда** не запускать `git stash`, `git reset`, `git checkout --`, `git restore` в этом репозитории.

---

## File Structure

| Файл | Ответственность | Действие |
|---|---|---|
| `back/routers/billing/plans.py` | Каталог тарифов: цены, лимиты, скидки | Изменить (цены в EUR + self-check) |
| `back/models/settings.py` | `StudioBillingPlan`, `BillingInvoice` | Изменить (+4 колонки) |
| `back/models/studio.py` | `Studio` | Изменить (+3 колонки для Stripe Tax) |
| `back/migrations/versions/<hash>_billing_stripe_subscriptions.py` | Схема БД | Создать |
| `back/schemas/settings/general.py` | Схемы профиля студии | Изменить (+3 поля) |
| `back/routers/settings/general.py` | Чтение/запись профиля студии | Изменить |
| `back/services/stripe_catalog.py` | Products/Prices в Stripe, резолв `lookup_key` → `price_id` | Создать |
| `back/services/stripe_billing.py` | Клиент Stripe для подписок платформы | Переписать |
| `back/routers/billing/webhook.py` | Приём событий подписок, зеркалирование в БД | Переписать |
| `back/routers/billing/checkout.py` | Эндпоинты создания оплаты | Переписать |
| `back/routers/billing/router.py` | Чтение биллинга, сверка, экспорт | Изменить точечно |
| `back/dependencies.py` | Гейт подписки перед разделами данных | Изменить (учесть статус, не только дату) |
| `back/tests/test_billing_subscription.py` | Сквозная проверка IBAN-ветки | Создать |

---

### Task 1: Цены в EUR

**Files:**
- Modify: `back/routers/billing/plans.py`
- Modify: `back/.env.example:39`
- Modify: `docs/TZ/FUNCTIONAL.md` (§2.14), `CLAUDE.md` (§2.14)

**Interfaces:**
- Consumes: ничего.
- Produces: `PLANS[plan_id]["price"]` в центах EUR; `amount_for(plan_id, period_months) -> int` (сигнатура не меняется); `COMBO_FIXED[plan_id]` пересчитан автоматически.

**Контекст:** фронт цены не хранит — `front/src/pages/dashboard/Billing/constants.ts` содержит только цвета и списки фич, суммы приходят из `GET /billing/plans`. Правки фронта в этой задаче нет.

- [ ] **Шаг 1: Написать падающий self-check**

В конец `back/routers/billing/plans.py` добавить:

```python
if __name__ == "__main__":
    # Итоговые суммы к оплате в центах EUR (спека §4.1).
    assert amount_for("start", 1) == 3900
    assert amount_for("start", 6) == 18720
    assert amount_for("start", 12) == 32760
    assert amount_for("start", 24) == 56160
    assert amount_for("pro", 1) == 9900
    assert amount_for("pro", 12) == 83160
    assert amount_for("business", 24) == 344160

    # Скидка за период обязана быть выгодной: длинный период дешевле помесячного.
    for _pid in PLANS:
        _monthly = PLANS[_pid]["price"]
        for _months in (6, 12, 24):
            assert amount_for(_pid, _months) < _monthly * _months, (_pid, _months)

    # Комбо-фикс производный от цены подписки — не константа, которую забудут обновить.
    assert COMBO_FIXED["pro"] == 4950
    assert COMBO_FIXED["business"] == 11950
    print("plans self-check ok")
```

- [ ] **Шаг 2: Убедиться, что self-check падает**

Run: `cd back && python -m routers.billing.plans`
Expected: `AssertionError` на первой же строке — сейчас `amount_for("start", 1)` возвращает `99000` (CZK).

- [ ] **Шаг 3: Поменять цены**

В `back/routers/billing/plans.py` заменить словарь `PLANS`:

```python
# id -> {name, price (центы EUR/мес), limits {staff, clients}}; None = безлимит.
PLANS: dict[str, dict] = {
    "start":    {"name": "Старт",    "price":  3900, "limits": {"staff": 3,    "clients": 100}},
    "pro":      {"name": "Pro",      "price":  9900, "limits": {"staff": 15,   "clients": 1000}},
    "business": {"name": "Business", "price": 23900, "limits": {"staff": None, "clients": None}},
}
```

И поправить докстринг модуля: «Цены в копейках» → «Цены в центах EUR (младшие единицы, как их ждёт Stripe)». Строку про `front/.../Billing/constants.ts` из докстринга удалить — цен там нет.

`PERIOD_DISCOUNTS`, `amount_for`, `PERCENT_ONLY_RATE`, `COMBO_PERCENT_RATE`, `COMBO_FIXED` не трогать.

- [ ] **Шаг 4: Убедиться, что self-check проходит**

Run: `cd back && python -m routers.billing.plans`
Expected: `plans self-check ok`

- [ ] **Шаг 5: Поменять валюту в примере окружения**

В `back/.env.example` строка 39: `BILLING_CURRENCY=czk` → `BILLING_CURRENCY=eur`.
В комментарии над ней дописать: `# Только EUR/GBP/USD/JPY/MXN/IDR — банковские переводы Stripe в других валютах не работают.`

**Локально в своём `back/.env` тоже выставить `BILLING_CURRENCY=eur`** — иначе следующие задачи будут собирать Prices не в той валюте.

- [ ] **Шаг 6: Обновить документацию**

В `docs/TZ/FUNCTIONAL.md` §2.14 и `CLAUDE.md` §2.14 заменить «Старт (990 ₽), Pro (2490 ₽), Business (5990 ₽)» на «Старт (39 €), Pro (99 €), Business (239 €)».

- [ ] **Шаг 7: Проверить, что старый self-check валюты не сломался**

Run: `cd back && python -m services.stripe_billing`
Expected: `stripe_billing self-check ok` — EUR имеет младшие единицы, проверка против `_ZERO_DECIMAL` проходит.

- [ ] **Шаг 8: Commit**

```bash
git add back/routers/billing/plans.py back/.env.example docs/TZ/FUNCTIONAL.md CLAUDE.md
git commit -m "feat(billing): цены тарифов в EUR вместо CZK

Stripe принимает банковские переводы только в EUR/GBP/USD/JPY/MXN/IDR.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Колонки в БД и миграция

**Files:**
- Modify: `back/models/settings.py:162-183` (`StudioBillingPlan`), `back/models/settings.py:206-222` (`BillingInvoice`)
- Modify: `back/models/studio.py:8-27` (`Studio`)
- Create: `back/migrations/versions/<hash>_billing_stripe_subscriptions.py`

**Interfaces:**
- Consumes: ничего.
- Produces:
  - `StudioBillingPlan.stripe_customer_id: Optional[str]`, `StudioBillingPlan.stripe_subscription_id: Optional[str]` (unique)
  - `BillingInvoice.stripe_invoice_id: Optional[str]` (unique), `BillingInvoice.hosted_invoice_url: Optional[str]`
  - `Studio.country: Optional[str]`, `Studio.postal_code: Optional[str]`, `Studio.vat_id: Optional[str]`

- [ ] **Шаг 1: Добавить колонки в `StudioBillingPlan`**

В `back/models/settings.py` после строки `max_staff: Mapped[int] = mapped_column(Integer, default=5)` добавить:

```python
    # Подписка живёт в Stripe, здесь только её идентификаторы. status/expires_at выше —
    # ЗЕРКАЛО состояния подписки, их пишет вебхук; своей арифметики периодов больше нет.
    stripe_customer_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    stripe_subscription_id: Mapped[Optional[str]] = mapped_column(
        String(255), unique=True, index=True, nullable=True,
    )
```

- [ ] **Шаг 2: Добавить колонки в `BillingInvoice`**

В том же файле после `pdf_url` добавить:

```python
    # Зеркало счёта Stripe. stripe_invoice_id — ключ идемпотентности: ретрай вебхука
    # находит существующую строку, а не заводит вторую.
    stripe_invoice_id: Mapped[Optional[str]] = mapped_column(
        String(255), unique=True, index=True, nullable=True,
    )
    hosted_invoice_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
```

- [ ] **Шаг 3: Добавить колонки в `Studio`**

В `back/models/studio.py` после строки `address: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)` добавить:

```python
    # Реквизиты для Stripe Tax: страна определяет ставку VAT, vat_id включает reverse
    # charge для юрлиц из другой страны ЕС. Свободного `address` для налога мало.
    country: Mapped[Optional[str]] = mapped_column(String(2), nullable=True)   # ISO-3166-1 alpha-2
    postal_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    vat_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)   # например CZ12345678
```

- [ ] **Шаг 4: Узнать текущий head Alembic**

Run: `cd back && alembic heads`

Записать полученный revision — он пойдёт в `down_revision`. **Не брать значение из этого плана:** параллельная работа могла добавить новые ревизии, и head за это время сдвинулся.

- [ ] **Шаг 5: Сгенерировать миграцию**

Run: `cd back && alembic revision --autogenerate -m "billing stripe subscriptions"`

- [ ] **Шаг 6: Проверить сгенерированную миграцию глазами**

Открыть созданный файл в `back/migrations/versions/`. Убедиться, что:
- `down_revision` равен head из шага 4;
- есть ровно 7 `op.add_column` (2 в `studio_billing_plans`, 2 в `billing_invoices`, 3 в `studios`);
- есть уникальные индексы на `studio_billing_plans.stripe_subscription_id` и `billing_invoices.stripe_invoice_id`;
- **нет ничего лишнего** — autogenerate любит подцепить посторонние расхождения моделей и БД. Всё, что не из списка выше, удалить из миграции.

- [ ] **Шаг 7: Применить миграцию**

Run: `cd back && alembic upgrade head`
Expected: без ошибок.

- [ ] **Шаг 8: Проверить, что колонки на месте**

Run:
```bash
cd back && python -c "
from models import StudioBillingPlan, BillingInvoice
from models.studio import Studio
for m, cols in [
    (StudioBillingPlan, ['stripe_customer_id', 'stripe_subscription_id']),
    (BillingInvoice, ['stripe_invoice_id', 'hosted_invoice_url']),
    (Studio, ['country', 'postal_code', 'vat_id']),
]:
    for c in cols:
        assert c in m.__table__.columns, (m.__name__, c)
print('columns ok')
"
```
Expected: `columns ok`

- [ ] **Шаг 9: Commit**

```bash
git add back/models/settings.py back/models/studio.py back/migrations/versions/
git commit -m "feat(billing): колонки под подписки Stripe и реквизиты для Stripe Tax

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Реквизиты студии в API настроек

**Files:**
- Modify: `back/schemas/settings/general.py`
- Modify: `back/routers/settings/general.py`
- Test: `back/tests/test_general_settings.py`

**Interfaces:**
- Consumes: `Studio.country`, `Studio.postal_code`, `Studio.vat_id` (Task 2).
- Produces: `GeneralRead.country/postal_code/vat_id`, `GeneralUpdate.country/postal_code/vat_id` — через них заполняются реквизиты, без которых IBAN-ветка вернёт 422.

**Контекст:** это единственная задача, выходящая за «бэкенд без UI». Поля отдаются и принимаются существующим эндпоинтом профиля студии; форму в Настройках → Общие рисует UI-спека. До неё реквизиты заполняются через API.

- [ ] **Шаг 1: Написать падающий тест**

В `back/tests/test_general_settings.py` добавить:

```python
def test_general_update_accepts_tax_details():
    """Реквизиты для Stripe Tax принимаются и валидируются."""
    from schemas.settings.general import GeneralUpdate

    body = GeneralUpdate(country="CZ", postal_code="11000", vat_id="CZ12345678")
    assert body.country == "CZ"
    assert body.postal_code == "11000"
    assert body.vat_id == "CZ12345678"


def test_general_update_normalizes_country_to_upper():
    """Страна приходит как угодно, в Stripe уезжает в верхнем регистре ISO-3166."""
    from schemas.settings.general import GeneralUpdate

    assert GeneralUpdate(country="cz").country == "CZ"


def test_general_update_rejects_bad_country():
    """Не-ISO страна отсекается схемой, а не падает в Stripe.

    'Чехия' ловится длиной, а вот 'СЗ' кириллицей и '中国' — ровно два символа и
    проходят str.isalpha(), потому что он юникодный. Без них тест зелёный даже с
    удалённым телом валидатора.
    """
    import pytest
    from pydantic import ValidationError
    from schemas.settings.general import GeneralUpdate

    for bad in ("Чехия", "СЗ", "中国", "C1", "1"):
        with pytest.raises(ValidationError):
            GeneralUpdate(country=bad)


def test_general_update_normalizes_vat_id():
    """Пробелы в VAT ID Stripe не принимает, а люди их ставят."""
    from schemas.settings.general import GeneralUpdate

    assert GeneralUpdate(vat_id="cz 123 456 78").vat_id == "CZ12345678"


def test_general_update_empty_vat_id_becomes_none():
    """Очистка поля — это «реквизита нет», а не «реквизит пустой».

    Пустая строка уехала бы в Stripe пустым tax id вместо пропуска поля.
    """
    from schemas.settings.general import GeneralUpdate

    assert GeneralUpdate(vat_id="").vat_id is None
    assert GeneralUpdate(vat_id="   ").vat_id is None
    assert GeneralUpdate(vat_id=None).vat_id is None
```

- [ ] **Шаг 2: Убедиться, что тесты падают**

Run: `cd .. && pytest back/tests/test_general_settings.py -k tax_details -v`
Expected: FAIL — `GeneralUpdate` не знает полей `country`/`postal_code`/`vat_id`.

- [ ] **Шаг 3: Добавить поля в схемы**

В `back/schemas/settings/general.py`:

```python
from pydantic import field_validator
```

В класс `GeneralRead` после `address`:

```python
    country: Optional[str] = None
    postal_code: Optional[str] = None
    vat_id: Optional[str] = None
```

В класс `GeneralUpdate` после `address`:

```python
    # Реквизиты для Stripe Tax. Без country подписка по IBAN не создаётся: ставку
    # VAT определяет страна плательщика, а свободного текста `address` для этого мало.
    country: Optional[str] = Field(None, min_length=2, max_length=2)
    postal_code: Optional[str] = Field(None, max_length=20)
    vat_id: Optional[str] = Field(None, max_length=50)

    @field_validator("country")
    @classmethod
    def _upper_country(cls, v: Optional[str]) -> Optional[str]:
        # isascii обязателен: str.isalpha() юникодный и пропускает 'СЗ' кириллицей
        # и '中国'. Для кода страны это мусор, который свалится уже внутри Stripe —
        # режем на границе, где ошибка ещё читаема.
        if v is None:
            return None
        if not (v.isascii() and v.isalpha()):
            raise ValueError("country должен быть кодом ISO-3166-1 alpha-2, например CZ")
        return v.upper()

    @field_validator("vat_id")
    @classmethod
    def _strip_vat(cls, v: Optional[str]) -> Optional[str]:
        # Пробелы внутри VAT ID Stripe не принимает, а люди их ставят.
        # Пустая строка после очистки — это «реквизита нет», а не «реквизит пустой»:
        # иначе PATCH {vat_id: ""} уедет в Stripe пустым tax id вместо пропуска поля.
        if v is None:
            return None
        return v.replace(" ", "").upper() or None
```

- [ ] **Шаг 4: Убедиться, что роутер править не нужно**

`back/routers/settings/general.py` менять не требуется, и это надо подтвердить, а не принять на веру:

- `PATCH /settings/general` (строки 44-45) идёт через `body.model_dump(exclude_unset=True)` + `setattr` — новые поля схемы поедут сами;
- `GET /settings/general` (строка 32) отдаёт `GeneralRead.model_validate(studio)` — новые поля подтянутся из модели.

Run:
```bash
cd back && python -c "
import inspect
from routers.settings import general
src = inspect.getsource(general.update_general_settings)
assert 'model_dump(exclude_unset=True)' in src, 'роутер собирает поля вручную — добавь country/postal_code/vat_id'
print('router passthrough ok')
"
```
Expected: `router passthrough ok`. Если ассерт упал — роутер перечисляет поля списком, и в него нужно добавить `country`, `postal_code`, `vat_id`.

- [ ] **Шаг 5: Убедиться, что тесты проходят**

Run: `cd .. && pytest back/tests/test_general_settings.py -v`
Expected: PASS, включая три новых теста и все существующие.

- [ ] **Шаг 6: Заполнить реквизиты своей студии**

Через API (или напрямую в dev-БД) выставить `country`, `postal_code`, `vat_id` студии, на которой будешь проверять IBAN. Без этого Task 7 вернёт 422.

- [ ] **Шаг 7: Commit**

```bash
git add back/schemas/settings/general.py back/routers/settings/general.py back/tests/test_general_settings.py
git commit -m "feat(settings): страна, индекс и VAT ID студии для Stripe Tax

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Каталог Products/Prices в Stripe

**Files:**
- Create: `back/services/stripe_catalog.py`

**Interfaces:**
- Consumes: `PLANS`, `PERIOD_DISCOUNTS`, `amount_for` из `routers.billing.plans` (Task 1).
- Produces:
  - `lookup_key(plan_id: str, period_months: int) -> str`
  - `async price_id(plan_id: str, period_months: int) -> str` — резолвит Price по ключу, кидает `RuntimeError`, если каталог не синхронизирован
  - `async sync() -> dict[str, str]` — `{lookup_key: price_id}`
  - `TAX_CODE: str`

- [ ] **Шаг 1: Написать модуль с self-check'ом**

Создать `back/services/stripe_catalog.py`:

```python
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

from routers.billing.plans import PLANS, PERIOD_DISCOUNTS, amount_for

load_dotenv()

logger = logging.getLogger(__name__)

stripe.api_key = os.getenv("STRIPE_SECRET_KEY", "")
CURRENCY = os.getenv("BILLING_CURRENCY", "eur").lower()

# Налоговая категория Stripe Tax для SaaS. Без неё automatic_tax не знает ставку.
TAX_CODE = "txcd_10103001"

# Период оплаты → интервал биллинга Stripe. Максимум интервала у Stripe — 3 года,
# так что 24 месяца проходят как year×2.
_INTERVALS: dict[int, tuple[str, int]] = {
    1:  ("month", 1),
    6:  ("month", 6),
    12: ("year", 1),
    24: ("year", 2),
}


def lookup_key(plan_id: str, period_months: int) -> str:
    """Стабильный ключ Price. Префикс velora_ — чтобы не столкнуться с ценами,
    заведёнными в том же аккаунте под что-то другое."""
    return f"velora_{plan_id}_{period_months}m"


def _product_id(plan_id: str) -> str:
    """Product'у id задаём сами — тогда синхронизация идемпотентна без поиска."""
    return f"velora_{plan_id}"


async def _ensure_product(plan_id: str, name: str) -> str:
    product_id = _product_id(plan_id)
    try:
        await asyncio.to_thread(stripe.Product.retrieve, product_id)
    except stripe.InvalidRequestError:
        await asyncio.to_thread(
            stripe.Product.create,
            id=product_id,
            name=f"Velora {name}",
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


async def _ensure_price(product_id: str, plan_id: str, period_months: int) -> str:
    key = lookup_key(plan_id, period_months)
    amount = amount_for(plan_id, period_months)
    interval, interval_count = _INTERVALS[period_months]

    existing = await _find_price(key)
    # `recurring` отдельной переменной, а не existing.recurring.interval напрямую:
    # у разового Price это поле None, и цепочка уронила бы весь sync() посреди цикла
    # с AttributeError. Такой Price под нашим ключом — чужой мусор; проваливаемся
    # ниже и забираем ключ себе новым recurring-Price через transfer_lookup_key.
    recurring = getattr(existing, "recurring", None) if existing is not None else None
    if recurring is not None and (
        existing.unit_amount == amount
        and existing.currency == CURRENCY
        and recurring.interval == interval
        and recurring.interval_count == interval_count
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
        lookup_key=key,
        transfer_lookup_key=True,
    )
    logger.info("Stripe catalog: создан price %s (%s, %s)", price.id, key, amount)
    return price.id


async def sync() -> dict[str, str]:
    """Привести каталог Stripe в соответствие с plans.py. Идемпотентно."""
    out: dict[str, str] = {}
    for plan_id, plan in PLANS.items():
        product_id = await _ensure_product(plan_id, plan["name"])
        for period_months in PERIOD_DISCOUNTS:
            out[lookup_key(plan_id, period_months)] = await _ensure_price(
                product_id, plan_id, period_months,
            )
    return out


async def price_id(plan_id: str, period_months: int) -> str:
    """Price для пары тариф×период.

    RuntimeError, а не тихий None: без Price подписку не создать, и молчаливый
    отказ превратится в 500 где-то ниже по стеку, где причина уже не видна.
    """
    key = lookup_key(plan_id, period_months)
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
        # Каждый период из каталога цен обязан иметь интервал Stripe, иначе
        # sync() упадёт по KeyError уже на боевом ключе.
        assert set(_INTERVALS) == set(PERIOD_DISCOUNTS), (set(_INTERVALS), set(PERIOD_DISCOUNTS))
        # 24 месяца укладываются в лимит Stripe (максимум интервала — 3 года).
        assert _INTERVALS[24] == ("year", 2)
        assert _INTERVALS[12] == ("year", 1)
        # Валюта тарифа обязана быть с младшими единицами: цены в plans.py — центы.
        from services.stripe_connect import _ZERO_DECIMAL
        assert CURRENCY.upper() not in _ZERO_DECIMAL, f"BILLING_CURRENCY={CURRENCY} без младших единиц"
        print("stripe_catalog self-check ok")
```

- [ ] **Шаг 2: Прогнать self-check**

Run: `cd back && python -m services.stripe_catalog`
Expected: `stripe_catalog self-check ok`

- [ ] **Шаг 3: Залить каталог в Stripe (test mode)**

Убедиться, что в `back/.env` стоит тестовый `STRIPE_SECRET_KEY` (`sk_test_…`) и `BILLING_CURRENCY=eur`.

Run: `cd back && python -m services.stripe_catalog sync`
Expected: 12 строк вида `velora_start_1m          price_…`

- [ ] **Шаг 4: Проверить идемпотентность**

Run: `cd back && python -m services.stripe_catalog sync`
Expected: те же самые 12 `price_…` id, что и в шаге 3. Если id изменились — `_ensure_price` не находит существующий Price, чинить сравнение перед коммитом.

- [ ] **Шаг 5: Commit**

```bash
git add back/services/stripe_catalog.py
git commit -m "feat(billing): каталог Products/Prices в Stripe с резолвом по lookup_key

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Клиент Stripe для подписок

**Files:**
- Modify: `back/services/stripe_billing.py` (переписать тело, докстринг модуля и self-check)

**Interfaces:**
- Consumes: ничего из `stripe_catalog`. Tax code живёт на Product'е и проставляется в
  `stripe_catalog._ensure_product`; подписке достаточно `automatic_tax={"enabled": True}`.
  Импортировать сюда `TAX_CODE` не нужно — это был бы мёртвый импорт.
- Produces:
  - `configured() -> bool` *(без изменений)*
  - `parse_webhook(payload: bytes, signature: str) -> dict | None` *(без изменений)*
  - `CURRENCY: str` *(без изменений)*
  - `async ensure_customer(customer_id: str | None, *, name: str, email: str | None, country: str | None, postal_code: str | None, city: str | None, line1: str | None, vat_id: str | None, studio_id: int) -> str`
  - `async create_subscription_checkout(customer_id: str, price_id: str, metadata: dict, success_url: str, cancel_url: str, *, trial_end: int | None = None) -> tuple[str, str]` → `(session_id, url)`
  - `async create_iban_subscription(customer_id: str, price_id: str, metadata: dict, *, trial_end: int | None = None, days_until_due: int = DAYS_UNTIL_DUE)` → объект Subscription с раскрытым `latest_invoice`
  - `async funding_instructions(customer_id: str) -> tuple[str, str]` → `(iban, bic)`
  - `async change_subscription_price(subscription_id: str, price_id: str)` → Subscription
  - `async set_collection_method(subscription_id: str, method: str)` → Subscription; `method` ∈ `{"send_invoice", "charge_automatically"}`
  - `async open_or_new_invoice(customer_id: str, subscription_id: str)` → Invoice или `None`, если платить нечего
  - `DAYS_UNTIL_DUE: int`
  - `async cancel_subscription(subscription_id: str) -> None`
  - `async fetch_subscription(subscription_id: str)` → Subscription с раскрытым `default_payment_method`
  - `async fetch_invoice(stripe_invoice_id: str)` → Invoice
  - `async refund(payment_intent: str) -> None` *(без изменений)*
- **НЕ удаляем здесь:** `create_checkout()`, `charge_saved_card()`, `fetch_session()` остаются
  нетронутыми до Task 7. Их вызывающая сторона (`routers/billing/checkout.py`) чинится там же,
  и удалять их раньше значит оставить приложение неимпортируемым на два коммита. Эта задача
  только ДОБАВЛЯЕТ функции.

- [ ] **Шаг 1: Обновить докстринг модуля**

Заменить первый абзац `back/services/stripe_billing.py` на:

```python
"""Подписка на Velora через Stripe Subscriptions — на платформенный аккаунт.

Это НЕ Connect: деньги идут Velora, а не студии, поэтому `stripe_account` здесь
не передаётся никуда. Приём оплат клиентов студии живёт в `stripe_connect.py` и
пересекается с этим модулем только общим секретным ключом платформы.

Источник истины о подписке — Stripe. Срок, статус, повторные попытки списания и
рассылка счетов на его стороне; наша БД только зеркалит состояние из вебхука.
Своей арифметики периодов в проекте больше нет.

Карта и IBAN — не две интеграции, а одна подписка с разными `collection_method`:
- карта  → Checkout Session mode=subscription, charge_automatically;
- IBAN   → send_invoice + payment_settings.customer_balance/eu_bank_transfer.

Прямой модуль без абстракций — тот же паттерн, что `stripe_connect.py`.
"""
```

Блоки `stripe.api_key`, `WEBHOOK_SECRET`, предупреждение про общий секрет, `configured()`, `refund()` и `parse_webhook()` оставить как есть.

**`CURRENCY` — одна правка:** дефолт `czk` заменить на `eur`:

```python
CURRENCY = os.getenv("BILLING_CURRENCY", "eur").lower()
```

Соседний модуль того же эпика (`services/stripe_catalog.py`) уже по умолчанию `eur`. Два
модуля с разным фолбэком на одну и ту же переменную — это окружение без `BILLING_CURRENCY`,
где Prices заведены в EUR, а инструкции для перевода запрашиваются в CZK: `eu_bank_transfer`
CZK не поддерживает вообще, и вся IBAN-ветка отвечает 400.

- [ ] **Шаг 2: Добавить функции подписок**

После `configured()` вставить:

```python
# Куда уезжает IBAN, который увидит студия. Германия — самый узнаваемый IBAN в ЕС.
# Налогового присутствия не создаёт: счёт держит Stripe, деньги садятся на баланс
# платформы и уходят выплатой на её собственный банковский счёт.
BANK_TRANSFER_COUNTRY = os.getenv("BILLING_BANK_TRANSFER_COUNTRY", "DE").upper()

_BANK_TRANSFER = {
    "funding_type": "bank_transfer",
    "bank_transfer": {
        "type": "eu_bank_transfer",
        "eu_bank_transfer": {"country": BANK_TRANSFER_COUNTRY},
    },
}

# Сколько дней у студии на перевод по выставленному счёту. Меньше недели ставить
# нельзя: SEPA-перевод идёт 1-2 дня, плюс счёт должен пережить выходные.
DAYS_UNTIL_DUE = 14

_IBAN_PAYMENT_SETTINGS = {
    "payment_method_types": ["customer_balance"],
    "payment_method_options": {"customer_balance": _BANK_TRANSFER},
}


async def ensure_customer(
    customer_id: str | None,
    *,
    name: str,
    email: str | None,
    country: str | None,
    postal_code: str | None,
    city: str | None,
    line1: str | None,
    vat_id: str | None,
    studio_id: int,
) -> str:
    """Stripe Customer студии — создаёт или обновляет реквизиты. Идемпотентно.

    Customer заводится на СТУДИЮ, а не на пользователя: у владельца может быть
    несколько студий, а VAT ID, адрес и счета у них разные.

    `reconciliation_mode=automatic` — страховка IBAN-ветки: если студия переведёт
    деньги без назначения платежа, Stripe всё равно применит их к открытому счёту.
    Без него платёж повиснет на балансе, а счёт останется неоплаченным.
    """
    address = {
        "country": country,
        "postal_code": postal_code,
        "city": city,
        "line1": line1,
    }
    fields = dict(
        name=name,
        email=email or None,
        address={k: v for k, v in address.items() if v},
        metadata={"studio_id": str(studio_id)},
        # И на create, и на modify: Customer, заведённый до этой фичи (легаси-путь
        # разовых оплат), иначе навсегда останется без автосверки. Такая студия
        # переведёт деньги без назначения платежа — они зависнут на балансе, счёт
        # останется open, Stripe открутит dunning и отменит подписку у того, кто
        # УЖЕ заплатил. Customer.modify это поле принимает.
        cash_balance={"settings": {"reconciliation_mode": "automatic"}},
    )

    if customer_id:
        await asyncio.to_thread(stripe.Customer.modify, customer_id, **fields)
    else:
        customer = await asyncio.to_thread(stripe.Customer.create, **fields)
        customer_id = customer.id

    if vat_id:
        await _ensure_tax_id(customer_id, vat_id)
    return customer_id


async def _ensure_tax_id(customer_id: str, vat_id: str) -> None:
    """VAT ID у customer'а. Дубли Stripe не схлопывает, поэтому сначала смотрим список.

    Ошибку не поднимаем: неверный VAT ID не повод не дать оплатить тариф — Stripe
    просто посчитает налог без reverse charge, а владелец поправит реквизит.
    """
    try:
        existing = await asyncio.to_thread(stripe.Customer.list_tax_ids, customer_id, limit=100)
        if any(t.value == vat_id for t in existing.data):
            return
        # СНАЧАЛА заводим новый, ПОТОМ снимаем устаревшие. Обратный порядок оставил бы
        # клиента вообще без VAT ID, если create упадёт после успешного delete, — а это
        # хуже исходного бага: там было два номера, тут reverse charge пропадает целиком.
        await asyncio.to_thread(
            stripe.Customer.create_tax_id, customer_id, type="eu_vat", value=vat_id,
        )
        # Stripe дубли не схлопывает: без уборки у клиента висели бы два VAT ID, в PDF
        # печатались бы оба (один — чужого юрлица), а Stripe Tax мог бы и дальше
        # применять reverse charge по старому ещё валидному номеру. Недобор VAT в этом
        # случае — на Velora, не на студии.
        for stale in existing.data:
            if stale.value != vat_id:
                await asyncio.to_thread(stripe.Customer.delete_tax_id, customer_id, stale.id)
    except stripe.StripeError as exc:
        logger.warning("Stripe billing: VAT ID %s не принят (%s)", vat_id, exc)


async def create_subscription_checkout(
    customer_id: str,
    price_id: str,
    metadata: dict,
    success_url: str,
    cancel_url: str,
    *,
    trial_end: int | None = None,
) -> tuple[str, str]:
    """Страница оплаты подписки картой → (session_id, url).

    `tax_id_collection` + `billing_address_collection` — Stripe соберёт адрес и VAT ID
    на своей странице и запишет их в Customer. Для карточной ветки это снимает
    требование заполнить реквизиты заранее (в IBAN-ветке хостед-страницы нет,
    поэтому там они обязательны).

    `trial_end` — миграция уже оплативших: подписка не берёт денег до конца ранее
    оплаченного периода (спека §10). Нужен в обеих ветках, не только в IBAN.

    Номер карты к нам не попадает ни на каком шаге — только cus_…/pm_… и маска.
    """
    subscription_data: dict = {"metadata": metadata}
    if trial_end is not None:
        subscription_data["trial_end"] = trial_end

    session = await asyncio.to_thread(
        stripe.checkout.Session.create,
        mode="subscription",
        customer=customer_id,
        line_items=[{"price": price_id, "quantity": 1}],
        subscription_data=subscription_data,
        metadata=metadata,
        automatic_tax={"enabled": True},
        customer_update={"address": "auto", "name": "auto"},
        tax_id_collection={"enabled": True},
        billing_address_collection="required",
        success_url=success_url,
        cancel_url=cancel_url,
    )
    return session.id, session.url


async def create_iban_subscription(
    customer_id: str,
    price_id: str,
    metadata: dict,
    *,
    trial_end: int | None = None,
    days_until_due: int = DAYS_UNTIL_DUE,
):
    """Подписка с оплатой банковским переводом → Subscription с раскрытым счётом.

    `collection_method=send_invoice` значит «Stripe не списывает сам, а выставляет
    счёт и ждёт перевода». Счёт финализируется и уезжает студии на почту вместе с
    реквизитами; сверку входящего перевода Stripe делает сам.

    `trial_end` — миграция уже оплативших: подписка не берёт денег до конца ранее
    оплаченного периода (спека §10).
    """
    params = dict(
        customer=customer_id,
        items=[{"price": price_id}],
        collection_method="send_invoice",
        days_until_due=days_until_due,
        automatic_tax={"enabled": True},
        metadata=metadata,
        payment_settings=_IBAN_PAYMENT_SETTINGS,
        expand=["latest_invoice"],
        # Subscription.create НЕ идемпотентен. Двойной клик по «Оплатить переводом»
        # или ретрай после таймаута шлюза заводят студии ВТОРУЮ подписку — при том
        # что вся модель исходит из «одна на студию». Уникальность в нашей БД тут не
        # спасает: в сценарии таймаута вызов у Stripe уже прошёл, а запись до нас не
        # доехала.
        #
        # 10-минутная корзина в ключе обязательна. Ключ Stripe живёт 24 часа, и БЕЗ
        # корзины студия, отменившая подписку и осознанно оформившая её заново в тот же
        # день, прислала бы те же параметры и получила КЭШ первого ответа: вызывающая
        # сторона решит, что подписка создана, а объект на самом деле отменён.
        # Повторы одного намерения попадают в одну корзину, осознанная переподписка
        # позже — в новую.
        #
        # customer_id, а не metadata['studio_id']: customer_id — обязательный параметр
        # и есть всегда, а metadata.get() молча выродился бы в строку "None", и две
        # разные студии столкнулись бы на одном ключе.
        idempotency_key=f"sub:{customer_id}:{price_id}:{int(time.time() // 600)}",
    )
    if trial_end is not None:
        params["trial_end"] = trial_end
    return await asyncio.to_thread(stripe.Subscription.create, **params)


async def set_collection_method(subscription_id: str, method: str):
    """Переключение способа оплаты на существующей подписке (карта ⇄ перевод).

    Вторую подписку под другой метод не заводим — у студии она одна. Без этого
    вызова студия, купившая картой и потом выбравшая IBAN, продолжала бы получать
    автосписание с карты и никогда не увидела бы счёт на перевод.

    `days_until_due` принимает ТОЛЬКО `send_invoice`: передать его вместе с
    `charge_automatically` значит получить 400 от Stripe.
    """
    if method == "send_invoice":
        params = {
            "collection_method": "send_invoice",
            "days_until_due": DAYS_UNTIL_DUE,
            "payment_settings": _IBAN_PAYMENT_SETTINGS,
        }
    else:
        params = {
            "collection_method": "charge_automatically",
            "payment_settings": {"payment_method_types": ["card"]},
        }
    return await asyncio.to_thread(stripe.Subscription.modify, subscription_id, **params)


async def funding_instructions(customer_id: str) -> tuple[str, str]:
    """Реквизиты для перевода → (iban, bic).

    IBAN персональный и ПОСТОЯННЫЙ для этого customer'а: повторный вызов вернёт
    тот же счёт, поэтому кэшировать его у себя незачем.

    Держателем счёта в ответе значится Stripe, а не Velora — это его коллекторский
    счёт, деньги с которого садятся на баланс платформы.
    """
    instructions = await asyncio.to_thread(
        stripe.Customer.create_funding_instructions,
        customer_id,
        funding_type="bank_transfer",
        currency=CURRENCY,
        bank_transfer={
            "type": "eu_bank_transfer",
            "eu_bank_transfer": {"country": BANK_TRANSFER_COUNTRY},
        },
    )
    addresses = instructions.bank_transfer.financial_addresses
    iban_address = next((a for a in addresses if getattr(a, "type", None) == "iban"), None)
    if iban_address is None:
        raise RuntimeError("Stripe не вернул IBAN в инструкциях для перевода")
    return iban_address.iban.iban, iban_address.iban.bic


async def change_subscription_price(subscription_id: str, price_id: str):
    """Смена тарифа или периода на существующей подписке.

    Вторую подписку не заводим: у студии она одна. Stripe выставит пропорциональный
    счёт за разницу (`create_prorations`) — это и есть корректное поведение при
    апгрейде посреди оплаченного периода.
    """
    subscription = await asyncio.to_thread(stripe.Subscription.retrieve, subscription_id)
    item_id = subscription["items"].data[0].id
    return await asyncio.to_thread(
        stripe.Subscription.modify,
        subscription_id,
        items=[{"id": item_id, "price": price_id}],
        proration_behavior="create_prorations",
        expand=["latest_invoice"],
    )


async def open_or_new_invoice(customer_id: str, subscription_id: str):
    """Счёт, который студии реально надо оплатить прямо сейчас, или None.

    Зачем не `subscription.latest_invoice`: при смене тарифа посреди периода Stripe
    кладёт прорацию в ОТЛОЖЕННЫЕ позиции, а `latest_invoice` остаётся прошлым, уже
    оплаченным счётом. Показать его как «вот счёт на оплату» значит соврать.

    Порядок: есть открытый счёт — платим его; нет — выставляем новый по накопленным
    позициям; платить нечего — None, и вызывающая сторона отвечает 409.
    """
    # subscription обязателен: без него вернётся ЛЮБОЙ открытый счёт клиента —
    # просроченный цикл или разовый счёт легаси-пути — и студия увидит чужую сумму
    # как «счёт за апгрейд».
    existing = await asyncio.to_thread(
        stripe.Invoice.list,
        customer=customer_id, subscription=subscription_id, status="open", limit=1,
    )
    if existing.data:
        return existing.data[0]

    # Способ оплаты берём у самой подписки: у карточной студии счёт за разницу
    # должен списаться с карты, а не уехать письмом с 14-дневным сроком.
    subscription = await asyncio.to_thread(stripe.Subscription.retrieve, subscription_id)
    method = getattr(subscription, "collection_method", "send_invoice")
    params: dict = {
        "customer": customer_id,
        "subscription": subscription_id,
        "collection_method": method,
        "automatic_tax": {"enabled": True},
        # КРИТИЧНО: по умолчанию Stripe ИСКЛЮЧАЕТ отложенные позиции из нового счёта
        # (_invoice_create_params.py: «Defaults to exclude if the parameter is omitted»).
        # Прорация за апгрейд лежит именно в них — без include счёт выйдет пустым,
        # Stripe ответит «Nothing to invoice», и студия перейдёт на дорогой тариф,
        # ничего не доплатив.
        "pending_invoice_items_behavior": "include",
    }
    if method == "send_invoice":
        params["days_until_due"] = DAYS_UNTIL_DUE

    try:
        draft = await asyncio.to_thread(stripe.Invoice.create, **params)
    except stripe.InvalidRequestError as exc:
        # Ловим ТОЛЬКО «нечего выставлять». InvalidRequestError — это generic 400:
        # сюда же попадают customer_tax_location_invalid, мёртвая подписка и
        # рассинхрон валют. Проглотить их в None значит показать студии «доплачивать
        # нечего» там, где её на самом деле невозможно счётом обслужить.
        if "nothing to invoice" not in str(exc).lower():
            raise
        logger.info("Stripe billing: выставлять нечего по подписке %s", subscription_id)
        return None

    return await asyncio.to_thread(stripe.Invoice.finalize_invoice, draft.id)


async def cancel_subscription(subscription_id: str) -> None:
    """Отмена подписки. Итог придёт событием customer.subscription.deleted —
    статус в нашей БД двигает вебхук, а не эта функция."""
    await asyncio.to_thread(stripe.Subscription.cancel, subscription_id)


async def fetch_subscription(subscription_id: str):
    """Подписка с раскрытым способом оплаты — для сверки и сохранения маски карты.

    expand обязателен: без него в ответе лежит голый `pm_…`, и за брендом карты
    пришлось бы ходить ещё одним запросом.
    """
    return await asyncio.to_thread(
        stripe.Subscription.retrieve,
        subscription_id, expand=["default_payment_method"],
    )


async def fetch_invoice(stripe_invoice_id: str):
    """Счёт Stripe — для ручной сверки, когда вебхук не дошёл."""
    return await asyncio.to_thread(stripe.Invoice.retrieve, stripe_invoice_id)
```

- [ ] **Шаг 3: Обновить self-check**

Заменить блок `if __name__ == "__main__":` в `back/services/stripe_billing.py` на:

```python
if __name__ == "__main__":
    # Без секрета вебхука любое событие отбрасывается, а не принимается на веру.
    _saved, WEBHOOK_SECRET = WEBHOOK_SECRET, ""
    assert parse_webhook(b'{"type":"invoice.paid"}', "sig") is None
    WEBHOOK_SECRET = _saved

    # Валюта тарифа обязана быть с младшими единицами: цены в plans.py — центы.
    from services.stripe_connect import _ZERO_DECIMAL
    assert CURRENCY.upper() not in _ZERO_DECIMAL, f"BILLING_CURRENCY={CURRENCY} без младших единиц"

    # Банковский перевод Stripe работает не в любой валюте — CZK сюда нельзя,
    # именно из-за этого биллинг переехал на EUR.
    assert CURRENCY in ("eur", "gbp", "usd", "jpy", "mxn", "idr"), (
        f"BILLING_CURRENCY={CURRENCY} не поддерживает банковские переводы Stripe"
    )

    # Страна IBAN — двухбуквенный код, иначе Stripe отвергнет запрос инструкций.
    assert len(BANK_TRANSFER_COUNTRY) == 2 and BANK_TRANSFER_COUNTRY.isalpha()

    # send_invoice обязан нести срок оплаты, charge_automatically — не должен:
    # передать days_until_due вместе с ним значит получить 400 от Stripe.
    import inspect
    _src = inspect.getsource(set_collection_method)
    assert "days_until_due" in _src and "charge_automatically" in _src

    print("stripe_billing self-check ok")
```

- [ ] **Шаг 4: Прогнать self-check**

Run: `cd back && python -m services.stripe_billing`
Expected: `stripe_billing self-check ok`

- [ ] **Шаг 5: Убедиться, что приложение по-прежнему поднимается**

Эта задача только добавляет функции — старые никуда не делись, и ломаться нечему.

Run: `cd back && python -c "import main; print('imports ok')"`
Expected: `imports ok`. Если здесь ImportError — значит удалили лишнее, вернуть.

- [ ] **Шаг 6: Commit**

```bash
git add back/services/stripe_billing.py
git commit -m "feat(billing): клиент Stripe Subscriptions

Карта и IBAN — одна подписка с разными collection_method.
Старые функции разовых платежей пока на месте: их снимает Task 7
вместе с переписыванием вызывающей стороны.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

> **ИСПРАВЛЕНО ПОСЛЕ РЕВЬЮ (2026-08-08).** Первая редакция этой задачи содержала два
> катастрофических дефекта, оба молчаливых:
>
> 1. **`current_period_end` НЕ существует у Subscription в `stripe==15.4.0`.** Проверено:
>    в `venv/.../stripe/_subscription.py` ноль вхождений, поле живёт в
>    `_subscription_item.py:67` (API `2026-07-29.dahlia`). Это то же поколение API, что
>    перенесло `invoice.subscription` → `invoice.parent.subscription_details`, которое
>    план как раз компенсирует в `_subscription_id`. Итог первой редакции: оба
>    `getattr(..., "current_period_end", None)` возвращали `None`, `if period_end:`
>    молча пропускался, а `_add_months` — единственный другой писатель `expires_at` —
>    этой же задачей удалён. **`expires_at` не писало НИЧТО**, и каждая платящая студия
>    получала 402 по истечении старого срока при живой оплаченной подписке.
>    Читать период надо у позиции: `subscription.items.data[0].current_period_end`.
> 2. **Гейт читает только `expires_at`, статус игнорирует** (`dependencies.py:191`).
>    Поэтому `status = "expired"` на отмене/возврате ничего не отзывает: студия
>    возвращает деньги и сохраняет тариф до конца периода. Task 8 учит гейт смотреть
>    статус, но здесь надо ещё и прижимать `expires_at` к now при отмене.
>
> Ниже — исправленная редакция.

### Task 6: Вебхук на события подписок

**Files:**
- Modify: `back/routers/billing/webhook.py` (переписать)

**Interfaces:**
- Consumes: `stripe_billing.parse_webhook`, `stripe_billing.fetch_subscription`, `stripe_billing.cancel_subscription`, `stripe_billing.CURRENCY` (Task 5); колонки из Task 2.
- Produces:
  - `async apply_status(db, invoice, status, *, subscription=None) -> bool` — общая точка перехода статуса для вебхука и ручной сверки
  - `async find_plan_by_subscription(db, subscription_id) -> StudioBillingPlan | None`
  - `async mirror_invoice(db, plan, stripe_invoice) -> BillingInvoice`
  - `def map_subscription_status(stripe_status: str) -> str`
- **Удаляются:** `_add_months()`, `_refund()`, `amount_matches()`, `find_invoice()`, `_save_card()` в прежнем виде.

- [ ] **Шаг 1: Переписать модуль**

Заменить содержимое `back/routers/billing/webhook.py` на:

```python
"""Вебхук Stripe по подписке на Velora — единственный источник истины о её состоянии.

Публичный, без JWT (Stripe наш токен не носит) и без гейта подписки: просроченный
тариф не повод потерять оплату, которой его и продлевают.

Порядок строгий: подпись → отбросить чужой аккаунт → найти подписку студии →
зеркалировать. На валидное событие ВСЕГДА 200 — 4xx/5xx заставит Stripe ретраить,
а обработка уже прошла (тот же принцип, что в вебхуке кассы).
"""
import logging
from datetime import datetime

from fastapi import APIRouter, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import async_session_maker
from models import StudioBillingPlan, BillingInvoice, PaymentCard
from services import stripe_billing
from .plans import PLANS

logger = logging.getLogger(__name__)
router = APIRouter()

# Статус подписки у Stripe → наш, который читает пейволл.
# past_due остаётся отдельным: перевод по IBAN идёт 1-2 дня, и всё это время
# подписка именно в нём. Отрубать студию за деньги в пути нельзя, поэтому гейт
# его пускает — в отличие от unpaid/canceled.
_STATUS_MAP = {
    "active": "active",
    "trialing": "active",
    "past_due": "past_due",
    "incomplete": "pending",
    "unpaid": "expired",
    "canceled": "expired",
    "incomplete_expired": "expired",
}

_INVOICE_STATUS = {
    "invoice.paid": "paid",
    "invoice.payment_failed": "failed",
}


def map_subscription_status(stripe_status: str) -> str:
    """Неизвестный статус трактуем как expired, а не как active: ошибиться в
    сторону «не пустить» безопаснее, чем раздать тариф бесплатно."""
    return _STATUS_MAP.get(stripe_status, "expired")


async def find_plan_by_subscription(
    db: AsyncSession, subscription_id: str | None,
) -> StudioBillingPlan | None:
    """Подписка студии по её id у Stripe.

    Это ЕДИНСТВЕННАЯ авторитетная привязка события к студии. `metadata.studio_id`
    пишется для диагностики и границей доступа не служит: metadata задаёт тот, кто
    создаёт объект, и доверять ей как проверкой нельзя.
    """
    if not subscription_id:
        return None
    return (await db.execute(
        select(StudioBillingPlan).where(
            StudioBillingPlan.stripe_subscription_id == subscription_id
        )
    )).scalar_one_or_none()


def _subscription_id(obj) -> str | None:
    """id подписки из счёта. В разных версиях API поле лежит то строкой в
    `subscription`, то объектом, то в `parent.subscription_details`."""
    sub = getattr(obj, "subscription", None)
    if isinstance(sub, str):
        return sub
    if sub is not None:
        return getattr(sub, "id", None)
    parent = getattr(obj, "parent", None)
    details = getattr(parent, "subscription_details", None) if parent else None
    detail_sub = getattr(details, "subscription", None) if details else None
    return detail_sub if isinstance(detail_sub, str) else getattr(detail_sub, "id", None)


async def mirror_invoice(
    db: AsyncSession, plan: StudioBillingPlan, stripe_invoice,
) -> BillingInvoice:
    """Зеркало счёта Stripe в нашей БД (upsert по stripe_invoice_id).

    Идемпотентность держится на уникальном stripe_invoice_id: ретрай вебхука
    находит существующую строку, а не заводит вторую.
    """
    stripe_id = stripe_invoice["id"]
    row = (await db.execute(
        select(BillingInvoice).where(BillingInvoice.stripe_invoice_id == stripe_id)
    )).scalar_one_or_none()

    metadata = getattr(stripe_invoice, "metadata", None)
    plan_name = getattr(metadata, "plan", None) if metadata is not None else None
    period = getattr(metadata, "period_months", None) if metadata is not None else None

    fields = dict(
        studio_id=plan.studio_id,
        plan_name=plan_name or plan.plan_name,
        period_months=int(period) if period else 1,
        amount=getattr(stripe_invoice, "amount_due", 0) or 0,
        payment_method="iban" if getattr(stripe_invoice, "collection_method", "") == "send_invoice" else "card",
        hosted_invoice_url=getattr(stripe_invoice, "hosted_invoice_url", None),
        pdf_url=getattr(stripe_invoice, "invoice_pdf", None),
    )

    if row is None:
        row = BillingInvoice(stripe_invoice_id=stripe_id, status="pending", **fields)
        db.add(row)
        await db.flush()
    else:
        for key, value in fields.items():
            # Ссылки на PDF Stripe заполняет при финализации; не затираем их пустотой,
            # если событие пришло усечённым.
            if value not in (None, ""):
                setattr(row, key, value)
    return row


@router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    """Колбэк Stripe по подписке на тариф."""
    event = stripe_billing.parse_webhook(
        await request.body(), request.headers.get("stripe-signature", ""),
    )
    if event is None:
        return {"status": "ignored"}

    # Тариф платят ПЛАТФОРМЕ, и событий подключённых аккаунтов тут быть не может.
    # У них заполнено `account`, а объекты на своём аккаунте создаёт его владелец —
    # без этой проверки студия выписывала бы себе оплаченный счёт, заплатив ту же
    # сумму самой себе (деньги садятся на её же баланс). Та же проверка живёт в
    # кассе: checkout/stripe_pay.py, apply_paid.
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
        if event_type.startswith("customer.subscription."):
            await _handle_subscription(db, event_type, obj)
        elif event_type.startswith("invoice."):
            await _handle_invoice(db, event_type, obj)
        elif event_type == "charge.refunded":
            await _handle_refund(db, obj)

    return {"status": "ok"}


async def _handle_subscription(db: AsyncSession, event_type: str, obj) -> None:
    """Зеркалирование статуса и срока подписки."""
    plan = await find_plan_by_subscription(db, obj["id"])
    if plan is None:
        logger.info("Stripe billing: подписка %s не привязана к студии", obj["id"])
        return

    if event_type == "customer.subscription.deleted":
        plan.status = "expired"
    else:
        plan.status = map_subscription_status(getattr(obj, "status", ""))
        period_end = getattr(obj, "current_period_end", None)
        if period_end:
            plan.expires_at = datetime.utcfromtimestamp(period_end)

    await db.commit()


async def _handle_invoice(db: AsyncSession, event_type: str, obj) -> None:
    """Зеркалирование счёта и его статуса.

    Сумму с нашим расчётом НЕ сверяем: её считает Stripe по Price, Stripe Tax и
    прорейтингу, и `amount_for()` о них не знает. Защита от чужого события — в том,
    что подписка из счёта обязана принадлежать студии в нашей БД, а Price заведён
    нами (services/stripe_catalog.py).
    """
    plan = await find_plan_by_subscription(db, _subscription_id(obj))
    if plan is None:
        logger.info("Stripe billing: счёт %s не привязан к подписке студии", obj["id"])
        return

    currency = getattr(obj, "currency", None)
    if currency is not None and str(currency).lower() != stripe_billing.CURRENCY:
        logger.error(
            "Stripe billing: валюта счёта %s не сходится — пришло %s, ожидалось %s",
            obj["id"], currency, stripe_billing.CURRENCY,
        )
        return

    invoice = await mirror_invoice(db, plan, obj)

    status = _INVOICE_STATUS.get(event_type)
    if status is not None:
        await apply_status(db, invoice, status)
    else:
        await db.commit()


async def _handle_refund(db: AsyncSession, obj) -> None:
    """Возврат. Полный — отменяет подписку, частичный её не трогает.

    Отмену делает Stripe по нашему запросу, а статус в БД подвинет пришедшее следом
    `customer.subscription.deleted` — сами его тут не проставляем, чтобы переход был
    один и тот же независимо от того, откуда пришёл возврат.
    """
    intent = getattr(obj, "payment_intent", None)
    intent_id = intent if isinstance(intent, str) else getattr(intent, "id", None)
    stripe_invoice_id = getattr(obj, "invoice", None)
    stripe_invoice_id = (
        stripe_invoice_id if isinstance(stripe_invoice_id, str)
        else getattr(stripe_invoice_id, "id", None)
    )
    if not stripe_invoice_id:
        logger.info("Stripe billing: возврат %s не привязан к счёту", intent_id)
        return

    invoice = (await db.execute(
        select(BillingInvoice).where(BillingInvoice.stripe_invoice_id == stripe_invoice_id)
    )).scalar_one_or_none()
    if invoice is None:
        return

    await apply_status(db, invoice, "refunded")

    amount = getattr(obj, "amount", 0) or 0
    refunded = getattr(obj, "amount_refunded", 0) or 0
    if refunded < amount:
        logger.info("Stripe billing: частичный возврат по счёту %s, подписку не трогаем", invoice.id)
        return

    plan = (await db.execute(
        select(StudioBillingPlan).where(StudioBillingPlan.studio_id == invoice.studio_id)
    )).scalar_one_or_none()
    if plan and plan.stripe_subscription_id:
        try:
            await stripe_billing.cancel_subscription(plan.stripe_subscription_id)
        except Exception:
            logger.exception("Stripe billing: не удалось отменить подписку %s", plan.stripe_subscription_id)


async def apply_status(
    db: AsyncSession, invoice: BillingInvoice, status: str, *, subscription=None,
) -> bool:
    """Переводит счёт в статус, подтверждённый Stripe. True — если что-то изменилось.

    Общая точка вебхука и ручной сверки (POST /invoices/{id}/sync): переход один и
    тот же, откуда бы правда ни пришла. Идемпотентно — повтор конечного статуса по
    уже переведённому счёту ничего не делает, поэтому ретраи Stripe не начисляют
    тариф дважды.
    """
    if invoice.status == status:
        return False
    # Оплаченный счёт назад в failed не роняем: событие о неудачной попытке может
    # прийти уже ПОСЛЕ успешной оплаты другим способом.
    if invoice.status == "paid" and status == "failed":
        return False
    # Возврат — конечное состояние. Без этой строки ручная сверка по возвращённому
    # счёту начисляла бы период второй раз — уже без денег.
    if invoice.status == "refunded":
        return False

    if status == "paid":
        invoice.status = "paid"
        invoice.paid_at = datetime.utcnow()
        await _activate(db, invoice, subscription)
    elif status in ("failed", "refunded"):
        invoice.status = status
    else:
        return False

    await db.commit()
    return True


async def _activate(db: AsyncSession, invoice: BillingInvoice, subscription) -> None:
    """paid → тариф и лимиты студии по оплаченному счёту.

    Срок (`expires_at`) здесь НЕ считаем: его ставит зеркало подписки из
    `current_period_end`. Своей арифметики периодов больше нет.
    """
    plan = (await db.execute(
        select(StudioBillingPlan).where(StudioBillingPlan.studio_id == invoice.studio_id)
    )).scalar_one_or_none()
    if plan is None:
        return

    plan.status = "active"
    if invoice.plan_name in PLANS:
        plan.plan_name = invoice.plan_name
        limits = PLANS[invoice.plan_name]["limits"]
        plan.max_staff = limits["staff"] or 9999  # None (business) = безлимит

    if plan.stripe_subscription_id:
        await _sync_period_and_card(db, plan)


async def _sync_period_and_card(db: AsyncSession, plan: StudioBillingPlan) -> None:
    """Срок подписки и маска карты из Stripe.

    Сбой запроса не роняет активацию — тариф уже оплачен, а срок доедет следующим
    событием `customer.subscription.updated`.
    """
    try:
        subscription = await stripe_billing.fetch_subscription(plan.stripe_subscription_id)
    except Exception:
        logger.exception("Stripe billing: не удалось прочитать подписку %s", plan.stripe_subscription_id)
        return

    period_end = getattr(subscription, "current_period_end", None)
    if period_end:
        plan.expires_at = datetime.utcfromtimestamp(period_end)

    method = getattr(subscription, "default_payment_method", None)
    card = getattr(method, "card", None) if method else None
    if card is None:
        return

    # Карту привязываем к тому, кто платил: user_id берём из последнего счёта студии.
    last = (await db.execute(
        select(BillingInvoice)
        .where(BillingInvoice.studio_id == plan.studio_id, BillingInvoice.user_id.isnot(None))
        .order_by(BillingInvoice.id.desc())
    )).scalars().first()
    if last is None:
        return

    row = (await db.execute(
        select(PaymentCard).where(PaymentCard.user_id == last.user_id)
    )).scalar_one_or_none()
    fields = dict(
        card_last4=getattr(card, "last4", "") or "----",
        card_brand=getattr(card, "brand", "card"),
        card_expiry=f"{getattr(card, 'exp_month', 0):02d}/{str(getattr(card, 'exp_year', 0))[-2:]}",
        rectoken=method.id,
        stripe_customer_id=plan.stripe_customer_id,
        method_type="card",
    )
    if row is None:
        db.add(PaymentCard(user_id=last.user_id, cardholder_name="", is_primary=True, **fields))
    else:
        for key, value in fields.items():
            setattr(row, key, value)


if __name__ == "__main__":
    import asyncio
    import types

    # Маппинг статусов: неизвестный трактуется как expired, а не как active.
    assert map_subscription_status("active") == "active"
    assert map_subscription_status("trialing") == "active"
    assert map_subscription_status("past_due") == "past_due"
    assert map_subscription_status("canceled") == "expired"
    assert map_subscription_status("unpaid") == "expired"
    assert map_subscription_status("что-то новое") == "expired"

    # apply_status: ветки без похода в БД — повтор конечного статуса, откат paid, мусор.
    _fake_db = types.SimpleNamespace(commit=lambda: asyncio.sleep(0))
    _inv = lambda status: types.SimpleNamespace(status=status)  # noqa: E731

    assert asyncio.run(apply_status(_fake_db, _inv("paid"), "paid")) is False
    assert asyncio.run(apply_status(_fake_db, _inv("refunded"), "refunded")) is False
    assert asyncio.run(apply_status(_fake_db, _inv("failed"), "failed")) is False
    assert asyncio.run(apply_status(_fake_db, _inv("pending"), "processing")) is False

    _declined = _inv("pending")
    assert asyncio.run(apply_status(_fake_db, _declined, "failed")) is True
    assert _declined.status == "failed"

    # Неудачная попытка не должна обнулять уже прошедшую оплату.
    _paid = _inv("paid")
    assert asyncio.run(apply_status(_fake_db, _paid, "failed")) is False
    assert _paid.status == "paid"

    # Возврат конечен: сверка по возвращённому счёту не начисляет период второй раз.
    _returned = _inv("refunded")
    assert asyncio.run(apply_status(_fake_db, _returned, "paid")) is False
    assert _returned.status == "refunded"

    # id подписки достаётся из всех трёх форм, которыми его отдаёт Stripe.
    assert _subscription_id(types.SimpleNamespace(subscription="sub_1")) == "sub_1"
    assert _subscription_id(
        types.SimpleNamespace(subscription=types.SimpleNamespace(id="sub_2"))
    ) == "sub_2"
    assert _subscription_id(
        types.SimpleNamespace(
            subscription=None,
            parent=types.SimpleNamespace(
                subscription_details=types.SimpleNamespace(subscription="sub_3"),
            ),
        )
    ) == "sub_3"
    assert _subscription_id(types.SimpleNamespace(subscription=None, parent=None)) is None

    assert "/webhook/stripe" in [r.path for r in router.routes]
    print("billing webhook self-check ok")
```

- [ ] **Шаг 2: Прогнать self-check**

Run: `cd back && python -m routers.billing.webhook`
Expected: `billing webhook self-check ok`

- [ ] **Шаг 3: Commit**

```bash
git add back/routers/billing/webhook.py
git commit -m "feat(billing): вебхук на события подписок вместо checkout.session

Привязка события к студии — по stripe_subscription_id, а не по metadata.
Сверка суммы снята: её считает Stripe по Price и Stripe Tax.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Эндпоинты оплаты

**Files:**
- Modify: `back/routers/billing/checkout.py` (переписать)
- Modify: `back/schemas/settings/billing.py` (`IbanCheckoutResponse`)
- Modify: `back/services/stripe_billing.py` (снять функции разовых платежей — их вызывающая сторона исчезает здесь же)

**Interfaces:**
- Consumes: `stripe_billing.*` (Task 5), `stripe_catalog.price_id` (Task 4), колонки из Task 2, реквизиты студии из Task 3.
- Produces: `POST /billing/checkout` → `CheckoutResponse`; `POST /billing/checkout/iban` → `IbanCheckoutResponse`; `POST /billing/renew` → 410.
- **Удаляются:** `fake_iban()`, старая логика `_new_invoice` с ручным `order_id`, а также `stripe_billing.create_checkout()`, `charge_saved_card()`, `fetch_session()`.

- [ ] **Шаг 1: Расширить схему ответа IBAN**

В `back/schemas/settings/billing.py` заменить `IbanCheckoutResponse` на:

```python
class IbanCheckoutResponse(BaseModel):
    invoice_id: int
    invoice_number: str      # номер счёта Stripe, например "ABCD1234-0001"
    iban: str                # настоящий IBAN, выданный Stripe под эту студию
    amount: int              # центы, с налогом — считает Stripe
    reference: str           # назначение платежа; без него перевод ищется дольше
    beneficiary: str = "Velora CRM LLC"
    # Добавлены к прежнему контракту как необязательные — текущий фронт их игнорирует.
    bic: Optional[str] = None
    hosted_invoice_url: Optional[str] = None
```

- [ ] **Шаг 2: Переписать `checkout.py`**

Заменить содержимое `back/routers/billing/checkout.py` на:

```python
"""Создание оплаты тарифа: выбор тарифа/периода → подписка Stripe.

Подписка у студии ОДНА. Первый платёж её создаёт, последующие меняют её позицию
(тариф/период), а не заводят вторую. Сумму и срок считает Stripe по Price из
services/stripe_catalog.py — фронту и своим расчётам тут не доверяем.

Деньги идут на платформенный аккаунт Velora (services/stripe_billing.py), а не на
аккаунт студии — приём оплат клиентов студии живёт отдельно, в кассе.
"""
import logging
import os
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from dependencies import require_role, StudioContext
from models import StudioBillingPlan
from models.studio import Studio
from schemas.settings.billing import (
    CheckoutRequest, CheckoutResponse,
    IbanCheckoutRequest, IbanCheckoutResponse,
)
from services import stripe_billing, stripe_catalog
from .plans import PLANS, PERIOD_DISCOUNTS

logger = logging.getLogger(__name__)
router = APIRouter()

# Вебхук Stripe бьёт в бэкенд, возврат пользователя — во фронт. Оба публичные.
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000").rstrip("/")
WEB_APP_URL = os.getenv("WEB_APP_URL", "http://localhost:5173").rstrip("/")
_RETURN_URL = f"{WEB_APP_URL}/dashboard/billing?payment=return"

_NOT_CONFIGURED = {
    "code": "billing.stripe_not_configured",
    "message": "Приём оплат не настроен на сервере",
}
_STRIPE_ERROR = {
    "code": "billing.stripe_error",
    "message": "Stripe отклонил запрос",
}


def _validate(plan: str, period_months: int) -> None:
    # Literal в схеме уже отсекает мусор до сюда; страховка на случай рассинхрона каталога.
    if plan not in PLANS or period_months not in PERIOD_DISCOUNTS:
        raise HTTPException(status_code=422, detail="Неизвестный план или период")


async def _get_or_create_plan(db: AsyncSession, studio_id: int) -> StudioBillingPlan:
    row = (await db.execute(
        select(StudioBillingPlan).where(StudioBillingPlan.studio_id == studio_id)
    )).scalar_one_or_none()
    if row is None:
        row = StudioBillingPlan(studio_id=studio_id, plan_name="none", status="none")
        db.add(row)
        await db.flush()
    return row


async def _ensure_customer(
    db: AsyncSession, ctx: StudioContext, plan: StudioBillingPlan, *, require_country: bool,
) -> str:
    """Stripe Customer студии с актуальными реквизитами.

    `require_country` — для IBAN-ветки: хостед-страницы, где Stripe соберёт адрес
    сам, там нет, а без страны Stripe Tax не посчитает ставку.
    """
    studio = (await db.execute(
        select(Studio).where(Studio.id == ctx.studio_id)
    )).scalar_one()

    if require_country and not studio.country:
        raise HTTPException(status_code=422, detail={
            "code": "billing.tax_details_required",
            "message": "Заполните страну студии в настройках — без неё счёт не выставить",
        })

    customer_id = await stripe_billing.ensure_customer(
        plan.stripe_customer_id,
        name=studio.name,
        email=studio.email or ctx.user.email,
        country=studio.country,
        postal_code=studio.postal_code,
        city=None,
        line1=studio.address,
        vat_id=studio.vat_id,
        studio_id=ctx.studio_id,
    )
    plan.stripe_customer_id = customer_id
    return customer_id


def _metadata(ctx: StudioContext, plan_id: str, period_months: int) -> dict:
    """Только для диагностики в дашборде Stripe. Границей доступа НЕ является —
    вебхук привязывает событие к студии по stripe_subscription_id."""
    return {
        "studio_id": str(ctx.studio_id),
        "user_id": str(ctx.user.id),
        "plan": plan_id,
        "period_months": str(period_months),
    }


def _trial_end(plan: StudioBillingPlan) -> int | None:
    """Миграция уже оплативших (спека §10): подписка стартует бесплатно до конца
    ранее оплаченного периода, и только потом начинает биллить.

    Нужно ОБЕИМ веткам: студия, оплатившая картой по старой схеме, при переходе на
    IBAN не должна платить второй раз за уже оплаченный месяц — и наоборот.
    Только для первой подписки: у существующей срок ведёт сам Stripe.
    """
    if plan.stripe_subscription_id is not None or plan.expires_at is None:
        return None
    if plan.expires_at <= datetime.utcnow():
        return None
    return int(plan.expires_at.replace(tzinfo=timezone.utc).timestamp())


def _has_live_subscription(plan: StudioBillingPlan) -> bool:
    """Подписка есть и она не мертва — тогда меняем её, а не заводим вторую."""
    return bool(plan.stripe_subscription_id) and plan.status in ("active", "past_due")


@router.post("/checkout", response_model=CheckoutResponse)
async def create_checkout(
    body: CheckoutRequest,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Оплата картой: страница Stripe с подпиской.

    Есть живая подписка → меняем её тариф/период с прорейтингом и возвращаем ссылку
    на счёт-разницу. Нет → обычная страница оформления.
    """
    if not stripe_billing.configured():
        raise HTTPException(status_code=503, detail=_NOT_CONFIGURED)
    _validate(body.plan, body.period_months)

    plan = await _get_or_create_plan(db, ctx.studio_id)
    customer_id = await _ensure_customer(db, ctx, plan, require_country=False)

    try:
        price_id = await stripe_catalog.price_id(body.plan, body.period_months)
        if _has_live_subscription(plan):
            # Метод оплаты мог быть переводом — вернуть подписку на автосписание,
            # иначе студия выбрала карту, а Stripe продолжит слать счета на перевод.
            await stripe_billing.set_collection_method(
                plan.stripe_subscription_id, "charge_automatically",
            )
            subscription = await stripe_billing.change_subscription_price(
                plan.stripe_subscription_id, price_id,
            )
            await db.commit()
            invoice = getattr(subscription, "latest_invoice", None)
            url = getattr(invoice, "hosted_invoice_url", None) if invoice else None
            return CheckoutResponse(checkout_url=url or f"{WEB_APP_URL}/dashboard/billing")

        session_id, url = await stripe_billing.create_subscription_checkout(
            customer_id=customer_id,
            price_id=price_id,
            metadata=_metadata(ctx, body.plan, body.period_months),
            success_url=_RETURN_URL,
            cancel_url=f"{WEB_APP_URL}/dashboard/billing",
            trial_end=_trial_end(plan),
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Stripe billing: оплата картой не создана")
        raise HTTPException(status_code=502, detail=_STRIPE_ERROR) from exc

    await db.commit()
    return CheckoutResponse(checkout_url=url)


@router.post("/checkout/iban", response_model=IbanCheckoutResponse)
async def create_iban_checkout(
    body: IbanCheckoutRequest,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Оплата банковским переводом: подписка со счётом и настоящими реквизитами.

    IBAN выдаёт Stripe (персональный и постоянный для студии), входящий перевод он
    же сверяет сам и закрывает счёт событием `invoice.paid`. Ручного перевода
    счёта в paid здесь больше нет.
    """
    if not stripe_billing.configured():
        raise HTTPException(status_code=503, detail=_NOT_CONFIGURED)
    _validate(body.plan, body.period_months)

    plan = await _get_or_create_plan(db, ctx.studio_id)
    customer_id = await _ensure_customer(db, ctx, plan, require_country=True)

    try:
        price_id = await stripe_catalog.price_id(body.plan, body.period_months)
        if _has_live_subscription(plan):
            # Подписка могла быть на автосписании с карты — переводим её на счета,
            # иначе Stripe спишет с карты, и показанный IBAN окажется декорацией.
            await stripe_billing.set_collection_method(
                plan.stripe_subscription_id, "send_invoice",
            )
            await stripe_billing.change_subscription_price(
                plan.stripe_subscription_id, price_id,
            )
            # НЕ latest_invoice: при смене тарифа посреди периода прорация уходит в
            # отложенные позиции, а latest_invoice остаётся прошлым оплаченным счётом.
            stripe_invoice = await stripe_billing.open_or_new_invoice(
                customer_id, plan.stripe_subscription_id,
            )
            if stripe_invoice is None:
                raise HTTPException(status_code=409, detail={
                    "code": "billing.nothing_to_pay",
                    "message": "По текущей подписке доплачивать нечего",
                })
        else:
            subscription = await stripe_billing.create_iban_subscription(
                customer_id=customer_id,
                price_id=price_id,
                metadata=_metadata(ctx, body.plan, body.period_months),
                trial_end=_trial_end(plan),
            )
            plan.stripe_subscription_id = subscription.id
            stripe_invoice = getattr(subscription, "latest_invoice", None)
        iban, bic = await stripe_billing.funding_instructions(customer_id)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Stripe billing: подписка по IBAN не создана")
        raise HTTPException(status_code=502, detail=_STRIPE_ERROR) from exc

    if stripe_invoice is None:
        # Подписка создана с trial_end — счёта пока нет, платить нечего до конца
        # уже оплаченного периода. Это не ошибка, но и IBAN показывать не за что.
        raise HTTPException(status_code=409, detail={
            "code": "billing.nothing_to_pay",
            "message": "Текущий период уже оплачен — счёт появится к его окончанию",
        })

    # Импорт здесь, а не сверху: webhook импортирует BACKEND_URL из этого модуля,
    # на уровне модуля вышел бы цикл.
    from .webhook import mirror_invoice

    invoice = await mirror_invoice(db, plan, stripe_invoice)
    await db.commit()

    return IbanCheckoutResponse(
        invoice_id=invoice.id,
        invoice_number=getattr(stripe_invoice, "number", None) or f"INV-{invoice.id:06d}",
        iban=iban,
        bic=bic,
        amount=invoice.amount,
        reference=getattr(stripe_invoice, "number", None) or str(invoice.id),
        hosted_invoice_url=invoice.hosted_invoice_url,
    )


@router.post("/renew", deprecated=True)
async def renew():
    """Продление теперь делает Stripe само.

    410, а не удаление маршрута: текущий фронт ещё зовёт этот эндпоинт, и внятный
    код отказа читается лучше, чем 404 на «пропавшем» пути.
    """
    raise HTTPException(status_code=410, detail={
        "code": "billing.renew_is_automatic",
        "message": "Подписка продлевается автоматически",
    })
```

- [ ] **Шаг 3: Убрать импорт `RenewResponse`, если он больше не нужен**

Проверить, что `RenewResponse` не импортируется в `checkout.py` (в новом коде его нет). Саму схему в `schemas/settings/billing.py` оставить — её импортирует фронтовый тип, а мёртвая схема безвредна.

- [ ] **Шаг 4: Удалить функции разовых платежей**

Теперь, когда вызывающая сторона переписана, старый код можно снять. Удалить из `back/services/stripe_billing.py` целиком: `create_checkout()`, `fetch_session()`, `charge_saved_card()`.

Порядок важен: удалять их до переписывания `checkout.py` (как было в исходной редакции плана) значит оставить приложение неимпортируемым на два коммита.

Убедиться, что больше никто их не зовёт:

```bash
cd .. && grep -rn "create_checkout\|charge_saved_card\|fetch_session" back --include=*.py | grep -v "def create_checkout" | grep -v venv
```
Expected: только `routers/billing/checkout.py` со СВОИМ эндпоинтом `create_checkout` (это FastAPI-хендлер, не функция сервиса) — совпадений в `services/` и вызовов `stripe_billing.create_checkout(` быть не должно.

- [ ] **Шаг 5: Добавить в self-check `stripe_billing` проверку, что функции удалены**

В блок `if __name__ == "__main__":` файла `back/services/stripe_billing.py` перед `print(...)` добавить:

```python
    # Функции разовых платежей удалены вместе с их вызывающей стороной (Task 7).
    # Ассерт держит их удалёнными: вернуть одну «на всякий случай» — значит
    # вернуть второй путь оплаты мимо подписки.
    import services.stripe_billing as _self
    for _gone in ("create_checkout", "charge_saved_card", "fetch_session"):
        assert not hasattr(_self, _gone), f"{_gone} должна быть удалена"
```

Run: `cd back && python -m services.stripe_billing`
Expected: `stripe_billing self-check ok`

- [ ] **Шаг 6: Проверить, что приложение поднимается**

Run: `cd back && python -c "import main; print('imports ok')"`
Expected: `imports ok`

- [ ] **Шаг 7: Проверить маршруты**

Run:
```bash
cd back && python -c "
import main
paths = {r.path for r in main.app.routes}
for p in ['/billing/checkout', '/billing/checkout/iban', '/billing/renew', '/billing/webhook/stripe']:
    assert p in paths, p
print('routes ok')
"
```
Expected: `routes ok`

- [ ] **Шаг 8: Commit**

```bash
git add back/routers/billing/checkout.py back/schemas/settings/billing.py back/services/stripe_billing.py
git commit -m "feat(billing): настоящий IBAN от Stripe вместо fake_iban

Подписка одна на студию: повторная оплата меняет её позицию, а не заводит вторую.
POST /billing/renew отвечает 410 — продление автоматическое.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Пейволл, сверка и экспорт

**Files:**
- Modify: `back/dependencies.py:187-199` (гейт подписки)
- Modify: `back/routers/billing/router.py:274-311` (`sync_invoice`), `:32` (импорты), `:314-368` (CSV-экспорт), `:142-149` (`next_charge`)

**Interfaces:**
- Consumes: `apply_status`, `mirror_invoice` (Task 6); `stripe_billing.fetch_invoice`, `stripe_billing.CURRENCY` (Task 5).
- Produces: `POST /billing/invoices/{id}/sync` работает по подпискам; гейт учитывает статус подписки, а не только дату.

- [ ] **Шаг 1: Починить импорт и убрать временный хелпер Task 6**

Task 6 уже был вынужден тронуть этот файл: он удалил `amount_matches` из `webhook.py`, а
`router.py` импортировал её на уровне модуля — без правки приложение перестало бы
импортироваться. Task 6 снял импорт и завёл локальный `_session_amount_matches` как
времянку для ещё живого разового Checkout Session.

Сейчас эта времянка становится мусором: `sync_invoice` ниже переписывается на подписки и
больше не работает с сессиями.

1. Заменить строку импорта на:

```python
from .webhook import router as webhook_router, apply_status, mirror_invoice
```

2. **Удалить функцию `_session_amount_matches` целиком** — после шага 2 её никто не зовёт.
   Проверить греп-ом, что вызовов не осталось:

```bash
cd .. && grep -rn "_session_amount_matches" back --include=*.py | grep -v venv
```
Expected: пусто.

- [ ] **Шаг 2: Переписать `sync_invoice`**

Заменить тело функции `sync_invoice` (строки 274-311) на:

```python
@router.post("/invoices/{invoice_id}/sync", response_model=InvoiceRead)
async def sync_invoice(
    invoice_id: int,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Сверка статуса счёта со Stripe — когда вебхук не дошёл.

    Истина о платеже по-прежнему у Stripe: тянем счёт по stripe_invoice_id и
    применяем тем же переходом, что и вебхук (apply_status). Счёт без счёта Stripe
    (legacy, до перехода на подписки) остаётся как был.
    """
    inv = (await db.execute(select(BillingInvoice).where(
        BillingInvoice.id == invoice_id,
        BillingInvoice.studio_id == ctx.studio_id,
    ))).scalar_one_or_none()
    if inv is None:
        raise HTTPException(status_code=404, detail="Счёт не найден")
    if not inv.stripe_invoice_id:
        raise HTTPException(status_code=409, detail="У счёта нет платёжного заказа")

    try:
        stripe_invoice = await stripe_billing.fetch_invoice(inv.stripe_invoice_id)
    except Exception:
        logger.exception("Сверка статуса не удалась, счёт %s", inv.id)
        raise HTTPException(status_code=502, detail="Платёжный сервис недоступен")

    plan = (await db.execute(
        select(StudioBillingPlan).where(StudioBillingPlan.studio_id == ctx.studio_id)
    )).scalar_one_or_none()
    if plan is not None:
        # Ссылки на PDF и хостед-страницу могли появиться после финализации.
        await mirror_invoice(db, plan, stripe_invoice)

    status = getattr(stripe_invoice, "status", None)
    if status == "paid":
        await apply_status(db, inv, "paid")
    elif status in ("uncollectible", "void"):
        await apply_status(db, inv, "failed")
    else:
        await db.commit()

    await db.refresh(inv)
    return _to_invoice_read(inv)
```

- [ ] **Шаг 3: Починить валюту в CSV-экспорте**

В `export_invoices_csv` строка `lang, currency = await _studio_prefs(db, ctx.studio_id)` берёт валюту **студии**, а суммы в счетах — в валюте биллинга. Это разъезжается: счёт в евро подписывается кроной.

Заменить строки получения знака валюты на:

```python
    lang, _studio_currency = await _studio_prefs(db, ctx.studio_id)
    # Суммы счетов — в валюте биллинга (EUR), а не в валюте кассы студии.
    # Подписывать евро кроной нельзя: колонка станет враньём.
    sign = _CURRENCY_SIGNS.get(stripe_billing.CURRENCY.upper(), stripe_billing.CURRENCY.upper())
```

- [ ] **Шаг 4: Починить `next_charge`**

В `get_billing_stats` строка `next_charge = amount_for(plan.plan_name, paid[-1].period_months if paid else 1)` считала сумму нашей арифметикой. Заменить блок на:

```python
    # Следующее списание: срок и сумму знает Stripe, но для плашки хватает каталога —
    # налог и прорейтинг в неё не входят, это ориентир, а не счёт.
    next_charge = 0
    if plan and plan.status in ("active", "past_due"):
        if plan.billing_mode == "combo":
            next_charge = plan.fixed_base_amount or 0
        elif plan.billing_mode == "subscription" and plan.plan_name in PLANS:
            next_charge = amount_for(plan.plan_name, paid[-1].period_months if paid else 1)
        # percent: фикса нет, списывать по расписанию нечего — остаётся 0
```

- [ ] **Шаг 5: Научить пейволл смотреть на статус подписки**

`back/dependencies.py:191` сейчас пускает по одной только дате:

```python
expired = plan is None or (plan.expires_at is not None and plan.expires_at < datetime.utcnow())
```

Статус не проверяется вообще. С подписками это дыра: отменённая или брошенная неоплаченной подписка (`unpaid`, `canceled`) сохраняет `expires_at` от последнего оплаченного периода и продолжает пускать в CRM.

Заменить строку на:

```python
    # Гейт смотрит и на дату, и на статус. Статус нужен из-за подписок: Stripe
    # переводит брошенную неоплаченной в unpaid/canceled, а expires_at при этом
    # остаётся от последнего оплаченного периода и один сам по себе врёт.
    #
    # past_due СОЗНАТЕЛЬНО пускает: перевод по IBAN идёт 1-2 дня, и всё это время
    # подписка именно в нём. Отрубать студию за деньги в пути нельзя.
    expired = (
        plan is None
        or plan.status == "expired"
        # expires_at IS NULL = «срок неизвестен» → НЕ пускаем. Исходное условие
        # (`expires_at is not None and ...`) читало пустую дату как «не истекло» и
        # выдавало доступ. Сейчас недостижимо (онбординг всегда ставит триальную дату),
        # но подписка, у которой дату не удалось зеркалить, не должна становиться
        # бессрочной именно из-за того, что мы её не знаем.
        or plan.expires_at is None
        or plan.expires_at < datetime.utcnow()
    )
```

**Проверить после правки, что триал не сломался:** у студии сразу после онбординга
`expires_at` заполнен (`routers/auth/onboarding.py`), поэтому новое условие её пускает.
Если найдётся путь, создающий `StudioBillingPlan` без даты, — это баг того пути, а не гейта.

Комментарий-`ponytail` про авто-recurring выше (строки 192-193) удалить: `renew` больше нет, продлевает Stripe.

- [ ] **Шаг 6: Проверить логику гейта**

Run:
```bash
cd back && python -c "
from datetime import datetime, timedelta
import types
future = datetime.utcnow() + timedelta(days=10)
past = datetime.utcnow() - timedelta(days=1)
def expired(plan):
    return (plan is None or plan.status == 'expired'
            or (plan.expires_at is not None and plan.expires_at < datetime.utcnow()))
P = lambda s, e: types.SimpleNamespace(status=s, expires_at=e)
assert expired(None) is True
assert expired(P('active', future)) is False
assert expired(P('past_due', future)) is False   # деньги в пути — пускаем
assert expired(P('expired', future)) is True     # отменена, срок не спасает
assert expired(P('active', past)) is True        # срок вышел
print('paywall ok')
"
```
Expected: `paywall ok`

- [ ] **Шаг 7: Убедиться, что `StudioBillingPlan` импортирован**

`router.py:18` уже импортирует `StudioBillingPlan` — новый код в `sync_invoice` его использует. Ничего не менять.

- [ ] **Шаг 8: Прогнать self-check роутера**

Run: `cd back && python -m routers.billing.router`
Expected: `billing router self-check ok`

- [ ] **Шаг 9: Проверить, что приложение поднимается**

Run: `cd back && python -c "import main; print('imports ok')"`
Expected: `imports ok`

- [ ] **Шаг 10: Прогнать существующие тесты биллинга**

Run по одному:
```bash
cd .. && pytest back/tests/test_billing_model.py -v
cd .. && pytest back/tests/test_billing_activation.py -v
cd .. && pytest back/tests/test_billing_autopay.py -v
```

`test_billing_activation.py` импортирует удалённый `fake_iban` — тест про детерминированность фейкового IBAN удалить целиком: он проверял поведение, которого больше нет. Проверку расчёта комбо-фикса в том же файле оставить.

`test_billing_webhook.py` написан под `checkout.session.*` — переписывается в Task 9, здесь его не гонять.

- [ ] **Шаг 11: Commit**

```bash
git add back/dependencies.py back/routers/billing/router.py back/tests/test_billing_activation.py
git commit -m "fix(billing): пейволл учитывает статус подписки, сверка по stripe_invoice_id

Отменённая подписка больше не пускает в CRM до конца оплаченного периода.
past_due пускает сознательно: перевод по IBAN идёт 1-2 дня.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Сквозная проверка IBAN-ветки

**Files:**
- Create: `back/tests/test_billing_subscription.py`
- Modify: `back/tests/test_billing_webhook.py` (переписать под события подписок)

**Interfaces:**
- Consumes: всё, что построено в Task 1-8.
- Produces: доказательство, что перевод по IBAN закрывает счёт и активирует тариф без ручного вмешательства.

**Контекст:** Stripe даёт тест-хелпер `POST /v1/test_helpers/customers/:id/fund_cash_balance` — он имитирует входящий банковский перевод. Это позволяет прогнать IBAN-ветку целиком, не двигая живых денег.

- [ ] **Шаг 1: Написать тест каталога и маппинга (без сети)**

Создать `back/tests/test_billing_subscription.py`:

```python
"""Подписки Stripe: каталог цен, маппинг статусов и сквозная IBAN-ветка.

Сетевые тесты помечены @pytest.mark.stripe и требуют sk_test_… в окружении —
без ключа они пропускаются, чтобы обычный прогон не зависел от сети.
"""
import os

import pytest

from routers.billing.plans import PLANS, PERIOD_DISCOUNTS, amount_for
from routers.billing.webhook import map_subscription_status, _subscription_id
from services import stripe_catalog


def test_every_plan_period_has_lookup_key():
    """У каждой пары тариф×период есть ключ Price — иначе оплата упадёт в рантайме."""
    keys = {
        stripe_catalog.lookup_key(plan_id, months)
        for plan_id in PLANS
        for months in PERIOD_DISCOUNTS
    }
    assert len(keys) == len(PLANS) * len(PERIOD_DISCOUNTS) == 12


def test_intervals_cover_all_periods():
    """Период без интервала Stripe уронил бы sync() по KeyError на боевом ключе."""
    assert set(stripe_catalog._INTERVALS) == set(PERIOD_DISCOUNTS)


def test_two_year_period_fits_stripe_limit():
    """24 месяца = year×2. Максимум интервала у Stripe — 3 года."""
    interval, count = stripe_catalog._INTERVALS[24]
    assert (interval, count) == ("year", 2)


def test_longer_period_is_cheaper_per_month():
    """Скидка за период обязана быть выгодной, иначе калькулятор врёт клиенту."""
    for plan_id in PLANS:
        monthly = PLANS[plan_id]["price"]
        assert amount_for(plan_id, 24) / 24 < monthly


def test_unknown_subscription_status_is_not_active():
    """Незнакомый статус не должен раздавать тариф бесплатно."""
    assert map_subscription_status("совершенно новый статус") == "expired"
    assert map_subscription_status("unpaid") == "expired"


def test_past_due_still_allowed():
    """Перевод по IBAN идёт 1-2 дня — всё это время подписка past_due.
    Отрубать студию за деньги в пути нельзя."""
    assert map_subscription_status("past_due") == "past_due"


def test_subscription_id_extracted_from_all_shapes():
    """Stripe отдаёт id подписки то строкой, то объектом, то в parent."""
    import types

    assert _subscription_id(types.SimpleNamespace(subscription="sub_1")) == "sub_1"
    assert _subscription_id(
        types.SimpleNamespace(subscription=types.SimpleNamespace(id="sub_2"))
    ) == "sub_2"
    assert _subscription_id(types.SimpleNamespace(subscription=None, parent=None)) is None
```

- [ ] **Шаг 2: Прогнать тесты без сети**

Run: `cd .. && pytest back/tests/test_billing_subscription.py -v`
Expected: 7 PASSED.

- [ ] **Шаг 3: Дописать сетевой сквозной тест**

В конец `back/tests/test_billing_subscription.py` добавить:

```python
requires_stripe = pytest.mark.skipif(
    not os.getenv("STRIPE_SECRET_KEY", "").startswith("sk_test_"),
    reason="нужен тестовый ключ Stripe (sk_test_…)",
)


@requires_stripe
@pytest.mark.asyncio
async def test_bank_transfer_closes_invoice_end_to_end():
    """Входящий перевод закрывает счёт без ручного вмешательства.

    Проверяем именно то, чего не умела фейковая ветка: Stripe сам сверяет деньги
    с открытым счётом и переводит его в paid.
    """
    import asyncio
    import stripe

    from services import stripe_billing

    # 1. Customer с автосверкой и реквизитами для налога.
    customer_id = await stripe_billing.ensure_customer(
        None,
        name="Velora e2e test",
        email="sadomat31@gmail.com",
        country="CZ",
        postal_code="11000",
        city="Praha",
        line1="Testovaci 1",
        vat_id=None,
        studio_id=999_999,
    )

    # 2. IBAN, который увидела бы студия. Настоящий, выданный Stripe.
    iban, bic = await stripe_billing.funding_instructions(customer_id)
    assert iban.startswith("DE"), iban
    assert bic

    # 3. Подписка с оплатой переводом.
    price_id = await stripe_catalog.price_id("start", 1)
    subscription = await stripe_billing.create_iban_subscription(
        customer_id=customer_id,
        price_id=price_id,
        metadata={"studio_id": "999999", "plan": "start", "period_months": "1"},
    )
    invoice = subscription.latest_invoice
    assert invoice is not None
    assert invoice.status in ("draft", "open")

    # Счёт должен быть финализирован, иначе платить нечего.
    if invoice.status == "draft":
        invoice = await asyncio.to_thread(stripe.Invoice.finalize_invoice, invoice.id)
    assert invoice.status == "open"
    amount_due = invoice.amount_due

    # 4. Имитируем входящий банковский перевод ровно на сумму счёта.
    await asyncio.to_thread(
        stripe.test_helpers.Customer.fund_cash_balance,
        customer_id, amount=amount_due, currency=stripe_billing.CURRENCY,
    )

    # 5. Stripe сверяет асинхронно — ждём, пока счёт закроется.
    for _ in range(20):
        refreshed = await stripe_billing.fetch_invoice(invoice.id)
        if refreshed.status == "paid":
            break
        await asyncio.sleep(1)
    else:
        pytest.fail(f"счёт {invoice.id} не закрылся переводом за 20 с")

    assert refreshed.status == "paid"
    assert refreshed.amount_remaining == 0

    # Уборка: тестовые подписки не должны копиться в аккаунте.
    await stripe_billing.cancel_subscription(subscription.id)
```

- [ ] **Шаг 4: Прогнать сквозной тест**

Run: `cd .. && pytest back/tests/test_billing_subscription.py -v -k end_to_end`
Expected: PASS — счёт переходит в `paid` от одного лишь имитированного перевода.

Если тест падает на шаге 5 (счёт остался `open`) — проверить, что у Customer выставлен `cash_balance.settings.reconciliation_mode = "automatic"`: без него деньги повиснут на балансе и счёт не закроется.

- [ ] **Шаг 5: Переписать `test_billing_webhook.py`**

Открыть `back/tests/test_billing_webhook.py`. Он написан под `checkout.session.completed` / `async_payment_succeeded` / `expired` и импортирует удалённые `amount_matches` и `find_invoice`.

Заменить тесты, завязанные на удалённые функции, на проверки нового контракта:

```python
import types

import pytest

from routers.billing.webhook import apply_status, map_subscription_status


@pytest.mark.asyncio
async def test_repeat_paid_is_noop():
    """Ретрай вебхука не начисляет тариф дважды."""
    db = types.SimpleNamespace(commit=lambda: _noop())
    invoice = types.SimpleNamespace(status="paid")
    assert await apply_status(db, invoice, "paid") is False


@pytest.mark.asyncio
async def test_paid_never_falls_back_to_failed():
    """Неудачная попытка, пришедшая после успешной оплаты, не отменяет её."""
    db = types.SimpleNamespace(commit=lambda: _noop())
    invoice = types.SimpleNamespace(status="paid")
    assert await apply_status(db, invoice, "failed") is False
    assert invoice.status == "paid"


@pytest.mark.asyncio
async def test_refunded_is_terminal():
    """Сверка по возвращённому счёту не начисляет период второй раз."""
    db = types.SimpleNamespace(commit=lambda: _noop())
    invoice = types.SimpleNamespace(status="refunded")
    assert await apply_status(db, invoice, "paid") is False
    assert invoice.status == "refunded"


def test_unknown_status_denies_access():
    """Ошибаться безопаснее в сторону «не пустить»."""
    assert map_subscription_status("новьё") == "expired"


async def _noop():
    return None
```

Тесты, проверяющие проверку подписи и отброс события подключённого аккаунта, **сохранить** — эта логика не менялась и остаётся критичной.

- [ ] **Шаг 6: Прогнать переписанный тест**

Run: `cd .. && pytest back/tests/test_billing_webhook.py -v`
Expected: PASS.

- [ ] **Шаг 7: Финальная проверка всех self-check'ов**

Run по одному:
```bash
cd back && python -m routers.billing.plans
cd back && python -m services.stripe_catalog
cd back && python -m services.stripe_billing
cd back && python -m routers.billing.webhook
cd back && python -m routers.billing.router
```
Expected: пять строк `… self-check ok`.

- [ ] **Шаг 8: Проверить живой вебхук локально**

В отдельном терминале:
```bash
stripe listen --forward-to localhost:8000/billing/webhook/stripe \
  --events invoice.finalized,invoice.paid,invoice.payment_failed,customer.subscription.updated,customer.subscription.deleted,charge.refunded
```

Секрет из вывода записать в `back/.env` как `STRIPE_BILLING_WEBHOOK_SECRET`, перезапустить `uvicorn`.

Затем через UI студии нажать оплату по IBAN и убедиться в логах, что пришли `invoice.finalized` и счёт появился в `billing_invoices` со ссылкой на PDF.

- [ ] **Шаг 9: Commit**

```bash
git add back/tests/test_billing_subscription.py back/tests/test_billing_webhook.py
git commit -m "test(billing): сквозная проверка IBAN-ветки через fund_cash_balance

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Задачи деплоя (не код)

Без них релиз не поедет, но в коде их нет. Отметить перед выкаткой:

- [ ] Stripe Dashboard → Settings → **Billing → Email settings**: включить отправку финализированных счетов и «Successful payments». Без этого счета и чеки создаются, но письма не уходят — а именно письмо с фактурой было требованием.
- [ ] Stripe Dashboard → Settings → **Branding**: логотип, иконка, цвета. Применяются к письмам, хостед-странице счёта, PDF и Customer Portal.
- [ ] Stripe Dashboard → **Tax**: включить Stripe Tax и завести налоговые регистрации (для ЕС — `oss_union`). Проверить, что у продуктов `velora_*` проставлен tax code `txcd_10103001` — его ставит `stripe_catalog.sync()` при создании, но у уже существующих продуктов надо проверить руками.
- [ ] Stripe Dashboard → **Billing → Subscriptions and emails**: настроить, что делать с неоплаченными счетами (`past_due` → `canceled` или `unpaid`) и через сколько.
- [ ] Прод: завести эндпоинту `/billing/webhook/stripe` **собственный** секрет подписи и положить его в `STRIPE_BILLING_WEBHOOK_SECRET`. У этого эндпоинта **не включать** «Listen to events on connected accounts».
- [ ] Прод: `python -m services.stripe_catalog sync` на боевом ключе — Prices в live-режиме отдельные от тестовых.
- [ ] Показать бухгалтеру образец PDF-счёта Stripe: покрывает ли он требования к чешской фактуре (номерная серия, DUZP, реквизиты сторон). Не хватает — добираем через `invoice_settings.custom_fields`, это правка конфига.

---

## Что осталось за рамками

Записано, чтобы не потерялось (спека §13):

1. **UI страницы биллинга** — модалка выбора метода, история счетов со ссылками на PDF Stripe, состояние подписки. До неё кнопка «Продлить» на фронте отвечает 410.
2. **Customer Portal** — смена карты, отмена подписки, скачивание счетов силами студии.
3. **Комбо/процентная модель** на metered-ценах — `POST /billing/model` пишет поля в БД, но в Stripe ничего не создаёт.
4. **Фоновая сверка дрейфа** между Stripe и зеркалом — сейчас только ручная кнопка.
5. **Поля реквизитов в форме Настроек и онбординге** — бэкенд их принимает (Task 3), поле в UI рисует UI-спека.
