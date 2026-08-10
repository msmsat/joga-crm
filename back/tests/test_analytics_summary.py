"""Дашборд «Обзор»: GET /analytics/summary и /analytics/trainers.

Прикрывает две переписанные выборки:
  * _period_metrics — bookings/attendance/active_clients одним FILTER-запросом
    вместо трёх (раньше три SELECT с одинаковым WHERE);
  * trainers_report — имена тренеров без выручки добираются одним IN-запросом
    вместо запроса на каждого (был N+1).

Реальная БД, ручная чистка. Запуск из back/:  python -m tests.test_analytics_summary
"""
import asyncio
import warnings
from datetime import date, datetime, timedelta

warnings.filterwarnings("ignore")

from sqlalchemy import delete, select

from database import async_session_maker, engine
from dependencies import StudioContext
from models import Client, Lesson, Operation, Reservation, Studio, StudioMember, User
from routers.analytics.reports import period_summary, trainers_report


async def _seed() -> tuple[int, int, int]:
    """studio_id, paid_tid (есть выручка), free_tid (только занятия, выручки нет)."""
    async with async_session_maker() as db:
        s = Studio(name="TEST-OVERVIEW-SUMMARY"); db.add(s); await db.flush()
        sid = s.id
        day = date.today() - timedelta(days=3)

        paid = User(email="summary-paid-test@x.com", hashed_password="x", name="Paid", last_name="Trainer")
        free = User(email="summary-free-test@x.com", hashed_password="x", name="Free", last_name="Trainer")
        db.add_all([paid, free]); await db.flush()
        paid_tid, free_tid = paid.id, free.id

        # Членство обязательно: отчёт по тренерам подписывает человека именем из
        # StudioMember, а НЕ из users (решение 9 — в разных студиях он подписан
        # по-разному). Без этих строк join к studio_members пуст, member_names
        # ничего не находит, и обе строки отчёта подписываются str(user_id).
        db.add_all([
            StudioMember(user_id=paid_tid, studio_id=sid, role="trainer",
                         status="active", name="Paid", last_name="Trainer"),
            StudioMember(user_id=free_tid, studio_id=sid, role="trainer",
                         status="active", name="Free", last_name="Trainer"),
        ])
        await db.flush()

        c1 = Client(studio_id=sid, name="C1")
        c2 = Client(studio_id=sid, name="C2")
        db.add_all([c1, c2]); await db.flush()

        def _lesson(teacher_id: int, name: str) -> Lesson:
            return Lesson(
                studio_id=sid, name=name, teacher_name=name, teacher_id=teacher_id,
                start_time=datetime.combine(day, datetime.min.time()),
                duration_min=60, price=1000, level="all", equipment="mat",
                total_spots=8, status="confirmed",
            )

        l_paid, l_free = _lesson(paid_tid, "Pilates"), _lesson(free_tid, "Yoga")
        db.add_all([l_paid, l_free]); await db.flush()

        # c1 пришёл дважды, c2 один раз → attendance 3, active_clients 2.
        # Одна активная бронь считается в bookings, одна отменённая — нет.
        db.add_all([
            Reservation(client_id=c1.id, lesson_id=l_paid.id, spot_number=1, status="attended"),
            Reservation(client_id=c1.id, lesson_id=l_free.id, spot_number=1, status="attended"),
            Reservation(client_id=c2.id, lesson_id=l_paid.id, spot_number=2, status="attended"),
            Reservation(client_id=c2.id, lesson_id=l_paid.id, spot_number=3, status="active"),
            Reservation(client_id=c2.id, lesson_id=l_free.id, spot_number=2, status="cancelled"),
        ])

        db.add(Operation(
            studio_id=sid, client_id=None, product_id=None, trainer_id=paid_tid,
            type="in", title="Занятие", amount=5000, op_date=day, category="services", method="cash",
        ))
        await db.commit()
        return sid, paid_tid, free_tid


async def _cleanup(sid: int, tids: list[int]) -> None:
    async with async_session_maker() as db:
        lids = (await db.execute(select(Lesson.id).where(Lesson.studio_id == sid))).scalars().all()
        if lids:
            await db.execute(delete(Reservation).where(Reservation.lesson_id.in_(lids)))
        await db.execute(delete(Operation).where(Operation.studio_id == sid))
        await db.execute(delete(Lesson).where(Lesson.studio_id == sid))
        await db.execute(delete(Client).where(Client.studio_id == sid))
        await db.execute(delete(Studio).where(Studio.id == sid))
        await db.execute(delete(User).where(User.id.in_(tids)))
        await db.commit()


async def _run():
    sid, paid_tid, free_tid = await _seed()
    try:
        today = date.today()
        d_from, d_to = today - timedelta(days=10), today
        ctx = StudioContext(user=None, studio_id=sid, role="owner")

        async with async_session_maker() as db:
            summary = await period_summary(date_from=d_from, date_to=d_to, ctx=ctx, db=db)
            trainers = await trainers_report(date_from=d_from, date_to=d_to, ctx=ctx, db=db)

        # FILTER-агрегаты: три метрики из одного прохода по join.
        assert summary.bookings == 4, summary.bookings          # 3 attended + 1 active, cancelled не в счёт
        assert summary.attendance == 3, summary.attendance
        assert summary.active_clients == 2, summary.active_clients  # distinct(c1, c2)
        assert summary.revenue == 5000, summary.revenue

        by_id = {t.trainer_id: t for t in trainers}
        assert set(by_id) == {paid_tid, free_tid}, by_id
        assert by_id[paid_tid].name == "Paid Trainer", by_id[paid_tid].name
        assert by_id[paid_tid].revenue == 5000, by_id[paid_tid].revenue
        # Тренер без выручки: имя приходит из батч-запроса, а не из fallback str(id).
        assert by_id[free_tid].name == "Free Trainer", by_id[free_tid].name
        assert by_id[free_tid].revenue == 0, by_id[free_tid].revenue
        assert by_id[free_tid].lessons_count == 1, by_id[free_tid].lessons_count
    finally:
        await _cleanup(sid, [paid_tid, free_tid])
        # Пул asyncpg привязан к текущему event loop — без dispose() следующий
        # asyncio.run() в этом процессе унаследует мёртвый пул.
        await engine.dispose()


def test_analytics_summary():
    asyncio.run(_run())


if __name__ == "__main__":
    test_analytics_summary()
    print("OK")
