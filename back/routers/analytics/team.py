"""EPIC R4 задача 1-2: GET /analytics/team, GET /analytics/team/{trainer_id}
— сводка и детализация вкладки «Команда».

Выручка — in-операции с trainer_id (честная оговорка как в /trainers: выручка
без привязки к тренеру в срез не входит, Σ ≤ Обзора — формула в InfoHint
formulas.team_scope).
"""
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import require_role, StudioContext
from models import Lesson, Operation, Reservation, StudioMember, User
from schemas.analytics.reports import (
    Insight,
    Kpi,
    SeriesPoint,
    TeamKpi,
    TeamRead,
    TrainerDetailRead,
    TrainerLoadPoint,
    TrainerRow,
    TrainerTopLesson,
)
from ._filters import date_bucket, lesson_conds, noshow_cond, pct, prev_range, ReportFilters, report_filters, series_buckets

router = APIRouter()

LOAD_WINDOW_START_HOUR = 9
LOAD_WINDOW_END_HOUR = 21

HIGH_RETURN_THRESHOLD_PCT = 60.0
EVENING_FILL_THRESHOLD_PCT = 50.0
EVENING_START_HOUR = 17
EVENING_END_HOUR = 21
OVERLOADED_THRESHOLD_PCT = 85.0
LOW_RATING_THRESHOLD = 4.0
LOW_RATING_MIN_VOTES = 10
MAX_INSIGHTS_PER_RULE = 2


def _working_days(d_from: date, d_to: date) -> int:
    """Число рабочих дней в периоде (Пн-Сб, воскресенье не считаем рабочим окном 9-21)."""
    days = (d_to - d_from).days + 1
    full_weeks, rem = divmod(days, 7)
    count = full_weeks * 6
    for i in range(rem):
        if (d_from + timedelta(days=full_weeks * 7 + i)).weekday() != 6:
            count += 1
    return count


async def _trainer_names(ids: set[int], db: AsyncSession) -> dict[int, str]:
    """ids уже отфильтрованы по studio_id на стороне Lesson/Operation — User.studio_id не существует
    (принадлежность к студии — через StudioMember), достаточно IN по id."""
    if not ids:
        return {}
    rows = (await db.execute(
        select(User.id, User.name, User.last_name).where(User.id.in_(ids))
    )).all()
    return {uid: " ".join(filter(None, [name, last_name])) for uid, name, last_name in rows}


async def _lesson_stats(f: ReportFilters, sid: int, db: AsyncSession) -> dict[int, dict]:
    """Занятия/заполняемость/посещения/отмены по каждому тренеру за период."""
    rows = (await db.execute(
        select(
            Lesson.teacher_id,
            Lesson.id,
            Lesson.status,
            Lesson.duration_min,
            Lesson.total_spots,
            Reservation.status,
        )
        .join(Reservation, Reservation.lesson_id == Lesson.id, isouter=True)
        .where(*lesson_conds(f, sid), Lesson.teacher_id.isnot(None))
    )).all()

    lessons: dict[int, dict[int, dict]] = {}
    for teacher_id, lesson_id, lesson_status, duration_min, total_spots, res_status in rows:
        by_lesson = lessons.setdefault(teacher_id, {})
        entry = by_lesson.setdefault(lesson_id, {
            "status": lesson_status, "duration_min": duration_min, "total_spots": total_spots,
            "occupied": 0, "attendance": 0, "reservations": 0,
        })
        if res_status is not None:
            entry["reservations"] += 1
        if res_status in ("active", "attended"):
            entry["occupied"] += 1
        if res_status == "attended":
            entry["attendance"] += 1

    stats: dict[int, dict] = {}
    for teacher_id, by_lesson in lessons.items():
        active_lessons = [e for e in by_lesson.values() if e["status"] != "cancelled"]
        cancelled = sum(1 for e in by_lesson.values() if e["status"] == "cancelled")
        occupied = sum(e["occupied"] for e in active_lessons)
        capacity = sum(e["total_spots"] for e in active_lessons)
        duration_hours = sum(e["duration_min"] for e in active_lessons) / 60
        stats[teacher_id] = {
            "lessons": len(by_lesson),
            "cancels": cancelled,
            "occupied": occupied,
            "capacity": capacity,
            "attendance": sum(e["attendance"] for e in active_lessons),
            "reservations": sum(e["reservations"] for e in by_lesson.values()),
            "duration_hours": duration_hours,
            "fill_pct": round(occupied / capacity * 100, 1) if capacity else 0.0,
        }
    return stats


