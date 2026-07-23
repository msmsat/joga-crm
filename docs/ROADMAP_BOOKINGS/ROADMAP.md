# ROADMAP: Онлайн-запись (аудит раздела Booking)

Скоуп — только страница `/dashboard/booking` (`front/src/pages/dashboard/Booking/`) и её бэкенд
(`back/routers/booking/settings.py`). Никаких новых сервисов и глобальных рефакторингов.

## Точка отсчёта (что уже есть — НЕ переделывать)

| Слой | Что есть | Где |
|---|---|---|
| API | `GET /booking/settings` (get-or-create дефолтов), `PATCH /booking/settings` | `back/routers/booking/settings.py:27-59` |
| API | `GET /booking/channels`, `PATCH /booking/channels/{type}` (upsert, `connected_at`) | `back/routers/booking/settings.py:62-105` |
| Модели | `StudioBookingSettings` (все тумблеры, цвет, лого-URL, тема, язык), `BookingChannelConfig` (`is_active=False` по умолчанию = «Не подключено», токен в JSON `config`) | `back/models/settings.py:57-99` |
| Фронт API | `bookingApi.getSettings / updateSettings / getChannels / updateChannel` | `front/src/api/booking/booking.api.ts` |
| UI | Карточки каналов, 4 карточки настроек, модалки Tg/Insta/Web/Wa, мокап мини-приложения | `front/src/pages/dashboard/Booking/` |
| Инфра | `ToastProvider` смонтирован в `DashboardLayout.tsx:71`, `useToast` из `components/ui/index`; TanStack Query + реестр ключей `front/src/api/queryKeys.ts` | готово |

Реальные дефекты: статусы каналов подделаны на фронте (`useTgBot.ts:7-9` — Insta/Web всегда
«Подключён»), загрузка логотипа сохраняет только имя файла в стейт, ошибки API молча глотаются
(поле `error` из хуков нигде не рендерится), `alert()` в `WebModal.tsx:27`, `StudioMockup`
недостижим (никто не вызывает `setMockupOpen(true)`), весь текст — хардкод без i18n.

---

## Эпик 0 — Миграция БД (общая база для эпиков 1–2)

Одна ревизия Alembic на все новые колонки `studio_booking_settings`:

- [x] `back/models/settings.py` → в `StudioBookingSettings` добавить:
  - `miniapp_generated: Mapped[bool] = mapped_column(Boolean, default=False)` — «мини-приложение создано»;
  - `widget_work_start: Mapped[str] = mapped_column(String(5), default="09:00")`;
  - `widget_work_end: Mapped[str] = mapped_column(String(5), default="21:00")`;
  - `slot_step_min: Mapped[int] = mapped_column(Integer, default=60)` — шаг записи.
- [x] `cd back && alembic revision --autogenerate -m "booking widget: miniapp flag, work hours, slot step"` → `alembic upgrade head`.

Новых эндпоинтов НЕ создаём — все поля едут через существующие `GET/PATCH /booking/settings`.

---

## Эпик 1 — Мини-приложение как prerequisite + честные статусы каналов

**Бэкенд**
- [x] `back/schemas/settings/booking.py` → `BookingSettingsRead` + `miniapp_generated: bool`;
      `BookingSettingsUpdate` + `miniapp_generated: Optional[bool] = None`.

**Фронт**
- [x] `front/src/api/booking/booking.types.ts` → `BookingSettings` + `miniapp_generated: boolean`.
- [x] `front/src/pages/dashboard/Booking/hooks/useTgBot.ts` → удалить `DEFAULT_STATUS` (строки 7–9):
      статус канала — только из ответа сервера (`is_active` → `'connected'`, иначе `null`).
- [x] `front/src/pages/dashboard/Booking/types.ts` → `ChannelStatus = 'connected' | null`
      (значение `'pending'` больше никто не выдаёт — удалить).
