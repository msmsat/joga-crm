# EPIC D5 — Миграция Обзора на TanStack Query (реактивность без F5)

**Цель:** перевести `useOverviewData` на общий `queryClient`, как все остальные
разделы дашборда. Обновление данных без перезагрузки страницы (фокус вкладки +
мягкий поллинг «живых» срезов), корректное разделение «первая загрузка / фоновое
обновление», фундамент для оптимистичных мутаций задач.

**Зависимости:** нет. **Оценка ~2:30.** Только фронт. **Разблокирует:** D1, D4.

---

## Контекст (почему это делается вторым, а не последним)

- `front/src/pages/dashboard/Overview/hooks/useOverviewData.ts` — единственный
  хук дашборда на голых `useState` + `useEffect([])`. Данные грузятся один раз и
  «замерзают» до перезахода на страницу. Требование §1 аудита («без F5») им не
  выполняется в принципе.
- **TanStack Query уже app-wide:** `QueryClientProvider` в `App.tsx`, общий
  клиент — `front/src/api/queryClient.ts` (`staleTime: 30_000`,
  `refetchOnWindowFocus: true`, `retry: 1`). Ставить Redux/Zustand/WebSocket
  ради этой страницы **не нужно и запрещено** (`CLAUDE.md` §5 — архитектуру не меняем).
- **Готовый образец** поллинга и «keepPreviousData» — Журнал:
  `Journal/hooks/useSchedule.ts:99-116`. Оптимистика с откатом —
  `Journal/hooks/useJournalMutations.ts`. Копируем паттерн, не изобретаем.

---

## Backend

Изменений нет. Используются существующие эндпоинты (все — `require_role("owner")`,
`back/routers/analytics/reports.py`):

| Метод | URL | Query | Ответ |
|---|---|---|---|
| GET | `/analytics/summary` | `date_from`, `date_to` | `PeriodSummary` |
| GET | `/analytics/series` | `metric`, `group`, `date_from`, `date_to` | `SeriesPoint[]` |
| GET | `/analytics/trainers` | `date_from`, `date_to` | `TrainerReportRow[]` |
| GET | `/analytics/services` | `date_from`, `date_to` | `ServiceReportRow[]` |
| GET | `/analytics/activity` | `limit` | `ActivityLog[]` |

---

## Frontend API & State

### Задача 1. Ключи кэша (~0:15)

**Файл:** `front/src/api/queryKeys.ts` — дописать блок Обзора по действующему
соглашению «ключ = сущность (+ параметры), для инвалидации — префикс»:

```ts
  // Дашборд («Обзор»). Ключи с датами — чтобы смена периода не била в один слот.
  overviewSummary:  (from: string, to: string) => ['overview', 'summary', from, to] as const,
  overviewSeries:   (metric: string, group: string, from: string, to: string) =>
                      ['overview', 'series', metric, group, from, to] as const,
  overviewTrainers: (from: string, to: string) => ['overview', 'trainers', from, to] as const,
  overviewServices: (from: string, to: string) => ['overview', 'services', from, to] as const,
  overviewActivity: ['overview', 'activity'] as const,
  overviewTasks:    (scope: string, assigneeId: number | null) =>
                      ['overview', 'tasks', scope, assigneeId] as const,   // используется в D4
  overviewTasksAll: ['overview', 'tasks'] as const,                        // префикс инвалидации (D4)
  overviewAssignees: ['overview', 'assignees'] as const,                   // используется в D4
```

В шапочном комментарии `queryKeys.ts` (строки 10-21) дописать строку
«Дашбордом: overview*» и убрать Overview из «очереди миграции».

### Задача 2. Переписать `useOverviewData` на `useQuery` (~1:15)

**Файл:** `front/src/pages/dashboard/Overview/hooks/useOverviewData.ts`.

Правило разделения: **серверные данные — только в квери; `useState` остаётся
исключительно для UI-состояния** (`period`, `activeMetric`).

Хелперы `iso`, `monthRange`, `SERIES_METRIC`, `SERIES_RANGE` (строки 14-38)
сохраняются как есть. `useEffect`-ов в файле не остаётся ни одного.

