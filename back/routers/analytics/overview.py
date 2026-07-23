from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import require_role, StudioContext
from models import Client, Hall, Lesson, Operation, Reservation
from schemas.analytics.reports import (
    ClientDynamics,
    Insight,
    Kpi,
    OverviewKpiSet,
    OverviewRead,
    RevenueStructureRow,
)
from ._filters import (
    ReportFilters,
    lesson_conds,
    occupied_expr,
    op_conds,
    pct,
    prev_range,
    report_filters,
)

router = APIRouter()

AT_RISK_DAYS = 21
OVERFULL_WEEKS = 3
OVERFULL_THRESHOLD_PCT = 90.0


def _needs_hall_join(f: ReportFilters) -> bool:
    return f.branch_id is not None


async def _period_kpi(f: ReportFilters, sid: int, db: AsyncSession) -> dict[str, float]:
    """revenue/profit/attendance/active_clients/fill_rate за произвольный период+фильтры."""
    rev_rows = (await db.execute(
        select(Operation.type, func.coalesce(func.sum(Operation.amount), 0))
        .where(*op_conds(f, sid))
        .group_by(Operation.type)
    )).all()
    revenue = expenses = 0
    for op_type, total in rev_rows:
        if op_type == "in":
            revenue = int(total)
        elif op_type == "out":
            expenses = int(total)

    conds = lesson_conds(f, sid)

    def _lesson_join(stmt, outer: bool):
        stmt = stmt.select_from(Lesson).join(Reservation, Reservation.lesson_id == Lesson.id, isouter=outer)
        if _needs_hall_join(f):
            stmt = stmt.join(Hall, Lesson.hall_id == Hall.id)
        return stmt.where(*conds)

    attendance = (await db.execute(
        _lesson_join(select(func.count(Reservation.id)), outer=False).where(Reservation.status == "attended")
    )).scalar_one()

    active_clients = (await db.execute(
        _lesson_join(select(func.count(func.distinct(Reservation.client_id))), outer=False)
        .where(Reservation.status == "attended")
    )).scalar_one()

    # occupied_expr()/capacity_expr() агрегируют по строкам join — при group by Lesson.id
    # это ровно "занято / вместимость" на одно занятие; суммируем такие строки снаружи,
    # иначе SUM(total_spots) задвоится на число броней (join Lesson×Reservation).
    per_lesson = (await db.execute(
        _lesson_join(select(occupied_expr(), func.max(Lesson.total_spots)), outer=True)
        .group_by(Lesson.id)
    )).all()
    occupied = sum(int(o or 0) for o, _ in per_lesson)
    capacity = sum(int(c or 0) for _, c in per_lesson)
    fill_rate = round(occupied / capacity * 100, 1) if capacity else 0.0

    return {
        "revenue": float(revenue),
        "profit": float(revenue - expenses),
        "attendance": float(int(attendance)),
        "active_clients": float(int(active_clients)),
        "fill_rate": fill_rate,
    }


async def _attended_client_ids(f: ReportFilters, sid: int, d_from: date, d_to: date, db: AsyncSession) -> set[int]:
    shifted = ReportFilters(
        date_from=d_from, date_to=d_to,
        branch_id=f.branch_id, hall_id=f.hall_id, trainer_id=f.trainer_id, service_id=f.service_id,
    )
    conds = lesson_conds(shifted, sid)
    stmt = select(func.distinct(Reservation.client_id)).select_from(Lesson).join(
        Reservation, Reservation.lesson_id == Lesson.id
    )
    if _needs_hall_join(shifted):
        stmt = stmt.join(Hall, Lesson.hall_id == Hall.id)
    ids = (await db.execute(stmt.where(*conds, Reservation.status == "attended"))).scalars().all()
    return set(ids)


