# Эпик FN-1 — Финансы: Core UI, реактивность, локализация

Цель эпика простыми словами: страница ходит на сервер, но живёт на ручных `useState` —
после мутации обновляется только та вкладка, где кликнули, соседние (баланс счёта после
операции, прогресс цели после дохода) требуют F5. Все строки — русский хардкод при
пустом `finances.json`, ₽ вшит в `fmt()`, тексты ошибок в catch выдуманы. Плюс на каждой
вкладке нужна i-кнопка с поповером-описанием.

Источник: аудит от 2026-07-19, блок 1. Все находки проверены по коду — файлы и строки
в задачах. Обзор и стартовая точка — в `ROADMAP.md`.

**Обозначения сложности:** 🟢 простая · 🟡 средняя · 🔴 сложная, делать внимательно.

---

## Обзор (для Kanban)

| № | Задача | Кто делает | Сложность | Время |
|---|---|---|---|---|
| 1.1 | `finances.json` (ru+en): раздел целиком через `t()` | Фронтенд | 🔴 | 3:30 |
| 1.2 | Валюта студии вместо `fmt()` с вшитым ₽ | Фронтенд | 🟢 | 0:45 |
| 1.3 | TanStack Query во всех вкладках + матрица инвалидации (No-F5) | Фронтенд | 🔴 | 4:00 |
| 1.4 | Реальные тексты ошибок API через `errorMessage()` | Фронтенд | 🟢 | 1:00 |
| 1.5 | `InfoHint`: i-кнопка с Apple-style поповером на каждой вкладке | Фронтенд | 🟡 | 2:00 |

**Итого по эпику: ~11:15.**

---

### 1.1 `finances.json` (ru+en): раздел целиком через `t()` · 🔴 · 3:30
**Простыми словами:** словарь `front/src/locales/{ru,en}/finances.json` уже создан —
и пуст. Ни один из ~20 файлов раздела не импортирует `useTranslation`: названия вкладок
(`FINANCE_TABS` в `types.ts`), все заголовки, кнопки, статусы («Выплачено», «Подписан»,
«Ожидает подписи»), плейсхолдеры, тосты — русский хардкод.
**Где:** `front/src/locales/{ru,en}/finances.json`; регистрация в `front/src/i18n.ts`
(по образцу `clients`, строки 10, 17, 27, 35); строки в `Finances.tsx`, всех 9 вкладках
`components/tabs/*.tsx`, `components/ui/ConfirmModal.tsx`, `constants.ts`, `types.ts`.
**Что конкретно сделать:**
1. `front/src/locales/ru/finances.json` + `en/finances.json` → заполнить по секциям на
   вкладку (`tabs.*`, `accounts.*`, `operations.*`, `salaries.*`, `counterparties.*`,
   `documents.*`, `gateways.*`, `methods.*`, `reports.*`, `goals.*`, `common.*`);
   зарегистрировать неймспейс `finances` в `front/src/i18n.ts`.
2. `front/src/pages/dashboard/Finances/types.ts` → `FINANCE_TABS` перевести на ключи
   (`accounts | operations | salaries | …`), тип `Tab` — от ключей; подписи в таббаре
   `Finances.tsx:63` — `t('finances:tabs.<key>')`. `TAB_ICONS` мапить по ключу.
3. Каждая вкладка → `useTranslation('finances')`, все строки через `t()`. Отдельно
   не забыть: статус-мапы (`statusMeta` в `DocumentsTab.tsx:48`,
   `priorityLabels` в `GoalsTab.tsx:115`, `rateTypeLabel` в `SalariesTab.tsx:10`,
   пилюли «Выплачено/Ожидает» `SalariesTab.tsx:118`), тексты всех тостов и
   `ConfirmModal` (`GoalsTab.tsx:323`).
4. Даты: `toLocaleDateString('ru-RU', …)` (`DocumentsTab.tsx:18`) →
   `i18n.language`; `toLocaleString('ru-RU')` в money-форматере — см. задачу 1.2.
5. `TYPE_OPTIONS` контрагентов (`CounterpartiesTab.tsx:12`) — value оставить серверным
   («Юр. лицо» хранится в БД строкой — бэк не трогаем), label через `t()`.
**Готово, когда:** на en-локали в разделе нет ни одной русской строки, включая тосты,
подтверждения и даты; сборка чистая.

### 1.2 Валюта студии вместо `fmt()` с вшитым ₽ · 🟢 · 0:45
**Простыми словами:** `export const fmt = (n) => '₽' + …` (`constants.ts:3`) импортируют
все вкладки; в `ReportsTab.tsx:149-152` и лейблах форм («Сумма, ₽») знак вшит ещё раз.
Решение то же, что в Клиентах (CL-1.2): символ из настроек студии через кэш-квери.
**Где:** `front/src/pages/dashboard/Finances/constants.ts:3`; все импорты `fmt`;
`front/src/pages/dashboard/Catalog/hooks/useStudioCurrency.ts`;
`getCurrencySymbol` (`front/src/components/UI.tsx:482`).
**Что конкретно сделать:**
1. `constants.ts` → `fmt(n)` заменить на `formatMoney(n, symbol)`; символ в компонентах —
   `useStudioCurrency()` + `getCurrencySymbol` (хук уже кэширует `studioSettings`,
   один запрос на приложение).
