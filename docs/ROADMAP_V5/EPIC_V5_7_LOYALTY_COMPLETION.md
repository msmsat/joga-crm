# EPIC V5-7 — Loyalty Completion (довести лояльность до конца в CRM)

> Цель: после этого эпика ни один пункт аудита лояльности больше не висит.
> V5-6 закрыл **бэкенд** (депозит/сертификат в кассе, total_spent/уровни/кэшбек,
> триггер рефералки, автосоздание счёта) — дыры остались в **UI** и в трёх
> механиках: сгорание баллов, передача/автопродление абонементов, скидка
> приглашённому. План по слоям под реальные файлы.

## ⚠️ Сверка с аудитом: что УЖЕ закрыто (не тратить время на поиск)

| Пункт аудита | Статус в коде |
|---|---|
| «total_spent не растёт, уровни не растут» | ✅ Закрыто V5-6 1.2 — `register_purchase` ([`clients/loyalty.py:70`](../../back/routers/clients/loyalty.py)), вызывается при продаже абонемента и разового. Тест `test_register_purchase.py` зелёный. |
| «Cashback не начисляется» | ✅ Закрыто там же — `discount_type == 'cashback'` из `StudioDiscountConfig` начисляет баллы при оплате. |
| «Срок действия сертификата при погашении не проверяется» | ✅ Закрыто V5-6 1.3 — проверка + ленивый `expired` и в `redeem_certificate`, и в `_quote` кассы. |
| «Условие "первая оплата" рефералки не реализовано» | ✅ Закрыто V5-6 1.4 — `_fire_referral_on_first_payment` внутри `register_purchase`, идемпотентно (`bonus_paid`). Тест зелёный. |
| «Нет создания ReferralRecord» | ✅ Бэк закрыт — `POST /clients` принимает `invite_code` и создаёт pending-запись ([`profiles.py:568`](../../back/routers/clients/profiles.py)). ❌ UI нет → **Блок 2**. |
| «Депозитом нельзя оплатить через кассу» | ✅ Бэк закрыт V5-6 1.1 (`_quote`/`pay`). ❌ UI нет → **Блок 1**. |
| «Погашение сертификата не уменьшает цену» | ✅ Бэк закрыт — `certificate_code` в кассе списывает номинал. ❌ UI нет → **Блок 1**. Ручное погашение в Лояльности остаётся как сценарий «отоварил вне кассы». |
| «Create an account in Finances first» | ✅ Закрыто полностью (бэк V5-6 2.1 + фронт-фикс 22.07.2026): касса без счёта сама создаёт «Основная касса». |
| Подтверждение оплаты наличными | ✅ Закрыто V5-6 2.2 — `ConfirmModal` в `WalletPOS`. |
| «Обычная операция в Финансах скидку не считает» | 🚫 **Не баг, не делаем.** Ручная операция — фиксация фактической суммы задним числом; скидки/баллы считает касса (`resolve_price`/`_quote`). Применять скидку к произвольной ручной цифре — двойной учёт. |
| Сценарии и сегменты | ✅ Работают, отдельный слой — не трогаем. |

Остаток аудита — 5 реальных дыр. Они и есть блоки этого эпика.

---

## Жёсткие правила (наследуем V5-6, действуют на каждый блок)

1. **Одна транзакция** — единственный `db.commit()` в конце эндпоинта; все хелперы не коммитят.
2. **Никакого F5** — после мутаций только `queryClient.invalidateQueries` по ключам из `queryKeys.ts`.
3. **Zero Trust на цене** — всё новое в цене считается в `_quote`/`resolve_price`, чтобы `calculate == pay`.
4. **Reuse** — `apply_points_change`, `apply_deposit_change`, `register_purchase`, `attach_subscription`, `resolve_price`, `find_valid_promo` уже есть. UI — только компоненты кита (`components/ui/index`).

---

## БЛОК 1 — Касса: оплата депозитом и сертификатом (UI)

Бэк готов и покрыт тестом (`test_checkout_deposit_certificate.py`). Фронтовые
типы кассы вообще не знают этих полей — владелец не может воспользоваться тем,
что уже работает.

### 1.1. Бэк-мелочь: вернуть доступный депозит из calculate

