"""Сегменты (V5-4, задача 5): матчинг всех пяти на реальной БД с откатом.
Запуск из back/:  python -m tests.test_segments
"""
import asyncio
import warnings
from datetime import date, datetime, timedelta

warnings.filterwarnings("ignore")

from database import async_session_maker
from models import Client, ClientSubscription, Lesson, Reservation, Studio
from services import loyalty_matching as M


async def _run():
    async with async_session_maker() as db:
        s = Studio(name="TEST-SEGMENTS")
        db.add(s); await db.flush()
        sid = s.id
        today = date.today()

        def mk(name, **kw):
            c = Client(studio_id=sid, name=name, is_active=True, **kw); db.add(c); return c

        c_atrisk = mk("AtRisk", status="active", last_visit_date=today - timedelta(days=25))
        c_vip = mk("Vip", status="vip", last_visit_date=today - timedelta(days=20))
        mk("VipRecent", status="vip", last_visit_date=today - timedelta(days=3))
        c_exp_classes = mk("ExpC", status="active", last_visit_date=today - timedelta(days=1))
        c_exp_days = mk("ExpD", status="active", last_visit_date=today - timedelta(days=1))
        c_lost = mk("Lost", status="new", last_visit_date=today - timedelta(days=20))
        c_upsell = mk("Upsell", status="active", last_visit_date=today - timedelta(days=1))
        await db.flush()

        db.add(ClientSubscription(client_id=c_exp_classes.id, type="T", total_classes=10, used_classes=9,
                                  expires_at=today + timedelta(days=60), status="active"))
        db.add(ClientSubscription(client_id=c_exp_days.id, type="T", total_classes=10, used_classes=1,
                                  expires_at=today + timedelta(days=5), status="active"))
        await db.flush()

        les = Lesson(studio_id=sid, name="L", teacher_name="T", start_time=datetime.now(),
                     price=0, level="", equipment="", total_spots=20)
        db.add(les); await db.flush()
        db.add(Reservation(client_id=c_lost.id, lesson_id=les.id, spot_number=1, status="attended"))
        for i in range(8):
            db.add(Reservation(client_id=c_upsell.id, lesson_id=les.id, spot_number=i + 2, status="attended"))
        await db.flush()

        expected = {
            "at_risk": {c_atrisk.id},
            "vip_idle": {c_vip.id},
            "expiring_subscription": {c_exp_classes.id, c_exp_days.id},
            "lost_newcomers": {c_lost.id},
            "upsell_candidates": {c_upsell.id},
        }
        for key, exp in expected.items():
            got = {m.client_id for m in await M.match_segment(db, sid, key)}
            assert got == exp, f"{key}: {got} != {exp}"

        atrisk = await M.match_segment(db, sid, "at_risk")
        assert atrisk[0].context["days_inactive"] == 25
        assert await M.match_segment(db, sid, "nope") == []

        await db.rollback()


def test_segments():
    asyncio.run(_run())


if __name__ == "__main__":
    test_segments()
    print("ALL PASS")
