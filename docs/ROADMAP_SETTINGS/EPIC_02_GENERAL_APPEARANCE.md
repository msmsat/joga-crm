# EPIC 2 — General & Appearance (Основные, Язык и регион, Внешний вид)

**Цель:** данные компании и локаль — из БД и в БД; починить выпадающий
список «Язык и регион»; сохранить настройки интерфейса в профиле
пользователя.

**Зависимости:** эпик 1. **Оценка: ~7:00.**

> Задача 1 — **самая приоритетная во всём роадмапе**: она чинит валюту в
> Каталоге, Клиентах и Лояльности, а не только вкладку Настроек.

---

## User Stories

- **Как владелец** я меняю название, контакты и логотип студии, и они
  сразу видны в шапке, меню и клиентском виджете.
- **Как владелец** я выбираю валюту студии — и цены во всём продукте
  показываются в ней (сейчас не показываются нигде).
- **Как владелец** я открываю выпадающий список, скроллю страницу и
  список остаётся приклеенным к своей кнопке, а не висит посреди экрана.
- **Как пользователь** я выбираю тёмную тему, и она остаётся выбранной
  после перезахода и на другом устройстве.

---

## Задача 1. 🔴 Бэк: `GET/PATCH /settings/general` (~1:30)

**Слой:** `back/routers/settings/general.py` (сейчас пустой стаб).
**Схемы:** `back/schemas/settings/general.py` (файл существует —
дополнить).

Модель `Studio` уже содержит все нужные колонки — **миграция не нужна**.

```python
# GET /settings/general → 200
{
  "name": "Pilates & Wellness",
  "description": "…",           # nullable
  "phone": "+7…",  "email": "…",  "website": "…",  "address": "…",
  "logo_url": "/uploads/logo_12.png",
  "timezone": "Europe/Moscow",
  "language": "ru",             # ISO 639-1
  "currency": "RUB",            # ISO 4217
  "date_format": "DD.MM.YYYY",
  "first_day_of_week": "monday",
  "journal_time_step": 15
}
```

`PATCH /settings/general` — тело `GeneralUpdate`, все поля
`Optional`, применяется `model_dump(exclude_unset=True)` (паттерн из
`settings/notifications.py:44`). Ответ — полный `GeneralRead`, чтобы
фронт положил его в кэш без второго запроса.

**Валидация (Pydantic, не фронт):**

```python
class GeneralUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=150)
    email: Optional[EmailStr] = None
    website: Optional[HttpUrl] = None
    phone: Optional[str] = Field(None, max_length=20)
    currency: Optional[Literal["RUB", "USD", "EUR", "KZT", "UAH"]] = None
    language: Optional[Literal["ru", "en"]] = None
    date_format: Optional[Literal["DD.MM.YYYY", "MM/DD/YYYY", "YYYY-MM-DD"]] = None
    first_day_of_week: Optional[Literal["monday", "sunday"]] = None
    timezone: Optional[str] = None          # проверяем через zoneinfo, см. ниже
    journal_time_step: Optional[Literal[5, 10, 15, 30, 60]] = None
```

`Literal` вместо свободных строк — единственный способ гарантировать, что
`getCurrencySymbol()` на фронте получит известный код. Часовой пояс
валидируем реальным списком, а не регуляркой:

```python
@field_validator("timezone")
def _tz(cls, v):
    if v and v not in available_timezones():   # zoneinfo, stdlib
        raise ValueError("Неизвестный часовой пояс")
    return v
```

**Права:** `GET` — `Depends(get_studio_context)` (валюта и формат дат
нужны админу и тренеру: Клиенты, Журнал). `PATCH` —
`require_role("owner")`.

> ⚠️ Это единственный `GET` в разделе, доступный не-владельцу. Ответ
> для не-owner урезаем до безопасного набора (`name`, `logo_url`,
> `timezone`, `language`, `currency`, `date_format`,
> `first_day_of_week`, `journal_time_step`) — контакты и адрес студии
> сотруднику через API не отдаём.

## Задача 2. Бэк: загрузка логотипа (~0:45)

**Слой:** `back/routers/studio/media.py` — **загрузчик уже есть**,
проверить и переиспользовать; свой не писать.

```
POST /studio/logo        multipart/form-data: file
→ 200 {"logo_url": "/uploads/studio_12_a3f9.png"}
```

