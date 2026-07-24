# EPIC 3 — Notifications Logic: обязательные vs опциональные

**Цель:** владелец настраивает уведомления студии, но **никто не может
случайно отключить себе критичное**. Плюс личные предпочтения
сотрудника, которые не ломают доставку.

**Зависимости:** эпик 1. **Оценка: ~6:30.**

---

## Точка отсчёта

Механика уведомлений в проекте **реально работает** и переписывать её не
нужно. `back/services/notifier.py` — 400 строк рабочего кода:
`notify(db, studio_id, role, event_id, context)` сам решает кому / от кого /
что / куда, рендерит на языке студии, доставляет в email / Telegram /
WhatsApp. 29 шаблонов событий, 22 вызова `notify()` по роутерам.

**Но есть архитектурная дыра — и она ровно та, о которой спрашивает ТЗ.**

```python
# notifier.py:379-390 — текущий резолвер каналов
enabled_channels = set(... NotificationEventToggle ... is_enabled == True ...)
if not enabled_channels:
    return False   # ← молча не отправили. Совсем. Ничего.
```

Три следствия:

1. **Нет понятия «обязательное уведомление».** Отмена занятия (`c3`),
   перенос (`c11`), возврат средств (`c9`), истечение тарифа (`o6`),
   смена прав доступа (`o7`) выключаются тем же тумблером, что и
   «поздравление с днём рождения».
2. **Тихий отказ.** Владелец снял последнюю галочку в строке матрицы →
   `notify()` возвращает `False`, и никто никогда не узнает, что клиенту
   не сообщили об отмене занятия.
3. **Дефолт — «не слать».** Строки `NotificationEventToggle` создаются
   только когда владелец что-то трогает (`upsert_event_toggle`), а
   `is_enabled` по умолчанию `False`. **Свежая студия не отправляет
   вообще ничего**, пока владелец вручную не прокликает матрицу 29 × 6.

Плюс отдельная дыра в покрытии: у тренера есть напоминания о занятии
(`t3`, `t4`) и зарплата (`t6`), но **нет события «твоё занятие отменили
/ перенесли»**. Именно тот случай, ради которого затевается эпик.

---

## User Stories

- **Как владелец** я включаю и выключаю уведомления студии по матрице
  «событие × канал» — и вижу, какие строки выключить нельзя и почему.
- **Как владелец** я не могу оставить критичное событие без единого
  канала доставки: интерфейс не даёт, а сервер не верит интерфейсу.
- **Как тренер** я отключаю себе дайджесты и поздравления, но
  «занятие отменено» и «зарплата выплачена» приходят всегда.
- **Как владелец** я вижу, что канал включён в матрице, но не подключён
  в Интеграциях — и попадаю на подключение в один клик.

---

## Архитектурное решение

### 1. Три уровня событий (tier)

| Tier | Что это | Можно выключить событие? | Можно выключить канал? |
|---|---|---|---|
| `critical` | отмена, перенос, деньги, доступ, безопасность | **нет** | нет — шлём по `default_channels` |
| `operational` | подтверждения, напоминания, рабочие сигналы | нет | да, но **не последний** |
| `optional` | дайджесты, маркетинг, поздравления, «мягкие» подсказки | да | да, любые |

Ключевая идея: **настройка канала — это предпочтение способа доставки, а
не право не получить сообщение.** Для `critical` и `operational`
пользователь выбирает *куда*, но не *слать ли вообще*.

### 2. Каталог событий — в коде, не в БД

`back/services/notification_catalog.py` (новый):

