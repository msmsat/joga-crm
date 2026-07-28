# EPIC 1 — Layout Branding, Hover Effects & Localization

**Цель:** каркас (Sidebar + Navbar + DashboardLayout) не содержит ни одного
русского литерала и ни одной строки-заглушки. Название студии и данные
пользователя приходят из глобального кэша и обновляются без F5. Пилюля профиля
ощущается кликабельной.

**Зависимости:** нет. **Оценка ~3:20.** Только фронт — бэкенд и схема БД не
меняются.

---

## Контекст: полная опись нарушений

### Захардкоженные строки

| Файл | Строки | Что |
|---|---|---|
| `layouts/DashboardLayout.tsx` | 21-36 | `ROUTE_META` — 14 пар «заголовок + подзаголовок» раздела. **Модульная константа** → на `languageChanged` не реагирует |
| `components/ui/Sidebar.tsx` | 54 | `Velora CRM` (бренд) |
| `components/ui/Sidebar.tsx` | 56 | `Studio Pro · Пилатес центр` — **выдуманное название студии** |
| `components/ui/Sidebar.tsx` | 62, 68, 75, 81, 88, 95, 102, 109, 116, 124, 142, 148 | 12 пунктов меню |
| `components/ui/Sidebar.tsx` | 135 | бейдж `NEW` |
| `components/ui/Sidebar.tsx` | 159-160 | `Журнал` / `Расписание занятий` |
| `components/ui/Sidebar.tsx` | 165-166 | `АМ` / `admin@velora.studio` — **выдуманный пользователь** |
| `components/ui/Navbar.tsx` | 374 | `+ Создать` |
| `components/ui/Navbar.tsx` | 209 | `Enter` / `Esc` — служебные подсказки клавиш, **не переводятся** (названия клавиш на клавиатуре) |

AI-часть Navbar (`chat.navbarPlaceholder`, `chat.thinkingAnswer`,
`chat.continueInChat`, `chat.charCount`) уже локализована через неймспейс
`ai` — **не трогаем**.

### Заглушки вместо данных

| Место | Показывает | Должно брать из |
|---|---|---|
| `Sidebar.tsx:56` | `Studio Pro · Пилатес центр` | `GET /settings/general` → `name` (кэш `queryKeys.studioSettings`) |
| `Sidebar.tsx:165` | `АМ` | `GET /auth/me` → `name` + `last_name` → `getInitials()` |
| `Sidebar.tsx:166` | `admin@velora.studio` | `GET /auth/me` → `email` |

Счётчик клиентов (`Sidebar.tsx:42-47`) — единственное место каркаса, где данные
уже реальные, но взяты «мимо» кэша (`useState` + `useEffect` + прямой вызов
API). В скоуп эпика не входит: работает, дублирования не создаёт — помечено в
задаче 1 как кандидат на выравнивание.

### Слабый hover

```css
/* App.css:900-901 — текущее состояние */
.user-pill { … transition: all 0.18s; }
.user-pill:hover { background: var(--bg); }
```

Сайдбар нарисован на `--card` (`#FFFFFF`), `--bg` = `#FDFCFB`. Разница между
покоем и наведением — **1 % яркости**, при этом соседний `.nav-item:hover`
даёт заметную персиковую подсветку. Пилюля читается как неинтерактивный блок.
Плюс `transition: all` анимирует в том числе layout-свойства, и у элемента
**нет `:focus-visible`** — при табуляции фокус не виден вообще.

---

## Backend

**Изменений нет. Миграции не создаются, схема БД не меняется.**

Оба источника данных уже работают:

| Эндпоинт | Роутер | Доступ | Отдаёт |
|---|---|---|---|
| `GET /settings/general` | `back/routers/settings/general.py:25` | `get_studio_context` — **любой участник студии** (не только owner) | `name`, `language`, `currency`, `logo_url`, … |
| `GET /auth/me` | `back/routers/auth/*` | `get_current_user` | `name`, `last_name`, `email`, `role`, … |

