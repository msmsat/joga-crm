"""EPIC R4 задача 1: GET /analytics/team. Реальная БД, ручная чистка.
Запуск из back/:  python -m tests.test_analytics_team
"""
import asyncio
import warnings
from datetime import date, datetime, time, timedelta

warnings.filterwarnings("ignore")

from sqlalchemy import delete, select

from database import async_session_maker, engine
from dependencies import StudioContext
from models import Client, Lesson, Operation, Reservation, Studio, StudioMember, User
from routers.analytics.team import analytics_team, analytics_team_trainer_detail
from routers.analytics._filters import ReportFilters, SERIES_DAY_HOURS


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
        # cancelled lesson: excluded from fill/hours/lessons_count, counted only in cancels.
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

        assert r.kpi.lessons_count.value == 2, r.kpi.lessons_count.value  # 2 live lessons, cancelled excluded

        trainer_rows = [t for t in r.trainers if t.trainer_id == tid]
        assert len(trainer_rows) == 1, r.trainers
        row = trainer_rows[0]
        assert row.name == "Anna Yudina", row.name
        assert row.lessons == 2, row.lessons  # cancelled excluded, tracked separately via row.cancels
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
        # Движок — модульный синглтон с пулом asyncpg-соединений, которые
        # привязаны к текущему event loop. Без dispose() следующий asyncio.run()
        # в этом же процессе (второй test_* в файле) унаследует мёртвый пул
        # от уже закрытого loop и упадёт на "Event loop is closed".
        await engine.dispose()


def test_analytics_team():
    asyncio.run(_run())


# EPIC R16 задача 4: GET /analytics/team/{id} — load_by_hour.
async def _seed_hourly() -> tuple[int, int, int]:
    """studio_id, tid (2 занятия: 19:00 и 07:00), idle_tid (0 занятий)."""
    async with async_session_maker() as db:
        s = Studio(name="TEST-TEAM-HOURLY"); db.add(s); await db.flush()
        sid = s.id
        today = date.today()

        trainer = User(email="trainer-hourly-test@x.com", hashed_password="x", name="Hour", last_name="Tester")
        idle = User(email="trainer-hourly-idle-test@x.com", hashed_password="x", name="Idle", last_name="Tester")
        db.add_all([trainer, idle]); await db.flush()
        tid, idle_tid = trainer.id, idle.id
        db.add_all([
            StudioMember(studio_id=sid, user_id=tid, role="trainer"),
            StudioMember(studio_id=sid, user_id=idle_tid, role="trainer"),
        ])

        client = Client(studio_id=sid, name="Client"); db.add(client); await db.flush()
        cid = client.id

        lesson_evening = Lesson(
            studio_id=sid, name="Pilates", teacher_name="Hour", teacher_id=tid,
            start_time=datetime.combine(today - timedelta(days=3), time(19, 0)),
            duration_min=60, price=1000, level="all", equipment="mat", total_spots=8, status="confirmed",
        )
        lesson_morning = Lesson(
            studio_id=sid, name="Yoga", teacher_name="Hour", teacher_id=tid,
            start_time=datetime.combine(today - timedelta(days=2), time(7, 0)),
            duration_min=60, price=1000, level="all", equipment="mat", total_spots=6, status="confirmed",
        )
        db.add_all([lesson_evening, lesson_morning]); await db.flush()

        db.add(Reservation(client_id=cid, lesson_id=lesson_evening.id, spot_number=1, status="active"))
        await db.commit()
        return sid, tid, idle_tid


async def _cleanup_hourly(sid: int, tid: int, idle_tid: int) -> None:
    async with async_session_maker() as db:
        lids = (await db.execute(select(Lesson.id).where(Lesson.studio_id == sid))).scalars().all()
        if lids:
            await db.execute(delete(Reservation).where(Reservation.lesson_id.in_(lids)))
        await db.execute(delete(Lesson).where(Lesson.studio_id == sid))
        await db.execute(delete(Client).where(Client.studio_id == sid))
        await db.execute(delete(StudioMember).where(StudioMember.studio_id == sid))
        await db.execute(delete(Studio).where(Studio.id == sid))
        await db.execute(delete(User).where(User.id.in_([tid, idle_tid])))
        await db.commit()


async def _run_hourly():
    sid, tid, idle_tid = await _seed_hourly()
    try:
        today = date.today()
        f = ReportFilters(
            date_from=today - timedelta(days=10), date_to=today,
            branch_id=None, hall_id=None, trainer_id=None, service_id=None,
        )
        ctx = StudioContext(user=None, studio_id=sid, role="owner")

        async with async_session_maker() as db:
            detail = await analytics_team_trainer_detail(id=tid, f=f, ctx=ctx, db=db)

        # Полная ось (R6): 6..23 всегда, независимо от того, где реально есть занятия.
        assert len(detail.load_by_hour) == len(SERIES_DAY_HOURS), detail.load_by_hour

        by_hour = {p.hour: p for p in detail.load_by_hour}
        assert by_hour[19].lessons == 1, by_hour[19]  # lesson_evening
        assert by_hour[18].lessons == 0, by_hour[18]  # соседний час пуст
        assert by_hour[20].lessons == 0, by_hour[20]  # соседний час пуст
        assert by_hour[7].lessons == 1, by_hour[7]  # lesson_morning

        # Оба занятия попадают в окно 6..23 — суммы часового и дневного разрезов совпадают.
        assert sum(p.lessons for p in detail.load_by_hour) == sum(p.lessons for p in detail.load_by_weekday), (
            detail.load_by_hour, detail.load_by_weekday,
        )

        async with async_session_maker() as db:
            idle_detail = await analytics_team_trainer_detail(id=idle_tid, f=f, ctx=ctx, db=db)
        assert len(idle_detail.load_by_hour) == len(SERIES_DAY_HOURS), idle_detail.load_by_hour
        assert all(p.lessons == 0 for p in idle_detail.load_by_hour), idle_detail.load_by_hour
        assert all(p.fill_pct == 0.0 for p in idle_detail.load_by_hour), idle_detail.load_by_hour
    finally:
        await _cleanup_hourly(sid, tid, idle_tid)
        await engine.dispose()


