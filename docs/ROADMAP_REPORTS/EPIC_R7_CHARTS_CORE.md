# EPIC R7 — Charts Core: графики, которые не стыдно показать

**Цель:** убрать все артефакты Recharts (серый квадрат под курсором, чёрная
обводка после клика, текст поверх холста, системные скроллбары), привести
графики к единому премиальному виду и научить их честно рисовать нули.

**Аудит:** пункты 2 (фронт), 6, 7, 8, 9, 13, 21.
**Зависимости:** R6 (полная ось приходит с бэка). **Оценка: ~6:00.**

---

## Корень проблем (найдено в коде)

1. **Серый квадрат при наведении** (аудит 8) — дефолтный `cursor` у
   `<Tooltip>` в Recharts: для `BarChart`/`ComposedChart` это
   `rect fill="#ccc" opacity=0.1` на всю ширину категории. Ни один из четырёх
   графиков его не переопределяет (`OverviewTab.tsx:217`, `SalesTab.tsx:173`,
   `ClientsTab.tsx:178`, `TrainerDrawer.tsx:118`).
2. **Чёрная обводка после клика** (аудит 9) — Recharts v3 вешает на активный
   сектор `activeBar` со `stroke`, а браузер добавляет `:focus`-outline на
   `<path>` внутри SVG после mousedown. Ни `activeBar={false}`, ни сброса
   outline в проекте нет.
3. **Текст поверх графика и скроллбары** (аудит 7, 21) — `.grid-2` в
   `front/src/App.css:924` это `repeat(2, 1fr)` **без `min-width: 0`**. У
   грид-элемента `min-width: auto`, поэтому `ResponsiveContainer` меряет
   ширину больше трека, SVG вылезает за карточку — отсюда и горизонтальный
   скролл при наведении (карточка ещё и приподнимается на `translateY(-2px)`),
   и наложение строк таблицы «No product 14 000 ₽…» на холст.
4. **График из двух точек** (аудит 2) — лечится в R6; здесь остаётся отрисовка
   нулей так, чтобы их было видно (аудит 13).

---

## Tasks

- [x] **1.** Общая тема графиков `chartTheme.ts` + компонент `ChartFrame` — ~1:00
- [x] **2.** Убрать серый курсор-квадрат на всех графиках (аудит 8) — ~0:30
- [x] **3.** Убрать чёрную обводку клика (аудит 9) — ~0:30
- [x] **4.** Починить наложение и скроллбары: `min-width: 0` + рамка холста (аудит 7, 21) — ~1:00
- [x] **5.** Редизайн графика прибыли (аудит 6) — ~1:15
- [x] **6.** Нули видимыми: минимальная свеча + подпись «0» (аудит 13, 2) — ~1:00
- [x] **7.** Прогон всех 6 графиков на данных 1–2 записи — ~0:45

---

## Backend Architecture

Изменений нет — весь бэк закрыт эпиком R6. Единственное требование к данным:
серия приходит полной длины с нулями (см. R6), фронт её не достраивает.

---

## Frontend Architecture

### Задача 1. Единая тема графиков

**Новый файл:** `front/src/pages/dashboard/Reports/components/shared/chartTheme.ts`
— один источник правды для всех Recharts-графиков Отчётов. Сейчас `contentStyle`
тултипа скопирован в 6 местах — copy-paste удаляется.

```ts
export const AXIS_X = {
  tick: { fontSize: 11, fill: 'var(--text3)', fontWeight: 600 },
  axisLine: false, tickLine: false, dy: 6,
} as const;

export const TOOLTIP_STYLE = {
  borderRadius: '12px', border: '1px solid var(--border)',
  fontSize: '12px', background: 'var(--bg-card)',
  boxShadow: '0 8px 24px -4px rgba(26,26,26,0.12)', padding: '8px 12px',
} as const;

// Персиковая подсветка колонки вместо серого квадрата Recharts.
export const BAR_CURSOR = { fill: 'rgba(249,160,139,0.10)', radius: 8 } as const;
// Для area-графиков — тонкая пунктирная вертикаль.
export const LINE_CURSOR = { stroke: '#F9A08B', strokeWidth: 1, strokeDasharray: '4 4' } as const;

export const PEACH = '#F9A08B';
export const PEACH_LIGHT = '#FCAE91';
export const BLUE = '#4A80C4';
export const ROSE = '#D88C9A';
```

