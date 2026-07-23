import csv
import io
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from activity import log_activity
from database import get_db
from dependencies import require_role, StudioContext
from models import Account, Client, Counterparty, Operation
from routers.clients.loyalty import accrue_points, register_purchase
from schemas.common import Page
from schemas.finances.operations import CategoryStat, MethodStat, OperationCreate, OperationRead, OperationUpdate
from services.notifier import notify

router = APIRouter()

_TYPE_LABELS = {"in": "Приход", "out": "Расход"}


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
        counterparty_id=op.counterparty_id,
        trainer_id=op.trainer_id,
    )


@router.get("/operations/categories", response_model=list[str])
async def list_operation_categories(
    type: Optional[str] = Query(None, pattern="^(in|out)$"),
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    filters = [Operation.studio_id == ctx.studio_id, Operation.category != ""]
    if type is not None:
        filters.append(Operation.type == type)
    rows = (await db.execute(
        select(Operation.category).distinct().where(*filters).order_by(Operation.category)
    )).scalars().all()
    return list(rows)


@router.get("/operations/method-stats", response_model=list[MethodStat])
async def get_method_stats(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    filters = [Operation.studio_id == ctx.studio_id, Operation.type == "in"]
    if date_from is not None:
        filters.append(Operation.op_date >= date_from)
    if date_to is not None:
        filters.append(Operation.op_date <= date_to)

    rows = (await db.execute(
        select(Operation.method, func.sum(Operation.amount), func.count())
        .where(*filters)
        .group_by(Operation.method)
    )).all()
    return [MethodStat(method=method or "", amount=int(total), count=count) for method, total, count in rows]


@router.get("/operations/by-category", response_model=list[CategoryStat])
async def get_by_category(
    type: str = Query(..., pattern="^(in|out)$"),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    filters = [Operation.studio_id == ctx.studio_id, Operation.type == type]
    if date_from is not None:
        filters.append(Operation.op_date >= date_from)
    if date_to is not None:
        filters.append(Operation.op_date <= date_to)

    rows = (await db.execute(
        select(Operation.category, func.sum(Operation.amount))
        .where(*filters)
        .group_by(Operation.category)
        .order_by(func.sum(Operation.amount).desc())
    )).all()
    return [CategoryStat(category=category or "other", amount=int(total)) for category, total in rows]


@router.get("/operations/export")
async def export_operations(
    type: Optional[str] = None,
    category: Optional[str] = None,
    account_id: Optional[int] = None,
    client_id: Optional[int] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    search: Optional[str] = None,
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

    rows = (await db.execute(
        select(Operation)
        .where(*filters)
        .order_by(Operation.op_date.desc(), Operation.id.desc())
    )).scalars().all()

    account_names = dict((await db.execute(
        select(Account.id, Account.name).where(Account.studio_id == ctx.studio_id)
    )).all())
    client_names = {
        cid: f"{name} {last_name or ''}".strip()
        for cid, name, last_name in (await db.execute(
            select(Client.id, Client.name, Client.last_name).where(Client.studio_id == ctx.studio_id)
        )).all()
    }
    counterparty_names = dict((await db.execute(
        select(Counterparty.id, Counterparty.name).where(Counterparty.studio_id == ctx.studio_id)
    )).all())

    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=";")
    writer.writerow(["Дата", "Тип", "Название", "Сумма", "Категория", "Метод", "Счёт", "Клиент", "Контрагент"])
    for op in rows:
        writer.writerow([
            op.op_date.isoformat(),
            _TYPE_LABELS.get(op.type, op.type),
            op.title,
            op.amount,
            op.category,
            op.method,
            account_names.get(op.account_id, ""),
            client_names.get(op.client_id, ""),
            counterparty_names.get(op.counterparty_id, ""),
        ])

    csv_bytes = "﻿".encode("utf-8") + buffer.getvalue().encode("utf-8")
    filename = f"operations_{date_from or 'all'}_{date_to or 'all'}.csv"
    return StreamingResponse(
        io.BytesIO(csv_bytes),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/operations", response_model=Page[OperationRead])
async def list_operations(
    type: Optional[str] = None,
    category: Optional[str] = None,
    account_id: Optional[int] = None,
    client_id: Optional[int] = None,
    product_id: Optional[int] = None,
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
    if product_id is not None:
        filters.append(Operation.product_id == product_id)
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
        await register_purchase(db, ctx.studio_id, body.client_id, body.amount)
    await db.flush()  # нужен op.id для ленты
    sign = "+" if body.type == "in" else "−"
    log_activity(
        db, ctx.studio_id, "operation",
        title=f"{sign}{body.amount:.0f} ₽ · {body.title}",
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


@router.patch("/operations/{operation_id}", response_model=OperationRead)
async def update_operation(
    operation_id: int,
    body: OperationUpdate,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    op = (await db.execute(
        select(Operation).where(Operation.id == operation_id, Operation.studio_id == ctx.studio_id)
    )).scalar_one_or_none()
    if op is None:
        raise HTTPException(status_code=404, detail="Операция не найдена")

    fields = body.model_dump(exclude_unset=True)

    new_account = None
    if "account_id" in fields and fields["account_id"] != op.account_id:
        if fields["account_id"] is not None:
            new_account = (await db.execute(
                select(Account).where(Account.id == fields["account_id"], Account.studio_id == ctx.studio_id)
            )).scalar_one_or_none()
            if new_account is None:
                raise HTTPException(status_code=404, detail="Счёт не найден")
    if "client_id" in fields and fields["client_id"] is not None:
        await _own_or_404(Client, fields["client_id"], ctx.studio_id, db, "Клиент")
    if "counterparty_id" in fields and fields["counterparty_id"] is not None:
        await _own_or_404(Counterparty, fields["counterparty_id"], ctx.studio_id, db, "Контрагент")

    # Снимаем старый вклад со старого счёта до применения новых полей.
    if op.account_id is not None:
        old_account = (await db.execute(
            select(Account).where(Account.id == op.account_id)
        )).scalar_one_or_none()
        if old_account is not None:
            old_account.balance -= _balance_delta(op.type, op.amount)

    for key, value in fields.items():
        setattr(op, key, value)

    # Добавляем новый вклад на (возможно новый) счёт по итоговым type/amount/account_id.
    if op.account_id is not None:
        if new_account is not None:
            target_account = new_account
        else:
            target_account = (await db.execute(
                select(Account).where(Account.id == op.account_id)
            )).scalar_one_or_none()
        if target_account is not None:
            target_account.balance += _balance_delta(op.type, op.amount)

    await db.commit()
    await db.refresh(op)
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