**Файлы:** `back/schemas/checkout.py`, `back/routers/checkout/router.py` → `_quote`
- В `CheckoutCalculateResult` добавить `deposit_available: int = 0`
  (зеркально `bonuses_available` — фронту нужно, что показать рядом с тумблером).
- В `_quote` депозитная карта уже читается при `use_deposit` — читать её всегда
  (один и тот же запрос, что для бонусов — объединить в одно чтение карты) и
  заполнять `deposit_available = card.deposit_balance`.

### 1.2. Типы фронта

**Файл:** `front/src/api/checkout/checkout.types.ts`
- В `CheckoutCalculateRequest` и `CheckoutPayRequest`: `use_deposit?: boolean`,
  `certificate_code?: string | null`.
- В `CheckoutCalculateResult`: `deposit_available: number`, `deposit_applied: number`,
  `certificate_applied: number`. В `CheckoutPayResult`: `deposit_applied`, `certificate_applied`.
- Типы строго под Pydantic-схемы (CLAUDE.md §8) — сверить с `back/schemas/checkout.py`.

### 1.3. WalletPOS: тумблер депозита, поле сертификата, разбивка чека

**Файл:** `front/src/pages/dashboard/Clients/components/WalletPOS.tsx`
- **Депозит:** строка-тумблер как у бонусов (`Switch`), видна при
  `quote.deposit_available > 0`: «Списать с депозита (₽X)». Состояние
  `useDeposit` → в `calculate` и `pay`.
- **Сертификат:** `Input` «Код сертификата» с debounce (тот же приём
  `PROMO_DEBOUNCE_MS`, что у промокода). Ошибки `loyalty.cert_not_found /
  cert_used / cert_expired` прилетают 4xx из `calculate` — показать под полем
  через `errorMessage(e, t)`; сейчас query кассы ошибку глотает — обработать
  `error` из `useQuery` (calculate с невалидным сертификатом кидает 404/400,
  в отличие от промокода — это осознанно, бэк не менять).
- **Чек:** строки «Сертификат −₽X» и «Депозит −₽X» между скидкой и бонусами
  (порядок как в `_quote`: скидки → сертификат → депозит → бонусы).
- **Итого 0:** если `quote.total_price === 0` (всё покрыто) — кнопка активна
  независимо от метода, подпись «Провести (оплачено сертификатом/депозитом)»;
  бэк это уже допускает (`pay` не требует метод при нуле).
- **Инвалидации** после оплаты: к существующим добавить
  `queryKeys.loyaltyDepositStats` и ключи сертификатов/карт лояльности из
  `queryKeys.ts` (сертификат стал `used` — список в Лояльности должен обновиться).

### 1.4. Locale-ключи

**Файлы:** `front/src/locales/{ru,en}/common.json` (секция `errors`) — добавить
`loyalty.cert_not_found`, `loyalty.cert_used`, `loyalty.cert_expired`
(механизм `common:errors.<code>` уже работает — [`errorMessage.ts`](../../front/src/api/errorMessage.ts)).
Плюс ключи кассы в `clients.json`: `useDeposit`, `certLabel`, `certApplied`, `depositApplied`.

**Проверка:** разовое за 1000 с депозитом 400 и сертификатом 300 → чек
показывает обе строки, итого 300; сертификат в Лояльности стал «использован»;
депозит-статистика уменьшилась без F5.

---

## БЛОК 2 — Рефералка как пользовательский сценарий

Бэк-цепочка готова: код → `POST /clients(invite_code)` → pending →
первая оплата → бонус реферу. Не хватает UI на обоих концах и скидки
приглашённому (`StudioReferralConfig.new_client_discount` — поле есть с
дефолтом 15%, но его никто не читает).

### 2.1. Инвайт-код в карточке клиента

**Файл:** `front/src/pages/dashboard/Clients/components/ClientProfileSlider.tsx`
(вкладка Info, рядом с блоком лояльности `LoyaltyIllus`, ~строка 634).
- Блок «Пригласи друга»: код из `GET /clients/{id}/invite-code`
  (get-or-create уже на бэке — [`referrals.py:38`](../../back/routers/clients/referrals.py)),
  кнопка «Копировать» (`navigator.clipboard` + `useToast`).
- Показывать только при включённой рефералке (конфиг уже доступен через
  `loyaltyApi` — тот же источник, что у страницы Лояльность).
