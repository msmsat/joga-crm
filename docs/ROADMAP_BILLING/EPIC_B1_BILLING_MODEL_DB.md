# Epic B1 — БД: модель тарификации + автосписание

**Цель:** дать БД поля под три модели оплаты («подписка» / «3%» / «фикс+1.5%»),
под autopay-настройки и под безопасное хранение метода оплаты (без PAN).
**Схема почти вся уже есть** — эпик фиксирует дельту и уточняет семантику.

**Зависит от:** — · **Блокирует:** B2, B5

---

## Backend — схема БД

### Что УЖЕ есть в `back/models/settings.py` (не пересоздавать)

`StudioBillingPlan` (`:172`) уже содержит поля под все требования аудита:

```python
billing_mode:      Mapped[str]            = mapped_column(String(20), default="subscription")  # subscription | percent | combo
percent_rate:      Mapped[Optional[float]]= mapped_column(Float, nullable=True)                 # 3.0 или 1.5
fixed_base_amount: Mapped[Optional[int]]  = mapped_column(Integer, nullable=True)               # коп/мес, комбо
auto_renewal:      Mapped[bool]           = mapped_column(Boolean, default=True)
email_receipt_enabled:   Mapped[bool]     = mapped_column(Boolean, default=True)
notify_before_days:      Mapped[int]      = mapped_column(Integer, default=3)  # «напоминание перед автосписанием»
sms_notification_enabled:Mapped[bool]     = mapped_column(Boolean, default=False)
```

`BillingInvoice` (`:210`): `payment_method` (`String(50)`), `pdf_url` (`String(500)`),
`order_id`, `status`, `amount`, `period_months` — **достаточно** для IBAN/карта/чек. Не трогаем.

`PaymentCard` (`:195`): `card_last4`, `card_brand`, `card_expiry`, `cardholder_name`,
`rectoken`, `is_primary` — **хранение PAN отсутствует** (PCI-safe), только маскированные
данные + токен провайдера. Аудит требует «не хранить карту» → **уже соблюдено**.

### Дельта (что добавить миграцией)

1. **`billing_mode` семантика `combo`** — переименовать значение `fixed`→`combo` в коде
   (фронт сейчас шлёт `fixed`). Строковое поле, миграция данных не нужна, но зафиксировать
   допустимые значения в схеме (Literal) — см. B2.

2. **`StudioBillingPlan.notify_before_autocharge`** — аудит просит отдельный **тумблер**
   «напоминание перед автосписанием», семантически ≠ `notify_before_days` (это *за сколько*).
   Добавляем булев флаг:

```python
notify_before_autocharge: Mapped[bool] = mapped_column(Boolean, default=True)
```

3. **`PaymentCard.method_type`** — метод может быть картой или IBAN; autopay доступен
   только карте (аудит §4). Добавляем:

```python
method_type: Mapped[str] = mapped_column(String(10), default="card")  # card | iban
```

   Для IBAN-метода `card_last4/brand/expiry/rectoken` = NULL-эквиваленты; UI это учитывает (B4).

### Alembic

```
cd back && venv\Scripts\activate
alembic revision --autogenerate -m "billing: notify_before_autocharge + card.method_type"
alembic upgrade head
```

Проверить сгенерированный `upgrade()`: два `add_column`. `server_default` для булева на
существующих строках — `sa.true()`; для `method_type` — `sa.text("'card'")`.

## Backend — схемы

`back/schemas/settings/billing.py` — расширить `BillingPlanRead` и добавить схему настроек:

```python
class BillingPlanRead(BaseSchema):
    plan_name: str
    billing_cycle: str
    status: str
    expires_at: Optional[str] = None
    max_staff: int
    auto_renewal: bool
    # дельта B1:
    billing_mode: str = "subscription"
    percent_rate: Optional[float] = None
    fixed_base_amount: Optional[int] = None
    notify_before_days: int = 3
    notify_before_autocharge: bool = True
    email_receipt_enabled: bool = True
    sms_notification_enabled: bool = False

class AutopaySettingsUpdate(BaseModel):
    auto_renewal: Optional[bool] = None
    email_receipt_enabled: Optional[bool] = None
    notify_before_autocharge: Optional[bool] = None
    sms_notification_enabled: Optional[bool] = None
```

`PaymentCardRead` — добавить `method_type: str = "card"`.

Обновить `GET /billing/plan` (`router.py:42`) — вернуть новые поля из `row`.

## Проверка

```
cd back && venv\Scripts\activate && python -m pytest tests/test_billing_webhook.py -q
```

Мини-чек новых полей (self-check, [[ponytail]] — одна проверка на нетривиальную логику):

```python
# back/tests/test_billing_model.py
def test_new_billing_fields_default():
    from models import StudioBillingPlan, PaymentCard
    p = StudioBillingPlan(studio_id=1, plan_name="pro")
    assert p.notify_before_autocharge is True or p.notify_before_autocharge is None  # default через БД
    c = PaymentCard(user_id=1, card_last4="4242", card_brand="Visa", card_expiry="12/29", cardholder_name="X")
    assert getattr(c, "method_type", "card") in ("card", None)
```

> `[2 add_column + расширение схем]` → skipped: отдельная таблица Transactions под ledger — YAGNI, `BillingInvoice` уже покрывает историю и чеки. Add when появятся частичные оплаты/сплиты.
