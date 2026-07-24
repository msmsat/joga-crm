"""EPIC R6 задача 7: series_buckets/bucket_key/fill_series — полная ось периода,
включая пустые интервалы (не только бакеты с данными). Unit-проверки самих
хелперов + сквозные через metric_series на реальной БД.
Запуск из back/:  python -m tests.test_analytics_series_fill
"""
import asyncio
import warnings
from datetime import date, datetime, timedelta

warnings.filterwarnings("ignore")

from sqlalchemy import delete

from database import async_session_maker
from dependencies import StudioContext
from models import Client, Operation, Studio
from routers.analytics._filters import bucket_key, ReportFilters, SERIES_DAY_HOURS, series_buckets
from routers.analytics.reports import metric_series


def test_series_buckets_day():
    b = series_buckets(date(2026, 3, 1), date(2026, 3, 3), "day")
    assert b == ["2026-03-01", "2026-03-02", "2026-03-03"], b


def test_series_buckets_week_mondays():
    d_from, d_to = date(2026, 3, 4), date(2026, 3, 18)
    b = series_buckets(d_from, d_to, "week")
    assert all(date.fromisoformat(k).weekday() == 0 for k in b), b
    expected_start = d_from - timedelta(days=d_from.weekday())
    expected_end = d_to - timedelta(days=d_to.weekday())
    expected_count = (expected_end - expected_start).days // 7 + 1
    assert b == [(expected_start + timedelta(weeks=i)).isoformat() for i in range(expected_count)], b


def test_series_buckets_hour_18_slots():
    d = date(2026, 3, 4)
    b = series_buckets(d, d, "hour")
    assert len(b) == 18 == len(SERIES_DAY_HOURS), b
    assert b == [datetime.combine(d, datetime.min.time().replace(hour=h)).isoformat() for h in SERIES_DAY_HOURS], b


def test_bucket_key_matches_series_buckets():
    """Ключ, который bucket_key() даёт для значения date_trunc('week', ...) (понедельник,
    00:00), должен буквально совпасть с ключом из series_buckets — иначе fill_series
    не найдёт точку в rows и молча подставит ноль вместо реальных данных."""
    buckets = series_buckets(date(2026, 3, 4), date(2026, 3, 18), "week")
    monday = date.fromisoformat(buckets[0])
    assert bucket_key(datetime.combine(monday, datetime.min.time()), "week") == buckets[0]


async def _seed() -> int:
    async with async_session_maker() as db:
        s = Studio(name="TEST-SERIES-FILL")
        db.add(s)
        await db.flush()
        sid = s.id
        client = Client(studio_id=sid, name="C")
        db.add(client)
        await db.flush()
        # 1 операция в средний день 3-дневного периода — края периода должны
        # прийти нулями, а не выпасть из массива.
        db.add(Operation(
            studio_id=sid, type="in", title="Sub", amount=1000,
            op_date=date(2026, 3, 2), category="subscriptions", method="card",
        ))
        await db.commit()
        return sid


async def _cleanup(sid: int) -> None:
    async with async_session_maker() as db:
        await db.execute(delete(Operation).where(Operation.studio_id == sid))
        await db.execute(delete(Client).where(Client.studio_id == sid))
        await db.execute(delete(Studio).where(Studio.id == sid))
        await db.commit()


async def _run():
    sid = await _seed()
    ctx = StudioContext(user=None, studio_id=sid, role="owner")
    try:
        # 3 дня, 1 операция в среднем дне → 3 точки, нули по краям (не сжимается до 1).
        f = ReportFilters(
            date_from=date(2026, 3, 1), date_to=date(2026, 3, 3),
            branch_id=None, hall_id=None, trainer_id=None, service_id=None,
        )
        async with async_session_maker() as db:
            revenue = await metric_series(metric="revenue", group="day", f=f, ctx=ctx, db=db)
        assert [p.period for p in revenue] == ["2026-03-01", "2026-03-02", "2026-03-03"], revenue
        assert [p.value for p in revenue] == [0.0, 1000.0, 0.0], revenue

        # пустой период (нет ни одной операции вообще) → нули полной длины, не [].
        f_empty = ReportFilters(
            date_from=date(2020, 1, 1), date_to=date(2020, 1, 3),
            branch_id=None, hall_id=None, trainer_id=None, service_id=None,
        )
        async with async_session_maker() as db:
            empty = await metric_series(metric="expenses", group="day", f=f_empty, ctx=ctx, db=db)
        assert len(empty) == 3 and all(p.value == 0.0 for p in empty), empty

        # hour на одном дне → 18 точек. attendance берёт время из Lesson.start_time
        # (не Operation.op_date, который без времени суток — см. R6 задача 3).
        f_hour = ReportFilters(
            date_from=date(2026, 3, 2), date_to=date(2026, 3, 2),
            branch_id=None, hall_id=None, trainer_id=None, service_id=None,
        )
        async with async_session_maker() as db:
            hourly = await metric_series(metric="attendance", group="hour", f=f_hour, ctx=ctx, db=db)
        assert len(hourly) == 18, len(hourly)
    finally:
        await _cleanup(sid)


def test_analytics_series_fill():
    test_series_buckets_day()
    test_series_buckets_week_mondays()
    test_series_buckets_hour_18_slots()
    test_bucket_key_matches_series_buckets()
    asyncio.run(_run())


if __name__ == "__main__":
    test_analytics_series_fill()
    print("ALL PASS")
