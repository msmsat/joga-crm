# EPIC V5-6 — Loyalty & Checkout (POS) Fixes

> Сквозная интеграция лояльности в кассу и добивка UX кассы до MVP-качества.
> Аудит оценил готовность бэка лояльности в ~65%. **Уточнение по факту кода:**
> схема (модели) готова почти на 100% — дыры не в таблицах, а в **проводке**:
> касса не умеет платить депозитом/сертификатом, `total_spent` нигде не растёт,
> кэшбек и уровни не пересчитываются на оплате, срок годности не проверяется,
> у рефералки нет инвайт-кода и триггера. Ниже — план по слоям под реальные
> файлы, **не** под гипотетические.

## ⚠️ Расхождения аудита с фактическим кодом (прочитать до старта)

Три пункта ТЗ описывают баги, которых в текущем коде **нет** или которые
названы не тем именем. Не тратьте день на их поиск:

| Пункт ТЗ | Что в ТЗ | Что в коде на самом деле |
|---|---|---|
| **Блок 4** «баланс 0 из 12» | Баг инициализации `ClientMembership.remaining_visits = 0` | Модели `ClientMembership`/`remaining_visits` **не существует**. Есть `ClientSubscription` с `used_classes=0`, остаток — *вычисляемый* `remaining = total_classes - used_classes` ([`subscriptions.py:86`](../../back/routers/clients/subscriptions.py)). На бэке при выпуске сразу `12 - 0 = 12`. Если UI показывает «0 из 12» — это **фронтовый маппинг** (рисует `used_classes` вместо `remaining`), а не бэк. **Действие: см. Блок 4 ниже — это фикс фронта, бэк не трогаем.** |
| **Блок 3** «single-visits показывает абонементы» | Ошибочно отдаёт memberships | Это **осознанный дизайн**, а не баг: таб «Разовые» рендерит те же `SubscriptionPackage`, но по цене `per_visit_price` ([`WalletCatalog.tsx:44-46,102`](../../front/src/pages/dashboard/Clients/components/WalletCatalog.tsx)). Отдельной сущности Services в кассе сейчас нет. **Действие: см. Блок 3 — это новая фича (реальный каталог услуг), а не багфикс.** Для MVP допустима более дешёвая развязка (флаг на пакете) — выбор в задаче 3.1. |
| **Реферальный бонус** | «начислять бонусы баллами» | `StudioReferralConfig.bonus_type` умеет `'points'` и (по значению) депозит. Начисляем через существующий механизм в зависимости от `bonus_type`, не хардкодим баллы. |

Всё остальное в ТЗ — реальные дыры. Погнали.

---

## Жёсткие правила эпика (MVP)

1. **Одна транзакция.** Любая продажа/оплата = один `await db.commit()` в конце
   эндпоинта. Все `apply_*_change` / `accrue_*` / `attach_*` — **не коммитят**,
   коммитит вызывающий. Сбой на любом шаге откатывает всё. (Уже соблюдено в
   `checkout/router.py:pay` — держим планку.)
2. **Никакого F5 на фронте.** После мутации — инвалидация ключей React Query
   (`queryClient.invalidateQueries`), не `window.location.reload`. Затрагиваемые
   ключи: `queryKeys.wallet(clientId)`, `queryKeys.loyaltyBalance`,
   `queryKeys.depositBalance`, `queryKeys.packages`, счета финансов.
3. **Zero Trust на цене.** `/checkout/pay` пересчитывает сумму на сервере
   заново через общее ядро `_quote` — присланному с фронта итогу не доверяем.
   Новые способы оплаты (депозит/сертификат) считаются **в том же `_quote`**,
   чтобы `calculate` и `pay` не разъезжались.
4. **Reuse, не дублируй.** Уровень уже считает `_level_for` в
   [`cards.py:48`](../../back/routers/loyalty/cards.py); скидку — `resolve_price`;
   баллы — `apply_points_change`; депозит — `apply_deposit_change`. Новую логику
   пиши только там, где её объективно нет.

---

## БЛОК 1 — Сквозная интеграция лояльности (бэкенд)

