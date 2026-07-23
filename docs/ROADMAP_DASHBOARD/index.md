# ROADMAP_DASHBOARD — «Обзор» (Executive Dashboard)

> Технический роудмэп по итогам аудита страницы «Дашборд». Страница в коде
> называется **Overview** (`front/src/pages/dashboard/Overview/`), эндпоинты —
> `/analytics/*` (`back/routers/analytics/`).

## 🎯 Точка отсчёта (что УЖЕ есть — не переписываем)

Аудит писался «в вакууме»; реальный код к моменту старта закрывает часть пунктов.
Роудмэп фиксирует **дельту**, а не greenfield.

| Аудит требует | Реальный статус в коде | Вывод |
|---|---|---|
| Отказ от mock-данных, всё из БД | ✅ `useOverviewData` уже дёргает `/analytics/summary\|series\|trainers\|services\|activity\|tasks`. Моков на странице нет | Оставляем. Дельта — только новые поля |
| Без F5, реактивный стейт | ⚠️ **Overview — единственная страница дашборда ещё НЕ на TanStack Query.** Стейт на голых `useState`/`useEffect([])` → снимок «замораживается» до перезахода. Остальные разделы (Журнал, Финансы, Клиенты…) уже мигрированы; `queryKeys.ts:18` явно держит «Отчёты» в очереди миграции | Epic D5: **миграция `useOverviewData` на React Query** (уже в проекте). Даёт `refetchOnWindowFocus`+`refetchInterval` из коробки — по образцу Журнала |
| Оптимистичные апдейты задач | ✅ `toggle`/`addTask` в `TodayTasksWidget` уже optimistic | Оставляем; после D5 — на `useMutation`/`onMutate` (образец `useJournalMutations`) |
| Свеча не растягивается на весь холст | ❌ График — **CSS-flex-бары** (`.bar { flex: 1 }` в `App.css:1000`), не Recharts/свечи. Одна точка → `flex:1` → бар на всю ширину | Epic D3: чинится двумя правилами CSS + max-width. Recharts НЕ тащим |
| Пустые состояния без «-» | ❌ `useOverviewData` подставляет `'—'` в метрики при `summary === null` | Epic D1: заменяем на `0` / локализованный «Нет данных» |
| Локализация + символ валюты из стейта | ❌ `formatMoney` хардкодит `₽`; namespace `dashboard` в i18next отсутствует. **Валюта студии уже есть — хук `useStudioCurrency()`** (`front/src/hooks/useStudioCurrency.ts`) | Epic D1 — берём валюту из готового хука, ISO-код в `Intl` |
| Задачи: RBAC-скоуп, делегирование, дропдауны | ❌ `StudioTask` **owner-only**, без `assignee_id`. Ни скоупа, ни назначения, ни UI-дропдаунов | Epic D2 + D4 — основной объём новой работы |
| Заголовок «На сегодня» → «Задачи», редизайн | ❌ Сейчас «Задачи на сегодня» | Epic D4 |

## 📦 Порядок выполнения

Строго последовательно — каждый эпик опирается на предыдущий.

| # | Эпик | Слой | Зависит от | Оценка |
|---|---|---|---|---|
| **D5** | Миграция `useOverviewData` на TanStack Query (реактивность без F5) | фронт | — | ~2:30 |
| **D1** | Локализация, валюта и запрет «-» | фронт | D5 | ~2:00 |
| **D2** | БД + API: делегирование задач (RBAC) | бэк | — | ~3:30 |
| **D3** | Фикс графика: одиночный бар и масштаб оси X | фронт (CSS+TSX) | — | ~1:00 |
| **D4** | Редизайн виджета «Задачи» + каскадные дропдауны | фронт | D2, D5 | ~4:00 |

**D5 идёт первым** и переводит `useOverviewData` на общий `queryClient` — после
этого D1 форматирует данные из квери, а D4 вешает задачи на `useQuery`/`useMutation`
(образец — Журнал). D2 (бэк) и D3 (CSS) независимы, параллелятся с D5. **Итого ~13:00.**

> ⚠️ **Правка первичного плана.** Ранняя версия роудмэпа предполагала, что
> стейт-менеджера нет и «React Query/Redux не вводим». Это неверно: **TanStack
> Query уже app-wide** (`QueryClientProvider` в `App.tsx`, общий `queryClient`
> с `refetchOnWindowFocus`). Overview — просто последняя недомигрированная
> страница. Поэтому D5 = миграция на существующую инфраструктуру, а не
> hand-rolled поллинг.

## 🗂 Файлы эпиков

- [`EPIC_D1_LOCALIZATION.md`](EPIC_D1_LOCALIZATION.md)
- [`EPIC_D2_TASK_DELEGATION_API.md`](EPIC_D2_TASK_DELEGATION_API.md)
- [`EPIC_D3_CHART_FIX.md`](EPIC_D3_CHART_FIX.md)
- [`EPIC_D4_TASKS_WIDGET_REDESIGN.md`](EPIC_D4_TASKS_WIDGET_REDESIGN.md)
- [`EPIC_D5_REALTIME_STATE.md`](EPIC_D5_REALTIME_STATE.md)

## 🧭 Стек (из CLAUDE.md — соблюдать строго)

- **Стейт:** **TanStack Query** (`@tanstack/react-query`) — общий `queryClient`
  (`front/src/api/queryClient.ts`), провайдер в `App.tsx`, ключи в
  `front/src/api/queryKeys.ts`. Образец страницы с поллингом+оптимистикой —
  **Журнал** (`useSchedule.ts` / `useJournalMutations.ts`). Redux/Zustand НЕ
  вводить. Локальный `useState` — только для UI-состояния (открыт дропдаун,
  текст формы), не для серверных данных.
- **API-слой:** `front/src/api/analytics/` (`analytics.api.ts` + `analytics.types.ts`),
  клиент — `front/src/api/client.ts` (`client.get/post/patch/delete`). Функции
  API остаются; их вызывают `queryFn`/`mutationFn`, а не компонент напрямую.
- **Валюта:** хук `useStudioCurrency()` (`front/src/hooks/useStudioCurrency.ts`) —
  ISO-код студии, уже закэширован в общем `queryClient`.
- **Роль:** `getUserRoleFromToken()` (`front/src/utils/auth.ts`) — читает `role`
  из JWT; либо `UserMe.role` (`api/auth/auth.types.ts`), тип `string | null`.
- **UI-кит:** только `components/ui/index` (Button, Select, Switch, Card…). Свои
  дропдауны/кнопки запрещены (§5). Акцент — персиковый `#F9A08B`/`#FCAE91`.
- **Бэк:** FastAPI, `require_role(...)`, `StudioContext`, SQLAlchemy async,
  Alembic. Схемы — `back/schemas/analytics/`.
- **i18n:** `react-i18next`, namespaces в `front/src/i18n.ts`, словари
  `front/src/locales/{ru,en}/*.json`.
