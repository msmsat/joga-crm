from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from activity import log_activity
from database import get_db
from dependencies import require_role, StudioContext
from models import Account, Client, Counterparty, Operation
from routers.clients.loyalty import accrue_points
from schemas.common import Page
from schemas.finances.operations import OperationCreate, OperationRead
from services.notifier import notify

router = APIRouter()


def _balance_delta(op_type: str, amount: int) -> int:
    """in → +amount, out → −amount. Один знак и для применения, и для отката."""
    return amount if op_type == "in" else -amount


async def _own_or_404(model, entity_id: int, studio_id: int, db: AsyncSession, label: str):
    exists = (await db.execute(
        select(model.id).where(model.id == entity_id, model.studio_id == studio_id)
    )).scalar_one_or_none()
    if exists is None:
        raise HTTPException(status_code=404, detail=f"{label} не найден")


def _to_read(op: Operation) -> OperationRead:
    return OperationRead(
        id=op.id,
        type=op.type,
        title=op.title,
        amount=op.amount,
        op_date=op.op_date,
        category=op.category,
        method=op.method,
        status=op.status,
        client_id=op.client_id,
        account_id=op.account_id,
    )


@router.get("/operations", response_model=Page[OperationRead])
async def list_operations(
    type: Optional[str] = None,
    category: Optional[str] = None,
    account_id: Optional[int] = None,
    client_id: Optional[int] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    search: Optional[str] = None,
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    filters = [Operation.studio_id == ctx.studio_id]
    if type is not None:
        filters.append(Operation.type == type)
    if category is not None:
        filters.append(Operation.category == category)
    if account_id is not None:
        filters.append(Operation.account_id == account_id)
    if client_id is not None:
        filters.append(Operation.client_id == client_id)
    if date_from is not None:
        filters.append(Operation.op_date >= date_from)
    if date_to is not None:
        filters.append(Operation.op_date <= date_to)
    if search:
        like = f"%{search}%"
        filters.append(or_(Operation.title.ilike(like), Operation.category.ilike(like)))

    total = (await db.execute(
        select(func.count()).select_from(Operation).where(*filters)
    )).scalar_one()

    rows = (await db.execute(
        select(Operation)
        .where(*filters)
        .order_by(Operation.op_date.desc(), Operation.id.desc())
        .offset(offset)
        .limit(limit)
    )).scalars().all()

    return Page(items=[_to_read(o) for o in rows], total=total, offset=offset, limit=limit)


@router.post("/operations", status_code=201, response_model=OperationRead)
async def create_operation(
    body: OperationCreate,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    account = None
    if body.account_id is not None:
        account = (await db.execute(
            select(Account).where(Account.id == body.account_id, Account.studio_id == ctx.studio_id)
        )).scalar_one_or_none()
        if account is None:
            raise HTTPException(status_code=404, detail="Счёт не найден")
    if body.client_id is not None:
        await _own_or_404(Client, body.client_id, ctx.studio_id, db, "Клиент")
    if body.counterparty_id is not None:
        await _own_or_404(Counterparty, body.counterparty_id, ctx.studio_id, db, "Контрагент")

    op = Operation(
        studio_id=ctx.studio_id,
        type=body.type,
        title=body.title,
        amount=body.amount,
        op_date=body.op_date,
        category=body.category or "",
        method=body.method or "",
        account_id=body.account_id,
        client_id=body.client_id,
        counterparty_id=body.counterparty_id,
    )
    db.add(op)
    if account is not None:
        account.balance += _balance_delta(body.type, body.amount)
    if body.type == "in" and body.client_id is not None:
        await accrue_points(db, ctx.studio_id, body.client_id, body.amount)
    await db.flush()  # нужен op.id для ленты
    sign = "+" if body.type == "in" else "−"
    log_activity(
        db, ctx.studio_id, "operation",
        title=f"{sign}{body.amount / 100:.0f} ₽ · {body.title}",
        actor_name=f"{ctx.user.name} {ctx.user.last_name or ''}".strip(),
        entity_type="operation", entity_id=op.id,
    )
    # операция, сдвиг баланса и запись в ленту — один commit: упадёт середина, откатится всё
    await db.commit()
    await db.refresh(op)

    # Успешная оплата клиента → квитанция (c4).
    if body.type == "in" and body.client_id is not None:
        await notify(db, ctx.studio_id, "client", "c4",
                     {"client_id": body.client_id, "amount": body.amount})
    return _to_read(op)


@router.delete("/operations/{operation_id}", status_code=204)
async def delete_operation(
    operation_id: int,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    op = (await db.execute(
        select(Operation).where(Operation.id == operation_id, Operation.studio_id == ctx.studio_id)
    )).scalar_one_or_none()
    if op is None:
        raise HTTPException(status_code=404, detail="Операция не найдена")

    if op.account_id is not None:
        account = (await db.execute(
            select(Account).where(Account.id == op.account_id)
        )).scalar_one_or_none()
        if account is not None:
            account.balance -= _balance_delta(op.type, op.amount)

    await db.delete(op)
    await db.commit()
