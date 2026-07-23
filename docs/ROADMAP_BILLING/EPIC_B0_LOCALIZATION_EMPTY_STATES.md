# Epic B0 — Локализация, валюта из стейта, пустые состояния

**Цель:** убрать хардкод `₽` и `ru-RU`, увести все строки Billing в i18n, заменить
дефисы на осмысленный пустой стейт. Основа для B3/B4/B6 — они используют этот контракт.

**Зависит от:** — · **Блокирует:** B3, B4, B6

---

## Frontend API & State

Новых эндпоинтов нет. Правим форматтеры и источник валюты.

### 1. Единый форматтер валюты (валюта из глобального стейта)

Символ валюты берётся из настроек студии (`currency` в онбординге/настройках),
а не хардкодится. Проверить, есть ли уже глобальный хелпер:

```
grep -rn "formatMoney\|formatCurrency\|useCurrency" front/src/
```

- **Если хелпер есть** (например, в `front/src/lib/` или контексте студии) — **переиспользуем его**, свой не пишем (§8, [[feedback_roadmap_scope_one_page]]).
- **Если нет** — создаём `front/src/lib/money.ts`:

```ts
// Валюта — из настроек студии, символ и локаль не хардкодим.
const SYMBOL: Record<string, string> = { RUB: '₽', USD: '$', EUR: '€', KZT: '₸' };
const LOCALE: Record<string, string> = { RUB: 'ru-RU', USD: 'en-US', EUR: 'de-DE', KZT: 'ru-KZ' };

// amount — в основной единице (уже /100). currency — из глобального стейта студии.
export function formatMoney(amount: number, currency = 'RUB'): string {
  return `${SYMBOL[currency] ?? ''}${amount.toLocaleString(LOCALE[currency] ?? 'ru-RU')}`;
}
```

`currency` прокидываем из того же места, откуда его читает остальной дашборд
(контекст студии / настройки). В Billing достаём один раз в `useBillingCalculator`
и передаём в табы пропом `currency`, либо табы сами берут из контекста.

### 2. i18n namespace `billing`

Регистрируем namespace в `front/src/i18n.ts` (рядом с существующими). Словари:

- `front/src/locales/ru/billing.json`
- `front/src/locales/en/billing.json`

Минимальный набор ключей (расширяется в B3/B4):

```json
{
  "tabs": { "plans": "Тарифы", "invoices": "История", "method": "Способ оплаты" },
  "mode": {
    "subscription": "Фиксированная подписка",
    "percent": "% с онлайн-платежей",
    "combo": "Фикс + % комбо"
  },
  "period": { "1": "1 месяц", "6": "6 месяцев", "12": "1 год", "24": "2 года" },
  "empty": {
    "noInvoices": "Счетов пока нет — они появятся после первой оплаты.",
    "noCard": "Карта появится автоматически после первой оплаты.",
    "monthsWithUs": "Вы ещё не купили подписку",
    "noData": "Нет данных"
  },
  "savings": {
    "title": "Ваша экономия",
    "youSave": "Вы экономите {{amount}} за {{months}} мес.",
    "freeMonths": "Это как {{count}} мес. бесплатно"
  },
  "pay": "Оплатить",
  "continuePlan": "Продолжить план"
}
```

В компонентах: `const { t } = useTranslation('billing');` → `t('tabs.plans')`.

### 3. Пустые состояния (запрет «-» и заглушек)

| Место | Сейчас | Стало |
|---|---|---|
| `InvoicesTab.tsx:110` — чек отсутствует | `—` | ссылка на чек всегда есть у `paid` (см. B5); для `pending`/`failed` — `t('empty.noData')` (не тире) |
| «Месяцев с нами» (если блок есть/добавляется) | пусто/`—` | `plan.status === 'none'` → `t('empty.monthsWithUs')` |
| Любая метрика `=== null` | `—` | `0` или `t('empty.noData')` |
| `fmtDate(null)` в `InvoicesTab.tsx:12` | `'—'` | `t('empty.noData')` |

**Правило:** дефис (`—`) как «нет значения» запрещён. Число → `0`, факт → текст.

## Frontend UI & Components

- `PlansTab.tsx`, `InvoicesTab.tsx`, `PaymentMethodTab.tsx`, `SavingsIllustration.tsx`,
  `UpgradeModal.tsx` — заменить каждый инлайн `₽{x.toLocaleString('ru-RU')}` на
  `formatMoney(x, currency)`.
- Заменить хардкод-строки на `t('...')`. Русский текст в JSX остаётся только в `ru/billing.json`.
- Символ валюты в бейджах/слайдерах (`PlansTab.tsx:83,111,118,122,145,170,177,181`) — через `formatMoney`.

## Проверка (§ CLAUDE.md — билд после фазы, [[feedback_check_build_after_phase]])

```
cd front && npm run build && npm run lint
```

Ручной чек: переключить язык RU↔EN — все подписи Billing меняются; сменить валюту
студии — символ во всех суммах меняется; страница без подписки — «Вы ещё не купили
подписку» вместо тире.

> `[замена ₽/ru-RU → formatMoney + t()]` → skipped: авто-детект валюты по геолокации, add when появится мультивалютный биллинг на бэке. Пока валюта = поле студии.