async def _revenue_by_trainer(f: ReportFilters, sid: int, db: AsyncSession) -> dict[int, int]:
    rows = (await db.execute(
        select(Operation.trainer_id, func.coalesce(func.sum(Operation.amount), 0))
        .where(
            Operation.studio_id == sid, Operation.type == "in", Operation.trainer_id.isnot(None),
            Operation.op_date >= f.date_from, Operation.op_date <= f.date_to,
        )
        .group_by(Operation.trainer_id)
    )).all()
    return {tid: int(amount) for tid, amount in rows}


async def _noshows_by_trainer(f: ReportFilters, sid: int, db: AsyncSession) -> dict[int, int]:
    rows = (await db.execute(
        select(Lesson.teacher_id, func.count(Reservation.id))
        .join(Reservation, Reservation.lesson_id == Lesson.id)
        .where(*lesson_conds(f, sid), Lesson.teacher_id.isnot(None), noshow_cond())
        .group_by(Lesson.teacher_id)
    )).all()
    return {tid: int(cnt) for tid, cnt in rows}


async def _rating_by_trainer(f: ReportFilters, sid: int, db: AsyncSession) -> dict[int, tuple[float, int]]:
    rows = (await db.execute(
        select(Lesson.teacher_id, func.avg(Reservation.rating), func.count(Reservation.rating))
        .join(Reservation, Reservation.lesson_id == Lesson.id)
        .where(*lesson_conds(f, sid), Lesson.teacher_id.isnot(None), Reservation.rating.isnot(None))
        .group_by(Lesson.teacher_id)
    )).all()
    return {tid: (round(float(avg), 1), int(cnt)) for tid, avg, cnt in rows}


async def _return_rate_by_trainer(f: ReportFilters, sid: int, db: AsyncSession) -> dict[int, float]:
    """Клиенты с >=2 attended у тренера / клиенты с >=1 attended у тренера."""
    rows = (await db.execute(
        select(Lesson.teacher_id, Reservation.client_id, func.count(Reservation.id))
        .join(Reservation, Reservation.lesson_id == Lesson.id)
        .where(*lesson_conds(f, sid), Lesson.teacher_id.isnot(None), Reservation.status == "attended")
        .group_by(Lesson.teacher_id, Reservation.client_id)
    )).all()
    by_trainer: dict[int, list[int]] = {}
    for tid, _cid, cnt in rows:
        by_trainer.setdefault(tid, []).append(int(cnt))
    return {
        tid: round(sum(1 for c in counts if c >= 2) / len(counts) * 100, 1)
        for tid, counts in by_trainer.items()
    }


def _evening_fill_pct(rows: list) -> Optional[float]:
    occupied = capacity = 0
    for start_time, occ, cap in rows:
        if EVENING_START_HOUR <= start_time.hour < EVENING_END_HOUR:
            occupied += occ
            capacity += cap
    return round(occupied / capacity * 100, 1) if capacity else None


