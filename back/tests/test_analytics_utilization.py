"""EPIC R5 задача 1-2: GET /analytics/utilization, GET /analytics/utilization/slot.
Реальная БД, ручная чистка. Запуск из back/:  python -m tests.test_analytics_utilization
"""
import asyncio
import warnings
from datetime import date, datetime, timedelta

warnings.filterwarnings("ignore")

from sqlalchemy import delete, select

from database import async_session_maker
from dependencies import StudioContext
from models import Client, Hall, Lesson, Reservation, Studio
from routers.analytics.utilization import analytics_utilization, analytics_utilization_slot
from routers.analytics._filters import ReportFilters


async def _seed() -> tuple[int, int, int]:
    async with async_session_maker() as db:
        s = Studio(name="TEST-UTILIZATION-REPORT"); db.add(s); await db.flush()
        sid = s.id

        hall = Hall(studio_id=sid, name="Zal 1", capacity=8)
        db.add(hall); await db.flush()
        hid = hall.id

        client = Client(studio_id=sid, name="Client")
        db.add(client); await db.flush()
        cid = client.id

        # Past lesson (mon 10:00, 2 days ago via nearest past monday), 8 spots, 4 occupied
        # (2 attended + 1 active + 1 noshow-eligible active on an ended lesson), price 1000.
        today = date.today()
        past_monday = today - timedelta(days=today.weekday() + 7)  # a monday well in the past
        lesson = Lesson(
            studio_id=sid, name="Pilates", teacher_name="Anna", hall_id=hid,
            start_time=datetime.combine(past_monday, datetime.min.time()).replace(hour=10),
            duration_min=60, price=1000, level="all", equipment="mat", total_spots=8, status="confirmed",
        )
        db.add(lesson); await db.flush()
        lid = lesson.id

        db.add_all([
            Reservation(client_id=cid, lesson_id=lid, spot_number=1, status="attended"),
            Reservation(client_id=cid, lesson_id=lid, spot_number=2, status="attended"),
            Reservation(client_id=cid, lesson_id=lid, spot_number=3, status="active"),  # noshow: lesson ended
        ])
        await db.commit()
        return sid, hid, lid


async def _cleanup(sid: int) -> None:
    async with async_session_maker() as db:
        lids = (await db.execute(select(Lesson.id).where(Lesson.studio_id == sid))).scalars().all()
        if lids:
            await db.execute(delete(Reservation).where(Reservation.lesson_id.in_(lids)))
        await db.execute(delete(Lesson).where(Lesson.studio_id == sid))
        await db.execute(delete(Client).where(Client.studio_id == sid))
        await db.execute(delete(Hall).where(Hall.studio_id == sid))
        await db.execute(delete(Studio).where(Studio.id == sid))
        await db.commit()


async def _run():
    sid, hid, lid = await _seed()
    try:
        today = date.today()
        f = ReportFilters(
            date_from=today - timedelta(days=60), date_to=today,
            branch_id=None, hall_id=None, trainer_id=None, service_id=None,
        )
        ctx = StudioContext(user=None, studio_id=sid, role="owner")
        async with async_session_maker() as db:
            r = await analytics_utilization(f=f, ctx=ctx, db=db)

        # fill: 3 occupied (2 attended + 1 active) / 8 capacity = 37.5%
        assert r.kpi.avg_fill_pct.value == 37.5, r.kpi.avg_fill_pct.value
        assert r.kpi.free_spots.value == 5, r.kpi.free_spots.value  # 8 - 3
        assert r.kpi.cancels.value == 0, r.kpi.cancels.value
        assert r.kpi.noshows.value == 1, r.kpi.noshows.value  # active reservation on ended lesson
        # lost_revenue: free spots (5) x price (1000) on the one past uncancelled lesson.
        assert r.kpi.lost_revenue.value == 5000, r.kpi.lost_revenue.value

        assert len(r.heatmap) == 1, r.heatmap
        cell = r.heatmap[0]
        assert cell.weekday == 1, cell.weekday  # isodow monday = 1
        assert cell.hour == 10, cell.hour
        assert cell.fill_pct == 37.5, cell.fill_pct
        assert cell.attendance == 2, cell.attendance

        assert len(r.top_profitable) == 1, r.top_profitable
        assert r.top_profitable[0].revenue == 2000, r.top_profitable[0].revenue  # 2 attended x 1000
        assert r.top_profitable[0].name == "Pilates", r.top_profitable[0].name

        assert len(r.halls) == 1, r.halls
        assert r.halls[0].hall_id == hid, r.halls[0]
        assert r.halls[0].fill_pct == 37.5, r.halls[0]

        async with async_session_maker() as db:
            slot = await analytics_utilization_slot(weekday=1, hour=10, f=f, ctx=ctx, db=db)
        assert len(slot) == 1, slot
        assert slot[0].id == lid, slot[0]
        assert slot[0].occupied == 3, slot[0]
        assert slot[0].hall == "Zal 1", slot[0]
    finally:
        await _cleanup(sid)


def test_analytics_utilization():
    asyncio.run(_run())


if __name__ == "__main__":
    test_analytics_utilization()
    print("ALL PASS")
