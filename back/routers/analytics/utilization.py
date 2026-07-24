"""EPIC R5 задача 1-2: GET /analytics/utilization, GET /analytics/utilization/slot
— сводка и drilldown вкладки «Расписание» (использование времени и залов).

Выручка занятия — attended × price (прямая связь операция→занятие в БД
отсутствует, это приближение — формула фиксируется в InfoHint
formulas.lesson_revenue на фронте).
"""
from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import require_role, StudioContext
from models import Hall, Lesson, Reservation
from schemas.analytics.reports import (
    ChronicLowRow,
    HallUtilRow,
    HeatmapCell,
    Insight,
    Kpi,
    LessonSliceRow,
    SlotLessonRow,
    UtilizationKpi,
    UtilizationRead,
)
from ._filters import ReportFilters, lesson_conds, noshow_cond, occupied_expr, pct, prev_range, report_filters

router = APIRouter()

CHRONIC_LOW_WEEKS = 4
CHRONIC_LOW_THRESHOLD_PCT = 30.0
OVERFULL_WEEKS = 3
OVERFULL_THRESHOLD_PCT = 90.0
EVENING_START_HOUR = 17
EVENING_END_HOUR = 21
HALL_IDLE_THRESHOLD_PCT = 30.0
TOP_SLICE_LIMIT = 5
MAX_INSIGHTS_PER_RULE = 2


def _needs_hall_join(f: ReportFilters) -> bool:
    return f.branch_id is not None


async def _kpi(f: ReportFilters, sid: int, db: AsyncSession) -> UtilizationKpi:
    prev_from, prev_to = prev_range(f)
    prev_f = ReportFilters(
        date_from=prev_from, date_to=prev_to,
        branch_id=f.branch_id, hall_id=f.hall_id, trainer_id=f.trainer_id, service_id=f.service_id,
    )

    async def _fill_and_free(filt: ReportFilters) -> tuple[float, int]:
        conds = lesson_conds(filt, sid)
        stmt = select(occupied_expr(), func.max(Lesson.total_spots)).select_from(Lesson).join(
            Reservation, Reservation.lesson_id == Lesson.id, isouter=True
        )
        if _needs_hall_join(filt):
            stmt = stmt.join(Hall, Lesson.hall_id == Hall.id)
        rows = (await db.execute(stmt.where(*conds).group_by(Lesson.id))).all()
        occupied = sum(int(o or 0) for o, _ in rows)
        capacity = sum(int(c or 0) for _, c in rows)
        free = capacity - occupied
        fill_pct = round(occupied / capacity * 100, 1) if capacity else 0.0
        return fill_pct, free

    fill_pct, free_spots = await _fill_and_free(f)
    prev_fill_pct, prev_free_spots = await _fill_and_free(prev_f)

    async def _cancels(filt: ReportFilters) -> int:
        conds = lesson_conds(filt, sid)
        stmt = select(func.count(Lesson.id)).where(*conds, Lesson.status == "cancelled")
        if _needs_hall_join(filt):
            stmt = stmt.select_from(Lesson).join(Hall, Lesson.hall_id == Hall.id)
        return int((await db.execute(stmt)).scalar_one())

    cancels = await _cancels(f)
    prev_cancels = await _cancels(prev_f)

    async def _noshows(filt: ReportFilters) -> int:
        conds = lesson_conds(filt, sid)
        stmt = select(func.count(Reservation.id)).select_from(Lesson).join(
            Reservation, Reservation.lesson_id == Lesson.id
        )
        if _needs_hall_join(filt):
            stmt = stmt.join(Hall, Lesson.hall_id == Hall.id)
        return int((await db.execute(stmt.where(*conds, noshow_cond()))).scalar_one())

    noshows = await _noshows(f)
    prev_noshows = await _noshows(prev_f)

    async def _lost_revenue(filt: ReportFilters) -> int:
        """Упущенная выручка по ПРОШЕДШИМ неотменённым занятиям периода: свободные места × цена."""
        conds = lesson_conds(filt, sid)
        stmt = select(occupied_expr(), func.max(Lesson.total_spots), func.max(Lesson.price)).select_from(Lesson).join(
            Reservation, Reservation.lesson_id == Lesson.id, isouter=True
        )
        if _needs_hall_join(filt):
            stmt = stmt.join(Hall, Lesson.hall_id == Hall.id)
        rows = (await db.execute(
            stmt.where(*conds, Lesson.status != "cancelled", Lesson.start_time < func.now())
            .group_by(Lesson.id)
        )).all()
        return sum(max(int(cap or 0) - int(occ or 0), 0) * int(price or 0) for occ, cap, price in rows)

    lost_revenue = await _lost_revenue(f)
    prev_lost_revenue = await _lost_revenue(prev_f)

    return UtilizationKpi(
        avg_fill_pct=Kpi(value=fill_pct, prev_pct=pct(fill_pct, prev_fill_pct)),
        free_spots=Kpi(value=free_spots, prev_pct=pct(free_spots, prev_free_spots)),
        cancels=Kpi(value=cancels, prev_pct=pct(cancels, prev_cancels)),
        noshows=Kpi(value=noshows, prev_pct=pct(noshows, prev_noshows)),
        lost_revenue=Kpi(value=lost_revenue, prev_pct=pct(lost_revenue, prev_lost_revenue)),
    )


