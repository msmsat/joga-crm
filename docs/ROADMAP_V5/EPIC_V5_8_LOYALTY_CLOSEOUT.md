# EPIC V5-8 — Loyalty Closeout (закрыть DoD V5-7 + реальные хвосты)

> Цель: перед тем как объявлять лояльность завершённой, свериться с фактом —
> **V5-7 оказался реализован в коде почти полностью**, но его Definition of
> Done ни разу не был проставлен (файл `EPIC_V5_7_LOYALTY_COMPLETION.md`
> остался с `- [ ]` по всем пунктам). Этот эпик — не повтор V5-7, а: (1)
> сверка каждого пункта его DoD с реальным кодом построчно, (2) закрытие
> найденных настоящих дыр, которых оказалось всего 2.

## ⚠️ Сверка DoD V5-7 с фактическим кодом (сделана 2026-07-22, построчно)

| Пункт DoD V5-7 | Реальный статус | Подтверждение |
|---|---|---|
| Касса: депозит/сертификат в UI | ✅ Реализовано | [`WalletPOS.tsx`](../../front/src/pages/dashboard/Clients/components/WalletPOS.tsx) — тумблер депозита, поле сертификата, разбивка чека, кнопка активна при `total_price === 0` |
| Рефералка: инвайт-код в карточке + форме + скидка новичку | ✅ Реализовано | `invite_code` в `ClientProfileSlider.tsx`/`AddClientModal.tsx`; `resolve_price` учитывает `referral` кандидата |
| Сгорание баллов (Блок 3) | ✅ Реализовано, механика верна | [`expire_points`](../../back/routers/clients/loyalty.py) (строка 57), 3 точки вызова подтверждены построчно: `checkout/router.py:107`, `clients/profiles.py:304`, `clients/loyalty.py:204`. Агрегатная формула математически эквивалентна FIFO, идемпотентна. |
| Передача абонемента (4.1) | ✅ Реализовано + тест зелёный | `POST .../transfer` в [`subscriptions.py`](../../back/routers/clients/subscriptions.py), гейт `allow_transfer`, кнопка в `WalletTab.tsx` + `TransferSubscriptionModal.tsx`. `python -m tests.test_subscription_transfer` → `ALL PASS`. |
| Автопродление (4.2) | ✅ Реализовано + тест зелёный | `_try_auto_renew` в [`reservations.py`](../../back/routers/schedule/reservations.py) — MVP за счёт депозита клиента (не карты — эквайринга в продукте нет, задокументировано `ponytail:`-комментарием). `python -m tests.test_subscription_auto_renewal` → `ALL PASS`. |
| **Флаг программы блокирует продажу (4.3)** | ❌ **Не реализовано** | `grep "subscriptions_disabled"` по `checkout/router.py` — 0 совпадений. `_get_client_package` не проверяет `StudioSubscriptionProgramConfig.is_enabled` вообще. Это Блок 1 ниже. |
| Хвосты (Блок 5): `sold_as_single`, `applies_to_all_services`, `visible_in_cabinet` скрыты | ✅ Реализовано | `EditPackage.tsx` — `Switch` для `sold_as_single` убран (поле шлётся `true` по умолчанию); `DiscountsConfig.tsx:25-26` — оба тумблера скрыты с явным комментарием на BACKLOG |
| Тест `test_points_expiry.py` | ❌ **Файла нет** | `ls back/tests/ | grep expir` — пусто. Единственная реальная брешь в тестах: `expire_points` используется в 3 продакшн-эндпоинтах и не покрыт ни одним тестом. |

**Итог сверки: из 9 пунктов DoD V5-7 — 7 реально закрыты в коде, 2 нет.** Это
и есть весь объём V5-8: закрыть Блок 4.3 (флаг программы) и добавить тест
сгорания баллов. Всё остальное «отложенное» (FIFO-разбивка по месяцам,
автосписание с карты/эквайринг, витрина скидок в мини-приложении) уже
корректно занесено в [`docs/BACKLOG/README.md`](../BACKLOG/README.md) — не
дублируем.

## Одна находка сверх DoD V5-7 (не в его тексте, всплыла при отдельном аудите)