- API-слой: `clientsApi.getInviteCode(id)` + тип `{ invite_code: string }`.

### 2.2. Поле инвайт-кода при добавлении клиента

**Файл:** `front/src/pages/dashboard/Clients/components/modals/AddClientModal.tsx`
- Опциональный `Input` «Инвайт-код пригласившего» → прокинуть `invite_code`
  в `POST /clients` (бэк уже принимает; невалидный код тихо игнорируется —
  это ок для MVP, hint под полем «если есть — оба получат бонус»).

### 2.3. Скидка новому клиенту (new_client_discount)

**Слой:** Service · **Файл:** `back/services/pricing.py` → `resolve_price`
- Новый кандидат `("referral", amount, cfg)` рядом со studio/offer/promo:
  если у клиента есть `ReferralRecord(referred_client_id == client_id,
  status == 'pending')` и `StudioReferralConfig.is_enabled` и
  `new_client_discount > 0` → скидка `new_client_discount`% от базы.
  Участвует в правиле «самая выгодная, без стека» — ничего не изобретать.
- Жизненный цикл сам закрывается: после первой оплаты `register_purchase`
  переводит запись в `completed` → скидка исчезает. Отдельного флага не нужно.
- В `ResolvedPrice` добавить `referral_discount_applied: int = 0` (для строки
  в чеке — фронт покажет «Скидка по приглашению −₽X» из `discount`, отдельного
  поля в API кассы не требуется: уже входит в `discount`).

**Проверка (тест `test_referral_first_payment.py` расширить):** клиент B по коду A →
первая покупка B дешевле на 15% → у A бонус, у B вторая покупка уже без скидки.

---

## БЛОК 3 — Сгорание баллов (expiry_period реально работает)

`StudioLoyaltyConfig.expiry_period` (`3m/6m/1y/never`) хранится и выбирается
в UI ([`LoyaltyConfig.tsx:119`](../../front/src/pages/dashboard/Loyalty/components/drawer/configs/LoyaltyConfig.tsx)),
но не действует. V5-6 предлагал скрыть селектор — вместо этого реализуем
механику (решение владельца продукта: «это необходимо»).

**Слой:** Router (helper) · **Файл:** `back/routers/clients/loyalty.py`
- Новая функция (не коммитит):
  ```python
  async def expire_points(db, studio_id, client_id) -> int:
      """Ленивое сгорание: баллы, начисленные раньше cutoff и не потраченные,
      списываются транзакцией 'Сгорание баллов'. Возвращает сколько сгорело."""
  ```
  Без FIFO-леджера — агрегатная формула по `LoyaltyPointTransaction`
  (`created_at` уже есть):
  `earned_old = SUM(points WHERE points > 0 AND created_at < cutoff)`,
  `spent_total = -SUM(points WHERE points < 0)` (включает прошлые сгорания),
  `expired_now = max(0, earned_old - spent_total)`.
  Если `> 0` → `apply_points_change(client, studio, -expired_now, "Сгорание баллов", db)`.
  Формула эквивалентна FIFO («любое списание гасит самые старые начисления»)
  и идемпотентна — повторный вызов даёт 0.
  `# ponytail: агрегатный lazy-expire вместо FIFO-леджера; помесячный breakdown — если попросят`
- `cutoff` из `expiry_period`: `'3m'→90д, '6m'→180д, '1y'→365д`, `'never'` → сразу `return 0`.

**Точки вызова** (лениво при обращении, крон не нужен):
1. `_quote` в кассе — перед чтением `points_balance` при `use_bonuses`
  ([`checkout/router.py:112`](../../back/routers/checkout/router.py)) — чтобы
  `bonuses_available` не обещал сгоревшее.
2. Ручное списание/начисление — начало `apply_points_change`? Нет — рекурсия;
  вызвать в HTTP-эндпоинтах баллов (`routers/clients/loyalty.py`, ручное
  начисление/списание) перед операцией.
3. GET баланса/карты клиента (эндпоинт, которым карточка клиента читает баллы).

**Фронт:** ничего — селектор уже есть; транзакция «Сгорание баллов» сама
появится в истории.

