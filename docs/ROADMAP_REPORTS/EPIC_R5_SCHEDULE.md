# EPIC R5 — Вкладка «Расписание» (Schedule Utilization) + зачистка

**Цель:** как использовать время и залы, чтобы зарабатывать больше.
Тепловая карта день × час с кликом в занятия слота, срезы по
прибыльности/заполненности/хронически пустым занятиям/залам, insights.
Плюс финальная зачистка старого кода отчётов.

**Зависимости:** R0. **Оценка: ~7:30.**

---

## Задача 1. Бэк: GET /analytics/utilization (~2:30)

**Слой:** бэк → `back/routers/analytics/utilization.py` (новый, в
`__init__.py`). База: неотменённые занятия по `lesson_conds`;
«прошедшие» — для no-show и упущенной выручки.

```jsonc
{
  "kpi": {
    "avg_fill_pct": {"value": ..., "prev_pct": ...},
    "free_spots":   {...},   // Σ total_spots − занятые, по будущим И прошедшим периода
    "cancels":      {...},   // count Lesson status='cancelled' в периоде
    "noshows":      {...},   // count резерваций по noshow_cond()
    "lost_revenue": {...}    // Σ (свободные места × Lesson.price) по ПРОШЕДШИМ неотменённым
  },
  "heatmap": [   // GROUP BY день недели × час начала (EXTRACT(isodow), EXTRACT(hour))
    {"weekday": 1, "hour": 10, "fill_pct": 24.0, "lessons": 4, "attendance": 9}
  ],
  "top_profitable": [ {"name": "Вечерний пилатес", "revenue": 96000, "held": 12, "fill_pct": 92.0} ],
      // выручка занятия: attended × price (прямая связь операция→занятие в БД
      // отсутствует — приближение фиксируется в InfoHint formulas.lesson_revenue)
  "top_filled":     [ {"name": ..., "fill_pct": ..., "held": ...} ],
  "chronic_low": [   // группа name+weekday+hour: fill < 30% в КАЖДУЮ из 4 последних полных недель
    {"name": "Стретчинг", "weekday": 1, "hour": 10, "fill_pct": 24.0, "weeks": 4,
     "lesson_ids": [311, 340, 371, 402]}
  ],
  "halls": [ {"hall_id": 2, "name": "Зал №2", "fill_pct": 61.0,
              "evening_idle_pct": 36.0} ],  // доля часов 17–21 без занятий
  "insights": [...]
}
```

**SQL-правила insights:**

| key | Условие | action |
|---|---|---|
| `slot_chronic_low` | верхняя строка `chronic_low` → `{name, weekday, hour, pct, weeks}` | `open_journal` `{lesson_id}` — журнал на ближайшее такое занятие: там перенести (drag) или отменить |
| `hall_idle_evenings` | `evening_idle_pct > 30` → `{name, pct}` | `open_journal` `{hall_id, evening: true}` (свободные слоты зала) |
| `slot_overfull` | ячейка heatmap fill ≥ 90 % 3 недели подряд → `{weekday, hour, pct}` | `add_lesson` `{weekday, hour}` |

## Задача 2. Бэк: GET /analytics/utilization/slot (~0:45)

Тот же файл. `?weekday=1&hour=10&date_from&date_to[&фильтры]` → занятия
этого слота за период:
`[{"id", "date", "name", "teacher_name", "hall", "occupied", "total_spots", "status"}]`
— drilldown ячейки heatmap.

## Задача 3. Схемы (~0:30)

`back/schemas/analytics/reports.py`: `UtilizationKpi`, `HeatmapCell`,
`LessonSliceRow`, `ChronicLowRow`, `HallUtilRow`, `UtilizationRead`,
`SlotLessonRow`.

## Задача 4. Фронт: ScheduleTab с heatmap (~3:15)

**Слой:** фронт → `Reports/components/tabs/ScheduleTab.tsx`
(+ `tabs/schedule/Heatmap.tsx`, `tabs/schedule/SlicesCards.tsx`).

- API: `getUtilization(params)`, `getSlotLessons(weekday, hour, params)`;
  ключи `report('schedule', paramsKey)`, `report('schedule-slot', …)`.
- **KPI-ряд** — 5 × `KpiStat`; «упущенная выручка» — `fmtMoney`, формула в
  InfoHint (`formulas.lost_revenue`).
- **Heatmap** — CSS grid (НЕ библиотека): колонки пн–вс, строки — часы
  рабочего окна студии (min/max час из данных); цвет ячейки — от нейтрального
  фона ДС к персиковому `#F9A08B` по `fill_pct` (5 ступеней, не непрерывный
  градиент — читаемость), пустой слот — прозрачный с пунктиром; в ячейке —
  `fill_pct`. Тултип кита: занятий/посещений/заполняемость. **Клик** →
  `DrilldownModal` со списком занятий слота; строка → журнал на день
  занятия. Легенда ступеней под картой. Тёмная тема — те же токены.
- **SlicesCards** — 4 карточки: самые прибыльные, самые заполненные,
  хроническая низкая загрузка (строка = сигнал: «Стретчинг · пн 10:00 ·
  24 % · 4 нед» + кнопки [Перенести]/[Отменить] → `open_journal`),
  загрузка залов (прогрессбары + «вечерний простой N %»).
- **InsightsPanel** — рядом с heatmap.
- `toCsvRows()` = ячейки heatmap (weekday, hour, lessons, fill_pct) +
  строки chronic_low.

## Задача 5. Финальная зачистка отчётов (~0:30)

- Удалить из `back/routers/analytics/reports.py` эндпоинты `/trainers` и
  `/services` + их схемы и методы `analytics.api.ts` — предварительно
  подтвердить grep'ом, что после R1–R4 их никто не зовёт (Дашборд использует
  только summary/series/activity/tasks/reviews).
- Grep по `Reports/`: ни одного `useReportData`, ни одной русской строки вне
  `t()`, ни одного `₽`-хардкода.
- Обновить `docs/TZ/STATUS.md` (раздел Отчёты: реальные данные, 5 вкладок) и
  строку очереди миграции в `front/src/api/queryKeys.ts` (Отчёты — мигрированы).

**Критерии приёмки R5:** ячейка heatmap = журнал этого слота (ручная сверка
2–3 ячеек); упущенная выручка пересчитывается при смене периода; кнопки
Перенести/Отменить приводят в журнал на нужное занятие; фильтр по залу
сужает heatmap и срезы; CSV скачивается; ru/en; без F5; build+lint зелёные.
