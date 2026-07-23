# ROADMAP_BILLING — «Тариф и оплата» (Subscriptions & Payments)

> Технический роудмэп по итогам аудита страницы **«Дашборд (Подписки и Оплаты)»**.
> В коде страница называется **Billing** (`front/src/pages/dashboard/Billing/`),
> эндпоинты — `/billing/*` (`back/routers/billing/`), модели — `back/models/settings.py`
> (`StudioBillingPlan`, `BillingInvoice`, `PaymentCard`).
>
> Аудит писался «в вакууме». Реальный код к моменту старта уже закрывает бо́льшую
> часть требований: работает Fondy-checkout, каталог тарифов как источник истины,
> история счетов из БД, привязка карты через `rectoken`, экспорт CSV.
> **Роудмэп фиксирует дельту, а не greenfield.** Не переписываем то, что есть —
> дорабатываем и удаляем лишнее.

---

## 🎯 Точка отсчёта (что УЖЕ есть — не трогаем)

| Аудит требует | Реальный статус в коде | Вывод |
|---|---|---|
| Отказ от mock: история/тарифы/методы из БД | ✅ `PlansTab`/`InvoicesTab`/`PaymentMethodTab` дёргают `billingApi.getPlans/getInvoices/getPaymentCards`; каталог — `back/routers/billing/plans.py` (источник истины) | Оставляем. Дельта — только пустые состояния и «Экономика» |
| Оплата серверная, сумма не с фронта | ✅ `create_checkout` считает `amount_for(plan, period)` по каталогу, фронту не доверяет | Оставляем |
| История платежей 100% реальная | ✅ `BillingInvoice` + `GET /billing/invoices`, статусы `paid/pending/failed/refunded` | Оставляем |
| Экспорт CSV рабочий | ⚠️ Уже работает, но **клиентский** (Blob в `InvoicesTab`) — экспортирует только загруженную страницу, без BOM-эскейпа кавычек | Epic B5: переносим на **эндпоинт** `GET /billing/invoices/export.csv` |
| Чек к каждому платежу | ⚠️ Поле `pdf_url` есть, но заполняется не всегда → в UI «—» | Epic B5: гарантируем чек для `paid` (генерим при вебхуке) |
| Без F5, реактивно | ⚠️ Стейт на `useState`; после возврата с оплаты (`?payment=return`) перезапрашивается только `plan`, счета/карта — нет | Epic B6: единый `useBilling`-refetch по фокусу/возврату. React Query **не вводим** |
| Глобальные тосты/модалки | ❌ Ошибки глотаются `.catch(()=>{})`; модалка `UpgradeModal` — локальная, не на `ModalShell`; тостов нет | Epic B6: `useToast` + `ModalShell`/`ConfirmModal` из `components/ui/index` |
| Плавный скролл «Продолжить план» → секция оплаты | ❌ Кнопки/якоря нет | Epic B6 |
| Модель «%»: один тариф 3%, убрать «Параметры расчёта»/«Экономика тарифа» | ❌ Сейчас слайдер оборота + 4 процента + большой ониксовый блок «ЭКОНОМИКА ТАРИФА» (`PlansTab.tsx:75-134`) | Epic B3 (UI) + B1 (поле `percent_rate`) |
| Модель «Фикс+%»: 3 режима, цена ÷2, процент 1.5%, селектор периода на фикс, убрать «Экономику комбо» | ❌ Сейчас 990/1490/1990 + эквайринг 3% + блок «ЭКОНОМИКА КОМБО-ТАРИФА» (`PlansTab.tsx:137-190`), без периода | Epic B3 (UI) + B1 (поля) |
| Блок «Ваша экономия»: точный расчёт, копирайтинг | ⚠️ `SavingsIllustration` считает `monthly*period*discount` — верно, но текст сухой; «Месяцев с нами» пустого стейта нет | Epic B3 |
| Флоу оплаты: модалка IBAN vs Карта | ❌ Сейчас сразу редирект на Fondy. Ветки IBAN/карта/ApplePay/GooglePay нет | Epic B2 (бэк: IBAN-инвойс) + B4 (UI-модалка) |
| Методы оплаты: не хранить карту, убрать отрисовку номера, токен-заглушка | ❌ `PaymentMethodTab.tsx:36-77` рисует физическую карту с `•••• last4`, expiry, держателем | Epic B4: заменяем на **безопасный токен-бейдж** |
| Автосписание только по карте (не IBAN); тумблер «напоминание перед автосписанием» | ⚠️ Тумблеры в `PaymentMethodTab.tsx:122-139` — **статичные, ничего не сохраняют** (`active: true` захардкожен) | Epic B1 (поля есть: `auto_renewal`, `notify_before_days`) + B4 (живые тумблеры + гейт по типу метода) |
| Локализация + символ валюты из глобального стейта | ❌ Всюду хардкод `₽` и `.toLocaleString('ru-RU')`; namespace `billing` в i18n отсутствует | Epic B0 |

---

## 📦 Порядок выполнения

Строго: **БД → эндпоинты → платёжные ветки → UI**. Внутри — по зависимостям.

