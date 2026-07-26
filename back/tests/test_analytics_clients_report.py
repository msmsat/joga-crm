"""EPIC R3 задача 1: GET /analytics/clients-report. Реальная БД, ручная чистка.
Запуск из back/:  python -m tests.test_analytics_clients_report
"""
import asyncio
import warnings
from datetime import date, datetime, timedelta

warnings.filterwarnings("ignore")

from sqlalchemy import delete, select

from database import async_session_maker, engine
from dependencies import StudioContext
from models import Client, Lesson, Operation, Reservation, Service, Studio
from routers.analytics.retention import analytics_clients_report, analytics_clients_report_segment
from routers.analytics._filters import ReportFilters

# Заведомо чужие id — ни одно занятие сидов их не использует, поэтому фильтр
# по ним обязан занулить lesson-based KPI без обращения к реальным строкам.
OTHER_TRAINER_ID = 999999
MISSING_HALL_ID = 888888


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
        await db.execute(delete(Service).where(Service.studio_id == sid))
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

        # EPIC R15 задача 1: список сегмента new/returned/lost сходится с KPI —
        # один источник множества на цифру и на список.
        async with async_session_maker() as db:
            seg_new = await analytics_clients_report_segment(key="new", f=f, ctx=ctx, db=db)
        async with async_session_maker() as db:
            seg_returned = await analytics_clients_report_segment(key="returned", f=f, ctx=ctx, db=db)
        async with async_session_maker() as db:
            seg_lost = await analytics_clients_report_segment(key="lost", f=f, ctx=ctx, db=db)
        assert len(seg_new) == r.kpi.new.value, (len(seg_new), r.kpi.new.value)
        assert len(seg_returned) == r.kpi.returned.value, (len(seg_returned), r.kpi.returned.value)
        assert len(seg_lost) == r.kpi.lost.value, (len(seg_lost), r.kpi.lost.value)
        assert seg_new[0].name == "New"
        assert seg_returned[0].name == "Returning"
        assert seg_lost[0].name == "Lost"
    finally:
        await _cleanup(sid)
        # Пул asyncpg привязан к текущему event loop: без dispose() второй
        # test_* файла (pytest зовёт их отдельными asyncio.run) унаследует
        # мёртвый пул. Тот же приём в test_analytics_team.py.
        await engine.dispose()


def test_analytics_clients_report():
    asyncio.run(_run())


async def _seed_filters() -> tuple[int, int]:
    """EPIC R13 задача 1: студия с двумя "вернувшимися" клиентами, привязанными
    к разным услугам — service_id должен сузить returned с 2 до 1. Ни одно
    занятие не получает teacher_id/hall_id, поэтому фильтр по OTHER_TRAINER_ID/
    MISSING_HALL_ID обязан занулить lesson-based KPI."""
    async with async_session_maker() as db:
        s = Studio(name="TEST-CLIENTS-REPORT-FILTERS"); db.add(s); await db.flush()
        sid = s.id
        today = date.today()

        svc_a = Service(studio_id=sid, name="Yoga", price=1000)
        svc_b = Service(studio_id=sid, name="Pilates", price=1000)
        db.add_all([svc_a, svc_b]); await db.flush()

        cA = Client(studio_id=sid, name="ReturningA", registration_date=datetime.combine(today - timedelta(days=90), datetime.min.time()))
        cB = Client(studio_id=sid, name="ReturningB", registration_date=datetime.combine(today - timedelta(days=90), datetime.min.time()))
        cNew = Client(studio_id=sid, name="New", registration_date=datetime.combine(today - timedelta(days=5), datetime.min.time()))
        db.add_all([cA, cB, cNew]); await db.flush()

        def _lesson(name: str, service_id: int, days_ago: int) -> Lesson:
            return Lesson(
                studio_id=sid, name=name, teacher_name="T", service_id=service_id,
                start_time=datetime.combine(today - timedelta(days=days_ago), datetime.min.time()),
                duration_min=60, price=1000, level="all", equipment="mat", total_spots=10,
            )

        lesson_curr_a = _lesson("Yoga", svc_a.id, 3)
        lesson_prev_a = _lesson("Yoga", svc_a.id, 15)
        lesson_curr_b = _lesson("Pilates", svc_b.id, 3)
        lesson_prev_b = _lesson("Pilates", svc_b.id, 15)
        db.add_all([lesson_curr_a, lesson_prev_a, lesson_curr_b, lesson_prev_b]); await db.flush()

        db.add_all([
            Reservation(client_id=cA.id, lesson_id=lesson_curr_a.id, spot_number=1, status="attended"),
            Reservation(client_id=cA.id, lesson_id=lesson_prev_a.id, spot_number=1, status="attended"),
            Reservation(client_id=cB.id, lesson_id=lesson_curr_b.id, spot_number=1, status="attended"),
            Reservation(client_id=cB.id, lesson_id=lesson_prev_b.id, spot_number=1, status="attended"),
        ])
        await db.commit()
        return sid, svc_a.id


