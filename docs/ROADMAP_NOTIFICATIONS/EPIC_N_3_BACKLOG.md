# Эпик N-3 — Страница Уведомлений: 3 канала, чистка ролей, Zustand + React Query, i18n

Цель простыми словами: страница показывает только реальные каналы
(Telegram, WhatsApp, Email), каталог событий соответствует ТЗ (у клиента нет
«задолженности», у админа нет «задолженности», но есть «отчёт за день»),
состояние выбора живёт в Zustand, серверные данные — в React Query (без F5),
все тексты — через i18n, все ошибки/успехи — глобальным тостом.

**Важно понимать про старт:**
- Стор `front/src/stores/notificationsStore.ts` уже создан (N-1, задача 5),
  но страница к нему ещё не подключена — это делается здесь.
- Хук `useChannelIntegrations` и модалки подключения уже живут на странице
  (N-2) — их не трогаем, мигрируем только `useNotifications.ts`.
- «Отчёт за день» у админа **уже есть** в каталоге (`a8` в `constants.ts:53`)
  — добавлять не надо, только не удалить случайно.
- Бэкенд не трогаем совсем: PATCH принимает любые `event_id`, лишние ряды
  `c10`/`a5` в БД безвредны — `notify()` без шаблона просто не отправит.
- Страница на CSS Modules + inline-стилях — остаёмся в её стиле (CLAUDE.md
  §5), никакого Tailwind в этих файлах.

**Обозначения сложности:** 🟢 простая · 🟡 средняя · 🔴 сложная, делать внимательно.

---

## Обзор (для Kanban)

| Фаза | № | Задача | Кто делает | Сложность | Время | Статус |
|---|---|---|---|---|---|---|
| 1. Каталог | 1 | Типы и константы: 3 канала, события по ТЗ | Фронтенд | 🟢 | 0:45 | ✅ |
| 1. Каталог | 2 | i18n каталога и всей страницы (ru/en) | Фронтенд | 🟡 | 1:00 | ✅ |
| 2. Состояние | 3 | `useNotifications` → React Query + Zustand | Фронтенд | 🔴 | 1:45 | ✅ |
| 2. Состояние | 4 | Матрица: сохранение через мутации + глобальные тосты | Фронтенд | 🟡 | 1:00 | ✅ |
| 2. Состояние | 5 | Оркестратор: чистка error-плашки, loading, проверка тем | Фронтенд | 🟢 | 0:30 | ✅ |

**Итого по эпику: ~5:00.**

---

## Фаза 1 — Каталог каналов и событий

### 1. Типы и константы: 3 канала, события по ТЗ · 🟢 · 0:45
**Где:** `front/src/pages/dashboard/Notifications/types.ts`, `constants.ts`,
`utils.ts`.
**Что конкретно сделать:**
1. `types.ts`: убрать локальное объявление и взять типы стора — единый
   источник:
   ```ts
   import type { NotifChannel, NotifRole } from '../../../stores/notificationsStore';
   export type ChannelKey = NotifChannel;   // 'telegram' | 'whatsapp' | 'email'
   export type Role = NotifRole;
   ```
   Имена `ChannelKey`/`Role` сохраняем — компоненты страницы не переименовывать.
2. `constants.ts`:
   - `CHANNELS` — оставить три записи: telegram, whatsapp, email (удалить
     instagram, sms, push вместе с их иконками из `NotificationIcons.tsx`,
     если больше нигде не используются);
   - `NOTIF_EVENTS.client` — удалить `c10` («Задолженность по оплате», ТЗ п.8);
   - `NOTIF_EVENTS.admin` — удалить `a5` («Задолженность клиента», ТЗ п.10);
   - порядок ролей не менять: `client` первый (роль по умолчанию, ТЗ п.12).
3. `utils.ts`: в `INITIAL` убрать ключи `push` и id `a5` (строки 7–8) —
   иначе `buildInitialToggles` обратится к несуществующим каналам/событиям.
4. Прогнать `tsc`: сужение `ChannelKey` подсветит все места, где остались
   6-канальные предположения (`DEFAULT_CHANNELS` в хуке, `MiniCheck`,
   ширина колонок в `NotificationMatrix.tsx`) — починить по ошибкам.
**⚠️ Подводные камни:** `Toggles` — `Record<string, Record<ChannelKey,
boolean>>`: старые серверные ряды с `channel_key: "push"` после сужения
типа отфильтрует `mergeToggles` (там уже проверка `ch in result[...]`) —
ничего дополнительно делать не надо.

### 2. i18n каталога и всей страницы (ru/en) · 🟡 · 1:00
**Где:** `front/src/locales/{ru,en}/notifications.json` (созданы в N-2),
`constants.ts`, все компоненты `components/sections/` и `components/ui/`.
**Что конкретно сделать:**
1. Доложить в оба json ключи: `roles.client|trainer|admin|owner`,
   `events.<id>.title` и `events.<id>.desc` для всех оставшихся событий
   (перенести русские тексты из `constants.ts`, написать en), `matrix.save`,
   `matrix.cancel`, `matrix.activeCount`, `loading`, `channels.title`.
2. `constants.ts`: из записей `CHANNELS`/`ROLES`/`NOTIF_EVENTS` удалить поля
   `label`/`title`/`desc` — остаются только `id`, `icon`, `color`, `bg`.
   Тексты рендерят компоненты: `t(\`events.${ev.id}.title\`)`,
   `t(\`roles.${role.key}\`)` (ns `notifications`).
