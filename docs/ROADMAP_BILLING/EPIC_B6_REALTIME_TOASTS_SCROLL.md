# Epic B6 — Реактивность, глобальные тосты/модалки, плавный скролл

**Цель:** закрыть кросс-требования §1 — никаких F5, все ошибки/уведомления через
**глобальные** тосты и модалки кита, плавный скролл «Продолжить план» → секция оплаты.

**Зависит от:** B0 · **Блокирует:** —

**Файлы:** `useBillingCalculator.ts`, `Billing.tsx`, все три таба, `UpgradeModal.tsx`.

---

## 1. Реактивность без F5 (§1)

Сейчас данные грузятся один раз в `useEffect` и «замерзают»; после возврата с оплаты
(`?payment=return`, `useBillingCalculator.ts:44-49`) перезапрашивается только `plan` —
счета и карта остаются старыми.

Доработать `useBillingCalculator`:
- Вынести загрузку в именованные функции `loadPlan()`, `loadInvoices()`, `loadCards()`.
- **После возврата с оплаты** (`paymentReturn`) — дёргать все три, не только `plan`.
- **Refetch по фокусу вкладки** (лёгкая замена поллинга; React Query не вводим, §3.2):

```ts
useEffect(() => {
  const onFocus = () => { loadPlan(); loadInvoices(); loadCards(); };
  window.addEventListener('focus', onFocus);
  document.addEventListener('visibilitychange', onFocus);
  return () => { window.removeEventListener('focus', onFocus);
                 document.removeEventListener('visibilitychange', onFocus); };
}, []);
```

- Любая мутация (`activateModel`, `updateAutopay`, `renew`, `checkout`) кладёт свежий
  объект в стейт (`setPlan/setInvoices`) — UI обновляется мгновенно, без перезагрузки.
- Баннер `Billing.tsx:19-28` уже реагирует на `plan.status` — оставить, он сработает,
  когда вебхук долетит и `loadPlan` по фокусу обновит статус.

> Поллинг по таймеру **не добавляем** — фокус-refetch + возврат с оплаты покрывают сценарии.
> `ponytail:` фокус-refetch, а не polling; добавить интервал, если понадобится live-обновление при открытой вкладке.

## 2. Глобальные тосты и модалки (§1)

Сейчас ошибки глотаются (`.catch(()=>{})` в хуке и табах), тостов нет, `UpgradeModal` —
локальная разметка, не на ките.

- **Тосты:** `const { success, error } = useToast()` (из `components/ui/index`).
  Каждый мутирующий вызов: успех → `success('...')`, ошибка → `error(t('error.generic'))`
  вместо молчаливого `.catch`. Тексты — из i18n (B0), namespace `billing`.
- **Модалки:** `UpgradeModal.tsx` и новая `PaymentMethodModal` (B4) — строго на
  `ModalShell`/`ModalHeader/Body/Footer` из кита (§5). Никаких локальных оверлеев.
- **Подтверждения** (например, смена тарифа с активной подпиской) — `ConfirmModal` кита
  (§5, замена `window.confirm`).
- Убрать все `alert`/`window.confirm`/локальные `div`-оверлеи, если найдутся (`grep`).

## 3. Плавный скролл «Продолжить план» → секция оплаты (§1)

Аудит §1: клик по «Продолжить план» в блоке текущего плана плавно скроллит вниз к секции
оплаты.

- Повесить `id="payment-section"` (или `ref`) на блок «График платежей»/CTA «Оплатить»
  (`PlansTab.tsx:279-312`) — это и есть секция оплаты.
- Кнопка «Продолжить план» (в баннере/блоке текущего плана — добавить, если её нет):

```ts
const scrollToPayment = () =>
  document.getElementById('payment-section')
    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
```

`behavior:'smooth'` — нативный плавный скролл, без библиотек. «Быстро, но плавно» —
нативная кривая подходит; если нужно короче — не тащить lib, оставить нативный.
Уважать `prefers-reduced-motion` (браузер сам приводит к `auto` при системной настройке).

## Frontend API & State

Новых эндпоинтов нет. Меняется только оркестрация в `useBillingCalculator`:
именованные лоадеры, focus-listener, тосты в `.catch`/`.then`, `scrollToPayment`.

## Проверка

```
cd front && npm run build && npm run lint
```

Ручной чек:
- Оплатить в другой вкладке/вернуться по `?payment=return` → история и статус плана
  обновляются **без F5**.
- Свернуть/развернуть вкладку браузера → данные освежаются по фокусу.
- Ошибочный запрос (отключить бэк) → всплывает **глобальный тост об ошибке**, а не тишина.
- «Продолжить план» → страница плавно скроллит к блоку оплаты.

> `[focus-refetch + useToast + scrollIntoView]` → skipped: WebSocket/SSE live-статус платежа — фокус-refetch и возврат с оплаты достаточны. Add when нужен real-time без действий пользователя.