```python
from dataclasses import dataclass
from typing import Literal

@dataclass(frozen=True)
class EventSpec:
    role: Literal["client", "trainer", "admin", "owner"]
    tier: Literal["critical", "operational", "optional"]
    default_channels: tuple[str, ...]   # что включено у новой студии
    fallback: str = "email"             # гарантированный канал

CATALOG: dict[str, EventSpec] = {
    # ─── Клиент ───────────────────────────────────────────────────────
    "c1":  EventSpec("client",  "operational", ("email", "telegram")),  # запись подтверждена
    "c2":  EventSpec("client",  "operational", ("email", "telegram")),  # напоминание о занятии
    "c3":  EventSpec("client",  "critical",    ("email", "telegram")),  # занятие ОТМЕНЕНО
    "c11": EventSpec("client",  "critical",    ("email", "telegram")),  # занятие ПЕРЕНЕСЕНО
    "c4":  EventSpec("client",  "critical",    ("email",)),             # оплата получена (чек)
    "c9":  EventSpec("client",  "critical",    ("email",)),             # возврат средств
    "c6":  EventSpec("client",  "operational", ("email",)),             # абонемент закончился
    "c5":  EventSpec("client",  "optional",    ("email",)),             # осталось 1-2 занятия
    "c8":  EventSpec("client",  "optional",    ("email",)),             # запрос отзыва
    "c7":  EventSpec("client",  "optional",    ()),                     # день рождения (маркетинг)
    # ─── Тренер ───────────────────────────────────────────────────────
    "t1":  EventSpec("trainer", "critical",    ("email",)),             # НОВОЕ: твоё занятие отменено
    "t2":  EventSpec("trainer", "critical",    ("email",)),             # НОВОЕ: твоё занятие перенесено
    "t6":  EventSpec("trainer", "critical",    ("email",)),             # зарплата выплачена
    "t3":  EventSpec("trainer", "operational", ("email",)),             # занятие через час
    "t4":  EventSpec("trainer", "operational", ("email",)),             # занятие через 30 мин
    "t8":  EventSpec("trainer", "optional",    ()),                     # дни рождения клиентов
    # ─── Администратор ────────────────────────────────────────────────
    "a2":  EventSpec("admin",   "critical",    ("email",)),             # отмена менее чем за час
    "a10": EventSpec("admin",   "critical",    ("email",)),             # оформлен возврат
    "a1":  EventSpec("admin",   "operational", ("email",)),             # новая онлайн-запись
    "a4":  EventSpec("admin",   "operational", ("email",)),             # оплата получена
    "a3":  EventSpec("admin",   "optional",    ("email",)),             # новый клиент
    "a6":  EventSpec("admin",   "optional",    ()),                     # абонемент клиента на исходе
    "a8":  EventSpec("admin",   "optional",    ()),                     # отчёт за день
    # ─── Владелец ─────────────────────────────────────────────────────
    "o6":  EventSpec("owner",   "critical",    ("email",)),             # ТАРИФ ИСТЕКАЕТ
    "o7":  EventSpec("owner",   "critical",    ("email",)),             # изменены права доступа
    "o5":  EventSpec("owner",   "operational", ("email",)),             # добавлен сотрудник
    "o3":  EventSpec("owner",   "optional",    ("email",)),             # крупный платёж
    "o4":  EventSpec("owner",   "optional",    ("email",)),             # падение выручки
    "o8":  EventSpec("owner",   "optional",    ("email",)),             # цель достигнута
    "o1":  EventSpec("owner",   "optional",    ()),                     # ежедневная сводка
    "o2":  EventSpec("owner",   "optional",    ()),                     # еженедельный отчёт
}
```

**Почему каталог в коде, а не таблицей-справочником.** Событие
существует ровно постольку, поскольку существует `notify(..., "c3", ...)`
в роутере и шаблон в `TEMPLATES`. Справочник в БД добавил бы к каждому
новому письму миграцию и риск рассинхрона «строка есть — шаблона нет».
Существующая таблица `NotificationEventToggle` при этом остаётся и
хранит **только отклонения от дефолта** — она уже так устроена
(`UniqueConstraint(studio_id, role, event_id, channel_key)`).

`default_channels` заодно чинит дефолт «не слать ничего»: пустая матрица
означает «как в каталоге», а не «молчать».

### 3. Гарантированный канал (Guaranteed Delivery Channel)

Инвариант: **для каждой пары (роль, событие) с `tier != optional` всегда
есть хотя бы один включённый и подключённый канал.**

Держится на трёх уровнях — снаружи внутрь:

