# EPIC: Мини-приложение клиента на реальном бэкенде

> **Статус: не начат.** Дизайн мини-приложения готов и переделке не подлежит — эпик меняет
> только источник данных, вход и те места, где интерфейс сейчас показывает выдуманное.

Скоуп — папка `miniapp/` и публичный контур `back/routers/booking/` (префикс `/global`).
CRM-фронт (`front/`) не трогаем ни в одном блоке. Новых сервисов, новых моделей и новых
зависимостей не заводим: всё, что нужно (клиенты, занятия, брони, абонементы, платежи,
Stripe Connect, уведомления), в CRM уже есть.

Этот эпик заменяет собой [`docs/BACKLOG/EPIC_V2_5_BACKLOG.md`](../BACKLOG/EPIC_V2_5_BACKLOG.md):
там мини-приложение планировалось как публичные роуты внутри `front/`, а по факту оно уже
существует отдельным Vite-приложением с готовым UI.

---

## Точка отсчёта

### Что уже есть (НЕ переделывать)

| Слой | Что есть | Где |
|---|---|---|
| UI | 4 экрана (главная, расписание, мои занятия, профиль), 7 модалок-шторок, свой мини-кит (`Sheet`, `EmptyState`, `ListSkeleton`, `Badge`, `Press`), 4 языка | `miniapp/src/` |
| UI | Дизайн-система на Tailwind v4 + framer-motion, токены `--v-*`, тёмная тема | `miniapp/src/index.css`, `App.css` |
| API-слой | Типы запросов/ответов под контракт бота — `LessonResponse`, `UserProfile`, `UserSubscription`, `PaymentResponse` | `miniapp/src/api/{auth,user,lessons}.ts` |
| Бэкенд | `POST /global/check-user`, `POST /global/register` — вход клиента, find-or-create `Client` по `tg_id`, rate-limit | `back/routers/booking/miniapp.py` |
| Бэкенд | Публичная запись без токена: каталог услуг, слоты с учётом правил, бронь по имени+телефону | `back/routers/booking/public.py` |
| Бэкенд | Модели закрывают весь контракт: `Client` (`tg_id`, `notifs_enabled`, `reminders_enabled`), `Lesson`, `Reservation` (`spot_number`, `rating`), `ClientSubscription`, `ClientPayment` (`action_type`, `item_key`), `SubscriptionPackage`, `StudioBranch` + `BranchWorkingHours` | `back/models/` |
| Бэкенд | Готовая механика записи: `assert_can_book`/`find_eligible_subscription`, `charge_reservation`/`refund_reservation`, `notify()` c1/a1/t1/c3/c5/c6, `attach_subscription` | `back/services/`, `back/routers/schedule/reservations.py` |
| Бэкенд | Приём денег **на счёт студии** через Stripe Connect (direct charges), идемпотентность по `StripeCheckout` | `back/services/stripe_connect.py`, `back/routers/checkout/stripe_pay.py` |
| Бэкенд | JWT: `get_current_user` отвергает любой токен с claim `typ` — клиентский токен на CRM-ручках упрётся в 401 **без единой правки** | `back/dependencies.py:32-34` |

### Что не работает (это и есть эпик)

**Мини-приложение ходит в бэкенд, которого в репозитории нет.** `BASE_URL = 'http://127.0.0.1:8000'`
(`miniapp/src/api/config.ts:5`) — это адрес CRM, но по нему живут только две ручки из
четырнадцати. Остальные двенадцать отвечают 404: приложение сегодня не работает нигде, кроме
машины, где параллельно поднят бэкенд бота-предшественника.

| Зовёт мини-приложение | Есть в `back/`? | Где зовётся |
|---|---|---|
| `POST /global/check-user`, `POST /global/register` | ✅ | `App.tsx:49,55,75` |
| `GET /lessons/today/1800` | ❌ | `home.tsx:57` (главная карточка) |
| `GET /lessons/date/{date}` | ❌ | `shedule.tsx:55`, `ServiceScheduleSheet.tsx:59` |
| `GET /lessons/my/{tg_id}` | ❌ | `mylessons.tsx:34` |
| `GET /lessons/today/direction/{name}` | ❌ | **никем** — мёртвый код (`api/lessons.ts:79`) |
| `POST /users/book`, `/users/cancel` | ❌ | `home.tsx:122,146`, `shedule.tsx:115,137` |
| `POST /users/rate-lesson` | ❌ | `mylessons.tsx:129` |
| `GET /users/{tg_id}/profile` | ❌ | `profile.tsx:45` |
| `GET /users/{tg_id}/subscription` | ❌ | `profile.tsx:59` |
| `GET /users/{tg_id}/payments` | ❌ | `HistoryModal.tsx:28` |
| `PATCH /users/{tg_id}/settings/{notifications,reminders}` | ❌ | `profile.tsx:77,87` |
| `POST /users/{tg_id}/buy-subscription` | ❌ | `BuyModal.tsx:47` |

