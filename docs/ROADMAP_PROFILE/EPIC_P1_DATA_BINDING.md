# EPIC P1 — Real Data Binding & Profile Management

**Цель:** на странице не остаётся ни одного выдуманного человека. Личные
данные живут в общем кэше `queryKeys.me` и обновляются без F5, секция
«Связанные аккаунты» показывает реальные студии пользователя, локальные
копии компонентов кита удалены.

**Зависимости:** нет. **Блокирует:** эпик P2. **Оценка: ~3:30.**

> Новых эндпоинтов эпик не создаёт. Новых таблиц и колонок — тоже,
> Alembic не запускается.

---

## User Stories

- **Как пользователь** я вижу в профиле своё настоящее имя, фамилию,
  email и телефон — те же, что в шапке и в Настройках.
- **Как пользователь** я правлю имя и телефон, жму «Сохранить» и вижу
  изменение сразу — и в профиле, и в остальных разделах, без
  перезагрузки страницы.
- **Как пользователь, состоящий в нескольких студиях,** я вижу их список
  в профиле и переключаюсь на другую в один клик.
- **Как пользователь** я не вижу поля, правка которого ничего не меняет.

---

## Задача 1. Удалить локальные копии кита (~0:30) — ✅ Done

Нарушение §5 CLAUDE.md: страница носит собственные `Toast` и `Input`.

**Удалить:**
- `front/src/pages/dashboard/Profile/components/ui/Toast.tsx`
- `front/src/pages/dashboard/Profile/components/ui/PremiumInput.tsx`

**Заменить:**

| Было | Стало |
|---|---|
| локальный `<Toast message={toastMsg} />` + `triggerToast()` + `useState<string\|null>` + `setTimeout` в `Profile.tsx:15-20` | `const toast = useToast()` из `components/ui/index`; `toast.success(...)` / `toast.error(...)` |
| `<PremiumInput label value onChange type />` | `<Input label value onChange type />` из `components/ui/index` (`components/ui/modal/Input.tsx`: те же пропсы + `error`, `disabled`, `onBlur`) |

`triggerToast` уходит из сигнатур `useAccounts(triggerToast)` и
`useProfileForm(triggerToast)` — хуки берут `useToast()` сами, как это
сделано в `Settings/hooks/useSecurity.ts`.

**Стили.** `Profile.module.css` — удалить правила `.premiumInputGroup`,
`.floatLabel`, `.premiumInput` (использовались только удалённым
`PremiumInput`). Остальные классы (`.page`, `.grid`, `.accCard`,
`.accAction`, `.addAccountBtn`, `.spinAnim`) остаются.

**Проверка:** `grep -rn "PremiumInput\|Profile/components/ui/Toast" front/src` → пусто.

---

## Задача 2. Личные данные → TanStack Query + фамилия + честный email (~1:00) — ✅ Done

### Что не так сейчас

`useProfileForm` держит форму в `useState`, грузит через `useEffect` и
после сохранения **не трогает `queryKeys.me`** — а на этом ключе висит
вкладка «Безопасность» Настроек (`Settings/hooks/useSecurity.ts:22`).
Сменил имя в профиле → в Настройках старое до F5. Плюс поле email
редактируется, хотя `ProfileUpdate` его не принимает, и нет фамилии,
хотя бэк её принимает.

### Структуры данных (обе стороны уже совпадают — менять нечего)

```python
# back/schemas/auth/requests.py:93 — как есть
class ProfileUpdate(BaseSchema):
    name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    tg_id: Optional[int] = None
```

```ts
// front/src/api/auth/auth.types.ts:68 — как есть
export interface UserMe {
  name: string; last_name: string | null; email: string | null
  phone: string | null; tg_id: number | null
  is_onboarded: boolean; studio_id: number | null
  role: string | null; two_fa_enabled: boolean
}
```

Эндпоинты **уже написаны**, правки не требуют:

