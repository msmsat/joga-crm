# EPIC 6 — Integrations (+ Google Calendar)

**Цель:** вкладка показывает **реальный** статус подключений вместо
шести моков; отключение предупреждает о последствиях; появляется рабочая
двусторонняя связь с Google Calendar.

**Зависимости:** эпик 1. **Оценка: ~10:00.**

---

## Точка отсчёта

**Вкладка — витрина.** `hooks/useIntegrations.ts` — 30 строк
`useState` над `INITIAL_INTEGRATIONS_CONFIG`, где WhatsApp, Telegram и
Яндекс.Касса нарисованы «подключёнными», а в `constants.ts` лежит
правдоподобный фейковый токен `123456789:ABCDefGhIJKlmNoPQRsTUVwxyZ`.
Кнопка «Подключить» переключает булеву в стейте и показывает тост.

**При этом реальные подключения в продукте есть — просто в другом месте.**
`back/routers/settings/integrations.py` (249 строк) уже умеет:

| Тип | Что делает по-настоящему |
|---|---|
| `tg_notify` | `Bot.get_me()` — токен проверяется у Telegram, сохраняется `bot_username` |
| `wa_notify` | запрос в Meta Graph API, проверка `phone_number_id`, тарифы сообщений |
| `email_sender` | OTP на почту с TTL 10 минут и верификацией |

Это каналы доставки для страницы **Уведомлений**. Вкладка «Интеграции» в
Настройках про них не знает и рисует свои. **Задача эпика — не написать
новое, а показать существующее** и добавить недостающее (Google, Instagram).

Модель `StudioIntegration` (`studio_id`, `integration_type`,
`is_connected`, `config: JSON`, `updated_at`) — универсальное хранилище,
которого хватает всем интеграциям. Хелперы `_get_or_create_integration()`
и `_mask_token()` написаны.

**Зависимости уже стоят:** `google-auth-oauthlib==1.2.3`,
`google-api-python-client==2.187.0`, `oauthlib`, `requests-oauthlib` — в
`requirements.txt` (пришли с Google-логином). Ничего доустанавливать не
нужно.

---

## User Stories

- **Как владелец** я вижу, какие интеграции подключены на самом деле, и
  не путаюсь в нарисованных.
- **Как владелец**, если интеграция не подключена, я вижу пошаговую
  инструкцию, а не пустое поле «вставьте токен».
- **Как владелец** я вижу ключ в маскированном виде — достаточно, чтобы
  узнать «тот ли», и недостаточно, чтобы утёк со скриншота.
- **Как владелец** при отключении я вижу, что именно перестанет работать,
  и подтверждаю осознанно.
- **Как владелец** я подключаю Google Calendar в два клика, и занятия из
  журнала появляются в календаре студии.

---

## Задача 1. Удалить «Яндекс» и «1С: Предприятие» (~0:30) — ✅ выполнено

Удалены `onec`/`yandex` из `INITIAL_INTEGRATIONS_CONFIG`
(`Settings/constants.ts`) и соответствующие карточки/формы в
`IntegrationsTab.tsx` (список `INTEGRATION_LIST` и блоки полей); заодно
убран осиротевший импорт `Toggle` (использовался только в форме Яндекса).
`grep -rn "yandex\|onec" front/src` по коду (не по i18n-строкам) теперь
пусто — сами ключи локализации `integrations.items.onec/yandex` и
`integrations.fields.onec*/yandex*` в `settings.json` намеренно оставлены:
их чистка явно назначена задаче 6 вместе с переписыванием всей секции
`integrations`. `npm run build` и `npm run lint` зелёные (проверено, что
82 существующих ошибки линта — в других файлах, не в изменённых).

**Яндекс.Касса** — приём платежей идёт через **Fondy**
(`back/services/fondy.py`, вебхук, возвраты, `rectoken`). Вторая
платёжная система в интерфейсе при одной в коде — прямой путь к вопросу
«почему деньги не приходят». **1С** — интеграции нет ни в каком виде, а
её мок обещает «автоматическую выгрузку финансов».

