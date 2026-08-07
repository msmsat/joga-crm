# Настоящая оплата тарифа: EUR + Stripe Subscriptions + IBAN

**Дата:** 2026-08-07
**Статус:** дизайн согласован, план реализации не написан
**Скоуп:** бэкенд. Страница «Тариф и оплата» в этой спеке не переделывается.

---

## 1. Зачем

Оплата тарифа картой работает по-настоящему (`services/stripe_billing.py`: Checkout,
сохранённая карта, продление, возвраты, вебхук с проверкой подписи). А ветка «оплата
по IBAN» — **декорация**:

- `routers/billing/checkout.py:94-97` — `fake_iban()` собирает выдуманный DE-IBAN
  из `studio_id`. Такого счёта не существует.
- Счёт создаётся `pending` и **никогда не становится `paid` сам** — сверки входящих
  переводов нет вообще, только ручной `POST /invoices/{id}/sync`.

Цель — сделать оплату тарифа такой, какой её ожидает европейское юрлицо: настоящий
IBAN, автоматическая сверка перевода, настоящий счёт с номером, PDF и корректным VAT,
автопродление без ручных кнопок.

## 2. Принятые решения

| # | Решение | Почему |
|---|---|---|
| 1 | Валюта — **EUR** | Stripe принимает банковские переводы только в EUR/GBP/USD/JPY/MXN/IDR. **CZK не поддерживается**, а валюта перевода определяется валютой сеттлмента аккаунта. С `BILLING_CURRENCY=czk` настоящий IBAN недостижим в принципе |
| 2 | Цены **39 / 99 / 239 €** в месяц | Пересчёт текущих 990/2490/5990 CZK по курсу ~25 |
| 3 | IBAN = **bank transfer** (мы показываем свой IBAN), не SEPA Direct Debit | Совпадает с уже написанной модалкой B4 и с ожиданиями бухгалтерии; Stripe сверяет входящий перевод сам |
| 4 | **Stripe Subscriptions** вместо разовых платежей | Автопродление, dunning, ретраи, грейс-периоды, PDF и email — у Stripe, а не у нас |
| 5 | **Stripe — источник истины**, наша БД — зеркало | Своя арифметика периодов и свой крон = ровно тот геморрой, от которого уходим |
| 6 | IBAN выпускаем в **Германии** (`eu_bank_transfer.country=DE`) | Самый узнаваемый IBAN в ЕС. Налоговых последствий не создаёт — см. §9 |
| 7 | **Stripe Tax включён сразу** | Без корректного VAT счёт юридически неполноценен, а reverse charge руками — второй мешок геморроя |

### Что НЕ входит

- UI страницы «Тариф и оплата» (модалка выбора метода, история счетов с PDF, состояние
  подписки) — следующей спекой.
- Stripe Customer Portal — следующей спекой.
- Комбо/процентная модель («3%», «фикс + 1.5%») на metered-ценах — отдельной спекой.
  Существующие поля `billing_mode`/`percent_rate`/`fixed_base_amount` и эндпоинт активации
  модели ничего в Stripe не создают сегодня и продолжат работать как есть.

### Явное исключение из «без UI»

Stripe Tax требует у Customer структурированный адрес и VAT ID, а в `Studio` их нет
(есть только свободный текст `address`). Поэтому спека добавляет поля в `Studio` и
показывает их **в Настройках → Общие и в шаге 5 онбординга**. Страницу биллинга это
не трогает.

---

## 3. Границы: контракты API не меняются

Ключевое ограничение дизайна — **фронт не правится**. Оба существующих эндпоинта
сохраняют форму ответа, меняется только начинка:

| Эндпоинт | Было | Стало |
|---|---|---|
| `POST /billing/checkout` | Checkout Session `mode=payment` → `{checkout_url}` | Checkout Session `mode=subscription` → `{checkout_url}` |
| `POST /billing/checkout/iban` | фейковый IBAN → `{invoice_id, invoice_number, iban, amount, reference}` | подписка `send_invoice` + настоящие funding instructions → та же форма |

`IbanCheckoutResponse` дополняется **необязательными** `hosted_invoice_url` и `bic`.
Текущий фронт их проигнорирует, UI-спека их использует.