async def _heatmap_rows(f: ReportFilters, sid: int, db: AsyncSession) -> list:
    """(weekday[isodow 1-7], hour, occupied, capacity, lesson_id, attended) сырые строки,
    сгруппированные на стороне Python — нужны и для heatmap, и для top-срезов, и для chronic_low."""
    conds = lesson_conds(f, sid)
    weekday = func.extract("isodow", Lesson.start_time).label("weekday")
    hour = func.extract("hour", Lesson.start_time).label("hour")
    stmt = (
        select(
            weekday, hour, Lesson.id, Lesson.name, Lesson.hall_id, Lesson.price,
            func.count(Reservation.id).filter(Reservation.status.in_(("active", "attended"))),
            func.count(Reservation.id).filter(Reservation.status == "attended"),
            func.max(Lesson.total_spots),
        )
        .select_from(Lesson)
        .join(Reservation, Reservation.lesson_id == Lesson.id, isouter=True)
    )
    if _needs_hall_join(f):
        stmt = stmt.join(Hall, Lesson.hall_id == Hall.id)
    stmt = stmt.where(*conds, Lesson.status != "cancelled").group_by(
        weekday, hour, Lesson.id, Lesson.name, Lesson.hall_id, Lesson.price
    )
    return (await db.execute(stmt)).all()


def _heatmap(rows: list) -> list[HeatmapCell]:
    by_slot: dict[tuple[int, int], dict] = {}
    for wd, hour, _lid, _name, _hall_id, _price, occ, att, cap in rows:
        entry = by_slot.setdefault((int(wd), int(hour)), {"occ": 0, "cap": 0, "lessons": 0, "att": 0})
        entry["occ"] += int(occ or 0)
        entry["cap"] += int(cap or 0)
        entry["att"] += int(att or 0)
        entry["lessons"] += 1
    return [
        HeatmapCell(
            weekday=wd, hour=hour,
            fill_pct=round(e["occ"] / e["cap"] * 100, 1) if e["cap"] else 0.0,
            lessons=e["lessons"], attendance=e["att"],
        )
        for (wd, hour), e in sorted(by_slot.items())
    ]


def _top_slices(rows: list) -> tuple[list[LessonSliceRow], list[LessonSliceRow]]:
    by_name: dict[str, dict] = {}
    for _wd, _hour, _lid, name, _hall_id, price, occ, att, cap in rows:
        entry = by_name.setdefault(name, {"occ": 0, "cap": 0, "held": 0, "revenue": 0})
        entry["occ"] += int(occ or 0)
        entry["cap"] += int(cap or 0)
        entry["held"] += 1
        entry["revenue"] += int(att or 0) * int(price or 0)

    slices = [
        LessonSliceRow(
            name=name, revenue=e["revenue"], held=e["held"],
            fill_pct=round(e["occ"] / e["cap"] * 100, 1) if e["cap"] else 0.0,
        )
        for name, e in by_name.items()
    ]
    top_profitable = sorted(slices, key=lambda r: r.revenue, reverse=True)[:TOP_SLICE_LIMIT]
    top_filled = sorted(slices, key=lambda r: r.fill_pct, reverse=True)[:TOP_SLICE_LIMIT]
    return top_profitable, top_filled


