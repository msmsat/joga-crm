from datetime import date, datetime, time, timedelta
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import require_role, StudioContext
from models import ActivityLog, Client, Lesson, Operation, Product, Reservation, User
from schemas.analytics.reports import (
    ActivityLogRead,
    PeriodSummaryRead,
    SeriesPoint,
    ServiceReportRow,
    SummaryTrends,
    TrainerReportRow,
)

router = APIRouter()


def _pct(current: float, previous: float) -> Optional[float]:
    """% изменения к прошлому периоду. Прошлый период пустой → null, не 500."""
    if previous == 0:
        return None
    return round((current - previous) / previous * 100, 1)


async def _revenue_expenses(studio_id: int, d_from: date, d_to: date, db: AsyncSession) -> tuple[int, int, int]:
    """(revenue, expenses, revenue_op_count) по операциям за период."""
    rows = (await db.execute(
        select(
            Operation.type,
            func.coalesce(func.sum(Operation.amount), 0),
            func.count(Operation.id),
        )
        .where(
            Operation.studio_id == studio_id,
            Operation.op_date >= d_from,
            Operation.op_date <= d_to,
        )
        .group_by(Operation.type)
    )).all()
    revenue = expenses = revenue_ops = 0
    for op_type, total, cnt in rows:
        if op_type == "in":
            revenue, revenue_ops = int(total), int(cnt)
        elif op_type == "out":
            expenses = int(total)
    return revenue, expenses, revenue_ops


async def _period_metrics(studio_id: int, d_from: date, d_to: date, db: AsyncSession) -> dict:
    """Все метрики за один период. Reservation не имеет studio_id/даты —
    скоуп и период берём через join на Lesson (start_time)."""
    start_dt = datetime.combine(d_from, time.min)
    end_dt = datetime.combine(d_to, time.max)

    revenue, expenses, revenue_ops = await _revenue_expenses(studio_id, d_from, d_to, db)

    lesson_in_period = and_(
        Lesson.studio_id == studio_id,
        Lesson.start_time >= start_dt,
        Lesson.start_time <= end_dt,
    )

    bookings = (await db.execute(
        select(func.count(Reservation.id))
        .join(Lesson, Reservation.lesson_id == Lesson.id)
        .where(lesson_in_period, Reservation.status != "cancelled")
    )).scalar_one()

    attendance = (await db.execute(
        select(func.count(Reservation.id))
        .join(Lesson, Reservation.lesson_id == Lesson.id)
        .where(lesson_in_period, Reservation.status == "attended")
    )).scalar_one()

    active_clients = (await db.execute(
        select(func.count(func.distinct(Reservation.client_id)))
        .join(Lesson, Reservation.lesson_id == Lesson.id)
        .where(lesson_in_period, Reservation.status == "attended")
    )).scalar_one()

    return {
        "revenue": revenue,
        "expenses": expenses,
        "profit": revenue - expenses,
        "avg_check": revenue // revenue_ops if revenue_ops else 0,
        "bookings": int(bookings),
        "attendance": int(attendance),
        "active_clients": int(active_clients),
    }


async def _attended_client_ids(studio_id: int, d_from: date, d_to: date, db: AsyncSession) -> set[int]:
    ids = (await db.execute(
        select(func.distinct(Reservation.client_id))
        .join(Lesson, Reservation.lesson_id == Lesson.id)
        .where(
            Lesson.studio_id == studio_id,
            Lesson.start_time >= datetime.combine(d_from, time.min),
            Lesson.start_time <= datetime.combine(d_to, time.max),
            Reservation.status == "attended",
        )
    )).scalars().all()
    return set(ids)


def _retention(prev_ids: set[int], curr_ids: set[int]) -> float:
    """Доля клиентов прошлого периода, вернувшихся в текущем."""
    if not prev_ids:
        return 0.0
    returned = len(prev_ids & curr_ids)
    return round(returned / len(prev_ids) * 100, 1)


