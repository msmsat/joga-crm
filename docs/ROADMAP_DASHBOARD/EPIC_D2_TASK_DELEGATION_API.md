# EPIC D2 — БД + API: делегирование задач (RBAC)

**Цель:** задача принадлежит конкретному исполнителю. Кто чьи задачи видит и кому
может назначать — жёстко по роли (`owner` / `admin` / `trainer`), проверка на
сервере. 100 % данных из БД, скоуп по студии.

**Зависимости:** нет — можно стартовать первым. **Оценка ~3:30.** Только бэкенд.
**Разблокирует:** [D4](EPIC_D4_TASKS_WIDGET_REDESIGN.md).

---

## Контекст (что есть сейчас)

| Сущность | Файл | Состояние |
|---|---|---|
| Модель `StudioTask` | `back/models/reports.py:64` | `id, studio_id, author_id, text, priority, tag, is_done, done_at, created_at`. **Нет `assignee_id`** |
| CRUD задач | `back/routers/analytics/tasks.py` | 4 эндпоинта, все под `require_role("owner")` — админ/тренер получают 403 |
| Схемы | `back/schemas/analytics/tasks.py` | `StudioTaskRead/Create/Update` |
| Роли | `back/models/studio_member.py` | `StudioMember.role ∈ {owner, admin, trainer}`, `UniqueConstraint(user_id, studio_id)` → **у пользователя ровно одна роль в студии** |
| Охранник | `back/dependencies.py:78` | `require_role(*roles)` → 403; контекст `StudioContext(user, studio_id, role)` |

---

## Backend

### Задача 1. Схема БД: колонка `assignee_id` (~0:45)

**Файл:** `back/models/reports.py`, класс `StudioTask`.

```python
class StudioTask(Base):
    __tablename__ = "studio_tasks"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    author_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    # ── НОВОЕ ──
    assignee_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    text: Mapped[str] = mapped_column(String(500))
    priority: Mapped[str] = mapped_column(String(10), default="medium")
    tag: Mapped[str] = mapped_column(String(50), default="Клиент")
    is_done: Mapped[bool] = mapped_column(Boolean, default=False)
    done_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=False), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), server_default=func.now())

    studio: Mapped["Studio"] = relationship()
    author: Mapped[Optional["User"]] = relationship(foreign_keys=[author_id])
    # ── НОВОЕ: два FK на users → foreign_keys обязателен на ОБОИХ отношениях ──
    assignee: Mapped[Optional["User"]] = relationship(foreign_keys=[assignee_id])
```

**Семантика полей**

| Поле | Значение |
|---|---|
| `author_id` | кто создал задачу (не меняется) |
| `assignee_id` | кому назначена; `NULL` — только у осиротевших задач после удаления пользователя (`ON DELETE SET NULL`) |

> ⚠️ Без `foreign_keys=[...]` на **обоих** relationship SQLAlchemy падает с
> `AmbiguousForeignKeysError` — на `users` теперь два FK.

**Миграция**

```bash
cd back && venv\Scripts\activate
alembic revision --autogenerate -m "studio_task assignee_id"
alembic upgrade head
```

В `upgrade()` после `op.add_column` дописать data-fix — все существующие задачи
были личными задачами владельца:

```python
op.execute("UPDATE studio_tasks SET assignee_id = author_id WHERE assignee_id IS NULL")
```

Индекс по `assignee_id` создаётся из `index=True`; отдельный композит
`(studio_id, assignee_id)` не нужен — таблица маленькая, `studio_id` уже проиндексирован.

---

### Задача 2. Ролевая матрица (~0:30)

Инвариант из §4 аудита:

| Роль | Видит задачи | Может назначать |
|---|---|---|
| `owner` | свои + всех `admin` + всех `trainer` | себе, любому `admin`, любому `trainer` |
| `admin` | свои + всех `trainer` | себе, любому `trainer` |
| `trainer` | только свои (`assignee_id == self`) | только себе |

**Файл:** `back/routers/analytics/tasks.py` — два хелпера, единый источник правды
и для видимости (GET), и для валидации назначения (POST/PATCH):

