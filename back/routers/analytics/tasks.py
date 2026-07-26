from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from database import get_db
from dependencies import require_role, StudioContext
from models import StudioMember, StudioTask, User
from schemas.analytics.tasks import AssigneeOption, StudioTaskCreate, StudioTaskRead, StudioTaskUpdate

router = APIRouter()

# Роли, которыми текущая роль может распоряжаться. trainer → пусто (только сам).
_DELEGATABLE: dict[str, tuple[str, ...]] = {
    "owner": ("admin", "trainer"),
    "admin": ("trainer",),
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


@router.post("/tasks", status_code=201, response_model=StudioTaskRead)
async def create_task(
    body: StudioTaskCreate,
    ctx: StudioContext = Depends(require_role("owner", "admin", "trainer")),
    db: AsyncSession = Depends(get_db),
):
    target = body.assignee_id if body.assignee_id is not None else ctx.user.id
    if target not in await _assignable_ids(ctx, db):
        raise HTTPException(status_code=403, detail="Нельзя назначить задачу этому сотруднику")
    task = StudioTask(
        studio_id=ctx.studio_id,
        author_id=ctx.user.id,
        assignee_id=target,
        text=body.text,
        priority=body.priority,
        tag=body.tag or "Клиент",
    )
    db.add(task)
    await db.commit()
    # refresh с загруженным assignee — иначе _task_read словит MissingGreenlet
    await db.refresh(task, attribute_names=["assignee"])
    return _task_read(task)


@router.patch("/tasks/{task_id}", response_model=StudioTaskRead)
async def update_task(
    task_id: int,
    body: StudioTaskUpdate,
    ctx: StudioContext = Depends(require_role("owner", "admin", "trainer")),
    db: AsyncSession = Depends(get_db),
):
    task = await _get_task_scoped(task_id, ctx, db)
    data = body.model_dump(exclude_unset=True)
    if "assignee_id" in data:
        if data["assignee_id"] not in await _assignable_ids(ctx, db):
            raise HTTPException(status_code=403, detail="Нельзя назначить задачу этому сотруднику")
    # is_done → проставляем/снимаем done_at, чтобы виджет знал время выполнения
    if "is_done" in data:
        task.done_at = datetime.utcnow() if data["is_done"] else None
    for field, value in data.items():
        setattr(task, field, value)
    await db.commit()
    await db.refresh(task, attribute_names=["assignee"])
    return _task_read(task)


@router.delete("/tasks/{task_id}", status_code=204)
async def delete_task(
    task_id: int,
    ctx: StudioContext = Depends(require_role("owner", "admin", "trainer")),
    db: AsyncSession = Depends(get_db),
):
    task = await _get_task_scoped(task_id, ctx, db)
    await db.delete(task)
    await db.commit()
