# Эпик N-1 — Ядро отправки и каркас состояния

Цель простыми словами: сейчас `notify()` умеет только email с русскими
шаблонами и «₽» хардкодом, а Telegram шлётся одним глобальным ботом из env.
После эпика `notify()` — единственная точка отправки всего приложения:
сама решает **кому** (To), **от кого** (From), **что** (Message, на языке и
в валюте студии), **куда** (Network — по включённым каналам и матрице).
Плюс на фронте появляется Zustand-каркас, на который в N-3 переедет страница.

**Важно понимать про старт:**
- `notify(db, studio_id, role, event_id, context)` уже вызывается из боевых
  мест (записи, оплаты, абонементы) — **сигнатура не меняется**, все
  существующие вызовы продолжают работать без правок.
- `deliver()` и `send_telegram()` уже есть (`back/services/notifier.py`) —
  расширяем их, не дублируем.
- Схема БД не меняется: язык/валюта уже в `Studio.language` /
  `Studio.currency` (`back/models/studio.py:24-25`), токены лягут в
  существующую `StudioIntegration` (N-2). Миграций в эпике нет.
- Каналы ядра — строго `("email", "telegram", "whatsapp")`. Колонки
  `sms/push/instagram` игнорируются.

**Обозначения сложности:** 🟢 простая · 🟡 средняя · 🔴 сложная, делать внимательно.

---

## Обзор (для Kanban)

| Фаза | № | Задача | Кто делает | Сложность | Время | Статус |
|---|---|---|---|---|---|---|
| 1. Ядро | 1 | Язык и валюта студии + форматирование сумм | Бэкенд | 🟢 | 0:30 | ✅ |
| 1. Ядро | 2 | Локализованные шаблоны сообщений (ru/en) | Бэкенд | 🟡 | 1:00 | ✅ |
| 1. Ядро | 3 | Мультиканальный фан-аут notify() + per-studio токен TG | Бэкенд | 🔴 | 1:30 | ✅ |
| 1. Ядро | 4 | Тест ядра `test_notifier.py` | Бэкенд | 🟢 | 0:30 | ✅ |
| 2. Каркас | 5 | Zustand: установка + `notificationsStore.ts` | Фронтенд | 🟢 | 0:30 | ✅ |

**Итого по эпику: ~4:00.**

---

## Фаза 1 — Ядро отправки (back/services/notifier.py)

### 1. Язык и валюта студии + форматирование сумм · 🟢 · 0:30
**Где:** `back/services/notifier.py`.
**Что конкретно сделать:**
1. Добавить хелпер (один запрос к БД):
   ```python
   async def _studio_prefs(db: AsyncSession, studio_id: int) -> tuple[str, str]:
       """(language, currency) студии; дефолты ("ru", "RUB") — поля nullable."""
       row = (await db.execute(
           select(Studio.language, Studio.currency).where(Studio.id == studio_id)
       )).first()
       lang = (row.language if row else None) or "ru"
       return (lang if lang in ("ru", "en") else "ru"), (row.currency if row else None) or "RUB"
   ```
   Импорт `Studio` — из `models` (там уже есть barrel-импорт).
2. Добавить чистую функцию:
   ```python
   _CURRENCY_SIGNS = {"RUB": "₽", "USD": "$", "EUR": "€", "KZT": "₸", "BYN": "Br", "UAH": "₴"}

   def _fmt_amount(amount: float | int | None, currency: str) -> str:
       sign = _CURRENCY_SIGNS.get(currency, currency)
       return f"{amount or 0:,.0f} {sign}".replace(",", " ")
   ```
**⚠️ Подводные камни:** не тянуть весь объект `Studio` — только два поля;
`language` в БД может быть `"ru-RU"` — нормализуй через `lang.split("-")[0]`.

