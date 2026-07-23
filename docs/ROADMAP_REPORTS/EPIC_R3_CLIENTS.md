# EPIC R3 — Вкладка «Клиенты» (Retention)

**Цель:** возвращаются ли клиенты, кто растёт в ценности, кого теряем.
KPI, график «новые vs вернувшиеся» по неделям, сегменты риска и лояльных с
кнопками действий, insights. Когорты — «второй этап» по ТЗ → BACKLOG.

**Зависимости:** R0; SQL-сегменты `loyalty/segments.py` (есть, V5-4);
кампании Лояльности (есть). **Оценка: ~7:00.**

---

## Задача 1. Бэк: общие сегменты + GET /analytics/clients-report (~2:30)

**Слой:** бэк.

**1а. Вынос сегментов.** SQL-условия из `back/routers/loyalty/segments.py`
(на грани ухода 21+, VIP без визита 14 дн, абонемент истекает, новички без
второго визита, апсейл) → `back/services/segments.py`: функции возвращают
`select()` по клиентам; `loyalty/segments.py` и новый роутер импортируют
одни и те же условия — цифра «19 клиентов на грани» одинаковая во всех
разделах продукта, всегда.

**1б.** `back/routers/analytics/retention.py` (новый, в `__init__.py`):

`GET /analytics/clients-report?date_from&date_to[&фильтры]`

```jsonc
{
  "kpi": {
    "new":           {"value": ..., "prev_pct": ...},  // registration_date в периоде
    "returned":      {...},   // attended в периоде И attended до date_from
    "lost":          {...},   // attended в prev-периоде, нет в текущем
    "retention_pct": {...},   // _retention (reports.py) — уже есть
    "avg_value":     {...}    // Σ in-оп. с client_id / distinct клиентов
  },
  "weekly": [ {"period": "2026-06-29", "new": 6, "returned": 18} ],  // date_trunc('week')
  "risk_segments": [           // счётчики; порядок = порядок карточек
    {"key": "inactive_14", "count": 11}, {"key": "inactive_30", "count": 7},
    {"key": "inactive_60", "count": 9},  {"key": "low_classes", "count": 5},
    {"key": "sub_expiring", "count": 9}
  ],
  "loyal_segments": [
    {"key": "frequent", "count": 14},    // ≥ 8 посещений за период
    {"key": "high_ltv", "count": 10},    // топ-10% по Σ покупок за всё время
    {"key": "referrers", "count": 4}     // ReferralRecord за период
  ],
  "insights": [...]
}
```

`GET /analytics/clients-report/segment?key=<any_key_above>` →
`[{"id", "name", "last_name", "phone", "last_visit_date", "value"}]` —
единый листинг для драверов/модалок (данные сегмента = те же `select()` из
1а, value = визиты или сумма, по смыслу сегмента).

`GET /analytics/clients-report/week?period=2026-06-29&kind=new|returned` →
тот же формат списка (drilldown точки графика).

**SQL-правила insights:**

| key | Условие | action |
|---|---|---|
| `new_no_second_visit` | новички периода с ровно 1 attended и без будущих записей, count > 0 → `{count}` | `open_campaign` `{segment:'new_no_second'}` |
| `subs_expiring_week` | активные абонементы с `expires_at <= today+7`, count > 0 → `{count}` | `open_campaign` `{segment:'sub_ending'}` |
| `vip_inactive` | клиент status='vip' И `last_visit_date < today-30` → по одному insight на клиента (max 2) → `{name, days}` | `open_client` `{id}` |

## Задача 2. Схемы (~0:30)

`back/schemas/analytics/reports.py`: `ClientsKpi`, `WeeklyPoint`,
`SegmentCount`, `SegmentClientRow`, `ClientsReportRead`.

## Задача 3. Фронт: ClientsTab (~3:15)

**Слой:** фронт → `Reports/components/tabs/ClientsTab.tsx`
(+ `tabs/clients/SegmentCards.tsx`).

- API: `getClientsReport(params)`, `getSegmentClients(key)`,
  `getWeekClients(period, kind)`; ключи `report('clients', paramsKey)`,
  `report('clients-segment', key)`, `report('clients-week', period+kind)`.
- **KPI-ряд** — 5 × `KpiStat`; клик по new/returned/lost → скролл к графику,
  по retention — InfoHint уже объясняет формулу, клик ведёт в сегменты.
- **График**: Recharts grouped `BarChart` — две серии (новые персиковым,
  вернувшиеся нейтральным тоном ДС). Клик по столбцу →
  `DrilldownModal` со списком клиентов недели (`/week`-эндпоинт); строка →
  `open_client(id)` (карточка клиента).
- **SegmentCards** — две группы карточек:
  - «Сегменты риска»: не были 14/30/60 дней, осталось 1–2 занятия,
    абонемент истекает — счётчик + 2 кнопки: «Список» (DrilldownModal с
    клиентами сегмента) и «Запустить кампанию» → `open_campaign` (готовый
    механизм Лояльности; свой не строим);
  - «Лояльные»: частые, высокий LTV, рекомендуют друзей — счётчик +
    «Список».
  - Подписи и описания сегментов — `reports.json → segments.<key>` (ru/en).
- **InsightsPanel** — справа от графика.
- `toCsvRows()`: KPI + счётчики сегментов; из открытой модалки сегмента —
  отдельная кнопка «Экспорт списка» (те же rows → useExport, это и есть
  «отфильтрованный список» для кампании возврата).

## Задача 4. BACKLOG-запись про когорты (~0:15)

`docs/BACKLOG/README.md` — строка: «Отчёты/Клиенты: когортное удержание
(матрица месяц регистрации × месяц визита); данные уже достаточны
(registration_date + reservations), нужен только эндпоинт + грид. Источник:
ТЗ Reports, „второй этап“».

**Критерии приёмки R3:** счётчик каждого сегмента здесь = счётчику того же
сегмента в Лояльности (общий SQL); список сегмента открывается и
экспортируется; клик по клиенту ведёт в карточку; кампания стартует через
существующий флоу Лояльности; retention совпадает с Дашбордом за тот же
период; ru/en полные; всё без F5.
