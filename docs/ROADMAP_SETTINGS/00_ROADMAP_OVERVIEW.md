# Velora CRM — Roadmap SETTINGS: рефакторинг раздела «Настройки»

Раздел `/dashboard/settings` — последняя крупная страница CRM целиком на
моках. Роадмап приводит её к общему стандарту продукта: данные из БД,
реактивность без F5, UI-кит, i18n, — и попутно закрывает **критический
баг, который бьёт по всему приложению** (см. ниже).

**Действуют общие решения V3/V5 (на всё приложение):** TanStack Query как
кэш данных (без F5), единый UI-кит (`front/src/components/ui/`), деньги —
целые единицы + символ из `useStudioCurrency()`.

---

## Точка отсчёта (аудит на 2026-07-23)

### 🔴 Критично: `/settings/general` не существует

`back/routers/settings/general.py`, `security.py`, `team.py` — это
буквально три строки `router = APIRouter()`. Ни одного обработчика.
При этом `front/src/api/settings/settings.api.ts` объявляет **13 методов**,
из которых реально отвечают **ноль**.

Последствие выходит за пределы Настроек:

```ts
// front/src/hooks/useStudioCurrency.ts
queryFn: () => settingsApi.getGeneral()   // → GET /settings/general → 404
```

`useStudioCurrency()` вызывается в **Каталоге** (`EditBranch`,
`EditService`, `EditPackage`, `EditStudio`, `ServiceSection`,
`StudioSection`, `SubscriptionSection`), **Клиентах**
(`ClientsTable`, `ClientProfileSlider`) и Лояльности. Везде запрос падает
в 404, `data` остаётся `undefined`, символ валюты сваливается в дефолт.
**Валюта студии не работает нигде в продукте** — и это чинится одним
эндпоинтом (эпик 2, задача 1). Это первое, что делается в роадмапе.

### Что на фронте

| Вкладка | Состояние |
|---|---|
| Основные | `useState(DEFAULT_GENERAL)` — мок «Pilates & Wellness Studio». Логотип — `FileReader` в base64, на сервер не уходит |
| Рабочие часы | локальный стейт → **удаляется** (часы живут в Каталоге → филиал) |
| Внешний вид | `useState` темы и акцента; **ThemeContext в проекте не существует** — выбор ни на что не влияет |
| Уведомления | локальные тумблеры, не связаны с работающим `/settings/notifications` |
| Команда | `INITIAL_TEAM_DATA` + `INITIAL_PERMISSIONS_MATRIX` (31 чекбокс × 3 роли) → **удаляется** |
| Подписка | целиком мок, при том что `/billing/*` реально работает |
| Безопасность | `INITIAL_SESSIONS`, `INITIAL_API_TOKENS`, `setTimeout` вместо запросов |
| Интеграции | `INITIAL_INTEGRATIONS_CONFIG` — 6 моков, включая «подключённые» WhatsApp и Яндекс |
| Данные | `setTimeout(2000)` → тост «бэкап создан». Цифры «2.4 ГБ / 10 ГБ» — константы в JSX |

Плюс нарушение §5 CLAUDE.md — в разделе живут **локальные копии
компонентов кита**: `ui/Toast.tsx`, `ui/PremiumButton.tsx`,
`ui/form/DarkSelectRow.tsx`, `ui/form/DarkTimeSelect.tsx`,
`hooks/useSettingsToast.ts`. И ноль i18n: неймспейса `settings.json` нет,
все строки — русский хардкод в JSX.

### Что на бэке уже есть (не писать заново)

**Работающие роутеры:**
- `settings/notifications.py` — `GET/PATCH /settings/notifications`,
  `GET/PATCH /settings/notifications/events` (матрица «событие × канал»).
  Используется страницей Уведомлений — **не ломать**.
- `settings/integrations.py` — `tg_notify` / `wa_notify` / `email_sender`:
  реальная валидация токена у Telegram и Meta, OTP на email. Это каналы
  доставки для страницы Уведомлений, а не вкладка «Интеграции».