**Дыра в доступе.** Единственный «пароль» клиента — его `tg_id` в открытом пути запроса
(`/users/{tg_id}/profile`). Кто знает чужой `tg_id` — а его видит любой бот, которому человек
писал, — читает чужой профиль, абонемент и историю оплат, а также бронирует и отменяет за него.
Это уже задокументировано в коде (`miniapp/src/lib/session.ts:34-44`,
`back/routers/booking/miniapp.py:10-23`) и является причиной, по которой сервер сегодня
принципиально не отдаёт наружу телефон и не привязывает клиента студии к присланному `tg_id`.
Без блока 1 остальные блоки **нельзя выкатывать** — они дадут постороннему то, чего сейчас нет.

**Данные, которых нет на сервере (моки и выдумки в UI):**

| Что | Где | Чем заменяется |
|---|---|---|
| 4 студии с фото, рейтингом, отзывами и координатами на схеме | `data/studios.ts` | Филиалы студии (`StudioBranch`) — блок 5 |
| 6 услуг с ценами и уровнями | `data/services.ts` | `Service` студии — блок 5 |
| 4 тарифа абонементов с ценами | `BuyModal.tsx:23-28` | `SubscriptionPackage` — блок 5 |
| Оплата картой: форма PAN/CVV и `setTimeout(1500)` вместо шлюза | `PaymentModal.tsx:26-60` | Stripe Connect — блок 6 |
| Валюта `Kč` строкой в четырёх словарях | `locales/*.json:33` | `Studio.currency` — блок 5 |
| Ссылка-приглашение `https://jogaua.online/` | `home.tsx:164`, `profile.tsx:97` | `Client.invite_code` + `bot_username` — блок 5 |
| Подстановки при пустом ответе: `'18:00'`, `'Олена Соколова'`, `reformer_glow`, `total_spots \|\| 5`, `total \|\| 8` | `home.tsx:184-186,242-246`, `BookingModal.tsx:150` | Пустое состояние — блок 7 |
| `alert()` на любую ошибку и любой успех (6 мест) | `home.tsx`, `shedule.tsx`, `mylessons.tsx`, `BuyModal.tsx` | `tg.showAlert` — блок 7 |
| Избранные студии в `localStorage` | `lib/likes.ts` | Остаётся как есть (см. «Явно НЕ делаем») |

---

## Ключевые решения (принять до первой строчки кода)

