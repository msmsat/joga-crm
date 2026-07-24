# Роадмап — Сообщения и Уведомления (модуль NOTIFICATIONS)

Цель: превратить страницу «Уведомления» из витрины тумблеров в рабочий центр
рассылок. Единая функция отправки на бэке, три живых канала (Telegram,
WhatsApp, Email), боевые триггеры в рабочих процессах (зарплата, дни
рождения, отчёт за день), фронт без F5 — React Query + Zustand, 100% i18n
и валюта студии.

> ⚠️ Стек в ТЗ упоминал Node.js — **бэкенд проекта FastAPI (Python)**.
> Слои ТЗ мапятся 1:1 на существующие: Router → `back/routers/`,
> Validation → `back/schemas/` (Pydantic), Controller/Service →
> `back/services/`, DB Model → `back/models/` (SQLAlchemy). Новых слоёв
> не вводим (CLAUDE.md §3.2).

---

## Точка отсчёта (что уже есть — НЕ переписывать, а расширять)

| Что | Где | Состояние |
|---|---|---|
| Модель настроек каналов (6 bool-колонок) | `back/models/settings.py:23` `StudioNotificationSettings` | ✅ живая |
| Матрица «роль × событие × канал» | `back/models/settings.py:41` `NotificationEventToggle` | ✅ живая |
| GET/PATCH настроек и матрицы | `back/routers/settings/notifications.py` (`/settings/notifications`, `/settings/notifications/events`) | ✅ — это и есть «GET и PUT настроек каналов» из ТЗ (п.7), новые роуты не нужны |
| Диспетчер отправки | `back/services/notifier.py` — `notify()` (только email), `deliver()`, `send_telegram()` | 🟡 расширяем в N-1 |
| Хранилище токенов интеграций | `back/models/settings.py:262` `StudioIntegration` (`integration_type` + JSON `config`) | ✅ переиспользуем, новых таблиц НЕ создаём |
| Роутер интеграций | `back/routers/settings/integrations.py` | ⬜ пустой стаб — сюда эндпоинты N-2 |
| Фоновый цикл | `back/services/scenario_runner.py` + `main.py` lifespan | ✅ образец для ежедневных триггеров N-4 |
| Кнопка «Выплатить» | `back/routers/finances/salary.py:118` `POST /finances/salaries/{user_id}/pay` | ✅ точка врезки триггера t6 |
| Страница Уведомлений | `front/src/pages/dashboard/Notifications/` + `front/src/api/notifications.ts` | 🟡 useState-хук → Zustand + React Query в N-3 |
| React Query v5, i18next (`front/src/i18n.ts`, `front/src/locales/{ru,en}/`), `useStudioCurrency` | front | ✅ |
| Zustand | — | ❌ не установлен — ставим в N-1 |
| WebSockets | — | ❌ нет и не будет: real-time = инвалидация React Query (MVP, ТЗ допускает) |

## Архитектурные решения (зафиксированы, не пересматривать в эпиках)

1. **Единая функция = `notify(db, studio_id, role, event_id, context)`** в
   `back/services/notifier.py`. Второй функции не будет. Маппинг на ТЗ:
   To ← `role` + `context` (резолвер получателя), From ← `StudioIntegration`
   (верифицированный email / токен бота), Message ← шаблон `event_id` +
   `context`, Network ← `StudioNotificationSettings` + матрица toggles,
   Language ← `Studio.language`. Все триггеры приложения зовут только её.
2. **Каналы — только telegram / whatsapp / email.** Лишние bool-колонки
   (`sms`, `push`, `instagram`) в БД остаются (недеструктивно), но UI и
   `notify()` их игнорируют.
3. **Токены каналов — в `StudioIntegration.config` (JSON)**, по одному ряду
   на `integration_type`: `"tg_notify"`, `"wa_notify"`, `"email_sender"`.
   Без новых таблиц и без токенов в env (env — только fallback).
