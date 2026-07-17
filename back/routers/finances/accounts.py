from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import case, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from dependencies import require_role, StudioContext
from models import Account, Operation
from schemas.finances.accounts import AccountRead, AccountCreate, AccountUpdate

router = APIRouter()

_DEFAULT_COLOR = "#FCAE91"


async def _daily_changes(studio_id: int, db: AsyncSession) -> dict[int, int]:
    """{account_id: сумма операций счёта за сегодня}. Доход +, расход −.
    Считаем на лету — daily_change в БД не храним."""
    rows = (await db.execute(
        select(
            Operation.account_id,
            func.sum(case((Operation.type == "out", -Operation.amount), else_=Operation.amount)),
        )
        .where(
            Operation.studio_id == studio_id,
            Operation.account_id.isnot(None),
            Operation.op_date == date.today(),
        )
        .group_by(Operation.account_id)
    )).all()
    return {acc_id: int(total or 0) for acc_id, total in rows}


def _to_read(acc: Account, daily_change: int) -> AccountRead:
    return AccountRead(
        id=acc.id,
        name=acc.name,
        type=acc.type,
        balance=acc.balance,
        daily_change=daily_change,
        color=acc.color,
        is_system=acc.is_system,
    )


async def _get_account_or_404(account_id: int, studio_id: int, db: AsyncSession) -> Account:
    acc = (await db.execute(
        select(Account).where(Account.id == account_id, Account.studio_id == studio_id)
    )).scalar_one_or_none()
    if acc is None:
        raise HTTPException(status_code=404, detail="Счёт не найден")
    return acc


@router.get("/accounts", response_model=list[AccountRead])
async def list_accounts(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    accounts = (await db.execute(
        select(Account).where(Account.studio_id == ctx.studio_id).order_by(Account.id)
    )).scalars().all()
    changes = await _daily_changes(ctx.studio_id, db)
    return [_to_read(a, changes.get(a.id, 0)) for a in accounts]


@router.post("/accounts", status_code=201, response_model=AccountRead)
async def create_account(
    body: AccountCreate,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    acc = Account(
        studio_id=ctx.studio_id,
        name=body.name,
        type=body.type,
        balance=body.balance,
        color=body.color or _DEFAULT_COLOR,
        is_system=False,
    )
    db.add(acc)
    await db.commit()
    await db.refresh(acc)
    return _to_read(acc, 0)


@router.patch("/accounts/{account_id}", response_model=AccountRead)
async def update_account(
    account_id: int,
    body: AccountUpdate,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    acc = await _get_account_or_404(account_id, ctx.studio_id, db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(acc, field, value)
    await db.commit()
    await db.refresh(acc)
    changes = await _daily_changes(ctx.studio_id, db)
    return _to_read(acc, changes.get(acc.id, 0))


@router.delete("/accounts/{account_id}", status_code=204)
async def delete_account(
    account_id: int,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    acc = await _get_account_or_404(account_id, ctx.studio_id, db)
    await db.delete(acc)
    await db.commit()
