# Эпик AI-3 — AI-агенты: Telegram-токен с проверкой, Instagram OAuth

Цель эпика простыми словами: настройка автоответчиков перестаёт быть двумя
одинаковыми токен-инпутами в никуда. Telegram: токен бота проверяется на
сервере через Telegram API, сохраняется в БД и выводится в инпут; без токена
тумблер заблокирован и показана инструкция BotFather. Instagram: вместо
токена — настоящий OAuth-флоу Meta (кнопка «Подключить», редирект, callback,
long-lived токен на 60 дней), инструкция про профессиональный аккаунт,
отключение с подтверждением.

Источник: аудит в `docs/ROADMAP_AI/ROADMAP.md`, п. 4. Согласование с
соседями: канал instagram в уведомлениях выключен (ROADMAP_NOTIFICATIONS,
решение 2), в Онлайн-записи Insta — инфо-модалка (ROADMAP_BOOKINGS, блок 1) —
агентские данные живут только в `StudioAISettings`, других хранилищ не
заводим (правило «no model duplicates»).

**Важно понимать про старт:**
- Поля `tg_token/tg_username/tg_enabled`, `ig_token/ig_username/ig_enabled`
  уже в `StudioAISettings` — для Telegram миграций не нужно; для Instagram
  добавляются два поля (задача 3).
- PATCH `/ai/settings` и серверный гейт тумблеров уже сделаны в AI-2 —
  этот эпик добавляет способы «положить токен в БД».
- **Приём и автоответ на входящие сообщения (вебхуки) — вне рамок**: без
  живого LLM отвечать нечем (см. ROADMAP, «Вне рамок»). Эпик делает
  подключение каналов и честную статистику (нули).
- aiohttp уже в зависимостях (Fondy), python-jose (JWT) — тоже.

**Обозначения сложности:** 🟢 простая · 🟡 средняя · 🔴 сложная, делать внимательно.

---

## Обзор (для Kanban)

| Фаза | № | Задача | Кто делает | Сложность | Время |
|---|---|---|---|---|---|
| 1. Telegram | 1 | POST `/ai/telegram/verify-token` (getMe) | Бэкенд | 🟡 | 1:00 |
| 1. Telegram | 2 | UI Telegram: гейт тумблера, инструкция, статистика | Фронтенд | 🟡 | 1:15 |
| 2. Instagram | 3 | Миграция: `ig_user_id`, `ig_token_expires_at` | Бэкенд | 🟢 | 0:20 |
| 2. Instagram | 4 | OAuth-роутер Instagram (url, callback, disconnect, refresh) | Бэкенд | 🔴 | 2:00 |
| 2. Instagram | 5 | UI Instagram: подключение, статус, инструкция, гейт | Фронтенд | 🟡 | 1:30 |

**Итого по эпику: ~6:05.**

---

## Фаза 1 — Telegram

### 1. POST `/ai/telegram/verify-token` · 🟡 · 1:00

**Простыми словами:** владелец вставляет токен бота — сервер спрашивает у
Telegram «это живой бот?», сохраняет токен и username в БД или честно
отвечает «токен неверный».
**Зачем:** «строгая валидация инпутов» из аудита: мусор в БД не попадает,
username бота получаем не со слов пользователя, а от Telegram.
**Где:** новый `back/routers/ai/agents.py`, регистрация в
`back/routers/ai/router.py`; хелпер настроек из AI-2.

**Контракт:**

| Method | URL | Request Body | Response |
|---|---|---|---|
| POST | `/ai/telegram/verify-token` | `{"token": "123456:AAH…"}` | `200 {"username": "velora_bot"}` |
| — | ошибки | — | `400 {"detail": "invalid_bot_token"}`, `422` на пустой/кривой формат |
| DELETE | `/ai/telegram/token` | — | `204` — очистить `tg_token/tg_username`, `tg_enabled=false` |

**Что конкретно сделать:**
1. Схема `TelegramTokenIn(BaseSchema): token: str = Field(..., pattern=r"^\d+:[\w-]{30,}$")`
   (в `back/schemas/ai/settings.py`).
2. `require_role('owner')`; aiohttp
   `GET https://api.telegram.org/bot{token}/getMe`, timeout 5 с:
   - `ok: true` → `tg_token = token`, `tg_username = result.username`,
     commit → `{"username": …}`;
   - `ok: false` / 401 / таймаут / сеть → `400 invalid_bot_token`
     (токен НЕ сохранять).
3. DELETE — симметричное отключение (используется кнопкой «Отвязать бота»).
**⚠️ Подводные камни:** токен в логи не писать (ни uvicorn-echo, ни print);
таймаут обязателен — без него зависший Telegram вешает запрос настроек.
**Готово, когда:** реальный токен тестового бота сохраняется и возвращает
username; строка «abc» → 422 ещё на Pydantic; валидный по формату, но мёртвый
токен → 400; после DELETE тумблер (гейт из AI-2) снова не включается.

### 2. UI Telegram: гейт тумблера, инструкция, статистика · 🟡 · 1:15

