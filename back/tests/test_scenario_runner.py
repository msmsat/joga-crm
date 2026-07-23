"""Исполнитель сценариев (V5-4, задача 2): матчинг + идемпотентность.

Работает на реальной БД в одной транзакции с откатом в конце — ничего не
сохраняет. Запуск из back/:  python -m tests.test_scenario_runner
"""
import asyncio
import warnings
from datetime import date, datetime, timedelta

warnings.filterwarnings("ignore")

from sqlalchemy import func, select

from database import async_session_maker
from models import (
    Client, ClientSubscription, Lesson, LoyaltyScenario, ReferralRecord,
    Reservation, ScenarioFire, Studio,
)
from services import loyalty_matching as M
from services import scenario_runner as R


async def _run():
    async with async_session_maker() as db:
        s = Studio(name="TEST-SCN-RUNNER")
        db.add(s); await db.flush()
        sid = s.id
        today = date.today()

        c_inactive = Client(studio_id=sid, name="Inact", is_active=True, last_visit_date=today - timedelta(days=30))
        c_recent = Client(studio_id=sid, name="Recent", is_active=True, last_visit_date=today - timedelta(days=1))
        c_never = Client(studio_id=sid, name="Never", is_active=True, last_visit_date=None)
        c_bday = Client(studio_id=sid, name="Bday", is_active=True,
                        birth_date=date(1990, today.month, today.day), last_visit_date=today - timedelta(days=2))
        c_sub = Client(studio_id=sid, name="Sub", is_active=True, last_visit_date=today - timedelta(days=2))
        for c in (c_inactive, c_recent, c_never, c_bday, c_sub):
            db.add(c)
        await db.flush()

        db.add(ClientSubscription(client_id=c_sub.id, type="Т", total_classes=10, used_classes=9,
                                  expires_at=today + timedelta(days=20), status="active", is_frozen=False))
        c_visit = Client(studio_id=sid, name="Visitor", is_active=True, last_visit_date=today - timedelta(days=1))
        db.add(c_visit); await db.flush()
        lesson = Lesson(studio_id=sid, name="L", teacher_name="T", start_time=datetime.now(),
                        price=0, level="", equipment="", total_spots=8)
        db.add(lesson); await db.flush()
        for i in range(5):
            db.add(Reservation(client_id=c_visit.id, lesson_id=lesson.id, spot_number=i + 1, status="attended"))
        c_ref = Client(studio_id=sid, name="Referrer", is_active=True, last_visit_date=today - timedelta(days=1))
        db.add(c_ref); await db.flush()
        db.add(ReferralRecord(studio_id=sid, referrer_client_id=c_ref.id, status="completed", bonus_paid=False))
        await db.flush()

        # матчеры: каждый берёт своего и только своего
        assert {m.client_id for m in await M.match_inactive(db, sid, 21)} == {c_inactive.id}
        assert {m.client_id for m in await M.match_low_subscription(db, sid, 2)} == {c_sub.id}
        assert {m.client_id for m in await M.match_birthday(db, sid)} == {c_bday.id}
        assert {m.client_id for m in await M.match_nth_visit(db, sid, 5)} == {c_visit.id}
        assert {m.client_id for m in await M.match_referral(db, sid)} == {c_ref.id}

        # идемпотентность: второй прогон — ноль новых
        scn = LoyaltyScenario(studio_id=sid, trigger_type="inactive_days", trigger_params={"days": 21},
                              action_type="points", action_params={"points": 200}, channel="email", is_enabled=True)
        db.add(scn); await db.flush()
        assert await R._run_scenario(db, scn) == 1
        assert await R._run_scenario(db, scn) == 0, "idempotency broken"

        # выход из условия: новая дата визита → новый dedup_key → снова срабатывает
        c_inactive.last_visit_date = today - timedelta(days=25)
        await db.flush()
        assert await R._run_scenario(db, scn) == 1, "re-fire after visit change failed"
        cnt = (await db.execute(
            select(func.count(ScenarioFire.id)).where(ScenarioFire.scenario_id == scn.id)
        )).scalar()
        assert cnt == 2, cnt

        await db.rollback()


def test_scenario_runner():
    asyncio.run(_run())


if __name__ == "__main__":
    test_scenario_runner()
    print("ALL PASS")
