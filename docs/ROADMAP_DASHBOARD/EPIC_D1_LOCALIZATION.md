# EPIC D1 — Локализация, валюта из стейта и запрет «-»

**Цель:** на странице Обзора не остаётся ни одного захардкоженного русского
литерала, ни одного хардкод-`₽`, ни одного `'—'` вместо данных. Язык и валюта
берутся из глобального стейта (i18next + студийные настройки), смена — без F5.

**Зависимости:** [D5](EPIC_D5_REALTIME_STATE.md) (форматируем данные из квери).
**Оценка ~2:00.** Только фронт.

---

## Контекст: полная опись нарушений

### Хардкод валюты

| Файл | Что |
|---|---|
| `Overview/constants.ts:11-15` | `formatMoney(rub)` — литерал `₽` в трёх ветках |
| `AnalyticsChart.tsx:28` | тултипы баров через `formatMoney` |
| `SummaryWidgets.tsx:57,62,66,71` | выручка / расходы / средний чек / прибыль |
| `useOverviewData.ts:104` | метрика «Выручка» |

### Пустые состояния «-»

| Файл | Что |
|---|---|
| `useOverviewData.ts:104-107` | `'—'` во всех 4 метриках при `summary === null` |
| `constants.ts:19` | `formatTrend(null) → '—'` |
| `SummaryWidgets.tsx:57,62,66,71` | `summary ? … : '—'` ×4 |

### Захардкоженные строки (namespace `dashboard` в i18next отсутствует)

| Файл | Строки |
|---|---|
| `Overview.tsx:15,23` | «Загрузка данных…», «Обзор студии доступен только владельцу» |
| `constants.ts:4-7` | 4 заголовка метрик |
| `MetricCard.tsx:65` | «Подробнее ↗» |
| `AnalyticsChart.tsx:11-16,41-43,49,53` | «по неделям/по месяцам», «Последние 8 недель/месяцев/12 месяцев», «Нед./Мес./Год», «График по удержанию недоступен», «Нет данных за период» |
| `AnalyticsChart.tsx:22` | `toLocaleDateString('ru-RU', …)` — **локаль прибита гвоздями** |
| `TodayTasksWidget.tsx:14-16,19-42,119,122,167,196,233,264,305` | заголовок, счётчик, «Выполнено», подписи приоритетов, теги, плейсхолдер, кнопки |
| `RecentEventsBoard.tsx:14,20` | «Последние события», «Смотреть все →» |
| `SummaryWidgets.tsx:17,19,34,36,53,56,61,65,70` | заголовки карточек, «Нет данных», подписи строк |
| `EventCard.tsx:6-12,88,96,104,112` | относительное время («мин. назад», «дн. назад»), пункты меню |

### Прочие дефекты отображения, всплывшие при разборе

- `MetricCard.tsx:71` — `className="stat-change up"`: класс роста **прибит**,
  падение метрики красится как рост.
- `TodayTasksWidget.tsx:19-42` — теги задач (`Клиент`, `Финансы`, `Лиды`,
  `Отчёты`, `Журнал`, `Персонал`) одновременно и ключи палитры, и значения в БД
  (`StudioTask.tag`, `String(50)`). Переводить надо **на отображении**, значение
  в БД оставить каноническим — иначе понадобится миграция данных.

> 🚧 **Граница эпика.** `ActivityLog.title` пишется в БД готовой русской фразой
> (`back/activity.py:20`) — лента событий останется на языке записи. Перевод
> потребовал бы event-key + params во **всех** вызовах `log_activity` по проекту:
> это не задача страницы Обзора → кандидат в
> [`docs/BACKLOG`](../BACKLOG/README.md). В этом эпике локализуется только
> **обвязка** карточки (относительное время, меню действий).

---

## Backend

Изменений нет. Валюта и язык студии уже отдаются существующим
`GET /settings/general` → `{ language: string, currency: string, … }`
(`back/routers/settings/general.py`, тип — `front/src/api/settings/settings.types.ts:4-5`).

---