async def _revenue_structure(f: ReportFilters, sid: int, db: AsyncSession) -> list[RevenueStructureRow]:
    rows = (await db.execute(
        select(Operation.category, func.coalesce(func.sum(Operation.amount), 0))
        .where(*op_conds(f, sid), Operation.type == "in")
        .group_by(Operation.category)
        .order_by(func.sum(Operation.amount).desc())
    )).all()
    total = sum(int(amount) for _, amount in rows)
    return [
        RevenueStructureRow(
            category=category,
            amount=int(amount),
            share_pct=round(int(amount) / total * 100, 1) if total else 0.0,
        )
        for category, amount in rows
    ]


async def _client_dynamics(f: ReportFilters, sid: int, prev_from: date, prev_to: date, db: AsyncSession) -> ClientDynamics:
    start_dt = datetime.combine(f.date_from, time.min)
    end_dt = datetime.combine(f.date_to, time.max)

    new_count = (await db.execute(
        select(func.count(Client.id)).where(
            Client.studio_id == sid,
            Client.registration_date >= start_dt,
            Client.registration_date <= end_dt,
        )
    )).scalar_one()
    prev_new_count = (await db.execute(
        select(func.count(Client.id)).where(
            Client.studio_id == sid,
            Client.registration_date >= datetime.combine(prev_from, time.min),
            Client.registration_date <= datetime.combine(prev_to, time.max),
        )
    )).scalar_one()

    curr_ids = await _attended_client_ids(f, sid, f.date_from, f.date_to, db)
    prev_ids = await _attended_client_ids(f, sid, prev_from, prev_to, db)
    length = (f.date_to - f.date_from).days
    prev2_from = prev_from - timedelta(days=length + 1)
    prev2_to = prev_from - timedelta(days=1)
    prev2_ids = await _attended_client_ids(f, sid, prev2_from, prev2_to, db)

    returned = len(curr_ids & prev_ids)
    prev_returned = len(prev_ids & prev2_ids)
    lost = len(prev_ids - curr_ids)
    prev_lost = len(prev2_ids - prev_ids)

    return ClientDynamics(
        new=Kpi(value=int(new_count), prev_pct=pct(int(new_count), int(prev_new_count))),
        returned=Kpi(value=returned, prev_pct=pct(returned, prev_returned)),
        lost=Kpi(value=lost, prev_pct=pct(lost, prev_lost)),
    )


async def _insight_revenue_up_clients_down(kpi: OverviewKpiSet) -> Insight | None:
    if (
        kpi.revenue.prev_pct is not None and kpi.revenue.prev_pct > 0
        and kpi.active_clients.prev_pct is not None and kpi.active_clients.prev_pct < 0
    ):
        return Insight(
            key="revenue_up_clients_down",
            severity="warning",
            params={},
            action="open_clients",
            action_params={"filter": "at_risk"},
        )
    return None


async def _insight_clients_at_risk(sid: int, db: AsyncSession) -> Insight | None:
    """Порог — от реальной сегодняшней даты, а не от date_to фильтра: сигнал про
    клиентов, которых пора удержать сейчас, а не срез на конец просматриваемого периода."""
    threshold = date.today() - timedelta(days=AT_RISK_DAYS)
    count = (await db.execute(
        select(func.count(Client.id)).where(
            Client.studio_id == sid,
            Client.is_active.is_(True),
            Client.last_visit_date.isnot(None),
            Client.last_visit_date < threshold,
        )
    )).scalar_one()
    if count > 0:
        return Insight(
            key="clients_at_risk",
            severity="warning",
            params={"count": int(count)},
            action="open_campaign",
            action_params={"segment": "at_risk"},
        )
    return None