`POST /billing/renew` и `stripe_billing.charge_saved_card()` **удаляются** — подписку
продлевает Stripe. Кнопка «Продлить» на фронте перестанет иметь смысл; до UI-спеки
эндпоинт отвечает `410 Gone` с кодом `billing.renew_is_automatic`, чтобы отказ был
читаемым, а не пятисоткой.

---

## 4. Деньги и каталог

### 4.1. Цены

`BILLING_CURRENCY=eur`. В `routers/billing/plans.py` цены остаются в младших единицах —
теперь это центы:

```python
PLANS = {
    "start":    {"name": "Старт",    "price":  3900, "limits": {"staff": 3,  "clients": 100}},
    "pro":      {"name": "Pro",      "price":  9900, "limits": {"staff": 15, "clients": 1000}},
    "business": {"name": "Business", "price": 23900, "limits": {"staff": None, "clients": None}},
}
```

`amount_for()` и `PERIOD_DISCOUNTS` не меняются. Итоговые суммы (центы):

| План | 1 мес | 6 мес (−20%) | 12 мес (−30%) | 24 мес (−40%) |
|---|---|---|---|---|
| Старт | 3 900 | 18 720 | 32 760 | 56 160 |
| Pro | 9 900 | 47 520 | 83 160 | 142 560 |
| Business | 23 900 | 114 720 | 200 760 | 344 160 |

`COMBO_FIXED` производный (`price // 2`) — пересчитается сам.

Синхронизировать: `back/.env.example`, `docs/TZ/FUNCTIONAL.md` §2.14, `CLAUDE.md` §2.14
(там цены в ₽ — уже расходились с кодом, где CZK).

Фронт править не нужно: `front/src/pages/dashboard/Billing/constants.ts` цен не содержит
(только цвета и списки фич), суммы приходят из `GET /billing/plans`. Новые цены
подхватятся сами.

### 4.2. Каталог в Stripe

3 Product × 4 Price = 12 Prices. Маппинг периода на интервал Stripe:

| Период | `recurring.interval` | `interval_count` |
|---|---|---|
| 1 мес | `month` | 1 |
| 6 мес | `month` | 6 |
| 12 мес | `year` | 1 |
| 24 мес | `year` | 2 |

24 месяца проходят: максимум интервала у Stripe — 3 года.

Новый модуль `services/stripe_catalog.py` с идемпотентной синхронизацией:
`python -m services.stripe_catalog sync` ищет Price по `lookup_key`
(`velora_start_1m`, `velora_pro_12m`, …) и создаёт недостающие. `plans.py` остаётся
единственным источником цен — id Prices в конфиге не живут.

Prices в Stripe неизменяемы: смена цены → новый Price + архивация старого. Уже
существующие подписки остаются на старом Price (грандфазеринг), это штатное поведение.

**Отвергнуто:** inline `price_data` в подписке (каталог не нужен вовсе). Customer Portal
и смена тарифа с прорейтингом требуют настоящих Prices, а портал — следующая спека.

---

## 5. Модель данных

### `StudioBillingPlan` (+2 колонки)

```python
stripe_customer_id:     Optional[str]  # String(255), nullable
stripe_subscription_id: Optional[str]  # String(255), nullable, unique
```

`plan_name`, `status`, `expires_at`, `max_staff` остаются и продолжают питать пейволл —
меняется только то, **кто их пишет** (вебхук из подписки, а не наша арифметика).

### `BillingInvoice` (+2 колонки)

```python
stripe_invoice_id:  Optional[str]  # String(255), nullable, unique — ключ идемпотентности
hosted_invoice_url: Optional[str]  # String(500), nullable
```

`pdf_url` переиспользуется под `invoice.invoice_pdf` от Stripe. `order_id` остаётся ради
legacy-счетов.

### `Studio` (+3 колонки) — для Stripe Tax

```python
country:     Optional[str]  # String(2), ISO-3166-1 alpha-2
postal_code: Optional[str]  # String(20)
vat_id:      Optional[str]  # String(50) — например CZ12345678
```

### `PaymentCard` — не трогаем

`stripe_customer_id` (`models/settings.py:200`) **перестаёт быть источником правды**:
подписка читает `StudioBillingPlan.stripe_customer_id`. Колонка остаётся заполняться
для UI-маски карты, но не используется в логике. Дропнуть — в UI-спеке.

