from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

from fastapi import Query
from sqlalchemy import func

from models import Hall, Lesson, Operation, Reservation


@dataclass
class ReportFilters:
    date_from: date
    date_to: date
    branch_id: int | None
    hall_id: int | None
    trainer_id: int | None
    service_id: int | None


def report_filters(
    date_from: date = Query(...),
    date_to: date = Query(...),
    branch_id: int | None = Query(None),
    hall_id: int | None = Query(None),
    trainer_id: int | None = Query(None),
    service_id: int | None = Query(None),
) -> ReportFilters:
    """Единые query-параметры отчётов — Depends на всех эндпоинтах."""
    return ReportFilters(
        date_from=date_from,
        date_to=date_to,
        branch_id=branch_id,
        hall_id=hall_id,
        trainer_id=trainer_id,
        service_id=service_id,
    )


def prev_range(f: ReportFilters) -> tuple[date, date]:
    """Прошлый период той же длины, что и текущий (логика из /summary)."""
    length = (f.date_to - f.date_from).days
    prev_to = f.date_from - timedelta(days=1)
    prev_from = prev_to - timedelta(days=length)
    return prev_from, prev_to


def pct(curr: float, prev: float) -> float | None:
    """% изменения к прошлому периоду. Прошлый период пустой → null, не 500."""
    if prev == 0:
        return None
    return round((curr - prev) / prev * 100, 1)


def lesson_conds(f: ReportFilters, sid: int) -> list:
    """Условия для запросов по Lesson (+ join Hall для branch_id). start_time —
    datetime, а date_to — дата без времени: без combine(time.max) занятия
    последнего дня периода после полуночи выпадали бы из выборки."""
    conds = [
        Lesson.studio_id == sid,
        Lesson.start_time >= datetime.combine(f.date_from, time.min),
        Lesson.start_time <= datetime.combine(f.date_to, time.max),
    ]
    if f.hall_id is not None:
        conds.append(Lesson.hall_id == f.hall_id)
    if f.trainer_id is not None:
        conds.append(Lesson.teacher_id == f.trainer_id)
    if f.service_id is not None:
        conds.append(Lesson.service_id == f.service_id)
    if f.branch_id is not None:
        conds.append(Hall.branch_id == f.branch_id)
    return conds


def op_conds(f: ReportFilters, sid: int) -> list:
    """Условия для запросов по Operation. У операций нет зала/филиала — игнор."""
    conds = [
        Operation.studio_id == sid,
        Operation.op_date >= f.date_from,
        Operation.op_date <= f.date_to,
    ]
    if f.trainer_id is not None:
        conds.append(Operation.trainer_id == f.trainer_id)
    if f.service_id is not None:
        conds.append(Operation.product_id == f.service_id)
    return conds


def noshow_cond():
    """Активная бронь на занятие, которое уже закончилось — клиент не пришёл."""
    end_time = Lesson.start_time + func.make_interval(0, 0, 0, 0, 0, Lesson.duration_min)
    return (Reservation.status == "active") & (end_time < func.now())


def occupied_expr():
    """Σ занятых мест: активные + посещённые брони."""
    return func.count(Reservation.id).filter(Reservation.status.in_(("active", "attended")))


def capacity_expr():
    """Σ вместимости занятий (Lesson.total_spots)."""
    return func.sum(Lesson.total_spots)
