# Эпик N-2 — Подключение каналов: Telegram, Email, WhatsApp

Цель простыми словами: владелец сам подключает каналы со страницы
Уведомлений. Нет токена Telegram в БД → модалка с инструкцией BotFather и
полем токена. Email — ввод адреса отправителя → код на почту → подтверждение
в модалке. WhatsApp — инструкция + токен Meta + честное предупреждение
«сообщения платные» с ценой из API. После эпика `notify()` шлёт всеми тремя
каналами с реквизитами конкретной студии.

**Важно понимать про старт:**
- N-1 уже дал `_integration_config(db, studio_id, kind)` в notifier и
  `deliver(..., studio_id=…)` — этот эпик только наполняет
  `StudioIntegration` данными и оживляет WhatsApp-ветку.
- `back/routers/settings/integrations.py` — пустой стаб (`router = APIRouter()`),
  **уже смонтирован** в `back/routers/settings/router.py:12` → пути получают
  префикс `/settings`. Ничего маунтить не надо.
- Хранилище — существующая `StudioIntegration` (`back/models/settings.py:262`),
  `integration_type`: `"tg_notify"` / `"wa_notify"` / `"email_sender"`,
  реквизиты в JSON `config`. Миграций нет.
- HTTP-клиент для Graph API — **aiohttp** (уже в `back/requirements.txt:4`,
  httpx не добавлять). Проверка TG-токена — через aiogram (уже используется).
- Образец UX модалки токена — `front/src/pages/dashboard/Booking/components/modals/TgModal.tsx`
  (флоу «инструкция → поле → connected-вид»), но новые модалки строим
  **только на UI-ките** (`ModalShell`/`ModalHeader`/`Body`/`Footer`, `Input`,
  `Button`, `useToast` из `components/ui/index`) — CLAUDE.md §5.
- React Query провайдер в приложении уже есть (хуки Лояльности на Query).

**Обозначения сложности:** 🟢 простая · 🟡 средняя · 🔴 сложная, делать внимательно.

---

## Обзор (для Kanban)

| Фаза | № | Задача | Кто делает | Сложность | Время | Статус |
|---|---|---|---|---|---|---|
| 1. Бэкенд | 1 | Схемы + статус-эндпоинт трёх каналов | Бэкенд | 🟢 | 0:45 | ✅ |
| 1. Бэкенд | 2 | Telegram: connect/disconnect + проверка getMe | Бэкенд | 🟡 | 0:45 | ✅ |
| 1. Бэкенд | 3 | Email: код подтверждения + From в mailer | Бэкенд | 🟡 | 1:00 | ✅ |
| 1. Бэкенд | 4 | WhatsApp: connect, цена сообщения, живая отправка | Бэкенд | 🔴 | 1:30 | ✅ |
| 2. Фронт | 5 | API-клиент + хук `useChannelIntegrations` (Query) | Фронтенд | 🟢 | 0:45 | ✅ |
| 2. Фронт | 6 | Три модалки + врезка в карточки каналов | Фронтенд | 🔴 | 2:00 | ✅ |
| 2. Фронт | 7 | i18n-неймспейс `notifications` (ru/en) | Фронтенд | 🟢 | 0:30 | ✅ |

**Итого по эпику: ~7:15.**

---

## Фаза 1 — Бэкенд (`/settings/integrations/…`, только owner)

### 1. Схемы + статус-эндпоинт трёх каналов · 🟢 · 0:45
**Где:** новый `back/schemas/settings/integrations.py`,
`back/routers/settings/integrations.py`.
**Что конкретно сделать:**
1. Pydantic-схемы:
   ```python
   class TgConnect(BaseModel):
       token: str = Field(pattern=r"^\d{6,12}:[A-Za-z0-9_-]{30,50}$")

   class WaConnect(BaseModel):
       token: str
       phone_number_id: str
       waba_id: str | None = None

   class EmailCodeRequest(BaseModel):
       email: EmailStr

   class EmailCodeVerify(BaseModel):
       code: str = Field(min_length=6, max_length=6)

   class ChannelStatus(BaseModel):
       connected: bool = False
       details: dict = {}

   class NotifyChannelsStatus(BaseModel):
       telegram: ChannelStatus
       whatsapp: ChannelStatus
       email: ChannelStatus
   ```