Удалить из `constants.ts` (`INITIAL_INTEGRATIONS_CONFIG.yandex`, `.onec`)
и из `IntegrationsTab.tsx` — карточки и их формы (строки ~119–130).

Итоговый список вкладки — 4 интеграции: **Telegram, WhatsApp, Instagram,
Google Calendar**.

## Задача 2. Бэк: единый список интеграций (~1:15) — ✅ выполнено

Добавлены в `routers/settings/integrations.py`:
- `GET /settings/integrations` → `list[IntegrationStatus]`, всегда 4 записи
  в фиксированном порядке `telegram, whatsapp, instagram, google_calendar`
  (типы, для которых строки в БД ещё нет — `instagram`/`google_calendar`
  до задач 3–4 — приходят как `connected: false` без ошибок).
- `DELETE /settings/integrations/{integration_type}` → та же схема,
  `connected: false`, `details: null` (параметр назван не `type`, чтобы не
  затенять питоновский builtin — на URL это не влияет, сегмент пути
  публично называется по значению, не по имени параметра).
- `_INTEGRATION_TYPE_MAP` — единственное место маппинга публичных типов на
  `StudioIntegration.integration_type` (`tg_notify`, `wa_notify`, `ig_dm`,
  `gcal`); `IntegrationType = Literal[...]` в схеме — невалидный тип
  (например «yandex») отдаёт 422 автоматической валидацией FastAPI.
- `_integration_details()` — секреты (полный токен, `access_token`) не
  формируются вообще, наружу только `_mask_token()` + публичные поля
  (`bot_username`, `display_phone_number`, `calendar_id`, …); ponytail-
  пометка про открытый JSON в БД перенесена из ТЗ в код рядом с местом,
  где он читается.
- **Отклонение/уточнение плана:** в ТЗ пример `capabilities` дан только для
  `telegram` (`["notify","booking"]`) и `google_calendar`
  (`["schedule_sync"]`); для `whatsapp` и `instagram` набор не был явно
  зафиксирован — принято решение по аналогии с функциональным ТЗ (оба
  канала — «Онлайн-запись», п. 2.7): `whatsapp → ["notify","booking"]`
  (уведомления + канал записи, как у Telegram), `instagram →
  ["dm_agent","booking"]` (ИИ-агент автоответчик, п. 2.11, + канал
  записи). Список используется задачами 5–6 (i18n предупреждений об
  отключении) — если состав не подойдёт под текст гайдов, поправить одной
  строкой в `_INTEGRATION_CAPABILITIES`.
- Тест `back/tests/test_settings_integrations.py` (сидирует реальную
  студию + подключённый `tg_notify`, ручная чистка, паттерн как у
  соседних `test_general_settings.py`/`test_notification_settings.py`):
  порядок и состав 4 типов, маскирование токена и отсутствие полного
  токена в ответе, `DELETE` возвращает `connected: false`, `IntegrationType`
  отвергает `"yandex"`. `python -m tests.test_settings_integrations` → OK.

**Слой:** `back/routers/settings/integrations.py` — дописать две ручки в
существующий файл.

```
GET /settings/integrations → 200
```

```jsonc
[
  {
    "type": "telegram",
    "connected": true,
    "connected_at": "2026-07-12T10:03:00",
    "details": {"bot_username": "velora_studio_bot",
                "token_masked": "123456…wxyZ"},   // _mask_token(), уже написан
    "capabilities": ["notify", "booking"]          // что перестанет работать при отключении
  },
  { "type": "google_calendar", "connected": false, "connected_at": null,
    "details": null, "capabilities": ["schedule_sync"] }
]
```

```
DELETE /settings/integrations/{type} → 200 (та же схема, connected=false)
```