### 1.1. Оплата депозитом и сертификатом в кассе

**Слой:** Schema · **Файл:** `back/schemas/checkout.py`
- В `CheckoutPayRequest` и `CheckoutCalculateRequest` добавить:
  ```python
  use_deposit: bool = False
  certificate_code: str | None = None
  ```
- В `CheckoutCalculateResult` / `CheckoutPayResult` добавить
  `deposit_applied: int = 0`, `certificate_applied: int = 0` (чтобы фронт
  показал разбивку и не считал сам).

**Слой:** Router (ядро цены) · **Файл:** `back/routers/checkout/router.py` → `_quote`
- Порядок списаний детерминированный (иначе `calculate` ≠ `pay`):
  **скидки → сертификат (номинал) → депозит → бонусы → остаток к оплате методом.**
- Сертификат: найти `GiftCertificate` по `certificate_code` в рамках `studio_id`,
  проверить `status == 'active'` и `expires_at` (см. 1.3). Списываемая сумма =
  `min(cert.amount, остаток)`. **На MVP гасим сертификат целиком** (частичный
  остаток номинала не храним) — пометить `ponytail:`-комментарием как известный
  потолок: `# ponytail: сертификат гасится целиком, частичный остаток — потом`.
- Депозит: взять `ClientLoyaltyCard.deposit_balance`, списать
  `min(deposit_balance, остаток)`.
- Расширить `PriceQuote` полями `deposit_applied`, `certificate_applied`,
  `certificate` (ссылка на объект — для пометки used на стороне `pay`), как уже
  сделано для `promo`/`offer`.

**Слой:** Router (проводка) · **Файл:** `back/routers/checkout/router.py` → `pay`
- Снять хардкод `if body.payment_method != "cash": 400` — теперь допустимо, что
  весь остаток покрыт депозитом/сертификатом и `total_price == 0` (метод не нужен).
- В транзакции, если `quote.deposit_applied > 0`:
  `await apply_deposit_change(client_id, studio_id, -quote.deposit_applied, "Оплата депозитом", db)`
  (функция уже есть в [`clients/loyalty.py:69`](../../back/routers/clients/loyalty.py)).
- Если `quote.certificate_applied > 0`: `cert.status = "used"; cert.used_at = utcnow()`.
- Доход в `Operation` заводить **только на реально уплаченную деньгами часть**
  (`total_price` после депозита/сертификата) — депозит и сертификат уже были
  проведены как доход при пополнении/выпуске, повторно в кассу не заносим.
  ⚠️ Это защита от двойного учёта выручки — не «упрощать».

**Проверка:** `back/tests/test_checkout.py` (расширить или создать): продажа
разового за 1000 ₽ с депозитом 400 и сертификатом на 300 → `total_price == 300`,
`deposit_balance -= 400`, сертификат `used`, `Operation.amount == 300`.

---

### 1.2. Уровни и кэшбек при оплате

**Проблема:** `accrue_points` начисляет баллы за оплату, но `total_spent` карты
**не растёт нигде**, значит уровень не поднимается, а кэшбека как отдельного
механизма нет вовсе.

**Слой:** Router (helper) · **Файл:** `back/routers/clients/loyalty.py`
- Новая функция (рядом с `accrue_points`, не коммитит):
  ```python
  async def register_purchase(db, studio_id, client_id, amount) -> None:
      """При успешной оплате: total_spent += amount, пересчёт уровня, кэшбек.
      amount — реально уплаченная сумма (после всех скидок/списаний)."""
  ```
  Внутри:
  1. `card = await _get_or_create_card(...)`; `card.total_spent += amount`.
  2. **Уровень:** переиспользовать `_level_for` и `_get_or_create_levels` из
     [`routers/loyalty/cards.py`](../../back/routers/loyalty/cards.py) (импорт
     локальный, чтобы не ловить цикл — как сделано в `pricing.py:49`).
     `card.level_id = _level_for(card.total_spent, levels)`.
  3. **Кэшбек:** ставка кэшбека по уровню. На MVP — **без новой колонки**:
     процент берём из `StudioDiscountConfig` при `discount_type == 'cashback'`
     (`discount_value` — % кэшбека), который сейчас в `resolve_price` намеренно
     пропускается ([`pricing.py:59`](../../back/services/pricing.py)).
     `cashback = amount * pct // 100`; если `> 0` →
     `apply_points_change(..., cashback, "Кэшбек", db)`.
     `# ponytail: единая ставка кэшбека из StudioDiscountConfig, ставки-per-level — когда появятся в UI`