3. Пройти `RolesSelector.tsx`, `NotificationMatrix.tsx`,
   `ChannelsSidebar.tsx`, `Notifications.tsx` — ни одной русской строки
   хардкодом (сейчас «Загрузка…» в `Notifications.tsx:10`).
**⚠️ Подводные камни:** ключи событий должны совпадать с `event_id`
(`events.c1.title`) — это позволит N-4/N-5 не вводить второй словарь.
Названия каналов (Telegram/WhatsApp/Email) — бренды, не переводятся,
оставить в константах.

---

## Фаза 2 — Состояние: React Query + Zustand

### 3. useNotifications → React Query + Zustand · 🔴 · 1:45
**Где:** `front/src/pages/dashboard/Notifications/hooks/useNotifications.ts`.
**Что конкретно сделать:**
1. Удалить ручной `useEffect` + `Promise.all` (строки 20–36) и локальные
   `useState` для `channels`, `activeRole`, `loading`, `error`, `saving`.
2. Серверные данные — два запроса:
   ```ts
   const settingsQ = useQuery({ queryKey: ['notification-settings'], queryFn: notificationsApi.getSettings });
   const togglesQ  = useQuery({ queryKey: ['notification-event-toggles'], queryFn: notificationsApi.getEventToggles });
   ```
3. UI-состояние — из стора (ТЗ п.12):
   `const { activeRole, setActiveRole, channels, setChannel, hydrateChannels } = useNotificationsStore()`;
   при успехе `settingsQ` — `hydrateChannels({ telegram, whatsapp, email })`
   (в `useEffect` по `settingsQ.data`).
4. `toggleChannel(key)`:
   - канал не подключён (статус из `useChannelIntegrations`) и включается →
     не переключать, а открыть модалку подключения (колбэк из N-2);
   - иначе — оптимистично `setChannel(key, next)` + `useMutation(
     notificationsApi.updateSettings)`; `onError` — откат `setChannel` +
     глобальный `useToast`; `onSettled` — `invalidateQueries(['notification-settings'])`.
5. Черновик матрицы (`toggles`/`savedToggles`) остаётся `useState`, но
   инициализируется из `togglesQ.data` через существующий
   `mergeToggles(buildInitialToggles(), data)` (в `useEffect` по данным).
6. `loading = settingsQ.isPending || togglesQ.isPending`; поле `error` из
   возврата хука удалить — ошибки запросов показывает `useToast` в
   `onError`-колбэках, ошибки рендера ловит ErrorBoundary (N-5).
**⚠️ Подводные камни:** не хранить `channels` одновременно в сторе и в
`settingsQ.data`-производных — единственный источник для чекбоксов канала
это стор, query лишь гидрирует его. `DEFAULT_CHANNELS` из хука удалить —
дефолт уже в сторе.

### 4. Матрица: сохранение через мутации + глобальные тосты · 🟡 · 1:00
**Где:** тот же `useNotifications.ts`, `NotificationMatrix.tsx`.
**Что конкретно сделать:**
1. `saveChanges` → `useMutation`:
   `mutationFn: (changes: EventToggle[]) => Promise.all(changes.map(notificationsApi.updateEventToggle))`;
   `onSuccess`: `setSavedToggles(toggles)` +
   `invalidateQueries(['notification-event-toggles'])` + тост успеха;
   `onError`: тост ошибки (черновик не сбрасывать — пользователь дожмёт
   «Сохранить» ещё раз). `saving` = `mutation.isPending`.
2. `diffToggles` уже отдаёт плоский список изменений — не трогать.
3. `NotificationMatrix.tsx`: убедиться, что кнопки «Сохранить»/«Отменить»
   берут подписи из `t('matrix.save')`/`t('matrix.cancel')` и дизейблятся
   на `saving` (Button кита с `loading`, если матрица уже на ките — иначе
   остаться в стиле файла).
**⚠️ Подводные камни:** после `invalidateQueries` придёт свежий
`togglesQ.data` и `useEffect` из задачи 3 перезапишет черновик — это
корректно только когда `isDirty === false`; добавить это условие в эффект,
иначе фоновый рефетч затрёт несохранённые галочки.

### 5. Оркестратор: чистка и проверка · 🟢 · 0:30
**Где:** `front/src/pages/dashboard/Notifications/Notifications.tsx`.
**Что конкретно сделать:**
1. Удалить error-плашку (строки 17–21) — ошибки теперь только тостами
   (ТЗ п.13).
2. Экран загрузки — `t('loading')`, стиль не менять.
3. Ручная проверка светлой и тёмной темы, ru и en; счётчики
   `countActive` считаются по трём каналам.
4. `cd front && npm run build && npm run lint` — зелёные.

---

## Definition of Done эпика

- [x] На странице три канала; у клиента нет «Задолженности», у админа нет
      «Задолженности клиента», «Отчёт за день» на месте.
- [x] Выбранная роль (дефолт — Клиент) и чекбоксы каналов — в Zustand;
      серверные данные — только React Query; локальных error/тост-стейтов нет.
- [x] Изменения каналов и матрицы видны без F5 (оптимистика + инвалидация).
- [x] 100% строк страницы — из `locales/{ru,en}/notifications.json`.
- [x] `npm run build && npm run lint` зелёные **для файлов эпика N-3** (`tsc -b`
      и ESLint по `Notifications/`, `queryKeys.ts` — 0 ошибок). Общий
      `npm run build`/`npm run lint` по всему проекту не зелёный из-за
      предсуществующих несвязанных проблем вне этого эпика (untracked
      `Reports/BreakdownCards.tsx`; ошибки в `Staff/*`, `Settings/*`,
      `NotifIllustration.tsx`) — не входят в scope N-3, не трогались.
