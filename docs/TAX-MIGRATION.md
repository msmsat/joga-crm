# Переход платформенного биллинга на собственный расчёт налога

Статус на 04.09.2026. Код написан и покрыт тестами; **в production ничего не
изменено, существующие подписки не мигрированы, налоговая политика не
подтверждена**. Ручной режим выключен по умолчанию.

---

## 1. Что изменилось, простыми словами

**Было.** Налог по счетам Velora → студия считал Stripe Tax. Это платная услуга, и
берут за неё не в момент оплаты, а в момент **финализации счёта**. Поэтому платили
и за неоплаченные счета, и за те, что потом аннулировали. Отсюда 635,50 CZK в
августе.

**Стало.** Ставку определяет наш модуль, а Stripe получает готовую ручную ставку
(Tax Rate) — за них он денег не берёт. Прежний режим никуда не делся и остаётся
включённым по умолчанию: переключение — отдельное осознанное действие.

**Что сохранено полностью.** Оплата картой и переводом, подписки и продления,
номера счетов, PDF и hosted-страницы Stripe, письма, история, права доступа,
проверка подписи вебхуков, приём оплат студиями через Connect. Ни один документ не
исчез и ни одна сумма не изменилась.

**Почему в новом режиме нет платного расчёта.** Комиссия Stripe Tax начисляется за
документ с `automatic_tax.enabled=true` и за прямые вызовы Tax API. В ручном режиме
первое выключается явно на каждом документе и на самой подписке, вторых в коде нет
вовсе — и это закреплено тестами, которые проверяют тела запросов, а не текст файлов.

**Какие комиссии останутся.** Обычные и неизбежные: эквайринг Stripe с каждого
успешного платежа, Stripe Billing с подписок, Stripe Invoicing с оплаченных счетов,
комиссии за споры. Отключение Tax их не отменяет — и не гарантирует, что
отрицательный баланс невозможен в принципе.

**Что нужно от вас.** Подтвердить факты о юрлице (раздел 6). Пока они не
подтверждены, ручной режим не включается: каждый документ уходит в состояние
«требует проверки», и это правильное поведение, а не поломка.

---

## 2. Требование → реализация → проверка

| Требование | Реализация | Файл / функция | Проверка | Статус |
|---|---|---|---|---|
| Не использовать платный automatic tax | Явное `enabled: false` на документе, позиции и подписке | `services/stripe_billing.tax_params`, `item_tax_params`, `_subscription_tax_params` | `test_manual_tax_billing.py::test_our_invoices_carry_manual_rates_and_no_paid_calculation` | ✅ |
| Не звать Tax Calculations/Transactions | Вызовов нет в коде; закреплено тестом-ловушкой | — | `test_no_paid_tax_api_call_on_any_money_path` | ✅ |
| Сохранить корректный НДС | Матрица правил с датами, версией и источником | `services/tax_policy.decide` | `test_tax_policy.py` (30 случаев) | ✅ код готов, политика не подтверждена |
| Отличать 4 вида «нуля» | Отдельные исходы `reverse_charge` / `exempt` / `out_of_scope` / `requires_review` | `tax_policy` | `test_four_zero_tax_outcomes_are_distinguishable` | ✅ |
| Не финализировать при неопределённости | Исключение `TaxReviewRequired`, 409 в API, `auto_advance=false` у черновика | `tax_rates.resolve`, `checkout._tax_http_error`, `webhook._ensure_draft_tax` | `test_draft_is_stopped_when_there_is_no_tax_decision` | ✅ |
| Не считать это неоплатой студии | Счёт не создаётся → `due_at` пуст → блокировка не срабатывает | `platform_fee.suspension_reason` (не менялась) | `test_review_state_is_not_a_customer_debt` | ✅ |
| Reverse charge с основанием, а не 0 % | `Customer.tax_exempt="reverse"`, ставка не прикладывается | `billing_tax.sync_customer_exempt` | `test_reverse_charge_checkout_carries_no_rate` | ✅ |
| Автопродления | Ставки на подписке + ежечасная сверка + правка черновика | `webhook.sync_subscription_taxes`, `_ensure_draft_tax` | `test_manual_tax_renewal.py` (13 тестов) | ✅ |
| Повтор клика не создаёт второй долг | Бизнес-идемпотентность: переиспользуется открытый счёт под блокировкой строки | `checkout._renewal_invoice` | `test_repeated_renewal_click_reuses_the_open_invoice` | ✅ (новое) |
| Ставки не плодятся | Поиск по ключу в метаданных; создание — отдельная процедура с dry-run | `tax_rates`, `scripts/sync_tax_rates.py` | `test_request_path_never_creates_a_tax_rate` | ✅ |
| Разделение аккаунтов и test/live | Кэш ставок по режиму + отпечатку ключа | `tax_rates._account_scope` | — | ✅ |
| Защита от боевых ключей | Централизованный страж; блокирует запись, чтение оставляет | `services/stripe_env` | `test_stripe_env_guard.py` (16 тестов) | ✅ |
| Снимок операции | 8 колонок в `billing_invoices` + миграция | `models/settings.BillingInvoice`, `d4a91c6b7e58` | `test_snapshot_records_the_reason_not_just_the_number` | ✅ |
| Выгрузка для бухгалтера | 5 колонок налога в существующем CSV + штатные выгрузки Stripe | `router.export_invoices_csv` | — | ✅ |
| Превью тем же решением | Сервер считает, фронт только подписывает | `billing_tax.preview`, `PayModal.tsx` | `tsc --noEmit` | ✅ |
| Connect не затронут | Налоговых параметров в его сессиях нет | `services/stripe_connect` | `test_connect_payments_stay_free_of_platform_tax` | ✅ |
| Управляемый переход | dry-run по умолчанию, отказ на live | `scripts/migrate_tax_mode.py` | прогон ниже | ✅ |
| preflight под ручной режим | Новая `check_tax_mode`, старая проверка Tax только для `stripe_auto` | `scripts/preflight.py` | прогон | ✅ |

