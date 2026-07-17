from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from dependencies import require_role, StudioContext
from models import FinancialGoal, Operation
from schemas.finances.goals import GoalCreate, GoalRead, GoalUpdate

router = APIRouter()

_DEFAULT_COLOR = "#FCAE91"


async def _auto_amount(goal: FinancialGoal, studio_id: int, db: AsyncSession) -> int:
    """current_amount для auto-цели = сумма доходов её категории от created_at до deadline."""
    if not goal.category:
        return 0
    filters = [
        Operation.studio_id == studio_id,
        Operation.type == "in",
        Operation.category == goal.category,
        Operation.op_date >= goal.created_at.date(),
    ]
    if goal.deadline is not None:
        filters.append(Operation.op_date <= goal.deadline)
    total = (await db.execute(
        select(func.coalesce(func.sum(Operation.amount), 0)).where(*filters)
    )).scalar_one()
    return int(total)


async def _to_read(goal: FinancialGoal, studio_id: int, db: AsyncSession) -> GoalRead:
    current = await _auto_amount(goal, studio_id, db) if goal.tracking_mode == "auto" else goal.current_amount
    return GoalRead(
        id=goal.id,
        title=goal.title,
        target_amount=goal.target_amount,
        current_amount=current,
        tracking_mode=goal.tracking_mode,
        deadline=goal.deadline,
        category=goal.category,
        priority=goal.priority,
    )


async def _get_goal_or_404(goal_id: int, studio_id: int, db: AsyncSession) -> FinancialGoal:
    goal = (await db.execute(
        select(FinancialGoal).where(FinancialGoal.id == goal_id, FinancialGoal.studio_id == studio_id)
    )).scalar_one_or_none()
    if goal is None:
        raise HTTPException(status_code=404, detail="Цель не найдена")
    return goal


@router.get("/goals", response_model=list[GoalRead])
async def list_goals(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    goals = (await db.execute(
        select(FinancialGoal).where(FinancialGoal.studio_id == ctx.studio_id).order_by(FinancialGoal.id)
    )).scalars().all()
    return [await _to_read(g, ctx.studio_id, db) for g in goals]


@router.post("/goals", status_code=201, response_model=GoalRead)
async def create_goal(
    body: GoalCreate,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    goal = FinancialGoal(
        studio_id=ctx.studio_id,
        title=body.title,
        target_amount=body.target_amount,
        current_amount=0,
        tracking_mode=body.tracking_mode,
        deadline=body.deadline,
        category=body.category,
        priority=body.priority,
        color=_DEFAULT_COLOR,
    )
    db.add(goal)
    await db.commit()
    await db.refresh(goal)
    return await _to_read(goal, ctx.studio_id, db)


@router.patch("/goals/{goal_id}", response_model=GoalRead)
async def update_goal(
    goal_id: int,
    body: GoalUpdate,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    goal = await _get_goal_or_404(goal_id, ctx.studio_id, db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(goal, field, value)
    await db.commit()
    await db.refresh(goal)
    return await _to_read(goal, ctx.studio_id, db)


@router.delete("/goals/{goal_id}", status_code=204)
async def delete_goal(
    goal_id: int,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    goal = await _get_goal_or_404(goal_id, ctx.studio_id, db)
    await db.delete(goal)
    await db.commit()