Важно: `PATCH /settings/general` — owner-only (`require_role("owner")`), а
`GET` — нет. Значит брендинг сайдбара корректно отрисуется и у администратора,
и у тренера.

---

## Frontend API & State

### Задача 1. Данные каркаса из глобального кэша (~0:30)

**Новых контекстов и стор не заводим.** Источник правды уже есть — кэш
TanStack Query. Нужны два тонких хука-читателя.

**1.1. Расширяем существующий `front/src/hooks/useStudioCurrency.ts`**

В файле уже объявлен ровно тот `useQuery`, который нужен каркасу — просто
наружу отдаётся одно поле. Выносим сам запрос, `useStudioCurrency` становится
однострочником над ним:

```ts
import { useQuery } from '@tanstack/react-query'
import { settingsApi } from '../api/settings/settings.api'
import { queryKeys } from '../api/queryKeys'

// Настройки студии — один закэшированный запрос на всё приложение.
// Ключ studioSettings общий с useGeneralSettings(): сохранение в Настройках
// делает setQueryData по нему же → каркас перерисовывается без F5.
export function useStudioSettings() {
  return useQuery({
    queryKey: queryKeys.studioSettings,
    queryFn: () => settingsApi.getGeneral(),
    staleTime: 5 * 60 * 1000,
  })
}

export function useStudioCurrency(): string | undefined {
  return useStudioSettings().data?.currency ?? undefined
}
```

Имя файла оставляем как есть: `useStudioCurrency` импортируют ~37 файлов,
переименование ради косметики — 37 правок импортов и ноль пользы.

**1.2. Новый `front/src/hooks/useMe.ts`**

```ts
import { useQuery } from '@tanstack/react-query'
import { authApi } from '../api/auth/auth.api'
import { queryKeys } from '../api/queryKeys'

// Профиль текущего пользователя. Ключ me уже занят Настройками
// (useSecurity.ts) — читаем тот же кэш, второго запроса не появляется.
export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: () => authApi.getMe(),
    staleTime: 60_000,
  })
}
```

Тем же коммитом `Settings/hooks/useSecurity.ts:22-26` заменяет свой инлайновый
`useQuery` на `useMe()` — иначе через месяц у двух копий разойдётся
`staleTime`.

> **Почему не JWT.** Email лежит в токене (`sub`), и его можно было бы достать
> как `getUserRoleFromToken` достаёт роль. Но имени и фамилии в токене нет, а
> они нужны на инициалы аватара — один запрос закрывает оба поля. Два разных
> источника под одну пилюлю — гарантированное расхождение после смены имени в
> профиле.

**Ключи `queryKeys.ts` не добавляем** — `studioSettings` и `me` уже там
(строки 58 и 105).

> Счётчик клиентов в сайдбаре (`useState` + `useEffect`, строки 42-47) на
> фоне этих хуков выглядит наследием. Переезд на `useQuery` — отдельная
> маленькая задача, в этот эпик не берём: он ничего не ломает и не мешает.

### Задача 2. Zero F5: язык студии применяется на входе (~0:20)

`i18n.ts:88` стартует с `lng: 'en'`. Язык студии применяет только мутация
сохранения (`useGeneralSettings.ts:28-30`) — на обычном логине его не
применяет никто. Владелец с `language: 'ru'` видит английский каркас.

Один эффект в корне каркаса, ровно там, где настройки студии всё равно
читаются:

```tsx
// DashboardLayout.tsx
const { data: studio } = useStudioSettings();

// Язык студии из БД → i18next. Мутация в Настройках уже зовёт
// changeLanguage сама; это — для входа в приложение и смены студии.
useEffect(() => {
  if (studio?.language && studio.language !== i18n.language) {
    i18n.changeLanguage(studio.language);
  }
}, [studio?.language]);
```

Эффект живёт **только** в `DashboardLayout` (единственный корень каркаса), а
не в хуке: `useStudioSettings()` вызывается из десятков компонентов, побочный
эффект внутри него сработал бы на каждом монтировании.

Итоговый контур реактивности:

```
PATCH /settings/general  ──> qc.setQueryData(studioSettings)   [useGeneralSettings]
                                        │
                    ┌───────────────────┴───────────────────┐
                    ▼                                       ▼
        Sidebar: название студии                 DashboardLayout: useEffect
        (перерисовка подпиской Query)            → i18n.changeLanguage(lang)
                                                            │
                                                            ▼
                                          languageChanged → useTranslation()
                                          перерисовывает Sidebar + Navbar
```

Ни перезагрузки, ни инвалидации соседних ключей: смена названия студии
перерисовывает сайдбар, смена языка — весь каркас.

---

## Frontend UI & Components

### Задача 3. Неймспейс `menu` (~0:40)

**Файлы уже существуют и пусты** (0 байт):
`front/src/locales/ru/menu.json`, `front/src/locales/en/menu.json`.
Заполняем их; новый неймспейс не заводим.

**Регистрация** в `front/src/i18n.ts` — по образцу `dashboardRU`/`dashboardEN`:
импорт + строка в `resources.ru` **и** в `resources.en`. Пропустить `en`
нельзя: дефолт `lng: 'en'` покажет голые ключи.

Пункт меню и заголовок раздела — один и тот же текст («Дашборд» в сайдбаре и
«Дашборд» в шапке), поэтому ключ **один** (`nav.*`), а отдельно живут только
подзаголовки (`subtitles.*`). Это убирает 14 дублирующихся строк на язык.

```jsonc
// front/src/locales/ru/menu.json
{
  "brand": {
    "product": "Velora CRM"
  },
  "nav": {
    "dashboard": "Дашборд",
    "staff": "Сотрудники",
    "catalog": "Каталог",
    "clients": "Клиенты",
    "reports": "Отчёты",
    "booking": "Онлайн-запись",
    "finances": "Финансы",
    "notifications": "Уведомления",
    "loyalty": "Лояльность",
    "ai": "Velora AI",
    "settings": "Настройки",
    "billing": "Тариф и оплата",
    "journal": "Журнал",
    "profile": "Профиль"
  },
  "subtitles": {
    "dashboard": "Добро пожаловать в Velora CRM",
    "staff": "Управление командой",
    "catalog": "Студии, залы и услуги",
    "clients": "База клиентов студии",
    "reports": "Аналитика и статистика",
    "booking": "Управление каналами записи",
    "finances": "Счета, операции, документы",
    "notifications": "Каналы и типы оповещений",
    "loyalty": "Программы и карты клиентов",
    "ai": "Умный ассистент и автоответы",
    "settings": "Конфигурация системы",
    "billing": "Управление подпиской",
    "journal": "Расписание занятий",
    "profile": "Аккаунт и настройки"
  },
  "badge": {
    "new": "NEW"
  },
  "navbar": {
    "create": "Создать"
  },
  "tooltips": {
    "studioName": "Ваша студия: {{name}}",
    "openProfile": "Открыть профиль"
  }
}
```

`en/menu.json` — те же ключи (`"dashboard": "Dashboard"`,
`"billing": "Plan & billing"`, `"subtitles.dashboard": "Welcome to Velora CRM"`
и т. д.).

Про `brand.product`: `Velora CRM` — торговая марка и не переводится, но ключ
всё равно заводим — чтобы в каркасе не осталось ни одного литерала и чтобы
написание бренда правилось в одном месте.

Плюс `+` у кнопки «Создать» уезжает из строки в разметку (`+ {t('navbar.create')}`)
— знак не является текстом и не должен попадать в словарь.

### Задача 4. `ROUTE_META` → карта ключей (~0:30)

Сейчас `DashboardLayout.tsx:21-36` хранит **готовые русские строки** в
модульной константе. Даже после подключения i18n такая константа не
перерисуется на смену языка: она вычисляется один раз при импорте модуля.

Константа превращается в карту «путь → ключ раздела», текст резолвится в
рендере:

```tsx
// DashboardLayout.tsx
const ROUTE_KEY: Record<string, string> = {
  '/dashboard': 'dashboard',
  '/dashboard/staff': 'staff',
  '/dashboard/catalog': 'catalog',
  '/dashboard/clients': 'clients',
  '/dashboard/reports': 'reports',
  '/dashboard/booking': 'booking',
  '/dashboard/finances': 'finances',
  '/dashboard/notifications': 'notifications',
  '/dashboard/loyalty': 'loyalty',
  '/dashboard/ai': 'ai',
  '/dashboard/settings': 'settings',
  '/dashboard/billing': 'billing',
  '/dashboard/journal': 'journal',
  '/dashboard/profile': 'profile',
};

export default function DashboardLayout() {
  const { t } = useTranslation('menu');
  const location = useLocation();
  const routeKey = ROUTE_KEY[location.pathname.replace(/\/$/, '')] ?? 'dashboard';
  …
  <Navbar title={t(`nav.${routeKey}`)} subtitle={t(`subtitles.${routeKey}`)} />
```

`useMemo` вокруг двух обращений к объекту не нужен — он был там ради строк,
а не ради вычислений. Контракт `NavbarProps` (`title`/`subtitle`: `string`)
не меняется: Navbar по-прежнему получает готовый текст, просто теперь он
пересобирается при `languageChanged` (перерисовку инициирует
`useTranslation` в Layout).

### Задача 5. Динамический брендинг сайдбара (~0:40)

Иерархия остаётся прежней и усиливается: **логотип продукта — главный акцент,
название студии — аккуратная подпись под ним.**

```tsx
// components/ui/Sidebar.tsx
const { t } = useTranslation('menu');
const { data: studio } = useStudioSettings();

<div className="sidebar-logo">
  <div className="logo-name">
    <span className="logo-dot" />
    {t('brand.product')}
  </div>
  {studio?.name && (
    <Tooltip content={t('tooltips.studioName', { name: studio.name })} side="bottom">
      <div className="studio-badge">{studio.name}</div>
    </Tooltip>
  )}
</div>
```

Пока запрос не разрешился — подпись **не рендерится вовсе**. Скелетон под
одну строку в 11.5px не нужен, а фолбэк-текст вернул бы ту самую заглушку,
которую эпик убирает.

`Tooltip` — из кита (`components/ui/index`), потому что длинное название
студии обрезается многоточием и целиком читается только в подсказке. Свой
поповер не пишем (§5 CLAUDE.md).

**Стили — правка одного правила в `App.css:883`** (`.logo-sub` больше не
используется и удаляется, вместо него):

```css
/* Название студии под логотипом: подпись, а не второй логотип.
   Все цвета — токены, поэтому работает и в тёмной теме. */
.studio-badge {
  display: inline-block;
  max-width: 100%;
  margin-top: 6px;
  padding: 2px 8px;
  border-radius: 6px;
  background: rgba(252, 174, 145, 0.10);   /* та же подсветка, что у .nav-item:hover */
  color: var(--text2);
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.1px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

Пропорция: логотип 18px/800 vs подпись 11.5px/600 — по размеру, весу и цвету
(`--text` против `--text2`) название студии однозначно читается как
подчинённый уровень.

### Задача 6. Пилюля профиля: реальные данные + «классный» hover (~0:40)

**Данные:**

```tsx
// components/ui/Sidebar.tsx
const { data: me } = useMe();

<NavLink to="/dashboard/profile" className="user-pill" style={{ textDecoration: 'none' }}>
  <div className="user-avatar">{getInitials(me?.name ?? '', me?.last_name)}</div>
  <div className="user-email">{me?.email ?? ''}</div>
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="6 9 12 15 18 9" />
  </svg>
</NavLink>
```

`getInitials(name, lastName)` уже написан
(`pages/dashboard/Clients/utils/mapClient.ts:9`) и переиспользуется —
второй реализации инициалов в проекте быть не должно. Импортируем по месту;
переезд хелпера в `lib/` — отдельная уборка, не условие этой задачи.

**Hover — на существующих токенах, без новых зависимостей и без JS.**
`transition` у элемента уже объявлен, палитра наведения уже задана соседним
`.nav-item:hover`, тень — токен `--shadow`. Правим `App.css:900-903`:

```css
.user-pill {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  /* было transition: all — анимируем только то, что не двигает layout */
  transition: background 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease;
}

