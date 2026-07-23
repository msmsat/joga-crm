# EPIC D1 — Локализация, валюта и запрет «-»

**Цель:** ни одного хардкод-`₽`, ни одного захардкоженного русского текста в
UI Обзора, ни одного `'—'` при отсутствии данных. Язык и символ валюты берутся
из глобального стейта (i18next + студийная валюта).

**Зависимости:** D5 (форматируем данные из квери). **Оценка: ~2:00.** Только фронт.

---

## Контекст (что чиним)

- [`Overview/constants.ts:12`](../../front/src/pages/dashboard/Overview/constants.ts#L11) —
  `formatMoney` хардкодит `₽`.
- [`useOverviewData.ts:104`](../../front/src/pages/dashboard/Overview/hooks/useOverviewData.ts#L104) —
  `value: s ? formatMoney(s.revenue) : '—'` (и ещё 3 метрики) → «-» при `null`.
- Все подписи (`Задачи на сегодня`, `задач осталось`, `Нет данных за период`,
  `Загрузка данных…`, `Обзор студии доступен только владельцу`) — строки в TSX.

## Frontend — Задача 1. Валюта из стейта (~0:30)

**Источник валюты — готовый хук.** `useStudioCurrency()`
([`front/src/hooks/useStudioCurrency.ts`](../../front/src/hooks/useStudioCurrency.ts))
возвращает ISO-код валюты студии (`'RUB'`/`'USD'`/…), уже закэшированный в общем
`queryClient`. Ничего искать/добавлять не нужно — вызвать в компоненте/хуке Обзора.

> В проекте уже есть `getCurrencySymbol()` в `components/UI.tsx` — но он даёт
> только символ. Нам нужно и форматирование (K/M, разрядность) → `Intl` по
> ISO-коду из `useStudioCurrency()` (ponytail: не плодим третий форматтер).

**Файл:** `front/src/pages/dashboard/Overview/constants.ts` —
`formatMoney(rub)` → `formatMoney(rub, currency, locale)`:

```ts
// symbol — из стейта студии; locale — i18n.language ('ru'|'en')
export function formatMoney(amount: number, currency = 'RUB', locale = 'ru'): string {
  // Intl сам ставит символ и разрядность по валюте+локали.
  // Компактная запись (K/M) — через notation:'compact'.
  return new Intl.NumberFormat(locale, {
    style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1,
  }).format(amount);
}
```

> `Intl.NumberFormat` — нативный. Никакой библиотеки форматирования валют не
> добавляем (ponytail: платформа уже умеет K/M-компакт и символ валюты).

**Прокидывание.** `const currency = useStudioCurrency() ?? 'RUB'` и
`const { i18n } = useTranslation()` (локаль = `i18n.language`) — в компоненте,
который форматирует деньги (`MetricsRow`/`AnalyticsChart`), либо прокинуть в
`metrics`-мемо хука. `BAR_COLORS`/`formatTrend` не трогаем (тренд — `%`,
локаль-независим, но стрелки `↑/↓` оставить).

## Frontend — Задача 2. i18n namespace `dashboard` (~1:00)

**Файлы:** создать `front/src/locales/ru/dashboard.json` и
`front/src/locales/en/dashboard.json`; зарегистрировать namespace в
[`front/src/i18n.ts`](../../front/src/i18n.ts) (по образцу `bookingRU`/`bookingEN` —
импорт + строка в `resources.ru`/`resources.en`).

Ключи (минимум):

```jsonc
// ru/dashboard.json
{
  "tasks": { "title": "Задачи", "remaining": "{{count}} осталось",
             "done": "Выполнено", "add": "Добавить задачу", "noData": "Нет задач" },
  "chart": { "noData": "Нет данных за период", "retentionNA": "График по удержанию недоступен",
             "week": "Нед.", "month": "Мес.", "year": "Год" },
  "state": { "loading": "Загрузка…", "ownerOnly": "Обзор студии доступен только владельцу",
             "empty": "Нет данных" },
  "metrics": { "revenue": "Выручка за месяц", "clients": "Активных клиентов",
               "bookings": "Записей за месяц", "retention": "Уровень удержания" }
}
```

`en/dashboard.json` — те же ключи, английские значения.

**Применение.** В компонентах Обзора (`Overview.tsx`, `AnalyticsChart.tsx`,
`TodayTasksWidget.tsx`, `MetricsRow`) заменить строковые литералы на
`const { t } = useTranslation('dashboard')` → `t('tasks.title')` и т.д.
`METRIC_PRESENTERS.title` — вынести в `metrics.*` ключи (в презентере оставить
`id`, титул резолвить через `t('metrics.'+id)`).

## Frontend — Задача 3. Запрет «-» → `0` / «Нет данных» (~0:45)

**Файл:** `useOverviewData.ts`, `metrics`-мемо (после D5 берёт `summary.data`,
раньше — строки `101-110`). Убрать `'—'`. Правило: числовые метрики при
отсутствии данных → `0`-эквивалент, не прочерк:

```ts
const cell = {
  revenue:   { value: formatMoney(s?.revenue ?? 0, currency, locale),
               change: formatTrend(s?.trends.revenue_pct ?? null) },
  clients:   { value: String(s?.active_clients ?? 0), ... },
  bookings:  { value: String(s?.bookings ?? 0), ... },
  retention: { value: `${Math.round(s?.retention ?? 0)}%`, ... },
};
```

`formatTrend(null)` сейчас возвращает `'—'` — это тренд-плейсхолдер «нет базы для
сравнения», он **допустим** (аудит про пустые данные метрики, не про отсутствие
тренда). Оставить, но проверить визуально, что он не читается как «пустое поле».

Списки (`events`, `tasks`, `series`) при пустоте → локализованный
`t('state.empty')`/`t('tasks.noData')`, а не пустой контейнер.

## State

Стейта-менеджера нет и не вводим. `formatMoney` получает `currency/locale`
аргументами из хука; хук читает их из существующего студийного контекста.

## Definition of Done

- `grep -n "₽" front/src/pages/dashboard/Overview` → ничего (кроме, возможно,
  тестовых данных).
- `grep -rn "'—'" front/src/pages/dashboard/Overview/hooks` → ничего.
- Переключение языка (RU↔EN) в UI переводит все подписи Обзора без F5.
- Валюта студии `USD`/`EUR` → символ и разрядность меняются автоматически.
- `cd front && npm run build && npm run lint` — чисто.