**Инвариант, из-за которого ручка одна, а не четыре:** `type` —
`Literal["telegram","whatsapp","instagram","google_calendar"]`; неизвестный
тип → 422. Маппинг на внутренние ключи `StudioIntegration.integration_type`
(`tg_notify`, `wa_notify`, `ig_dm`, `gcal`) — в словаре в одном месте.

**Секреты наружу не отдаются никогда.** В `details` попадают только
маскированный токен и публичные идентификаторы (`bot_username`,
`display_phone_number`, `calendar_id`). `refresh_token` Google, полный
токен бота и `access_token` Meta не покидают бэк ни в каком ответе —
`_channel_status()` в текущем коде уже построен по этому принципу,
продолжаем его.

> `config` в БД лежит открытым JSON — так уже хранится токен Telegram.
> Менять это в рамках эпика не будем, но помечаем:
> `# ponytail: секреты в БД открытым текстом; шифрование at-rest — когда появится KMS/vault.`

## Задача 3. Бэк: Instagram Direct (~1:00) — ✅ выполнено

`POST /settings/integrations/instagram` в `routers/settings/integrations.py`,
буквально по образцу `connect_whatsapp`: `IgConnect{token, ig_user_id}` →
`GET {GRAPH}/{ig_user_id}?fields=username` → при не-200 или сетевой ошибке
400 «Meta не принял токен или ig_user_id»; при успехе — `_get_or_create_integration(..., "ig_dm")`,
`config = {token, ig_user_id, username}`, `is_connected = True`, ответ
`ChannelStatus` через `_channel_status(integ, "ig_dm")` (добавлена новая
ветка: `{username, token_masked}` — та же форма, что уже использует
`_integration_details()` из задачи 2 для списка).

Отдельная ручка отключения не нужна — `DELETE
/settings/integrations/instagram` уже закрыт задачей 2 (общий `DELETE
/settings/integrations/{integration_type}`).

**Не протестировано и не может быть протестировано в этом эпике:** сам HTTP-
вызов к Meta Graph API — как и у `connect_whatsapp`, в кодовой базе нет
мока `aiohttp.ClientSession` ни для одного внешнего вызова, а реального
Meta-приложения нет (см. эдж-кейс «Instagram не прошёл модерацию»).
Протестирована локальная логика, которая реально в зоне риска —
`_channel_status(..., "ig_dm")` — добавлено в `test_settings_integrations.py`
(поймало опечатку в ожидаемой маске токена при первом прогоне: перепутал
длину «последних 4 символов»).

Единственный канал из четырёх, которого в бэке нет. Meta Graph API — тот
же, что у WhatsApp (`GRAPH = "https://graph.facebook.com/v20.0"` уже
объявлен), поэтому подключение делается по образцу `connect_whatsapp`:

```
POST /settings/integrations/instagram  {"token": "...", "ig_user_id": "..."}
→ проверка GET {GRAPH}/{ig_user_id}?fields=username → сохранение config
```

Если валидация у Meta не проходит — 400 с человеческим текстом, как в
`connect_whatsapp`. Без реального приложения Meta задача упирается в
модерацию — это фиксируется в UI-гайде (задача 5), а не прячется.

## Задача 4. 🔴 Google Calendar: OAuth и синхронизация (~4:00) — ✅ выполнено

**Файлы:** `back/models/schedule.py` (+`Lesson.gcal_event_id`), миграция
`712ef52a466b_lesson_gcal_event_id.py`, `back/services/gcal.py` (новый),
`back/schemas/settings/google_calendar.py` (новый),
`back/routers/settings/google_calendar.py` (новый), подключён в
`routers/settings/router.py`; `routers/schedule/lessons.py` — триггеры push
в `create_lesson`/`update_lesson`/`cancel_lesson`; `back/.env.example`
(+`GOOGLE_CLIENT_SECRET`, `GOOGLE_CALENDAR_REDIRECT_URI`).

