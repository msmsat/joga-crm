# EPIC R2 — Вкладка «Продажи» (Sales)

**Цель:** на чём зарабатываем и где теряем. Услуга — один из продуктов:
абонементы, разовые, сертификаты, товары — всё здесь. KPI, график
выручка+количество, срезы «Что покупают / Как платят / Кто покупает»,
таблица продуктов, insights.

**Зависимости:** R0 (фильтры, компоненты), `/loyalty/retention` (есть, V5-4).
**Оценка: ~7:15.**

---

## Задача 1. Бэк: GET /analytics/sales (~2:30)

**Слой:** бэк → `back/routers/analytics/sales.py` (новый, в `__init__.py`).

`GET /analytics/sales?date_from&date_to[&фильтры]` — база всех расчётов:
in-операции по `op_conds` (branch/hall не применимы — см. R0 задача 1).

```jsonc
{
  "kpi": {
    "revenue":          {"value": ..., "prev_pct": ...},
    "sales_count":      {...},   // count in-операций
    "avg_check":        {...},   // revenue / sales_count
    "repeat_share_pct": {...},   // клиенты с ≥2 in-оп. / клиенты с ≥1 (за период)
    "renewals_pct":     {...}    // импорт расчёта из loyalty/retention (та же функция, не копия)
  },
  "by_category":   [{"category": "subscriptions", "amount": ..., "count": ..., "share_pct": ...}],
  "by_method":     [{"method": "card", "amount": ..., "count": ..., "share_pct": ...}],
  "by_buyer_type": {                // new: первая in-операция клиента внутри периода
    "new":       {"amount": ..., "count": ...},   //   (MIN(op_date) по клиенту >= date_from)
    "returning": {"amount": ..., "count": ...},   // остальные с client_id
    "no_client": {"amount": ..., "count": ...}    // операции без client_id — честно отдельной строкой
  },
  "products": [                     // GROUP BY product_id (join Product), сортировка по revenue
    {"product_id": 3, "name": "Абонемент 16", "sold": 21, "revenue": 189000,
     "avg_check": 9000, "repeat_share_pct": 38.1,   // клиенты, купившие этот продукт ≥2 раз
     "trend_pct": 24.0}                             // revenue vs prev-период
  ],
  "insights": [...]
}
```

Один прев-проход по тем же условиям даёт все `prev_pct` и `trend_pct`.
Операции без `product_id` → строка `{"product_id": null, "name": null}`
(фронт подпишет `t('reports:table.no_product')`) — сумма таблицы обязана
сходиться с KPI-выручкой.

**SQL-правила insights:**

| key | Условие | action |
|---|---|---|
| `trial_low_conversion` | есть продукт-«пробное» (`Product` c категорией/флагом trial; если эвристика не находит — правило молчит) И доля его покупателей, купивших затем абонемент за период, < 25 % → params `{pct, buyers}` | `open_campaign` `{segment:'trial_no_convert'}` |
| `fastest_growing_product` | продукт с максимальным `trend_pct` при `sold ≥ 5` в текущем периоде → params `{name, pct}` | `open_booking` `{}` (Онлайн-запись — выделить в записи) |
| `renewals_low` | `renewals_pct < 50` при ≥ 5 истёкших абонементах в периоде → params `{pct}` | `open_campaign` `{segment:'sub_ending'}` |

## Задача 2. Бэк: GET /analytics/sales/series (~0:45)

Тот же файл. `?group=day|week` + фильтры →
`[{"period": "2026-07-01", "revenue": 42000, "sales_count": 7}]` — одна
выборка `GROUP BY date_trunc` (паттерн `/series`), обе серии одним ответом
(график у вкладки один, переключателя нет — отдельные метрики не нужны).

## Задача 3. Схемы (~0:30)

`back/schemas/analytics/reports.py`: `SalesKpi`, `CategorySlice`,
`MethodSlice`, `BuyerTypeSlice`, `ProductRow`, `SalesRead`,
`SalesSeriesPoint`.

## Задача 4. Фронт: SalesTab (~3:00)

**Слой:** фронт → `Reports/components/tabs/SalesTab.tsx`
(+ `tabs/sales/BreakdownCards.tsx`, `tabs/sales/ProductsTable.tsx`).

- API: `getSales(params)`, `getSalesSeries(params)`; ключи
  `report('sales', paramsKey)` и `report('sales-series', paramsKey)`.
- **KPI-ряд** — 5 × `KpiStat` (формулы: `formulas.sales_count|avg_check|
  repeat_share|renewals`). Клик по «% продлений» → вкладка `clients`
  (сегмент истекающих).
- **График**: Recharts `ComposedChart` — столбцы выручки + линия числа
  продаж (две оси Y); обычные столбцы/линии, НЕ свечи (прямое требование
  ТЗ). Клик по столбцу → `DrilldownModal` с операциями дня/недели
  (`/finances/operations` с date-фильтром).
- **Срезы** — три Card в ряд (`BreakdownCards`): «Что покупают»
  (by_category, прогресс-бары), «Как платят» (by_method, подписи методов —
  i18n-ключи), «Кто покупает» (new vs returning + no_client, два больших
  числа с долями). Клик по строке среза → операции этой категории/метода в
  `DrilldownModal`.
- **ProductsTable**: Продукт | Продано | Выручка | Средний чек | Доля
  повторных | Динамика (±% бейдж). Сортировка по клику на заголовок
  (локальная, `useState`). Клик по строке → операции продукта.
- **InsightsPanel** — справа от графика (шаблон страницы).
- `toCsvRows()` = строки ProductsTable (текущая сортировка).

## Задача 5. Снос старья (~0:30)

Удалить `TabProdazhi.tsx`, `TabUslugi.tsx` и их подкомпоненты; из
`analytics.api.ts` — `getServices` (эндпоинт `/analytics/services` пока
остаётся — вкладка «услуги» Дашборда может его звать; финальная ревизия в
R5). Проверить `DetailedTable.tsx`/`ProgressBar.tsx`: если больше никто не
импортирует — удалить.

**Критерии приёмки R2:** сумма таблицы продуктов + «без продукта» = KPI
выручки = Финансы→Операции за тот же период; повторные/продления считаются
и совпадают с ручной проверкой; фильтр по тренеру сужает и KPI, и таблицу;
клик в любой столбец/строку открывает реальные операции; CSV = таблица
экрана; ru/en полные.