2. В роутере — хелпер по образцу `_get_or_create_settings`
   (`settings/notifications.py:17`):
   `_get_or_create_integration(db, studio_id, kind) -> StudioIntegration`.
3. `GET /integrations/notify-channels` → `NotifyChannelsStatus`. Один select:
   `StudioIntegration.integration_type.in_(("tg_notify", "wa_notify", "email_sender"))`.
   `details` — только безопасное: telegram → `{"bot_username", "token_masked"}`
   (маска на бэке: `token[:6] + "…" + token[-4:]`, сырой токен фронту **не
   отдавать**), email → `{"email", "verified"}`, whatsapp →
   `{"phone_number_id", "display_phone_number"}`.
4. Доступ везде в эпике: `ctx: StudioContext = Depends(require_role("owner"))`.
**⚠️ Подводные камни:** JSON-колонка SQLAlchemy не отслеживает мутации на
месте — конфиг всегда переприсваивать целиком:
`integ.config = {**(integ.config or {}), "key": value}`, иначе изменение
молча не сохранится. Это касается задач 2–4.

### 2. Telegram: connect/disconnect + проверка getMe · 🟡 · 0:45
**Где:** `back/routers/settings/integrations.py`.
**Что конкретно сделать:**
1. `POST /integrations/telegram` (body `TgConnect`) →
   `NotifyChannelsStatus`-фрагмент или `ChannelStatus`:
   - проверить токен живым вызовом: `bot = Bot(body.token)`,
     `me = await bot.get_me()` в try/except,
     `finally: await bot.session.close()`; ошибка → `HTTPException(400,
     "Telegram не принял токен")`;
   - сохранить: `config = {"token": body.token, "bot_username": me.username}`,
     `is_connected = True`.
2. `DELETE /integrations/telegram` → `is_connected = False`, `config = None`.
3. Больше ничего: `notify()` уже читает `tg_notify` через
   `_integration_config` (N-1, задача 3) — канал оживает сам.
**⚠️ Подводные камни:** токен не логировать (ни в logger, ни в HTTPException
detail); инструкция для модалки живёт на фронте (задача 6), бэку хватает
проверки getMe.

### 3. Email: код подтверждения + From в mailer · 🟡 · 1:00
**Где:** `back/services/mailer.py`, `back/routers/settings/integrations.py`,
`back/services/notifier.py`.
**Что конкретно сделать:**
1. `mailer.send_email(to, subject, html, sender=None)` — новый опциональный
   аргумент: `message["From"] = sender or os.getenv("SMTP_FROM", user)`.
   Существующие вызовы не трогаем.
2. `POST /integrations/email/request-code` (body `EmailCodeRequest`):
   - `code = f"{secrets.randbelow(1_000_000):06d}"`;
   - `config = {"email": body.email, "code": code,
     "expires_at": (datetime.utcnow() + timedelta(minutes=10)).isoformat(),
     "verified": False}`, `is_connected = False`;
   - отправить код письмом на `body.email` через `send_email` (тема и текст —
     по-русски/английски не важно, это транзакционное письмо владельцу —
     возьми язык студии через `_studio_prefs` из notifier).
3. `POST /integrations/email/verify` (body `EmailCodeVerify`):
   - сверить код и `expires_at`; неверный/просроченный →
     `HTTPException(400, ...)`;
   - успех → `config = {"email": ..., "verified": True}` (код из конфига
     удалить), `is_connected = True`.
4. `notifier`: в email-ветке `deliver()` подтянуть From:
   `cfg = await _integration_config(db, studio_id, "email_sender")`;
   `sender = cfg.get("email") if cfg.get("verified") else None` →
   `send_email(to, subject, html, sender=sender)`.
**⚠️ Подводные камни:** транспорт остаётся SMTP из env — подмена только
заголовка From; произвольный From на чужом SMTP может уходить в спам, поэтому
в модалке (задача 6) обязательна строка «отправка идёт через сервер Velora
от вашего имени». Код — только `secrets`, не `random`.