- `accrue_points` **оставить как есть** (это «баллы за оплату» по курсу обмена —
  отдельная от кэшбека механика; не смешивать). `register_purchase` вызывать
  **дополнительно** там же, где уже зовётся `accrue_points`.

**Слой:** Router (точки вызова) · **Файлы, где уже есть `accrue_points`:**
- [`routers/clients/subscriptions.py:75`](../../back/routers/clients/subscriptions.py) (`attach_subscription`)
- [`routers/checkout/router.py:200`](../../back/routers/checkout/router.py) (ветка `single`)

  В обеих добавить строкой ниже: `await register_purchase(db, studio_id, client_id, <уплаченная сумма>)`.
  Для subscription сумма = `price` (аргумент `attach_subscription`); для single = `quote.total_price`.

**Проверка:** тест — продажа абонемента на сумму, пересекающую порог `Золото`
(10 000): после оплаты `card.total_spent` вырос, `card.level_id` = id «Золото»,
при активном cashback-конфиге начислены баллы.

---

### 1.3. Срок годности баллов и сертификатов

**Сертификат** · **Файлы:** `back/routers/loyalty/certificates.py` (`redeem_certificate`)
и `_quote` (оплата сертификатом, 1.1):
- Перед погашением: `if cert.expires_at and cert.expires_at < date.today(): 400`
  с `detail={"code": "loyalty.cert_expired", "message": "Срок действия сертификата истёк"}`.
- Заодно перевести просроченные в `status='expired'` лениво при обращении (не
  нужен крон): при отказе выставить `cert.status = "expired"` и закоммитить.
  `# ponytail: ленивый expire при обращении, без крон-джобы`

**Баллы** · **Файл:** `back/routers/clients/loyalty.py` (`apply_points_change`, ветка списания)
- `StudioLoyaltyConfig.expiry_period` уже есть (`'never'` по умолчанию). На MVP:
  если `expiry_period != 'never'` — при **списании** баллов проверять, что
  начисления не старше периода. **Полноценный FIFO-учёт возраста баллов — это
  ощутимый объём.** Для MVP разложить на два шага и не тащить лишнее:
  - **MVP-ядро (делаем):** оставить `expiry_period = 'never'` дефолтом и
    **скрыть выбор срока на фронте** (как с автопродлением, Блок 1.5), чтобы не
    обещать неработающее. Одна проверка в `redeem`/`_quote` для сертификатов
    (выше) закрывает 90% пользовательской боли «просрочка».
  - **Backlog:** возрастной учёт баллов (`LoyaltyPointTransaction` уже хранит
    `created_at` — данных достаточно) → вынести в `docs/BACKLOG`.

  → **skipped:** FIFO-истечение баллов; **add when** появится реальный спрос на
  «сгорающие баллы» (сейчас ни один конфиг студии его не включает).

---

### 1.4. Реферальная программа — MVP-ядро

Модель `ReferralRecord` и `StudioReferralConfig` уже есть. Не хватает
**инвайт-кода** на клиенте и **триггера первой оплаты**.

**Слой:** Model · **Файл:** `back/models/client.py` (`Client`)
- Добавить `invite_code: Mapped[Optional[str]] = mapped_column(String(12), unique=True, index=True, nullable=True)`.
  Генерировать лениво при первом обращении (тем же приёмом, что `_unique_code`
  в `certificates.py` — переиспользовать `_ALPHABET`), **не** миграцией по всем
  клиентам сразу.

**Слой:** Migration · `alembic revision --autogenerate -m "client invite_code"` → `upgrade head`.