2. Хук лежит в чужой странице — перенести файл в `front/src/hooks/useStudioCurrency.ts`
   и поправить импорты Каталога/Клиентов/Лояльности (механический move, поведение 1-в-1).
3. Лейблы «Сумма, ₽» в формах (`GoalsTab.tsx:183,246`, форма операции) → символ из хука.
**Готово, когда:** у студии с валютой $ в разделе нигде нет ₽.

### 1.3 TanStack Query во всех вкладках + матрица инвалидации (No-F5) · 🔴 · 4:00
**Простыми словами:** каждая вкладка сама делает `financesApi.*` в `useEffect` и патчит
локальный `useState` (`AccountsTab.tsx:44`, `OperationsTab.tsx:61`, `GoalsTab.tsx:34`,
`SalariesTab.tsx:31`, `DocumentsTab.tsx:38`, `CounterpartiesTab.tsx:39`). Следствие:
создал операцию → баланс на «Счетах» старый до F5; выплатил зарплату → «Операции» не
знают о расходе; смена вкладки перезагружает всё с нуля. Это фундамент эпика — делать первым.
**Где:** `front/src/api/queryKeys.ts`; все 6 «живых» вкладок; `front/src/api/queryClient.ts`
уже настроен.
**Что конкретно сделать:**
1. `front/src/api/queryKeys.ts` → добавить: `finAccounts`, `finOperations(filters)` +
   `finOperationsAll` (префикс), `finCounterparties`, `finDocuments`, `finGoals`,
   `finSalaries(periodStart, periodEnd)`; обновить комментарий-реестр.
2. Каждая вкладка → `useQuery` на чтение (loading/error из квери, ручные `loading`-стейты
   удалить), `useMutation` на изменения. Локальные патчи `setXxx(prev => …)` удалить.
3. Матрица инвалидации (главное в задаче):
   - мутации **операций** (create/delete, позже patch из FN-2) → `finOperationsAll`,
     `finAccounts` (баланс), `finGoals` (авто-прогресс), `finCounterparties` (balance/deals);
   - мутации **счетов** → `finAccounts`, `finOperationsAll` (имя счёта в строках);
   - **выплата зарплаты** → `finSalaries(...)`, `finOperationsAll`, `finAccounts`, `finGoals`;
   - мутации **контрагентов** → `finCounterparties`, `finDocuments` (имя в строке документа);
   - мутации **документов** → `finDocuments`; **целей** → `finGoals`.
4. Переход «Счета → Операции» по клику (`AccountsTab` `onNavigateToOperations`) оставить
   как есть — это UI-стейт, не кэш.
**Готово, когда:** сценарий «создал операцию на Операциях → перешёл на Счета» показывает
новый баланс без F5; повторное открытие вкладки — мгновенно из кэша.

### 1.4 Реальные тексты ошибок API через `errorMessage()` · 🟢 · 1:00
**Простыми словами:** все catch глушат ошибку и показывают выдуманный текст:
`catch { showToast('Не удалось сохранить счёт', 'error') }` (`AccountsTab.tsx:78` и ещё
~15 мест). Бэк при этом отдаёт осмысленный `detail` («Счёт не найден», «Зарплата за этот
период уже выплачена» — `salary.py:117`). Хелпер уже есть и используется Каталогом/Лояльностью.
**Где:** `front/src/api/errorMessage.ts`; все catch-блоки вкладок (после 1.3 — колбэки
`onError` мутаций).
**Что конкретно сделать:** в каждом `onError` → `showToast(errorMessage(e, t('finances:…fallback')), 'error')`;
фолбэки — из словаря 1.1.
**Готово, когда:** повторная выплата зарплаты показывает тост с текстом 409 от сервера,
а не «Не удалось выплатить зарплату».

### 1.5 `InfoHint`: i-кнопка с Apple-style поповером на каждой вкладке · 🟡 · 2:00
**Простыми словами:** на каждом подразделе нужна аккуратная SVG-кнопка «i», по клику —
поповер с коротким описанием вкладки: пружинная анимация появления (scale+fade от кнопки,
`cubic-bezier(0.34,1.56,0.64,1)` — как у модалок кита), закрытие по клику мимо и Esc.
Компонент общий (правило кита), внедряем только в Финансах.
**Где:** новый `front/src/components/ui/InfoHint.tsx`; экспорт из
`front/src/components/ui/index.ts` + строка в таблицу кита в `CLAUDE.md`;
шапки 9 вкладок `Finances/components/tabs/*.tsx`.
**Что конкретно сделать:**
1. `components/ui/InfoHint.tsx` → пропсы `title`, `text`, `side?`; кнопка 24px с inline-SVG
   «i» (не эмодзи), поповер ониксовый в стиле `Tooltip`, стрелочка к кнопке; анимация
   входа/выхода, Esc и клик-мимо закрывают. Никаких новых зависимостей.
2. Экспортировать из `components/ui/index`; в каждую вкладку — рядом с заголовком/первым
   блоком; тексты — ключи `finances:info.<tab>` (ru+en) из словаря 1.1.
**Готово, когда:** на каждой вкладке есть i-кнопка, поповер открывается с анимацией
ровно у кнопки, тексты переведены, компонент доступен из кита.