### 2. Локализованные шаблоны сообщений (ru/en) · 🟡 · 1:00
**Где:** `back/services/notifier.py`, функция `_render` (строка ~84).
**Что конкретно сделать:**
1. Переписать `_render` на сигнатуру
   `_render(event_id, context, lang, currency) -> tuple[str, str, str] | None`
   → `(subject, text, html)`. `text` — plain-строка для Telegram/WhatsApp,
   `html` — `f"<p>{text}</p>"` для email (отдельные html-шаблоны не нужны).
2. Структура словаря — `TEMPLATES: dict[str, dict[str, tuple[str, str]]]`:
   `TEMPLATES[event_id][lang] = (subject, text)`. Перенести 6 существующих
   событий (`c1, c3, c4, c5, c6, c11`) в ru + написать en-версии. Суммы —
   только через `_fmt_amount(context.get("amount"), currency)`, хардкод «₽»
   удалить (сейчас в `c4`).
3. Fallback: `TEMPLATES[event_id].get(lang) or TEMPLATES[event_id]["ru"]`.
4. Новые события (t6 зарплата, c7/t8 дни рождения, a8/o1 отчёт за день)
   сюда добавит N-4 — структура должна позволять добавить событие одной
   строкой словаря, без правок логики.
**⚠️ Подводные камни:** `_render` останется чистой функцией без БД — язык и
валюту передаёт вызывающий `notify()`. Это условие для теста задачи 4.

### 3. Мультиканальный фан-аут notify() + per-studio токен TG · 🔴 · 1:30
**Где:** `back/services/notifier.py`: `notify()`, `deliver()`,
`send_telegram()`, `_recipient_email()`.
**Что конкретно сделать:**
1. Константа `NOTIFY_CHANNELS = ("email", "telegram", "whatsapp")`.
2. `send_telegram(chat_id, text, token=None)` — новый опциональный аргумент;
   `token or os.getenv("TG_BOT_TOKEN")` (env остаётся fallback до N-2).
3. Новый хелпер токена студии (для N-2 он же — WhatsApp/Email):
   ```python
   async def _integration_config(db, studio_id: int, kind: str) -> dict:
       """config из StudioIntegration (integration_type=kind) или {}."""
   ```
   (select по `StudioIntegration.studio_id == studio_id,
   integration_type == kind, is_connected == True`; вернуть `config or {}`).
4. `deliver(db, channel, client, subject, text, html, *, studio_id)` —
   добавить `studio_id`; в ветке telegram: 
   `token = (await _integration_config(db, studio_id, "tg_notify")).get("token")`
   → `send_telegram(client.tg_id, text, token)`. Ветка whatsapp остаётся
   `_deliver_stub` (реальная отправка — N-2). Обновить существующие вызовы
   `deliver(...)` (см. `grep -n "deliver(" back/` — вызовы в
   `services/scenario_runner.py` и роутерах лояльности) — передать `studio_id`.
5. Переписать середину `notify()` (сейчас — блок «только email»,
   строки ~133-160):
   - глобальные тумблеры: вместо одного `settings.email_notifications` —
     `enabled_global = {ch for ch in NOTIFY_CHANNELS if getattr(settings, f"{ch}_notifications")}`;
   - матрица одним запросом:
     `select(NotificationEventToggle.channel_key).where(studio_id=…, role=…,
     event_id=…, channel_key.in_(enabled_global), is_enabled == True)`;
   - `lang, currency = await _studio_prefs(db, studio_id)`;
     `rendered = _render(event_id, context, lang, currency)`;
   - получатель: переименовать `_recipient_email` →
     `_recipient(db, studio_id, role, context) -> tuple[Client | None, str | None]`
     — клиентские события возвращают объект `Client` (нужен `tg_id`),
     остальные — email владельца (как сейчас). Email сотрудника-адресата
     (тренер при зарплате) N-4 передаст через `context["to_email"]` — учти:
     `context.get("to_email")` имеет приоритет над владельцем;
   - фан-аут: email шлётся при наличии адреса; telegram/whatsapp — только
     если есть `client` (у сотрудников нет `tg_id`);
   - возврат `True`, если **хотя бы один** канал реально отправил.