## Frontend API & State

### Задача 1. Валюта из глобального стейта (~0:30)

**Никаких новых форматтеров и библиотек** — в проекте уже есть всё:

| Что нужно | Готовое решение | Файл |
|---|---|---|
| ISO-код валюты студии | `useStudioCurrency()` — один закэшированный `useQuery` (`staleTime 5 мин`) на всё приложение | `front/src/hooks/useStudioCurrency.ts` |
| Символ по коду | `getCurrencySymbol(code)` | `front/src/components/UI.tsx:482` |
| Формат числа по языку | `fmtMoney` / `fmtPct` / `fmtInt` | `front/src/lib/format.ts` |

**Единственное дополнение** — компактная форма (карточки метрик показывают
`284K`, а не `284 000`). Дописываем в **общий** `lib/format.ts`, а не в
`Overview/constants.ts`:

```ts
/** Компактные деньги для плиток: «284K ₽», «1.2M ₽». Символ — из настроек студии. */
export function fmtMoneyCompact(n: number, symbol = '₽'): string {
  const locale = LOCALE[i18n.language] ?? 'ru-RU';
  const value = new Intl.NumberFormat(locale, {
    notation: 'compact', maximumFractionDigits: 1,
  }).format(n);
  return `${value} ${symbol}`;
}
```

`Intl.NumberFormat` с `notation: 'compact'` — нативная платформа: сама даёт
`284 тыс.` для `ru` и `284K` для `en`. Библиотеку форматирования валют не ставим.

**Удалить** `formatMoney` из `Overview/constants.ts` (строки 10-15) и заменить все
её вызовы на `fmtMoneyCompact(value, currencySymbol)`.

**Прокидывание символа:**

```ts
// в useOverviewData (D5) — рядом с квери
const currencySymbol = getCurrencySymbol(useStudioCurrency());
```

Дальше символ либо участвует в `buildMetrics` (готовые строки метрик), либо
отдаётся наружу из хука и прокидывается пропом в `AnalyticsChart` и
`SummaryWidgets` — как это уже сделано в Отчётах (`KpiStat`, проп `currencySymbol`).

### Задача 2. Запрет «-» → `0` / «Нет данных» (~0:45)

**Правило страницы:**

| Ситуация | Что показываем |
|---|---|
| Числовая метрика без данных | `0` в правильном формате (`0 ₽`, `0`, `0 %`) — **никогда** прочерк |
| Тренд без базы для сравнения (`*_pct === null`) | чип тренда **не рендерится вообще** (не «—», не «0 %») |
| Пустой список (события, задачи, услуги, тренеры) | локализованная фраза `t('state.empty')` / `t('tasks.empty')` |
| Пустой ряд графика | `t('chart.noData')` (уже есть, только перевести) |

**Файл:** `useOverviewData.ts`, сборщик метрик (в D5 вынесен в `buildMetrics`):

```ts
function buildMetrics(s: PeriodSummary | null, symbol: string, t: TFunction): MetricConfig[] {
  const cell: Record<MetricConfig['id'], { value: string; changePct: number | null }> = {
    revenue:   { value: fmtMoneyCompact(s?.revenue ?? 0, symbol), changePct: s?.trends.revenue_pct        ?? null },
    clients:   { value: fmtInt(s?.active_clients ?? 0),           changePct: s?.trends.active_clients_pct ?? null },
    bookings:  { value: fmtInt(s?.bookings ?? 0),                 changePct: s?.trends.bookings_pct       ?? null },
    retention: { value: `${Math.round(s?.retention ?? 0)}%`,      changePct: s?.trends.retention_pct      ?? null },
  };
  return METRIC_PRESENTERS.map(p => ({ ...p, ...cell[p.id], title: t(`metrics.${p.id}`) }));
}
```

**`MetricConfig` меняет контракт** (`Overview/types.ts`): вместо предформатированной
строки `change: string` — сырой `changePct: number | null`. Так карточка сама
решает, рисовать ли чип и каким цветом:

```ts
export interface MetricConfig extends MetricPresenter {
  value: string;
  changePct: number | null;   // было: change: string
}
```

`formatTrend` из `constants.ts` **удаляется** — её роль забирает `fmtPct` из
`lib/format.ts` (уже даёт знак и локаль).

---

## Frontend UI & Components

### Задача 3. Namespace `dashboard` (~1:00)

**Новые файлы:** `front/src/locales/ru/dashboard.json`, `front/src/locales/en/dashboard.json`.

**Регистрация** в `front/src/i18n.ts` — по образцу `reportsRU`/`reportsEN`:
импорт + строка в `resources.ru` и `resources.en`. **Обе** — иначе при `lng: 'en'`
(дефолт в `i18n.ts:78`) страница молча покажет ключи.

```jsonc
// front/src/locales/ru/dashboard.json
{
  "state": {
    "loading": "Загрузка данных…",
    "ownerOnly": "Обзор студии доступен только владельцу",
    "empty": "Нет данных",
    "error": "Не удалось загрузить данные",
    "retry": "Повторить"
  },
  "metrics": {
    "revenue": "Выручка за месяц",
    "clients": "Активных клиентов",
    "bookings": "Записей за месяц",
    "retention": "Уровень удержания",
    "more": "Подробнее"
  },
  "chart": {
    "byWeek": "по неделям",
    "byMonth": "по месяцам",
    "subWeek": "Последние 8 недель",
    "subMonth": "Последние 8 месяцев",
    "subYear": "Последние 12 месяцев",
    "tabWeek": "Нед.",
    "tabMonth": "Мес.",
    "tabYear": "Год",
    "noData": "Нет данных за период",
    "retentionNA": "График по удержанию недоступен"
  },
  "tasks": {
    "title": "Задачи",
    "remaining_one": "{{count}} задача осталась",
    "remaining_few": "{{count}} задачи осталось",
    "remaining_many": "{{count}} задач осталось",
    "done": "Выполнено",
    "empty": "Задач нет",
    "add": "Добавить задачу",
    "namePlaceholder": "Название задачи…",
    "cancel": "Отмена",
    "submit": "Добавить",
    "priority": { "low": "Низкий", "medium": "Средний", "high": "Высокий" },
    "priorityHint": { "low": "Низкий приоритет", "medium": "Средний приоритет", "high": "Высокий приоритет" },
    "tags": {
      "Клиент": "Клиент", "Финансы": "Финансы", "Лиды": "Лиды",
      "Отчёты": "Отчёты", "Журнал": "Журнал", "Персонал": "Персонал"
    },
    "scope": { "mine": "Мои", "admins": "Админов", "trainers": "Тренеров" },
    "assigneePlaceholder": "Выберите сотрудника"
  },
  "events": {
    "title": "Последние события",
    "seeAll": "Смотреть все",
    "justNow": "только что",
    "openProfile": "Открыть профиль",
    "writeWhatsApp": "Написать в WhatsApp",
    "sendReceipt": "Отправить чек",
    "cancelBooking": "Отменить запись"
  },
  "summary": {
    "topServices": "Топ услуги",
    "trainersLoad": "Нагрузка тренеров",
    "financeMonth": "Финансы (месяц)",
    "revenue": "Выручка",
    "expenses": "Расходы",
    "avgCheck": "Средний чек",
    "profit": "Прибыль"
  }
}
```

`en/dashboard.json` — те же ключи; для английского множественного числа хватает
`remaining_one` / `remaining_other`.

**Ключи `tasks.scope.*` и `tasks.assigneePlaceholder` заводятся здесь**, а
используются в [D4](EPIC_D4_TASKS_WIDGET_REDESIGN.md) — чтобы D4 не открывал
словари повторно.

**Про теги.** Значение `tag` остаётся в БД как есть (`«Клиент»`), рендерится через
`t('tasks.tags.' + tag, { defaultValue: tag })`. `defaultValue` обязателен: тег,
которого нет в словаре (например, созданный вручную), должен показываться как
есть, а не как сырой ключ. Миграции данных не требуется.