- `billing/*` — `GET /billing/plans|plan|invoices|cards`, checkout,
  вебхук Fondy, возвраты. Каталог тарифов — `billing/plans.py`
  (`start` 990 ₽ / `pro` 2490 ₽ / `business` 5990 ₽, скидки 1/6/12/24 мес).

**Модели, которые уже в БД и просто не используются кодом:**

| Модель / колонка | Статус | Кому нужна |
|---|---|---|
| `UserSession` (device, browser, location, last_active, token_hash) | таблица есть, **ни одной записи никогда не пишется** | эпик 5 |
| `User.two_fa_enabled` | колонка есть, в `login.py` не проверяется | эпик 5 |
| `User.verification_code` | рабочий OTP-механизм (`forgot-password`) | эпик 5 |
| `User.theme`, `User.accent_color` | колонки есть, эндпоинта нет | эпик 2 |
| `Studio.timezone/language/currency/date_format/first_day_of_week` | заполняются онбордингом, **читать некому** | эпик 2 |
| `StudioBillingPlan.billing_mode/percent_rate/fixed_base_amount` | в БД с миграции `6aaea90e19ed`, в коде не читаются | эпик 4 |
| `StudioIntegration.config` (JSON) | рабочее хранилище конфигов | эпик 6 (токены Google) |

**Мёртвый код на удаление:** `Role`, `RolePermission` (31 булева
колонка), `User.role_id`, `ApiToken`, `StudioBackupSettings`. Проверено
grep'ом — ни один роутер их не селектит. Доступ в продукте реально
считается по `StudioMember.role` (`owner`/`admin`/`trainer`) через
`require_role` — роли-сущности не участвуют.

---

## Общие решения роадмапа

1. **Никаких новых таблиц там, где хватает существующих.** Сессии, 2FA,
   тема, тарифный режим, токены Google — всё ложится в уже
   существующие модели и `JSON`-конфиги. Новые таблицы заводит только
   эпик 6 (`GoogleCalendarLink`) — и только потому, что связь
   «занятие ↔ событие календаря» иначе не выразить.
2. **Удаление — тоже работа.** Каждый эпик начинается со списка на
   удаление и заканчивается grep-проверкой, что удалённое больше нигде
   не упоминается. Итог: −5 моделей, −2 вкладки, −5 локальных
   компонентов-дубликатов, −6 методов мёртвого API.
3. **Реактивность = TanStack Query, не вебсокеты.** Настройки —
   низкочастотные данные, которые меняет один владелец в одной вкладке.
   Мутация → `invalidateQueries` по ключам из `queryKeys.ts`.
   Optimistic UI — только для тумблеров (мгновенный отклик, откат по
   `onError`). Вебсокеты не заводим: платить сокет-инфраструктурой за
   страницу настроек — оверинжиниринг.
4. **Тосты и модалки — только кит.** `useToast()` из
   `components/ui/index`, `ConfirmModal` вместо `window.confirm`,
   `ModalShell`/`Dialog` для всего остального. Локальные копии удаляются
   в эпике 1 — до того, как поверх них наращивается функциональность.
5. **i18n — новый неймспейс `settings`** (`front/src/locales/{ru,en}/settings.json`),
   регистрируется в `i18n.ts` рядом с остальными. Ни одной русской
   строки в JSX. Валюта — `getCurrencySymbol(useStudioCurrency())`,
   даты — по `Studio.date_format`.
6. **Ключи кэша** добавляются в `queryKeys.ts` одним блоком (см. эпик 1).
   Занятый ключ `studioSettings: ['settings','general']` **сохраняется
   как есть** — на нём висит `useStudioCurrency` во всём приложении.
7. **Двойное подтверждение (Double Confirmation)** — общий механизм, а не
   частный случай Danger Zone: `POST /auth/otp/request` +
   `POST /auth/otp/verify` с `action`-скоупом. Один механизм
   обслуживает смену пароля, очистку БД, удаление аккаунта и 2FA-логин
   (эпик 5). Больше нигде OTP не переизобретается.