**Почему Customer на студию, а не на юзера:** у владельца может быть несколько студий,
а VAT ID, адрес и счета у них разные. Подписка тоже одна на студию.

---

## 6. Флоу оплаты

### 6.1. Общая подготовка

`ensure_customer(studio)` — идемпотентно создаёт/возвращает Stripe Customer:

```python
stripe.Customer.create(
    name=studio.name,
    email=owner_email,
    address={"country": studio.country, "postal_code": studio.postal_code,
             "city": ..., "line1": ...},
    metadata={"studio_id": str(studio.id)},
    cash_balance={"settings": {"reconciliation_mode": "automatic"}},
)
```

`reconciliation_mode=automatic` — страховка от «студия не указала назначение платежа»:
Stripe сам применит пришедшие деньги к открытому счёту.

VAT ID, если задан, — отдельным вызовом `Customer.create_tax_id(type="eu_vat", value=...)`.

### 6.2. Карта

```python
stripe.checkout.Session.create(
    mode="subscription",
    customer=cus_id,
    line_items=[{"price": price_id, "quantity": 1}],
    subscription_data={"metadata": {"studio_id": ..., "plan": ..., "period_months": ...}},
    automatic_tax={"enabled": True},
    customer_update={"address": "auto", "name": "auto"},
    tax_id_collection={"enabled": True},
    billing_address_collection="required",
    success_url=..., cancel_url=...,
)
```

`tax_id_collection` + `billing_address_collection` — Stripe **сам** соберёт адрес и VAT ID
на своей странице и запишет их в Customer. Наши поля `Studio.country/postal_code/vat_id`
дозаполняются обратно из вебхука. Для карточной ветки это снимает требование заполнить
их заранее.

### 6.3. IBAN

Хостед-страницы нет, поэтому адрес и страна обязаны быть у нас **до** создания подписки.
Если `Studio.country` пуст — `422 {"code": "billing.tax_details_required"}`.

```python
stripe.Subscription.create(
    customer=cus_id,
    items=[{"price": price_id}],
    collection_method="send_invoice",
    days_until_due=14,
    automatic_tax={"enabled": True},
    payment_settings={
        "payment_method_types": ["customer_balance"],
        "payment_method_options": {
            "customer_balance": {
                "funding_type": "bank_transfer",
                "bank_transfer": {
                    "type": "eu_bank_transfer",
                    "eu_bank_transfer": {"country": "DE"},
                },
            },
        },
    },
    metadata={"studio_id": ..., "plan": ..., "period_months": ...},
)
```

IBAN и BIC — из `Customer.create_funding_instructions(funding_type="bank_transfer",
currency="eur", bank_transfer={...})`; он **постоянный для студии**. `reference`
(назначение платежа) — из инструкций конкретного финализированного инвойса, он привязан
к счёту.

### 6.4. Смена тарифа или периода

Если у студии уже есть `stripe_subscription_id` в живом статусе, `POST /billing/checkout*`
**не создаёт вторую подписку**, а меняет позицию существующей:

```python
stripe.Subscription.modify(
    sub_id,
    items=[{"id": item_id, "price": new_price_id}],
    proration_behavior="create_prorations",
)
```

Stripe выставит пропорциональный счёт за разницу. Это и есть «профессиональное»
поведение вместо второй параллельной подписки.

### 6.5. Смена метода оплаты

`Subscription.modify(collection_method=...)` — без пересоздания подписки.

### 6.6. Фактура, чек и письма — кода не требуют

Требование «слать фактуру на email с чеком» закрывается самим фактом перехода на
Subscriptions. Своей генерации PDF и своей рассылки в проекте не появляется.

На каждый цикл подписки Stripe сам:

- создаёт Invoice с номером, позициями и разбивкой по VAT — **независимо от
  `collection_method`**, то есть и для карты, и для перевода;
- хостит страницу счёта (`hosted_invoice_url`) и отдаёт PDF (`invoice_pdf`);
- генерит итемизированный чек после оплаты;
- рассылает письма.

Настраивается **в дашборде, а не в коде** (задачи деплоя):

1. Settings → Billing → Email settings: включить отправку финализированных счетов и
   «Successful payments» (чеки). Без этого объекты создаются, но письма не уходят.