4. **Zustand — только UI-состояние страницы** (выбранная роль, чекбоксы
   каналов). Серверные данные — исключительно React Query. Стор:
   `front/src/stores/notificationsStore.ts`.
5. **Ошибки/успехи — только глобальные `useToast` / `ConfirmModal` /
   ErrorBoundary** из `components/ui/index`. Локальные стейты тостов запрещены.
6. **Сообщения локализуются на бэке** по `Studio.language` (ru/en), суммы —
   по `Studio.currency`. UI страницы — через `t()` и локали
   `front/src/locales/{ru,en}/notifications.json`.

## Эпики

| № | Файл | Суть | Зависит от | Статус |
|---|---|---|---|---|
| N-1 | `EPIC_N_1_BACKLOG.md` | Ядро: единая `notify()` — локализация, валюта, мультиканальный фан-аут, per-studio токены; Zustand-каркас | — | ✅ |
| N-2 | `EPIC_N_2_BACKLOG.md` | Подключение каналов: Telegram (модалка BotFather + токен), Email (адрес отправителя → код → верификация), WhatsApp (Embedded Signup, цена сообщения, предупреждение о платности) — эндпоинты в `settings/integrations.py` + модалки | N-1 | ✅ |
| N-3 | `EPIC_N_3_BACKLOG.md` | Страница Уведомлений: 3 канала, чистка событий (клиент без c10, админ без a5 и с a8), миграция на Zustand + React Query, i18n страницы | N-1 | ✅ |
| N-4 | `EPIC_N_4_BACKLOG.md` | Боевые триггеры: зарплата (`/salaries/{id}/pay` → t6), дни рождения (ежедневный цикл → c7/t8), отчёт за день (a8/o1), врезка `notify()` во все рабочие процессы admin/owner | N-1, N-2 | ✅ |
| N-5 | `EPIC_N_5_BACKLOG.md` | Real-time без F5 (инвалидация ключей RQ, оптимистичные апдейты), ErrorBoundary, сквозная приёмка по ролям, тесты | N-1…N-4 | 🟡 фазы 1–2 готовы, приёмка (4) — на ручной прогон, доки (5) в работе |
| N-6 | `EPIC_N_6_PROVIDER_STATE_PERSISTENCE.md` | Тумблеры каналов переживают F5: GET `/settings/notifications` отдаёт алиасы `*_notifications` вместо коротких ключей → гидрация пишет `undefined`. Фикс `response_model_by_alias=False` + гидрация по `CHANNELS` | N-3 | ⬜ |
| N-7 | `EPIC_N_7_TOGGLE_CLICK_ISOLATION.md` | Клик по тумблеру всплывает на строку канала и открывает модалку. `e.stopPropagation()` в `ToggleSwitch` + доступность строки с клавиатуры | — | ⬜ |
| N-8 | `EPIC_N_8_MATRIX_AUTOSAVE.md` | Автосохранение матрицы по всем 4 ролям: bulk-роут `PATCH /notifications/events/bulk` (`ON CONFLICT` одной транзакцией) + debounce 600 мс вместо кнопки «Сохранить» | N-6 | 🟡 бэк (задачи 1-2) готов, фронт-автосохранение (3-7) в работе |

Порядок строгий: N-1 → (N-2 ∥ N-3) → N-4 → N-5.
Эпики аудита (июль 2026): N-7 ∥ N-6 → N-8.

## Правила качества (каждый эпик)

- После каждой фазы: `cd front && npm run build && npm run lint`; бэк —
  `pytest back/tests/` затронутых файлов. Ошибки чинятся до отчёта.
- `notify()` никогда не валит основной запрос (try/except внутри — уже так).
- Никаких `// implement later`; заглушка канала = тело `_deliver_stub` с логом.
- Миграции Alembic — только когда реально меняется схема (в N-1..N-5 схема
  НЕ меняется: всё ложится в существующие таблицы).
