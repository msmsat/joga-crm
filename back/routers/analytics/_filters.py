from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Callable, Literal, TypeVar

from fastapi import Query
from sqlalchemy import cast, func
from sqlalchemy.types import DateTime

from models import Hall, Lesson, Operation, Reservation

Group = Literal["hour", "day", "week", "month"]
T = TypeVar("T")

# Однодневный период рисуем по часам. Окно — константа, а не рабочие часы
# студии: рабочих часов у филиала может не быть заполнено, а ось нужна всегда.
SERIES_DAY_HOURS = range(6, 24)  # 18 слотов


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


def date_bucket(column, group: Group):
    """date_trunc по DATE-колонке (Operation.op_date). Postgres не знает
    date_trunc(text, date) напрямую и приводит date к timestamptz по TimeZone
    сессии — это сдвигает результат на день при положительном оффсете.
    Явный cast к timestamp (без TZ) убирает конвертацию."""
    return func.date_trunc(group, cast(column, DateTime))


def bucket_key(dt: datetime | date, group: Group) -> str:
    """Ключ бакета ровно так, как его считает date_trunc в Postgres.
    week → понедельник, month → 1-е число, hour → ISO с часом.

    date_trunc уже сделал округление на стороне SQL — здесь только форматируем
    результат в строку-ключ для словаря fill_series."""
    if group == "hour":
        return dt.isoformat()
    d = dt.date() if isinstance(dt, datetime) else dt
    return d.isoformat()


def series_buckets(date_from: date, date_to: date, group: Group) -> list[str]:
    """Полный список ключей бакетов периода — включая пустые."""
    if group == "hour":
        return [datetime.combine(date_from, time(hour=h)).isoformat() for h in SERIES_DAY_HOURS]
    if group == "day":
        days = (date_to - date_from).days
        return [(date_from + timedelta(days=i)).isoformat() for i in range(days + 1)]
    if group == "week":
        start = date_from - timedelta(days=date_from.weekday())
        end = date_to - timedelta(days=date_to.weekday())
        keys = []
        cur = start
        while cur <= end:
            keys.append(cur.isoformat())
            cur += timedelta(days=7)
        return keys
    # month
    keys = []
    cur = date_from.replace(day=1)
    while cur <= date_to:
        keys.append(cur.isoformat())
        cur = (cur.replace(day=28) + timedelta(days=4)).replace(day=1)
    return keys


def fill_series(rows: dict[str, T], buckets: list[str], zero: Callable[[str], T]) -> list[T]:
    """rows — то, что вернул SQL (ключ бакета → точка); buckets — полная ось.
    Возвращает список длиной len(buckets) в порядке оси."""
    return [rows.get(b, zero(b)) for b in buckets]