Валидация на границе: `content_type in {image/png, image/jpeg, image/webp}`,
размер ≤ 2 МБ, имя файла генерируем сами (`uuid4().hex`) — имя от
клиента не используем никогда (path traversal). Старый файл удаляем после
успешной записи нового.

Фронт сейчас держит логотип как base64 в `useState` (`GeneralTab.tsx:32`)
— заменяем на `POST` + запись `logo_url` в `Studio`.

## Задача 3. 🔴 Фронт: починить выпадающий список (~1:00)

**Диагноз (точный).** `components/ui/form/DarkSelectRow.tsx` рендерит
список через `createPortal(…, document.body)` с `position: "fixed"` и
координатами, **посчитанными один раз в момент открытия**
(`openDropdown()`, строки 20–26). Контент Настроек живёт в собственном
скролл-контейнере (`Settings.tsx:199`, `overflowY: "auto"`). Скроллим —
кнопка уезжает, `fixed`-список остаётся на месте: визуально отрывается и
«висит» поверх страницы.

**Решение — удалить компонент, а не чинить.** Кит уже содержит
`Select` (`front/src/components/ui/Select.tsx`), который позиционируется
`absolute` внутри `position: relative`-обёртки, — он скроллится вместе с
кнопкой конструктивно, плюс даёт клавиатуру (стрелки/Enter/Esc) и
закрытие по клику мимо. Правило §5 CLAUDE.md прямо запрещает держать
собственный селект.

```
удалить: components/ui/form/DarkSelectRow.tsx
заменить в: GeneralTab.tsx (5 шт.), DataTab.tsx (1 шт.),
            IntegrationsTab.tsx (1 шт.)
```

`Select` принимает `SelectOption[] = {value, label}` — это заодно
разводит **код** (`"RUB"`, уходит на бэк) и **подпись**
(`t('settings:general.currency.RUB')`). Сейчас в стейт кладётся
`"RUB — Российский рубль (₽)"` одной строкой — на бэк такое не отправить.

> Если понадобится вариант «подпись слева, контрол справа в строку» — добавляем
> `label`-проп **в компонент кита**, не заводим обёртку в разделе.

## Задача 4. Фронт: `GeneralTab` на реальных данных (~1:30)

**Файлы:** `components/tabs/GeneralTab.tsx` (переписать),
`hooks/useGeneralSettings.ts` (новый).

```ts
export function useGeneralSettings() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const query = useQuery({
    queryKey: queryKeys.studioSettings,
    queryFn: settingsApi.getGeneral,
    staleTime: 5 * 60_000,        // как в useStudioCurrency
  });
  const save = useMutation({
    mutationFn: settingsApi.updateGeneral,
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.studioSettings, data);  // ответ = полный объект
      toast.success(t('settings:toast.saved'));
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });
  return { ...query, save };
}
```

**Реактивность без F5, три уровня:**
1. `setQueryData` ответом мутации — форма и все потребители
   `useStudioCurrency` обновляются в том же тике.
2. Смена `language` — дополнительно `i18n.changeLanguage(next)` в
   `onSuccess`: интерфейс переключается мгновенно, не дожидаясь
   перезахода.
3. Смена `currency` — ничего дополнительно: потребители читают
   тот же ключ кэша и перерисуются сами. **Это и есть проверка задачи 1.**

**Форма:** локальный черновик + `dirty`-флаг; «Сохранить» отправляет
только изменённые поля (`PATCH`, а не `PUT`). Кнопка `disabled={!dirty}`,
`loading={save.isPending}`. «Сбросить» возвращает данные из кэша, а не
мок `DEFAULT_GENERAL` (удаляется из `constants.ts`).

**Секция «Язык и регион»** — 5 × `Select` с опциями из констант:

```ts
// constants.ts — только коды, подписи через i18n
export const CURRENCIES = ['RUB', 'USD', 'EUR', 'KZT', 'UAH'] as const;
export const LANGUAGES  = ['ru', 'en'] as const;
export const DATE_FORMATS = ['DD.MM.YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'] as const;
export const TIMEZONES = [...]  // короткий список популярных + поиск по вводу — в BACKLOG
```

## Задача 5. Бэк: `GET/PATCH /settings/appearance` (~0:45)

**Слой:** `back/routers/settings/general.py` (тот же файл — отдельный
роутер на две ручки не заводим).

Колонки `User.theme` и `User.accent_color` **уже существуют** —
миграция не нужна.

```
GET  /settings/appearance → {"theme": "light", "accent_color": "#FCAE91"}
PATCH /settings/appearance  body: {"theme"?: "light"|"dark"|"auto",
                                   "accent_color"?: "#RRGGBB"}
```

