from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from dependencies import require_role, StudioContext
from models import StudioTask
from schemas.analytics.tasks import StudioTaskCreate, StudioTaskRead, StudioTaskUpdate

router = APIRouter()


async def _get_task_or_404(task_id: int, studio_id: int, db: AsyncSession) -> StudioTask:
    task = (await db.execute(
        select(StudioTask).where(StudioTask.id == task_id, StudioTask.studio_id == studio_id)
    )).scalar_one_or_none()
    if task is None:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    return task


@router.get("/tasks", response_model=list[StudioTaskRead])
async def list_tasks(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    tasks = (await db.execute(
        select(StudioTask)
        .where(StudioTask.studio_id == ctx.studio_id)
        .order_by(StudioTask.is_done, StudioTask.created_at.desc())
    )).scalars().all()
    return tasks


@router.post("/tasks", status_code=201, response_model=StudioTaskRead)
async def create_task(
    body: StudioTaskCreate,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    task = StudioTask(
        studio_id=ctx.studio_id,
        author_id=ctx.user.id,
        text=body.text,
        priority=body.priority,
        tag=body.tag or "Клиент",
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return task


@router.patch("/tasks/{task_id}", response_model=StudioTaskRead)
async def update_task(
    task_id: int,
    body: StudioTaskUpdate,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    task = await _get_task_or_404(task_id, ctx.studio_id, db)
    data = body.model_dump(exclude_unset=True)
    # is_done → проставляем/снимаем done_at, чтобы виджет знал время выполнения
    if "is_done" in data:
        task.done_at = datetime.utcnow() if data["is_done"] else None
    for field, value in data.items():
        setattr(task, field, value)
    await db.commit()
    await db.refresh(task)
    return task


@router.delete("/tasks/{task_id}", status_code=204)
async def delete_task(
    task_id: int,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    task = await _get_task_or_404(task_id, ctx.studio_id, db)
    await db.delete(task)
    await db.commit()
