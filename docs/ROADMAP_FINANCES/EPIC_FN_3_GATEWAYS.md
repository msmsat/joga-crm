# Эпик FN-3 — Финансы: Шлюзы (Stripe/Fondy) и статистика методов оплаты

Цель эпика простыми словами: обе вкладки — витрина из моков. «Онлайн-платежи» рисуют
4 канала с выдуманным оборотом, копируют несуществующую ссылку `pay.velora.studio` и
хвалят тостом переключение локального стейта. «Методы оплаты» показывают 5 методов с
мок-комиссиями и транзакциями. Архитектурное решение аудита: **разделить настройку и
аналитику** — «Онлайн-платежи» = только подключение Stripe/Fondy с правдивым статусом,
«Методы оплаты» = только реальные суммы из операций.

Реальный приём платежей (checkout, webhooks) — вне MVP, в `docs/BACKLOG/`. «Подключён» в
MVP честно означает «ключи сохранены и статус хранится на сервере», без ссылок на оплату.

Источник: аудит от 2026-07-19, блок 3. Обзор и стартовая точка — в `ROADMAP.md`.

**Обозначения сложности:** 🟢 простая · 🟡 средняя · 🔴 сложная, делать внимательно.

---

## Обзор (для Kanban)

| № | Задача | Кто делает | Сложность | Время |
|---|---|---|---|---|
| 3.1 | Бэкенд шлюзов: GET/PUT `/finances/gateways` на модели `OnlineChannel` | Бэкенд | 🟡 | 2:00 |
| 3.2 | Вкладка «Онлайн-платежи» → только Stripe и Fondy, без бутафории | Фронтенд | 🔴 | 2:30 |
| 3.3 | «Методы оплаты» → реальная статистика сумм по методам | Бэк + фронт | 🟡 | 2:00 |

**Итого по эпику: ~6:30.**

---

### 3.1 Бэкенд шлюзов: GET/PUT `/finances/gateways` · 🟡 · 2:00
**Простыми словами:** модель под это уже в БД — `OnlineChannel`
(`back/models/finances.py:88`: `channel_type`, `is_active`, unique на студию+тип), роутера
нет. Используем её для Stripe/Fondy (никаких новых файлов моделей — правило репо),
добавив поля ключей.
**Что конкретно сделать:**
1. `back/models/finances.py` → `OnlineChannel` + `public_key: Optional[str]`,
   `secret_key: Optional[str]` (String, nullable); миграция autogenerate → upgrade.
2. Новый `back/routers/finances/gateways.py` (подключить в
   `back/routers/finances/router.py`):
   - `GET /gateways` → всегда две строки `stripe` и `fondy` (отсутствующие в БД —
     виртуально со `connected=false`); ответ: `{gateway_type, connected, is_active,
     public_key}` — `connected = secret_key непустой`; **secret_key наружу не отдавать**;
   - `PUT /gateways/{gateway_type}` (Literal["stripe","fondy"]) → upsert по
     unique(studio, type): сохранить ключи/`is_active`; пустые ключи → `connected=false`.
     Только owner (`require_role("owner")`).
3. `back/schemas/finances/` → `gateways.py`: `GatewayRead`, `GatewayUpdate`
   (public_key, secret_key, is_active — Optional).
4. `back/tests/` → тест: PUT с ключами → GET отдаёт `connected=true` и не отдаёт
   secret_key; PUT с пустым secret_key → `connected=false`.
**Готово, когда:** тесты зелёные; статус шлюза живёт в БД и переживает перезапуск.

### 3.2 Вкладка «Онлайн-платежи» → только Stripe и Fondy · 🔴 · 2:30
**Простыми словами:** удаляем бутафорию целиком: `ONLINE_CHANNELS_DATA`
(`constants.ts:5`), «Ссылка на оплату»/«QR-код»/«Telegram Pay»/«Виджет на сайт», блок
копирования `pay.velora.studio/p/velora-pilates` (`OnlinePaymentsTab.tsx:134-146`),
свечной график с мульт-массивами `DAY_MULTS`/`MOCK_TXNS`/`MOCK_PCTS`
(`OnlinePaymentsTab.tsx:36-62`), тост «Настройки шлюза обновлены» на локальный тумблер.
**Что конкретно сделать:**
1. `front/src/api/finances/finances.api.ts` → `getGateways()`,
   `updateGateway(type, payload)`; типы в `finances.types.ts`; ключи `finGateways`
   в `queryKeys.ts`.
2. `OnlinePaymentsTab.tsx` → переписать: две карточки — Stripe и Fondy (логотипы —
   inline-SVG, не эмодзи). Не подключён → серый статус «Не подключён» + primary-кнопка
   «Подключить»; подключён → статус «Подключён» (пистачо), маскированный public_key,
   тумблер `is_active`, кнопка «Изменить ключи». Никаких ссылок на оплату не генерировать.
3. «Подключить»/«Изменить ключи» → модалка (2-колоночный грид кита: `ModalShell` +
   `Input` для public/secret key) → `updateGateway` → инвалидация `finGateways`;
   ошибки — `errorMessage()`.
4. Описание раздела сверху изменить: «Подключение платёжных провайдеров Stripe и Fondy.
   Приём платежей появится после подключения» (текст — через `finances.json`).
5. Удалить из `constants.ts` `ONLINE_CHANNELS_DATA` и тип `OnlineChannel` из `types.ts`,
   если больше никто не импортирует.
**Готово, когда:** на вкладке ровно 2 карточки, статус — с сервера, в коде вкладки нет
ни одного мок-массива; «мёртвых» кнопок нет.

### 3.3 «Методы оплаты» → реальная статистика сумм по методам · 🟡 · 2:00
**Простыми словами:** вкладка должна отвечать на вопрос «сколько заплатили наличными,
картой, через Stripe, Fondy» — сейчас это `PAYMENT_METHODS_DATA` (`constants.ts:12`) с
выдуманными комиссиями и тумблерами, сохраняющими локальный стейт. `Operation.method`
в БД уже есть (`back/models/finances.py:40`), но пишется свободной строкой и часто пустой.
**Что конкретно сделать:**
1. Стандартизировать ключи метода: `cash | card | qr | transfer | stripe | fondy`.
   `front` → в форме создания операции (`OperationsTab.tsx`) добавить селект метода
   (ключи, подписи из `finances.json`); продажа абонемента уже шлёт `payment_method`
   (`clients/subscriptions.py:94`) — проверить, что модалка продажи передаёт эти же ключи.
   Старые операции с пустым/произвольным method честно показываем группой «Не указан».
2. `back/routers/finances/operations.py` → `GET /operations/method-stats`
   (`?date_from&date_to`): `SELECT method, SUM(amount), COUNT(*) WHERE type='in'
   GROUP BY method`. Роут — выше `{operation_id}`-роутов.
3. `front/src/api/finances/finances.api.ts` → `getMethodStats(from, to)`; ключ
   `finMethodStats(from, to)` в `queryKeys.ts`.
4. `PaymentMethodsTab.tsx` → переписать: карточки-строки метод → сумма + число операций
   + доля %; сводка сверху — общий оборот за период; переключатель периода
   (месяц/квартал/год). Тумблеры, «комиссии» и `PAYMENT_METHODS_DATA` удалить.
**Готово, когда:** суммы на вкладке сходятся с фильтром по методу в «Операциях»;
моков в коде вкладки нет.
