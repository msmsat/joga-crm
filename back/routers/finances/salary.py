from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from dependencies import require_role, StudioContext
from models import Lesson, Operation, SalaryPayment, StudioMember, User
from schemas.finances.salary import SalaryPayRequest, SalaryRead, SalaryRow

router = APIRouter()

# Занятия, за которые платим: состоявшиеся, т.е. не отменённые.
_PAID_STATUSES = ("confirmed", "pending")


async def _sessions_and_hours(
    user_id: int, studio_id: int, period_start: date, period_end: date, db: AsyncSession
) -> tuple[int, float, int]:
    """(число занятий, отработанные часы, суммарная выручка занятий в копейках) за период."""
    row = (await db.execute(
        select(
            func.count(Lesson.id),
            func.coalesce(func.sum(Lesson.duration_min), 0),
            func.coalesce(func.sum(Lesson.price), 0),
        ).where(
            Lesson.studio_id == studio_id,
            Lesson.teacher_id == user_id,
            Lesson.status.in_(_PAID_STATUSES),
            func.date(Lesson.start_time) >= period_start,
            func.date(Lesson.start_time) <= period_end,
        )
    )).one()
    sessions, minutes, revenue = row
    return int(sessions), int(minutes) / 60, int(revenue)


def _compute_amount(rate: float | None, rate_type: str | None, hours: float, revenue: int) -> int:
    """Сумма к выплате в рублях (как и все суммы в операциях/счетах).
    rate у 'fixed'/'hourly' — рубли, у 'percent' — проценты от выручки занятий."""
    if rate is None:
        return 0
    if rate_type == "hourly":
        return round(rate * hours)
    if rate_type == "percent":
        return round(revenue * rate / 100)
    # fixed (и любой неизвестный тип) — оклад за период
    return round(rate)


@router.get("/salaries", response_model=list[SalaryRow])
async def list_salaries(
    period_start: date = Query(...),
    period_end: date = Query(...),
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    members = (await db.execute(
        select(User)
        .join(StudioMember, StudioMember.user_id == User.id)
        .where(StudioMember.studio_id == ctx.studio_id)
        .order_by(User.id)
    )).scalars().all()

    paid_ids = set((await db.execute(
        select(SalaryPayment.user_id).where(
            SalaryPayment.studio_id == ctx.studio_id,
            SalaryPayment.period_start == period_start,
            SalaryPayment.period_end == period_end,
            SalaryPayment.status == "paid",
        )
    )).scalars().all())

    rows: list[SalaryRow] = []
    for u in members:
        sessions, hours, revenue = await _sessions_and_hours(
            u.id, ctx.studio_id, period_start, period_end, db
        )
        rows.append(SalaryRow(
            user_id=u.id,
            name=f"{u.name} {u.last_name or ''}".strip(),
            sessions_count=sessions,
            rate=u.rate,
            rate_type=u.rate_type,
            amount=_compute_amount(u.rate, u.rate_type, hours, revenue),
            status="paid" if u.id in paid_ids else "pending",
        ))
    return rows


@router.post("/salaries/{user_id}/pay", status_code=201, response_model=SalaryRead)
async def pay_salary(
    user_id: int,
    body: SalaryPayRequest,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    user = (await db.execute(
        select(User)
        .join(StudioMember, StudioMember.user_id == User.id)
        .where(User.id == user_id, StudioMember.studio_id == ctx.studio_id)
    )).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")

    dup = (await db.execute(
        select(SalaryPayment.id).where(
            SalaryPayment.studio_id == ctx.studio_id,
            SalaryPayment.user_id == user_id,
            SalaryPayment.period_start == body.period_start,
            SalaryPayment.period_end == body.period_end,
        )
    )).scalar_one_or_none()
    if dup is not None:
        raise HTTPException(status_code=409, detail="Зарплата за этот период уже выплачена")

    sessions, hours, revenue = await _sessions_and_hours(
        user_id, ctx.studio_id, body.period_start, body.period_end, db
    )
    amount = _compute_amount(user.rate, user.rate_type, hours, revenue)
    now = datetime.utcnow()

    # Снапшот ставки: смена rate/rate_type в будущем не трогает эту выплату.
    payment = SalaryPayment(
        studio_id=ctx.studio_id,
        user_id=user_id,
        period_start=body.period_start,
        period_end=body.period_end,
        sessions_count=sessions,
        hours_worked=hours,
        rate_snapshot=user.rate or 0.0,
        rate_type_snapshot=user.rate_type or "fixed",
        amount=amount,
        status="paid",
        paid_at=now,
    )
    db.add(payment)
    # Замыкание денег: выплата — расход категории «Зарплата», в один commit с payment.
    db.add(Operation(
        studio_id=ctx.studio_id,
        trainer_id=user_id,
        type="out",
        title=f"Зарплата: {user.name} {user.last_name or ''}".strip(),
        amount=amount,
        op_date=now.date(),
        category="Зарплата",
        method="",
        status="completed",
    ))
    await db.commit()
    await db.refresh(payment)
    return payment
