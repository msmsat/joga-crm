"""EPIC R3 задача 1: GET /analytics/clients-report — сводка вкладки «Клиенты».

Сегменты риска переиспользуют SEGMENT_MATCHERS (services/loyalty_matching.py) —
те же функции, что питают /loyalty/segments, поэтому счётчик сегмента на
вкладке Клиенты всегда совпадает со счётчиком в Лояльности. Сегменты
«лояльные» (frequent/high_ltv/referrers) скоуплены периодом отчёта и не
участвуют в кампаниях Лояльности — свои функции по соседству.
"""
from datetime import date, datetime, time, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import require_role, StudioContext
from models import Client, ClientSubscription, Lesson, Operation, Reservation
from schemas.analytics.reports import (
    ClientsKpi,
    ClientsReportRead,
    Insight,
    Kpi,
    SegmentClientRow,
    SegmentCount,
    WeeklyPoint,
)
from services.loyalty_matching import (
    Match,
    SEGMENT_MATCHERS,
    seg_frequent,
    seg_high_ltv,
    seg_referrers,
)
from ._filters import lesson_conds, pct, prev_range, ReportFilters, report_filters, series_buckets

router = APIRouter()

RISK_SEGMENT_KEYS = ["at_risk", "vip_idle", "expiring_subscription", "lost_newcomers", "upsell_candidates"]

SUBS_EXPIRING_DAYS = 7
VIP_INACTIVE_DAYS = 30
VIP_INACTIVE_MAX_INSIGHTS = 2


async def _loyal_matches(key: str, f: ReportFilters, sid: int, db: AsyncSession) -> list[Match]:
    if key == "frequent":
        return await seg_frequent(db, sid, f.date_from, f.date_to)
    if key == "high_ltv":
        return await seg_high_ltv(db, sid)
    if key == "referrers":
        return await seg_referrers(db, sid, f.date_from, f.date_to)
    return []


async def _active_matches(f: ReportFilters, sid: int, db: AsyncSession) -> list[Match]:
    """Клиенты с attended-занятием в периоде (та же выборка, что даёт KPI
    active_clients на Обзоре) — value = число визитов за период, сортировка
    по last_visit_date DESC."""
    rows = (await db.execute(
        select(Client.id, func.count(Reservation.id))
        .select_from(Lesson)
        .join(Reservation, Reservation.lesson_id == Lesson.id)
        .join(Client, Client.id == Reservation.client_id)
        .where(*lesson_conds(f, sid), Reservation.status == "attended")
        .group_by(Client.id, Client.last_visit_date)
        .order_by(Client.last_visit_date.desc())
    )).all()
    return [Match(cid, f"c:{cid}", {"visits": int(visits)}) for cid, visits in rows]


async def _attended_client_ids(sid: int, d_from: date, d_to: date, db: AsyncSession) -> set[int]:
    ids = (await db.execute(
        select(func.distinct(Reservation.client_id))
        .select_from(Lesson)
        .join(Reservation, Reservation.lesson_id == Lesson.id)
        .where(
            Lesson.studio_id == sid,
            Reservation.status == "attended",
            Lesson.start_time >= datetime.combine(d_from, time.min),
            Lesson.start_time <= datetime.combine(d_to, time.max),
        )
    )).scalars().all()
    return set(ids)