| Вопрос | Решение | Почему так |
|---|---|---|
| Куда переезжает контракт | В CRM-бэкенд, публичным контуром под префиксом **`/global`** | Прецедент уже есть: `/global/check-user` и `/global/register` — это ровно порт путей бота (`miniapp.py:1-8`). Второй бэкенд поднимать не нужно, третьего источника правды не заводим. Публичный `/users` на верхнем уровне не вешаем: он читается как ручка сотрудников и слишком легко попадёт под чужой гейт |
| Чем клиент доказывает, кто он | **Telegram `initData`** → HMAC-проверка токеном бота студии → короткий клиентский JWT (`typ: "client"`) в заголовке `Authorization` | Токен бота уже лежит в `BookingChannelConfig.config['token']` (`services/telegram_bot.py:86`). `get_current_user` уже отвергает токены с `typ`, поэтому клиентский токен не откроет ни одной CRM-ручки — правку в `dependencies.py` делать не нужно |
| Что происходит вне Telegram | Личного кабинета нет: экран «Откройте в Telegram» + ссылка на бота. Быстрая запись с сайта остаётся на существующем веб-виджете (`/booking/public/booking/{studio_id}/reserve`) | Подтвердить личность вне Telegram нечем: SMS в продукте нет, email у клиента опционален. `newDeviceId()` (`lib/session.ts:45`) выдаёт случайный отрицательный id — он не доказывает ничего и после блока 1 теряет смысл. Кабинет по коду на email — в BACKLOG |
| Откуда мини-приложение знает свою студию | `start_param` диплинка бота (`t.me/<bot>?startapp=s<studio_id>`), он же используется при проверке `initData` | Перебирать токены всех студий ради одной HMAC-проверки — и медленно, и неверно (два бота могут вести в разные студии) |
| Что такое «студии» в ленте на главной | **Филиалы** студии (`StudioBranch`: name, city, address, photo_url + `BranchWorkingHours` → `opens`/`closes`) | Мультистудийность CRM — отдельный эпик в BACKLOG. Модель филиалов ложится на тип `Studio` мини-приложения один в один, включая живой статус «відчинено/зачиняється» (`lib/studio-status.ts` остаётся нетронутым) |
| Кто форматирует строки | **Валюта — сервер** (`price_str`, `amount_str` из `Studio.currency`), **даты и слова — клиент** (`toLocaleDateString(i18n.language)`) | Сервер знает валюту студии и не знает язык клиента. Сейчас наоборот: валюта зашита в словари (`"currency": "Kč"` во всех четырёх), а длительность приходит с сервера строкой `«60 хв»` и не переводится |
| Отзывы | `Reservation.rating` (+ `review_text`) — поля уже есть | Отдельная модель `Review` из V2-5 не нужна: оценка привязана к посещению, а посещение — это и есть `Reservation` |

---

## Блок 0 — Один адрес и одна студия

- [ ] `miniapp/src/api/config.ts` → `export const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000'`.
      Захардкоженный адрес означал, что мини-приложение нельзя выкатить, не пересобрав его руками.
      Добавить `miniapp/.env.example` со строкой `VITE_API_URL=http://127.0.0.1:8000`.
- [ ] `back/main.py` → в `CORS_ORIGINS` должен входить origin мини-приложения (dev: `http://localhost:5174`,
      порт прибит в `miniapp/vite.config.ts:9`). Проверить `.env`, дописать, если его там нет.
- [ ] `back/routers/booking/` → рядом с `miniapp.py` завести `miniapp_lessons.py` и `miniapp_users.py`;
      `back/routers/booking/__init__.py` собирает `miniapp_router` из трёх модулей (сейчас — из одного).
      Один файл на 600 строк не заводим, пакет `routers/miniapp/` — тоже: контур публичной записи
      уже живёт в `routers/booking/`, разносить его по двум местам незачем.
- [ ] `miniapp/src/api/lessons.ts` → удалить `getTodayLessonsByDirection` (строки 74-94),
      `miniapp/src/api/auth.ts` → удалить `getUserByTgId` (строки 83-91). Обе функции никто не зовёт.

---

## Блок 1 — Вход: `initData` вместо `tg_id` в URL 🔴

**Делать первым и целиком.** Пока ключом остаётся `tg_id`, каждая новая ручка блоков 2-6 — это
ещё один способ прочитать чужие данные по одному лишь номеру Telegram.

### 1.1 Бэкенд: проверка подписи и клиентский токен

- [ ] `back/routers/booking/miniapp.py` → `verify_init_data(init_data: str, bot_token: str) -> dict`:
      разбор query-string, отделение `hash`, сборка `data_check_string` (пары `key=value`,
      отсортированы, склеены `\n`), `secret = HMAC_SHA256(key=b"WebAppData", msg=bot_token)`,
      сверка `HMAC_SHA256(key=secret, msg=data_check_string)` с `hash` через `hmac.compare_digest`.
      Отдельно проверить свежесть `auth_date` (не старше 24 ч) — иначе перехваченная строка
      работает вечно. Только `hmac`/`hashlib` из стандартной библиотеки, зависимостей не добавляем.
- [ ] Там же — self-check `if __name__ == "__main__":` с `assert`-ами (образец — `python -m services.fondy`):
      валидная строка проходит, подделанный `hash` не проходит, просроченный `auth_date` не проходит.
      Единственная нетривиальная криптологика эпика обязана иметь запускаемую проверку.
