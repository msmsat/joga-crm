# EPIC D2 — БД + API: делегирование задач (RBAC)

**Цель:** задача может быть назначена конкретному сотруднику. Кто какие задачи
видит и кому может назначать — жёстко по роли (owner/admin/trainer). 100% данных
из БД, скоуп по студии.

**Зависимости:** нет. **Оценка: ~3:30.** Только бэк.

---

## Контекст (что есть сейчас)

- Модель [`StudioTask`](../../back/models/reports.py#L64): есть `author_id`,
  **нет `assignee_id`**.
- Роутер [`tasks.py`](../../back/routers/analytics/tasks.py): весь CRUD под
  `require_role("owner")` — админ/тренер к задачам вообще не имеют доступа.
- Роли: `StudioMember.role ∈ {"owner","admin","trainer"}`, приходят в
  `ctx.role` через `StudioContext`; охранник — `require_role(*roles)`
  ([`dependencies.py:78`](../../back/dependencies.py#L78)).

## Backend — Задача 1. Схема БД: колонка `assignee_id` (~0:45)

**Файл:** [`back/models/reports.py`](../../back/models/reports.py#L64), класс `StudioTask`.

Добавить:

```python
assignee_id: Mapped[Optional[int]] = mapped_column(
    ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
)
assignee: Mapped[Optional["User"]] = relationship(foreign_keys=[assignee_id])
```

- `author_id` = кто создал; `assignee_id` = кому назначено. `NULL` для assignee =
  «личная задача автора» (пункт «Мои»).
- `ON DELETE SET NULL`: увольнение сотрудника не сносит задачи.

**Миграция:**
```bash
cd back && alembic revision --autogenerate -m "task assignee_id" && alembic upgrade head
```
Data-fix в миграции: существующим строкам `assignee_id = author_id` (были личные
задачи владельца). Прописать в `upgrade()` одним `op.execute`.

## Backend — Задача 2. Ролевая матрица доступа (~0:30)

Инвариант (из аудита §4):

| Роль | Видит задачи | Может назначать |
|---|---|---|
| owner | свои + всех admin + всех trainer | себе, любому admin, любому trainer |
| admin | свои + всех trainer | себе, любому trainer |
| trainer | только свои (`assignee_id == self`) | только себе |

**Файл:** `back/routers/analytics/tasks.py` — helper:

```python
# Кому role может назначать/чьи задачи видит. trainer → пусто (только сам).
_DELEGATABLE: dict[str, tuple[str, ...]] = {
    "owner": ("admin", "trainer"),
    "admin": ("trainer",),
    "trainer": (),
}

async def _assignable_user_ids(ctx: StudioContext, db: AsyncSession) -> set[int]:
    """id самого пользователя + id членов студии с делегируемыми ролями."""
    ids = {ctx.user.id}
    roles = _DELEGATABLE[ctx.role]
    if roles:
        rows = (await db.execute(
            select(StudioMember.user_id).where(
                StudioMember.studio_id == ctx.studio_id,
                StudioMember.role.in_(roles),
            )
        )).scalars().all()
        ids.update(rows)
    return ids
```

> Единая функция — источник правды и для видимости (GET), и для валидации
> назначения (POST/PATCH). ponytail: одна проверка на все три эндпоинта, а не по
> guard'у в каждом.

## Backend — Задача 3. Эндпоинты (~1:15)

**Файл:** `back/routers/analytics/tasks.py`. `require_role("owner")` →
`require_role("owner", "admin", "trainer")` на всех — доступ разводит helper, не guard.

### GET `/analytics/tasks?scope=&assignee_id=`

Параметры (оба опциональны):
- `scope: Literal["mine","admins","trainers"] = "mine"` — группа из первого дропдауна UI.
- `assignee_id: int | None` — конкретный сотрудник из второго дропдауна.

Логика фильтра (поверх `studio_id == ctx.studio_id`):

```python
allowed = await _assignable_user_ids(ctx, db)
if assignee_id is not None:
    if assignee_id not in allowed:
        raise HTTPException(403, "Нет доступа к задачам этого сотрудника")
    stmt = stmt.where(StudioTask.assignee_id == assignee_id)
elif scope == "mine":
    stmt = stmt.where(StudioTask.assignee_id == ctx.user.id)
else:  # 'admins' | 'trainers' — все задачи роли (в пределах allowed)
    want = "admin" if scope == "admins" else "trainer"
    if want not in _DELEGATABLE[ctx.role]:
        raise HTTPException(403, "Роль недоступна для просмотра")
    role_ids = allowed - {ctx.user.id}  # члены нужной роли уже в allowed
    stmt = stmt.where(StudioTask.assignee_id.in_(role_ids or [-1]))
```

Порядок — как сейчас: `.order_by(StudioTask.is_done, StudioTask.created_at.desc())`.

### GET `/analytics/tasks/assignees`  *(новый — для второго дропдаунa)*

Список сотрудников, которым текущая роль может назначать, сгруппированный по роли:

```jsonc
// response: AssigneeOption[]
[ { "user_id": 12, "name": "Анна Петрова", "role": "admin" },
  { "user_id": 34, "name": "Игорь Сомов",  "role": "trainer" } ]
```

Join `StudioMember → User` по `studio_id` и `role in _DELEGATABLE[ctx.role]`.
Имя — `" ".join(filter(None, [User.name, User.last_name]))` (как в `trainers_report`).
trainer получает `[]`.

### POST `/analytics/tasks`

`StudioTaskCreate` дополнить полем `assignee_id: int | None`. Валидация:

```python
target = body.assignee_id if body.assignee_id is not None else ctx.user.id
if target not in await _assignable_user_ids(ctx, db):
    raise HTTPException(403, "Нельзя назначить задачу этому сотруднику")
task = StudioTask(studio_id=ctx.studio_id, author_id=ctx.user.id,
                  assignee_id=target, text=body.text, priority=body.priority,
                  tag=body.tag or "Клиент")
```

### PATCH `/analytics/tasks/{id}` и DELETE

`_get_task_or_404` расширить: после проверки studio_id — если задача не в
`_assignable_user_ids` (по `assignee_id`), `403`. Разрешить менять `assignee_id`
в PATCH с той же валидацией, что в POST. trainer PATCH-ит только свои → `is_done`
работает, переназначить чужому не может.

## Backend — Задача 4. Схемы (~0:30)

**Файл:** [`back/schemas/analytics/tasks.py`](../../back/schemas/analytics/tasks.py).

```python
class StudioTaskRead(BaseSchema):
    ...            # существующие поля
    assignee_id: Optional[int] = None
    assignee_name: Optional[str] = None   # для рендера в UI без доп-запроса

class StudioTaskCreate(BaseSchema):
    ...
    assignee_id: Optional[int] = None

class StudioTaskUpdate(BaseSchema):
    ...
    assignee_id: Optional[int] = None

class AssigneeOption(BaseSchema):        # новая
    user_id: int
    name: str
    role: str
```

`assignee_name` в `StudioTaskRead` — резолвить в роутере из `task.assignee`
(`" ".join(filter(None, [assignee.name, assignee.last_name]))`) при сериализации,
либо `None` для личных задач без назначенца.

## Backend — Задача 5. Тесты (~0:30)

**Файл:** `back/tests/test_dashboard_tasks.py` (по образцу существующих в `back/tests/`).
Минимальный набор assert'ов на инвариант ролей:

- trainer видит только `assignee_id == self`; `scope='trainers'` → 403.
- admin `scope='trainers'` → видит задачи тренеров, `scope='admins'` → 403.
- owner может POST с `assignee_id` тренера; trainer POST с чужим `assignee_id` → 403.
- PATCH `is_done` чужой задачи тренером → 403.

## Definition of Done

- Миграция применяется и откатывается чисто; старые задачи получили `assignee_id`.
- Три роли проходят матрицу доступа (тест зелёный).
- Существующий фронт (`getTasks()` без параметров) **не сломан**: `scope`
  дефолтит в `"mine"` — владелец по-прежнему видит свои задачи.
