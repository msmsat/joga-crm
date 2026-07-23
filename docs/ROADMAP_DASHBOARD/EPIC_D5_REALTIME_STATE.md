# EPIC D5 — Миграция `useOverviewData` на TanStack Query (реактивность без F5)

**Цель:** перевести Overview на общий `queryClient` — как все остальные разделы
дашборда. Реактивность без F5 (обновление при возврате на вкладку + мягкий
поллинг) получается из коробки, а не hand-rolled. Это разблокирует D1/D4.

**Зависимости:** нет. **Оценка: ~2:30.** Только фронт. **Идёт первым.**

---

## Контекст (почему это первый эпик, а не последний)

- [`useOverviewData.ts`](../../front/src/pages/dashboard/Overview/hooks/useOverviewData.ts)
  — единственный дашборд-хук на голых `useState`/`useEffect([])`. Данные грузятся
  один раз и «замерзают» до перезахода.
- **TanStack Query уже app-wide:** [`App.tsx`](../../front/src/App.tsx#L84)
  оборачивает всё в `QueryClientProvider`; общий клиент —
  [`queryClient.ts`](../../front/src/api/queryClient.ts) с дефолтами
  `staleTime: 30s`, `refetchOnWindowFocus: true`.
- **`queryKeys.ts:18`** прямо держит «Отчёты» (analytics) в очереди миграции —
  этот эпик её закрывает для Overview.
- **Готовый образец** с поллингом + оптимистикой — Журнал:
  [`useSchedule.ts:104`](../../front/src/pages/dashboard/Journal/hooks/useSchedule.ts#L104)
  (`refetchInterval: 60_000`, `placeholderData: keepPreviousData`),
  [`useJournalMutations.ts`](../../front/src/pages/dashboard/Journal/hooks/useJournalMutations.ts)
  (`onMutate`/cancel/rollback). Копируем паттерн, не изобретаем.

## Frontend — Задача 1. Ключи кэша (~0:15)

**Файл:** [`front/src/api/queryKeys.ts`](../../front/src/api/queryKeys.ts). Дописать
блок Overview (по соглашению «ключ = сущность (+ параметры)»):

```ts
overviewSummary: (from: string, to: string) => ['overview', 'summary', from, to] as const,
overviewSeries:  (metric: string, group: string, from: string, to: string) =>
                   ['overview', 'series', metric, group, from, to] as const,
overviewTrainers:(from: string, to: string) => ['overview', 'trainers', from, to] as const,
overviewServices:(from: string, to: string) => ['overview', 'services', from, to] as const,
overviewActivity: ['overview', 'activity'] as const,
overviewTasks:   (scope: string, assigneeId: number | null) =>
                   ['overview', 'tasks', scope, assigneeId] as const,   // D2/D4
overviewTasksAll: ['overview', 'tasks'] as const,                       // префикс для инвалидации
overviewAssignees: ['overview', 'assignees'] as const,                  // D4
```

Снять «Отчёты» из очереди в комментарии `queryKeys.ts:18` (Overview закрыт).

## Frontend — Задача 2. Переписать хук на `useQuery` (~1:15)

**Файл:** `useOverviewData.ts`. Каждый `Promise.all`-фетч → отдельный `useQuery`.
UI-состояние (`period`, `activeMetric`) остаётся в `useState`.

```ts
export function useOverviewData() {
  const [period, setPeriod] = useState<'week'|'month'|'year'>('month');
  const [activeMetric, setActiveMetric] = useState<MetricConfig['id']>('revenue');
  const range = monthRange();
  const { days, group } = SERIES_RANGE[period];
  const seriesMetric = SERIES_METRIC[activeMetric];
  const from = iso(new Date(Date.now() - days * 86_400_000));

  const summary  = useQuery({ queryKey: queryKeys.overviewSummary(range.date_from, range.date_to),
                              queryFn: () => analyticsApi.getSummary(range) });
  const trainers = useQuery({ queryKey: queryKeys.overviewTrainers(range.date_from, range.date_to),
                              queryFn: () => analyticsApi.getTrainers(range) });
  const services = useQuery({ queryKey: queryKeys.overviewServices(range.date_from, range.date_to),
                              queryFn: () => analyticsApi.getServices(range) });
  const activity = useQuery({ queryKey: queryKeys.overviewActivity,
                              queryFn: () => analyticsApi.getActivityLog(13),
                              refetchInterval: 60_000 });      // лента событий — «живая», как Журнал
  const series   = useQuery({ queryKey: queryKeys.overviewSeries(seriesMetric ?? 'none', group, from, iso(new Date())),
                              queryFn: () => analyticsApi.getSeries({ metric: seriesMetric!, group, date_from: from, date_to: iso(new Date()) }),
                              enabled: seriesMetric !== null,   // retention ряда не имеет
                              placeholderData: keepPreviousData }); // смена метрики/периода не мигает

  // forbidden: любой owner-only квери вернул 403
  const forbidden = [summary, trainers, services, activity].some(
    q => q.error instanceof ApiError && q.error.status === 403);
  const loading = summary.isPending || trainers.isPending || services.isPending || activity.isPending;

  // metrics/activeConfig — тот же useMemo, но из summary.data
  ...
  return { loading, forbidden,
           summary: summary.data ?? null,
           metrics, activeMetric, setActiveMetric, activeConfig,
           period, setPeriod, series: series.data ?? [],
           trainers: trainers.data ?? [], services: services.data ?? [], events: activity.data ?? [] };
}
```

- **`refetchOnWindowFocus`** и `staleTime: 30s` — из дефолтов `queryClient`, дописывать
  не нужно. `refetchInterval: 60_000` ставим точечно на «живые» квери (лента, задачи),
  не на summary/series (период фиксирован — незачем долбить).
- **Задачи** в этот хук из D5 **не тащим** — их `useQuery`/`useMutation` со скоупом
  и оптимистикой полностью описан в **D4** (`overviewTasks` ключ). Здесь только
  заводим ключи.

## Frontend — Задача 3. Первичная загрузка vs фоновая (~0:30)

Как в Журнале ([`useSchedule.ts:111`](../../front/src/pages/dashboard/Journal/hooks/useSchedule.ts#L111)):

- **Скелетон/«Загрузка…»** — только когда `isPending` (кэш пуст, первая загрузка).
  Фоновый рефетч (`isFetching && !isPending`) экран не гасит — данные уже на месте.
- **Ошибка первой загрузки** (`isPending && error`) → плашка вместо контента.
  Фоновая ошибка → тихо (тост через `useToast`, контент из кэша остаётся).
- `Overview.tsx` уже разводит `loading`/`forbidden` — контракт хука сохраняем,
  меняется только источник (`.isPending`/`.error` вместо ручных флагов).

## Definition of Done

- `useOverviewData` не содержит `useEffect` с ручным фетчем — только `useQuery`.
- Свернуть/развернуть вкладку → summary/лента обновляются молча, без мигания.
- Фоновая вкладка не опрашивает бэк (React Query паузит `refetchInterval` при
  `document.hidden` — проверить в Network).
- Смена метрики/периода: график не пустеет на миг (`keepPreviousData`).
- `queryKeys.ts:18` больше не числит «Отчёты» в очереди для Overview.
- `cd front && npm run build && npm run lint` — чисто.