### Задача 4. Подстановка `t()` по компонентам (~0:45)

В каждом файле: `const { t } = useTranslation('dashboard')`.

| Файл | Правки |
|---|---|
| `Overview.tsx` | `t('state.loading')`, `t('state.ownerOnly')` |
| `constants.ts` | из `METRIC_PRESENTERS` **убрать** `title` (остаются `id`, `color`, `glow`, `route`); заголовок резолвится в `buildMetrics` через `t('metrics.'+id)` |
| `MetricCard.tsx` | `t('metrics.more')` + иконка-стрелка inline SVG (символ `↗` в тексте оставить допустимо, но перевод — из словаря). **Починить `stat-change`:** `className={\`stat-change ${m.changePct! >= 0 ? 'up' : 'down'}\`}` и рендерить чип только при `changePct !== null` (`fmtPct(changePct)`) |
| `AnalyticsChart.tsx` | `PERIOD_LABEL`/`PERIOD_SUB` → `t('chart.*')`; табы → `t('chart.tabWeek\|tabMonth\|tabYear')`; `barLabel` — `d.toLocaleDateString(i18n.language, …)` вместо `'ru-RU'`; `formatMoney` → `fmtMoneyCompact(v, currencySymbol)` |
| `TodayTasksWidget.tsx` | все литералы → `t('tasks.*')`; счётчик — `t('tasks.remaining', { count: pending.length })`; `PRIORITY_DOT_TITLE`/`PRIORITY_OPTIONS`/`TAG_OPTIONS` строятся внутри компонента из `t`, палитры `PRIORITY_COLOR`/`TAG_COLORS` остаются константами (цвет — не текст) |
| `RecentEventsBoard.tsx` | `t('events.title')`, `t('events.seeAll')` |
| `EventCard.tsx` | пункты меню → `t('events.*')`; `toRelative` → нативный `Intl.RelativeTimeFormat` (см. ниже) |
| `SummaryWidgets.tsx` | заголовки/подписи → `t('summary.*')`; «Нет данных» → `t('state.empty')`; деньги → `fmtMoneyCompact(x ?? 0, symbol)` **без тернарника с `'—'`** |

**Относительное время без словаря** — платформа умеет сама:

```ts
// EventCard.tsx — заменяет ручные «мин. назад / ч назад / дн. назад»
function toRelative(iso: string, locale: string, t: TFunction): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return t('events.justNow');
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (min < 60) return rtf.format(-min, 'minute');
  const h = Math.floor(min / 60);
  return h < 24 ? rtf.format(-h, 'hour') : rtf.format(-Math.floor(h / 24), 'day');
}
```

### Реактивность смены языка

`useTranslation()` подписывает компонент на `languageChanged` — перерисовка
происходит сама, без F5 и без инвалидации кэша. **Важно:** строки, собранные вне
рендера (модульные константы `PERIOD_LABEL`, `TAG_OPTIONS`, `METRIC_PRESENTERS.title`),
на смену языка **не реагируют** — поэтому Задача 4 переносит их внутрь компонентов.
Это не стилистика, а условие работы требования §1 аудита.

---

## Definition of Done

- [ ] `grep -rn "₽" front/src/pages/dashboard/Overview` → пусто.
- [ ] `grep -rn "'—'\|\"—\"" front/src/pages/dashboard/Overview` → пусто.
- [ ] `grep -rn "ru-RU" front/src/pages/dashboard/Overview` → пусто.
- [ ] Переключение языка RU↔EN перерисовывает **все** подписи Обзора без перезагрузки.
- [ ] Студия с валютой `USD` → `$` во всех денежных полях (метрика, тултип бара, сводка).
- [ ] Студия без данных за месяц: метрики показывают `0 ₽ / 0 / 0 / 0 %`, чипы трендов скрыты, списки — «Нет данных».
- [ ] Отрицательный тренд красится как падение (`stat-change down`), а не как рост.
- [ ] `cd front && npm run build && npm run lint` — чисто.