```python
from sqlalchemy.orm import selectinload
from models import StudioMember, StudioTask, User

# Роли, которыми текущая роль может распоряжаться. trainer → пусто (только сам).
_DELEGATABLE: dict[str, tuple[str, ...]] = {
    "owner":   ("admin", "trainer"),
    "admin":   ("trainer",),
    "trainer": (),
}


async def _member_ids(studio_id: int, roles: tuple[str, ...], db: AsyncSession) -> set[int]:
    """id членов студии с указанными ролями."""
    if not roles:
        return set()
    rows = (await db.execute(
        select(StudioMember.user_id).where(
            StudioMember.studio_id == studio_id,
            StudioMember.role.in_(roles),
        )
    )).scalars().all()
    return set(rows)


async def _assignable_ids(ctx: StudioContext, db: AsyncSession) -> set[int]:
    """Сам пользователь + все, кому его роль вправе делегировать."""
    return {ctx.user.id} | await _member_ids(ctx.studio_id, _DELEGATABLE[ctx.role], db)
```

> Вычитать `ctx.user.id` из группового списка не нужно: `UniqueConstraint(user_id,
> studio_id)` гарантирует одну роль на пользователя в студии — «Мои» и «Админов»
> никогда не пересекаются.

**Сериализация имени исполнителя** (нужна UI для аватара/подписи без второго запроса):

```python
def _full_name(u: User | None) -> str | None:
    return " ".join(filter(None, [u.name, u.last_name])) if u else None


def _task_read(task: StudioTask) -> dict:
    """ORM → payload StudioTaskRead. Требует загруженного task.assignee."""
    return {
        "id": task.id,
        "text": task.text,
        "priority": task.priority,
        "tag": task.tag,
        "is_done": task.is_done,
        "done_at": task.done_at,
        "created_at": task.created_at,
        "assignee_id": task.assignee_id,
        "assignee_name": _full_name(task.assignee),
    }
```

> ⚠️ **Обязателен `selectinload(StudioTask.assignee)` в каждом запросе**, который
> потом сериализуется. В async-SQLAlchemy ленивое обращение к `task.assignee` вне
> greenlet-контекста бросает `MissingGreenlet`. Образец в проекте —
> `routers/staff/profiles.py` (`selectinload` + ручной сборщик `_staff_list_item`).

---

### Задача 3. Эндпоинты (~1:15)

**Файл:** `back/routers/analytics/tasks.py`. На всех четырёх эндпоинтах охранник
меняется на `require_role("owner", "admin", "trainer")` — **доступ разводят
хелперы, а не guard** (иначе тренер не сможет закрыть даже свою задачу).

---

#### `GET /analytics/tasks`

**Query-параметры** (оба опциональны, порядок приоритета: `assignee_id` > `scope`):

| Параметр | Тип | Дефолт | Смысл |
|---|---|---|---|
| `scope` | `Literal["mine","admins","trainers"]` | `"mine"` | группа из **первого** дропдауна UI |
| `assignee_id` | `int \| None` | `None` | конкретный сотрудник из **второго** дропдауна |

```python
@router.get("/tasks", response_model=list[StudioTaskRead])
async def list_tasks(
    scope: Literal["mine", "admins", "trainers"] = "mine",
    assignee_id: int | None = None,
    ctx: StudioContext = Depends(require_role("owner", "admin", "trainer")),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(StudioTask)
        .options(selectinload(StudioTask.assignee))
        .where(StudioTask.studio_id == ctx.studio_id)
    )

    if assignee_id is not None:
        if assignee_id not in await _assignable_ids(ctx, db):
            raise HTTPException(status_code=403, detail="Нет доступа к задачам этого сотрудника")
        stmt = stmt.where(StudioTask.assignee_id == assignee_id)
    elif scope == "mine":
        stmt = stmt.where(StudioTask.assignee_id == ctx.user.id)
    else:
        want = "admin" if scope == "admins" else "trainer"
        if want not in _DELEGATABLE[ctx.role]:
            raise HTTPException(status_code=403, detail="Роль недоступна для просмотра")
        ids = await _member_ids(ctx.studio_id, (want,), db)
        if not ids:
            return []                       # в студии нет таких сотрудников
        stmt = stmt.where(StudioTask.assignee_id.in_(ids))

    stmt = stmt.order_by(StudioTask.is_done, StudioTask.created_at.desc())
    tasks = (await db.execute(stmt)).scalars().all()
    return [_task_read(t) for t in tasks]
```

**Response `200` — `StudioTaskRead[]`:**

```jsonc
[
  {
    "id": 41, "text": "Перезвонить Ирине по абонементу", "priority": "high",
    "tag": "Клиент", "is_done": false, "done_at": null,
    "created_at": "2026-07-23T09:14:02",
    "assignee_id": 12, "assignee_name": "Анна Петрова"
  }
]
```

