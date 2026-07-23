# EPIC R0 — Фундамент отчётов

**Цель:** каркас, на который встают все 5 вкладок: единые фильтры на бэке,
тулбар с периодом/сравнением/фильтрами/экспортом, общие компоненты
(KPI-карточка, карточка графика, панель «Что делать», модалка детализации),
i18n-неймспейс, Query-ключи.

**Зависимости:** нет (первый). **Оценка: ~6:30.**

---

## Задача 1. Бэк: общий модуль фильтров и периодов (~1:00)

**Слой:** бэк → `back/routers/analytics/_filters.py` (новый).

Всё, что сейчас размазано по `reports.py`, обобщается здесь; `reports.py`
переходит на импорт (поведение 1:1):

```python
@dataclass
class ReportFilters:
    date_from: date; date_to: date
    branch_id: int | None; hall_id: int | None
    trainer_id: int | None; service_id: int | None

def report_filters(  # FastAPI Depends — одинаковые query-параметры у всех эндпоинтов
    date_from: date = Query(...), date_to: date = Query(...),
    branch_id: int | None = None, hall_id: int | None = None,
    trainer_id: int | None = None, service_id: int | None = None,
) -> ReportFilters: ...

def prev_range(f: ReportFilters) -> tuple[date, date]      # прошлый период той же длины (логика из /summary)
def pct(curr: float, prev: float) -> float | None          # переезд _pct из reports.py

def lesson_conds(f, sid) -> list      # Lesson.studio_id, start_time в периоде,
                                      # + hall_id/teacher_id/service_id из фильтров,
                                      # + branch: join Hall.branch_id == f.branch_id
def op_conds(f, sid) -> list          # Operation.studio_id, op_date в периоде,
                                      # + trainer_id/product_id(from service);
                                      # branch/hall к операциям неприменимы — игнор
def noshow_cond()                     # Reservation.status=='active' AND
                                      # Lesson.start_time + make_interval(mins=>duration_min) < now()
def occupied_expr() / capacity_expr() # Σ мест: reservations(active+attended) / Σ Lesson.total_spots
```

Примечание: у операций нет зала/филиала — фильтры branch/hall честно
действуют только на «занятийные» метрики; это фиксируется в InfoHint
(`formulas.filters_scope`), а не замалчивается.

## Задача 2. Фронт: каркас 5 вкладок + тулбар с фильтрами (~2:00)

**Слой:** фронт → `front/src/pages/dashboard/Reports/`.

- `types.ts`: `type Tab = 'overview' | 'sales' | 'clients' | 'team' | 'schedule'`
  (русские строки-типы удаляются); типы ответов API — зеркало Pydantic-схем.
- `constants.ts`: `TABS: Tab[]`, подписи — `t('reports:tabs.<key>')`.
- `hooks/useReportFilters.ts` (замена `useDateRange`): период
  (`day|week|month|year|custom` + произвольный диапазон), фильтры
  (branch/hall/trainer/service). **Состояние — в URL searchParams**
  (`useSearchParams`): ссылку можно шарить, вкладки делят один стейт.
  Отдаёт готовый `params`-объект для API и `paramsKey` (строка для
  Query-ключа).
- `components/ReportsToolbar.tsx` (переработка): вкладки, селектор периода
  + двойной date-input (`<input type="date">`, не своя календарь-библиотека),
  бейдж «vs прошлый период: DD.MM–DD.MM» (диапазон считается на фронте той
  же формулой, что `prev_range`), 4 `Select` из кита для фильтров (данные —
  существующие Query-ключи `branches`, `halls`, `staff`, `services`),
  кнопка «Экспорт» (вызывает `toCsvRows()` активной вкладки → `useExport`).
- `Reports.tsx`: маппинг вкладок; временно `sales`←`TabProdazhi`,
  `team`←`TabTrenery`, `overview`←`TabOsnovnye`, `clients`/`schedule` —
  empty-state «в разработке» (Card + текст из i18n). Старые табы умирают в
  эпиках своих вкладок.

## Задача 3. Общие компоненты вкладок (~1:30)

**Слой:** фронт → `front/src/pages/dashboard/Reports/components/shared/`
(общие по споке, внедряются только на Отчётах — правило аудитов).

| Компонент | Пропсы | Что делает |
|---|---|---|
| `KpiStat.tsx` | `label, value, trendPct, formulaKey, onClick, format: 'money'\|'int'\|'pct'` | Card из кита: значение (`fmtMoney`/число), стрелка ±% к прошлому периоду (пистач/роза), `InfoHint` с `t('reports:formulas.'+formulaKey)`, весь блок кликабелен |
| `ChartCard.tsx` | `title, subtitle, formulaKey, actions?, children` | обёртка графика: заголовок + короткая расшифровка + InfoHint; layout по ДС (radius 16, padding 24+) |
| `InsightsPanel.tsx` | `insights: Insight[]` | «Что требует внимания»: до 3–4 строк «Сигнал → причина → [кнопка]»; текст `t('reports:insights.'+key, params)`; кнопка → `useInsightAction(action, action_params)`; пусто → блок скрыт |
| `DrilldownModal.tsx` | `open, onClose, title, columns, rows, loading, onRowClick?` | ModalShell из кита + простая таблица записей; открывается кликом по точке/столбцу/ячейке/сегменту |
| `hooks/useInsightAction.ts` | — | switch по `action`: `open_clients(filter)` → `/dashboard/clients?...`, `open_client(id)`, `open_campaign(segment)` → Лояльность/сегменты, `add_lesson(prefill)` → журнал c `location.state`, `open_journal(date, hallId)`, `open_trainer(id)` |

## Задача 4. i18n + единый формат денег (~1:00)

**Слой:** фронт.

- `front/src/locales/{ru,en}/reports.json` — новый namespace, регистрация
  там же, где остальные (`i18n`-конфиг). Секции: `tabs`, `toolbar`, `kpi`,
  `formulas` (словарь метрик из ROADMAP.md — дословно), `insights`
  (шаблоны с `{{count}}`, `{{name}}`, `{{pct}}`), `table`, `empty`, `export`.
- `front/src/lib/format.ts` (новый, общий): `fmtMoney(n, symbol)` — рубли
  целыми, `toLocaleString` по языку i18n; `fmtPct(n)`. На Отчётах — только
  он; две старые копии `formatMoney` (Overview, Clients) не трогаем до их
  аудитов, но новых копий не создаём.

## Задача 5. API-слой и Query-ключи (~1:00)

**Слой:** фронт → `front/src/api/analytics/`, `front/src/api/queryKeys.ts`.

- `queryKeys.ts`:
  `report: (tab: string, paramsKey: string) => ['reports', tab, paramsKey] as const`
  и `reportsAll: ['reports'] as const` (префикс).
- `analytics.api.ts`: заготовка `reportQs(filters)` (сериализация
  `ReportFilters` в query string, пустые фильтры не отправляются); методы
  добавляются по эпикам R1–R5.
- `analytics.types.ts`: базовые `Insight { key, severity, params, action,
  action_params }`, `Kpi { value, prev_pct }`.
- Дефолты Query для отчётов: `staleTime: 30_000`, `refetchOnWindowFocus:
  true`, `placeholderData: keepPreviousData` (смена периода без «прыжка» в
  скелетон — старые данные с лёгким dimming, паттерн уже принятый в
  Финансах).

**Критерии приёмки R0:** 5 вкладок с ключами и i18n-подписями; период,
диапазон, 4 фильтра и бейдж сравнения живут в URL; переключение
периода/фильтра дёргает Query (видно по network), билд/линт зелёные.
Старые вкладки продолжают работать на своих местах до замены.