- [ ] `POST /global/auth/telegram` (`limiter.limit("10/minute")`), тело `{ init_data: str, studio_id: int }`:
      1. токен бота — `BookingChannelConfig` студии, `channel_type == "telegram"`, `config['token']`;
         нет токена или канал не подключён → `503 "Студия не подключила Telegram-бота"`;
      2. `verify_init_data` → `user.id` из проверенных данных (**не** из тела запроса);
      3. find-or-create `Client(studio_id, tg_id)` — по образцу `register` (`miniapp.py:106-170`),
         вместе с `log_activity` о новом клиенте и `avatar_color`;
      4. ответ `{ token, user }`, где `token = create_access_token({"sub": str(client.id), "typ": "client", "studio_id": …}, expires_minutes=60*24*30)`.
- [ ] Правило 2 из шапки `miniapp.py` (телефон не доказывает владение) **остаётся**: после проверки
      подписи `tg_id` доказан, но клиента студии, заведённого администратором, по-прежнему не
      привязываем автоматически — сначала нужно сверить телефон (это в BACKLOG). Комментарий в шапке
      модуля обновить: пункт 1 (не отдавать телефон) снимается, пункт 2 остаётся.
- [ ] `back/routers/booking/miniapp.py` → зависимость `get_current_client(token, db) -> Client`:
      декод JWT, `typ == "client"` обязателен, `Client` по `sub`, 401 на всё остальное.
      Все ручки блоков 2-6 висят на ней. `studio_id` берётся **из токена**, никогда из запроса.
- [ ] Удалить `POST /global/check-user` и `POST /global/register` вместе с `MiniappRegisterRequest`
      и `CheckUserResult`: `auth/telegram` делает и то, и другое, а оставленный `check-user`
      остаётся справочником «есть ли такой Telegram-аккаунт у студии».

### 1.2 Фронт: одна точка входа

- [ ] `miniapp/src/lib/session.ts` → хранить `{ token, name }`; удалить `newDeviceId()` (строки 33-49)
      и поле `tg_id`. Комментарий о том, что «ключом служит сама сессия», больше не нужен — ключ есть.
- [ ] Новый `miniapp/src/api/client.ts` — единственная обёртка над `fetch`: базовый URL, заголовок
      `Authorization: Bearer`, разбор `detail` из ошибки, 401 → чистка сессии и возврат на экран входа.
      Сейчас каждая из 14 функций собирает это руками (`user.ts`, `lessons.ts`) — после блока 1
      все они переписываются на неё, включая антикеш `?_t=` (он не нужен: ответы без `Cache-Control`
      и так не кэшируются, а с `Authorization` — тем более).
- [ ] `miniapp/src/hooks/useTelegram.ts` → убрать `tg_id` (строка 15). Идентичность живёт в токене,
      компоненты про неё знать не должны. `tg_id` прокидывается из хука в 6 файлов — все правки там же.
- [ ] `miniapp/src/App.tsx` → вместо `checkUser`/`registerUser`: `tg.initData` + `start_param` →
      `POST /global/auth/telegram` → сохранить токен. Нет `window.Telegram.WebApp.initData`
      (открыли в браузере) → экран «Откройте приложение в Telegram» с кнопкой на бота.
- [ ] `miniapp/src/components/Welcome.tsx` → удалить: имя и `tg_id` приходят из проверенного
      `initData`, спрашивать их незачем. Телефон в кабинете нигде не показывается и не используется.

---

## Блок 2 — Расписание: `/global/lessons/*`

Общая схема ответа `MiniappLesson` (`back/schemas/` рядом с существующими схемами booking):

```
id, name, level, equipment, teacher_name, start_time (ISO), duration_min, price, total_spots,
time      = "18:00"                     # HH:MM, языконезависимо
teacher    = teacher_name               # поле оставлено ради существующей вёрстки
price_str  = "450 Kč"                   # валюта студии
color      = Hall.color или "#FCAE91"
badge      = "open" | "almost" | "full" # almost при 1-2 свободных
taken_spots: list[int]                  # занятые коврики, Reservation.status != 'cancelled'
is_booked_by_user: bool
```

Поле `dur` (`«60 хв»`) в контракт **не переносим** — клиент считает его из `duration_min`.

- [ ] `GET /global/lessons/date/{target_date}` → занятия студии за день, `status != 'cancelled'`,
      по возрастанию `start_time`. `taken_spots` — одним запросом `Reservation` по всем занятиям дня
      (не N+1 в цикле).