**Новый компонент:** `shared/ChartFrame.tsx` — обёртка холста, которая
физически не даёт SVG выйти за карточку:

```tsx
export function ChartFrame({ height = 240, children }: { height?: number; children: React.ReactElement }) {
  return (
    <div style={{ height, minWidth: 0, width: '100%', overflow: 'hidden' }}>
      <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
    </div>
  );
}
```

Все шесть графиков переводятся на `ChartFrame`: `OverviewTab.tsx:201`,
`SalesTab.tsx:167`, `ClientsTab.tsx:173`, `TrainerDrawer.tsx:87` и `:113`.

### Задача 2–3. Курсор и обводка

В каждом `<Tooltip>`: `cursor={BAR_CURSOR}` (Bar/Composed) или `cursor={LINE_CURSOR}`
(Area). В каждом `<Bar>`: `activeBar={false}`.

Плюс глобальный сброс outline — `front/src/App.css`, рядом с `.grid-2`:

```css
/* Recharts v3 после клика оставляет focus-outline на секторе — в дизайне его нет */
.recharts-wrapper :focus,
.recharts-wrapper :focus-visible,
.recharts-surface :focus { outline: none; }
.recharts-rectangle, .recharts-sector { transition: opacity .15s ease; }
```

### Задача 4. Наложение и скроллбары

`front/src/App.css:924`:

```css
.grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
.grid-2 > * { min-width: 0; }   /* иначе Recharts распирает трек и рвёт вёрстку */
```

Это же чинит KPI-ряды `gridTemplateColumns: 'repeat(5, 1fr)'` во всех вкладках.

Дополнительно в `SalesTab.tsx`: карточка графика и `ProductsTable` — соседние
блоки в потоке, между ними `marginBottom: 20px`; убедиться, что таблица не
получает отрицательный отступ и не рендерится внутри `ChartCard`.

**Порядок проверки (аудит 7):** ширина окна 1280 → 1024 → 1440 с открытой
вкладкой «Продажи»; ни при какой ширине строка таблицы не пересекает холст и
`document.documentElement.scrollWidth === clientWidth`.

### Задача 5. График прибыли (аудит 6)

`OverviewTab.tsx`, ветка `MONEY_METRICS`. Сейчас это плоский `Area` с плашкой
`rgba(252,174,145,0.25)` — плоско и не отличает убыток от прибыли.

```tsx
<AreaChart data={chartData} onClick={handleChartClick} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
  <defs>
    <linearGradient id="rpProfitUp" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stopColor={PEACH} stopOpacity={0.38} />
      <stop offset="100%" stopColor={PEACH} stopOpacity={0} />
    </linearGradient>
  </defs>
  <CartesianGrid vertical={false} stroke="rgba(26,26,26,0.05)" />
  <XAxis dataKey="label" {...AXIS_X} interval="preserveStartEnd" minTickGap={16} />
  <YAxis hide domain={[dataMin => Math.min(0, dataMin), 'auto']} />
  <Tooltip cursor={LINE_CURSOR} contentStyle={TOOLTIP_STYLE} formatter={v => fmtMoney(Number(v))} />
  {chartMetric === 'profit' && <ReferenceLine y={0} stroke="var(--border)" strokeWidth={1} />}
  <Area type="monotone" dataKey="value" stroke={PEACH} strokeWidth={2.5}
        fill="url(#rpProfitUp)" fillOpacity={1}
        activeDot={{ r: 4, fill: '#fff', stroke: PEACH, strokeWidth: 2.5 }}
        dot={chartData.length <= 12 ? { r: 2.5, fill: '#fff', stroke: PEACH, strokeWidth: 2 } : false} />
</AreaChart>
```