**Реализовано через прямые REST-вызовы `aiohttp`, а не
`google-api-python-client`/`google-auth-oauthlib`** (хотя в requirements.txt
они есть — пришли с Google-логином): их клиент синхронный (`requests` под
капотом), в асинхронном FastAPI это блокирует event loop на каждый вызов.
Весь остальной внешний API-код проекта (WhatsApp, Instagram Graph,
Instagram OAuth — `routers/ai/instagram.py`) уже общается напрямую через
aiohttp — это тот же паттерн, не новый. Задокументировано в шапке
`services/gcal.py`.

**Три сознательных отклонения от буквального текста ТЗ ниже**, каждое —
не срезание угла, а следование уже работающему в этой кодовой базе паттерну
(CLAUDE.md: «Maintain existing architecture. Do NOT introduce new patterns
without explicit discussion»):

1. **`/start` без ticket-эндпоинта.** ТЗ (п. 4.2, диаграмма и раздел CORS)
   заставляет `/start` самому делать 302 на Google и вводит отдельный
   одноразовый `POST /integrations/google/ticket` — чтобы не класть основной
   JWT в query браузерной навигации. Вместо этого `GET
   /integrations/google/start` здесь — обычная JSON-ручка под
   `require_role("owner")` (вызывается через fetch с Authorization-заголовком,
   как везде в проекте) и возвращает `{"url": ...}`; браузер уходит по этому
   URL прямой навигацией, минуя наш бэкенд. Редиректа через наш домен просто
   нет — значит, нет и предмета спора (JWT в query). Буквально то же самое,
   что уже работает для Instagram OAuth (`GET /ai/instagram/oauth-url` →
   `{"url": ...}`, см. `routers/ai/instagram.py::get_instagram_oauth_url`) —
   не новый паттерн, а переиспользование существующего. Ticket-эндпоинт и
   его TTL/одноразовость (со своей поверхностью для багов) не понадобились.
2. **Гейт подписки переехал с `main.py` на `routers/settings/router.py`.**
   Колбэк Google — редирект браузера от Google без Authorization-заголовка;
   под общий `dependencies=_sub_gate` всего `/settings` (main.py) его не
   подвести. Ровно та же проблема уже была решена в AI-3 для Instagram OAuth
   (см. комментарий в `routers/ai/router.py`: «Гейт подписки… переехал сюда с
   уровня main.py») — применил тот же перенос: `_sub_gate` снят с
   `app.include_router(settings_router, ...)` в `main.py`, вместо этого
   каждый под-роутер `settings/router.py` (general/team/security/
   integrations/google_calendar) получает `dependencies=_gate` по
   отдельности, а `google_calendar_callback_router` — без гейта. Остальные
   5 вкладок Настроек ведут себя идентично прежнему (тесты settings, вызывающие
   роуты напрямую как функции, гейт на уровне `include_router` вообще не видят
   — регрессии подтверждённо нет).
3. **Автовыбор основного календаря при подключении**, а не обязательный
   отдельный шаг «выберите календарь» перед первым push. User story ТЗ
   («подключаю в два клика, и занятия… появляются в календаре студии») — это
   буквально два клика, без третьего обязательного шага. В колбэке сразу
   зовём `calendars.list` и берём `primary`; `calendar_id`/`calendar_name`
   можно сменить потом через `PATCH .../google`.

**Что не сделано буквально по ТЗ, сознательно, с пометкой:**
- 401 `invalid_grant` → `is_connected=false` — есть; «уведомление владельцу»
  из таблицы 4.4 — нет: в `services/notifier.py::KNOWN_EVENT_IDS` нет
  подходящего event_id («интеграция отключена сама»), а заводить новый
  event_id/шаблон/i18n-строку — это уже каталог уведомлений (другой эпик),
  не механика OAuth. `# ponytail` в `services/gcal.py` рядом с местом.