- [ ] `GET /global/lessons/next` → ближайшее занятие студии начиная с `now + min_booking_advance_min`
      (`StudioBookingSettings`), либо `204`. Заменяет `/lessons/today/1800`: параметры
      `client_hour`/`client_date` (`api/lessons.ts:50-72`) уходят — время студии задаёт сервер,
      а часовой пояс телефона к расписанию студии отношения не имеет.
- [ ] `GET /global/lessons/my` → `{ upcoming: [...+spot_number], past: [...+spot_number, rating] }`
      для клиента из токена. `past` — `start_time < now` и `status != 'cancelled'`; `upcoming` —
      остальные активные. Сортировка: `upcoming` по возрастанию, `past` по убыванию.
- [ ] Фронт `miniapp/src/api/lessons.ts` → три функции на новом `client.ts`, без `tg_id` в аргументах.
- [ ] Фронт: `LessonCard.tsx:55` и `BookingModal.tsx:105` — `lesson.dur` → `${lesson.duration_min} ${t('common.minutes')}`;
      `home.tsx:185` — то же для `heroDuration`.
- [ ] `ServiceScheduleSheet.tsx:60` — комментарий `ponytail:` про «студию фильтровать нечем»
      снимается: фильтр по услуге остаётся, филиал приезжает в блоке 5.

---

## Блок 3 — Запись, отмена, оценка

Все три ручки переиспользуют существующую механику CRM. **Ничего из неё не копируем** —
расхождение логики записи между Журналом и мини-приложением означает разъехавшиеся остатки
абонементов.

- [ ] `POST /global/reservations` `{ lesson_id, spot_number }` (`limiter.limit("10/minute")`):
      занятие своей студии и не `cancelled`; окно `min_booking_advance_min`; мест хватает;
      дубля нет; коврик свободен → иначе `409 "Це місце вже зайняте"` (текст ошибки мини-приложение
      уже показывает — `api/user.ts:156`); `find_eligible_subscription` + `charge_reservation`
      (без `assert_can_book`: клиент без абонемента должен получить возможность оплатить, а не 403 —
      как в `public_reserve`); `booking_channel="telegram"`; `notify` c1/a1/t1;
      `notify_subscription_remaining`. Образец — `public.py:136-285` и `reservations.py:21-104`.
- [ ] `POST /global/reservations/{lesson_id}/cancel`: своя активная бронь; дедлайн —
      `cancellation_deadline_min` из `StudioBookingSettings` (сейчас в мини-приложении отмена
      не ограничена ничем); `status="cancelled"`, `cancelled_at`, `refund_reservation`, `notify` c3.
- [ ] `POST /global/reservations/{lesson_id}/rate` `{ rating: 1..5 }`: только своя бронь и только
      прошедшее занятие (иначе `403`); upsert `Reservation.rating`. Это же закрывает «Рейтинг»
      из V2-5 задачи 11 — отдельная модель отзывов не нужна.
- [ ] Фронт `miniapp/src/api/user.ts` → `bookLesson`/`cancelLesson`/`rateLesson` без `tg_id`,
      новые пути; вызовы в `home.tsx:122,146`, `shedule.tsx:115,137`, `mylessons.tsx:129`.

---

## Блок 4 — Профиль, абонементы, история, настройки

- [ ] `GET /global/me` → `{ id, name, notifs_enabled, reminders_enabled, registration_date, invite_code }`.
      Поле `reg_date_str` не переносим — `profile.tsx:153` форматирует `registration_date` сам.
      `invite_code` — ленивая генерация, как в `GET /clients/{id}/invite-code` (V5-6): переиспользовать
      хелпер, а не писать второй генератор.
- [ ] `GET /global/me/subscriptions` → абонементы клиента: `id, type, total_classes, used_classes,
      classes_left, expires_at, status, is_frozen`. `type` — имя пакета (`SubscriptionPackage.name`),
      если `package_id` есть, иначе `ClientSubscription.type`.
- [ ] `GET /global/me/payments` → `ClientPayment` клиента по убыванию даты: `amount, amount_str,
      description, status, created_at, action_type, item_key`. `date_str` не переносим —
      `HistoryModal.tsx:81` форматирует `created_at` сам.
- [ ] `PATCH /global/me/settings` `{ notifs_enabled?, reminders_enabled? }` — одна ручка вместо двух
      (`api/user.ts:119-138`), оба поля опциональны.