async def _run_filters():
    sid, svc_a_id = await _seed_filters()
    try:
        today = date.today()
        base = dict(date_from=today - timedelta(days=10), date_to=today, branch_id=None, hall_id=None, trainer_id=None, service_id=None)
        ctx = StudioContext(user=None, studio_id=sid, role="owner")

        # Baseline без фильтров: оба клиента "вернулись".
        async with async_session_maker() as db:
            r_none = await analytics_clients_report(f=ReportFilters(**base), ctx=ctx, db=db)
        assert r_none.kpi.returned.value == 2, r_none.kpi.returned.value

        # 1. trainer_id чужого тренера → returned/retention = 0, new не меняется
        # (registration_date фильтров не берёт).
        async with async_session_maker() as db:
            r_trainer = await analytics_clients_report(
                f=ReportFilters(**{**base, "trainer_id": OTHER_TRAINER_ID}), ctx=ctx, db=db,
            )
        assert r_trainer.kpi.returned.value == 0, r_trainer.kpi.returned.value
        assert r_trainer.kpi.retention_pct.value == 0.0, r_trainer.kpi.retention_pct.value
        assert r_trainer.kpi.new.value == r_none.kpi.new.value

        # 2. service_id конкретной услуги → returned считает только её посетителей.
        async with async_session_maker() as db:
            r_service = await analytics_clients_report(
                f=ReportFilters(**{**base, "service_id": svc_a_id}), ctx=ctx, db=db,
            )
        assert r_service.kpi.returned.value == 1, r_service.kpi.returned.value

        # 3. Набор ключей сегментов и их счётчики не зависят от фильтров —
        # инвариант с Лояльностью (retention.py:3) должен остаться цел.
        risk_none = {(s.key, s.count) for s in r_none.risk_segments}
        loyal_none = {(s.key, s.count) for s in r_none.loyal_segments}
        risk_trainer = {(s.key, s.count) for s in r_trainer.risk_segments}
        loyal_trainer = {(s.key, s.count) for s in r_trainer.loyal_segments}
        assert risk_none == risk_trainer, (risk_none, risk_trainer)
        assert loyal_none == loyal_trainer, (loyal_none, loyal_trainer)

        # 4. hall_id несуществующего зала → 0 без 500.
        async with async_session_maker() as db:
            r_hall = await analytics_clients_report(
                f=ReportFilters(**{**base, "hall_id": MISSING_HALL_ID}), ctx=ctx, db=db,
            )
        assert r_hall.kpi.returned.value == 0, r_hall.kpi.returned.value
    finally:
        await _cleanup(sid)
        # Пул asyncpg привязан к текущему event loop: без dispose() второй
        # test_* файла (pytest зовёт их отдельными asyncio.run) унаследует
        # мёртвый пул. Тот же приём в test_analytics_team.py.
        await engine.dispose()


def test_analytics_clients_report_filters():
    asyncio.run(_run_filters())


if __name__ == "__main__":
    test_analytics_clients_report()
    test_analytics_clients_report_filters()
    print("ALL PASS")