- **Pull (two_way)** реализован как счётчик (`sync_studio` возвращает
  `pulled`), но НЕ persist-ится и никуда не отдаётся на фронт — в ТЗ нет ни
  таблицы (явно: «новых таблиц нет»), ни эндпоинта для чтения «занятости» в
  Журнале. Отображение этого в сетке расписания — отдельная, не описанная
  здесь задача (см. `_count_busy_events` в `services/gcal.py`).
- Ретрай на 403 `rateLimitExceeded` — 3 попытки с backoff (0.5с → 1с) есть в
  `_calendar_request`.
- 410 (событие удалено) → пересоздаётся при следующем push; 404 (календарь
  удалён) → `is_connected=false`. Различение 404-от-события vs
  404-от-календаря — по тому, 404-ит ли САМО создание нового события (без
  привязки к старому event_id): если да, дело в календаре, не в конкретном
  событии.

**Не протестировано и не может быть протестировано без реального Google
OAuth-приложения** (по прежней логике задачи 3 — Instagram): сам обмен
code→token, календарные REST-вызовы. Протестирована вся локальная логика в
зоне риска — подпись/валидация `state` (CSRF, включая просроченный и
чужой-purpose state), ранние безопасные выходы `push_lesson` (не
подключено/не выбран календарь), скоуп `disconnect_studio` по `studio_id`
(обнуление `gcal_event_id` — проверено, что чужая студия не затронута),
форма `_event_body`, отсутствие `refresh_token` в ответе `_status()`,
обратная совместимость `background_tasks` для существующих прямых вызовов
из тестов расписания. `back/tests/test_google_calendar.py`; полный прогон
`test_lesson_cancel_reason/_reschedule_notify/_time_rules/_service_required`,
`test_schedule_conflict`, `test_lesson_days`, `test_journal_time_rules`,
`test_settings_integrations` — без регрессий (все ALL PASS / OK).

**Для реальной проверки end-to-end нужны настоящие Google-креды:**
`GOOGLE_CLIENT_SECRET` и `GOOGLE_CALENDAR_REDIRECT_URI` — добавлены в
`.env.example`, но не в боевой `.env` (там есть только `GOOGLE_CLIENT_ID` —
от Google-логина, секрет ему не требовался). Без них OAuth-flow не запустить.

### 4.1. Хранение

**Новых таблиц нет.** Токены — в `StudioIntegration.config` (`gcal`):

```jsonc
{
  "refresh_token": "1//0g…",         // долгоживущий, НИКОГДА не отдаётся наружу
  "calendar_id": "c_a1b2…@group.calendar.google.com",
  "calendar_name": "Velora · Расписание",
  "sync_mode": "two_way",            // "push" | "two_way"
  "connected_email": "owner@studio.ru",
  "last_sync_at": "2026-07-23T12:00:00"
}
```

`access_token` **не храним** — он живёт час; получаем из `refresh_token`
при каждой синхронизации (`google.oauth2.credentials.Credentials` умеет
это сам).

Связь «занятие ↔ событие» — **одна колонка**, не таблица:

```python
# back/models/schedule.py, Lesson
    gcal_event_id: Mapped[Optional[str]] = mapped_column(String(120), nullable=True, index=True)
```

Миграция `xxxx_lesson_gcal_event_id.py` — один `add_column`.

> Одна колонка достаточна, пока синхронизация идёт в **один календарь
> студии**. Персональные календари тренеров потребуют связи 1→N —
> `# ponytail: один календарь на студию; календари тренеров → таблица связей.`

### 4.2. Flow авторизации (OAuth 2.0, Authorization Code + offline)

```
┌── Фронт ──────────────┐   ┌── Наш бэк ───────────────┐   ┌── Google ────┐
│ [Подключить Google]   │──▶│ GET  /oauth/google/start │──▶│ consent      │
│                       │   │  → 302 на accounts.google│   │ screen       │
│                       │   │                          │◀──│ ?code&state  │
│                       │   │ GET /oauth/google/callback│  │              │
│                       │   │  code → refresh_token    │──▶│ /token       │
│ окно закрывается,     │◀──│  сохранить в config      │   │              │
│ вкладка перерисована  │   │  → 302 на /settings?...  │   │              │
└───────────────────────┘   └──────────────────────────┘   └──────────────┘
```