async def _chronic_low(f: ReportFilters, sid: int, db: AsyncSession) -> list[ChronicLowRow]:
    """Группа name+weekday+hour: fill < 30% в КАЖДУЮ из 4 последних полных недель (до конца
    прошлой недели — не учитываем текущую неполную)."""
    week_end = date.today() - timedelta(days=date.today().weekday() + 1)
    week_start = week_end - timedelta(days=7 * CHRONIC_LOW_WEEKS - 1)
    start_dt = datetime.combine(week_start, time.min)
    end_dt = datetime.combine(week_end, time.max)

    conds = [Lesson.studio_id == sid, Lesson.start_time >= start_dt, Lesson.start_time <= end_dt,
             Lesson.status != "cancelled"]
    if f.hall_id is not None:
        conds.append(Lesson.hall_id == f.hall_id)
    if f.trainer_id is not None:
        conds.append(Lesson.teacher_id == f.trainer_id)
    if f.service_id is not None:
        conds.append(Lesson.service_id == f.service_id)

    week_bucket = func.date_trunc("week", Lesson.start_time).label("week")
    weekday = func.extract("isodow", Lesson.start_time).label("weekday")
    hour = func.extract("hour", Lesson.start_time).label("hour")
    stmt = (
        select(Lesson.name, weekday, hour, week_bucket, Lesson.id, occupied_expr(), func.max(Lesson.total_spots))
        .select_from(Lesson)
        .join(Reservation, Reservation.lesson_id == Lesson.id, isouter=True)
    )
    if _needs_hall_join(f):
        stmt = stmt.join(Hall, Lesson.hall_id == Hall.id)
    rows = (await db.execute(
        stmt.where(*conds).group_by(Lesson.name, weekday, hour, week_bucket, Lesson.id)
    )).all()

    by_slot: dict[tuple[str, int, int], dict[str, list]] = {}
    for name, wd, hour_v, week, lid, occ, cap in rows:
        key = (name, int(wd), int(hour_v))
        entry = by_slot.setdefault(key, {})
        week_entry = entry.setdefault(week, {"occ": 0, "cap": 0, "lesson_ids": []})
        week_entry["occ"] += int(occ or 0)
        week_entry["cap"] += int(cap or 0)
        week_entry["lesson_ids"].append(lid)

    result: list[ChronicLowRow] = []
    for (name, wd, hour_v), by_week in by_slot.items():
        if len(by_week) < CHRONIC_LOW_WEEKS:
            continue
        week_fills = []
        all_lesson_ids: list[int] = []
        low_in_all = True
        for week_entry in by_week.values():
            fill = week_entry["occ"] / week_entry["cap"] * 100 if week_entry["cap"] else 0.0
            week_fills.append(fill)
            all_lesson_ids.extend(week_entry["lesson_ids"])
            if fill >= CHRONIC_LOW_THRESHOLD_PCT:
                low_in_all = False
        if not low_in_all:
            continue
        result.append(ChronicLowRow(
            name=name, weekday=wd, hour=hour_v,
            fill_pct=round(sum(week_fills) / len(week_fills), 1),
            weeks=len(by_week), lesson_ids=sorted(all_lesson_ids),
        ))
    result.sort(key=lambda r: r.fill_pct)
    return result


