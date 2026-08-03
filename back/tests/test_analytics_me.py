"""GET /analytics/me — KPI Дашборда админа и тренера. Реальная БД, ручная чистка.
Запуск из back/:  python -m tests.test_analytics_me
"""
import asyncio
import warnings
from datetime import date, datetime, time, timedelta

warnings.filterwarnings("ignore")

from sqlalchemy import delete, select

from database import async_session_maker, engine
from dependencies import StudioContext
from models import Client, Lesson, Reservation, Studio, StudioMember, User
from routers.analytics.personal import my_summary


async def _seed() -> tuple[int, int, int]:
    """studio_id, uid тренера A, uid тренера B (его занятия в срез A попадать не должны)."""
    async with async_session_maker() as db:
        s = Studio(name="TEST-ANALYTICS-ME"); db.add(s); await db.flush()
        sid = s.id
        today = date.today()

        a = User(email="trainer-a-me-test@x.com", hashed_password="x", name="Anna")
        b = User(email="trainer-b-me-test@x.com", hashed_password="x", name="Boris")
        db.add_all([a, b]); await db.flush()
        uid_a, uid_b = a.id, b.id
        db.add_all([
            StudioMember(studio_id=sid, user_id=uid_a, role="trainer", name="Anna"),
            StudioMember(studio_id=sid, user_id=uid_b, role="trainer", name="Boris"),
        ])

        c1 = Client(studio_id=sid, name="C1")
        c2 = Client(studio_id=sid, name="C2")
        db.add_all([c1, c2]); await db.flush()

        def _lesson(teacher_id, name, days_ago, status="confirmed"):
            return Lesson(
                studio_id=sid, name=name, teacher_name=name, teacher_id=teacher_id,
                start_time=datetime.combine(today - timedelta(days=days_ago), time(10, 0)),
                duration_min=60, price=1000, level="all", equipment="mat",
                total_spots=10, status=status,
            )

        a_live = _lesson(uid_a, "Pilates", 3)
        a_cancelled = _lesson(uid_a, "Yoga", 2, status="cancelled")
        b_live = _lesson(uid_b, "Stretch", 3)
        db.add_all([a_live, a_cancelled, b_live]); await db.flush()

        db.add_all([
            # У A: занято 3 из 10, посещений 2, оценки 5 и 3 → средняя 4.0
            Reservation(client_id=c1.id, lesson_id=a_live.id, spot_number=1, status="attended", rating=5),
            Reservation(client_id=c2.id, lesson_id=a_live.id, spot_number=2, status="attended", rating=3),
            Reservation(client_id=c1.id, lesson_id=a_live.id, spot_number=3, status="active"),
            # Отменённое занятие в срез не идёт ни одним показателем
            Reservation(client_id=c1.id, lesson_id=a_cancelled.id, spot_number=1, status="cancelled"),
            # У B: занято 1 из 10 — в срезе тренера A этого быть не должно
            Reservation(client_id=c1.id, lesson_id=b_live.id, spot_number=1, status="attended"),
        ])
        await db.commit()
        return sid, uid_a, uid_b


async def _cleanup(sid: int, uid_a: int, uid_b: int) -> None:
    async with async_session_maker() as db:
        lids = (await db.execute(select(Lesson.id).where(Lesson.studio_id == sid))).scalars().all()
        if lids:
            await db.execute(delete(Reservation).where(Reservation.lesson_id.in_(lids)))
        await db.execute(delete(Lesson).where(Lesson.studio_id == sid))
        await db.execute(delete(Client).where(Client.studio_id == sid))
        await db.execute(delete(StudioMember).where(StudioMember.studio_id == sid))
        await db.execute(delete(Studio).where(Studio.id == sid))
        await db.execute(delete(User).where(User.id.in_([uid_a, uid_b])))
        await db.commit()


async def _run():
    sid, uid_a, uid_b = await _seed()
    try:
        today = date.today()
        d_from, d_to = today - timedelta(days=10), today

        async with async_session_maker() as db:
            trainer = (await db.execute(select(User).where(User.id == uid_a))).scalar_one()
            r_trainer = await my_summary(
                date_from=d_from, date_to=d_to,
                ctx=StudioContext(user=trainer, studio_id=sid, role="trainer"), db=db,
            )
            r_admin = await my_summary(
                date_from=d_from, date_to=d_to,
                ctx=StudioContext(user=None, studio_id=sid, role="admin"), db=db,
            )

        t = {k.id: k.value for k in r_trainer.kpi}
        assert r_trainer.role == "trainer", r_trainer.role
        assert set(t) == {"lessons", "attendance", "fill_rate", "rating"}, t
        assert t["lessons"] == 1, t          # отменённое не считается, чужое — тем более
        assert t["attendance"] == 2, t
        assert t["fill_rate"] == 30.0, t     # 3 занятых из 10
        assert t["rating"] == 4.0, t         # avg(5, 3)
        # Прошлого периода в БД нет — тренд null, а не деление на ноль.
        assert all(k.prev_pct is None for k in r_trainer.kpi), r_trainer.kpi

        a = {k.id: k.value for k in r_admin.kpi}
        assert r_admin.role == "admin", r_admin.role
        # Денег в срезе администратора нет — Финансы ему недоступны.
        assert set(a) == {"bookings", "attendance", "fill_rate", "active_clients"}, a
        assert a["bookings"] == 4, a         # 3 у A + 1 у B, отменённые мимо
        assert a["attendance"] == 3, a       # по всей студии, а не только у A
        assert a["active_clients"] == 2, a
        assert a["fill_rate"] == 20.0, a     # 4 занятых из 20
    finally:
        await _cleanup(sid, uid_a, uid_b)
        # Пул asyncpg привязан к текущему event loop — без dispose() следующий
        # asyncio.run() в том же процессе унаследует мёртвые соединения.
        await engine.dispose()


def test_analytics_me():
    asyncio.run(_run())


if __name__ == "__main__":
    test_analytics_me()
    print("OK")