| Метод | Путь | Файл | Возвращает |
|---|---|---|---|
| GET | `/auth/me` | `back/routers/auth/profile.py:29` | `UserMe` |
| PATCH | `/auth/me` | `back/routers/auth/profile.py:37` | `UserMe` (обновлённый) |

> Почему PATCH, а не PUT: тело — частичное (`exclude_unset=True`), форма
> шлёт только изменённые поля. Менять глагол ради формальности значит
> ломать `Settings` и `Onboarding`, которые уже зовут PATCH.

### Фронт

**`front/src/pages/dashboard/Profile/types.ts`** — `UserInfo` приводится
к бэкенду (§8 CLAUDE.md), email убирается из редактируемых:

```ts
export interface UserInfo {
  name: string
  last_name: string
  phone: string
}
```

**`front/src/pages/dashboard/Profile/constants.ts`** — `emptyUserInfo`
дополняется `last_name: ''`; `initialAccounts` **удаляется** (задача 3).

**`front/src/pages/dashboard/Profile/hooks/useProfileForm.ts`** — целиком
на Query:

```ts
const qc = useQueryClient()
const toast = useToast()
const { t } = useTranslation('profile')

const { data: me, isLoading } = useQuery({
  queryKey: queryKeys.me,
  queryFn: () => authApi.getMe(),
  staleTime: 60_000,          // тот же staleTime, что в useSecurity — один кэш на двоих
})

// Черновик формы: пока пользователь не тронул поле — показываем серверное значение.
const [draft, setDraft] = useState<Partial<UserInfo>>({})
const userInfo: UserInfo = {
  name:      draft.name      ?? me?.name ?? '',
  last_name: draft.last_name ?? me?.last_name ?? '',
  phone:     draft.phone     ?? me?.phone ?? '',
}

const save = useMutation({
  mutationFn: () => authApi.updateMe({
    name: userInfo.name,
    last_name: userInfo.last_name || null,
    phone: userInfo.phone || null,
  }),
  onSuccess: (updated) => {
    // Ответ PATCH — это готовый UserMe: кладём его в кэш вместо повторного GET.
    qc.setQueryData(queryKeys.me, updated)
    setDraft({})               // черновик слит с сервером — дальше показываем кэш
    toast.success(t('toasts.infoSaved'))
  },
  onError: (err) => toast.error(errorMessage(err, t)),
})
```

**Zero F5:** `queryKeys.me` читают и профиль, и Настройки → `setQueryData`
обновляет обе страницы мгновенно, без инвалидации и без повторного
запроса.

**`components/sections/PersonalInfoForm.tsx`:**
- поля: Имя, Фамилия (в одну строку, grid 1fr 1fr), Email, Телефон;
- **Email — `<Input disabled>`** с подписью-объяснением под полем
  (`t('personalInfo.emailLocked')`), значение из `me.email`. Кит уже
  поддерживает `disabled` (`ui/modal/Input.tsx:11`);
- кнопка «Сохранить» — `Button` из кита (`variant="primary"`,
  `loading={save.isPending}`), локальный `<button>` со `spinnerSvg`
  удаляется вместе с константой `spinnerSvg`;
- пока `isLoading` — поля `disabled`, чтобы не терять ввод при
  подстановке серверных значений.

### i18n (`front/src/locales/{ru,en}/profile.json`)

```jsonc
"personalInfo": {
  "heading": "Личные данные",
  "emailLocked": "Email — логин аккаунта, его нельзя изменить здесь"   // NEW
}
```

Email и телефон уже берутся из общего `common:fields.*`. Поле было одно
(`common:fields.fullName` — «Полное имя»), стало два → в
`locales/{ru,en}/common.json` рядом с `fullName` добавляются
`firstName` («Имя») и `lastName` («Фамилия»); `fullName` остаётся — им
пользуются Сотрудники и Клиенты.

### Проверка