async def _halls(f: ReportFilters, sid: int, db: AsyncSession) -> list[HallUtilRow]:
    conds = lesson_conds(f, sid)
    stmt = (
        select(Lesson.hall_id, Lesson.start_time, Lesson.id, occupied_expr(), func.max(Lesson.total_spots))
        .select_from(Lesson)
        .join(Reservation, Reservation.lesson_id == Lesson.id, isouter=True)
    )
    if _needs_hall_join(f):
        stmt = stmt.join(Hall, Lesson.hall_id == Hall.id)
    rows = (await db.execute(
        stmt.where(*conds, Lesson.status != "cancelled", Lesson.hall_id.isnot(None))
        .group_by(Lesson.hall_id, Lesson.start_time, Lesson.id)
    )).all()

    by_hall: dict[int, dict] = {}
    for hall_id, start_time, _lid, occ, cap in rows:
        entry = by_hall.setdefault(hall_id, {"occ": 0, "cap": 0, "evening_hours": set(), "all_hours": set()})
        entry["occ"] += int(occ or 0)
        entry["cap"] += int(cap or 0)
        slot = (start_time.date(), start_time.hour)
        entry["all_hours"].add(slot)
        if EVENING_START_HOUR <= start_time.hour < EVENING_END_HOUR:
            entry["evening_hours"].add(slot)

    if not by_hall:
        return []
    hall_ids = list(by_hall)
    names = dict((await db.execute(
        select(Hall.id, Hall.name).where(Hall.id.in_(hall_ids), Hall.studio_id == sid)
    )).all())

    days = (f.date_to - f.date_from).days + 1
    evening_capacity_slots = days * (EVENING_END_HOUR - EVENING_START_HOUR)

    result: list[HallUtilRow] = []
    for hall_id, e in by_hall.items():
        if hall_id not in names:
            continue
        fill_pct = round(e["occ"] / e["cap"] * 100, 1) if e["cap"] else 0.0
        busy_evening_slots = len(e["evening_hours"])
        idle_pct = (
            round((evening_capacity_slots - busy_evening_slots) / evening_capacity_slots * 100, 1)
            if evening_capacity_slots else 0.0
        )
        result.append(HallUtilRow(hall_id=hall_id, name=names[hall_id], fill_pct=fill_pct, evening_idle_pct=idle_pct))
    result.sort(key=lambda r: r.fill_pct)
    return result


async def _insights(
    f: ReportFilters, sid: int, chronic_low: list[ChronicLowRow], halls: list[HallUtilRow], db: AsyncSession,
) -> list[Insight]:
    insights: list[Insight] = []

    if chronic_low:
        top = chronic_low[0]
        lesson_id = top.lesson_ids[-1] if top.lesson_ids else None
        insights.append(Insight(
            key="slot_chronic_low",
            severity="warning",
            params={"name": top.name, "weekday": top.weekday, "hour": top.hour, "pct": top.fill_pct, "weeks": top.weeks},
            action="open_journal",
            action_params={"lesson_id": lesson_id},
        ))

    for h in halls:
        if h.evening_idle_pct > HALL_IDLE_THRESHOLD_PCT:
            insights.append(Insight(
                key="hall_idle_evenings",
                severity="info",
                params={"name": h.name, "pct": h.evening_idle_pct},
                action="open_journal",
                action_params={"hall_id": h.hall_id, "evening": True},
            ))
        if len(insights) >= 1 + MAX_INSIGHTS_PER_RULE:
            break

    week_end = f.date_to - timedelta(days=f.date_to.weekday() + 1)
    week_start = week_end - timedelta(days=7 * OVERFULL_WEEKS - 1)
    if week_start <= week_end:
        start_dt = datetime.combine(week_start, time.min)
        end_dt = datetime.combine(week_end, time.max)
        conds = [Lesson.studio_id == sid, Lesson.start_time >= start_dt, Lesson.start_time <= end_dt,
                 Lesson.status != "cancelled"]
        if f.hall_id is not None:
            conds.append(Lesson.hall_id == f.hall_id)
        if f.trainer_id is not None:
            conds.append(Lesson.teacher_id == f.trainer_id)
        if f.service_id is not None:
            conds.append(Lesson.service_id == f.service_id)
        week_bucket = func.date_trunc("week", Lesson.start_time).label("week")
        weekday = func.extract("isodow", Lesson.start_time).label("weekday")
        hour = func.extract("hour", Lesson.start_time).label("hour")
        stmt = (
            select(weekday, hour, week_bucket, occupied_expr(), func.max(Lesson.total_spots))
            .select_from(Lesson)
            .join(Reservation, Reservation.lesson_id == Lesson.id, isouter=True)
        )
        if _needs_hall_join(f):
            stmt = stmt.join(Hall, Lesson.hall_id == Hall.id)
        rows = (await db.execute(
            stmt.where(*conds).group_by(weekday, hour, week_bucket, Lesson.id)
        )).all()

        by_slot: dict[tuple[int, int], dict] = {}
        for wd, hour_v, week, occ, cap in rows:
            entry = by_slot.setdefault((int(wd), int(hour_v)), {})
            week_entry = entry.setdefault(week, {"occ": 0, "cap": 0})
            week_entry["occ"] += int(occ or 0)
            week_entry["cap"] += int(cap or 0)

        overfull: list[tuple[int, int, float]] = []
        for (wd, hour_v), by_week in by_slot.items():
            if len(by_week) < OVERFULL_WEEKS:
                continue
            fills = [
                (we["occ"] / we["cap"] * 100 if we["cap"] else 0.0) for we in by_week.values()
            ]
            if all(fp >= OVERFULL_THRESHOLD_PCT for fp in fills):
                overfull.append((wd, hour_v, round(sum(fills) / len(fills), 1)))
        overfull.sort(key=lambda t: t[2], reverse=True)
        for wd, hour_v, avg_fill in overfull[:MAX_INSIGHTS_PER_RULE]:
            insights.append(Insight(
                key="slot_overfull",
                severity="info",
                params={"weekday": wd, "hour": hour_v, "pct": avg_fill},
                action="add_lesson",
                action_params={"weekday": wd, "hour": hour_v},
            ))

    return insights[:4]