@router.get("/summary", response_model=PeriodSummaryRead)
async def period_summary(
    date_from: date = Query(...),
    date_to: date = Query(...),
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    sid = ctx.studio_id
    length = (date_to - date_from).days
    prev_to = date_from - timedelta(days=1)
    prev_from = prev_to - timedelta(days=length)

    curr = await _period_metrics(sid, date_from, date_to, db)
    prev = await _period_metrics(sid, prev_from, prev_to, db)

    # retention: клиенты периода до текущего, вернувшиеся в текущем
    curr_ids = await _attended_client_ids(sid, date_from, date_to, db)
    prev_ids = await _attended_client_ids(sid, prev_from, prev_to, db)
    prev2_ids = await _attended_client_ids(
        sid, prev_from - timedelta(days=length + 1), prev_from - timedelta(days=1), db
    )
    curr_retention = _retention(prev_ids, curr_ids)
    prev_retention = _retention(prev2_ids, prev_ids)

    return PeriodSummaryRead(
        revenue=curr["revenue"],
        expenses=curr["expenses"],
        profit=curr["profit"],
        avg_check=curr["avg_check"],
        active_clients=curr["active_clients"],
        bookings=curr["bookings"],
        retention=curr_retention,
        attendance=curr["attendance"],
        trends=SummaryTrends(
            revenue_pct=_pct(curr["revenue"], prev["revenue"]),
            expenses_pct=_pct(curr["expenses"], prev["expenses"]),
            active_clients_pct=_pct(curr["active_clients"], prev["active_clients"]),
            bookings_pct=_pct(curr["bookings"], prev["bookings"]),
            retention_pct=_pct(curr_retention, prev_retention),
        ),
    )


@router.get("/series", response_model=list[SeriesPoint])
async def metric_series(
    metric: Literal["revenue", "expenses", "bookings", "new_clients"] = Query(...),
    group: Literal["day", "week", "month"] = Query("day"),
    date_from: date = Query(...),
    date_to: date = Query(...),
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    sid = ctx.studio_id
    start_dt = datetime.combine(date_from, time.min)
    end_dt = datetime.combine(date_to, time.max)

    # metric → (value-выражение, столбец-дата, WHERE). Один SELECT: date_trunc + GROUP BY.
    if metric in ("revenue", "expenses"):
        op_type = "in" if metric == "revenue" else "out"
        bucket = func.date_trunc(group, Operation.op_date)
        stmt = (
            select(bucket.label("period"), func.coalesce(func.sum(Operation.amount), 0))
            .where(
                Operation.studio_id == sid,
                Operation.type == op_type,
                Operation.op_date >= date_from,
                Operation.op_date <= date_to,
            )
        )
    elif metric == "bookings":
        bucket = func.date_trunc(group, Lesson.start_time)
        stmt = (
            select(bucket.label("period"), func.count(Reservation.id))
            .join(Lesson, Reservation.lesson_id == Lesson.id)
            .where(
                Lesson.studio_id == sid,
                Lesson.start_time >= start_dt,
                Lesson.start_time <= end_dt,
                Reservation.status != "cancelled",
            )
        )
    else:  # new_clients
        bucket = func.date_trunc(group, Client.registration_date)
        stmt = (
            select(bucket.label("period"), func.count(Client.id))
            .where(
                Client.studio_id == sid,
                Client.registration_date >= start_dt,
                Client.registration_date <= end_dt,
            )
        )

    rows = (await db.execute(stmt.group_by("period").order_by("period"))).all()
    return [
        SeriesPoint(period=period.date().isoformat(), value=int(value or 0))
        for period, value in rows
    ]


@router.get("/trainers", response_model=list[TrainerReportRow])
async def trainers_report(
    date_from: date = Query(...),
    date_to: date = Query(...),
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Выручка (доходные операции по trainer_id) + число занятий (Lesson по teacher_id)
    за период. Выручка без trainer_id в срез не попадает — сумма ≤ /summary."""
    sid = ctx.studio_id
    start_dt = datetime.combine(date_from, time.min)
    end_dt = datetime.combine(date_to, time.max)

    rev_rows = (await db.execute(
        select(
            Operation.trainer_id,
            User.name,
            User.last_name,
            func.coalesce(func.sum(Operation.amount), 0),
        )
        .join(User, Operation.trainer_id == User.id)
        .where(
            Operation.studio_id == sid,
            Operation.type == "in",
            Operation.trainer_id.isnot(None),
            Operation.op_date >= date_from,
            Operation.op_date <= date_to,
        )
        .group_by(Operation.trainer_id, User.name, User.last_name)
    )).all()

    lesson_rows = (await db.execute(
        select(Lesson.teacher_id, func.count(Lesson.id))
        .where(
            Lesson.studio_id == sid,
            Lesson.teacher_id.isnot(None),
            Lesson.start_time >= start_dt,
            Lesson.start_time <= end_dt,
        )
        .group_by(Lesson.teacher_id)
    )).all()
    lessons_by_trainer = {tid: int(cnt) for tid, cnt in lesson_rows}

    rows: dict[int, dict] = {}
    for tid, name, last_name, revenue in rev_rows:
        rows[tid] = {
            "name": " ".join(filter(None, [name, last_name])),
            "revenue": int(revenue),
            "lessons_count": lessons_by_trainer.pop(tid, 0),
        }
    # тренеры с занятиями, но без выручки за период
    for tid, cnt in lessons_by_trainer.items():
        name_row = (await db.execute(
            select(User.name, User.last_name).where(User.id == tid)
        )).first()
        display = " ".join(filter(None, name_row)) if name_row else str(tid)
        rows[tid] = {"name": display, "revenue": 0, "lessons_count": cnt}

    return [
        TrainerReportRow(trainer_id=tid, name=r["name"], lessons_count=r["lessons_count"], revenue=r["revenue"])
        for tid, r in sorted(rows.items(), key=lambda kv: kv[1]["revenue"], reverse=True)
    ]


@router.get("/services", response_model=list[ServiceReportRow])
async def services_report(
    date_from: date = Query(...),
    date_to: date = Query(...),
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Выручка по продуктам (доходные операции по product_id) и доля от суммы среза."""
    sid = ctx.studio_id
    rows = (await db.execute(
        select(Product.name, func.coalesce(func.sum(Operation.amount), 0))
        .join(Product, Operation.product_id == Product.id)
        .where(
            Operation.studio_id == sid,
            Operation.type == "in",
            Operation.product_id.isnot(None),
            Operation.op_date >= date_from,
            Operation.op_date <= date_to,
        )
        .group_by(Product.name)
        .order_by(func.sum(Operation.amount).desc())
    )).all()

    total = sum(int(rev) for _, rev in rows)
    return [
        ServiceReportRow(
            service=name,
            revenue=int(rev),
            share_pct=round(int(rev) / total * 100, 1) if total else 0.0,
        )
        for name, rev in rows
    ]


@router.get("/activity", response_model=list[ActivityLogRead])
async def activity_feed(
    limit: int = Query(20, ge=1, le=100),
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    logs = (await db.execute(
        select(ActivityLog)
        .where(ActivityLog.studio_id == ctx.studio_id)
        .order_by(ActivityLog.created_at.desc())
        .limit(limit)
    )).scalars().all()
    return logs