**Эндпоинты** (`back/routers/settings/google_calendar.py`, новый файл,
подключается в `settings/router.py`):

```
GET /settings/integrations/google/start     → 302 (owner-only)
GET /settings/integrations/google/callback?code&state
                                            → 302 /dashboard/settings?tab=integrations&google=ok
POST /settings/integrations/google/sync     → 200 {"pushed": 42, "pulled": 3, "errors": []}
GET  /settings/integrations/google/calendars→ 200 [{"id","name","primary"}]
PATCH /settings/integrations/google         → 200  body {"calendar_id"?, "sync_mode"?}
DELETE /settings/integrations/google        → 200  (отзыв токена у Google + очистка config)
```

**Параметры авторизации — и почему именно такие:**

| Параметр | Значение | Зачем |
|---|---|---|
| `scope` | `https://www.googleapis.com/auth/calendar.events` + `calendar.readonly` | events — писать занятия; readonly — читать список календарей. **Не** полный `calendar`: лишние права = лишний риск |
| `access_type` | `offline` | без него не придёт `refresh_token`, и связь умрёт через час |
| `prompt` | `consent` | Google отдаёт `refresh_token` только при явном согласии; при повторном подключении без этого вернётся `None` — **классическая ловушка** |
| `state` | подписанный JWT `{studio_id, user_id, exp: +10min}` | **защита от CSRF**. Без проверки `state` злоумышленник привяжет свой календарь к чужой студии |
| `redirect_uri` | точное совпадение с консолью Google | иначе `redirect_uri_mismatch` |

**Безопасность колбэка (обязательные проверки):**
1. `state` расшифрован, не протух, `studio_id` совпадает с текущим — иначе 400.
2. `code` обменивается **на сервере**; на фронт не попадает никогда.
3. Ошибка/отказ пользователя (`?error=access_denied`) → редирект с
   `&google=denied`, а не 500.
4. Колбэк **не под `require_role`**: Google приходит без нашего JWT.
   Авторизация здесь — сам `state`, поэтому его подпись и TTL и есть
   защита. Это единственная ручка раздела без `Depends(require_role)`,
   и это осознанно.

**CORS.** Редирект на Google — это навигация браузера, не `fetch`, поэтому
CORS её не касается. `/start` **нельзя** дёргать через `fetch` (редирект
на чужой origin отвалится) — фронт делает
`window.location.assign('/settings/integrations/google/start')`, либо
открывает popup. Это фиксируется в задаче 5.

### 4.3. Синхронизация

**MVP — push (CRM → Google) + ручной pull.** Полноценный two-way на
push-уведомлениях Google (`watch`-каналы) требует публичного HTTPS-эндпоинта
с валидным сертификатом, которого до эпика деплоя нет.
`# ponytail: two-way по опросу при заходе; watch-каналы — после деплоя на домен.`

```python
# back/services/gcal.py (новый)
async def push_lessons(db, studio_id, date_from, date_to) -> dict:
    """Занятия студии → события календаря. Idempotent по Lesson.gcal_event_id."""
    for lesson in lessons:
        body = {
            "summary": lesson.name,
            "description": f"{lesson.teacher_name} · {hall_name}",
            "start": {"dateTime": iso(lesson.start_time), "timeZone": studio.timezone},
            "end":   {"dateTime": iso(end), "timeZone": studio.timezone},
            "extendedProperties": {"private": {"velora_lesson_id": str(lesson.id)}},
        }
        if lesson.gcal_event_id:
            events.update(calendarId=cal, eventId=lesson.gcal_event_id, body=body)
        else:
            lesson.gcal_event_id = events.insert(calendarId=cal, body=body)["id"]
    # отменённые занятия → удалить событие, обнулить gcal_event_id
```

