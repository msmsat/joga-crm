from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import case, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from dependencies import require_role, StudioContext
from models import Counterparty, Operation
from schemas.finances.operations import (
    CounterpartyCreate,
    CounterpartyRead,
    CounterpartyUpdate,
)

router = APIRouter()

_DEFAULT_COLOR = "#FCAE91"


async def _stats(studio_id: int, db: AsyncSession) -> dict[int, tuple[int, int]]:
    """{counterparty_id: (balance, deals_count)} — на лету из операций (правило 5).
    Доход +, расход −; deals_count — число привязанных операций."""
    rows = (await db.execute(
        select(
            Operation.counterparty_id,
            func.sum(case((Operation.type == "out", -Operation.amount), else_=Operation.amount)),
            func.count(Operation.id),
        )
        .where(Operation.studio_id == studio_id, Operation.counterparty_id.isnot(None))
        .group_by(Operation.counterparty_id)
    )).all()
    return {cp_id: (int(bal or 0), int(cnt)) for cp_id, bal, cnt in rows}


def _to_read(cp: Counterparty, balance: int, deals_count: int) -> CounterpartyRead:
    return CounterpartyRead(
        id=cp.id,
        name=cp.name,
        counterparty_type=cp.counterparty_type,
        inn=cp.inn,
        category=cp.category,
        balance=balance,
        deals_count=deals_count,
    )


async def _get_or_404(cp_id: int, studio_id: int, db: AsyncSession) -> Counterparty:
    cp = (await db.execute(
        select(Counterparty).where(Counterparty.id == cp_id, Counterparty.studio_id == studio_id)
    )).scalar_one_or_none()
    if cp is None:
        raise HTTPException(status_code=404, detail="Контрагент не найден")
    return cp


@router.get("/counterparties", response_model=list[CounterpartyRead])
async def list_counterparties(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(Counterparty).where(Counterparty.studio_id == ctx.studio_id).order_by(Counterparty.id)
    )).scalars().all()
    stats = await _stats(ctx.studio_id, db)
    return [_to_read(cp, *stats.get(cp.id, (0, 0))) for cp in rows]


@router.post("/counterparties", status_code=201, response_model=CounterpartyRead)
async def create_counterparty(
    body: CounterpartyCreate,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    cp = Counterparty(
        studio_id=ctx.studio_id,
        name=body.name,
        counterparty_type=body.counterparty_type,
        inn=body.inn,
        category=body.category or "",
        color=_DEFAULT_COLOR,
    )
    db.add(cp)
    await db.commit()
    await db.refresh(cp)
    return _to_read(cp, 0, 0)


@router.patch("/counterparties/{cp_id}", response_model=CounterpartyRead)
async def update_counterparty(
    cp_id: int,
    body: CounterpartyUpdate,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    cp = await _get_or_404(cp_id, ctx.studio_id, db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(cp, field, value)
    await db.commit()
    await db.refresh(cp)
    stats = await _stats(ctx.studio_id, db)
    return _to_read(cp, *stats.get(cp.id, (0, 0)))


@router.delete("/counterparties/{cp_id}", status_code=204)
async def delete_counterparty(
    cp_id: int,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    cp = await _get_or_404(cp_id, ctx.studio_id, db)
    await db.delete(cp)
    await db.commit()