async def _kpi(f: ReportFilters, sid: int, prev_from: date, prev_to: date, db: AsyncSession) -> ClientsKpi:
    start_dt = datetime.combine(f.date_from, time.min)
    end_dt = datetime.combine(f.date_to, time.max)
    prev_start_dt = datetime.combine(prev_from, time.min)
    prev_end_dt = datetime.combine(prev_to, time.max)

    new_count = (await db.execute(
        select(func.count(Client.id)).where(
            Client.studio_id == sid, Client.registration_date >= start_dt, Client.registration_date <= end_dt,
        )
    )).scalar_one()
    prev_new_count = (await db.execute(
        select(func.count(Client.id)).where(
            Client.studio_id == sid, Client.registration_date >= prev_start_dt, Client.registration_date <= prev_end_dt,
        )
    )).scalar_one()

    curr_ids = await _attended_client_ids(sid, f.date_from, f.date_to, db)
    prev_ids = await _attended_client_ids(sid, prev_from, prev_to, db)
    length = (f.date_to - f.date_from).days
    prev2_from = prev_from - timedelta(days=length + 1)
    prev2_to = prev_from - timedelta(days=1)
    prev2_ids = await _attended_client_ids(sid, prev2_from, prev2_to, db)

    returned = len(curr_ids & prev_ids)
    prev_returned = len(prev_ids & prev2_ids)
    lost = len(prev_ids - curr_ids)
    prev_lost = len(prev2_ids - prev_ids)

    retention_pct = round(len(prev_ids & curr_ids) / len(prev_ids) * 100, 1) if prev_ids else 0.0
    prev_retention_pct = round(len(prev2_ids & prev_ids) / len(prev2_ids) * 100, 1) if prev2_ids else 0.0

    rev_rows = (await db.execute(
        select(Operation.client_id, Operation.amount).where(
            Operation.studio_id == sid, Operation.type == "in",
            Operation.op_date >= f.date_from, Operation.op_date <= f.date_to,
            Operation.client_id.is_not(None),
        )
    )).all()
    clients_with_rev = {cid for cid, _amount in rev_rows}
    total_rev = sum(int(amount) for _cid, amount in rev_rows)
    avg_value = total_rev / len(clients_with_rev) if clients_with_rev else 0.0

    prev_rev_rows = (await db.execute(
        select(Operation.client_id, Operation.amount).where(
            Operation.studio_id == sid, Operation.type == "in",
            Operation.op_date >= prev_from, Operation.op_date <= prev_to,
            Operation.client_id.is_not(None),
        )
    )).all()
    prev_clients_with_rev = {cid for cid, _amount in prev_rev_rows}
    prev_total_rev = sum(int(amount) for _cid, amount in prev_rev_rows)
    prev_avg_value = prev_total_rev / len(prev_clients_with_rev) if prev_clients_with_rev else 0.0

    return ClientsKpi(
        new=Kpi(value=int(new_count), prev_pct=pct(int(new_count), int(prev_new_count))),
        returned=Kpi(value=returned, prev_pct=pct(returned, prev_returned)),
        lost=Kpi(value=lost, prev_pct=pct(lost, prev_lost)),
        retention_pct=Kpi(value=retention_pct, prev_pct=pct(retention_pct, prev_retention_pct)),
        avg_value=Kpi(value=round(avg_value, 2), prev_pct=pct(avg_value, prev_avg_value)),
    )


async def _weekly(f: ReportFilters, sid: int, db: AsyncSession) -> list[WeeklyPoint]:
    start_dt = datetime.combine(f.date_from, time.min)
    end_dt = datetime.combine(f.date_to, time.max)

    new_rows = (await db.execute(
        select(func.date_trunc("week", Client.registration_date).label("period"), func.count(Client.id))
        .where(Client.studio_id == sid, Client.registration_date >= start_dt, Client.registration_date <= end_dt)
        .group_by("period")
    )).all()
    new_by_week = {p.date().isoformat(): int(cnt) for p, cnt in new_rows}

    returning_rows = (await db.execute(
        select(
            func.date_trunc("week", Lesson.start_time).label("period"),
            func.count(func.distinct(Reservation.client_id)),
        )
        .select_from(Lesson)
        .join(Reservation, Reservation.lesson_id == Lesson.id)
        .join(Client, Client.id == Reservation.client_id)
        .where(
            Lesson.studio_id == sid,
            Reservation.status == "attended",
            Lesson.start_time >= start_dt,
            Lesson.start_time <= end_dt,
            Client.registration_date < start_dt,
        )
        .group_by("period")
    )).all()
    returning_by_week = {p.date().isoformat(): int(cnt) for p, cnt in returning_rows}

    weeks = series_buckets(f.date_from, f.date_to, "week")
    return [
        WeeklyPoint(period=w, new=new_by_week.get(w, 0), returned=returning_by_week.get(w, 0))
        for w in weeks
    ]


