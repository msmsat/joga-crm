# EPIC R6 — API & Data: правда в каждой точке графика

**Цель:** ни один график Отчётов не строится на выдумке и не сжимается до двух
точек. Бэкенд отдаёт **полную ось X** за выбранный период — пустые интервалы
приходят нулями, а не отсутствуют. Закрываются дыры в API-слое, из-за которых
фронт не может открыть нужный срез.

**Аудит:** пункты 1, 2, 16 (данные), 19, 22 (бэк-часть).
**Зависимости:** нет — эпик первый, на нём стоят R7 и R10.
**Оценка: ~5:30.**

---

## Корень проблемы (найдено в коде)

Все серии строятся одинаково: `date_trunc(group, …) … GROUP BY period` и
возвращаются **как есть**. Postgres не отдаёт бакеты, в которых нет строк —
поэтому месяц с двумя операциями превращается в график из двух свечей.

Затронуты все пять мест:

| Файл | Строка | Что возвращает |
|---|---|---|
| `back/routers/analytics/reports.py` | 211–215 (`/series`) | `list[SeriesPoint]` |
| `back/routers/analytics/reports.py` | 238–244 (`_fill_rate_series`) | `list[SeriesPoint]` |
| `back/routers/analytics/sales.py` | 348–359 (`/sales/series`) | `list[SalesSeriesPoint]` |
| `back/routers/analytics/retention.py` | 164–168 (`_weekly`) | `list[WeeklyPoint]` |
| `back/routers/analytics/team.py` | 360–367 (`revenue_series`) | `list[SeriesPoint]` |

Чинить в каждом — пять копий одной логики. Чиним **один раз** в `_filters.py`,
все пять вызывают общий хелпер.

---

## Tasks

- [x] **1.** Хелпер `series_buckets()` + `fill_series()` в `_filters.py` (аудит 2) — ~1:00
- [x] **2.** Подключить хелпер во все 5 серий (аудит 1, 2) — ~1:00
- [x] **3.** `group="hour"` для однодневного периода — 18 слотов вместо одного (аудит 2) — ~0:45
- [x] **4.** Сегмент `active` в `/analytics/clients-report/segment` (аудит 22) — ~0:45
- [ ] **5.** Ревизия «недостающих эндпоинтов»: сверка экрана с API (аудит 19, 16) — ~0:45
- [x] **6.** Фронт: API-слой и типы под `hour` и `active` (аудит 19) — ~0:30
- [x] **7.** Тесты `back/tests/test_analytics_series_fill.py` — ~0:45

---

## Backend Architecture

### Задача 1. Общий хелпер заполнения серий

**Файл:** `back/routers/analytics/_filters.py` (дописать в конец).

```python
Group = Literal["hour", "day", "week", "month"]

# Однодневный период рисуем по часам. Окно — константа, а не рабочие часы
# студии: рабочих часов у филиала может не быть заполнено, а ось нужна всегда.
SERIES_DAY_HOURS = range(6, 24)  # 18 слотов — ровно то, что просит аудит


def bucket_key(dt: datetime | date, group: Group) -> str:
    """Ключ бакета ровно так, как его считает date_trunc в Postgres.
    week → понедельник, month → 1-е число, hour → ISO с часом."""


def series_buckets(date_from: date, date_to: date, group: Group) -> list[str]:
    """Полный список ключей бакетов периода — включая пустые."""


def fill_series(rows: dict[str, T], buckets: list[str], zero: Callable[[str], T]) -> list[T]:
    """rows — то, что вернул SQL (ключ бакета → точка); buckets — полная ось.
    Возвращает список длиной len(buckets) в порядке оси."""
```

Правила бакетов (совпадают с `date_trunc`):
- `hour` — каждый час из `SERIES_DAY_HOURS`, только если `date_from == date_to`;
- `day` — каждый день `date_from … date_to` включительно;
- `week` — понедельники: `d - timedelta(days=d.weekday())`, от недели `date_from`
  до недели `date_to`;
- `month` — первые числа месяцев.

### Задача 2. Подключение

Каждый из пяти запросов: результат SQL → `dict[bucket_key, point]` →
`fill_series(...)`. Пример для `/series`:

