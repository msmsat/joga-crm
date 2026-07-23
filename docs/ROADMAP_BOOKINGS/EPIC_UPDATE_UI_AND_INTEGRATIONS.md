# EPIC: Онлайн-запись — упрощение интеграций + фикс селекторов времени

> **Статус: выполнено полностью (Блок 2 и Блок 1).** `npm run build` и `npm run lint` чисты для
> `pages/dashboard/Booking/`. Осталось только ручное smoke-тестирование в браузере (см. «После
> эпика»).

Скоуп — только страница `/dashboard/booking` (`front/src/pages/dashboard/Booking/`) и её бэкенд
(`back/routers/booking/settings.py`). Никаких новых сервисов, эндпоинтов и глобальных рефакторингов.

> **Внимание — это разворот решения из [`ROADMAP.md`](ROADMAP.md) (Эпик 1).** Там мини-приложение
> было сделано prerequisite'ом и гейтом для Insta/Web/WA. Здесь мы **удаляем гейт и сущность
> мини-приложения целиком** и делаем три канала «Always Connected». Telegram остаётся единственным
> настраиваемым каналом. Ниже — что удалить, а что поправить.

## Точка отсчёта (что уже есть)

| Слой | Что есть | Где |
|---|---|---|
| UI | Секция «Мини-приложение» (карточка) над каналами, гейт `openGatedModal`, флаг `miniapp_generated` | `Booking.tsx:23-86` |
| UI | Модалки `StudioMockup` (мокап телефона) и `MiniappStub` (заглушка-гейт) | `components/modals/StudioMockup.tsx`, `components/modals/MiniappStub.tsx` |
| UI | Статусы каналов из ответа сервера (`is_active` → `'connected'`, иначе `null`) | `hooks/useChannels.ts:21-24` |
| UI | Селект времени работы виджета: два `CustomSelect`, опции `TIME_OPTS` (07:00–23:00, шаг 30, 33 шт.) | `components/sections/BookingSettings.tsx:23,165-167`, `mapping.ts:40-45` |
| UI | `CustomSelect` — свой дропдаун; `.cs-dropdown` без `max-height`, `overflow: hidden` (простыня не скроллится) | `components/ui/CustomSelect.tsx`, `Booking.css:511-524` |
| API | `GET/PATCH /booking/settings`, `GET/PATCH /booking/channels/{type}` (owner-only, скоуп по студии) | `back/routers/booking/settings.py` |
| Модель | `StudioBookingSettings.miniapp_generated` (миграция `fb9bb1077858`) | `back/models/settings.py` |

---

## Блок 1 — Упрощение логики интеграций (cut the scope)

**Цель:** удалить всё, что связано с «генерацией мини-приложения» и per-channel статусом
подключения для Instagram / Web / WhatsApp. Три канала становятся всегда активными; Telegram —
единственный, что реально настраивается.

### 1.1 Фронт — удалить сущность «Мини-приложение» и гейт

| Слой | Файл | Действие |
|---|---|---|
| Компонент (удалить) | `components/modals/MiniappStub.tsx` | **Удалить файл** — заглушка-гейт больше не нужна. |
| Компонент (удалить) | `components/modals/StudioMockup.tsx` | **Удалить файл** — мокап телефона был точкой «создать мини-приложение», сущность уходит. |
| Оркестратор | `Booking.tsx` | Удалить: импорты `MiniappStub`, `StudioMockup`, `ChannelCard`, `IconWeb` (строки 8-15, если больше не нужны); всю секцию «Мини-приложение» (строки 32-46); `miniappGenerated` и `openGatedModal` (строки 23-28); блоки рендера `isMockupOpen`/`isMockupStubOpen` (строки 74-86). Каналы Insta/Web/WA открывают модалку напрямую (без гейта): `onOpenInsta={() => modals.setInstaModalOpen(true)}` и т.д. |
| Хук модалок | `hooks/useBookingModals.ts` | Удалить состояния `isMockupOpen/setMockupOpen` и `isMockupStubOpen/setMockupStubOpen` (строки 8-9, 16-17). |
| Хук настроек | `hooks/useBookingSettings.ts` | Ничего не трогаем — `miniapp_generated` просто перестаёт читаться (см. 1.4 про колонку). |
| i18n RU | `locales/ru/booking.json` | Удалить ключи `miniapp` (стр. 2), `miniappStub` (стр. 69), `mockup` (стр. 74). |
| i18n EN | `locales/en/booking.json` | Удалить те же три ключа. |

### 1.2 Фронт — три канала «Always Connected»

| Слой | Файл | Действие |
|---|---|---|
| Хук каналов | `hooks/useChannels.ts` | `statusOf(type)`: для `instagram`/`web`/`whatsapp` **всегда** возвращать `'connected'` (визуально активны без настройки); для `telegram` — как сейчас, из `is_active`. Одна строка: `if (type !== 'telegram') return 'connected'` перед текущей логикой. |
| Оркестратор | `Booking.tsx` | Убедиться, что `webStatus`/`instaStatus`/`waStatus` берутся из обновлённого `statusOf` (уже так). |

**Что делают модалки Insta/Web/WA после упрощения:** остаются как есть — это информационные модалки
(веб-виджет отдаёт код для вставки, Insta/WA — короткая справка). Они больше **не** меняют статус и
**не** требуют «подключения». Ничего в них не удаляем, кроме `alert()` если он ещё остался
(`WebModal` — на `navigator.clipboard` + toast, если не сделано в Эпике 3 ROADMAP.md).