```ts
import { useMemo, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { analyticsApi, ApiError } from '../../../../api';
import { queryKeys } from '../../../../api/queryKeys';

export function useOverviewData() {
  // ── UI-состояние ──
  const [period, setPeriod] = useState<'week' | 'month' | 'year'>('month');
  const [activeMetric, setActiveMetric] = useState<MetricConfig['id']>('revenue');

  // Диапазоны считаем один раз за рендер — они же входят в ключи кэша.
  const range = monthRange();
  const { days, group } = SERIES_RANGE[period];
  const seriesMetric = SERIES_METRIC[activeMetric];          // null для retention
  const seriesFrom = iso(new Date(Date.now() - days * 86_400_000));
  const seriesTo = iso(new Date());

  // ── Серверные данные ──
  const summary = useQuery({
    queryKey: queryKeys.overviewSummary(range.date_from, range.date_to),
    queryFn: () => analyticsApi.getSummary(range),
  });

  const trainers = useQuery({
    queryKey: queryKeys.overviewTrainers(range.date_from, range.date_to),
    queryFn: () => analyticsApi.getTrainers(range),
  });

  const services = useQuery({
    queryKey: queryKeys.overviewServices(range.date_from, range.date_to),
    queryFn: () => analyticsApi.getServices(range),
  });

  const activity = useQuery({
    queryKey: queryKeys.overviewActivity,
    queryFn: () => analyticsApi.getActivityLog(13),
    refetchInterval: 60_000,          // лента «живая» — как сетка Журнала
  });

  const series = useQuery({
    queryKey: queryKeys.overviewSeries(seriesMetric ?? 'none', group, seriesFrom, seriesTo),
    queryFn: () => analyticsApi.getSeries({
      metric: seriesMetric!, group, date_from: seriesFrom, date_to: seriesTo,
    }),
    enabled: seriesMetric !== null,   // у retention ряда нет — запрос не шлём
    placeholderData: keepPreviousData, // смена метрики/периода не гасит график
  });

  // ── Производные ──
  const queries = [summary, trainers, services, activity];
  const forbidden = queries.some(q => q.error instanceof ApiError && q.error.status === 403);
  const loading = queries.some(q => q.isPending) && !forbidden;

  const metrics: MetricConfig[] = useMemo(
    () => buildMetrics(summary.data ?? null),   // тело — из D1 (валюта/локаль/без «-»)
    [summary.data],
  );
  const activeConfig = metrics.find(m => m.id === activeMetric)!;

  return {
    loading, forbidden,
    summary: summary.data ?? null,
    metrics, activeMetric, setActiveMetric, activeConfig,
    period, setPeriod, series: series.data ?? [],
    trainers: trainers.data ?? [], services: services.data ?? [],
    events: activity.data ?? [],
    // tasks/setTasks здесь БОЛЬШЕ НЕТ — переезжают в useOverviewTasks (D4)
  };
}
```

**Что даёт миграция без единой дополнительной строки:**

| Поведение | Откуда берётся |
|---|---|
| Обновление при возврате во вкладку | `refetchOnWindowFocus: true` в `queryClient.ts` |
| Мгновенный рендер из кэша при переходах между разделами | `staleTime: 30_000` |
| Пауза поллинга на скрытой вкладке | встроено в React Query (`refetchInterval` не тикает при `document.hidden`) |
| Один запрос вместо N при монтировании нескольких потребителей | дедупликация по `queryKey` |
| Ретрай сетевого сбоя | `retry: 1` |

`refetchInterval` ставим **точечно** — на ленту событий (и на задачи в D4). На
`summary`/`series`/`trainers`/`services` не ставим: период фиксированный, долбить
агрегаты незачем; фокус вкладки их и так обновит.

### Задача 3. Первичная загрузка vs фоновое обновление (~0:30)

Контракт хука (`loading`, `forbidden`) сохраняется — `Overview.tsx` не переписываем,
меняется только источник флагов. Правила (как в `useSchedule.ts:107-116`):

- **`isPending`** (кэш пуст, данных нет вообще) → полноэкранная заглушка загрузки.
- **`isFetching && !isPending`** (фоновое обновление) → **экран не гасим**, на месте
  остаются прошлые данные. Опционально — тонкий индикатор в углу карточки.
- **Ошибка первой загрузки** (`isPending && error`) → плашка вместо контента с
  кнопкой «Повторить» (`refetch`).
- **Фоновая ошибка** (данные в кэше есть) → тихо, тост через `useToast` из
  `components/ui/index`; контент из кэша остаётся на экране.
- `403` на owner-only квери → `forbidden` (не «ошибка», а «нет доступа»).

### Задача 4. Инвалидация как единственный способ обновления (~0:30)

Правило для страницы: **никаких ручных `setState`-перезагрузок и `location.reload()`**.
Любая запись (сейчас — только задачи) обновляет экран через
`queryClient.invalidateQueries({ queryKey: … })`. Полный набор мутаций задач с
`onMutate`/rollback описан в [D4](EPIC_D4_TASKS_WIDGET_REDESIGN.md); здесь только
заводятся ключи.

Чек-лист по файлу: `grep -n "useEffect\|reload()" front/src/pages/dashboard/Overview/**` → пусто.

---

## Frontend UI & Components

- `Overview.tsx` — правки минимальны: `d.tasks`/`d.setTasks` больше не приходят из
  `useOverviewData`, `TodayTasksWidget` начинает брать их из своего хука (D4). До
  выполнения D4 допустим временный проброс из `useOverviewTasks`-заглушки —
  **но D4 идёт следом, «времянку» не коммитим отдельным релизом**.
- `MetricsRow`, `AnalyticsChart`, `RecentEventsBoard`, `SummaryWidgets` — без
  изменений: контракт пропсов сохранён.

---

## Definition of Done

- [ ] В `Overview/hooks/` нет ни одного `useEffect` с фетчем; всё через `useQuery`.
- [ ] Свернуть вкладку → вернуться: summary и лента обновляются молча, без мигания и без F5.
- [ ] Скрытая вкладка не шлёт запросов (проверка в Network).
- [ ] Смена метрики и периода не гасит график (`keepPreviousData` работает).
- [ ] Переход «Обзор → Клиенты → Обзор» в пределах 30 с не вызывает повторных запросов.
- [ ] Комментарий-реестр в `queryKeys.ts` обновлён (Обзор больше не в очереди миграции).
- [ ] `cd front && npm run build && npm run lint` — чисто.