**Ошибки:** `403` — чужой `assignee_id` либо `scope`, недоступный роли; `401` — нет токена.

---

#### `GET /analytics/tasks/assignees` *(новый — питает второй дропдаун)*

```python
@router.get("/tasks/assignees", response_model=list[AssigneeOption])
async def list_assignees(
    ctx: StudioContext = Depends(require_role("owner", "admin", "trainer")),
    db: AsyncSession = Depends(get_db),
):
    roles = _DELEGATABLE[ctx.role]
    if not roles:
        return []                                   # тренеру делегировать некому
    rows = (await db.execute(
        select(User, StudioMember.role)
        .join(StudioMember, StudioMember.user_id == User.id)
        .where(StudioMember.studio_id == ctx.studio_id, StudioMember.role.in_(roles))
        .order_by(User.name)
    )).all()
    return [{"user_id": u.id, "name": _full_name(u), "role": role} for u, role in rows]
```

> ⚠️ Роутер **должен** объявлять `/tasks/assignees` **до** любого
> `/tasks/{task_id}` — иначе FastAPI сматчит литерал `assignees` на `task_id: int`
> и вернёт `422`.

**Response `200` — `AssigneeOption[]`:**

```jsonc
[ { "user_id": 12, "name": "Анна Петрова", "role": "admin" },
  { "user_id": 34, "name": "Игорь Сомов",  "role": "trainer" } ]
```

---

#### `POST /analytics/tasks`

**Request body — `StudioTaskCreate`:**

```jsonc
{ "text": "Свести отчёт по залу", "priority": "medium", "tag": "Отчёты", "assignee_id": 34 }
```

`assignee_id` опционален: `null`/отсутствует → задача назначается автору.

```python
@router.post("/tasks", status_code=201, response_model=StudioTaskRead)
async def create_task(body: StudioTaskCreate, ctx=Depends(require_role("owner","admin","trainer")), db=Depends(get_db)):
    target = body.assignee_id if body.assignee_id is not None else ctx.user.id
    if target not in await _assignable_ids(ctx, db):
        raise HTTPException(status_code=403, detail="Нельзя назначить задачу этому сотруднику")
    task = StudioTask(
        studio_id=ctx.studio_id, author_id=ctx.user.id, assignee_id=target,
        text=body.text, priority=body.priority, tag=body.tag or "Клиент",
    )
    db.add(task)
    await db.commit()
    # refresh с загруженным assignee — иначе _task_read словит MissingGreenlet
    await db.refresh(task, attribute_names=["assignee"])
    return _task_read(task)
```

**Response `201`** — созданная задача (тот же payload, что в GET). **Ошибки:** `403` — недопустимый `assignee_id`; `422` — пустой `text` / неизвестный `priority`.

---

#### `PATCH /analytics/tasks/{task_id}`

**Request body — `StudioTaskUpdate`** (все поля опциональны, `exclude_unset`):

```jsonc
{ "is_done": true }                 // отметка выполнения — основной путь виджета
{ "assignee_id": 12 }               // переназначение
{ "text": "…", "priority": "low", "tag": "Финансы" }
```

Доступ к строке — общий хелпер (заменяет `_get_task_or_404`):

```python
async def _get_task_scoped(task_id: int, ctx: StudioContext, db: AsyncSession) -> StudioTask:
    """Задача студии, к которой у роли есть доступ. 404 — чужая студия, 403 — чужой исполнитель."""
    task = (await db.execute(
        select(StudioTask)
        .options(selectinload(StudioTask.assignee))
        .where(StudioTask.id == task_id, StudioTask.studio_id == ctx.studio_id)
    )).scalar_one_or_none()
    if task is None:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    allowed = await _assignable_ids(ctx, db)
    # автор всегда управляет своей задачей, даже если исполнитель вне его скоупа
    if task.assignee_id not in allowed and task.author_id != ctx.user.id:
        raise HTTPException(status_code=403, detail="Нет доступа к задаче")
    return task
```

Тело обработчика — как сейчас, плюс валидация переназначения:

```python
data = body.model_dump(exclude_unset=True)
if "assignee_id" in data:
    if data["assignee_id"] not in await _assignable_ids(ctx, db):
        raise HTTPException(status_code=403, detail="Нельзя назначить задачу этому сотруднику")
if "is_done" in data:
    task.done_at = datetime.utcnow() if data["is_done"] else None
for field, value in data.items():
    setattr(task, field, value)
await db.commit()
await db.refresh(task, attribute_names=["assignee"])
return _task_read(task)
```

