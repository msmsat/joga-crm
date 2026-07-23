# Epic B2 — Эндпоинты: активация модели, IBAN-инвойс, autopay-настройки

**Цель:** серверная часть под новые UI-требования — активация тарифной модели
(«3%» / «фикс+1.5%»), ветка оплаты по IBAN (генерация тестового IBAN + инвойс),
сохранение autopay-настроек. Существующий Fondy-checkout (карта) не трогаем.

**Зависит от:** B1 · **Блокирует:** B3, B4

---

## Backend — файлы

Расширяем существующий роутер, новых пакетов не заводим:

- `back/routers/billing/checkout.py` — добавить `POST /billing/checkout/iban`.
- `back/routers/billing/router.py` — добавить `POST /billing/model` и `PATCH /billing/autopay`.
- `back/routers/billing/plans.py` — константы процентов моделей.
- `back/schemas/settings/billing.py` — новые схемы (см. ниже).

Все эндпоинты — `Depends(require_role("owner"))`, `StudioContext` (страница — только владелец).

### Константы (`plans.py`)

```python
# Модель «%»: единственный тариф (аудит §3). Модель «комбо»: 1.5% + фикс ÷2.
PERCENT_ONLY_RATE = 3.0
COMBO_PERCENT_RATE = 1.5
# Комбо-фикс: половина от подписки (аудит «уменьшить цену в 2 раза»), коп/мес.
COMBO_FIXED: dict[str, int] = {
    "start":    PLANS["start"]["price"]    // 2,   #  495.00
    "pro":      PLANS["pro"]["price"]      // 2,   # 1245.00
    "business": PLANS["business"]["price"] // 2,   # 2995.00
}
```

### 1. Активация тарифной модели

`POST /billing/model`

Request:
```json
{ "mode": "percent" }                                   // модель «3%»
{ "mode": "combo", "plan": "pro", "period_months": 6 }  // фикс+1.5%, период влияет ТОЛЬКО на фикс
{ "mode": "subscription", "plan": "pro", "period_months": 12 }
```

Schema:
```python
class ActivateModelRequest(BaseModel):
    mode: Literal["subscription", "percent", "combo"]
    plan: Optional[Literal["start", "pro", "business"]] = None
    period_months: Optional[Literal[1, 6, 12, 24]] = None
```

Логика:
- `percent` → `billing_mode="percent"`, `percent_rate=3.0`, `fixed_base_amount=None`.
  Плата фиксом не берётся сейчас — это переключение тарифной схемы, не разовый платёж.
- `combo` → `billing_mode="combo"`, `percent_rate=1.5`,
  `fixed_base_amount = round(COMBO_FIXED[plan] * (1 - PERIOD_DISCOUNTS[period_months]))`
  (скидка периода применяется **только к фиксу**, аудит §3).
- `subscription` → как раньше, оплата идёт через `/checkout`.

Апдейтит строку `StudioBillingPlan` (upsert по `studio_id`). Response — обновлённый `BillingPlanRead`.

```python
@router.post("/model", response_model=BillingPlanRead)
async def activate_model(body: ActivateModelRequest,
                         ctx: StudioContext = Depends(require_role("owner")),
                         db: AsyncSession = Depends(get_db)):
    row = (await db.execute(select(StudioBillingPlan)
              .where(StudioBillingPlan.studio_id == ctx.studio_id))).scalar_one_or_none()
    if row is None:
        row = StudioBillingPlan(studio_id=ctx.studio_id, plan_name=body.plan or "pro")
        db.add(row)
    row.billing_mode = body.mode
    if body.mode == "percent":
        row.percent_rate, row.fixed_base_amount = PERCENT_ONLY_RATE, None
    elif body.mode == "combo":
        disc = PERIOD_DISCOUNTS[body.period_months or 1]
        row.percent_rate = COMBO_PERCENT_RATE
        row.fixed_base_amount = round(COMBO_FIXED[body.plan or "pro"] * (1 - disc))
        row.plan_name = body.plan or row.plan_name
    else:
        row.percent_rate = None
        row.plan_name = body.plan or row.plan_name
    await db.commit(); await db.refresh(row)
    return _to_plan_read(row)  # хелпер из router.py, вынести маппинг
```