- [ ] Фронт `profile.tsx:120` → `s.status === 'waiting'` заменить на `'pending'`: очередь абонементов
      в CRM называется так (`models/client.py:60-62`). Правится клиент, не сервер.
- [ ] Фронт `profile.tsx:170`, `SubscriptionCard` → `expires_str` → форматирование `expires_at`;
      замороженный абонемент (`is_frozen`) показать честно, а не как активный.
- [ ] Фронт `HistoryModal.tsx:81` → `date_str` → `new Date(item.created_at).toLocaleDateString(i18n.language, …)`.

---

## Блок 5 — Каталог вместо моков

Одна ручка на весь статичный контекст студии — мини-приложение дёргает её один раз при старте.

- [ ] `GET /global/studio` (`limiter.limit("30/minute")`):

```
studio   : { id, name, currency, logo_url, accent_color, language }        # Studio + StudioBookingSettings
rules    : { min_booking_advance_min, booking_window_days,
             cancellation_deadline_min }                                    # StudioBookingSettings
branches : [{ id, name, city, address, photo_url, opens, closes }]          # StudioBranch + BranchWorkingHours
services : [{ id, name, price, price_str, duration_min, color }]            # Service
packages : [{ id, name, class_count, price, price_str, duration_days }]     # SubscriptionPackage, is_active
can_pay_online : bool                                                       # у студии подключён Stripe Connect
```

- [ ] `miniapp/src/data/studios.ts` → удалить `STUDIOS`; тип `Studio` остаётся (переезжает в
      `api/studio.ts`), но без полей `tint`, `rating`, `reviews`, `map` — их источника нет и не будет.
      `IS_MULTI_STUDIO` считается из длины `branches` (у студии с одним филиалом лента и выбор
      исчезают сами — код уже так устроен).
- [ ] `AmbientBackdrop` использует `studio.tint` (`home.tsx:190`) → цвет свечения берём из
      `studio.accent_color` (брендинг студии, один на всё приложение). Это же наконец соединяет
      «Онлайн-запись → фирменный цвет» с реальностью.
- [ ] `StudioCard.tsx` → рейтинг и число отзывов убрать (`4.9 · 214` — выдуманные числа,
      источника нет). Карточка остаётся: фото, название, город, живой статус по часам работы.
- [ ] `StudioMapSheet.tsx` → **схему заменить списком филиалов** в той же шторке. Пины ставятся по
      `map: {x, y}` — координатам, которых в БД нет и которые владелец нигде не задаёт; рисовать
      реальные филиалы по выдуманным координатам нельзя. Прецедент в этом же приложении:
      `DirectionsRail.tsx:12-15` — «полоски заполненности были выдуманными → убрали».
      Карта с настоящими координатами — в BACKLOG (нужны `lat`/`lng` у филиала и поле в Каталоге CRM).
- [ ] `miniapp/src/data/services.ts` → удалить; `servicesOfStudio()` отдаёт услуги студии целиком
      (связи «услуга ↔ филиал» в модели нет), `studiosWithService()` удаляется вместе с фильтрацией
      филиалов по услуге в `home.tsx:269-273`.
- [ ] `DirectionsRail.tsx:20-67` → шесть зашитых направлений заменить услугами студии; иконка
      подбирается по `id` из существующей карты, для незнакомой услуги — дефолтная. Названия
      приходят на языке студии и не переводятся: `t('lesson.name.…', { defaultValue })` это уже умеет.
- [ ] `BuyModal.tsx:23-28` → `PLANS` заменить на `packages`; `priceStr` берётся с сервера.
      Ключи переводов `subscription.*.name` остаются фолбэком для демо-данных.
- [ ] `locales/{ru,en,uk,cz}.json` → удалить `common.currency` и все его использования
      (`BuyModal.tsx:41`, `StudioSheet.tsx:121`): валюта приходит с сервера в готовой строке.
- [ ] Реферальная ссылка: `home.tsx:164` и `profile.tsx:97` → `https://t.me/{bot_username}?startapp=ref_{invite_code}`
      (`bot_username` — из `/global/studio`, он уже сохраняется при подключении бота,
      `services/telegram_bot.py:86`). В `POST /global/auth/telegram`: `start_param` вида `ref_<code>` →
      `ReferralRecord(status="pending")` для нового клиента. Начисление реферу уже реализовано —
      оно срабатывает на первом визите (`public.py:236-259`), дублировать не нужно.