`POST /finances/operations` (создание ручной операции) принимает `client_id`
и вызывает `accrue_points` (баллы за оплату), но:
- **не вызывает `register_purchase`** — `total_spent`/уровень/кэшбек от
  ручной операции не растут, в отличие от кассы и абонементов;
- **поле выбора клиента отсутствует на фронте** (`OperationsTab.tsx`,
  `grep client_id` — 0 совпадений) — то есть ветка `accrue_points` в
  `create_operation` сейчас **мертва в проде**: создать операцию с `client_id`
  через UI нельзя, только напрямую через API.

Это **не тот же вопрос**, что «скидка в Финансах не считается» (тот закрыт
V5-7 как осознанный дизайн — двойной учёт при пересчёте ручной цифры). Это
про то, куда делось само поле клиента и стоит ли доводить `accrue_points`/
`register_purchase` до консистентности. **Требует решения продукта** — вариант
на выбор в Блоке 2 ниже.

---

## Жёсткие правила (наследуем V5-6/V5-7)

1. **Одна транзакция** — единственный `db.commit()` в конце эндпоинта.
2. **Никакого F5** — только `queryClient.invalidateQueries`.
3. **Zero Trust на цене** — новое в `_quote`/`resolve_price`, не отдельным путём.
4. **Reuse** — `apply_points_change`, `register_purchase`, `resolve_price`,
   `_get_or_create_levels` уже есть, не дублировать.

---

## БЛОК 1 — Флаг программы абонементов блокирует продажу (V5-7, 4.3)

**Проблема:** `StudioSubscriptionProgramConfig.is_enabled` существует и
настраивается в UI Лояльности, но касса игнорирует его — абонемент можно
продать, даже если владелец выключил программу целиком.

**Слой:** Router · **Файл:** [`back/routers/checkout/router.py`](../../back/routers/checkout/router.py) → `_get_client_package`
- При `product_type == "subscription"`: подтянуть
  `StudioSubscriptionProgramConfig` по `studio_id` (пакет уже несёт
  `config_id` → можно взять из `package.config`, не делать второй запрос —
  проверить, что связь подгружена, иначе явный `select`).
- Если конфига нет или `is_enabled == False` → 400
  `{"code": "checkout.subscriptions_disabled", "message": "Программа абонементов выключена"}`.
- Один общий метод — закрывает и `calculate`, и `pay` разом (обе идут через
  `_get_client_package`).

**Слой:** Frontend · **Файл:** [`front/src/pages/dashboard/Clients/components/WalletCatalog.tsx`](../../front/src/pages/dashboard/Clients/components/WalletCatalog.tsx)
- Таб «Абонементы» при выключенной программе — empty-состояние «Программа
  абонементов выключена — включите в Лояльности» вместо пустого списка.
  Конфиг читать тем же ключом `queryKeys`, что и страница Лояльность (не
  заводить второй запрос под тот же ресурс).
- Таб «Разовые» (услуги Каталога) не должен зависеть от этого флага — он про
  абонементы, не про услуги.

**Проверка:** тест — `POST /checkout/calculate` и `/pay` с
`product_type="subscription"` при `is_enabled=False` → 400
`checkout.subscriptions_disabled`; включили конфиг → проходит как обычно.
Файл `back/tests/test_checkout_subscriptions_disabled.py` (новый, реальная
БД + rollback, по образцу `test_checkout_deposit_certificate.py`).

---

## БЛОК 2 — Тест сгорания баллов (закрыть тестовую дыру V5-7 Блок 3)

**Код уже в проде, тестов — ноль.** `expire_points` — единственная функция
лояльности за весь V5-6/V5-7 без покрытия, при этом формула нетривиальна
(агрегатная FIFO-эквивалентность) и вызывается в 3 разных эндпоинтах.

**Файл:** `back/tests/test_points_expiry.py` (новый, реальная БД + rollback,
по образцу `test_register_purchase.py`).

Сценарии:
1. Начисление 500 баллов с искусственным `created_at = now - 200д`
   (`db.add(LoyaltyPointTransaction(..., created_at=...))` — SQLAlchemy
   позволяет задать `created_at` явно, минуя `server_default`, если передать
   в конструктор), `expiry_period='6m'` (180д) → `expire_points` списывает
   все 500, возвращает `500`.