**Response `200`** — обновлённая задача. **Ошибки:** `404` / `403` / `422`.

---

#### `DELETE /analytics/tasks/{task_id}`

Тот же `_get_task_scoped`, ответ `204 No Content`. Тренер удаляет только свои.

---

### Задача 4. Схемы Pydantic (~0:30)

**Файл:** `back/schemas/analytics/tasks.py`

```python
from datetime import datetime
from typing import Literal, Optional

from pydantic import Field          # ← новый импорт (ограничения длины text)

from schemas._base import BaseSchema


class StudioTaskRead(BaseSchema):
    id: int
    text: str
    priority: str
    tag: Optional[str] = None
    is_done: bool
    done_at: Optional[datetime] = None
    created_at: datetime
    assignee_id: Optional[int] = None          # ← новое
    assignee_name: Optional[str] = None        # ← новое, резолвится в _task_read


class StudioTaskCreate(BaseSchema):
    text: str = Field(min_length=1, max_length=500)   # было без ограничений; колонка String(500)
    priority: Literal["low", "medium", "high"] = "medium"
    tag: Optional[str] = None
    assignee_id: Optional[int] = None          # ← новое


class StudioTaskUpdate(BaseSchema):
    text: Optional[str] = Field(default=None, min_length=1, max_length=500)
    priority: Optional[Literal["low", "medium", "high"]] = None
    tag: Optional[str] = None
    is_done: Optional[bool] = None
    assignee_id: Optional[int] = None          # ← новое


class AssigneeOption(BaseSchema):              # ← новая схема
    user_id: int
    name: str
    role: Literal["admin", "trainer"]
```

Экспортировать `AssigneeOption` там же, где уже экспортируются схемы задач
(`back/schemas/analytics/__init__.py`, если реэкспорт используется).

---

### Задача 5. Тесты (~0:30)

**Файл:** `back/tests/test_dashboard_tasks.py` — по образцу
`back/tests/test_analytics_utilization.py` (реальная БД, сид, ручная чистка,
запуск `python -m tests.test_dashboard_tasks` из `back/`).

Сид: студия + 4 пользователя (`owner`, `admin`, `trainer1`, `trainer2`) с
`StudioMember`, по задаче на каждого. Вызываем функции роутера напрямую с
подставленным `StudioContext` (как в существующих тестах).

Обязательные assert'ы:

| # | Сценарий | Ожидание |
|---|---|---|
| 1 | `trainer1`, `scope="mine"` | только задачи с `assignee_id == trainer1` |
| 2 | `trainer1`, `scope="trainers"` | `HTTPException 403` |
| 3 | `trainer1`, `assignee_id=trainer2` | `403` |
| 4 | `admin`, `scope="trainers"` | задачи обоих тренеров, своей задачи нет |
| 5 | `admin`, `scope="admins"` | `403` |
| 6 | `owner`, `scope="admins"` | задачи админов |
| 7 | `owner` POST с `assignee_id=trainer1` | `201`, в БД `assignee_id == trainer1`, `author_id == owner` |
| 8 | `trainer1` POST с `assignee_id=trainer2` | `403` |
| 9 | `trainer1` PATCH `is_done` чужой задачи | `403` |
| 10 | `trainer1` PATCH `is_done` своей | `200`, `done_at is not None` |
| 11 | GET любой ролью | `assignee_name` заполнен (проверка `selectinload`) |

---

## Frontend API & State

**В этом эпике фронт не трогаем** — контракт готовится для [D4](EPIC_D4_TASKS_WIDGET_REDESIGN.md).

Единственное требование обратной совместимости: текущий вызов
`analyticsApi.getTasks()` (`front/src/api/analytics/analytics.api.ts`) идёт **без
параметров** → `scope` дефолтит в `"mine"`, владелец продолжает видеть свои
задачи, страница не ломается между D2 и D4.

## Frontend UI & Components

Изменений нет.

---

## Definition of Done

- [ ] Миграция применяется и откатывается чисто; у всех старых задач `assignee_id == author_id`.
- [ ] `GET /analytics/tasks/assignees` объявлен выше `/tasks/{task_id}` и не даёт `422`.
- [ ] Ролевая матрица из Задачи 2 воспроизводится тестом (11 assert'ов зелёные).
- [ ] Ни один ответ не отдаёт `assignee_name: null` для существующего пользователя (`selectinload` на месте).
- [ ] `analyticsApi.getTasks()` без параметров работает как раньше.
