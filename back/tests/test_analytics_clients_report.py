"""EPIC R3 задача 1: GET /analytics/clients-report. Реальная БД, ручная чистка.
Запуск из back/:  python -m tests.test_analytics_clients_report
"""
import asyncio
import warnings
from datetime import date, datetime, timedelta

warnings.filterwarnings("ignore")

from sqlalchemy import delete, select

from database import async_session_maker
from dependencies import StudioContext
from models import Client, Lesson, Operation, Reservation, Studio
from routers.analytics.retention import analytics_clients_report, analytics_clients_report_segment
from routers.analytics._filters import ReportFilters


async def _seed() -> tuple[int, int]:
    async with async_session_maker() as db:
        s = Studio(name="TEST-CLIENTS-REPORT"); db.add(s); await db.flush()
        sid = s.id
        today = date.today()

        # cNew: регистрация внутри периода теста (today-10..today) — считается "new".
        cNew = Client(studio_id=sid, name="New", registration_date=datetime.combine(today - timedelta(days=5), datetime.min.time()))
        # cReturning: зарегистрирован давно, посещал и в прошлом периоде, и в текущем — "returned".
        cReturning = Client(
            studio_id=sid, name="Returning",
            registration_date=datetime.combine(today - timedelta(days=90), datetime.min.time()),
        )
        # cLost: посещал в прошлом периоде, не приходил в текущем — "lost".
        cLost = Client(
            studio_id=sid, name="Lost",
            registration_date=datetime.combine(today - timedelta(days=90), datetime.min.time()),
        )
        # cVip: неактивен 40+ дней → insight vip_inactive.
        cVip = Client(
            studio_id=sid, name="VipIdle", status="vip",
            registration_date=datetime.combine(today - timedelta(days=200), datetime.min.time()),
            last_visit_date=today - timedelta(days=40),
        )
        db.add_all([cNew, cReturning, cLost, cVip]); await db.flush()

        lesson_curr = Lesson(
            studio_id=sid, name="Йога", teacher_name="T", start_time=datetime.combine(today - timedelta(days=3), datetime.min.time()),
            duration_min=60, price=1000, level="all", equipment="mat", total_spots=10,
        )
        lesson_prev = Lesson(
            studio_id=sid, name="Йога", teacher_name="T", start_time=datetime.combine(today - timedelta(days=15), datetime.min.time()),
            duration_min=60, price=1000, level="all", equipment="mat", total_spots=10,
        )
        db.add_all([lesson_curr, lesson_prev]); await db.flush()

        # cReturning: attended в текущем периоде (day-3) и в прошлом периоде (day-15).
        db.add(Reservation(client_id=cReturning.id, lesson_id=lesson_curr.id, spot_number=1, status="attended"))
        db.add(Reservation(client_id=cReturning.id, lesson_id=lesson_prev.id, spot_number=1, status="attended"))
        # cLost: attended только в прошлом периоде.
        db.add(Reservation(client_id=cLost.id, lesson_id=lesson_prev.id, spot_number=2, status="attended"))

        db.add(Operation(
            studio_id=sid, client_id=cReturning.id, product_id=None, trainer_id=None,
            type="in", title="Занятие", amount=1000, op_date=today - timedelta(days=3),
            category="services", method="cash",
        ))
        await db.commit()
        return sid, cVip.id


async def _cleanup(sid: int) -> None:
    async with async_session_maker() as db:
        cids = (await db.execute(select(Client.id).where(Client.studio_id == sid))).scalars().all()
        lids = (await db.execute(select(Lesson.id).where(Lesson.studio_id == sid))).scalars().all()
        if lids:
            await db.execute(delete(Reservation).where(Reservation.lesson_id.in_(lids)))
        await db.execute(delete(Operation).where(Operation.studio_id == sid))
        await db.execute(delete(Lesson).where(Lesson.studio_id == sid))
        await db.execute(delete(Client).where(Client.studio_id == sid))
        await db.execute(delete(Studio).where(Studio.id == sid))
        await db.commit()


async def _run():
    sid, vip_id = await _seed()
    try:
        today = date.today()
        f = ReportFilters(
            date_from=today - timedelta(days=10), date_to=today,
            branch_id=None, hall_id=None, trainer_id=None, service_id=None,
        )
        ctx = StudioContext(user=None, studio_id=sid, role="owner")
        async with async_session_maker() as db:
            r = await analytics_clients_report(f=f, ctx=ctx, db=db)

        assert r.kpi.new.value == 1, r.kpi.new.value  # cNew
        assert r.kpi.returned.value == 1, r.kpi.returned.value  # cReturning
        assert r.kpi.lost.value == 1, r.kpi.lost.value  # cLost
        # avg_value: 1000 revenue / 1 distinct client with revenue
        assert r.kpi.avg_value.value == 1000.0, r.kpi.avg_value.value

        # risk_segments: 5 фиксированных ключей, все присутствуют
        risk_keys = {s.key for s in r.risk_segments}
        assert risk_keys == {"at_risk", "vip_idle", "expiring_subscription", "lost_newcomers", "upsell_candidates"}
        vip_idle = next(s for s in r.risk_segments if s.key == "vip_idle")
        assert vip_idle.count == 1, vip_idle.count  # cVip неактивен 40д > порога 14д

        loyal_keys = {s.key for s in r.loyal_segments}
        assert loyal_keys == {"frequent", "high_ltv", "referrers"}

        # insight vip_inactive: cVip неактивен 40д > 30д порога
        vip_insights = [i for i in r.insights if i.key == "vip_inactive"]
        assert len(vip_insights) == 1, r.insights
        assert vip_insights[0].action_params["id"] == vip_id

        # drilldown сегмента vip_idle возвращает cVip
        async with async_session_maker() as db:
            seg_rows = await analytics_clients_report_segment(key="vip_idle", f=f, ctx=ctx, db=db)
        assert len(seg_rows) == 1 and seg_rows[0].name == "VipIdle"
    finally:
        await _cleanup(sid)


def test_analytics_clients_report():
    asyncio.run(_run())


if __name__ == "__main__":
    test_analytics_clients_report()
    print("ALL PASS")