### 4. WhatsApp: connect, цена сообщения, живая отправка · 🔴 · 1:30
**Где:** `back/routers/settings/integrations.py`, `back/services/notifier.py`.
**Что конкретно сделать:**
1. Константа `GRAPH = "https://graph.facebook.com/v20.0"`.
2. `POST /integrations/whatsapp` (body `WaConnect`):
   - проверка токена: aiohttp
     `GET {GRAPH}/{body.phone_number_id}?fields=display_phone_number`
     с `Authorization: Bearer {body.token}`; не-200 →
     `HTTPException(400, "Meta не принял токен или phone_number_id")`;
   - сохранить `config = {"token", "phone_number_id", "waba_id",
     "display_phone_number"}`, `is_connected = True`.
   `DELETE /integrations/whatsapp` — симметрично Telegram.
3. `GET /integrations/whatsapp/pricing` → `{"price_per_message": float,
   "currency": str, "source": "meta" | "default"}`:
   - если канал подключён и есть `waba_id` — попробовать
     `GET {GRAPH}/{waba_id}/pricing_analytics` и взять среднюю цену за
     сообщение из ответа;
   - любая ошибка или нет `waba_id` → статический дефолт
     `{"price_per_message": 0.08, "currency": "USD", "source": "default"}`.
     Эндпоинт никогда не отвечает 500 — фронту всегда есть что показать.
4. `notifier.py`: заменить whatsapp-ветку `_deliver_stub` на реальную
   отправку (внутри `deliver()`):
   - `cfg = await _integration_config(db, studio_id, "wa_notify")`; нет
     токена или у клиента нет `client.phone` → `return False`;
   - aiohttp `POST {GRAPH}/{cfg["phone_number_id"]}/messages`, json:
     `{"messaging_product": "whatsapp", "to": <client.phone, только цифры>,
     "type": "text", "text": {"body": text}}`;
   - `return resp.status == 200`, исключения глотать с логом (как email/tg).
   `_deliver_stub` после этого остаётся только для sms — можно удалить вместе
   с веткой (каналов sms/push в ядре больше нет, N-1).
**⚠️ Подводные камни:** полноценный Embedded Signup (OAuth-флоу Meta) — вне
MVP: модалка даёт ссылку на Meta Business Suite и ручной ввод токена; в коде
это фиксировать не надо, это UX задачи 6. Ответы Graph API с токеном не
логировать. Свободный текст WhatsApp доставляется только в 24-часовом окне
диалога — упомянуть в предупреждении модалки, в коде MVP не обрабатывать.

---

## Фаза 2 — Фронт (страница Уведомлений)

### 5. API-клиент + хук useChannelIntegrations · 🟢 · 0:45
**Где:** `front/src/api/notifications/notifications.api.ts`,
`front/src/api/notifications/notifications.types.ts`, новый
`front/src/pages/dashboard/Notifications/hooks/useChannelIntegrations.ts`.
**Что конкретно сделать:**
1. Типы: `ChannelStatus`, `NotifyChannelsStatus`, `WaPricing` — зеркало
   Pydantic-схем задачи 1 (CLAUDE.md §8: бэк диктует структуру).
2. Методы в `notificationsApi`: `getChannelIntegrations()`,
   `connectTelegram(token)`, `disconnectTelegram()`,
   `requestEmailCode(email)`, `verifyEmailCode(code)`,
   `connectWhatsApp(payload)`, `disconnectWhatsApp()`, `getWaPricing()` —
   через существующий `client` (`../client`).
3. Хук: `useQuery({ queryKey: ['notify-integrations'], queryFn: ... })` +
   `useMutation` на каждое действие; в `onSuccess` каждой мутации —
   `queryClient.invalidateQueries({ queryKey: ['notify-integrations'] })`
   (статусы карточек обновляются без F5) и глобальный `useToast` успеха;
   `onError` → `useToast` с текстом ошибки. Никаких локальных стейтов тостов
   (ТЗ п.13).

### 6. Три модалки + врезка в карточки каналов · 🔴 · 2:00
**Где:** новая папка `front/src/pages/dashboard/Notifications/components/modals/`:
`TgTokenModal.tsx`, `EmailVerifyModal.tsx`, `WaConnectModal.tsx`; правки
`Notifications.tsx` и `components/sections/ChannelsSidebar.tsx`.
**Что конкретно сделать:**
1. Все модалки — на ките: `ModalShell` + `ModalHeader/Body/Footer`, `Input`,
   `Button` (`loading` из статуса мутации). Строки — только `t()` из ns
   `notifications` (задача 7).