- Сменить имя → перейти в Настройки → «Безопасность» показывает новое
  имя без перезагрузки.
- Перезагрузить страницу → значение сохранилось (`PATCH` дошёл до БД).
- Email недоступен для ввода; в БД он и не менялся.

> **Пропущено намеренно:** проверка занятости телефона через
> `GET /auth/check-phone` (эндпоинт существует). Добавить, если появятся
> жалобы на дубликаты телефонов между аккаунтами — это `onBlur` + `error`
> у `Input`, ~15 минут, но сейчас это решение чужой задачи.

---

## Задача 3. «Связанные аккаунты» → реальные студии (~1:30) — ✅ Done

> Отступление от плана: `UserAccount` (удаляемый этой задачей) также
> использовался в `ActiveSessionCard.tsx`, который в постановке относится
> к эпику P2. Чтобы не оставить страницу несобираемой между эпиками,
> `ActiveSessionCard` переведён на тот же `queryKeys.me` (уже наполнен
> Задачей 2) без добавления устройства/браузера — эту часть, как и
> задумано, довносит P2, Задача 2.

### Решение

Отдельной сущности «связанный аккаунт» в БД нет (см. п. 3 «Расхождений» в
[00_ROADMAP_OVERVIEW.md](00_ROADMAP_OVERVIEW.md)). Реально переключаемая
сущность — **студия**, и весь механизм уже написан и работает на
`/select-crm`. Секция подключается к нему.

**Эндпоинты — существующие, не трогаем:**

| Метод | Путь | Возвращает |
|---|---|---|
| GET | `/auth/studios` | `StudioListItem[]` = `{id, name, role, logo_url, is_current, members_count, clients_count}` |
| POST | `/auth/select-studio` | `TokenResponse` — новый JWT с `studio_id`/`role` выбранной студии |

### Фронт

**`hooks/useAccounts.ts`** — переписывается (мок + `setTimeout` уходят):

```ts
const { data: studios = [], isLoading } = useQuery({
  queryKey: queryKeys.workspaces,          // ключ уже заведён, тот же, что у SelectCrm
  queryFn: () => authApi.getStudios(),
})

const select = useMutation({
  mutationFn: (studioId: number) => authApi.selectStudio(studioId),
  onSuccess: (data) => {
    if (data.access_token) localStorage.setItem('token', data.access_token)
    qc.clear()          // кэш набит данными прошлой студии — иначе пользователь увидит чужие
    navigate('/dashboard')
  },
  onError: (err) => toast.error(errorMessage(err, t)),
})
```