2. Settings → Branding: иконка, логотип, цвета — они же применяются к письмам,
   хостед-странице счёта, PDF и Customer Portal.

Реквизиты в PDF, если чешской фактуре не хватит стандартных полей:
`account_tax_ids` (IČO/DIČ поставщика), `custom_fields` (до 4 штук),
`footer`, `rendering_options`. Задаются на подписке через `invoice_settings`,
попадают в каждый выставленный счёт.

**Проверить с бухгалтером до релиза:** покрывает ли стандартный PDF Stripe требования
к чешской фактуре (номерная серия, DUZP, реквизиты сторон). Если нет — добираем через
`custom_fields`; это правка конфига, не переписывание.

---

## 7. Вебхук

`routers/billing/webhook.py` переписывается с `checkout.session.*` на события подписок.

| Событие | Действие |
|---|---|
| `invoice.finalized` | Завести/обновить зеркало `BillingInvoice`: номер, сумма, `hosted_invoice_url`, `pdf_url`, статус `pending` |
| `invoice.paid` | `apply_status(..., "paid")`: счёт оплачен, зеркало подписки обновлено |
| `invoice.payment_failed` | `apply_status(..., "failed")` |
| `customer.subscription.updated` | Зеркалить `status` и `current_period_end` |
| `customer.subscription.deleted` | `status = expired` |
| `charge.refunded` | Счёт `refunded`; при **полном** возврате (`amount_refunded == amount`) — `Subscription.cancel()`. Частичный возврат подписку не трогает |

### Что сохраняется без изменений

- **Отброс событий Connect-аккаунтов по `event.account`** (`webhook.py:103-106`). Без него
  студия выпишет себе оплаченный счёт, заплатив ту же сумму самой себе на собственный
  Connect-баланс. Критично, не удалять.
- Проверка подписи отдельным секретом `STRIPE_BILLING_WEBHOOK_SECRET`, отброс события без
  секрета.
- На валидное событие всегда `200` — 4xx/5xx заставят Stripe ретраить уже обработанное.
- Идемпотентность `apply_status()`: повтор конечного статуса — no-op, `paid → failed`
  запрещён, `refunded` конечен.

### Что заменяется — и почему это ослабление

`amount_matches()` (`webhook.py:47`) сверял пришедшую сумму с нашей. С подписками сумму
считает Stripe по Price и Stripe Tax, и сверять её нам не с чем: наш `amount_for()` не знает
про VAT и прорейтинг.

**Замена:** событие принимается, только если `invoice.subscription` совпадает с
`StudioBillingPlan.stripe_subscription_id` этой студии, плюс сверка валюты с
`BILLING_CURRENCY`. Авторитетная привязка события к студии — именно `stripe_subscription_id`
в нашей БД; `metadata.studio_id` пишется для диагностики и в проверке доступа не участвует
(её задаёт тот, кто создаёт объект, а значит доверять ей как границе нельзя).

Это записано явно, потому что это money path: защита от «заплатил 1 крону — получил
Business на два года» теперь опирается на то, что Price в Stripe заведён нами и подписка
принадлежит этой студии, а не на сверку числа.

### Что удаляется

`_add_months()`, `_refund()` (откат `expires_at`), `_activate()` в части арифметики
периодов, `charge_saved_card()`, `POST /renew`. Срок считает Stripe.

---

## 8. Пейволл — не переписывается

Гейт продолжает читать `StudioBillingPlan.status` и `expires_at`. Их заполняет вебхук:

- `expires_at = subscription.current_period_end`
- маппинг статусов: `active|trialing → active`, `past_due → past_due`,
  `canceled|unpaid|incomplete_expired → expired`

**`past_due` обязан пускать в CRM.** Перевод по IBAN идёт 1–2 дня, и всё это время
подписка именно в этом статусе. Отрубать студию за то, что деньги в пути, нельзя.
`unpaid` и `canceled` — не пускают.

Переход `past_due → unpaid/canceled` настраивается в дашборде Stripe
(Billing → Subscriptions and emails), не в коде. Это задача деплоя, не разработки.

---

## 9. Налоги