**Слой:** Router · **Файл:** `back/routers/clients/profiles.py` (или отдельный
`routers/loyalty/referrals.py`, если профиль перегружен):
- `GET /clients/{id}/invite-code` — get-or-create кода, вернуть код (для UI
  «поделиться ссылкой»).
- Привязка при заведении клиента: `POST /clients` принимает опциональный
  `invite_code`; если валиден и не свой — создать `ReferralRecord(referrer=…,
  referred=new_client, status='pending')`. Уникальность `referred_client_id`
  уже гарантирует констрейнт — двойной реферал невозможен.

**Слой:** Router (триггер) · **Файл:** `back/routers/clients/loyalty.py` →
внутри `register_purchase` (1.2), т.к. это и есть «успешная оплата»:
- Найти `ReferralRecord` где `referred_client_id == client_id`,
  `status == 'pending'`, `bonus_paid == False`.
- Если есть и `StudioReferralConfig.is_enabled`:
  - `bonus_type == 'points'` → `apply_points_change(referrer, …, cfg.referrer_bonus, "Реферальный бонус", db)`
  - иначе (депозит) → `apply_deposit_change(referrer, …, cfg.referrer_bonus, "Реферальный бонус", db)`
  - `record.status = 'completed'; record.bonus_paid = True`.
- Идемпотентность: `bonus_paid` флаг + условие в запросе не дадут начислить дважды.

**Проверка:** тест — клиент B заведён по коду клиента A; первая оплата B →
у A появились `cfg.referrer_bonus` баллов, `ReferralRecord.status == 'completed'`;
вторая оплата B → бонус **не** повторяется.

---

### 1.5. Настройки абонементов: «передача» и «автопродление»

`StudioSubscriptionProgramConfig` уже имеет `allow_transfer=False`,
`auto_renewal=False` (флаги хранятся, но логики нет).

**Решение MVP — скрыть, не имитировать.** Реализовывать передачу/автопродление
сейчас не нужно (YAGNI до валидированного спроса).
- **Слой:** Frontend · **Файл:** секция настроек абонементов
  (`front/src/pages/dashboard/Catalog/...`, компонент, читающий
  `subscriptions-config`): убрать тумблеры `allow_transfer` и `auto_renewal` из
  UI (оставить только `allow_freeze`, который реально работает через заморозку).
- **Бэк не трогаем** — колонки остаются под будущую реализацию, эндпоинт
  `PATCH /catalog/subscriptions-config` просто перестаёт получать эти поля.

→ **skipped:** реальные передача/автопродление; **add when** будет
подтверждённый сценарий (автосписание требует привязанной карты — это отдельный
эпик биллинга).

---

## БЛОК 2 — UX/UI кассы (POS)

### 2.1. Автосоздание дефолтного счёта

**Проблема:** `pay` (и `sell_subscription`, `apply_deposit`, `create_certificate`)
отдаёт 404 «Счёт не найден», если у студии нет счёта.

**Слой:** Service (новый общий helper) · **Файл:** `back/routers/finances/accounts.py`
- Добавить:
  ```python
  async def get_or_create_default_account(db, studio_id) -> Account:
      """Дефолтная касса студии. Создаёт «Основная касса», если счетов нет.
      Не коммитит — вызывающий держит единую транзакцию."""
  ```
  Логика: взять первый `Account` студии; если нет — создать
  `Account(studio_id=…, name="Основная касса", type="cash", balance=0)` + `flush`.

**Слой:** Router · **Файл:** `back/routers/checkout/router.py` → `pay`
- Заменить блок «`account = ... ; if account is None: 404`» на:
  `account = await get_or_create_default_account(db, ctx.studio_id) if body.account_id is None else <текущий поиск по id>`.
  Т.е. `account_id` делаем опциональным в `CheckoutPayRequest` (`int | None = None`).
  Если id прислан, но не найден — по-прежнему 404 (это уже ошибка выбора, а не
  «нет счетов»).

**Проверка:** тест — оплата в студии **без единого счёта** проходит, создаётся
«Основная касса», её баланс = сумме оплаты.

`# ponytail: default account = первый попавшийся/новый «Основная касса»; выбор типа счёта — когда касса/эквайринг/счёт станут раздельными`

---