def test_analytics_team_trainer_hourly_load():
    asyncio.run(_run_hourly())


# P1 ревью третьей волны: до фикса _revenue_by_trainer собирал WHERE вручную и
# фильтр вкладки к выручке не применялся — в таблице появлялись посторонние
# тренеры (union lesson_stats | revenue), а revenue_per_hour делил выручку всей
# студии на часы одного тренера.
async def _seed_two_trainers() -> tuple[int, int, int]:
    """studio_id, tid_a (1 занятие 1ч + 5000), tid_b (1 занятие 1ч + 3000)."""
    async with async_session_maker() as db:
        s = Studio(name="TEST-TEAM-FILTERS"); db.add(s); await db.flush()
        sid = s.id
        today = date.today()

        a = User(email="trainer-filters-a-test@x.com", hashed_password="x", name="Anna", last_name="A")
        b = User(email="trainer-filters-b-test@x.com", hashed_password="x", name="Boris", last_name="B")
        db.add_all([a, b]); await db.flush()
        tid_a, tid_b = a.id, b.id
        db.add_all([
            StudioMember(studio_id=sid, user_id=tid_a, role="trainer"),
            StudioMember(studio_id=sid, user_id=tid_b, role="trainer"),
        ])

        for tid, name in ((tid_a, "Anna"), (tid_b, "Boris")):
            db.add(Lesson(
                studio_id=sid, name="Pilates", teacher_name=name, teacher_id=tid,
                start_time=datetime.combine(today - timedelta(days=3), time(10, 0)),
                duration_min=60, price=1000, level="all", equipment="mat", total_spots=8, status="confirmed",
            ))
        db.add_all([
            Operation(studio_id=sid, client_id=None, product_id=None, trainer_id=tid_a,
                      type="in", title="Занятие", amount=5000, op_date=today - timedelta(days=3),
                      category="services", method="cash"),
            Operation(studio_id=sid, client_id=None, product_id=None, trainer_id=tid_b,
                      type="in", title="Занятие", amount=3000, op_date=today - timedelta(days=3),
                      category="services", method="cash"),
        ])
        await db.commit()
        return sid, tid_a, tid_b


async def _cleanup_two_trainers(sid: int, tid_a: int, tid_b: int) -> None:
    """Как _cleanup_hourly, но здесь есть Operation с trainer_id — без её чистки
    удаление User упрётся в FK."""
    async with async_session_maker() as db:
        await db.execute(delete(Operation).where(Operation.studio_id == sid))
        await db.execute(delete(Lesson).where(Lesson.studio_id == sid))
        await db.execute(delete(StudioMember).where(StudioMember.studio_id == sid))
        await db.execute(delete(Studio).where(Studio.id == sid))
        await db.execute(delete(User).where(User.id.in_([tid_a, tid_b])))
        await db.commit()


async def _run_filters():
    sid, tid_a, tid_b = await _seed_two_trainers()
    try:
        today = date.today()
        ctx = StudioContext(user=None, studio_id=sid, role="owner")
        base = dict(date_from=today - timedelta(days=10), date_to=today,
                    branch_id=None, hall_id=None, service_id=None)

        async with async_session_maker() as db:
            both = await analytics_team(f=ReportFilters(trainer_id=None, **base), ctx=ctx, db=db)
        assert {t.trainer_id for t in both.trainers} == {tid_a, tid_b}, both.trainers
        # 8000 / 2 часа — без фильтра поведение не меняется.
        assert both.kpi.revenue_per_hour.value == 4000.0, both.kpi.revenue_per_hour

        async with async_session_maker() as db:
            only_a = await analytics_team(f=ReportFilters(trainer_id=tid_a, **base), ctx=ctx, db=db)
        assert [t.trainer_id for t in only_a.trainers] == [tid_a], only_a.trainers
        assert only_a.trainers[0].revenue == 5000, only_a.trainers[0]
        # Выручка Анны на её же час, а не 8000/1: числитель и знаменатель одного охвата.
        assert only_a.kpi.revenue_per_hour.value == 5000.0, only_a.kpi.revenue_per_hour
    finally:
        await _cleanup_two_trainers(sid, tid_a, tid_b)
        await engine.dispose()


def test_analytics_team_filters():
    asyncio.run(_run_filters())


if __name__ == "__main__":
    test_analytics_team()
    test_analytics_team_trainer_hourly_load()
    test_analytics_team_filters()
    print("ALL PASS")
