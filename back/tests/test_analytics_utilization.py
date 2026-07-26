"""EPIC R5 задача 1-2: GET /analytics/utilization, GET /analytics/utilization/slot.
EPIC R14: разрезы отмен/неявок (losses) по часу/услуге/тренеру — сходимость с KPI.
Реальная БД, ручная чистка. Запуск из back/:  python -m tests.test_analytics_utilization
"""
import asyncio
import warnings
from datetime import date, datetime, timedelta

warnings.filterwarnings("ignore")

from sqlalchemy import delete, select

from database import async_session_maker, engine
from dependencies import StudioContext
from models import Client, Hall, Lesson, Reservation, Studio, User
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
        # Пул asyncpg привязан к текущему event loop: без dispose() следующий
        # asyncio.run() в этом же процессе (второй test_* файла — так их зовёт
        # pytest) унаследует мёртвый пул. Тот же приём в test_analytics_team.py.
        await engine.dispose()


def test_analytics_utilization():
    asyncio.run(_run())


async def _seed_losses() -> tuple[int, int, int]:
    async with async_session_maker() as db:
        s = Studio(name="TEST-UTILIZATION-LOSSES"); db.add(s); await db.flush()
        sid = s.id

        t1 = User(email="losses-t1@x.com", hashed_password="x", name="Anna", last_name="Petrova")
        t2 = User(email="losses-t2@x.com", hashed_password="x", name="Boris", last_name="Orlov")
        db.add_all([t1, t2]); await db.flush()
        t1_id, t2_id = t1.id, t2.id

        client = Client(studio_id=sid, name="Client")
        db.add(client); await db.flush()
        cid = client.id

        today = date.today()
        # cancelled, no reservations at all — must still show up via total_spots.
        lesson_a = Lesson(
            studio_id=sid, name="Pilates", teacher_name="Anna", teacher_id=t1_id,
            start_time=datetime.combine(today - timedelta(days=10), datetime.min.time()).replace(hour=8),
            duration_min=60, price=1000, level="all", equipment="mat", total_spots=8, status="cancelled",
        )
        # cancelled, different trainer/hour/name — no reservations either.
        lesson_b = Lesson(
            studio_id=sid, name="Yoga", teacher_name="Boris", teacher_id=t2_id,
            start_time=datetime.combine(today - timedelta(days=9), datetime.min.time()).replace(hour=19),
            duration_min=60, price=1000, level="all", equipment="mat", total_spots=6, status="cancelled",
        )
        # ended, not cancelled: 2 active reservations (noshow) + 1 attended (not a noshow),
        # same hour as lesson_b and same trainer as lesson_a — exercises the by_hour/by_trainer merge.
        lesson_c = Lesson(
            studio_id=sid, name="Stretch", teacher_name="Anna", teacher_id=t1_id,
            start_time=datetime.combine(today - timedelta(days=8), datetime.min.time()).replace(hour=19),
            duration_min=60, price=1000, level="all", equipment="mat", total_spots=8, status="confirmed",
        )
        db.add_all([lesson_a, lesson_b, lesson_c]); await db.flush()

        db.add_all([
            Reservation(client_id=cid, lesson_id=lesson_c.id, spot_number=1, status="active"),
            Reservation(client_id=cid, lesson_id=lesson_c.id, spot_number=2, status="active"),
            Reservation(client_id=cid, lesson_id=lesson_c.id, spot_number=3, status="attended"),
        ])
        await db.commit()
        return sid, t1_id, t2_id


async def _cleanup_losses(sid: int, t1_id: int, t2_id: int) -> None:
    async with async_session_maker() as db:
        lids = (await db.execute(select(Lesson.id).where(Lesson.studio_id == sid))).scalars().all()
        if lids:
            await db.execute(delete(Reservation).where(Reservation.lesson_id.in_(lids)))
        await db.execute(delete(Lesson).where(Lesson.studio_id == sid))
        await db.execute(delete(Client).where(Client.studio_id == sid))
        await db.execute(delete(Studio).where(Studio.id == sid))
        await db.execute(delete(User).where(User.id.in_([t1_id, t2_id])))
        await db.commit()


async def _run_losses():
    sid, t1_id, t2_id = await _seed_losses()
    try:
        today = date.today()
        f = ReportFilters(
            date_from=today - timedelta(days=30), date_to=today,
            branch_id=None, hall_id=None, trainer_id=None, service_id=None,
        )
        ctx = StudioContext(user=None, studio_id=sid, role="owner")
        async with async_session_maker() as db:
            r = await analytics_utilization(f=f, ctx=ctx, db=db)

        assert r.kpi.cancels.value == 2, r.kpi.cancels.value
        assert r.kpi.noshows.value == 2, r.kpi.noshows.value

        # 1-2. Σ по каждому из трёх разрезов сходится с KPI шапки — главный тест эпика.
        for rows in (r.losses.by_hour, r.losses.by_service, r.losses.by_trainer):
            assert sum(row.cancels for row in rows) == r.kpi.cancels.value, (rows, r.kpi.cancels.value)
            assert sum(row.noshows for row in rows) == r.kpi.noshows.value, (rows, r.kpi.noshows.value)

        # 3. Отменённое занятие без единой брони всё равно попадает в разрез (по total_spots).
        by_service = {row.label: row for row in r.losses.by_service}
        assert by_service["Pilates"].cancels == 1 and by_service["Pilates"].lost_spots == 8, by_service["Pilates"]
        assert by_service["Yoga"].cancels == 1 and by_service["Yoga"].lost_spots == 6, by_service["Yoga"]

        # 4. Фильтр trainer_id → в by_trainer остаётся одна строка (тренер B отфильтрован целиком).
        f_t1 = ReportFilters(**{**vars(f), "trainer_id": t1_id})
        async with async_session_maker() as db:
            r_t1 = await analytics_utilization(f=f_t1, ctx=ctx, db=db)
        assert len(r_t1.losses.by_trainer) == 1, r_t1.losses.by_trainer
        assert r_t1.losses.by_trainer[0].ref_id == t1_id
        assert r_t1.kpi.cancels.value == 1, r_t1.kpi.cancels.value  # только lesson_a
        assert r_t1.kpi.noshows.value == 2, r_t1.kpi.noshows.value  # только lesson_c

        # 5. Период без потерь → все три списка пусты, 200 (не 500, не null).
        f_empty = ReportFilters(
            date_from=today - timedelta(days=400), date_to=today - timedelta(days=100),
            branch_id=None, hall_id=None, trainer_id=None, service_id=None,
        )
        async with async_session_maker() as db:
            r_empty = await analytics_utilization(f=f_empty, ctx=ctx, db=db)
        assert r_empty.losses.by_hour == [], r_empty.losses.by_hour
        assert r_empty.losses.by_service == [], r_empty.losses.by_service
        assert r_empty.losses.by_trainer == [], r_empty.losses.by_trainer
    finally:
        await _cleanup_losses(sid, t1_id, t2_id)
        await engine.dispose()


def test_analytics_losses():
    asyncio.run(_run_losses())


if __name__ == "__main__":
    test_analytics_utilization()
    test_analytics_losses()
    print("ALL PASS")
