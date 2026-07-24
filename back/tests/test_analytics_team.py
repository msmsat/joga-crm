"""EPIC R4 задача 1: GET /analytics/team. Реальная БД, ручная чистка.
Запуск из back/:  python -m tests.test_analytics_team
"""
import asyncio
import warnings
from datetime import date, datetime, timedelta

warnings.filterwarnings("ignore")

from sqlalchemy import delete, select

from database import async_session_maker
from dependencies import StudioContext
from models import Client, Lesson, Operation, Reservation, Studio, User
from routers.analytics.team import analytics_team
from routers.analytics._filters import ReportFilters


async def _seed() -> tuple[int, int, int]:
    async with async_session_maker() as db:
        s = Studio(name="TEST-TEAM-REPORT"); db.add(s); await db.flush()
        sid = s.id
        today = date.today()

        trainer = User(email="trainer-team-test@x.com", hashed_password="x", name="Anna", last_name="Yudina")
        db.add(trainer); await db.flush()
        tid = trainer.id

        client = Client(studio_id=sid, name="Client")
        db.add(client); await db.flush()
        cid = client.id

        # attended lesson: 8 spots, 6 occupied (5 attended + 1 active), rated 5 and 3 (avg 4.0, 2 votes < threshold 10).
        lesson_ok = Lesson(
            studio_id=sid, name="Pilates", teacher_name="Anna", teacher_id=tid,
            start_time=datetime.combine(today - timedelta(days=3), datetime.min.time()),
            duration_min=60, price=1000, level="all", equipment="mat", total_spots=8, status="confirmed",
        )
        # cancelled lesson: excluded from fill/hours, counted in cancels + lessons_count.
        lesson_cancelled = Lesson(
            studio_id=sid, name="Yoga", teacher_name="Anna", teacher_id=tid,
            start_time=datetime.combine(today - timedelta(days=2), datetime.min.time()),
            duration_min=60, price=1000, level="all", equipment="mat", total_spots=8, status="cancelled",
        )
        # noshow lesson: active reservation, lesson already ended (yesterday).
        lesson_noshow = Lesson(
            studio_id=sid, name="Stretch", teacher_name="Anna", teacher_id=tid,
            start_time=datetime.combine(today - timedelta(days=1), datetime.min.time()),
            duration_min=60, price=1000, level="all", equipment="mat", total_spots=8, status="confirmed",
        )
        db.add_all([lesson_ok, lesson_cancelled, lesson_noshow]); await db.flush()

        db.add_all([
            Reservation(client_id=cid, lesson_id=lesson_ok.id, spot_number=1, status="attended", rating=5),
            Reservation(client_id=cid, lesson_id=lesson_ok.id, spot_number=2, status="attended", rating=3),
            Reservation(client_id=cid, lesson_id=lesson_ok.id, spot_number=3, status="active"),
            Reservation(client_id=cid, lesson_id=lesson_cancelled.id, spot_number=1, status="cancelled"),
            Reservation(client_id=cid, lesson_id=lesson_noshow.id, spot_number=1, status="active"),
        ])

        db.add(Operation(
            studio_id=sid, client_id=None, product_id=None, trainer_id=tid,
            type="in", title="Занятие", amount=5000, op_date=today - timedelta(days=3),
            category="services", method="cash",
        ))
        await db.commit()
        return sid, tid, lesson_ok.id


async def _cleanup(sid: int, tid: int) -> None:
    async with async_session_maker() as db:
        lids = (await db.execute(select(Lesson.id).where(Lesson.studio_id == sid))).scalars().all()
        if lids:
            await db.execute(delete(Reservation).where(Reservation.lesson_id.in_(lids)))
        await db.execute(delete(Operation).where(Operation.studio_id == sid))
        await db.execute(delete(Lesson).where(Lesson.studio_id == sid))
        await db.execute(delete(Client).where(Client.studio_id == sid))
        await db.execute(delete(Studio).where(Studio.id == sid))
        await db.execute(delete(User).where(User.id == tid))
        await db.commit()


async def _run():
    sid, tid, _lesson_ok_id = await _seed()
    try:
        today = date.today()
        f = ReportFilters(
            date_from=today - timedelta(days=10), date_to=today,
            branch_id=None, hall_id=None, trainer_id=None, service_id=None,
        )
        ctx = StudioContext(user=None, studio_id=sid, role="owner")
        async with async_session_maker() as db:
            r = await analytics_team(f=f, ctx=ctx, db=db)

        assert r.kpi.lessons_count.value == 3, r.kpi.lessons_count.value  # 3 lessons incl. cancelled

        trainer_rows = [t for t in r.trainers if t.trainer_id == tid]
        assert len(trainer_rows) == 1, r.trainers
        row = trainer_rows[0]
        assert row.name == "Anna Yudina", row.name
        assert row.lessons == 3, row.lessons
        assert row.cancels == 1, row.cancels
        # noshow_cond has no lesson-status filter beyond "ended" — both lesson_ok's
        # spot_number=3 active reservation and lesson_noshow's active reservation
        # qualify (each is an active reservation on an already-ended lesson).
        assert row.noshows == 2, row.noshows
        # fill_pct: active lessons only (lesson_ok 3/8 + lesson_noshow 1/8) = 4/16 = 25%
        assert row.fill_pct == 25.0, row.fill_pct
        assert row.attendance == 2, row.attendance  # 2 attended reservations in lesson_ok
        assert row.revenue == 5000, row.revenue
        assert row.rating == 4.0, row.rating  # avg(5,3)

        # low_rating insight requires >=10 votes — only 2 votes here, must NOT fire.
        low_rating_insights = [i for i in r.insights if i.key == "low_rating"]
        assert low_rating_insights == [], r.insights
    finally:
        await _cleanup(sid, tid)


def test_analytics_team():
    asyncio.run(_run())


if __name__ == "__main__":
    test_analytics_team()
    print("ALL PASS")