async def _insight_new_no_second_visit(f: ReportFilters, sid: int, db: AsyncSession) -> Insight | None:
    """Новички периода (registration_date в периоде) с ровно 1 attended и без будущих активных броней."""
    start_dt = datetime.combine(f.date_from, time.min)
    end_dt = datetime.combine(f.date_to, time.max)
    new_ids = (await db.execute(
        select(Client.id).where(
            Client.studio_id == sid, Client.registration_date >= start_dt, Client.registration_date <= end_dt,
        )
    )).scalars().all()
    if not new_ids:
        return None

    attended_rows = (await db.execute(
        select(Reservation.client_id, func.count(Reservation.id))
        .where(Reservation.client_id.in_(new_ids), Reservation.status == "attended")
        .group_by(Reservation.client_id)
    )).all()
    exactly_one = {cid for cid, cnt in attended_rows if cnt == 1}
    if not exactly_one:
        return None

    future_rows = (await db.execute(
        select(func.distinct(Reservation.client_id))
        .join(Lesson, Lesson.id == Reservation.lesson_id)
        .where(
            Reservation.client_id.in_(exactly_one),
            Reservation.status == "active",
            Lesson.start_time > func.now(),
        )
    )).scalars().all()
    no_future = exactly_one - set(future_rows)

    count = len(no_future)
    if count <= 0:
        return None
    return Insight(
        key="new_no_second_visit",
        severity="warning",
        params={"count": count},
        action="open_campaign",
        action_params={"segment": "new_no_second"},
    )


async def _insight_subs_expiring_week(sid: int, db: AsyncSession) -> Insight | None:
    today = date.today()
    cutoff = today + timedelta(days=SUBS_EXPIRING_DAYS)
    count = (await db.execute(
        select(func.count(func.distinct(ClientSubscription.client_id)))
        .join(Client, Client.id == ClientSubscription.client_id)
        .where(
            Client.studio_id == sid,
            ClientSubscription.status == "active",
            ClientSubscription.expires_at >= today,
            ClientSubscription.expires_at <= cutoff,
        )
    )).scalar_one()
    if count <= 0:
        return None
    return Insight(
        key="subs_expiring_week",
        severity="warning",
        params={"count": int(count)},
        action="open_campaign",
        action_params={"segment": "sub_ending"},
    )


async def _insights_vip_inactive(sid: int, db: AsyncSession) -> list[Insight]:
    threshold = date.today() - timedelta(days=VIP_INACTIVE_DAYS)
    rows = (await db.execute(
        select(Client.id, Client.name, Client.last_visit_date).where(
            Client.studio_id == sid,
            Client.status == "vip",
            Client.last_visit_date.is_not(None),
            Client.last_visit_date < threshold,
        ).order_by(Client.last_visit_date.asc()).limit(VIP_INACTIVE_MAX_INSIGHTS)
    )).all()
    return [
        Insight(
            key="vip_inactive",
            severity="warning",
            params={"name": name, "days": (date.today() - lv).days},
            action="open_client",
            action_params={"id": cid},
        )
        for cid, name, lv in rows
    ]