async def _build_trainer_rows(f: ReportFilters, sid: int, db: AsyncSession) -> tuple[list[TrainerRow], dict[int, int]]:
    """Возвращает строки тренеров + число оценок на тренера (для порога low_rating >= 10 оценок,
    сама TrainerRow.rating колонки таблицы этот порог не учитывает — это отдельная метрика для insight)."""
    lesson_stats = await _lesson_stats(f, sid, db)
    revenue = await _revenue_by_trainer(f, sid, db)
    noshows = await _noshows_by_trainer(f, sid, db)
    ratings = await _rating_by_trainer(f, sid, db)
    return_rates = await _return_rate_by_trainer(f, sid, db)
    names = await _trainer_names(set(lesson_stats) | set(revenue), db)

    working_days = _working_days(f.date_from, f.date_to)
    window_hours = working_days * (LOAD_WINDOW_END_HOUR - LOAD_WINDOW_START_HOUR)

    trainer_ids = set(lesson_stats) | set(revenue)
    rows: list[TrainerRow] = []
    votes_by_trainer: dict[int, int] = {}
    for tid in trainer_ids:
        stats = lesson_stats.get(tid, {
            "lessons": 0, "cancels": 0, "occupied": 0, "capacity": 0,
            "attendance": 0, "duration_hours": 0.0, "fill_pct": 0.0,
        })
        rev = revenue.get(tid, 0)
        rating, votes = ratings.get(tid, (None, 0))
        votes_by_trainer[tid] = votes
        rows.append(TrainerRow(
            trainer_id=tid,
            name=names.get(tid, str(tid)),
            lessons=stats["lessons"],
            fill_pct=stats["fill_pct"],
            attendance=stats["attendance"],
            revenue=rev,
            return_rate_pct=return_rates.get(tid, 0.0),
            cancels=stats["cancels"],
            noshows=noshows.get(tid, 0),
            rating=rating,
            load_pct=round(stats["duration_hours"] / window_hours * 100, 1) if window_hours else 0.0,
        ))
    return rows, votes_by_trainer


async def _insights(
    f: ReportFilters, sid: int, trainers: list[TrainerRow], votes_by_trainer: dict[int, int], db: AsyncSession,
) -> list[Insight]:
    insights: list[Insight] = []

    evening_rows = (await db.execute(
        select(Lesson.teacher_id, Lesson.start_time, func.count(Reservation.id).filter(
            Reservation.status.in_(("active", "attended"))
        ), func.max(Lesson.total_spots))
        .select_from(Lesson)
        .join(Reservation, Reservation.lesson_id == Lesson.id, isouter=True)
        .where(*lesson_conds(f, sid), Lesson.teacher_id.isnot(None))
        .group_by(Lesson.teacher_id, Lesson.start_time, Lesson.id)
    )).all()
    by_trainer_evening: dict[int, list] = {}
    for tid, start_time, occ, cap in evening_rows:
        by_trainer_evening.setdefault(tid, []).append((start_time, int(occ or 0), int(cap or 0)))

    for t in sorted(trainers, key=lambda t: t.return_rate_pct, reverse=True)[:MAX_INSIGHTS_PER_RULE]:
        if t.return_rate_pct > HIGH_RETURN_THRESHOLD_PCT:
            evening_fill = _evening_fill_pct(by_trainer_evening.get(t.trainer_id, []))
            if evening_fill is not None and evening_fill < EVENING_FILL_THRESHOLD_PCT:
                insights.append(Insight(
                    key="high_return_free_evenings",
                    severity="info",
                    params={"name": t.name, "return_pct": t.return_rate_pct},
                    action="add_lesson",
                    action_params={"teacher_id": t.trainer_id},
                ))

    for t in sorted(trainers, key=lambda t: t.load_pct, reverse=True)[:MAX_INSIGHTS_PER_RULE]:
        if t.load_pct > OVERLOADED_THRESHOLD_PCT:
            insights.append(Insight(
                key="trainer_overloaded",
                severity="warning",
                params={"name": t.name, "load_pct": t.load_pct},
                action="open_journal",
                action_params={"teacher_id": t.trainer_id},
            ))

    low_rated = [
        t for t in trainers
        if t.rating is not None and t.rating < LOW_RATING_THRESHOLD
        and votes_by_trainer.get(t.trainer_id, 0) >= LOW_RATING_MIN_VOTES
    ]
    for t in sorted(low_rated, key=lambda t: t.rating)[:MAX_INSIGHTS_PER_RULE]:
        insights.append(Insight(
            key="low_rating",
            severity="warning",
            params={"name": t.name, "rating": t.rating},
            action="open_trainer",
            action_params={"id": t.trainer_id},
        ))

    return insights[:4]


