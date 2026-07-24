# Эпик N-8 — Автосохранение матрицы уведомлений (все роли, все галочки)

**Аудит, пункт 3:** «Реализовать сохранение ВСЕХ галочек по всем блокам ролей
(Клиент, Тренер, Администратор, Владелец). При изменении любого чекбокса его
состояние должно персистентно сохраняться в БД.»

**Обозначения сложности:** 🟢 простая · 🟡 средняя · 🔴 сложная.

---

## 1. Описание проблемы и цель

### Что есть сейчас (важно: не с нуля)

Персистентность матрицы **уже написана и работает**, но с двумя изъянами:

| Что | Где | Состояние |
|---|---|---|
| Таблица матрицы | [`back/models/settings.py:41-54`](../../back/models/settings.py#L41-L54) `NotificationEventToggle` + `UniqueConstraint("studio_id","role","event_id","channel_key")` | ✅ живая, покрывает все 4 роли |
| Upsert одного тумблера | [`back/routers/settings/notifications.py:63-84`](../../back/routers/settings/notifications.py#L63-L84) `PATCH /settings/notifications/events` | 🟡 `SELECT` + `INSERT`/`UPDATE` + `commit` на **каждый** тумблер |
| Чтение матрицы | [`notifications.py:52-60`](../../back/routers/settings/notifications.py#L52-L60) `GET /settings/notifications/events` | ✅ отдаёт всё по студии, все роли |
| Черновик + Save/Cancel | [`useNotifications.ts:112-125`](../../front/src/pages/dashboard/Notifications/hooks/useNotifications.ts#L112-L125) | 🟡 `Promise.all(changes.map(...))` — N параллельных PATCH |
| Слияние с дефолтами | [`utils.ts:33-42`](../../front/src/pages/dashboard/Notifications/utils.ts#L33-L42) `mergeToggles` | ✅ |

### Два реальных дефекта

**Дефект A — «сохранил только то, что нажал кнопку».** Модель ручная: галочка
живёт в черновике `toggles`, в БД уезжает только по кнопке «Сохранить». Ушёл
со страницы, переключил роль до сохранения, закрыл вкладку — изменения
потеряны без предупреждения. Аудит требует персистентности на изменение.

**Дефект B — N запросов на одно действие.** «Активировать все» для роли
«Клиент» при 3 активных каналах = 10 событий × 3 = **30 параллельных PATCH**,
30 отдельных транзакций, 30 × (`SELECT` + `INSERT`). Частичный отказ оставит
БД в полусохранённом состоянии, а `Promise.all` отрапортует общую ошибку —
UI и БД разъедутся.

### Цель
Любая галочка в любом блоке ролей сохраняется автоматически, пачкой, одной
транзакцией, без кнопки «Сохранить». Серия быстрых кликов схлопывается в один
запрос (debounce). Отказ откатывает UI к последнему подтверждённому состоянию.

---

## 2. Database & Schema

**Изменений в схеме нет. Миграция не создаётся.**

`notification_event_toggles` уже нормализована и уже уникальна по
`(studio_id, role, event_id, channel_key)` — именно этот constraint даёт
возможность делать batch-upsert одним запросом (см. §3).

> **Почему НЕ JSONB.** Соблазн сложить всю матрицу в
> `studio_notification_settings.matrix JSONB` есть, но: (1) потребуется
> миграция + бэкфилл существующих строк; (2) нотификатор
> [`back/services/notifier.py`](../../back/services/notifier.py) фильтрует
> отправку по строкам этой таблицы — придётся переписать выборки на
> JSON-операторы; (3) конкурентная запись двух вкладок затрёт друг друга
> целиком, а не по ячейке. Существующая схема строго лучше. Не трогаем.

Индексы: `studio_id` уже проиндексирован (`index=True`, строка 48), unique
constraint даёт индекс по четвёрке. Дополнительных индексов не нужно —
таблица порядка сотен строк на студию.

---

## 3. Backend (API & Endpoints)

### Задача 1 · Batch-upsert одним запросом · 🟡 · 1:00 · ✅

**Файл:** [`back/schemas/settings/notifications.py`](../../back/schemas/settings/notifications.py) — добавить схему тела:

```python
from pydantic import Field

class EventToggleBulkUpdate(BaseSchema):
    toggles: list[EventToggle] = Field(min_length=1, max_length=500)
```

`max_length=500` — граница доверия: тело запроса приходит извне, без лимита
один POST может попытаться вставить произвольный объём. Верхняя реальная
оценка: 4 роли × ~10 событий × 6 каналов ≈ 240.

**Файл:** [`back/routers/settings/notifications.py`](../../back/routers/settings/notifications.py) — новый роут рядом с существующими:

```python
from sqlalchemy.dialects.postgresql import insert as pg_insert

from schemas.settings.notifications import EventToggleBulkUpdate


@router.patch("/notifications/events/bulk", response_model=list[EventToggle])
async def bulk_upsert_event_toggles(
    body: EventToggleBulkUpdate,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Пачка тумблеров матрицы — один INSERT ... ON CONFLICT, одна транзакция."""
    rows = [
        {
            "studio_id": ctx.studio_id,      # studio_id ВСЕГДА из контекста, не из тела
            "role": t.role,
            "event_id": t.event_id,
            "channel_key": t.channel_key,
            "is_enabled": t.is_enabled,
        }
        for t in body.toggles
    ]
    stmt = (
        pg_insert(NotificationEventToggle)
        .values(rows)
        .on_conflict_do_update(
            constraint="uq_notif_toggle",                       # уже существует в модели
            set_={"is_enabled": pg_insert(NotificationEventToggle).excluded.is_enabled},
        )
        .returning(NotificationEventToggle)
    )
    result = (await db.execute(stmt)).scalars().all()
    await db.commit()
    return result
```

Почему `ON CONFLICT`, а не цикл из существующего `upsert_event_toggle`:
constraint уже есть → БД сама решает insert/update, один round-trip вместо
`2×N`, одна транзакция → атомарность (дефект B закрыт).

**Валидация значений `role` / `event_id` / `channel_key`.** Сейчас это
свободные строки (`String(20)`/`String(10)`) — клиент может насыпать мусорных
ключей. Добавить в `EventToggle` в
[`back/schemas/settings/notifications.py:33-37`](../../back/schemas/settings/notifications.py#L33-L37):

```python
from typing import Literal

class EventToggle(BaseSchema):
    role: Literal["client", "trainer", "admin", "owner"]
    event_id: str = Field(pattern=r"^[ctao]\d{1,2}$")   # c1…c11, t1…, a1…, o1…
    channel_key: Literal["telegram", "whatsapp", "email", "instagram", "sms", "push"]
    is_enabled: bool
```

Схема общая с одиночным `PATCH /notifications/events`, так что валидация
закрывает обе ручки разом.

**Старый одиночный роут не удаляем** — используется в существующих сценариях
и как фолбэк; ломать работающий контракт ради чистоты не нужно.

✅ **Реализовано** (`back/schemas/settings/notifications.py`,
`back/routers/settings/notifications.py`): `EventToggleBulkUpdate` + `Literal`
на `role`/`channel_key` и `pattern` на `event_id` (список ролей/каналов сверен
с `front/constants.ts` — `client/trainer/admin/owner`,
`telegram/whatsapp/email/instagram/sms/push`, id вида `c1`…`c11`). Роут
`PATCH /notifications/events/bulk` — `pg_insert(...).on_conflict_do_update`
на constraint `uq_notif_toggle`, одна транзакция. `studio_id` в схему тела не
включён — берётся только из `ctx`, поэтому чужая студия в JSON молча
отбрасывается pydantic (extra-поля игнорируются по умолчанию), а не
попадает в БД.

### Задача 2 · Тест на bulk · 🟢 · 0:30 · ✅

**Новый файл:** `back/tests/test_notification_event_toggles.py`

```python
async def test_bulk_upsert_inserts_then_updates(client, owner_headers, db):
    payload = {"toggles": [
        {"role": "client",  "event_id": "c1", "channel_key": "telegram", "is_enabled": True},
        {"role": "owner",   "event_id": "o2", "channel_key": "email",    "is_enabled": True},
    ]}
    r = await client.patch("/settings/notifications/events/bulk", json=payload, headers=owner_headers)
    assert r.status_code == 200 and len(r.json()) == 2

    # повторный вызов с другим значением — UPDATE, не дубль (проверка ON CONFLICT)
    payload["toggles"][0]["is_enabled"] = False
    await client.patch("/settings/notifications/events/bulk", json=payload, headers=owner_headers)

    rows = (await client.get("/settings/notifications/events", headers=owner_headers)).json()
    c1 = [x for x in rows if x["event_id"] == "c1" and x["channel_key"] == "telegram"]
    assert len(c1) == 1 and c1[0]["is_enabled"] is False


async def test_bulk_rejects_unknown_role(client, owner_headers):
    r = await client.patch("/settings/notifications/events/bulk", headers=owner_headers,
        json={"toggles": [{"role": "hacker", "event_id": "c1", "channel_key": "telegram", "is_enabled": True}]})
    assert r.status_code == 422


async def test_bulk_requires_owner(client, admin_headers):
    r = await client.patch("/settings/notifications/events/bulk", headers=admin_headers,
        json={"toggles": [{"role": "client", "event_id": "c1", "channel_key": "telegram", "is_enabled": True}]})
    assert r.status_code == 403
```

✅ **Реализовано иначе, чем в черновике выше** — в этом проекте нет
pytest-фреймворка и HTTP-фикстур (`client`/`owner_headers`/`db`); реальный
образец — `back/tests/test_analytics_utilization.py` и
`back/tests/test_booking_access.py`: обычные `asyncio`-скрипты, вызывающие
функцию роута напрямую с настоящей `AsyncSession` и `StudioContext`, плюс
ручной seed/cleanup строк в реальной БД. `back/tests/test_notification_event_toggles.py`
написан в этом же стиле:
- `test_bulk_upsert_inserts_then_updates` — вызывает
  `bulk_upsert_event_toggles` дважды (insert → update по тому же ключу),
  проверяет и возвращённые `RETURNING`-объекты, и последующий
  `get_event_toggles`, и что строк в БД ровно 2 (не 3 — `ON CONFLICT` не
  задублировал).
- `test_bulk_rejects_unknown_role` / `_malformed_event_id` / `_unknown_channel`
  — валидация 422 тестируется на уровне Pydantic (`EventToggle(...)` →
  `ValidationError`), т.к. это ровно то, что делает FastAPI до входа в тело
  роута.
- `test_bulk_requires_owner` — вызывает `require_role("owner")` напрямую с
  `ctx.role="admin"`, ждёт `HTTPException(403)` (тот же приём, что
  `test_no_subscription_403` в `test_booking_access.py`).

Запуск: `cd back && python -m tests.test_notification_event_toggles` → `ALL PASS`.
Регрессия проверена: `python -m tests.test_notification_settings` тоже зелёный
(схема `notifications.py` общая для обоих роутеров).

### Задача 3 · Метод в API-клиенте · 🟢 · 0:10

**Файл:** [`front/src/api/notifications/notifications.api.ts`](../../front/src/api/notifications/notifications.api.ts)

```ts
  bulkUpdateEventToggles: (toggles: EventToggle[]) =>
    client.patch<EventToggle[]>('/settings/notifications/events/bulk', { toggles }),
```

---

## 4. Frontend

### Задача 4 · Debounced-автосохранение · 🔴 · 1:30

**Файл:** [`front/src/pages/dashboard/Notifications/hooks/useNotifications.ts`](../../front/src/pages/dashboard/Notifications/hooks/useNotifications.ts)

Стейт-менеджмент оставляем текущий: черновик `toggles` в `useState` хука,
серверная правда — React Query (`queryKeys.notificationEventToggles`). Новых
библиотек **не ставим** — дебаунс это `setTimeout` + `clearTimeout`,
устанавливать `lodash.debounce` или `use-debounce` ради 8 строк не нужно.

```ts
const DEBOUNCE_MS = 600;   // серия кликов по «Активировать все» схлопывается в 1 запрос

const saveTogglesMut = useMutation({
  mutationFn: notificationsApi.bulkUpdateEventToggles,   // ← был Promise.all(map)
});

// Автосохранение: через 600 мс после ПОСЛЕДНЕГО изменения шлём накопленный diff.
// Таймер перезапускается на каждое изменение toggles — промежуточные клики
// в сеть не уходят.
useEffect(() => {
  const changes = diffToggles(toggles, savedToggles);
  if (changes.length === 0) return;

  const timer = setTimeout(() => {
    const snapshot = toggles;                 // фиксируем то, что реально отправляем
    saveTogglesMut.mutate(changes, {
      onSuccess: () => setSavedToggles(snapshot),
      onError: (e: unknown) => {
        setToggles(savedToggles);             // откат черновика к подтверждённому
        toast.error(errorMessage(e, t));
      },
      onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.notificationEventToggles }),
    });
  }, DEBOUNCE_MS);

  return () => clearTimeout(timer);           // перезапуск таймера / очистка при unmount
}, [toggles, savedToggles]);                  // eslint-disable-line react-hooks/exhaustive-deps
```

Тонкости, которые легко упустить:

1. **`snapshot` вместо `toggles` в `onSuccess`.** К моменту ответа сервера
   `toggles` мог уехать дальше; `setSavedToggles(toggles)` из замыкания
   пометил бы сохранённым то, что ещё не отправлялось.
2. **Cleanup обязателен.** Без `clearTimeout` уход со страницы в середине
   дебаунса оставит висящую мутацию на размонтированном хуке.
3. **Гвард `!isDirty` на строке 77 остаётся.** Он не даёт фоновому рефетчу
   затереть черновик — с автосохранением окно между `mutate` и
   `invalidateQueries` становится узким, но не нулевым.
4. **Дебаунс, а не throttle.** Нужно «замолчал — сохранили», а не
   «сохраняем каждые N мс».

### Задача 5 · Флаш при уходе со страницы · 🟡 · 0:30

600 мс дебаунса — окно, в котором можно успеть закрыть вкладку. Отправляем
несохранённое на unmount и на `beforeunload`:

```ts
// ref всегда указывает на актуальный несохранённый diff
const pendingRef = useRef<EventToggle[]>([]);
pendingRef.current = diffToggles(toggles, savedToggles);

useEffect(() => {
  const flush = () => {
    if (pendingRef.current.length === 0) return;
    // sendBeacon: переживает выгрузку документа, в отличие от fetch
    navigator.sendBeacon?.(
      `${import.meta.env.VITE_API_URL ?? 'http://localhost:8000'}/settings/notifications/events/bulk`,
      new Blob([JSON.stringify({ toggles: pendingRef.current })], { type: 'application/json' }),
    );
  };
  window.addEventListener('beforeunload', flush);
  return () => { window.removeEventListener('beforeunload', flush); flush(); };
}, []);
```

> ⚠️ `sendBeacon` не отправляет заголовок `Authorization`. Если проект хранит
> JWT в `localStorage` (а не в cookie) — beacon получит 401. **Проверить
> [`front/src/api/client.ts`](../../front/src/api/client.ts) перед реализацией.**
> Если авторизация заголовком — вариант с beacon отбросить и ограничиться
> флашем на unmount через обычный `notificationsApi.bulkUpdateEventToggles`
> (переживает переход между роутами SPA, но не закрытие вкладки), плюс
> нативный `beforeunload`-prompt при непустом `pendingRef`.

### Задача 6 · Кнопки «Сохранить»/«Отменить» → индикатор статуса · 🟡 · 0:45

**Файл:** [`NotificationMatrix.tsx:110-177`](../../front/src/pages/dashboard/Notifications/components/sections/NotificationMatrix.tsx#L110-L177)

С автосохранением кнопка «Сохранить» становится ложью — состояние уже
сохраняется само. Убираем «Сохранить» и «Отменить», на их месте — статус:

| Состояние | Что показываем |
|---|---|
| `saving` | «Сохранение…» + мягкий спиннер |
| `!saving && !isDirty` | «Все изменения сохранены» + галочка, `#A3C9A8` |
| ошибка | тост об ошибке (уже есть) + «Не сохранено» `#D88C9A` |

Кнопка «Активировать все / Деактивировать все» (строки 158-174)
**остаётся** — она меняет черновик, дебаунс схлопнет всю пачку в один bulk-PATCH.
Проброс `setToggles` в компонент сохраняется.

Пропсы `isDirty`, `saving`, `onSave`, `onCancel` в
[`Props`](../../front/src/pages/dashboard/Notifications/components/sections/NotificationMatrix.tsx#L10-L21)
заменяются на `saving: boolean` + `isDirty: boolean`; убрать их проброс из
[`Notifications.tsx:44-47`](../../front/src/pages/dashboard/Notifications/Notifications.tsx#L44-L47)
и `saveChanges`/`cancelChanges` из возвращаемого объекта хука.

Новые i18n-ключи в `front/src/locales/{ru,en}/notifications.json`:
`matrix.allSaved`, `matrix.notSaved` (`matrix.saving` уже есть).

### Задача 7 · Сохранение при переключении роли · 🟢 · 0:15

**Файл:** [`useNotifications.ts:107-110`](../../front/src/pages/dashboard/Notifications/hooks/useNotifications.ts#L107-L110)

`switchRole` меняет только `activeRole` — черновик `toggles` общий на все роли
(`buildInitialToggles` строит по всем четырём), так что переключение роли
данные **не теряет** и до сих пор. Явных правок не требуется. **Но** добавить
в приёмку кейс 6: переключил роль в пределах окна дебаунса → изменения
предыдущей роли всё равно доехали.

---

## 5. Acceptance Criteria

| № | Шаг | Ожидаемо |
|---|---|---|
| 1 | Роль «Клиент», клик по одной галочке, подождать 1 с | В Network **один** `PATCH /settings/notifications/events/bulk`, тело `{"toggles":[{…}]}`, ответ 200 |
| 2 | F5 | Галочка в том же состоянии ← главный критерий эпика |
| 3 | Повторить для ролей «Тренер», «Администратор», «Владелец» | Каждая сохраняется и переживает F5 |
| 4 | 10 быстрых кликов по разным галочкам за < 600 мс | **Один** bulk-запрос, в теле все 10 изменений |
| 5 | «Активировать все» при 3 активных каналах, роль «Клиент» | **Один** запрос с ~30 тумблерами (не 30 запросов) |
| 6 | Кликнуть галочку и сразу переключить роль | Изменение всё равно ушло; вернулся на роль — галочка на месте |
| 7 | Кликнуть галочку и сразу уйти на другую страницу | Флаш на unmount отработал; вернулся — галочка сохранена |
| 8 | DevTools → Network offline → клик по галочке | Тост об ошибке, галочка **вернулась** в предыдущее состояние (откат) |
| 9 | `SELECT * FROM notification_event_toggles WHERE studio_id=<id>` после серии кликов | Строки по всем 4 ролям, **без дублей** по `(role, event_id, channel_key)` |
| 10 | Дважды прогнать один и тот же bulk-payload | Количество строк не выросло (`ON CONFLICT` отработал) |
| 11 | bulk с `"role": "hacker"` | `422`, ничего не записано |
| 12 | bulk с `studio_id` чужой студии в теле | Поле игнорируется — `studio_id` берётся из `ctx`; записи ушли в свою студию |
| 13 | bulk под ролью `admin` | `403` |
| 14 | Матрица в UI | Кнопок «Сохранить»/«Отменить» нет; есть «Сохранение…» → «Все изменения сохранены» |
| 15 | `cd back && pytest tests/test_notification_event_toggles.py` | Проходит |
| 16 | `cd front && npm run build && npm run lint` | Без ошибок |

---

## Оценка

| № | Задача | Слой | Сложность | Время | Статус |
|---|---|---|---|---|---|
| 1 | Bulk-upsert `ON CONFLICT` + `Literal`-валидация | Бэк | 🟡 | 1:00 | ✅ |
| 2 | Тесты bulk (upsert / 422 / 403) | Бэк | 🟢 | 0:30 | ✅ |
| 3 | `bulkUpdateEventToggles` в API-клиенте | Фронт | 🟢 | 0:10 | ⬜ |
| 4 | Debounced-автосохранение с откатом | Фронт | 🔴 | 1:30 | ⬜ |
| 5 | Флаш на unmount / `beforeunload` | Фронт | 🟡 | 0:30 | ⬜ |
| 6 | Save/Cancel → индикатор статуса | Фронт | 🟡 | 0:45 | ⬜ |
| 7 | Приёмка переключения роли | Фронт | 🟢 | 0:15 | ⬜ |

**Итого: ~4:40.**

**Зависимости:** делать **после N-6**. Матрица фильтрует колонки по
`activeChannels` = включённые каналы; пока каналы не гидрируются корректно
(баг N-6), приёмочные пункты 1–5 не проверяемы — колонок в матрице не будет.