2. Повторный вызов сразу после — возвращает `0` (идемпотентность), баланс не
   уходит в минус.
3. Свежие баллы (начислены только что) при том же `expiry_period='6m'` —
   **не** сгорают.
4. Смешанный случай: 500 старых (200 дней) + 200 свежих + было списание 300
   (обычная трата) → сгорает `max(0, 500 - 300) = 200`, свежие 200 не тронуты.
5. `expiry_period='never'` (дефолт) → `expire_points` возвращает `0` без
   единого запроса к `LoyaltyPointTransaction` (можно проверить по
   отсутствию побочных эффектов, не по числу запросов — не переусложнять
   тест ради этого).
6. Конфига `StudioLoyaltyConfig` вообще нет у студии → `0`, не падает.

**Проверка:** `python -m tests.test_points_expiry` → `ALL PASS`.

---

## БЛОК 3 — Клиент в ручной операции Финансов (решение продукта, не техдолг)

**Это не баг и не забытая строка — решение, которое раньше никто явно не
принимал.** Сейчас: `client_id` есть в схеме и роутере (`accrue_points`
вызывается), но поля выбора клиента нет в форме `OperationsTab.tsx`, поэтому
ветка мертва. Нужно выбрать один из вариантов — задача блокируется этим
решением, кода в обе стороны на несколько строк.

**Вариант A — довести до конца (добавить поле + `register_purchase`).**
Ручная операция «Оплата наличными мимо кассы, с привязкой к клиенту» ведёт
себя как настоящая покупка для лояльности: баллы, уровень, кэшбек.
- Фронт: `Select` клиента в форме создания операции (`OperationsTab.tsx`),
  видим только при `type === 'in'`.
- Бэк: одна строка — `await register_purchase(db, ctx.studio_id, body.client_id, body.amount)`
  рядом с существующим `accrue_points` в `create_operation`
  ([`operations.py:267-268`](../../back/routers/finances/operations.py)).
- Скидку по-прежнему **не** пересчитываем (это осталось решением V5-7 —
  ручная цифра, не цена товара) — только начисления лояльности от введённой
  суммы, как уже частично работает для баллов.

**Вариант B — признать мёртвой веткой и убрать.** Если продукту ручная
привязка клиента к операции не нужна (это фиксация факта, не продажа) —
убрать `client_id` из `OperationCreate`/`create_operation` вместе с
`accrue_points`-веткой. Дешевле, но теряется уже написанная (пусть и
недоступная из UI) функциональность.

→ **Решение нужно от владельца продукта до старта Блока 3.** Технически
Вариант A — минимальный диф (одна строка бэка + один `Select` на фронте).

---

## Definition of Done

- [x] `POST /checkout/{calculate,pay}` с `product_type="subscription"` при
      выключенной программе абонементов → 400 `checkout.subscriptions_disabled`.
- [x] Таб «Абонементы» в кассе при выключенной программе — понятный
      empty-state со ссылкой куда включить, не пустой список.
- [x] `test_points_expiry.py` зелёный, покрывает идемпотентность и смешанный
      случай (старые + свежие + было списание).
- [x] `test_checkout_subscriptions_disabled.py` зелёный.
- [x] Блок 3 — реализован по Варианту A: `Select` клиента в `OperationsTab.tsx`
      (видим при `type === 'in'`) + `register_purchase` рядом с `accrue_points`
      в `create_operation`. Тест `test_operation_client_loyalty.py` зелёный.
- [x] Существующие тесты V5-6/V5-7 (`test_subscription_transfer`,
      `test_subscription_auto_renewal`, `test_register_purchase`,
      `test_referral_first_payment`, `test_checkout_*`) остаются зелёными.
- [x] `EPIC_V5_7_LOYALTY_COMPLETION.md` — Definition of Done проставлен по
      факту (все пункты кроме 4.3 отмечаются `[x]` этим эпиком, 4.3 закрывает
      Блок 1 этого документа).
- [x] `npm run build && npm run lint` зелёные (без нового прироста
      существующих 86 ошибок вне эпика).