---

## 3. Изменённые и новые файлы

**Новые:**

| Файл | Назначение |
|---|---|
| `back/services/tax_policy.py` | Правила и арифметика. Без Stripe, без БД, без сети |
| `back/services/tax_rates.py` | Решение → параметры Stripe; поиск ручных Tax Rate |
| `back/services/billing_tax.py` | Единый вход всех денежных путей + снимок операции |
| `back/services/stripe_env.py` | Страж режима ключей |
| `back/scripts/sync_tax_rates.py` | Идемпотентное заведение ставок, dry-run по умолчанию |
| `back/scripts/migrate_tax_mode.py` | Разбор существующих объектов, dry-run по умолчанию |
| `back/migrations/versions/d4a91c6b7e58_*.py` | 8 колонок налогового снимка |
| `back/tests/test_tax_policy.py` | Матрица решений (30) |
| `back/tests/test_manual_tax_billing.py` | Тела запросов на всех денежных путях (18) |
| `back/tests/test_manual_tax_renewal.py` | Автопродление, вебхук, дубли (13) |
| `back/tests/test_stripe_env_guard.py` | Страж ключей (16) |

**Изменённые:**

| Файл | Что сделано |
|---|---|
| `back/services/stripe_billing.py` | 4 точки `automatic_tax` через переключатель; `set_subscription_tax`; страж на записи; самопроверка модуля дополнена |
| `back/routers/billing/checkout.py` | Решение один раз на ветку; 409 вместо 502; идемпотентность продления; налог в превью |
| `back/routers/billing/router.py` | Налог при смене модели; 409 вместо 502; колонки налога в CSV |
| `back/routers/billing/webhook.py` | `_ensure_draft_tax`, `sync_subscription_taxes` |
| `back/services/offline_fee_billing.py` | Решение и снимок для счетов комиссии; ежечасная сверка налога подписок; громкий разбор нетто/брутто |
| `back/services/stripe_catalog.py`, `stripe_connect.py` | Страж на записывающих путях |
| `back/scripts/preflight.py` | `check_tax_mode`; старая проверка Tax — только для `stripe_auto` |
| `back/models/settings.py` | Колонки снимка |
| `back/schemas/settings/billing.py` | Налоговые поля превью |
| `back/.env.example` | `APP_ENV`, `BILLING_TAX_*`, `BILLING_SELLER_*` с объяснениями |
| `front/.../PayModal.tsx`, `billing.types.ts`, `locales/{ru,en,uk,cs,de}/billing.json` | Налог в модалке оплаты |
| `CLAUDE.md`, `AGENTS.md`, `docs/GO-LIVE.md` | Архитектура и порядок перехода; убран совет проверять на боевом ключе |
| `back/tests/test_billing_reconcile.py` | Заглушка принимает `tax` и записывает его |

---

## 4. Что реально прогонялось

| Команда | Результат |
|---|---|
| `pytest -q` (базовая линия, до правок) | 1126 passed, 2 failed (`test_inbound_events`, `test_outbound` — не биллинг) |
| `pytest tests/test_tax_policy.py tests/test_manual_tax_billing.py tests/test_manual_tax_renewal.py tests/test_stripe_env_guard.py` | **75 passed** |
| Полный набор биллинга и налога (15 файлов) | **323 passed** |
| `python -m services.stripe_billing` | `self-check ok` |
| `npm run check:uimap` | OK: 14 разделов, 29 модалок, 487 подписей |
| `npm run check:ai` | OK: 17 интентов, 65 инструментов |
| `npx tsc --noEmit` | без ошибок |
| `python -m scripts.sync_tax_rates` (dry) | «политика не готова», ставки не заводились |
| `python -m scripts.migrate_tax_mode` (dry) | разбор ниже, ничего не изменено |

**Не проверено:** sandbox-прогон полного цикла подписки, вид PDF с ручной ставкой,
печать отметки «Reverse charge», выгрузки Stripe по ручным ставкам. Для этого нужен
тестовый ключ и отдельный прогон — на боевом ключе это делать нельзя.