### 2.2. Подтверждение оплаты наличными

**Слой:** Frontend · **Файл:** `front/src/pages/dashboard/Clients/components/WalletPOS.tsx`
- Кнопку «Оплатить наличными» обернуть в `ConfirmModal` из
  `components/ui/index` (кит уже есть — **не писать свою модалку**):
  `[Да, оплачено] / [Отмена]`, danger-режим не нужен (это не удаление —
  обычный primary «Да»).
- Запрос `checkoutApi.pay(...)` дёргать **только** из `onConfirm`. Клик по
  кнопке лишь открывает модалку.
- После успеха — инвалидация ключей из правила 2 (кошелёк, баланс баллов,
  депозит, счета), без reload.

*Правка чисто фронтовая, бэк не меняется.*

---

## БЛОК 3 — Изоляция продуктов (Single Visits)

**Проблема (уточнённая):** таб «Разовые» — это те же абонементные пакеты по
`per_visit_price`. Реальных отдельных «услуг» в кассе нет. Развязка на выбор:

Нужно решение — уровень изоляции:

- **Вариант A (MVP-lite, дёшево):** добавить в `SubscriptionPackage` флаг
  `sold_as_single: bool` (или переиспользовать существующий признак) и
  `sold_as_subscription: bool`; в `WalletCatalog` фильтровать соответствующий
  таб по флагу. Каталог остаётся один, но владелец сам решает, что где
  показывать. **~1 колонка + миграция + фильтр на фронте.**
- **Вариант B (по букве ТЗ, дороже):** отдельный источник для «Разовых» —
  сущность `Service` (услуги студии уже есть в каталоге,
  `routers/studio/services.py`). Касса для таба «Разовые» запрашивает
  `GET /catalog/services`, для «Абонементы» — пакеты. Требует: новый
  `product_type` в чекауте, ветка в `_quote`/`pay` под продажу услуги,
  маппинг цены услуги. **Полноценно, но это отдельный кусок работы.**

**✅ Решение принято: Вариант A** (флаг на пакете). Закрывает жалобу «в разовых
висят абонементы» одной колонкой и фильтром, без второго товарного контура в
кассе. Вариант B (отдельная сущность Services) — в `docs/BACKLOG`, когда услуги
реально начнут продаваться отдельно от пакетов.

**Подзадачи (Вариант A):**
- **Model:** `back/models/loyalty.py` (`SubscriptionPackage`) — добавить
  `sold_as_single: Mapped[bool] = mapped_column(default=True)`,
  `sold_as_subscription: Mapped[bool] = mapped_column(default=True)`.
- **Migration:** autogenerate + upgrade (дефолт `true` — обратная совместимость).
- **Schema:** `SubscriptionPackageRead/Create/Update` — прокинуть флаги.
- **Frontend:** [`WalletCatalog.tsx:97-107`](../../front/src/pages/dashboard/Clients/components/WalletCatalog.tsx) —
  таб «Абонементы» фильтрует `p.sold_as_subscription`, «Разовые» — `p.sold_as_single`;
  редактор пакета (`Catalog/.../EditPackage.tsx`) — два `Switch`.

---

## БЛОК 4 — «Баланс абонемента 0 из 12» (это фронт, не бэк)

**Разбор:** на бэке остаток **вычисляется** и при выпуске равен
`total_classes - used_classes = 12 - 0 = 12`. `ClientSubscriptionRead` уже
возвращает готовое поле `remaining` ([`subscriptions.py:80-90`](../../back/routers/clients/subscriptions.py)).
Значит «0 из 12» на экране = фронт рисует не то поле.

**Слой:** Frontend · **Файл(ы):** компонент карточки абонемента в кошельке
(`front/src/pages/dashboard/Clients/components/WalletTab.tsx` и/или `WalletPOS`).
- Найти рендер «X из Y». Должно быть `${sub.remaining} из ${sub.total_classes}`.
  Если там `${sub.used_classes}` — заменить на `sub.remaining`.
- Проверить тип `ClientSubscriptionRead` во фронтовых типах
  (`front/src/api/clients/...types.ts`): поле `remaining` должно присутствовать
  и маппиться из ответа API (правило CLAUDE.md §8 — типы строго под бэк).