---

## Блок 6 — Оплата абонемента (Stripe Connect)

Отделим от остальных блоков: без него приложение уже полностью рабочее — абонемент продаётся
в студии через кассу CRM и сразу виден клиенту.

- [ ] **Удалить форму карты из `PaymentModal.tsx`** (строки 26-41, 102-135) — сбор PAN/CVV в нашем
      интерфейсе недопустим независимо от того, чем закончится этот блок. В CRM ручной ввод карты
      уже удалён по той же причине (STATUS, раздел «Тариф и оплата»). Кнопки Apple/Google Pay
      (строки 141-168) — тоже: их обслуживает страница Stripe, а не мы.
- [ ] `POST /global/checkout/session` `{ package_id }` → заявка `StripeCheckout` (`status=pending`)
      + сессия Stripe **на подключённом аккаунте студии** (`services/stripe_connect.py`,
      образец — `routers/checkout/stripe_pay.py:100`). Отдаём `url` hosted-страницы, мини-приложение
      открывает её через `tg.openLink` — Stripe.js в мини-приложение не тянем.
- [ ] `apply_paid` (`stripe_pay.py:176`) → научить проводить клиентскую заявку:
      `attach_subscription(mark_paid=True)` + строка `ClientPayment(action_type="buy_subscription",
      item_key=<ключ пакета>)` + `notify` c4. Идемпотентность уже держится на `FOR UPDATE` по заявке —
      второй колбэк ничего не делает.
- [ ] `can_pay_online == false` (студия не подключила Stripe) → `BuyModal` показывает
      «Абонемент можно купить в студии» вместо кнопки оплаты. Пустая кнопка, ведущая в ошибку, хуже
      честного текста.
- [ ] `POST /global/users/{tg_id}/buy-subscription` в контракт **не переносим**: тело запроса
      содержит `amount` и `total_classes` (`api/user.ts:28-33`) — то есть клиент сам называет цену
      и число занятий. Цену определяет `SubscriptionPackage` на сервере.
- [ ] `BuyModal.finishPurchase` (строки 43-62) → после возврата из Stripe перечитывать
      `/global/me/subscriptions` (`onSuccess` уже дёргает `refreshTick` в `profile.tsx:348`).

---

## Блок 7 — Честные ошибки и приёмка

- [ ] `miniapp/src/lib/notify.ts` — один хелпер: `tg.showAlert` внутри Telegram, `alert` вне его.
      Заменить 6 вызовов `alert()` (`home.tsx:135,153,157`, `shedule.tsx:126,142,146`,
      `mylessons.tsx:132`, `BuyModal.tsx:57,60`). Своих тостов не пишем — у Telegram есть нативный
      диалог, и он выглядит уместнее собственного.
- [ ] Убрать подстановки-выдумки: `home.tsx:184-186` (`'18:00'`, `total_spots || 5`),
      `home.tsx:242-246` (`reformer_glow`, `'Олена Соколова'`), `BookingModal.tsx:150` (`total || 8`).
      Нет ближайшего занятия → `EmptyState` («Ближайших занятий нет»), а не карточка выдуманного.
- [ ] `console.error` в 8 местах остаётся (диагностика), но **везде**, где ошибка видна
      пользователю как пустой экран, добавить `EmptyState` с текстом ошибки: `profile.tsx:50,61`,
      `mylessons.tsx:44`, `HistoryModal.tsx:30` сейчас молча показывают пустоту при 500.
- [ ] `cd miniapp && npm run build && npm run lint` — чисто.
- [ ] `python -m routers.booking.miniapp` — self-check HMAC зелёный.
- [ ] Ручной сквозной прогон в реальном боте (@VeloraCRM_bot, аккаунт sadomat31@gmail.com):
      открыть по диплинку → расписание дня совпадает с Журналом CRM → бронь коврика → бронь видна
      в Журнале, место занято, занятие списано с абонемента → отмена → место освободилось, занятие
      вернулось → оценка прошедшего занятия → профиль и история совпадают с карточкой клиента в CRM.
- [ ] Изоляция: клиентский токен на `/clients`, `/schedule`, `/analytics` → 401; чужой `lesson_id`
      из другой студии → 404; подделанный `initData` → 401.