8. **Экспорт — один серверный генератор.** `services/exporter.py` с
   `StreamingResponse` + `csv.writer`; вкладки «Данные» и «Подписка»
   зовут его с разным `kind`. Никаких клиентских склеек строк и никакого
   PDF в MVP.
9. **Валидация на границе доверия.** Все мутации Настроек — `owner-only`
   через `require_role("owner")` (кроме личных: тема, пароль, сессии —
   они `get_current_user`). Pydantic-схемы с `Literal` для перечислимых
   значений (валюта, язык, формат даты) — фронту не доверяем.
10. **Секреты не отдаются наружу.** Токены интеграций возвращаются
    маскированными (`_mask_token` уже написан в `integrations.py`),
    `refresh_token` Google не покидает бэк никогда.

## Порядок и зависимости

```
EPIC 1 (каркас, удаления)  ──┬──> EPIC 2 (General & Appearance)
                             ├──> EPIC 3 (Notifications)
                             ├──> EPIC 4 (Billing)
                             ├──> EPIC 5 (Security)  ──> EPIC 7 (Data & CRM)
                             └──> EPIC 6 (Integrations)
```

Эпик 1 — блокирующий: он убирает локальные Toast/Select, на которые
опираются все вкладки. Эпик 7 зависит от 5 (удаление аккаунта ведёт на
выбор CRM). Остальные независимы и параллелятся.

| Эпик | Файл | Оценка |
|---|---|---|
| 1. Core Architecture & Global State | [EPIC_01_CORE_ARCH.md](EPIC_01_CORE_ARCH.md) | ~6:00 |
| 2. General & Appearance | [EPIC_02_GENERAL_APPEARANCE.md](EPIC_02_GENERAL_APPEARANCE.md) | ~7:00 |
| 3. Notifications Logic | [EPIC_03_NOTIFICATIONS.md](EPIC_03_NOTIFICATIONS.md) | ~6:30 |
| 4. Subscription & Billing | [EPIC_04_BILLING.md](EPIC_04_BILLING.md) | ~5:30 |
| 5. Security & Danger Zone | [EPIC_05_SECURITY.md](EPIC_05_SECURITY.md) | ~11:00 |
| 6. Integrations (+ Google Calendar) | [EPIC_06_INTEGRATIONS.md](EPIC_06_INTEGRATIONS.md) | ~10:00 |
| 7. Data & CRM Management | [EPIC_07_DATA_CRM.md](EPIC_07_DATA_CRM.md) | ~7:30 |

**Итого ~53:30.**

## Итоговая карта раздела

Было 9 вкладок → стало 7:

| Вкладка | Что с ней |
|---|---|
| Основные | реальный CRUD студии + локаль (эпик 2) |
| ~~Рабочие часы~~ | **удалена** — часы задаются на филиале в Каталоге |
| Внешний вид | тема/акцент в `User` (эпик 2) |
| Уведомления | обязательные vs опциональные (эпик 3) |
| ~~Команда~~ | **удалена** — управление людьми в разделе «Сотрудники» |
| Подписка | реальный биллинг, экспорт CSV (эпик 4) |
| Безопасность | сессии, OTP, 2FA, Danger Zone (эпик 5) |
| Интеграции | 4 канала + Google Calendar OAuth (эпик 6) |
| Данные | экспорт (бэкапы вырезаны) + смена CRM (эпик 7) |

## Расхождения с исходным ТЗ (зафиксировано осознанно)

1. **`/tariffs/payments-history` → `/dashboard/billing/payments-history`.**
   В приложении нет корневого роута `/tariffs`; страница тарифов —
   `/dashboard/billing` (`App.tsx:139`). Используем существующее дерево
   роутов, чтобы не плодить второй вход в биллинг.
2. **«Сменить CRM» = сменить студию (workspace).** В коде «CRM» —
   это `Studio` + членство `StudioMember`. «Список доступных CRM» =
   студии, где пользователь состоит участником. Отдельного справочника
   «внешних CRM» в продукте нет и он не заводится (эпик 7).
3. **«Пароль админа» → «Пароль аккаунта»** — это переименование только
   в UI/i18n; в БД поле всегда называлось `User.hashed_password`.
</content>
</invoke>