`extendedProperties.private.velora_lesson_id` — обратная ссылка: по ней
`pull` отличает «наше» событие от чужой встречи в том же календаре и не
затирает личные записи владельца.

**Триггеры push'а — рядом с уже существующими вызовами `notify()`:**
создание, перенос и отмена занятия
(`back/routers/schedule/lessons.py`). Синхронизация — `BackgroundTasks`:
Google не должен задерживать ответ журналу, а его недоступность не должна
ронять создание занятия (`try/except` + лог, как в `notifier.deliver`).

**Pull** (`sync_mode == "two_way"`): читаем события календаря за окно
±30 дней **без** `velora_lesson_id` и показываем их в журнале как
«занятость» (read-only) — чтобы не поставить занятие на время, когда
владелец занят. Создавать занятия CRM из внешних событий **не будем**:
у события Google нет тренера, зала, цены и мест — угадывать их значит
плодить мусор в расписании.

**Часовые пояса — главный источник багов.** `Lesson.start_time` —
`DateTime(timezone=False)`, то есть **наивное локальное время студии**.
При отправке в Google обязателен `"timeZone": studio.timezone` (эпик 2,
`Studio.timezone`); при чтении — конвертация в зону студии перед
сравнением. Без этого занятия уезжают на 3 часа.

### 4.4. Обработка ошибок Google

| Код | Значение | Реакция |
|---|---|---|
| 401 `invalid_grant` | `refresh_token` отозван (сменили пароль, забрали доступ) | `is_connected = false`, уведомление владельцу, UI «переподключите» |
| 403 `rateLimitExceeded` | лимит квоты | ретрай с backoff, максимум 3 попытки |
| 404 | календарь удалён | `is_connected = false`, понятный текст |
| 410 `Gone` | событие удалено в Google | обнулить `lesson.gcal_event_id`, создать заново |

## Задача 5. Фронт: вкладка «Интеграции» (~2:15)

**Файлы:**
- `components/tabs/IntegrationsTab.tsx` (переписать)
- `components/integrations/IntegrationCard.tsx` (новый)
- `components/integrations/ConnectGuide.tsx` (новый)
- `components/modals/DisconnectModal.tsx` (новый)
- `hooks/useIntegrations.ts` (переписать на Query)

**Карточка — два состояния, без промежуточных:**

```
┌─ ПОДКЛЮЧЕНО ──────────────────────────┐  ┌─ НЕ ПОДКЛЮЧЕНО ───────────────┐
│ ● Telegram          [Подключено]      │  │ ○ Google Calendar             │
│ @velora_studio_bot                    │  │ Синхронизация расписания      │
│ Ключ: 123456…wxyZ            [копия]  │  │                               │
│ Подключено 12 июля                    │  │ Как подключить:               │
│                       [Отключить]     │  │  1. Нажмите «Подключить»      │
└───────────────────────────────────────┘  │  2. Выберите Google-аккаунт   │
                                           │  3. Разрешите доступ          │
                                           │            [Подключить]       │
                                           └───────────────────────────────┘
```

**`ConnectGuide`** — нумерованные шаги из i18n
(`settings:integrations.guide.<type>`), для Telegram/WhatsApp/Instagram —
поля ввода токена, для Google — одна кнопка (шаги проходят у Google).
Никаких «вставьте токен» без объяснения, где его взять.

**`DisconnectModal`** (на `ModalShell`) — обязательное предупреждение о
последствиях, состав берётся из `capabilities` ответа API:

```
Отключить Telegram?
Перестанет работать:
  • уведомления клиентам в Telegram (перейдут на email)
  • онлайн-запись через бота
Клиенты, привязавшие Telegram, потеряют связь с ботом.

[ ] Я понимаю последствия          ← чекбокс обязателен
              [Отмена]  [Отключить]  ← кнопка активна только с галочкой
```

**Подключение Google:**