async def _insight_lesson_overfull(f: ReportFilters, sid: int, db: AsyncSession) -> Insight | None:
    """Занятие (по имени+дню недели+часу) заполнено ≥90% в каждую из 3 последних
    ПОЛНЫХ недель (до конца прошлой недели, чтобы не учитывать текущую неполную)."""
    week_end = f.date_to - timedelta(days=f.date_to.weekday() + 1)  # последнее воскресенье до date_to
    week_start = week_end - timedelta(days=7 * OVERFULL_WEEKS - 1)
    if week_start > week_end:
        return None
    start_dt = datetime.combine(week_start, time.min)
    end_dt = datetime.combine(week_end, time.max)

    conds = [
        Lesson.studio_id == sid,
        Lesson.start_time >= start_dt,
        Lesson.start_time <= end_dt,
    ]
    if f.hall_id is not None:
        conds.append(Lesson.hall_id == f.hall_id)
    if f.trainer_id is not None:
        conds.append(Lesson.teacher_id == f.trainer_id)
    if f.service_id is not None:
        conds.append(Lesson.service_id == f.service_id)

    week_bucket = func.date_trunc("week", Lesson.start_time).label("week")
    dow = func.extract("dow", Lesson.start_time).label("dow")
    hour = func.extract("hour", Lesson.start_time).label("hour")
    rows = (await db.execute(
        select(
            Lesson.name,
            dow,
            hour,
            week_bucket,
            Lesson.hall_id,
            Lesson.teacher_id,
            occupied_expr(),
            func.max(Lesson.total_spots),
        )
        .select_from(Lesson)
        .join(Reservation, Reservation.lesson_id == Lesson.id, isouter=True)
        .where(*conds)
        .group_by(Lesson.name, dow, hour, week_bucket, Lesson.hall_id, Lesson.teacher_id)
    )).all()

    groups: dict[tuple, dict] = {}
    for name, dow, hour, week, hall_id, teacher_id, occupied, capacity in rows:
        key = (name, int(dow), int(hour))
        g = groups.setdefault(key, {"weeks": set(), "fills": [], "hall_id": hall_id, "teacher_id": teacher_id})
        fill = round(int(occupied or 0) / int(capacity) * 100, 1) if capacity else 0.0
        g["weeks"].add(week)
        g["fills"].append(fill)

    for (name, dow, hour), g in groups.items():
        if len(g["weeks"]) >= OVERFULL_WEEKS and all(fp >= OVERFULL_THRESHOLD_PCT for fp in g["fills"]):
            return Insight(
                key="lesson_overfull",
                severity="info",
                params={
                    "name": name,
                    "weekday": dow,
                    "hour": hour,
                    "pct": min(g["fills"]),
                },
                action="add_lesson",
                action_params={
                    "name": name,
                    "hall_id": g["hall_id"],
                    "teacher_id": g["teacher_id"],
                    "weekday": dow,
                    "hour": hour,
                },
            )
    return None


@router.get("/overview", response_model=OverviewRead)
async def analytics_overview(
    f: ReportFilters = Depends(report_filters),
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    sid = ctx.studio_id
    prev_from, prev_to = prev_range(f)
    prev_f = ReportFilters(
        date_from=prev_from, date_to=prev_to,
        branch_id=f.branch_id, hall_id=f.hall_id, trainer_id=f.trainer_id, service_id=f.service_id,
    )

    curr = await _period_kpi(f, sid, db)
    prev = await _period_kpi(prev_f, sid, db)

    kpi = OverviewKpiSet(
        revenue=Kpi(value=curr["revenue"], prev_pct=pct(curr["revenue"], prev["revenue"])),
        profit=Kpi(value=curr["profit"], prev_pct=pct(curr["profit"], prev["profit"])),
        attendance=Kpi(value=curr["attendance"], prev_pct=pct(curr["attendance"], prev["attendance"])),
        active_clients=Kpi(value=curr["active_clients"], prev_pct=pct(curr["active_clients"], prev["active_clients"])),
        fill_rate=Kpi(value=curr["fill_rate"], prev_pct=pct(curr["fill_rate"], prev["fill_rate"])),
    )

    revenue_structure = await _revenue_structure(f, sid, db)
    client_dynamics = await _client_dynamics(f, sid, prev_from, prev_to, db)

    insights: list[Insight] = []
    for insight in (
        await _insight_revenue_up_clients_down(kpi),
        await _insight_clients_at_risk(sid, db),
        await _insight_lesson_overfull(f, sid, db),
    ):
        if insight is not None:
            insights.append(insight)

    return OverviewRead(
        kpi=kpi,
        revenue_structure=revenue_structure,
        client_dynamics=client_dynamics,
        insights=insights[:3],
    )