@router.get("/clients-report", response_model=ClientsReportRead)
async def analytics_clients_report(
    f: ReportFilters = Depends(report_filters),
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    sid = ctx.studio_id
    prev_from, prev_to = prev_range(f)

    kpi = await _kpi(f, sid, prev_from, prev_to, db)
    weekly = await _weekly(f, sid, db)

    risk_segments: list[SegmentCount] = []
    for key in RISK_SEGMENT_KEYS:
        matches = await SEGMENT_MATCHERS[key](db, sid)
        risk_segments.append(SegmentCount(key=key, count=len(matches)))

    loyal_segments: list[SegmentCount] = []
    for key in ("frequent", "high_ltv", "referrers"):
        matches = await _loyal_matches(key, f, sid, db)
        loyal_segments.append(SegmentCount(key=key, count=len(matches)))

    insights: list[Insight] = []
    for insight in (
        await _insight_new_no_second_visit(f, sid, db),
        await _insight_subs_expiring_week(sid, db),
    ):
        if insight is not None:
            insights.append(insight)
    insights.extend(await _insights_vip_inactive(sid, db))

    return ClientsReportRead(
        kpi=kpi,
        weekly=weekly,
        risk_segments=risk_segments,
        loyal_segments=loyal_segments,
        insights=insights[:4],
    )


def _match_value(key: str, m: Match) -> float | None:
    if key == "high_ltv":
        return float(m.context.get("spent", 0))
    if key in ("frequent", "active"):
        return float(m.context.get("visits", 0))
    if key in ("at_risk", "vip_idle", "lost_newcomers"):
        return float(m.context.get("days_inactive")) if m.context.get("days_inactive") is not None else None
    if key == "expiring_subscription":
        return float(m.context.get("remaining", 0))
    return None


@router.get("/clients-report/segment", response_model=list[SegmentClientRow])
async def analytics_clients_report_segment(
    key: str = Query(...),
    f: ReportFilters = Depends(report_filters),
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    sid = ctx.studio_id
    if key in RISK_SEGMENT_KEYS:
        matches = await SEGMENT_MATCHERS[key](db, sid)
    elif key in ("frequent", "high_ltv", "referrers"):
        matches = await _loyal_matches(key, f, sid, db)
    elif key == "active":
        matches = await _active_matches(f, sid, db)
    else:
        raise HTTPException(status_code=404, detail="Сегмент не найден")

    if not matches:
        return []
    ids = [m.client_id for m in matches]
    rows = (await db.execute(
        select(Client.id, Client.name, Client.last_name, Client.phone, Client.last_visit_date)
        .where(Client.id.in_(ids), Client.studio_id == sid)
    )).all()
    by_id = {cid: (name, last_name, phone, lv) for cid, name, last_name, phone, lv in rows}
    result: list[SegmentClientRow] = []
    for m in matches:
        row = by_id.get(m.client_id)
        if row is None:
            continue
        name, last_name, phone, lv = row
        result.append(SegmentClientRow(
            id=m.client_id, name=name, last_name=last_name, phone=phone,
            last_visit_date=lv, value=_match_value(key, m),
        ))
    return result


@router.get("/clients-report/week", response_model=list[SegmentClientRow])
async def analytics_clients_report_week(
    period: date = Query(...),
    kind: Literal["new", "returned"] = Query(...),
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    sid = ctx.studio_id
    week_start = datetime.combine(period, time.min)
    week_end = week_start + timedelta(days=7)

    if kind == "new":
        rows = (await db.execute(
            select(Client.id, Client.name, Client.last_name, Client.phone, Client.last_visit_date)
            .where(
                Client.studio_id == sid,
                Client.registration_date >= week_start,
                Client.registration_date < week_end,
            )
        )).all()
    else:
        rows = (await db.execute(
            select(Client.id, Client.name, Client.last_name, Client.phone, Client.last_visit_date)
            .join(Reservation, Reservation.client_id == Client.id)
            .join(Lesson, Lesson.id == Reservation.lesson_id)
            .where(
                Client.studio_id == sid,
                Reservation.status == "attended",
                Lesson.start_time >= week_start,
                Lesson.start_time < week_end,
                Client.registration_date < week_start,
            )
            .distinct()
        )).all()

    return [
        SegmentClientRow(id=cid, name=name, last_name=last_name, phone=phone, last_visit_date=lv, value=None)
        for cid, name, last_name, phone, lv in rows
    ]