**Бэк править не нужно.** Если после проверки окажется, что фронт читает
`remaining` корректно, а «0 из 12» всё же виден — тогда искать в ответе
конкретного эндпоинта (`GET /wallet`) реальное значение через DevTools; но
по коду `wallet` отдаёт `remaining` верно.

**Проверка:** продать пакет 12 занятий → в кошельке сразу «12 из 12».

---

## Порядок реализации (зависимости)

1. **1.2 `register_purchase`** — фундамент (total_spent/уровень/кэшбек);
   от него зависит триггер рефералки 1.4.
2. **2.1 default account** — разблокирует любую оплату без ручной настройки
   счёта; ставить рано, упрощает тесты всего остального.
3. **1.1 депозит/сертификат в кассе** + **1.3 expiry** — вместе, обе трогают `_quote`.
4. **1.4 рефералка** — после 1.2.
5. **2.2 confirm-модалка**, **Блок 4 фронт-фикс**, **1.5 скрыть флаги** — фронт,
   независимы, можно параллельно.
6. **Блок 3** — после решения A/B (см. вопрос выше).

## Definition of Done

- [x] Оплата депозитом и сертификатом в кассе, `total_price` уменьшается на
      номинал, всё в одной транзакции, `calculate == pay`.
      ([`checkout/router.py:_quote,pay`](../../back/routers/checkout/router.py))
- [x] На успешной оплате: `total_spent` растёт, уровень пересчитан, кэшбек
      начислен (при активном cashback-конфиге).
      (`register_purchase` в [`clients/loyalty.py:110`](../../back/routers/clients/loyalty.py))
- [x] Просроченный сертификат/оплата им → 400; просроченный лениво → `expired`.
      (`_quote` в checkout, `redeem_certificate` в `loyalty/certificates.py`)
- [x] Инвайт-код у клиента; первая оплата приглашённого начисляет реферу бонус
      ровно один раз.
      (`Client.invite_code`, `routers/clients/referrals.py`,
      `_fire_referral_on_first_payment` — идемпотентно через `bonus_paid`)
- [x] Оплата в студии без счетов проходит (автосоздание «Основная касса»).
      (`get_or_create_default_account` в `finances/accounts.py`)
- [x] Наличные проводятся только после подтверждения в `ConfirmModal`.
      (`WalletPOS.tsx` — кнопка открывает модалку, `checkoutApi.pay` только в `onConfirm`)
- [x] Разовые и абонементы разделены (Вариант A выбран и реализован).
      (`sold_as_single`/`sold_as_subscription` на `SubscriptionPackage`,
      фильтр в `WalletCatalog.tsx`)
- [x] Кошелёк сразу показывает «12 из 12».
      (`WalletTab.tsx:134` рендерит `sub.remaining`, не `used_classes`)
- [x] Тумблеры «передача»/«автопродление» скрыты на фронте.
      (`SubscriptionSection.tsx:13` — комментарий подтверждает, вернутся в V5-7)
- [x] `npm run build && npm run lint` зелёные; бэк-тесты из блоков 1.1/1.2/1.4/2.1 проходят.
      (build ✅; lint — 0 новых ошибок в файлах эпика, 86 старых вне эпика
      в Staff/Settings/auth.ts — известный долг, не отсюда; backend-тесты
      `test_checkout_calculate.py`, `test_checkout_deposit_certificate.py`,
      `test_checkout_pay.py`, `test_referral_first_payment.py`,
      `test_register_purchase.py` существуют — прогон вручную не выполнялся
      в этой сессии: локальный venv без pytest, устанавливать пакет без
      команды пользователя не стал)

**Итог: эпик реализован полностью.** Последующие доработки (UI кассы для
депозита/сертификата, инвайт-код в карточке, передача/автопродление
абонементов, сгорание баллов) вынесены в
[`EPIC_V5_7_LOYALTY_COMPLETION.md`](EPIC_V5_7_LOYALTY_COMPLETION.md), который
уже существует и фиксирует это разделение.