**Страна IBAN налогового присутствия не создаёт.** В ответе funding instructions
`account_holder_name` — это Stripe, `account_holder_address` — Дублин, Ирландия, а
`iban` — немецкий. Это коллекторский счёт Stripe: деньги садятся на баланс чешского
аккаунта Velora и уходят выплатой на чешский банковский счёт. Юрлицо остаётся чешским.

**Реальный налоговый вопрос — VAT.** Чешское юрлицо, продающее SaaS по ЕС:

- студия в Чехии → чешский VAT;
- студия-юрлицо в другой стране ЕС с валидным VAT ID → **reverse charge, 0%**;
- студия без VAT ID в другой стране ЕС → местная ставка, отчётность OSS.

Закрывается `automatic_tax={"enabled": True}` на подписке и Checkout Session плюс VAT ID
у Customer. Ставку, reverse charge и строку в PDF Stripe делает сам.

**Требует действий вне кода** (задачи деплоя, не разработки):

1. Включить Stripe Tax в дашборде и завести налоговые регистрации
   (`/v1/tax/registrations`, для ЕС — `oss_union`).
2. Задать tax code продуктам (SaaS — `txcd_10103001`).
3. Подтвердить схему с бухгалтером: спека описывает механику, а не даёт налоговую
   консультацию.

Stripe Tax платный (комиссия с транзакций, где считается налог) — это принятая цена.

---

## 10. Миграция уже оплативших

Студии с `expires_at` в будущем и `stripe_subscription_id IS NULL` — legacy. Их **не
трогаем**: они доживают оплаченный период на текущем `expires_at`, гейт работает как
работал.

При первой оплате после релиза подписка создаётся с `trial_end = expires_at`. Stripe не
берёт денег до конца уже оплаченного срока и начинает биллить ровно после него. Никто не
теряет оплаченное и никто не платит дважды.

Данные не переписываются, бэкфилла нет — миграция Alembic только добавляет колонки.

---

## 11. Дрейф и сверка

Вебхук может не доехать. `POST /billing/invoices/{id}/sync` остаётся, но переписывается:
тянет Subscription и Invoice из Stripe и прогоняет через тот же `apply_status`. Одна точка
перехода статуса для вебхука и для ручной сверки — как сейчас.

Фоновой периодической сверки в этой спеке нет.

---

## 12. Проверки

Сохраняем паттерн проекта: `python -m <module>` self-check в каждом тронутом модуле.

**Self-check'и:**
- `services/stripe_catalog`: `lookup_key` покрывают все пары план×период из `plans.py`;
  маппинг периода на `interval`/`interval_count` (24 мес → `year`/2).
- `routers/billing/plans`: суммы из таблицы §4.1; валюта с младшими единицами
  (существующая проверка против `_ZERO_DECIMAL` сохраняется — EUR её проходит).
- `routers/billing/webhook`: маппинг статусов Stripe → наш; идемпотентность `apply_status`
  (существующие ассерты переиспользуются); отброс события чужой подписки; отброс события
  Connect-аккаунта.

**Тест-файл** `back/tests/test_billing_subscription.py`. Сквозная проверка IBAN-ветки без
живых денег — через test helper Stripe
`POST /v1/test_helpers/customers/:id/fund_cash_balance`: имитирует входящий перевод,
Stripe закрывает инвойс и шлёт настоящий `invoice.paid`.

Тесты не должны слать почту: письма из биллинга (`email_receipt_enabled`) в тестах
застабить. Прогон **пофайлово** — тесты пишут в dev-БД.

---

## 13. Известные пробелы

Записаны явно, чтобы не ушли в прод незамеченными:

1. **Кнопка «Продлить» на фронте станет мёртвой** до UI-спеки — эндпоинт отвечает `410`.
2. **История счетов** на фронте показывает старые поля; ссылки на PDF от Stripe появятся
   только в UI-спеке.
3. **Комбо/процентная модель** не переведена на подписки: активация модели пишет поля в
   БД, но в Stripe ничего не создаёт.
4. **Нет фоновой сверки** дрейфа между Stripe и зеркалом — только ручная кнопка.
5. **Stripe Tax требует ручной настройки** регистраций в дашборде; без неё
   `automatic_tax` будет отдавать ошибку расчёта.
6. **Legacy-студии** живут по старой логике `expires_at`, пока не оплатят снова.