.user-pill:hover {
  background: rgba(252, 174, 145, 0.10);   /* язык наведения из .nav-item:hover */
  transform: translateY(-1px);              /* лёгкая левитация — как у карточек ДС */
  box-shadow: var(--shadow);
}

/* Аватар подхватывает наведение всей пилюли — жест ощущается цельным */
.user-avatar { transition: transform 0.18s ease; }
.user-pill:hover .user-avatar { transform: scale(1.06); }

/* Нажатие «приземляет» элемент обратно — тактильная обратная связь */
.user-pill:active { transform: translateY(0); box-shadow: none; }

/* Клавиатурный фокус: сейчас его не видно вообще */
.user-pill:focus-visible {
  outline: none;
  background: rgba(252, 174, 145, 0.10);
  box-shadow: 0 0 0 3px rgba(249, 160, 139, 0.28);
}

@media (prefers-reduced-motion: reduce) {
  .user-pill, .user-avatar { transition: none; }
  .user-pill:hover, .user-pill:hover .user-avatar { transform: none; }
}
```

Почему именно так, а не `framer-motion`: элемент — обычная ссылка с уже
работающим CSS-переходом, анимировать нечего кроме двух свойств. Тянуть в
каркас JS-анимацию ради `translateY(-1px)` — плата рантаймом за то, что
браузер делает бесплатно.

---

## Definition of Done

- [ ] `grep -nP '[А-Яа-яЁё]' front/src/components/ui/Sidebar.tsx front/src/components/ui/Navbar.tsx front/src/layouts/DashboardLayout.tsx` → только комментарии, ни одной строки в JSX.
- [ ] `grep -n 'Studio Pro\|admin@velora\|>АМ<' front/src` → пусто.
- [ ] `front/src/locales/{ru,en}/menu.json` непустые, набор ключей идентичен, оба зарегистрированы в `i18n.ts` (`resources.ru` и `resources.en`).
- [ ] Переключение языка в Настройках перерисовывает **сайдбар и шапку** без F5 (ни одна строка каркаса не собирается вне рендера).
- [ ] Смена названия студии в Настройках меняет подпись под логотипом без F5 (общий ключ `queryKeys.studioSettings`).
- [ ] Вход в приложение под студией с `language: 'ru'` показывает русский каркас сразу, без захода в Настройки.
- [ ] Пилюля профиля показывает реальные инициалы и email текущего пользователя; при неразрешённом запросе — пустые значения, не заглушки.
- [ ] Наведение на пилюлю: персиковая подсветка + подъём + тень; `Tab` до пилюли даёт видимое кольцо фокуса; при `prefers-reduced-motion` движения нет.
- [ ] Длинное название студии (40+ символов) обрезается многоточием, не ломает ширину сайдбара и целиком видно в тултипе.
- [ ] Тёмная тема: логотип, подпись студии и пилюля читаются — цвета взяты из токенов, хардкод-hex в новых правилах отсутствует.
- [ ] Роли: администратор и тренер видят название своей студии (GET `/settings/general` доступен любому участнику) и свой набор пунктов меню.
- [ ] `cd front && npm run build && npm run lint` — чисто в файлах каркаса.

## Границы эпика

- `alert('Создать новую запись')` (`Navbar.tsx:20`) остаётся заглушкой:
  локализуется надпись кнопки, поведение — зона Журнала.
- `Enter` / `Esc` в AI-строке (`Navbar.tsx:209`) не переводятся — это подписи
  физических клавиш.
- Счётчик клиентов в сайдбаре не переезжает на `useQuery` — работает, ничего
  не дублирует, отдельная маленькая уборка.
- Логотип-картинка студии (`logo_url`), сворачивание сайдбара и мобильная
  раскладка — в [`docs/BACKLOG`](../BACKLOG/README.md).
