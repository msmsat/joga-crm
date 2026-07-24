# Эпик N-6 — Персистентность состояния провайдеров (тумблеры каналов)

**Аудит, пункт 1:** «Провайдеры (Telegram, Email) успешно подключаются, но
после перезагрузки страницы их визуальные переключатели сбрасываются.»

**Обозначения сложности:** 🟢 простая · 🟡 средняя · 🔴 сложная.

---

## 1. Описание проблемы и цель

### Что видит пользователь
1. Подключает Telegram → тумблер загорается персиковым, всё хорошо.
2. F5 → тумблер погашен, хотя бот подключён и `/settings/integrations/notify-channels`
   честно отдаёт `connected: true`.

### Корневая причина (найдена, не гипотеза)

**Запись работает. Сломано чтение.**

| Слой | Что происходит |
|---|---|
| Модель | [`back/models/settings.py:28-33`](../../back/models/settings.py#L28-L33) — колонки `telegram_notifications`, `email_notifications`, … **уже есть и уже persist'ятся** |
| PATCH | [`back/routers/settings/notifications.py:37-49`](../../back/routers/settings/notifications.py#L37-L49) — фронт шлёт `{telegram: true}`, `BaseSchema` имеет `populate_by_name=True` ([`back/schemas/_base.py:5`](../../back/schemas/_base.py#L5)) → Pydantic принимает имя поля → `model_dump(by_alias=True)` → `telegram_notifications` → `setattr` → **в БД пишется корректно** |
| GET | [`back/routers/settings/notifications.py:29-34`](../../back/routers/settings/notifications.py#L29-L34) — `response_model=NotificationSettingsRead`. **FastAPI сериализует response_model с `by_alias=True` по умолчанию.** В [`back/schemas/settings/notifications.py:10-15`](../../back/schemas/settings/notifications.py#L10-L15) у полей стоит `alias="telegram_notifications"` → ответ уезжает как `{"telegram_notifications": true, …}` |
| Фронт | [`front/src/api/notifications/notifications.types.ts`](../../front/src/api/notifications/notifications.types.ts) объявляет `NotificationSettings.telegram: boolean`. Реального ключа `telegram` в JSON нет → `settingsQ.data.telegram === undefined` |
| Гидрация | [`useNotifications.ts:54-59`](../../front/src/pages/dashboard/Notifications/hooks/useNotifications.ts#L54-L59) — `hydrateChannels({telegram: undefined, whatsapp: undefined, email: undefined})` → в Zustand-стор кладутся `undefined` → `channels[ch.key]` falsy → **все тумблеры погашены** |

Итого: асимметрия алиасов. PATCH читает по имени поля (`populate_by_name`),
GET пишет по алиасу (`response_model_by_alias`). Дефолт стора
(`{telegram: true, whatsapp: true, email: true}` в
[`notificationsStore.ts:16`](../../front/src/stores/notificationsStore.ts#L16))
маскировал баг до первой гидрации — поэтому «до F5 работает».

### Цель
GET и PATCH `/settings/notifications` говорят на одном языке ключей
(`telegram`, `email`, …). Состояние тумблеров переживает перезагрузку.
**Ни новых таблиц, ни новых колонок, ни миграции — схема БД уже полная.**

---

## 2. Database & Schema

**Изменений НЕТ. Миграция НЕ создаётся.**

Таблица `studio_notification_settings` уже содержит всё необходимое
([`back/models/settings.py:23-38`](../../back/models/settings.py#L23-L38)):

| Колонка | Тип | Default |
|---|---|---|
| `studio_id` | FK → `studios.id`, `unique=True`, `index=True` | — |
| `telegram_notifications` | `Boolean` | `True` |
| `instagram_notifications` | `Boolean` | `False` |
| `whatsapp_notifications` | `Boolean` | `True` |
| `email_notifications` | `Boolean` | `True` |
| `sms_notifications` | `Boolean` | `False` |
| `push_notifications` | `Boolean` | `False` |
| `marketing_emails` | `Boolean` | `True` |
| `primary_email` / `backup_email` | `String(255)` nullable | `NULL` |

> ⚠️ JSONB-структуру под роли **не заводим**. Матрица «роль × событие × канал»
> уже нормализована в `notification_event_toggles` с `UniqueConstraint`
> ([`back/models/settings.py:41-54`](../../back/models/settings.py#L41-L54)) —
> денормализация в JSONB сломала бы N-8 (upsert по constraint) и запросы
> нотификатора. См. эпик N-8.

---

## 3. Backend

### Задача 1 · Симметрия ключей в GET/PATCH · 🟢 · 0:15

**Файл:** [`back/routers/settings/notifications.py`](../../back/routers/settings/notifications.py)

Добавить `response_model_by_alias=False` в оба декоратора, отдающих
`NotificationSettingsRead`:

```python
@router.get(
    "/notifications",
    response_model=NotificationSettingsRead,
    response_model_by_alias=False,   # ← отдаём telegram, а не telegram_notifications
)
async def get_notification_settings(...): ...


@router.patch(
    "/notifications",
    response_model=NotificationSettingsRead,
    response_model_by_alias=False,   # ← ответ PATCH тоже в коротких ключах
)
async def update_notification_settings(...): ...
```

Почему так, а не «переписать схему без алиасов»: алиасы нужны на входе
`model_dump(by_alias=True)` в строке 45 — именно они дают имена колонок ORM
для `setattr`. Убрать алиасы = переписать цикл записи. Два флага короче.

**Ничего больше в бэкенде не трогаем.** Роуты, права (`require_role("owner")`),
`_get_or_create_settings` — как есть.

### Задача 2 · Тест на контракт ответа · 🟢 · 0:20

**Новый файл:** `back/tests/test_notification_settings.py`
(рядом с существующими `test_notifier.py`, `test_daily_notify.py`)

```python
async def test_settings_roundtrip_uses_short_keys(client, owner_headers):
    # 1. Запись коротким ключом
    r = await client.patch("/settings/notifications", json={"telegram": False}, headers=owner_headers)
    assert r.status_code == 200
    assert r.json()["telegram"] is False          # ответ PATCH — короткие ключи

    # 2. Чтение переживает новый запрос (регресс исходного бага)
    r = await client.get("/settings/notifications", headers=owner_headers)
    body = r.json()
    assert "telegram_notifications" not in body   # алиас наружу не течёт
    assert body["telegram"] is False              # значение сохранилось
```

Это единственная обязательная проверка эпика: она падает на текущем коде и
проходит после задачи 1.

### Опционально · Гонка в `_get_or_create_settings` · 🟢 · 0:15

[`notifications.py:17-26`](../../back/routers/settings/notifications.py#L17-L26):
два параллельных GET для студии без строки настроек оба сделают `INSERT` →
второй словит `IntegrityError` на `unique=True` по `studio_id`. На практике
почти недостижимо (первый же GET страницы создаёт строку), но если решим
закрывать — `postgresql.insert(...).on_conflict_do_nothing()` + повторный
`select`. **В scope эпика не входит**, вынести в `docs/BACKLOG`.

---

## 4. Frontend

### Задача 3 · Убрать «оптимистичный» дефолт стора · 🟢 · 0:15

**Файл:** [`front/src/stores/notificationsStore.ts:16`](../../front/src/stores/notificationsStore.ts#L16)

```ts
// Было — маскировало отсутствие гидрации:
channels: { telegram: true, whatsapp: true, email: true },

// Стало — до ответа сервера состояние неизвестно, а не «включено»:
channels: { telegram: false, whatsapp: false, email: false },
```

Риск мигания «выкл → вкл» при загрузке нет: [`Notifications.tsx:23-25`](../../front/src/pages/dashboard/Notifications/Notifications.tsx#L23-L25)
рендерит лоадер, пока `settingsQ.isPending`, и до гидрации сайдбар не
показывается.

Стейт-менеджер оставляем текущий — **Zustand** (`useNotificationsStore`) для
UI-состояния тумблеров + **React Query** (`queryKeys.notificationSettings`)
как источник правды с сервера. Новых стейт-менеджеров не вводим.

### Задача 4 · Гидрация всех каналов, а не трёх · 🟢 · 0:15

**Файл:** [`useNotifications.ts:54-59`](../../front/src/pages/dashboard/Notifications/hooks/useNotifications.ts#L54-L59)

Сейчас гидрируются ровно три ключа, перечисленные вручную. Достаточно для
текущего [`constants.ts` CHANNELS](../../front/src/pages/dashboard/Notifications/constants.ts)
(там 3 канала), но ломается молча при добавлении четвёртого. Ключи брать из
`CHANNELS`, а не из литерала:

```ts
useEffect(() => {
  if (!settingsQ.data) return;
  hydrateChannels(
    Object.fromEntries(
      CHANNELS.map(ch => [ch.key, settingsQ.data[ch.key] ?? false]),
    ) as Record<ChannelKey, boolean>,
  );
}, [settingsQ.data, hydrateChannels]);
```

> Instagram / SMS / Push есть в БД и в `NotificationSettings`, но отсутствуют
> в `CHANNELS` — на странице их нет. Это расхождение с CLAUDE.md §2.12
> («6 каналов») **вне scope аудита**, в `docs/BACKLOG`.

### Задача 5 · Инвалидация после подключения провайдера · 🟢 · 0:15

**Файл:** [`useNotifications.ts:26-35`](../../front/src/pages/dashboard/Notifications/hooks/useNotifications.ts#L26-L35), `useEnableChannel`

Сейчас после подключения в модалке хук делает `setChannel(key, true)` +
`updateSettings(...).catch(() => {})` — без инвалидации. Локальный стор и кэш
React Query расходятся до следующего рефетча. Добавить инвалидацию, чтобы
после закрытия модалки состояние тумблера пришло с сервера:

```ts
export function useEnableChannel() {
  const setChannel = useNotificationsStore(s => s.setChannel);
  const qc = useQueryClient();
  return (key: ChannelKey) => {
    setChannel(key, true);
    notificationsApi.updateSettings({ [key]: true })
      .catch(() => {})
      .finally(() => qc.invalidateQueries({ queryKey: queryKeys.notificationSettings }));
  };
}
```

Проглатывание ошибки оставляем осознанно (комментарий в коде уже объясняет:
интеграция подключена, тумблер лишь отражает факт) — но инвалидация вернёт
реальное состояние даже если PATCH упал.

---

## 5. Acceptance Criteria

| № | Шаг | Ожидаемо |
|---|---|---|
| 1 | `GET /settings/notifications` в Swagger под владельцем | В ответе ключи `telegram`, `email`, `whatsapp` — **ключей `*_notifications` нет** |
| 2 | `PATCH /settings/notifications` с `{"telegram": false}` | 200, ответ `"telegram": false` |
| 3 | Повторный `GET` | `"telegram": false` — значение уехало в БД |
| 4 | `SELECT telegram_notifications FROM studio_notification_settings WHERE studio_id = <id>` | `false` |
| 5 | UI: подключить Telegram через модалку | Тумблер Telegram включён |
| 6 | **F5** | Тумблер Telegram **остался включён** ← главный критерий эпика |
| 7 | UI: выключить тумблер Email, F5 | Email остался выключен |
| 8 | UI: выключить тумблер Email, F5, посмотреть матрицу | Колонка Email пропала из матрицы (`activeChannels` фильтрует по `channels`) |
| 9 | Сеть в DevTools при выключении тумблера | Ровно один `PATCH /settings/notifications`, тело `{"email": false}` |
| 10 | Зайти под ролью `admin` | `403` на GET/PATCH — `require_role("owner")` не ослаблен |
| 11 | `cd back && pytest tests/test_notification_settings.py` | Проходит |
| 12 | `cd front && npm run build && npm run lint` | Без ошибок |

---

## Оценка

| № | Задача | Слой | Сложность | Время |
|---|---|---|---|---|
| 1 | `response_model_by_alias=False` на двух роутах | Бэк | 🟢 | 0:15 |
| 2 | Тест контракта ответа | Бэк | 🟢 | 0:20 |
| 3 | Дефолт стора `false` | Фронт | 🟢 | 0:15 |
| 4 | Гидрация по `CHANNELS` | Фронт | 🟢 | 0:15 |
| 5 | Инвалидация в `useEnableChannel` | Фронт | 🟢 | 0:15 |

**Итого: ~1:20.**