**Старые ошибки, не связанные с задачей:** в общем прогоне падали
`test_notification_all_events`, `test_response_plan`, `test_worker_runtime`. Причина —
параллельный прогон pytest из другой сессии в той же тестовой базе: строки исчезают
посреди теста (`studio_id=17 не найден в studios`, `'NoneType' has no attribute
'studio_id'`). Ни один из них не касается биллинга и налога. Изолированно
подтвердить не удалось, пока идёт чужой прогон.

---

## 5. Dry-run по существующим объектам (04.09.2026, только чтение)

```
Аккаунт: acct_1TyL8R1PBkRXkxBR   режим ключа: live   окружение: dev
Налоговый режим приложения: stripe_auto   набор правил: eu-cz-2026.09
Действие: холостой прогон (ничего не меняется)
```

| Объект | Состояние | Требуется |
|---|---|---|
| `sub_1U3O1B1PBkRXkxBRx0aEHavF` | `past_due`, `automatic_tax=true` | перевести на ручные ставки — **ждёт разрешения** |
| `sub_1U3O7H1PBkRXkxBRVWrgeRLs` | `canceled`, `automatic_tax=true` | ничего: счетов больше не будет |
| `in_1U5zOY1PBkRXkxBR4P9KxKfp` | `open`, 47,19 € | решение владельца: долг или ошибочный документ. Правке не подлежит |
| `in_1U3nrv1PBkRXkxBRQph8gu2a` | `open`, 47,19 € | то же |
| `cus_V45bmd1jHBKk9b` | без страны | дозаполнить реквизиты, иначе счета не выставятся |
| `cus_V3AnWYavnZizUN` | номер НДС `unverified` | выяснить, почему вебхук его не снял |

**Действия, ожидающие разрешения владельца:** завести Tax Rate на боевом аккаунте;
включить `BILLING_TAX_MODE=manual`; перевести живую подписку. Скрипт миграции
отказывается работать с `--apply` на боевом ключе — предохранитель снимается только
осознанно.

---

## 6. Каких фактов не хватает

Без них ручной режим не включается:

1. Юрлицо-продавец: страна регистрации и статус плательщика НДС с датами.
2. Режим B2C по ЕС: домашняя ставка до порога 10 000 € или OSS. Порог считается по
   всему обороту бизнеса и по двум календарным годам — данные CRM его не доказывают.
3. Нужна ли регистрация за пределами ЕС.
4. Верна ли категория `txcd_10103001` для того, что Velora продаёт.
5. **Отдельно, как финансовое решение:** фактура за онлайн-комиссию. Stripe удержал
   НЕТТО, а документ с налогом объявит оплаченной сумму больше удержанной. Это
   было и при automatic tax; код теперь громко пишет расхождение в лог, но сам не
   исправляет ни цену, ни удержание — это выбор владельца.

---

## 7. Порядок перехода и откат

```bash
python -m scripts.sync_tax_rates            # что не хватает
python -m scripts.sync_tax_rates --apply    # завести ставки
# .env: BILLING_TAX_MODE=manual, BILLING_TAX_POLICY_CONFIRMED=eu-cz-2026.09,
#       BILLING_SELLER_COUNTRY, BILLING_SELLER_VAT_REGISTERED,
#       BILLING_SELLER_VAT_ID, BILLING_EU_B2C_SCHEME
python -m scripts.preflight                 # блокеры
# выкатить код — НОВЫЕ документы идут по ручным ставкам
python -m scripts.migrate_tax_mode          # dry-run
python -m scripts.migrate_tax_mode --apply  # перевод существующих подписок
```

Порядок обязателен. Обратный оставляет окно, в котором подписка уже без
`automatic_tax`, а приложение ещё не ставит ручные ставки — счета в этом окне уйдут
без налога. Промежуток между выкатом и переводом подписок безопасен: подписка
считает по-старому, платно, но верно.

**Откат:** `BILLING_TAX_MODE=stripe_auto` возвращает прежнее поведение для новых
документов. Существующие подписки остаются на ручных ставках, пока их не переведут
обратно, — откат не бывает молчаливым.

**Налоговые регистрации не удалять.** Сами по себе они денег не стоят: комиссия
берётся за расчёт по документу с включённым `automatic_tax`, а таких документов
больше не будет. Регистрации нужны отчётности и мониторингу порогов.

---

## 8. Как убедиться, что платных Tax-комиссий больше нет

1. **Баланс:** Dashboard → Balances → All activity, строки `Automatic Taxes` и
   `Tax Api Calculation`. Через API — `BalanceTransaction.list`, `type=stripe_fee`.
2. **Задержка.** Списание приходит на следующий день после события, а датируется
   днём события. Пустой список сразу после выката ничего не доказывает — смотреть
   надо минимум через сутки, а по подпискам — после первого прошедшего цикла.
3. **Объекты:** у нового счёта `automatic_tax.enabled=false`, а `total_taxes`
   посчитан нашими ставками; у подписки `default_tax_rates` непусты (или пусты при
   reverse charge, и тогда у клиента `tax_exempt=reverse`).
4. **Первый цикл подписки** — отдельная контрольная точка: до него автопродление
   ещё ни разу не проходило через новый механизм.
5. **Регрессия:** `pytest tests/test_manual_tax_billing.py` падает, если
   `automatic_tax: true` или вызов Tax API вернутся на денежный путь.