**Простыми словами:** есть токен в БД — тумблер доступен и токен показан в
инпуте; нет — тумблер заблокирован и вместо статистики пошаговая инструкция,
как получить токен у BotFather.
**Где:** `front/src/pages/dashboard/AI/components/modals/AgentSetupModal.tsx`
(вкладка Telegram), `components/AgentConfigCard.tsx`,
`front/src/api/ai/ai.api.ts` (+2 метода).
**Что конкретно сделать:**
1. `ai.api.ts`:

```ts
verifyTelegramToken: (token: string) =>
  client.post<{ username: string }>('/ai/telegram/verify-token', { token }),
disconnectTelegram: () => client.delete<void>('/ai/telegram/token'),
```

2. Вкладка Telegram в модалке:
   - инпут токена (`Input` из кита, monospace) + кнопка «Проверить и
     подключить» (`Button`, loading при `isPending`); клиентская
     пре-валидация формата `^\d+:[\w-]{30,}$` — кнопка disabled, подпись
     ошибки под инпутом до всякого запроса;
   - мутация verify: success → success-тост («Бот @username подключён»),
     `invalidateQueries(['ai','settings'])`; 400 → error-тост «Токен не
     прошёл проверку Telegram»;
   - токен из БД выводится в этот же инпут (`settings.tg_token` — owner его
     видит, AI-2 п.2); рядом бейдж `@tg_username` и кнопка «Отвязать» →
     `ConfirmModal` (danger) → disconnect.
3. Гейт тумблера: `Switch` вкл/выкл агента `disabled={!settings.tg_token}` +
   `Tooltip` «Сначала подключите бота» (и на карточке в LeftPanel тоже).
4. Блок-инструкция (виден, только пока токена нет), все тексты через `t()`:
   1) откройте `@BotFather` в Telegram; 2) команда `/newbot`, задайте имя и
   username бота; 3) скопируйте выданный токен; 4) вставьте сюда и нажмите
   «Проверить и подключить».
5. Статистика на вкладке и карточке — `tg_handled_count`, `tg_avg_rating`
   из `['ai','settings']`: реальные нули с подписью «появится после запуска
   автоответчика», никаких выдуманных чисел.
**Готово, когда:** без токена тумблер физически не включается (и сервер
дублирует запрет 400-кой); после подключения тумблер работает, токен и
username переживают F5; после «Отвязать» вкладка возвращается к инструкции.

---

## Фаза 2 — Instagram

### 3. Миграция: `ig_user_id`, `ig_token_expires_at` · 🟢 · 0:20

**Простыми словами:** OAuth-токену нужны владелец и срок годности.
**Где:** `back/models/ai.py` (`StudioAISettings`), Alembic-миграция.
**Что конкретно сделать:**

```python
ig_user_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
ig_token_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=False), nullable=True)
```

`alembic revision --autogenerate -m "ig oauth fields"` → `upgrade head`.
`ig_token` остаётся String(255) — long-lived токены IG в него помещаются.
**Готово, когда:** миграция накатывается и откатывается чисто.

### 4. OAuth-роутер Instagram · 🔴 · 2:00

**Простыми словами:** «Подключить Instagram» уводит владельца на страницу
согласия Instagram; после «Разрешить» Meta возвращает код, сервер меняет его
на долгоживущий токен и сохраняет всё в БД.
**Зачем:** у Instagram нет «токена бота» — только OAuth (Instagram API with
Instagram Login); прежний инпут был враньём.
**Где:** новый `back/routers/ai/instagram.py`, регистрация в
`back/routers/ai/router.py`; `back/.env.example`
(+`IG_APP_ID=`, `IG_APP_SECRET=`, `IG_REDIRECT_URI=`, фронт-адрес возврата —
уже существующий `FRONTEND_URL`).

**Контракт:**

| Method | URL | Request | Response |
|---|---|---|---|
| GET | `/ai/instagram/oauth-url` | — (owner, JWT) | `200 {"url": "https://www.instagram.com/oauth/authorize?…"}` |
| GET | `/ai/instagram/callback` | `?code=…&state=…` (браузерный редирект, без Authorization) | `302` → `{FRONTEND_URL}/dashboard/ai?ig=connected` или `?ig=error` |
| DELETE | `/ai/instagram/connection` | — (owner) | `204` — `ig_token/ig_user_id/ig_username/ig_token_expires_at = NULL`, `ig_enabled = false` |

**Что конкретно сделать:**
1. `oauth-url`: собрать
   `https://www.instagram.com/oauth/authorize` с
   `client_id={IG_APP_ID}`, `redirect_uri={IG_REDIRECT_URI}`,
   `response_type=code`,
   `scope=instagram_business_basic,instagram_business_manage_messages`,
   `state={JWT}`. `state` — краткоживущий (10 мин) JWT
   `{"studio_id": …, "purpose": "ig_oauth"}` на существующем SECRET_KEY
   (python-jose) — CSRF-защита и адресация студии в callback.