1. **UI.** Последний включённый тумблер в строке рендерится залоченным
   (замок + `Tooltip`: «Последний канал доставки — отключить нельзя»).
   `critical`-строка целиком залочена.
2. **API.** `PATCH /settings/notifications/events` считает, что
   останется после изменения. Пусто и `tier != optional` → **409** с
   машиночитаемым телом (фронту не доверяем — интерфейс можно обойти
   curl'ом).
3. **Runtime.** В резолвере: если после всех фильтров каналов нет, а
   событие `critical`/`operational` — шлём в `spec.fallback` (email
   аккаунта) **невзирая на настройки** и пишем `WARNING` в лог с
   пометкой `forced`. Это страховка от рассинхрона (канал отвалился,
   интеграция слетела, строку удалили руками в БД).

Такой ответ на вопрос ТЗ честнее, чем «предупредить и всё равно
отключить»: тренер, отключивший email, не пропустит отмену занятия ни
при каком стечении обстоятельств, но при этом сохранит контроль над
дайджестами и поздравлениями.

### 4. Два слоя настроек: студия и человек

| Слой | Кто правит | Таблица | Что может |
|---|---|---|---|
| Студийный | владелец | `NotificationEventToggle` (есть) | включать/выключать каналы для всей студии |
| Личный | сам сотрудник | `UserNotificationPreference` (новая) | **только сузить**, и только `optional` |

Итоговое правило — одна формула:

```
critical     → default_channels                      (настройки игнорируются)
operational  → studio_channels                       (личный слой не применяется)
optional     → studio_channels ∩ user_channels
затем        → ∩ connected_channels(studio)          (канал физически подключён)
и если пусто и tier != optional → [fallback], forced=True
```

Личный слой намеренно **не может** трогать `operational` — иначе тренер,
отключивший себе всё, перестанет получать «занятие через 30 минут», а
виноватой окажется студия.

---

## Архитектура БД

Новая таблица ровно одна.

```python
# back/models/settings.py
class UserNotificationPreference(Base):
    __tablename__ = "user_notification_preferences"
    __table_args__ = (
        UniqueConstraint("user_id", "event_id", "channel_key", name="uq_user_notif_pref"),
    )
    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    event_id: Mapped[str] = mapped_column(String(10))
    channel_key: Mapped[str] = mapped_column(String(20))
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)

    user: Mapped["User"] = relationship(back_populates="notification_preferences")
```

+ `User.notification_preferences` relationship,
+ миграция `xxxx_user_notification_preferences.py` (create_table).

**Изменений в существующих таблицах нет.** `NotificationEventToggle` и
`StudioNotificationSettings` остаются как есть — глобальные тумблеры
каналов (`*_notifications`) продолжают работать «рубильником канала».

---

## REST API

### `GET /settings/notifications/matrix` — новый, owner-only

Одним ответом: каталог + эффективное состояние + что залочено. Фронту
не нужно склеивать каталог с тогглами и вычислять локи — иначе логика
блокировок разъедется между клиентом и сервером.

```jsonc
{
  "channels": [                       // порядок и доступность колонок
    {"key": "email",    "connected": true,  "global_enabled": true},
    {"key": "telegram", "connected": false, "global_enabled": true},
    {"key": "whatsapp", "connected": true,  "global_enabled": true},
    {"key": "sms",      "connected": false, "global_enabled": false},
    {"key": "push",     "connected": false, "global_enabled": false}
  ],
  "events": [
    {
      "event_id": "c3",
      "role": "client",
      "tier": "critical",
      "channels": {"email": true, "telegram": true, "whatsapp": false},
      "locked": true,                 // строку менять нельзя вообще
      "locked_channels": [],          // при tier=operational — последний включённый
      "lock_reason": "critical"       // ключ i18n, не текст
    },
    {
      "event_id": "c2", "role": "client", "tier": "operational",
      "channels": {"email": true, "telegram": false, "whatsapp": false},
      "locked": false,
      "locked_channels": ["email"],   // единственный включённый — снять нельзя
      "lock_reason": "last_channel"
    }
  ]
}
```

### `PATCH /settings/notifications/events` — существующий, дополнить

Тело не меняется (`{role, event_id, channel_key, is_enabled}`) — меняются
проверки перед записью:

```python
spec = CATALOG.get(body.event_id)
if spec is None or spec.role != body.role:
    raise HTTPException(422, "Неизвестное событие")          # мусор от клиента
if spec.tier == "critical":
    raise HTTPException(409, "Это уведомление отключить нельзя")
if not body.is_enabled and spec.tier == "operational":
    if not (await effective_channels(db, studio_id, body.event_id) - {body.channel_key}):
        raise HTTPException(409, "Нужен хотя бы один канал доставки")
```

Ответ 200 — обновлённая строка матрицы (`events[]`-элемент целиком, а не
одна ячейка): после изменения мог смениться `locked_channels`, и фронт
должен получить актуальные локи без второго запроса.

### `GET / PATCH /settings/notifications/me` — личные, `get_current_user`

```jsonc
// GET → только optional-события роли текущего пользователя
{"events": [{"event_id": "t8", "channels": {"email": false}}]}

// PATCH body: {"event_id": "t8", "channel_key": "email", "is_enabled": false}
// 409, если CATALOG[event_id].tier != "optional" — личный слой не трогает
//      operational и critical (см. правило выше)
```

---

## Backend: задачи

### Задача 1. Каталог событий (~0:45)
`back/services/notification_catalog.py` — код из раздела выше +
хелперы `events_for_role(role)`, `is_locked(event_id)`.
Проверка на старте (в `main.py` lifespan или простым `assert` в модуле):
**каждый ключ `CATALOG` имеет шаблон в `TEMPLATES` и наоборот** — иначе
каталог тихо разъедется с рендером.

### Задача 2. Резолвер каналов (~1:15)
`back/services/notification_resolver.py` (новый) — вся логика формулы из
раздела 4, одна функция:

```python
async def resolve_channels(db, studio_id, role, event_id,
                           recipient_user_id: int | None) -> tuple[set[str], bool]:
    """→ (каналы к отправке, forced). forced=True — сработала страховка."""
```

В `notifier.py` блок строк 379–390 заменяется вызовом этой функции.
**Остальные 380 строк `notifier.py` не трогаем** — рендер, доставка и
адресация работают.

```python
channels, forced = await resolve_channels(db, studio_id, role, event_id, user_id)
if forced:
    logger.warning("notify: forced fallback studio=%s event=%s", studio_id, event_id)
if not channels:
    return False        # только для optional — единственный легальный «не слать»
```

### Задача 3. Эндпоинты (~1:15)
`back/routers/settings/notifications.py` — дописать `GET /matrix`,
`GET/PATCH /me`, ужесточить `PATCH /events`.
Схемы — `back/schemas/settings/notifications.py`: `ChannelInfo`,
`MatrixRow`, `MatrixRead`, `UserPrefRead`, `UserPrefUpdate`.

### Задача 4. Недостающие события тренера (~0:45)
Закрыть дыру в покрытии — тренер должен узнавать о своих занятиях:

- `TEMPLATES` в `notifier.py`: добавить `t1` («Ваше занятие отменено»)
  и `t2` («Ваше занятие перенесено»), ru + en.
- `back/routers/schedule/lessons.py` — там, где уже шлётся `c3` клиенту
  (строка ~468) и `c11` (строка ~385), добавить парный вызов
  `notify(db, studio_id, "trainer", "t1"/"t2", {"to_email": <email тренера>, ...})`.
  `_recipient()` уже умеет `context["to_email"]` — точечная адресация
  конкретному тренеру, а не всем.

---

## Frontend

### Задача 5. `NotificationsTab` — матрица (~1:45)

**Файлы:**
- `components/tabs/NotificationsTab.tsx` (переписать, сейчас 64 строки моков)
- `components/notifications/EventMatrix.tsx` (новый)
- `hooks/useNotificationMatrix.ts` (новый)

```ts
const { data } = useQuery({ queryKey: queryKeys.notificationMatrix,
                            queryFn: settingsApi.getNotificationMatrix });
const toggle = useMutation({
  mutationFn: settingsApi.toggleEventChannel,
  onMutate: async (v) => {            // optimistic: тумблер отзывается мгновенно
    await qc.cancelQueries({ queryKey: queryKeys.notificationMatrix });
    const prev = qc.getQueryData(queryKeys.notificationMatrix);
    qc.setQueryData(queryKeys.notificationMatrix, patchRow(prev, v));
    return { prev };
  },
  onError: (e, _v, ctx) => {          // 409 → тумблер возвращается + объяснение
    qc.setQueryData(queryKeys.notificationMatrix, ctx.prev);
    toast.error(getErrorMessage(e));
  },
  onSuccess: (row) => qc.setQueryData(queryKeys.notificationMatrix, mergeRow(row)),
});
```

**Рендер строки — три состояния тумблера:**

| Состояние | Вид |
|---|---|
| обычный | `Switch` из кита |
| залочен (`critical` / последний канал) | `Switch disabled` + иконка замка (inline SVG) + `Tooltip` с `t('settings:notifications.lock.' + lock_reason)` |
| канал не подключён (`connected: false`) | колонка приглушена, вместо тумблера — кнопка-ссылка «Подключить» → вкладка Интеграции |

**Группировка** — по получателю (Клиент / Тренер / Администратор /
Владелец), внутри — по tier, с подзаголовком секции:
«Обязательные · отключить нельзя» / «Рабочие» / «Дополнительные».
Пользователь должен видеть границу, а не догадываться о ней по замкам.

**Названия событий — только из i18n** (`settings:notifications.events.c3`),
бэк отдаёт `event_id`. Никаких русских строк в JSX.

### Задача 6. Личные настройки (~0:45)

Секция «Мои уведомления» внизу той же вкладки, видна **всем ролям**
(владелец тоже человек и тоже получает `o1`/`o2`). Список — только
`optional`-события своей роли + подпись: «Обязательные уведомления
отключить нельзя — они нужны, чтобы вы не пропустили изменения в
расписании и оплаты».

Для админа/тренера, у которых нет доступа к студийной матрице, вкладка
показывает **только** этот блок (`GET /matrix` для них 403 — не зовём).

---

## Edge cases

| Случай | Поведение |
|---|---|
| Канал включён в матрице, интеграция отключена | `resolve_channels` вычитает по `StudioIntegration.is_connected`; в UI колонка приглушена со ссылкой на подключение |
| Владелец выключил канал глобально (`StudioNotificationSettings.email_notifications = false`) | вычитается до матрицы; при `critical` срабатывает `forced`-страховка и в лог идёт WARNING |
| У тренера нет `tg_id` | `_recipient()` уже это учитывает: сотрудникам доступен только email (осознанное MVP-ограничение, зафиксировано в докстринге `notifier.py`) |
| Событие удалили из `TEMPLATES`, а из `CATALOG` нет | падаем на `assert` при старте (задача 1), а не молча в проде |
| Строку `NotificationEventToggle` удалили руками в БД | дефолт берётся из `CATALOG.default_channels` — «пусто» больше не значит «молчать» |
| Гонка: два owner'а правят матрицу одновременно | ответ `PATCH` — целая строка; последняя запись побеждает. Блокировки не заводим (одна студия, один владелец) |

---

## Критерии приёмки EPIC 3

- В матрице строки `critical` залочены; попытка `PATCH` на такую строку
  через curl → 409, состояние в БД не изменилось.
- Снятие последнего канала у `operational` → 409 + понятный тост,
  тумблер визуально вернулся (откат optimistic).
- Свежая студия без единой строки `NotificationEventToggle` **отправляет**
  уведомления по `default_channels` (проверить `c1` на реальной записи).
- Тренер получает письмо при отмене своего занятия (`t1`) — событие,
  которого раньше не было.
- Тумблер канала с отключённой интеграцией ведёт на вкладку Интеграции.
- Тренер видит только блок «Мои уведомления»; `GET /matrix` → 403.
- Матрица переключается без F5; ru/en; build+lint зелёные.
</content>
