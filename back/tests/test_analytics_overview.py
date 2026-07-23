"""GET /analytics/overview (R1 задача 1): KPI, структура выручки, динамика
клиентов, insights. Реальная БД, чистим тестовые строки явно.
Запуск из back/:  python -m tests.test_analytics_overview
"""
import asyncio
import warnings
from datetime import date, datetime, timedelta

warnings.filterwarnings("ignore")

from sqlalchemy import delete, select

from database import async_session_maker
from dependencies import StudioContext
from models import Client, Hall, Lesson, Operation, Reservation, Studio
from routers.analytics._filters import ReportFilters
from routers.analytics.overview import analytics_overview


async def _seed() -> tuple[int, int]:
    async with async_session_maker() as db:
        s = Studio(name="TEST-OVERVIEW")
        db.add(s)
        await db.flush()
        sid = s.id

        hall = Hall(studio_id=sid, name="Hall A", capacity=4)
        db.add(hall)
        await db.flush()
        hall_id = hall.id

        # выручка текущего периода (17-23 Jan) — 2 категории
        db.add(Operation(studio_id=sid, type="in", title="Sub", amount=1000, op_date=date(2026, 1, 20), category="subscriptions", method="card"))
        db.add(Operation(studio_id=sid, type="in", title="Cert", amount=500, op_date=date(2026, 1, 21), category="certificates", method="card"))
        db.add(Operation(studio_id=sid, type="out", title="Rent", amount=300, op_date=date(2026, 1, 20), category="rent", method="card"))
        # прошлый период (10-16 Jan) — меньше выручки
        db.add(Operation(studio_id=sid, type="in", title="Sub", amount=400, op_date=date(2026, 1, 12), category="subscriptions", method="card"))

        # клиенты: новый в текущем периоде, старый посещавший оба периода (returned),
        # и клиент из прошлого периода, не пришедший в текущем (lost)
        c_new = Client(studio_id=sid, name="New", is_active=True, status="new", registration_date=datetime(2026, 1, 19))
        c_returning = Client(studio_id=sid, name="Returning", is_active=True, status="active")
        c_lost = Client(studio_id=sid, name="Lost", is_active=True, status="active", last_visit_date=date.today())
        c_at_risk = Client(studio_id=sid, name="AtRisk", is_active=True, status="active", last_visit_date=date.today() - timedelta(days=25))
        db.add_all([c_new, c_returning, c_lost, c_at_risk])
        await db.flush()

        # 2 занятия в текущем периоде: одно 2/2 (100%), другое 1/2 (50%) —
        # так наивный SUM(total_spots) по join-строкам (двойной счёт) даёт
        # другое число, чем корректный per-lesson расчёт (3/4 = 75%).
        lesson_curr_full = Lesson(studio_id=sid, name="Yoga", teacher_name="T", hall_id=hall_id, start_time=datetime(2026, 1, 20, 10, 0), total_spots=2, price=500, level="beginner", equipment="none")
        lesson_curr_half = Lesson(studio_id=sid, name="Yoga", teacher_name="T", hall_id=hall_id, start_time=datetime(2026, 1, 21, 10, 0), total_spots=2, price=500, level="beginner", equipment="none")
        lesson_prev = Lesson(studio_id=sid, name="Yoga", teacher_name="T", hall_id=hall_id, start_time=datetime(2026, 1, 13, 10, 0), total_spots=2, price=500, level="beginner", equipment="none")
        db.add_all([lesson_curr_full, lesson_curr_half, lesson_prev])
        await db.flush()

        db.add(Reservation(client_id=c_returning.id, lesson_id=lesson_curr_full.id, spot_number=1, status="attended"))
        db.add(Reservation(client_id=c_new.id, lesson_id=lesson_curr_full.id, spot_number=2, status="attended"))
        db.add(Reservation(client_id=c_new.id, lesson_id=lesson_curr_half.id, spot_number=1, status="attended"))
        db.add(Reservation(client_id=c_returning.id, lesson_id=lesson_prev.id, spot_number=1, status="attended"))
        db.add(Reservation(client_id=c_lost.id, lesson_id=lesson_prev.id, spot_number=2, status="attended"))

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
            date_from=date(2026, 1, 17), date_to=date(2026, 1, 23),
            branch_id=None, hall_id=None, trainer_id=None, service_id=None,
        )
        async with async_session_maker() as db:
            result = await analytics_overview(f=f, ctx=ctx, db=db)

        assert result.kpi.revenue.value == 1500, result.kpi.revenue
        assert result.kpi.profit.value == 1200, result.kpi.profit
        assert result.kpi.attendance.value == 3, result.kpi.attendance
        assert result.kpi.active_clients.value == 2, result.kpi.active_clients
        assert result.kpi.fill_rate.value == 75.0, result.kpi.fill_rate
        # prev period revenue=400 → (1500-400)/400*100 = 275.0
        assert result.kpi.revenue.prev_pct == 275.0, result.kpi.revenue.prev_pct

        cats = {r.category: r.amount for r in result.revenue_structure}
        assert cats == {"subscriptions": 1000, "certificates": 500}, cats
        shares = {r.category: r.share_pct for r in result.revenue_structure}
        assert shares["subscriptions"] == round(1000 / 1500 * 100, 1), shares

        # returning вернулся (был в prev и curr) → returned=1; lost был в prev, не пришёл в curr → lost=1
        assert result.client_dynamics.returned.value == 1, result.client_dynamics.returned
        assert result.client_dynamics.lost.value == 1, result.client_dynamics.lost
        assert result.client_dynamics.new.value == 1, result.client_dynamics.new

        keys = {i.key for i in result.insights}
        assert "clients_at_risk" in keys, keys
        at_risk = next(i for i in result.insights if i.key == "clients_at_risk")
        assert at_risk.params["count"] == 1, at_risk.params
        assert at_risk.action_params == {"segment": "at_risk"}

        assert len(result.insights) <= 3
    finally:
        await _cleanup(sid)


def test_analytics_overview():
    asyncio.run(_run())


if __name__ == "__main__":
    test_analytics_overview()
    print("ALL PASS")