Логика один в один как в [SelectCrm.tsx:27-37](../../front/src/pages/SelectCrm.tsx#L27) —
это осознанное повторение 8 строк мутации, а не общий хук: вытаскивать
их в `useSelectStudio` имеет смысл при третьем месте использования.

**`components/sections/LinkedAccounts.tsx`** — разметка остаётся
(`.accCard`, `.accCardActive`, `.accAction`, `.addAccountBtn` уже
написаны и выглядят правильно), меняется источник:

| Было (мок) | Стало (`StudioListItem`) |
|---|---|
| `acc.name` (ФИО) | `studio.name` (название студии) |
| `acc.email` | `t('staff:roles.' + studio.role)` + `t('settings:workspace.membersCount', {count})` |
| `acc.active` | `studio.is_current` |
| `acc.color` → инициалы на цветном фоне | `studio.logo_url` через `resolveImageUrl()`, fallback — инициалы на персиковом (как `StudioCard`) |
| `navigate('/register')` на «Создать новую» | `navigate('/onboarding?new=1')` — создание доп. студии тем же мастером |

Пустой список (0 студий физически невозможен для вошедшего, но
`isLoading`/ошибка — да): спиннер при загрузке, `EmptyState` из кита при
ошибке с кнопкой «Повторить».

**`types.ts`** — интерфейс `UserAccount` удаляется, вместо него
`StudioListItem` из `api/auth/auth.types`.

**Zero F5:** после `select` кэш чистится и приложение уходит на
`/dashboard` с новым токеном — данные новой студии подтягиваются сами.
Список студий (`queryKeys.workspaces`) обновляется автоматически, так как
после `qc.clear()` он перезапрашивается при следующем открытии профиля.

### i18n

Переиспользуем существующий неймспейс `settings` (там уже есть
`workspace.*` для `/select-crm`) — в `profile.json` меняются только
заголовок и счётчик:

```jsonc
"accounts": {
  "title": "Мои студии",                       // было «Связанные аккаунты»
  "count": "{{count}} студия",                 // ru: с плюрализацией _few/_many
  "enter": "Перейти",
  "createNew": "Создать новую студию"
}
```

Обновить обе локали (`ru`, `en`). Роли — `staff:roles.*`, как уже
сделано в `ActiveSessionCard.tsx:39`.

### Проверка

- Аккаунт с одной студией: одна карточка с меткой «Текущая», клик по ней
  ничего не делает.
- Аккаунт с двумя (`sadomat31@gmail.com`): клик по второй → `/dashboard`
  показывает данные второй студии; название студии в сайдбаре сменилось.
- `grep -rn "initialAccounts\|UserAccount" front/src` → пусто.

---

## Задача 4. Локализация: добить остатки (~0:30) — ✅ Done

Неймспейс `profile` уже подключён (`i18n.ts:7,23,42,59`) и почти вся
страница через `t()`. Остаётся:

1. Свести новые ключи задач 1–3 в `ru/profile.json` и `en/profile.json`
   **одной правкой в обоих файлах** — расхождение ключей между локалями
   даёт пустые строки в UI, а не ошибку сборки.
2. `toasts.logoutAll` / `toasts.switchedAs` — переформулировать под новую
   реальность (переключение студии, а не аккаунта); `toasts.logoutAll`
   удаляется в эпике P2 вместе с кнопкой.
3. Ошибки мутаций — только через `errorMessage(err, t)`
   (`api/errorMessage.ts`), никаких `error.message` в JSX: серверные
   `detail` приходят по-русски и мимо локали.

**Проверка:** переключить язык на English — на странице не остаётся
русских слов; `grep -nE "[а-яА-Я]" front/src/pages/dashboard/Profile/**/*.tsx`
находит только комментарии.

> Отступление: `toasts.switchedAs` и `toasts.infoSaveError` удалены, а не
> переформулированы — после Задач 2–3 у них не осталось ни одного места
> вызова (`select`-мутация не показывает тост при переключении, как в
> эталонном `SelectCrm.tsx`; ошибка сохранения профиля идёт через
> `errorMessage(err, t)`). Оставлять переименованный, но мёртвый ключ
> смысла не было. `toasts.logoutAll` — живой (кнопка ещё вызывает его),
> переформулирован без слова «аккаунты».

---

## Definition of Done

- [x] `grep -rn "initialAccounts\|PremiumInput\|Profile/components/ui/Toast" front/src` → пусто
- [x] Профиль и вкладка «Безопасность» Настроек показывают одно и то же
      имя без перезагрузки после сохранения (проверено по коду: общий
      `queryKeys.me`, `setQueryData` в `useProfileForm`; живая проверка в
      браузере не выполнялась — см. чат)
- [x] Фамилия сохраняется и переживает F5; email не редактируется
      (проверено по коду; живой прогон не выполнялся)
- [x] Переключение студии из профиля приводит в `/dashboard` нужной студии
      (логика идентична `SelectCrm.tsx`; живой прогон не выполнялся)
- [x] Ни одной русской строки в JSX; обе локали содержат одинаковый набор ключей
- [x] `cd front && npm run build && npm run lint` — чисто
- [x] Миграции не создавались (`git status back/migrations/versions` — пусто)
</content>