- [x] `front/src/pages/dashboard/Booking/components/ui/ChannelCard.tsx` → при `status === null`
      рендерить бейдж «Не подключено» (сейчас — пустота); ветку `pending` удалить.
- [x] `front/src/pages/dashboard/Booking/Booking.tsx` → добавить точку входа в мини-приложение:
      карточка/кнопка «Мини-приложение» над каналами, открывает `StudioMockup`
      (сейчас `setMockupOpen(true)` не вызывается нигде — мокап мёртвый код).
- [x] `front/src/pages/dashboard/Booking/components/modals/StudioMockup.tsx` → CTA
      «Создать мини-приложение» → `PATCH /booking/settings { miniapp_generated: true }` → инвалидация
      кэша настроек (эпик 3) → каналы разблокируются без F5.
- [x] Новый `front/src/pages/dashboard/Booking/components/modals/MiniappStub.tsx` — одна заглушка
      на три канала: «Сначала начните работу с мини-приложением» + кнопка, открывающая `StudioMockup`.
- [x] `Booking.tsx` → гейт при открытии Insta/Web/Wa (Telegram не под гейтом):
      `{modals.isInstaModalOpen && (settings?.miniapp_generated ? <InstaModal/> : <MiniappStub/>)}` — аналогично Web и Wa.

---

## Эпик 2 — 100 % настроек: часы работы/шаг, логотип, токен бота

### 2.1 Время работы и шаг записи
- [x] `back/schemas/settings/booking.py` → `widget_work_start`, `widget_work_end`, `slot_step_min`
      в Read/Update (в Update — с валидацией: время `^\d{2}:\d{2}$`, шаг из {15, 30, 45, 60}).
- [x] `front/src/api/booking/booking.types.ts` → те же три поля.
- [x] `front/src/pages/dashboard/Booking/mapping.ts` → пары опций `STEP_OPTS` (15/30/45/60 мин)
      и `TIME_OPTS` (07:00–23:00 с шагом 30 мин).
- [x] `front/src/pages/dashboard/Booking/components/sections/BookingSettings.tsx` → в карточку
      «Ограничения и правила» две строки: «Время работы виджета» (два `CustomSelect` от/до)
      и «Шаг записи» (`CustomSelect`), сохранение через существующий `patch(...)`.

### 2.2 Логотип виджета (multipart)
- [x] `back/routers/studio/media.py:52` → `upload_logo` сейчас БЕЗ авторизации — добавить
      `_token: str = Depends(oauth2_scheme)` (как у трёх соседних эндпоинтов). Отдельный эндпоинт
      для виджета не нужен — переиспользуем `POST /studio/upload-logo`.
- [x] `front/src/api/booking/booking.api.ts` → `uploadLogo(file: File)` — multipart POST на
      `/studio/upload-logo` (если в `front/src/api/studio/` уже есть такой вызов — импортировать его,
      не дублировать).
- [x] `front/src/pages/dashboard/Booking/components/sections/BookingSettings.tsx` → в `onChange`
      файла: `uploadLogo(file)` → `patch('widget_logo_url', url)`; вместо имени файла показывать
      миниатюру из `settings.widget_logo_url` + кнопку «Удалить» (`patch('widget_logo_url', null)`);
      ошибка загрузки → Error Toast (эпик 3).

### 2.3 Токен Telegram-бота
- [x] `back/routers/booking/settings.py` → в `update_channel`: для `channel_type == "telegram"`
      при наличии `config.token` валидировать формат `^\d{6,12}:[A-Za-z0-9_-]{30,50}$`,
      иначе `HTTPException(400, "Неверный формат токена")`.
- [x] `front/src/pages/dashboard/Booking/components/modals/TgModal.tsx` → та же regex-проверка
      перед `onConnect` (кнопка неактивна + подсказка об ошибке); в connected-виде — кнопка
      «показать/скрыть» (глаз) рядом с маскированным токеном (`maskToken` уже есть, `TgModal.tsx:14`).