**Проверка:** тест `back/tests/test_points_expiry.py`: начисление 500 с
`created_at = now - 200д`, период `6m` → `expire_points` списывает 500,
повторный вызов — 0; свежие 300 не сгорают; при `never` не трогает ничего.

---

## БЛОК 4 — Абонементы: передача, автопродление, флаг программы

### 4.1. Передача абонемента (allow_transfer)

**Слой:** Router · **Файл:** `back/routers/clients/subscriptions.py`
- `POST /clients/{client_id}/subscriptions/{sub_id}/transfer`, body
  `{target_client_id: int}` (схема в `back/schemas/clients/subscriptions.py`).
- Проверки: `StudioSubscriptionProgramConfig.allow_transfer` включён (иначе 400
  `{"code": "loyalty.transfer_disabled"}`), абонемент активен и принадлежит
  `client_id` этой студии, target — клиент той же студии, не сам себе.
- Действие: `sub.client_id = target_client_id` + `log_activity` («Абонемент
  передан: A → B») + событие в историю обоих клиентов тем механизмом, каким
  пишутся текущие события клиента. Один commit.

**Слой:** Frontend
- `front/src/pages/dashboard/Catalog/components/SubscriptionSection.tsx` —
  вернуть тумблер `allow_transfer` (скрыт в V5-6 1.5; `auto_renewal` — см. 4.2).
- `front/src/pages/dashboard/Clients/components/WalletTab.tsx` — кнопка
  «Передать» на карточке активного абонемента (видна при включённом
  `allow_transfer`): модалка на `ModalShell` с `Select`/поиском клиента и
  подтверждением. После успеха — инвалидация `queryKeys.wallet` обоих клиентов.

**Проверка:** тест — передача переносит остаток занятий, у старого клиента
абонемент исчезает из active; при выключенном флаге — 400.

### 4.2. Автопродление (auto_renewal) — MVP за счёт депозита

Полноценное автопродление = автосписание с карты = эпик эквайринга (карты в
продукте ещё нет). MVP, который честно работает уже сейчас: **продление за
счёт депозита клиента**.

**Слой:** Router · **Файл:** `back/routers/schedule/reservations.py` — точка,
где списывается визит ([`:152`](../../back/routers/schedule/reservations.py), `sub.used_classes += 1`):
- Если после инкремента `remaining == 0`, конфиг программы `auto_renewal`
  включён, пакет `is_active`, и `deposit_balance >= цена пакета` (через
  `resolve_price` — скидки клиента применяются):
  `attach_subscription(..., mark_paid=True, price=0)` +
  `apply_deposit_change(-цена, "Автопродление абонемента", db)` +
  `register_purchase(...)` + `log_activity` «Абонемент автопродлён (депозит)».
  Всё в уже открытой транзакции эндпоинта.
  ⚠️ `price=0` в `attach_subscription`, чтобы не завести приходную `Operation`
  на депозитные деньги (депозит уже был доходом при пополнении — двойной учёт;
  проверить, что attach при 0 не пишет Operation, по образцу single-ветки кассы).
- Депозита не хватает / автопродление выключено → просто `log_activity`
  «Абонемент закончился у {клиент}» — владелец видит в ленте событий.
  `# ponytail: автопродление только с депозита; автосписание с карты — эпик эквайринга`

**Слой:** Frontend — вернуть тумблер `auto_renewal` в `SubscriptionSection.tsx`
с подписью «Автопродление за счёт депозита клиента» (не обещать списание с карты).

**Проверка:** тест — абонемент 1 занятие + депозит ≥ цены + флаг вкл →
отметка визита создаёт новый активный абонемент и уменьшает депозит; депозит
пуст → только событие, нового абонемента нет.

### 4.3. Флаг включённости программы блокирует продажу

**Слой:** Router · **Файл:** `back/routers/checkout/router.py` → `_get_client_package`
- При `product_type == "subscription"`: если `StudioSubscriptionProgramConfig`
  студии отсутствует или `is_enabled == False` → 400
  `{"code": "checkout.subscriptions_disabled", "message": "Программа абонементов выключена"}`.
  Одна проверка в общей точке закрывает и `calculate`, и `pay`.