### 1.3 Бэкенд — минимум изменений

| Слой | Файл | Действие |
|---|---|---|
| Роутер | `back/routers/booking/settings.py` | **Не трогаем.** `PATCH /booking/channels/{type}` для telegram уже валидирует токен и проставляет `connected_at`. Для Insta/Web/WA фронт статус не спрашивает у сервера — эндпоинты просто перестают вызываться этими каналами. Строки записи для них в БД не нужны. |
| Схема | `back/schemas/settings/booking.py` | `miniapp_generated` в `Read`/`Update` **оставляем** (см. 1.4). Валидатор токена telegram — без изменений. |

### 1.4 БД — колонку `miniapp_generated` НЕ удаляем

`ponytail:` мёртвая колонка вместо DROP-миграции. Причины:

- В этом репо действует запрет на разрушающие git/DB-операции (см. память об инциденте stash-loss);
  `DROP COLUMN` — необратимая ревизия ради флага, который просто перестаёт читаться.
- Колонка `nullable=False, default=False` — существующие строки не ломает, новые пишутся с `False`.
- Поле остаётся в `BookingSettingsRead`/`Update` и в TS-типе `BookingSettings` — консистентно, фронт
  его просто игнорирует.

**Апгрейд-путь:** если позже решим вычистить схему — одна ревизия `alembic revision -m "drop
miniapp_generated"` с `op.drop_column(...)`, синхронно убрать поле из схемы и TS-типа. Не в этом эпике.

---

## Блок 2 — Фикс UX селекторов времени

**Проблема:** `TIME_OPTS` = 33 кнопки, `.cs-dropdown` без ограничения высоты и с `overflow: hidden`
→ простыня, ломающая интерфейс. Правим генерацию опций + сам `CustomSelect` (общий компонент —
фикс применяется ко ВСЕМ селектам страницы, но реально длинный только временной).

### 2.1 Диапазон опций времени — полные сутки

| Слой | Файл | Действие |
|---|---|---|
| Данные | `mapping.ts:40-45` | `TIME_OPTS`: генерировать от `00:00` до `24:00` включительно с шагом 30 мин. `length: 49`, `totalMin = i * 30`; последний элемент — строка `"24:00"` (полночь конца суток). Комментарий строки 39 обновить на «00:00–24:00, шаг 30». |
| Валидатор | `back/schemas/settings/booking.py:9` | `_TIME_RE = ^\d{2}:\d{2}$` уже пропускает `24:00` — не трогаем. |

### 2.2 Ограничение высоты + внутренний скролл (макс. ~5 элементов)

Проект на **CSS Modules / обычном CSS**, не Tailwind — `max-h-48` из ТЗ переводим в CSS. Опция
`.cs-option` ≈ 34px (padding 8+8 + line ~18). 5 элементов + padding контейнера ≈ **190px**.

| Слой | Файл | Действие |
|---|---|---|
| Стили | `Booking.css:511-524` (`.cs-dropdown`) | Заменить `overflow: hidden` → `overflow-y: auto`; добавить `max-height: 190px;` (≈5 строк). Опционально тонкий скроллбар: `scrollbar-width: thin;` + `.cs-dropdown::-webkit-scrollbar { width: 6px }` в тон онникса. |

### 2.3 Авто-скролл к выбранному значению при открытии (scroll into view)

Headless UI / Radix в проекте **нет** — `CustomSelect` самописный. Нативный `scrollIntoView` + `ref`.

| Слой | Файл | Действие |
|---|---|---|
| Компонент | `components/ui/CustomSelect.tsx` | 1) Навесить `ref` на выбранную опцию: в `.map` — `ref={opt.value === value ? selectedRef : undefined}` (`const selectedRef = useRef<HTMLDivElement>(null)`). 2) `useEffect(() => { if (isOpen) selectedRef.current?.scrollIntoView({ block: 'center' }) }, [isOpen])` — при открытии выбранный пункт центрируется, юзер не листает с 00:00. `block: 'center'` = «по центру» из ТЗ. `behavior` по умолчанию (`auto`) — без анимации, чтобы не конфликтовать с `csPopupIn`. |

**Затрагивает все селекты страницы** (advance/window/cancel/step/lang/время) — для коротких списков
`scrollIntoView` — no-op (всё влезает), для времени решает проблему. Один фикс в общем компоненте,
не в каждом вызове (root-cause, не симптом).

---

## Порядок выполнения

`Блок 2 → Блок 1` — сначала быстрый безопасный UX-фикс (3 маленькие правки, ничего не удаляет),
потом удаление сущности мини-приложения (больше файлов, требует проверки, что нигде не осталось
битых импортов `StudioMockup`/`MiniappStub`).

После эпика:
- `cd front && npm run build && npm run lint` — ноль битых импортов после удаления двух модалок.
- Ручной smoke: открыть селект «Время работы» → список скроллится, ≤5 видимых, открывается на
  текущем значении; карточки Instagram/Web/WhatsApp сразу «Подключено», клик открывает инфо-модалку
  без гейта; Telegram по-прежнему требует токен.

## Явно НЕ делаем (YAGNI)

- Не удаляем колонку `miniapp_generated` из БД (см. 1.4).
- Не сидируем строки `BookingChannelConfig` для Insta/Web/WA в БД — статус «Always Connected»
  считается на фронте, серверу об этих каналах знать не нужно.
- Не выносим `max-height`/шаг времени в конфиг — константы, меняются правкой одной строки.
