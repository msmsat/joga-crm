"""GET /analytics/series — R1 задача 2: profit/attendance/fill_rate метрики.
Реальная БД, чистим тестовые строки явно.
Запуск из back/:  python -m tests.test_analytics_series
"""
import asyncio
import warnings
from datetime import date, datetime

warnings.filterwarnings("ignore")

from sqlalchemy import delete, select

from database import async_session_maker
from dependencies import StudioContext
from models import Client, Hall, Lesson, Operation, Reservation, Studio
from routers.analytics._filters import ReportFilters
from routers.analytics.reports import metric_series


async def _seed() -> tuple[int, int]:
    async with async_session_maker() as db:
        s = Studio(name="TEST-SERIES")
        db.add(s)
        await db.flush()
        sid = s.id

        hall = Hall(studio_id=sid, name="Hall A", capacity=4)
        db.add(hall)
        await db.flush()
        hall_id = hall.id

        client = Client(studio_id=sid, name="C1", is_active=True, status="active")
        db.add(client)
        await db.flush()

        db.add(Operation(studio_id=sid, type="in", title="Sub", amount=1000, op_date=date(2026, 1, 20), category="subscriptions", method="card"))
        db.add(Operation(studio_id=sid, type="out", title="Rent", amount=300, op_date=date(2026, 1, 20), category="rent", method="card"))

        # 2 занятия одного дня: 2/2 и 1/2 занятости — суммарно 3/4 = 75%
        l1 = Lesson(studio_id=sid, name="Yoga", teacher_name="T", hall_id=hall_id, start_time=datetime(2026, 1, 20, 9, 0), total_spots=2, price=500, level="beginner", equipment="none")
        l2 = Lesson(studio_id=sid, name="Yoga", teacher_name="T", hall_id=hall_id, start_time=datetime(2026, 1, 20, 11, 0), total_spots=2, price=500, level="beginner", equipment="none")
        db.add_all([l1, l2])
        await db.flush()

        db.add(Reservation(client_id=client.id, lesson_id=l1.id, spot_number=1, status="attended"))
        db.add(Reservation(client_id=client.id, lesson_id=l1.id, spot_number=2, status="attended"))
        db.add(Reservation(client_id=client.id, lesson_id=l2.id, spot_number=1, status="attended"))

        await db.commit()
        return sid, hall_id


async def _cleanup(sid: int) -> None:
    async with async_session_maker() as db:
        client_ids = (await db.execute(select(Client.id).where(Client.studio_id == sid))).scalars().all()
        if client_ids:
            await db.execute(delete(Reservation).where(Reservation.client_id.in_(client_ids)))
        await db.execute(delete(Lesson).where(Lesson.studio_id == sid))
        await db.execute(delete(Hall).where(Hall.studio_id == sid))
        await db.execute(delete(Operation).where(Operation.studio_id == sid))
        await db.execute(delete(Client).where(Client.studio_id == sid))
        await db.execute(delete(Studio).where(Studio.id == sid))
        await db.commit()


async def _run():
    sid, hall_id = await _seed()
    ctx = StudioContext(user=None, studio_id=sid, role="owner")
    try:
        f = ReportFilters(
            date_from=date(2026, 1, 20), date_to=date(2026, 1, 20),
            branch_id=None, hall_id=None, trainer_id=None, service_id=None,
        )

        async with async_session_maker() as db:
            profit = await metric_series(metric="profit", group="day", f=f, ctx=ctx, db=db)
        assert len(profit) == 1 and profit[0].value == 700.0, profit

        async with async_session_maker() as db:
            attendance = await metric_series(metric="attendance", group="day", f=f, ctx=ctx, db=db)
        assert len(attendance) == 1 and attendance[0].value == 3.0, attendance

        async with async_session_maker() as db:
            fill = await metric_series(metric="fill_rate", group="day", f=f, ctx=ctx, db=db)
        assert len(fill) == 1 and fill[0].value == 75.0, fill

        # backward-compat: старые метрики без новых фильтров всё ещё работают
        async with async_session_maker() as db:
            revenue = await metric_series(metric="revenue", group="day", f=f, ctx=ctx, db=db)
        assert len(revenue) == 1 and revenue[0].value == 1000.0, revenue

        # фильтр hall_id, не совпадающий ни с одним залом → пустая серия, не 500
        f_other_hall = ReportFilters(
            date_from=date(2026, 1, 20), date_to=date(2026, 1, 20),
            branch_id=None, hall_id=hall_id + 999, trainer_id=None, service_id=None,
        )
        async with async_session_maker() as db:
            empty = await metric_series(metric="fill_rate", group="day", f=f_other_hall, ctx=ctx, db=db)
        assert empty == [], empty
    finally:
        await _cleanup(sid)


def test_analytics_series():
    asyncio.run(_run())


if __name__ == "__main__":
    test_analytics_series()
    print("ALL PASS")