@router.get("/team", response_model=TeamRead)
async def analytics_team(
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

    trainers, votes_by_trainer = await _build_trainer_rows(f, sid, db)
    prev_trainers, _prev_votes = await _build_trainer_rows(prev_f, sid, db)

    lessons_count = sum(t.lessons for t in trainers)
    prev_lessons_count = sum(t.lessons for t in prev_trainers)

    total_revenue = sum(t.revenue for t in trainers)
    lesson_stats = await _lesson_stats(f, sid, db)
    prev_lesson_stats = await _lesson_stats(prev_f, sid, db)
    total_hours = sum(s["duration_hours"] for s in lesson_stats.values())
    prev_total_hours = sum(s["duration_hours"] for s in prev_lesson_stats.values())
    prev_total_revenue = sum(t.revenue for t in prev_trainers)
    revenue_per_hour = round(total_revenue / total_hours, 1) if total_hours else 0.0
    prev_revenue_per_hour = round(prev_total_revenue / prev_total_hours, 1) if prev_total_hours else 0.0

    total_occupied = sum(s["occupied"] for s in lesson_stats.values())
    total_capacity = sum(s["capacity"] for s in lesson_stats.values())
    prev_occupied = sum(s["occupied"] for s in prev_lesson_stats.values())
    prev_capacity = sum(s["capacity"] for s in prev_lesson_stats.values())
    avg_fill_pct = round(total_occupied / total_capacity * 100, 1) if total_capacity else 0.0
    prev_avg_fill_pct = round(prev_occupied / prev_capacity * 100, 1) if prev_capacity else 0.0

    total_cancels = sum(t.cancels for t in trainers)
    total_noshows = sum(t.noshows for t in trainers)
    total_reservations = sum(s["reservations"] for s in lesson_stats.values())
    cancel_noshow_pct = (
        round((total_cancels + total_noshows) / (lessons_count + total_reservations) * 100, 1)
        if (lessons_count + total_reservations) else 0.0
    )
    prev_cancels = sum(t.cancels for t in prev_trainers)
    prev_noshows = sum(t.noshows for t in prev_trainers)
    prev_reservations = sum(s["reservations"] for s in prev_lesson_stats.values())
    prev_cancel_noshow_pct = (
        round((prev_cancels + prev_noshows) / (prev_lessons_count + prev_reservations) * 100, 1)
        if (prev_lessons_count + prev_reservations) else 0.0
    )

    rated = [t.rating for t in trainers if t.rating is not None]
    prev_rated = [t.rating for t in prev_trainers if t.rating is not None]
    avg_rating = round(sum(rated) / len(rated), 1) if rated else 0.0
    prev_avg_rating = round(sum(prev_rated) / len(prev_rated), 1) if prev_rated else 0.0

    kpi = TeamKpi(
        lessons_count=Kpi(value=lessons_count, prev_pct=pct(lessons_count, prev_lessons_count)),
        revenue_per_hour=Kpi(value=revenue_per_hour, prev_pct=pct(revenue_per_hour, prev_revenue_per_hour)),
        avg_fill_pct=Kpi(value=avg_fill_pct, prev_pct=pct(avg_fill_pct, prev_avg_fill_pct)),
        cancel_noshow_pct=Kpi(value=cancel_noshow_pct, prev_pct=pct(cancel_noshow_pct, prev_cancel_noshow_pct)),
        avg_rating=Kpi(value=avg_rating, prev_pct=pct(avg_rating, prev_avg_rating)),
    )

    insights = await _insights(f, sid, trainers, votes_by_trainer, db)

    return TeamRead(kpi=kpi, trainers=trainers, insights=insights)


@router.get("/team/{id}", response_model=TrainerDetailRead)
async def analytics_team_trainer_detail(
    id: int,
    f: ReportFilters = Depends(report_filters),
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    sid = ctx.studio_id
    exists = (await db.execute(
        select(StudioMember.id).where(StudioMember.studio_id == sid, StudioMember.user_id == id)
    )).scalar_one_or_none()
    if exists is None:
        raise HTTPException(status_code=404, detail="Тренер не найден")

    trainer_f = ReportFilters(
        date_from=f.date_from, date_to=f.date_to,
        branch_id=f.branch_id, hall_id=f.hall_id, trainer_id=id, service_id=f.service_id,
    )

    revenue_rows = (await db.execute(
        select(date_bucket(Operation.op_date, "week").label("period"), func.coalesce(func.sum(Operation.amount), 0))
        .where(
            Operation.studio_id == sid, Operation.type == "in", Operation.trainer_id == id,
            Operation.op_date >= f.date_from, Operation.op_date <= f.date_to,
        )
        .group_by("period").order_by("period")
    )).all()
    revenue_by_week = {period.date().isoformat(): float(amount) for period, amount in revenue_rows}
    revenue_series = [
        SeriesPoint(period=w, value=revenue_by_week.get(w, 0.0))
        for w in series_buckets(f.date_from, f.date_to, "week")
    ]

    load_rows = (await db.execute(
        select(
            func.extract("dow", Lesson.start_time).label("dow"),
            Lesson.id,
            func.count(Reservation.id).filter(Reservation.status.in_(("active", "attended"))),
            func.max(Lesson.total_spots),
        )
        .select_from(Lesson)
        .join(Reservation, Reservation.lesson_id == Lesson.id, isouter=True)
        .where(*lesson_conds(trainer_f, sid))
        .group_by("dow", Lesson.id)
    )).all()
    by_weekday: dict[int, dict] = {}
    for dow, _lesson_id, occ, cap in load_rows:
        entry = by_weekday.setdefault(int(dow), {"lessons": set(), "occupied": 0, "capacity": 0})
        entry["lessons"].add(_lesson_id)
        entry["occupied"] += int(occ or 0)
        entry["capacity"] += int(cap or 0)
    load_by_weekday = [
        TrainerLoadPoint(
            weekday=dow,
            lessons=len(e["lessons"]),
            fill_pct=round(e["occupied"] / e["capacity"] * 100, 1) if e["capacity"] else 0.0,
        )
        for dow, e in sorted(by_weekday.items())
    ]

    top_rows = (await db.execute(
        select(
            Lesson.name,
            func.count(func.distinct(Lesson.id)),
            func.count(Reservation.id).filter(Reservation.status == "attended"),
            func.count(Reservation.id).filter(Reservation.status.in_(("active", "attended"))),
            func.sum(Lesson.total_spots),
        )
        .select_from(Lesson)
        .join(Reservation, Reservation.lesson_id == Lesson.id, isouter=True)
        .where(*lesson_conds(trainer_f, sid))
        .group_by(Lesson.name)
        .order_by(func.count(Reservation.id).filter(Reservation.status == "attended").desc())
        .limit(5)
    )).all()
    top_lessons = [
        TrainerTopLesson(
            name=name, held=held, attendance=attendance,
            fill_pct=round(occupied / capacity * 100, 1) if capacity else 0.0,
        )
        for name, held, attendance, occupied, capacity in top_rows
    ]

    curr_ids_rows = (await db.execute(
        select(func.distinct(Reservation.client_id))
        .join(Lesson, Lesson.id == Reservation.lesson_id)
        .where(*lesson_conds(trainer_f, sid), Reservation.status == "attended")
    )).scalars().all()
    total_clients = len(curr_ids_rows)

    return_rows = (await db.execute(
        select(Reservation.client_id, func.count(Reservation.id))
        .join(Lesson, Lesson.id == Reservation.lesson_id)
        .where(*lesson_conds(trainer_f, sid), Reservation.status == "attended")
        .group_by(Reservation.client_id)
    )).all()
    returned_clients = sum(1 for _cid, cnt in return_rows if cnt >= 2)
    return_rate_pct = round(returned_clients / total_clients * 100, 1) if total_clients else 0.0

    return TrainerDetailRead(
        revenue_series=revenue_series,
        load_by_weekday=load_by_weekday,
        top_lessons=top_lessons,
        return_rate_pct=return_rate_pct,
        returned_clients=returned_clients,
        total_clients=total_clients,
    )