```python
rows = {p.date().isoformat(): float(v or 0) for p, v in await db.execute(...)}
buckets = series_buckets(f.date_from, f.date_to, group)
return fill_series(rows, buckets, zero=lambda b: SeriesPoint(period=b, value=0.0))
```

Нули для каждого типа точки:
- `SeriesPoint` → `value=0.0`;
- `SalesSeriesPoint` → `revenue=0, sales_count=0`;
- `WeeklyPoint` → `new=0, returned=0`.

**Совместимость:** Дашборд тоже ходит в `/analytics/summary` и `/analytics/series`
— формат точки не меняется, добавляются только пропущенные точки. Ломаться
нечему, но прогнать `back/tests/` целиком обязательно.

### Задача 3. `group="hour"`

`reports.py::metric_series` и `sales.py::analytics_sales_series`:
`group: Literal["hour", "day", "week", "month"] = Query("day")`.
`func.date_trunc("hour", …)` работает без изменений; фильтр по датам уже
покрывает сутки (`lesson_conds` использует `time.max`).

Валидация: `hour` разрешён только при `date_from == date_to` — иначе
`HTTPException(400, "Почасовая разбивка доступна только для одного дня")`.

### Задача 4. Сегмент `active`

**Файл:** `back/routers/analytics/retention.py`, эндпоинт
`GET /analytics/clients-report/segment` (строка 313).

Сейчас ключ вне `RISK_SEGMENT_KEYS ∪ {frequent, high_ltv, referrers}` → 404.
Добавить ветку `key == "active"`: distinct `Reservation.client_id` со
`status='attended'` и занятием в периоде (`lesson_conds`), отсортировать по
`last_visit_date DESC`.

Response — существующий `SegmentClientRow`, ничего нового:

```jsonc
[
  { "id": 42, "name": "Анна", "last_name": "Петрова", "phone": "+7…",
    "last_visit_date": "2026-07-21", "value": 7 }   // value = число визитов за период
]
```

### Задача 5. Ревизия эндпоинтов (аудит 19)

Инвентаризация показала: **новых контроллеров под текущие экраны не нужно** —
`/overview`, `/sales`, `/sales/series`, `/clients-report`, `/clients-report/segment`,
`/clients-report/week`, `/team`, `/team/{id}`, `/utilization`, `/utilization/slot`,
`/series` уже существуют и уже реальны. Задача — не писать новое, а **сверить**:

- [x] пройти по каждому виджету всех 5 вкладок и отметить, из какого эндпоинта
      взято каждое число (табличка в PR);
- [x] тепловая карта Расписания (`/utilization`) — подтвердить, что часы
      приходят из `Lesson.start_time`, а не из константы (аудит 16, данные);
- [x] всё, что осталось без источника, — только тогда новый эндпоинт;
- [x] ~~удалить мёртвые `/analytics/trainers` и `/analytics/services`~~ —
      **проверено, НЕ мёртвые.** `grep getTrainers\|getServices front/src` находит
      живые вызовы в `pages/dashboard/Overview/hooks/useOverviewData.ts:62-63`
      (используются виджетами `SummaryWidgets.tsx`/`Overview.tsx` на странице
      **Дашборд**, п. 2.2 ТЗ — это не вкладка Отчётов, R4 её не касался).
      Предпосылка эпика была неверной — удалять нельзя, иначе сломается
      Дашборд.

**Табличка «виджет → эндпоинт» (5 вкладок Отчётов, `front/src/pages/dashboard/Reports/components/tabs/`):**

| Вкладка | Виджет | Эндпоинт |
|---|---|---|
| Обзор (`OverviewTab.tsx`) | KPI, структура выручки, динамика клиентов, insights | `GET /analytics/overview` |
| Обзор | График метрики (переключатель) | `GET /analytics/series` |
| Продажи (`SalesTab.tsx`) | KPI, категории/методы/buyer_type, топ продуктов, insights | `GET /analytics/sales` |
| Продажи | График динамики продаж | `GET /analytics/sales/series` |
| Клиенты (`ClientsTab.tsx`) | KPI, недельная динамика, risk/loyal сегменты, insights | `GET /analytics/clients-report` |
| Клиенты | Drilldown по сегменту (клик по карточке) | `GET /analytics/clients-report/segment` |
| Клиенты | Drilldown по неделе (new/returned) | `GET /analytics/clients-report/week` |
| Команда (`TeamTab.tsx`) | KPI, таблица тренеров, insights | `GET /analytics/team` |
| Команда | Детализация тренера (`TrainerDrawer.tsx`) | `GET /analytics/team/{id}` |
| Расписание (`ScheduleTab.tsx`) | KPI, тепловая карта, топ-занятия, chronic_low, залы, insights | `GET /analytics/utilization` |
| Расписание | Drilldown слота тепловой карты | `GET /analytics/utilization/slot` |

