# EPIC R4 — Вкладка «Команда» (Staff Performance)

**Цель:** у кого потенциал, кто перегружен. Ранжирование НЕ только по
выручке: заполняемость, возвращаемость клиентов, рейтинг, отмены. Таблица
тренеров + детализация по клику.

**Зависимости:** R0. **Оценка: ~6:45.**

---

## Задача 1. Бэк: GET /analytics/team (~2:30)

**Слой:** бэк → `back/routers/analytics/team.py` (новый, в `__init__.py`).

`GET /analytics/team?date_from&date_to[&фильтры]` — база: занятия по
`lesson_conds` (teacher_id not null), выручка — in-операции с `trainer_id`
(честная оговорка как в текущем `/trainers`: выручка без привязки к тренеру
в срез не входит, Σ ≤ Обзора — фиксируется в InfoHint `formulas.team_scope`).

```jsonc
{
  "kpi": {
    "lessons_count":    {"value": ..., "prev_pct": ...},
    "revenue_per_hour": {...},  // Σ in-оп. с trainer_id / Σ(duration_min)/60 неотменённых занятий
    "avg_fill_pct":     {...},  // occupied/capacity по занятиям с тренером
    "cancel_noshow_pct":{...},  // (отменённые занятия + noshow-резервации) / (занятия + резервации)
    "avg_rating":       {...}   // AVG(Reservation.rating) WHERE rating IS NOT NULL
  },
  "trainers": [   // GROUP BY teacher_id, сортировка на фронте
    {"trainer_id": 4, "name": "Анна Юдина",
     "lessons": 46, "fill_pct": 78.2, "attendance": 512, "revenue": 214000,
     "return_rate_pct": 64.0,        // клиенты с ≥2 attended у тренера / с ≥1
     "cancels": 3, "noshows": 11, "rating": 4.8,
     "load_pct": 71.0}               // занятые часы / (часов 9:00–21:00 × рабочих дней периода)
  ],
  "insights": [...]
}
```

`load_pct` — грубая, но честная оценка окна 9–21; формула прямо в InfoHint.

**SQL-правила insights:**

| key | Условие | action |
|---|---|---|
| `high_return_free_evenings` | `return_rate_pct > 60` И доля занятых вечерних слотов (17–21) < 50 % → `{name, return_pct}` | `add_lesson` `{teacher_id}` (журнал, форма с тренером) |
| `trainer_overloaded` | `load_pct > 85` → `{name, load_pct}` | `open_journal` `{teacher_id}` (перераспределить расписание) |
| `low_rating` | `rating < 4.0` при ≥ 10 оценках за период → `{name, rating}` | `open_trainer` `{id}` |

## Задача 2. Бэк: GET /analytics/team/{trainer_id} (~1:15)

Тот же файл. Детализация для дровера:

```jsonc
{
  "revenue_series": [{"period": "...", "value": ...}],      // по неделям
  "load_by_weekday": [{"weekday": 1, "lessons": 9, "fill_pct": 81.0}],
  "top_lessons":    [{"name": "Вечерний пилатес", "held": 12, "attendance": 138, "fill_pct": 92.0}],
  "return_rate_pct": 64.0, "returned_clients": 32, "total_clients": 50
}
```

## Задача 3. Схемы (~0:30)

`back/schemas/analytics/reports.py`: `TeamKpi`, `TrainerRow`, `TeamRead`,
`TrainerDetailRead`. Существующий `TrainerReportRow` не трогаем до зачистки
R5.

## Задача 4. Фронт: TeamTab (~2:30)

**Слой:** фронт → `Reports/components/tabs/TeamTab.tsx`
(+ `tabs/team/TrainersTable.tsx`, `tabs/team/TrainerDrawer.tsx`).

- API: `getTeam(params)`, `getTrainerDetail(id, params)`; ключи
  `report('team', paramsKey)`, `report('team-trainer', id + paramsKey)`.
- **KPI-ряд** — 5 × `KpiStat` (формулы `formulas.revenue_per_hour|
  cancel_noshow|avg_rating|team_scope`).
- **TrainersTable**: Тренер | Занятий | Заполняемость | Посещений | Выручка |
  Возвращаемость | Отмены (+ рейтинг звёздочкой в колонке имени).
  Сортировка по любому столбцу (локальная); дефолт — по возвращаемости
  (принцип «не только выручка» из ТЗ). Мини-прогрессбар в ячейках
  заполняемости/загрузки.
- **TrainerDrawer** (клик по строке): каркас модалки/дровера из кита;
  график выручки по неделям (AreaChart), загрузка по дням недели
  (BarChart), список любимых занятий, блок «возврат клиентов после него»
  (N из M, %); кнопка «Открыть профиль» → страница сотрудника.
- **InsightsPanel** — под KPI.
- `toCsvRows()` = строки TrainersTable в текущей сортировке.
- Снести `TabTrenery.tsx`.

**Критерии приёмки R4:** цифры по тренеру совпадают с его профилем в
Сотрудниках (та же выручка/занятия за период); сортировка не сбрасывается
при обновлении данных; дровер открывается < 300 мс из кэша при повторном
клике; noshow/отмены сходятся с журналом; CSV = таблица; ru/en; без F5.