Что даёт: нулевая линия (прибыль бывает отрицательной — сейчас график этого не
показывает), мягкая горизонтальная сетка вместо пустоты, точки на редких
данных, аккуратный `activeDot`, разрежённые подписи оси на длинных периодах.

### Задача 6. Нули видимыми (аудит 13)

`ClientsTab.tsx` (и любой Bar-график): нулевая колонка сейчас не рисуется
вообще — визуально это «дырка».

```tsx
<Bar dataKey="new" fill={PEACH_LIGHT} radius={[6, 6, 0, 0]} maxBarSize={20}
     minPointSize={3} activeBar={false} cursor="pointer">
  <LabelList dataKey="new" position="top" content={ZeroLabel} />
</Bar>
```

`ZeroLabel` — локальный рендер в `chartTheme.tsx`: показывает «0» подписью
`11px / var(--text3)` **только если значение равно нулю**, иначе не рисует
ничего (иначе подписи забьют весь холст).

Нулевые колонки заливаем приглушённо через `<Cell fill={v ? PEACH_LIGHT : 'rgba(26,26,26,0.06)'}>`
— видно, что слот существует, но данных в нём нет.

---

## Styling & UI/UX

- Акцент графиков — персиковый `#F9A08B` / `#FCAE91`; синий `#4A80C4` только
  как вторая серия (вернувшиеся клиенты, счётчик продаж), розовый `#D88C9A` —
  негатив.
- Радиус колонок 6px, `maxBarSize` 20–28px: колонки не превращаются в плиты на
  коротких периодах.
- Никаких `<Legend>` без нужды: на графике клиентов легенда остаётся (две
  серии), на остальных — нет.
- Анимация: `isAnimationActive` оставляем по умолчанию, но `animationDuration={400}`
  — дефолтные 1500 мс выглядят как лаг на переключении метрики.
- Тултип — карточка кита: `TOOLTIP_STYLE`, значения через `fmtMoney`/`fmtInt`/`%`.

---

## Edge Cases

| Ситуация | Поведение |
|---|---|
| Все точки серии = 0 | Ось рисуется полностью, колонки — серые заглушки с подписью «0»; поверх холста — компактный Empty State (см. R8) |
| Одна ненулевая точка из 30 | Ось на 30 слотов, одна персиковая колонка на своём месте — **не** график из одной точки |
| Прибыль отрицательная | Area уходит под `ReferenceLine y={0}`, домен `[min(0, dataMin), auto]`; заливка убытка — `rgba(216,140,154,0.22)` |
| 90+ точек (год по дням) | `groupForRange` из R6 переключит на недели; если всё же много — `interval="preserveStartEnd"` разрежает подписи, свечи не сжимаются в кашу |
| Клик по пустому слоту | Drilldown не открывается (`if (!value) return` в `handleChartClick`) — модалка с пустой таблицей не нужна |
| Данные ещё грузятся | `placeholderData: prev => prev` уже стоит; предыдущая серия остаётся на экране, никаких скачков высоты |
| Узкий экран (< 900px) | `.grid-2` в один столбец (медиазапрос уже в App.css), `ChartFrame` держит `overflow: hidden` |

---

## Definition of Done

- Наведение на любой график: подсветка колонки персиковая, серого квадрата нет.
- Клик по колонке: открывается drilldown, обводки на колонке не остаётся.
- Продажи при любой ширине окна: текст таблицы не пересекает холст,
  горизонтального скролла страницы нет.
- Период с 1–2 записями: ось полная, нули подписаны, график не «схлопнут».
- `npm run build && npm run lint` зелёные.