@router.get("/utilization", response_model=UtilizationRead)
async def analytics_utilization(
    f: ReportFilters = Depends(report_filters),
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    sid = ctx.studio_id
    kpi = await _kpi(f, sid, db)
    rows = await _heatmap_rows(f, sid, db)
    heatmap = _heatmap(rows)
    top_profitable, top_filled = _top_slices(rows)
    chronic_low = await _chronic_low(f, sid, db)
    halls = await _halls(f, sid, db)
    insights = await _insights(f, sid, chronic_low, halls, db)

    return UtilizationRead(
        kpi=kpi, heatmap=heatmap, top_profitable=top_profitable, top_filled=top_filled,
        chronic_low=chronic_low, halls=halls, insights=insights,
    )


@router.get("/utilization/slot", response_model=list[SlotLessonRow])
async def analytics_utilization_slot(
    weekday: int = Query(..., ge=1, le=7),
    hour: int = Query(..., ge=0, le=23),
    f: ReportFilters = Depends(report_filters),
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    sid = ctx.studio_id
    conds = lesson_conds(f, sid)
    weekday_expr = func.extract("isodow", Lesson.start_time)
    hour_expr = func.extract("hour", Lesson.start_time)
    stmt = (
        select(Lesson.id, Lesson.start_time, Lesson.name, Lesson.teacher_name, Hall.name, Lesson.total_spots, Lesson.status)
        .select_from(Lesson)
        .join(Hall, Lesson.hall_id == Hall.id, isouter=True)
        .where(*conds, weekday_expr == weekday, hour_expr == hour)
        .order_by(Lesson.start_time)
    )
    rows = (await db.execute(stmt)).all()
    if not rows:
        return []

    lesson_ids = [r[0] for r in rows]
    occ_rows = (await db.execute(
        select(Reservation.lesson_id, func.count(Reservation.id))
        .where(Reservation.lesson_id.in_(lesson_ids), Reservation.status.in_(("active", "attended")))
        .group_by(Reservation.lesson_id)
    )).all()
    occupied_by_lesson = {lid: int(cnt) for lid, cnt in occ_rows}

    return [
        SlotLessonRow(
            id=lid, date=start_time.date(), name=name, teacher_name=teacher_name, hall=hall_name,
            occupied=occupied_by_lesson.get(lid, 0), total_spots=total_spots, status=status,
        )
        for lid, start_time, name, teacher_name, hall_name, total_spots, status in rows
    ]