### 2. Ветка IBAN

`POST /billing/checkout/iban` — не редиректит на Fondy, а создаёт `pending`-инвойс и
возвращает **тестовый (фейковый) IBAN + инвойс** для показа в модалке (аудит §4).

```python
class IbanCheckoutRequest(BaseModel):
    plan: Literal["start", "pro", "business"]
    period_months: Literal[1, 6, 12, 24]

class IbanCheckoutResponse(BaseModel):
    invoice_id: int
    invoice_number: str      # "INV-2026-000123"
    iban: str                # тестовый, детерминированный
    amount: int              # копейки
    reference: str           # назначение платежа = order_id
    beneficiary: str = "Velora CRM LLC"
```

Логика: тот же паттерн, что `create_checkout` (`checkout.py:28`) — создаём `BillingInvoice`
(`payment_method="iban"`, `status="pending"`, `order_id`), но **без** вызова Fondy.
Тестовый IBAN генерим детерминированно от `studio_id` (не случайный — чтобы совпадал при
повторном открытии, аудит «тестовый IBAN»):

```python
def fake_iban(studio_id: int) -> str:
    # ponytail: фейковый IBAN для теста оплаты, не валидируется банком. Реальный — через провайдера.
    tail = f"{studio_id:018d}"[-18:]
    return f"DE{(studio_id * 97 % 89 + 10):02d}5001051000{tail[:10]}"
```

Инвойс переходит в `paid` тем же вебхуком/ручной сверкой, что и остальные (сейчас —
`webhook.py`; для IBAN реального шлюза нет → в тестовом контуре можно ручной
`PATCH` статуса админом, вне скоупа UI).

### 3. Autopay-настройки

`PATCH /billing/autopay` — сохраняет тумблеры из вкладки «Способ оплаты».

Request (частичный, `AutopaySettingsUpdate` из B1):
```json
{ "auto_renewal": true, "notify_before_autocharge": true, "sms_notification_enabled": false }
```

Response — обновлённый `BillingPlanRead`. Гейт: если у пользователя нет карты
(`method_type != "card"` / только IBAN), `auto_renewal` принудительно `False`
(аудит: «автосписание только по карте»):

```python
if body.auto_renewal:
    card = (await db.execute(select(PaymentCard).where(
        PaymentCard.user_id == ctx.user.id, PaymentCard.method_type == "card"))).scalar_one_or_none()
    if card is None:
        raise HTTPException(400, "Автосписание доступно только при оплате картой")
```

## Frontend API & State

`front/src/api/billing/billing.api.ts` — добавить:

```ts
activateModel: (body: ActivateModelRequest) =>
  client.post<BillingPlan>('/billing/model', body),

checkoutIban: (plan: CheckoutRequest['plan'], period_months: CheckoutRequest['period_months']) =>
  client.post<IbanCheckout>('/billing/checkout/iban', { plan, period_months }),

updateAutopay: (patch: Partial<AutopaySettings>) =>
  client.patch<BillingPlan>('/billing/autopay', patch),
```

`billing.types.ts` — добавить `ActivateModelRequest`, `IbanCheckout`, `AutopaySettings`,
расширить `BillingPlan`/`PaymentCard` полями из B1 (1:1 с бэком).

Обновление стейта без F5: ответ `activateModel`/`updateAutopay` — свежий `BillingPlan`,
кладём прямо в стейт `plan` (`setPlan(res)`), не перезагружаем страницу.

## Проверка

```
cd back && venv\Scripts\activate && python -m pytest tests/ -q -k billing
```

Self-check расчёта комбо-фикса со скидкой периода:

```python
def test_combo_fixed_with_period_discount():
    from routers.billing.plans import COMBO_FIXED, PERIOD_DISCOUNTS
    # pro фикс 1245.00 коп/мес, период 12 → −30%
    assert round(COMBO_FIXED["pro"] * (1 - PERIOD_DISCOUNTS[12])) == round(124500 * 0.70)
```

> `[3 эндпоинта на существующем роутере]` → skipped: реальный IBAN-шлюз/сверка входящих платежей — вне скоупа страницы, тестовый IBAN достаточно для флоу. Add when подключат банк-провайдера.