**Права:** `Depends(get_current_user)` — **не** `require_role("owner")`.
Внешний вид персональный: тренер вправе включить себе тёмную тему.

**Валидация:** `theme: Literal["light","dark","auto"]`,
`accent_color: constr(pattern=r"^#[0-9A-Fa-f]{6}$")` — иначе значение
попадёт прямо в `style`/CSS-переменную (инъекция в стиль).

**Ограничение объёма (осознанное):** акцентный цвет **сохраняется, но
пока не применяется** — токен персикового акцента зашит в `index.css` и
в ДС, перекрашивание всего продукта в роадмап Настроек не входит
(§ «роадмап аудита = одна страница»). В UI рядом с палитрой —
`InfoHint`: «цвет применится в следующем обновлении». Применение —
в `docs/BACKLOG`.

## Задача 6. Фронт: тема, которая реально включается (~1:30)

**Проблема:** `ThemeContext` в проекте не существует (`front/src/contexts/`
содержит только `AIDrawerContext`). `AppearanceTab` меняет `useState` —
и всё.

**Файлы:**
- `front/src/contexts/ThemeContext.tsx` (новый)
- `front/src/pages/dashboard/Settings/components/tabs/AppearanceTab.tsx`
  (переписать на Query + контекст)

```tsx
// ThemeContext: единственная задача — держать класс .dark на <html>
// (Tailwind v4 в проекте настроен именно на класс .dark, см. §5 CLAUDE.md)
export function ThemeProvider({ children }) {
  const { data } = useQuery({ queryKey: queryKeys.appearance,
                              queryFn: settingsApi.getAppearance });
  const theme = data?.theme ?? 'light';
  useEffect(() => {
    const dark = theme === 'dark'
      || (theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
  }, [theme]);
  // auto → слушаем смену системной темы
  useEffect(() => {
    if (theme !== 'auto') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = (e) => document.documentElement.classList.toggle('dark', e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [theme]);
  return children;
}
```

Провайдер вешается в `DashboardLayout` (внутрь, где уже есть
`ToastProvider` и `ErrorBoundary`).

**Optimistic UI обязателен:** клик по теме должен перекрашивать интерфейс
мгновенно, а не через round-trip.

```ts
useMutation({
  mutationFn: settingsApi.updateAppearance,
  onMutate: async (next) => {
    await qc.cancelQueries({ queryKey: queryKeys.appearance });
    const prev = qc.getQueryData(queryKeys.appearance);
    qc.setQueryData(queryKeys.appearance, (o) => ({ ...o, ...next }));
    return { prev };                                    // откат
  },
  onError: (e, _v, ctx) => {
    qc.setQueryData(queryKeys.appearance, ctx.prev);    // тема вернулась
    toast.error(getErrorMessage(e));
  },
});
```

**Edge case:** до первого ответа `GET /settings/appearance` тема — светлая
(дефолт), при `theme === 'dark'` в БД это даст вспышку светлого экрана.
Лечится записью выбранной темы в `localStorage` в `onSuccess` и чтением
её как `initialData` для квери. Сервер остаётся источником истины,
`localStorage` — только анти-мигание.

## Задача 7. Локализация вкладок (~0:30)

`settings.json` → секции `general` и `appearance`: подписи полей,
опции валют/языков/форматов дат, названия тем и цветов, тексты тостов.
Проверка: `grep -nP "[А-Яа-я]" GeneralTab.tsx AppearanceTab.tsx` → пусто.

---

## Критерии приёмки EPIC 2

- 🔴 **Смена валюты в Настройках меняет символ в Каталоге, Клиентах и
  Лояльности без F5** — главный критерий эпика.
- Перезаход после сохранения: все поля и локаль на месте (данные в БД).
- Выпадающий список: открыть → проскроллить контент → список едет вместе
  с кнопкой; Esc и клик мимо закрывают; стрелки+Enter выбирают.
- Логотип переживает F5 (лежит в `/uploads`, а не в base64-стейте).
- Тёмная тема включается мгновенно и остаётся после перезахода; `auto`
  реагирует на смену системной темы на лету.
- `PATCH /settings/general` с `currency: "XXX"` → 422, а не запись мусора.
- Не-owner получает `GET /settings/general` без контактов студии;
  `PATCH` → 403.
- ru/en; `npm run build && npm run lint` — зелёные.
</content>