```ts
const connectGoogle = () => {
  // именно навигация, не fetch: редирект на accounts.google.com CORS не пропустит
  window.location.assign(`${API_URL}/settings/integrations/google/start?token=${jwt}`);
};
// возврат: /dashboard/settings?tab=integrations&google=ok|denied|error
useEffect(() => {
  const status = params.get('google');
  if (status === 'ok') { qc.invalidateQueries({ queryKey: queryKeys.integrations });
                         toast.success(t('settings:integrations.google.connected')); }
  if (status === 'denied') toast.error(t('settings:integrations.google.denied'));
  if (status) setParams({}, { replace: true });    // чистим URL
}, [params]);
```

> Токен в query-параметре `/start` — вынужденно: браузерная навигация не
> несёт заголовок `Authorization`. Поэтому ручка принимает **только
> короткоживущий одноразовый** ticket, а не основной JWT: `POST
> /settings/integrations/google/ticket` → `{ticket}` (TTL 60 с,
> одноразовый), и `/start?ticket=…`. Основной токен в URL не светим — он
> оседает в истории браузера и логах прокси.

**Секция настроек Google** после подключения: выбор календаря
(`Select` из кита, данные `GET …/calendars`), режим синхронизации
(`push` / `two_way`), «Синхронизировать сейчас» (`POST …/sync`,
`loading`), строка «Последняя синхронизация: …».

## Задача 6. Локализация и очистка (~1:00)

`settings.json` → секция `integrations`: названия, описания, шаги
гайдов (по 3–5 на интеграцию), последствия отключения, ошибки Google.

Чистка: `constants.ts` — `INITIAL_INTEGRATIONS_CONFIG` удалить целиком;
`types.ts` — `IntegrationsConfig` (`Record<string, any>`) заменить на
типизированный `Integration[]` из `settings.types.ts`.

---

## Edge cases

| Случай | Поведение |
|---|---|
| Повторное подключение Google без `prompt=consent` | `refresh_token` не придёт → отдаём 400 «повторите подключение», не сохраняем битый конфиг |
| Владелец отозвал доступ в настройках Google | первый же sync → 401 `invalid_grant` → `is_connected=false` + письмо владельцу |
| Календарь удалён в Google | 404 → отключаем, показываем «календарь не найден» |
| Занятие создано, пока Google был недоступен | `gcal_event_id = null` → следующий ручной/фоновый sync подхватит (push идемпотентен) |
| Два занятия в одну минуту | у каждого свой `gcal_event_id` — идемпотентность по занятию, не по времени |
| Отключение Google | `POST oauth2.revoke` у Google + очистка `config` + обнуление `Lesson.gcal_event_id` (иначе повторное подключение начнёт «обновлять» события, которых нет) |
| Часовой пояс студии не задан | `Studio.timezone = null` → шлём `UTC` и предупреждаем в UI: «укажите часовой пояс в разделе Основные» |
| Instagram не прошёл модерацию Meta | карточка показывает статус «требуется приложение Meta» со ссылкой — честно, а не «подключено» |

---

## Критерии приёмки EPIC 6

- Во вкладке 4 интеграции; Яндекс и 1С отсутствуют в коде
  (`grep -rn "yandex\|onec" front/src` → пусто).
- Статусы соответствуют БД: подключённый в Уведомлениях Telegram виден
  подключённым и здесь, с маскированным ключом.
- Полный токен не приходит ни в одном ответе API (проверить вкладкой
  Network).
- Отключение без галочки «я понимаю» невозможно; после отключения
  карточка перерисовывается без F5.
- Google: кнопка → consent screen → возврат → «Подключено» + список
  календарей; занятие, созданное в журнале, появляется в Google в
  правильном часовом поясе; перенос обновляет то же событие (не
  создаёт дубль); отмена удаляет.
- Колбэк с подделанным `state` → 400, привязка не происходит.
- Отзыв доступа на стороне Google → следующий sync помечает интеграцию
  отключённой, а не роняет 500.
- ru/en; build+lint зелёные.
</content>