| # | Эпик | Слой | Зависит от | Оценка |
|---|---|---|---|---|
| **B0** | Локализация, валюта из стейта, пустые состояния | фронт (i18n) | — | ~2:00 |
| **B1** | БД: биллинг-модель тарификации + автосписание | бэк (Alembic) | — | ~2:00 |
| **B2** | Эндпоинты: активация модели, IBAN-инвойс, autopay-настройки | бэк | B1 | ~3:00 |
| **B3** | UI тарифов: чистка «%»/«Фикс+%», точная «Экономия» | фронт | B0, B2 | ~4:00 |
| **B4** | Флоу оплаты: модалка IBAN/Карта + безопасный токен-метод | фронт | B0, B2 | ~4:30 |
| **B5** | История: серверный CSV-экспорт + гарантированный чек | бэк+фронт | B1 | ~2:30 |
| **B6** | Реактивность, глобальные тосты/модалки, плавный скролл | фронт | B0 | ~2:30 |

B0/B1 независимы → параллелятся. B2 ждёт B1. B3/B4 ждут B2 (нужны эндпоинты) и B0
(контракт i18n). B5 ждёт B1 (поля инвойса). B6 ждёт B0 (общий хук). **Итого ~20:30.**

## 🗂 Файлы эпиков

- [`EPIC_B0_LOCALIZATION_EMPTY_STATES.md`](EPIC_B0_LOCALIZATION_EMPTY_STATES.md)
- [`EPIC_B1_BILLING_MODEL_DB.md`](EPIC_B1_BILLING_MODEL_DB.md)
- [`EPIC_B2_ACTIVATION_IBAN_AUTOPAY_API.md`](EPIC_B2_ACTIVATION_IBAN_AUTOPAY_API.md)
- [`EPIC_B3_PRICING_UI_CLEANUP.md`](EPIC_B3_PRICING_UI_CLEANUP.md)
- [`EPIC_B4_PAYMENT_FLOW_SECURE_METHOD.md`](EPIC_B4_PAYMENT_FLOW_SECURE_METHOD.md)
- [`EPIC_B5_HISTORY_CSV_RECEIPTS.md`](EPIC_B5_HISTORY_CSV_RECEIPTS.md)
- [`EPIC_B6_REALTIME_TOASTS_SCROLL.md`](EPIC_B6_REALTIME_TOASTS_SCROLL.md)

## 🧭 Стек (из CLAUDE.md — соблюдать строго)

- **Стейт:** React `useState`/`useEffect` в локальном хуке (`useBillingCalculator`).
  **Redux/Zustand/React Query НЕ вводить** — §3.2, их в проекте нет.
- **API-слой:** `front/src/api/billing/` (`billing.api.ts` + `billing.types.ts`);
  клиент — `front/src/api/client.ts` (`client.get/post/patch`).
- **UI-кит:** только `components/ui/index` — `Button`, `Switch`, `ModalShell`/
  `ModalHeader/Body/Footer`, `ConfirmModal`, `useToast`. **Свои модалки/кнопки/тумблеры
  запрещены** (§5). `PlansTab`/`PaymentMethodTab` сейчас пишут инлайн-стили —
  новые интерактивные части переводим на кит, старую верстку не переписываем массово.
- **Акцент:** персиковый `#F9A08B`/`#FCAE91` — CTA, фокус, активные состояния.
  Пистачо `#A3C9A8` — success, пыльная роза `#D88C9A` — error (§6).
- **Бэк:** FastAPI, `require_role("owner")` (вся страница — только владелец),
  `StudioContext`, SQLAlchemy async, Alembic. Схемы — `back/schemas/settings/billing.py`.
- **Деньги — в копейках** на бэке (`amount: int`), делим на 100 один раз на фронте.
  Суммы к оплате считает **только** сервер (`amount_for` в `plans.py`).
- **i18n:** `react-i18next`, namespaces в `front/src/i18n.ts`, словари
  `front/src/locales/{ru,en}/*.json`.

## 🔗 Ключевые существующие символы (не выдумывать заново)

| Что | Где |
|---|---|
| Каталог цен/скидок, `amount_for()` | `back/routers/billing/plans.py` |
| Checkout / renew (Fondy) | `back/routers/billing/checkout.py` |
| Вебхук Fondy (истина о платеже) | `back/routers/billing/webhook.py` |
| Возвраты | `back/routers/billing/refunds.py` |
| Модели | `back/models/settings.py` → `StudioBillingPlan:172`, `PaymentCard:195`, `BillingInvoice:210` |
| Pydantic-схемы | `back/schemas/settings/billing.py` |
| Fondy-сервис | `back/services/fondy.py` |
| Фронт API | `front/src/api/billing/billing.api.ts` |
| Хук-оркестратор | `front/src/pages/dashboard/Billing/hooks/useBillingCalculator.ts` |
| Табы | `front/src/pages/dashboard/Billing/components/tabs/{PlansTab,InvoicesTab,PaymentMethodTab}.tsx` |
| Модалка апгрейда | `front/src/pages/dashboard/Billing/components/modals/UpgradeModal.tsx` |