6. Docstring модуля обновить: описать маппинг To/From/Message/Network/Language
   на аргументы — это контракт «единой функции» для всего приложения.
**⚠️ Подводные камни:** существующие вызовы `notify()` по проекту менять
НЕЛЬЗЯ (сигнатура та же). Семантика возврата `True` используется для
`clients_notified` — «хоть один канал» её сохраняет. Весь фан-аут — внутри
существующего try/except: падение одного канала не глушит остальные
(каждый `deliver` уже глотает исключения сам).

### 4. Тест ядра · 🟢 · 0:30
**Где:** новый `back/tests/test_notifier.py` (рядом с
`test_scenario_runner.py`, тот же стиль).
**Что конкретно сделать:** только чистые функции, без БД:
1. `_render("c4", {"amount": 1500}, "en", "USD")` → subject на английском,
   в тексте `1 500 $`; тот же вызов с `("ru", "RUB")` → русский текст и `₽`.
2. `_render` c неизвестным `event_id` → `None`; с `lang="de"` → ru-fallback.
3. `_fmt_amount(None, "RUB") == "0 ₽"`.
Запуск: `cd back && venv\Scripts\activate && pytest tests/test_notifier.py`.

---

## Фаза 2 — Каркас состояния фронта

### 5. Zustand: установка + notificationsStore.ts · 🟢 · 0:30
**Где:** `front/package.json`, новый `front/src/stores/notificationsStore.ts`
(папки `stores/` ещё нет — создать).
**Что конкретно сделать:**
1. `cd front && npm i zustand`.
2. Создать стор — только UI-состояние выбора, никаких серверных данных:
   ```ts
   import { create } from 'zustand';

   export type NotifChannel = 'telegram' | 'whatsapp' | 'email';
   export type NotifRole = 'client' | 'trainer' | 'admin' | 'owner';

   type NotificationsUIState = {
     activeRole: NotifRole;                       // по умолчанию 'client' (ТЗ п.12)
     channels: Record<NotifChannel, boolean>;     // чекбоксы каналов
     setActiveRole: (r: NotifRole) => void;
     setChannel: (k: NotifChannel, v: boolean) => void;
     hydrateChannels: (c: Record<NotifChannel, boolean>) => void; // из GET /settings/notifications
   };

   export const useNotificationsStore = create<NotificationsUIState>((set) => ({
     activeRole: 'client',
     channels: { telegram: true, whatsapp: true, email: true },
     setActiveRole: (activeRole) => set({ activeRole }),
     setChannel: (k, v) => set((s) => ({ channels: { ...s.channels, [k]: v } })),
     hydrateChannels: (channels) => set({ channels }),
   }));
   ```
3. В N-3 `types.ts` страницы переключит свои `Role`/`ChannelKey` на реэкспорт
   `NotifRole`/`NotifChannel` отсюда — в этом эпике страницу НЕ трогаем.
4. Проверка: `npm run build && npm run lint`.
**⚠️ Подводные камни:** не подключать стор к `useNotifications.ts` сейчас —
это работа N-3 вместе с миграцией на React Query; иначе будет два источника
правды в одном хуке.

---

## Definition of Done эпика

- [x] `notify()` шлёт во все включённые матрицей каналы из
      (email, telegram, whatsapp); сигнатура и все существующие вызовы не тронуты.
- [x] Тексты сообщений — ru/en по `Studio.language`, суммы — в валюте студии;
      хардкода «₽» в шаблонах нет.
- [x] Telegram берёт токен студии из `StudioIntegration("tg_notify")`,
      env — только fallback.
- [x] `python -m tests.test_notifier` зелёный (pytest не установлен в venv —
      запуск через реальную конвенцию репо, как у соседних тестов);
      `cd front && npm run build && npm run lint` — build зелёный, lint новых
      файлов чист (86 ошибок в репо — в файлах вне этого эпика, не тронутых им).
- [x] Zustand установлен, `front/src/stores/notificationsStore.ts` создан,
      страница Уведомлений ещё не мигрирована (это N-3).