**Слой:** Frontend · **Файл:** `front/src/pages/dashboard/Clients/components/WalletCatalog.tsx`
- Таб «Абонементы» при выключенной программе показывает empty-состояние
  «Программа абонементов выключена — включите в Лояльности» (конфиг читать тем
  же способом, что страница Лояльность; не хардкодить второй запрос, если ключ
  уже есть в `queryKeys`).

**Проверка:** тест — продажа пакета при выключенной программе → 400; включили → проходит.

---

## БЛОК 5 — Хвосты (чистота после V5-6)

1. **Мёртвый тумблер «продавать как разовое».** `sold_as_single` нигде не
   читается (таб «Разовые» продаёт услуги Каталога, не пакеты) — убрать `Switch`
   из `front/src/pages/dashboard/Catalog/components/modals/EditPackage.tsx`
   (колонку и схему не трогаем — обратная совместимость, ноль миграций).
2. **Неиспользуемые настройки скидок.** В `resolve_price` работают
   `min_purchase_amount` и `stackable`; **не** работают `applies_to_all_services`
   (нужна привязка скидки к услугам — отдельная фича) и `visible_in_cabinet`
   (мини-приложение). По прецеденту V5-6 1.5 — **скрыть оба тумблера** в UI
   настроек скидок (`front/src/pages/dashboard/Loyalty/components/drawer/configs/`),
   колонки остаются. → в `docs/BACKLOG`: «скидки по услугам», «витрина скидок в мини-приложении».
3. **`docs/BACKLOG`** — завести/дополнить файл: FIFO-разбивка сгорания
   по месяцам, автопродление с карты (эквайринг), реферальная ссылка в
   мини-приложение, Вариант B каталога услуг (из V5-6 Блока 3).

---

## Порядок реализации (зависимости)

1. **Блок 1** (касса UI) — самый быстрый видимый результат, бэк готов целиком.
2. **Блок 4.3** (флаг программы) — одна проверка + empty-state, независим.
3. **Блок 2** (рефералка UI + скидка новичку) — 2.3 трогает `resolve_price`,
   делать до 4.2 (автопродление использует `resolve_price`).
4. **Блок 3** (сгорание) — трогает `_quote`, делать после Блока 1, чтобы не
   мержить один файл двумя руками.
5. **Блок 4.1–4.2** (передача, автопродление) — после 2.3.
6. **Блок 5** — в любой момент, идеально «между» большими задачами.

## Definition of Done

> Проставлено по факту сверки в [`EPIC_V5_8_LOYALTY_CLOSEOUT.md`](EPIC_V5_8_LOYALTY_CLOSEOUT.md)
> (сделана 2026-07-22, построчно). Все пункты закрыты в коде; 4.3 (флаг
> программы блокирует продажу) был единственной реальной дырой из этого
> списка — закрыт Блоком 1 эпика V5-8.

- [x] В кассе видны и работают: тумблер депозита с балансом, поле кода
      сертификата с ошибками, строки «Сертификат −X» / «Депозит −X», оплата
      при «Итого 0» без выбора метода.
- [x] В карточке клиента — инвайт-код с копированием; в форме добавления —
      поле кода; первая покупка приглашённого дешевле на `new_client_discount`%.
- [x] Баллы старше `expiry_period` сгорают при обращении транзакцией
      «Сгорание баллов»; `never` — ничего не меняется. Тест `test_points_expiry.py`
      добавлен V5-8 Блок 2.
- [x] Абонемент можно передать другому клиенту при включённом `allow_transfer`.
- [x] При `auto_renewal` и достаточном депозите визит-под-ноль автопродлевает
      абонемент без приходной Operation; иначе — событие в ленте.
- [x] Продажа пакета при выключенной программе абонементов → 400 + empty-state в кассе.
      Закрыто V5-8 Блок 1 (было не реализовано на момент сверки).
- [x] Тумблеры `sold_as_single`, `applies_to_all_services`, `visible_in_cabinet`
      скрыты; `allow_transfer`/`auto_renewal` возвращены и работают.
- [x] Ни одного `window.location.reload`; все мутации инвалидируют ключи.
- [x] Тесты: Блок 2.3, Блок 3, Блок 4.1–4.3 + существующие четыре из V5-6 зелёные.
- [x] `npm run build` зелёный; `npm run lint` — новые файлы без ошибок
      (86 старых ошибок вне эпика — отдельная задача, сюда не тащить).