- [ ] `docs/TZ/STATUS.md` → раздел «Клиентское мини-приложение» из «Осталось на моках» переезжает
      в работающее с честным перечнем того, что осталось (кабинет вне Telegram, карта филиалов).
- [ ] `docs/BACKLOG/README.md` → строку `EPIC_V2_5_BACKLOG.md` пометить как заменённую этим эпиком.

---

## Порядок выполнения

`0 → 1 → 2 → 3 → 4 → 5 → 7 → 6`

Блок 1 первым и неделимо: он задаёт форму всех остальных ручек (клиент из токена, а не из URL) и
закрывает дыру доступа — выкатывать блоки 2-4 поверх `tg_id`-в-URL нельзя. Дальше по слоям снизу
вверх: чтение расписания (2) → действия с ним (3) → личные данные (4) → замена моков каталога (5).
Блок 7 идёт **до** оплаты: сквозной прогон должен пройти на бесплатном пути, иначе непонятно,
что именно сломалось в блоке 6. Оплата (6) последней — она отделима и одна зависит от того,
подключил ли владелец Stripe Connect.

Оценка: 1 — ~4:00, 2 — ~3:00, 3 — ~3:00, 4 — ~2:30, 5 — ~4:00, 6 — ~3:00, 7 — ~2:30, 0 — ~0:30.
**Итого ≈ 22:30.** Линия реза, если эпик придётся сокращать: блок 6 (абонемент продаётся в кассе
CRM) и внутри блока 5 — лента филиалов (у студии с одним филиалом её и так не видно).

---

## Явно НЕ делаем (YAGNI)

- **TanStack Query в мини-приложении.** `useState` + `refreshTick` (`home.tsx:39`, `shedule.tsx:31`,
  `profile.tsx:30`) работают и после переезда на реальные ручки работать не перестанут. Тащить
  клиент кэша ради четырёх экранов — лишняя зависимость и лишний слой.
- **Кабинет вне Telegram** (вход по коду на email). Требует своего OTP-контура для клиентов;
  быстрая запись с сайта уже закрыта веб-виджетом. В BACKLOG.
- **Мультистудийность.** «Студии» в ленте — филиалы одной студии CRM. Настоящее переключение
  между студиями — отдельный эпик BACKLOG (`EPIC_V2_6`).
- **Карта филиалов с настоящими координатами.** Нужны `lat`/`lng` у `StudioBranch` и поле ввода
  в Каталоге CRM — это правка `front/`, которую эпик обещал не делать. В BACKLOG.
- **Модель `Review`.** `Reservation.rating` + `review_text` уже есть, уникальность обеспечена
  самой бронью.
- **Избранные филиалы на сервере** (`lib/likes.ts`). `localStorage` переживёт переезд, формат
  (массив id) не меняется; ручка «избранное клиента» появится тогда, когда её кто-то попросит.
- **Заморозка абонемента из мини-приложения.** Заморозка — решение студии, а не клиента; в CRM
  она уже есть, дублировать управление ею наружу не нужно (флаг `is_frozen` только показываем).
- **WebSocket / живые обновления.** Расписание перечитывается при открытии экрана и после
  брони — этого достаточно для приложения, где пользователь делает одно действие за сеанс.

---

## Definition of Done

1. Мини-приложение работает против `back/` без единого стороннего сервиса: `grep -rn "127.0.0.1"
   miniapp/src` пусто, все 12 отсутствовавших ручек отвечают.
2. `grep -rn "tg_id" miniapp/src` пусто — идентичность только в токене.
3. `grep -rn "STUDIOS\|SERVICES\|PLANS" miniapp/src` пусто — моков каталога не осталось.
4. Подделанный `initData` не пускает; клиентский токен на CRM-ручках даёт 401; чужая студия — 404.
5. Бронь из мини-приложения мгновенно видна в Журнале CRM, списывает занятие с абонемента и шлёт
   c1/a1/t1; отмена возвращает и место, и занятие.
6. Цифры профиля (абонемент, остаток, история оплат) совпадают с карточкой клиента в CRM.
7. Переключение языка меняет **все** подписи; валюта приходит из настроек студии и не зашита
   ни в один словарь.
8. `cd miniapp && npm run build && npm run lint` — чисто; `python -m routers.booking.miniapp` — зелёный.
9. `docs/TZ/STATUS.md` обновлён по факту.