2. **TgTokenModal** — два вида, как в booking-образце:
   - не подключён: шаги BotFather (`@BotFather` → `/newbot` → скопировать
     токен), `Input` с валидацией `^\d{6,12}:[A-Za-z0-9_-]{30,50}$`
     (состояние `error` у Input), кнопка «Подключить» → `connectTelegram`;
   - подключён: `@bot_username`, `token_masked` с бэка, кнопка «Отключить»
     (`Button variant="danger"` через `ConfirmModal`).
3. **EmailVerifyModal** — двухшаговая (локальный `useState<'email'|'code'>`
   — это состояние формы, не тостов, допустимо):
   - шаг 1: `Input` email → «Отправить код» → `requestEmailCode` → шаг 2;
   - шаг 2: `Input` на 6 цифр → «Подтвердить» → `verifyEmailCode`;
     ссылка «Отправить код ещё раз» возвращает мутацию шага 1;
   - постоянная подпись: «Письма уходят через сервер Velora от вашего имени».
4. **WaConnectModal:**
   - инструкция: Meta Business Suite → WhatsApp → API Setup → ссылка на
     Embedded Signup (`<a target="_blank">`), поля `token`,
     `phone_number_id`, `waba_id` (опц.);
   - **предупреждение о платности** (жёлтый блок, статусный цвет из ДС):
     при открытии дёрнуть `getWaPricing()` и показать «Сообщения WhatsApp
     платные — ≈ {price} {currency} за сообщение, оплата напрямую Meta;
     доставка гарантируется в 24-часовом окне диалога». Цена с
     `source: "default"` показывается со словом «ориентировочно».
5. Врезка (ТЗ п.4 — «если токена нет, показать модалку»):
   - `Notifications.tsx`: `const [openModal, setOpenModal] =
     useState<'tg' | 'email' | 'wa' | null>(null)` + рендер трёх модалок;
   - `ChannelsSidebar.tsx`: на карточке канала — статус из
     `useChannelIntegrations` (зелёная точка «Подключён» / серая кнопка
     «Подключить»); клик по неподключённой карточке ИЛИ попытка включить её
     тумблер без подключения → **не включать тумблер**, а `setOpenModal(...)`;
     после успешного подключения тумблер включается сам (мутация из хука
     задачи 5 + `notificationsApi.updateSettings({ [key]: true })`).
**⚠️ Подводные камни:** сабы карточек в `constants.ts` сейчас хардкод
(`@VeloraNotifyBot`, `admin@velora.studio`) — заменить на живые данные из
`details` статус-эндпоинта (bot_username / email / display_phone_number),
фоллбэк — прочерк. Полная чистка constants.ts до трёх каналов — N-3, здесь
не трогать список.

### 7. i18n-неймспейс notifications (ru/en) · 🟢 · 0:30
**Где:** новые `front/src/locales/ru/notifications.json` и
`front/src/locales/en/notifications.json`; `front/src/i18n.ts`.
**Что конкретно сделать:**
1. Создать оба json c ключами модалок: `tg.*` (title, steps.1–4, connect,
   disconnect, invalidToken, connected), `emailCh.*` (title, sendCode,
   verify, resend, viaVelora, wrongCode), `wa.*` (title, steps, paidWarning,
   approxPrice, connect), `channels.*` (connect, connected).
2. Зарегистрировать неймспейс в `i18n.ts` — по образцу `booking`: два
   импорта + строки в `resources.ru` / `resources.en` (регистрация статикой,
   динамических импортов в проекте нет).
3. N-3 доложит в эти же файлы ключи всей страницы — структуру не менять.

---

## Definition of Done эпика

- [ ] Со страницы Уведомлений подключаются все три канала: TG-токен
      проверяется getMe, email — кодом на почту, WhatsApp — запросом к Graph API.
- [ ] Сырой TG/WA-токен наружу не отдаётся (только маска/имя бота).
- [ ] В модалке WhatsApp — предупреждение о платности с ценой из
      `/settings/integrations/whatsapp/pricing` (source: meta | default).
- [ ] `notify()` реально шлёт WhatsApp через Cloud API, email — с From
      верифицированного адреса.
- [ ] Статусы карточек каналов обновляются без F5 (инвалидация
      `['notify-integrations']`); все тосты — глобальный `useToast`.
- [ ] `cd front && npm run build && npm run lint` и `pytest back/tests/`
      зелёные.
