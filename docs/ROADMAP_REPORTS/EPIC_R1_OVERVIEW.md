# EPIC R1 — Вкладка «Обзор» (Executive Dashboard)

**Цель:** владелец за 2 минуты видит: бизнес в порядке? где деньги? что
просело? 5 KPI с трендами и кликами, главный график с переключателем метрик,
структура выручки, динамика клиентов, до 3 сигналов «Что делать сейчас».

**Зависимости:** R0. **Оценка: ~7:00.**

---

## Задача 1. Бэк: GET /analytics/overview (~2:00)

**Слой:** бэк → `back/routers/analytics/overview.py` (новый, подключить в
`back/routers/analytics/__init__.py`). Всё — owner-only,
`Depends(report_filters)`, скоуп `ctx.studio_id`.

`GET /analytics/overview?date_from&date_to[&branch_id&hall_id&trainer_id&service_id]`

```jsonc
{
  "kpi": {                      // каждое поле: {"value": int|float, "prev_pct": float|null}
    "revenue":       {...},     // Σ in-операций (op_conds)
    "profit":        {...},     // in − out
    "attendance":    {...},     // count attended-резерваций (lesson_conds)
    "active_clients":{...},     // distinct client_id по attended
    "fill_rate":     {...}      // occupied_expr / capacity_expr, %
  },
  "revenue_structure": [        // только type='in', GROUP BY category
    {"category": "subscriptions", "amount": 182000, "share_pct": 61.4}
  ],
  "client_dynamics": {          // каждое: {"value": int, "prev_pct": float|null}
    "new": {...},               // registration_date в периоде
    "returned": {...},          // attended в периоде И attended до date_from
    "lost": {...}               // attended в prev-периоде, нет attended в текущем
  },
  "insights": [ {"key": "...", "severity": "warning", "params": {...},
                 "action": "...", "action_params": {...}} ]
}
```

Реализация — те же паттерны, что `_period_metrics`/`_revenue_expenses` в
`reports.py`, но через `_filters.py`; prev-период считается вторым проходом
тех же функций (как сейчас в `/summary`).

**SQL-правила insights (максимум 3, по severity):**

| key | Условие (SQL) | action |
|---|---|---|
| `revenue_up_clients_down` | `kpi.revenue.prev_pct > 0 AND kpi.active_clients.prev_pct < 0` (из уже посчитанного) | `open_clients` `{filter:'at_risk'}` |
| `clients_at_risk` | count клиентов: `is_active AND last_visit_date < today-21d` > 0 → params `{count}` | `open_campaign` `{segment:'on_verge'}` (готовые кампании Лояльности, V5-4) |
| `lesson_overfull` | группа по `Lesson.name + weekday + hour`: fill ≥ 90 % в КАЖДУЮ из 3 последних полных недель → params `{name, weekday, hour, pct}` | `add_lesson` `{name, hall_id, teacher_id, weekday, hour}` |

## Задача 2. Бэк: расширить /analytics/series (~0:45)

**Слой:** бэк → `back/routers/analytics/reports.py` (существующий эндпоинт,
Дашборд не ломается — только новые значения enum).

`metric: Literal[..., "profit", "attendance", "fill_rate"]`:
- `profit` — один SELECT по Operation c `SUM(CASE WHEN type='in' THEN amount ELSE -amount END)`;
- `attendance` — как bookings, но `status='attended'`;
- `fill_rate` — по бакетам занятий: Σ занятых / Σ total_spots × 100.
Плюс поддержка `Depends(report_filters)` (обратносовместимо: новые параметры
опциональны).

## Задача 3. Схемы (~0:30)

**Слой:** бэк → `back/schemas/analytics/reports.py` (существующий файл,
дописать): `Kpi`, `Insight`, `RevenueStructureRow`, `ClientDynamics`,
`OverviewRead`. `Insight` кладётся сюда один раз — R2–R5 импортируют.

## Задача 4. Фронт: OverviewTab (~3:00)

**Слой:** фронт → `Reports/components/tabs/OverviewTab.tsx` (+ локальные
`RevenueStructureCard.tsx`, `ClientDynamicsCard.tsx` рядом в `tabs/overview/`).

- API: `analyticsApi.getOverview(params)`; Query-ключ
  `queryKeys.report('overview', paramsKey)`.
- **KPI-ряд** — 5 × `KpiStat`; клики: выручка → вкладка `sales`, прибыль →
  `/dashboard/finances?tab=operations`, посещения → вкладка `schedule`,
  активные клиенты → вкладка `clients`, заполняемость → вкладка `schedule`.
- **Главный график**: переключатель метрик (Выручка / Прибыль / Посещения /
  Новые клиенты / Заполняемость) — сегмент-кнопки; каждая метрика — свой
  Query `['reports','series', metric, paramsKey]` на `/analytics/series`
  (кэш переключается мгновенно). Recharts `AreaChart` (деньги) /
  `BarChart` (счётчики). **Клик по точке** → `DrilldownModal`:
  revenue/profit — операции дня (`GET /finances/operations` с датой дня;
  если у эндпоинта нет date-параметров — добавить `date_from/date_to`
  опциональными), attendance/fill — занятия дня (существующий journal API).
- **Структура выручки**: список категорий с суммой (`fmtMoney`), долей и
  прогресс-баром; подписи категорий — ключи через i18n (категории операций
  уже ключами после V3-аудита). Клик по категории → операции категории в
  `DrilldownModal`.
- **Динамика клиентов**: три числа new/returned/lost с трендами; клик →
  вкладка `clients`.
- **InsightsPanel** под графиком (правая колонка на широких экранах —
  шаблон страницы из ТЗ).
- `toCsvRows()`: KPI + структура выручки + динамика клиентов одной таблицей.

## Задача 5. Экспорт и формулы (~0:15)

`reports.json`: `formulas.revenue|profit|attendance|active_clients|fill_rate`
(из словаря ROADMAP), `insights.revenue_up_clients_down|clients_at_risk|
lesson_overfull` (ru+en, с интерполяцией).

## Задача 6. Снос старья (~0:30)

Удалить `TabOsnovnye.tsx`, `TabAll.tsx`, `TabSobytiya.tsx`,
`useReportData.ts` (мок-множители), `SummaryMetrics.tsx`, неиспользуемые
чарты из `components/charts/` — всё, что осталось без импортов. Лента
событий продукту не теряется: она живёт на Дашборде (`/analytics/activity`).

**Критерии приёмки R1:** все цифры Обзора совпадают с БД (сверка руками по
операциям тестовой студии); смена периода/фильтра обновляет KPI, график,
карточки и insights без F5; каждый KPI и график кликается в детализацию;
insights показываются только при выполнении условий; экспорт скачивает CSV
с цифрами экрана; ru/en переключаются без хвостов русского хардкода.