2. `callback` (эндпоинт без auth-зависимости — это редирект браузера;
   студия — только из проверенного `state`):
   1) декодировать/проверить state (истёк/битый → редирект `?ig=error`);
   2) `POST https://api.instagram.com/oauth/access_token`
      (`client_id, client_secret, grant_type=authorization_code, redirect_uri, code`)
      → short-lived token;
   3) `GET https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=…&access_token=…`
      → long-lived token (`expires_in` ≈ 60 дней);
   4) `GET https://graph.instagram.com/v23.0/me?fields=user_id,username&access_token=…`;
   5) сохранить `ig_token`, `ig_user_id`, `ig_username`,
      `ig_token_expires_at = now + expires_in`; commit;
   6) `RedirectResponse(f"{FRONTEND_URL}/dashboard/ai?ig=connected")`;
      любая ошибка шагов 2–5 → лог + редирект `?ig=error` (детали — в лог,
      не в URL).
3. Продление: в `get_or_create_ai_settings` (AI-2) — если `ig_token` есть и
   `ig_token_expires_at < now + 10 дней` →
   `GET https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=…`,
   обновить токен и срок; ошибку продления проглотить в лог (владелец
   переподключит по инструкции, UI покажет срок).
   # ponytail: refresh при заходе в настройки вместо планировщика — токен живёт 60 дней, владелец заходит чаще; вынести в общий cron, когда он появится в проекте.
4. Гейт из AI-2 ужесточить: `ig_enabled=true` требует `ig_token` И
   `ig_token_expires_at > now` — иначе `400 ig_not_connected`.
**⚠️ Подводные камни:** `IG_APP_SECRET` — только на сервере, в oauth-url его
нет; redirect_uri в Meta-консоли должен побайтово совпадать с
`IG_REDIRECT_URI` (https, без хвостового слэша); callback до заведения
Meta-приложения тестировать заглушкой short-lived обмена нельзя — для
локальной разработки использовать тестовое приложение Meta с
`https://localhost`-редиректом. Требование площадки: аккаунт студии должен
быть профессиональным (Business/Creator) — это пишем в инструкцию (задача 5).
**Готово, когда:** полный круг на тестовом Meta-приложении: кнопка → согласие
→ редирект `?ig=connected` → в БД токен/username/срок; повторный вызов
oauth-url с чужим/протухшим state не подключает ничего; DELETE отключает и
гасит тумблер.

### 5. UI Instagram: подключение, статус, инструкция, гейт · 🟡 · 1:30

**Простыми словами:** вкладка Instagram в модалке — «Подключить Instagram»
вместо токен-инпута, статус подключения с username и сроком токена,
актуальная инструкция, отключение с подтверждением.
**Где:** `AgentSetupModal.tsx` (вкладка Instagram), `AgentConfigCard.tsx`,
`front/src/pages/dashboard/AI/AI.tsx` (обработка `?ig=`),
`front/src/api/ai/ai.api.ts` (+2 метода), `ai.types.ts`
(`AISettings` += `ig_user_id: string | null`, `ig_token_expires_at: string | null`).
**Что конкретно сделать:**
1. `ai.api.ts`:

```ts
getInstagramOauthUrl: () => client.get<{ url: string }>('/ai/instagram/oauth-url'),
disconnectInstagram: () => client.delete<void>('/ai/instagram/connection'),
```

2. Состояние «не подключено» (`!settings.ig_user_id`):
   - `Button` primary «Подключить Instagram» → `getInstagramOauthUrl()` →
     `window.location.href = url` (полный редирект, не попап);
   - инструкция (через `t()`): 1) аккаунт студии должен быть
     профессиональным — Business или Creator (Настройки Instagram → Тип
     аккаунта); 2) нажмите «Подключить Instagram» и войдите от имени
     аккаунта студии; 3) разрешите доступ к сообщениям; 4) вернётесь сюда
     автоматически;
   - токен-инпута больше нет — поле и `onUpdate('token', …)` для Instagram
     удалить;
   - тумблер `Switch` `disabled` + `Tooltip` «Сначала подключите аккаунт».
3. Состояние «подключено»: бейдж `@ig_username`, строка «Доступ действует до
   {Intl.DateTimeFormat(i18n.language).format(new Date(ig_token_expires_at))}»,
   кнопка «Отключить» → `ConfirmModal` (danger, текст про остановку агента)
   → `disconnectInstagram()` → invalidate `['ai','settings']` + тост.
4. Возврат с OAuth в `AI.tsx`: `useEffect` по `location.search` —
   `?ig=connected` → success-тост + `invalidateQueries(['ai','settings'])`;
   `?ig=error` → error-тост «Не удалось подключить Instagram — попробуйте
   ещё раз»; в обоих случаях затереть query
   (`navigate('/dashboard/ai', { replace: true })`), чтобы тост не повторялся
   на F5.
5. Карточка Instagram в LeftPanel: статус/username/статистика
   (`ig_handled_count`, `ig_avg_rating` — честные нули) из `['ai','settings']`.
**Готово, когда:** весь флоу проходит из UI без ручных запросов; F5 после
подключения показывает «подключено» из БД; тумблер без подключения не
включается ни в UI, ни через API; `npm run build && npm run lint` зелёные.