- [x] Хранение не менять: токен уже лежит в `BookingChannelConfig.config` (JSON), эндпоинт owner-only.

---

## Эпик 3 — React Query, тосты, No-F5

- [x] `front/src/api/queryKeys.ts` → добавить
      `bookingSettings: ['booking', 'settings']`, `bookingChannels: ['booking', 'channels']`
      + дописать «Онлайн-записью: …» в комментарий-реестр.
- [x] `front/src/pages/dashboard/Booking/hooks/useBookingSettings.ts` → переписать на
      `useQuery(queryKeys.bookingSettings)` + `useMutation(bookingApi.updateSettings)`:
      optimistic update в `onMutate` с откатом в `onError` (текущее поведение сохранить),
      `onError` → `toast.error(...)`, `onSuccess` → `toast.success('Сохранено')`,
      `onSettled` → инвалидация `bookingSettings`. Сигнатуру `patch(field, value)` не менять —
      `BookingSettings.tsx` останется нетронутым.
- [x] `front/src/pages/dashboard/Booking/hooks/useTgBot.ts` → переименовать в `useChannels.ts`
      (хук давно управляет всеми 4 каналами) и переписать на `useQuery(queryKeys.bookingChannels)` +
      `useMutation(bookingApi.updateChannel)` с инвалидацией; тосты: «Бот подключён» /
      «Бот отключён» / ошибки (в т.ч. 400 о неверном токене — текст `detail` из ответа).
- [x] `front/src/pages/dashboard/Booking/Booking.tsx` → обновить импорт хука; убрать прокидывание
      неиспользуемых `error` (после тостов они не нужны).
- [x] `front/src/pages/dashboard/Booking/components/modals/WebModal.tsx:27` →
      `alert('Код скопирован!')` заменить на `navigator.clipboard.writeText(...)` + `toast.success`.
- [x] Провайдер уже смонтирован (`DashboardLayout.tsx:71`) — только `useToast` из
      `components/ui/index`, ничего не монтировать.

---

## Эпик 4 — i18n: 0 % хардкода

- [x] Новые словари `front/src/locales/ru/booking.json` и `front/src/locales/en/booking.json`.
- [x] `front/src/i18n.ts` → импорт обоих + регистрация namespace `booking` в `resources`.
- [x] `front/src/pages/dashboard/Booking/components/ui/CustomSelect.tsx` → перевести `options` со
      `string[]` на `{ value: string | number; label: string }[]` — иначе селекты завязаны на
      русские строки как значения (обратный маппинг по переведённой строке сломается).
- [x] `front/src/pages/dashboard/Booking/mapping.ts` → опции хранят `value` + ключ перевода
      (`{ value: 60, key: 'advance.1h' }`), подписи собираются через `t()` в компоненте;
      хелперы `advanceLabel/advanceMin` и т.п. упрощаются до поиска по `value`.
- [x] Вычистить весь текст на `t('booking:...')` в файлах:
      `Booking.tsx`, `BookingChannels.tsx`, `ChannelCard.tsx` («Подключён», «Не подключено»),
      `BookingSettings.tsx` (все label/sub, «Загрузка настроек…», «Загрузить»),
      `TgModal.tsx`, `InstaModal.tsx`, `WebModal.tsx`, `WaModal.tsx`, `StudioMockup.tsx`,
      `MiniappStub.tsx` (из эпика 1).

---

## Порядок выполнения

`0 → 1 → 3 → 2 → 4` — миграция первой; статусы и гейт мини-приложения — ядро аудита;
React Query/тосты раньше эпика 2, чтобы логотип и токен сразу писались через мутации с тостами;
i18n последним, чтобы не переводить текст дважды.

После каждого эпика: `cd front && npm run build && npm run lint`; для эпиков 0–2 — smoke-тест
эндпоинтов (`GET/PATCH /booking/settings`, `PATCH /booking/channels/telegram` с невалидным токеном → 400).