Все 11 эндпоинтов из инвентаризации подтверждены живыми вызовами на фронте;
осиротевших виджетов (без источника) не найдено — новый контроллер не нужен.
Тепловая карта: `ScheduleTab.tsx` рендерит `c.weekday`/`c.hour` строго из
`data.heatmap` (API), `Heatmap.tsx` ничего не хардкодит; на бэке
`_heatmap_rows()` берёт часы через `func.extract("hour", Lesson.start_time)` —
реальное время занятия, не константа.

---

## Frontend Architecture

**`front/src/api/analytics/analytics.api.ts`:**
- `SeriesParams['group']` и `SalesSeriesParams['group']` → `'hour' | 'day' | 'week' | 'month'`;
- `getClientsReportSegment` уже принимает произвольный ключ — менять нечего.

**`front/src/pages/dashboard/Reports/hooks/useReportFilters.ts`:**
добавить производное значение — какой `group` просить у бэка:

```ts
// Ось X всегда читаемая: сутки — по часам, до 45 дней — по дням, дальше — недели.
export function groupForRange(from: string, to: string): 'hour' | 'day' | 'week' {
  const days = (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000;
  if (days < 1) return 'hour';
  return days <= 45 ? 'day' : 'week';
}
```

Возвращать из хука как `group`; вкладки (`OverviewTab`, `SalesTab`) передают его
в `analyticsApi.getSeries/getSalesSeries` **и в Query-ключ** —
`queryKeys.reportSeries(metric, `${paramsKey}-${group}`)`, иначе смена периода
достанет из кэша серию другой разбивки.

Подпись тика зависит от разбивки — заменить `fmtDay` в `OverviewTab.tsx:37` и
`SalesTab.tsx:32` на общий хелпер `front/src/lib/format.ts`:

```ts
export function fmtBucket(iso: string, group: 'hour' | 'day' | 'week'): string
// hour → "14:00" · day → "24.07" · week → "24.07" (начало недели)
```

---

## Styling & UI/UX

Эпик серверный, но одно правило фиксируется здесь и используется в R7:
**точка с нулём — это данные, а не отсутствие данных.** Бэк никогда не отдаёт
дырку в оси; фронт никогда не додумывает точку сам.

---

## Edge Cases

| Ситуация | Поведение |
|---|---|
| В периоде ноль операций | Массив полной длины из нулей, HTTP 200. Пустой `[]` возвращать нельзя |
| `date_from == date_to`, `group='day'` | Одна точка — фронт в этом случае обязан запросить `hour` |
| `group='hour'` на диапазоне > 1 дня | 400 с человеческим текстом, фронт такой запрос не формирует |
| Период 5 лет, `group='day'` | 1800 точек. `groupForRange` не даст: > 45 дней → `week` |
| Неделя пересекает границу периода | Бакет всё равно попадает в ось (`date_trunc` даёт понедельник ДО `date_from`) — подпись честная, значение считается только по строкам внутри периода |
| Сегмент `active` при пустом периоде | `[]` (пустой список), не 404 — 404 остаётся только для неизвестного ключа |
| У клиента нет `phone` / `last_visit_date` | `null` в DTO, фронт рисует «—» |

---

## Definition of Done

- `back/tests/test_analytics_series_fill.py`: период 3 дня с одной операцией →
  3 точки; неделя → бакеты-понедельники; `hour` на одном дне → 18 точек;
  пустой период → нули полной длины.
- Существующие `back/tests/` зелёные (Дашборд не сломан).
- `npm run build && npm run lint` зелёные.
- В `/analytics/clients-report/segment?key=active` приходит список, длина
  совпадает с KPI «Активные клиенты» на Обзоре за тот же период.
