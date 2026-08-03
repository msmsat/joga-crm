"""Очередь абонементов от покупки до активации, на реальной БД с откатом.

Второй абонемент, купленный поверх незаконченного, ждёт: по нему можно
записаться, когда первый исчерпан, но срок начинается только с реального визита.

Запуск из back/:  python -m pytest tests/test_subscription_queue_flow.py
"""
import asyncio
import warnings
from datetime import date, datetime, timedelta

warnings.filterwarnings("ignore")

from database import async_session_maker
from models import (
    Client, ClientSubscription, Lesson, Reservation, Studio,
    StudioSubscriptionProgramConfig, SubscriptionPackage,
)
from routers.clients.subscriptions import attach_subscription
from services.booking_access import find_eligible_subscription
from services.subscription_charge import activate_pending_after_visit, charge_reservation

TODAY = date.today()
DURATION = 30


async def _run():
    async with async_session_maker() as db:
        s = Studio(name="TEST-SUB-QUEUE")
        db.add(s); await db.flush()
        sid = s.id

        cfg = StudioSubscriptionProgramConfig(studio_id=sid, is_enabled=True)
        db.add(cfg); await db.flush()

        package = SubscriptionPackage(
            studio_id=sid, config_id=cfg.id, name="8 занятий", class_count=8,
            price=8000, per_visit_price=1000, duration_days=DURATION,
        )
        db.add(package)
        client = Client(studio_id=sid, name="Queue", is_active=True)
        db.add(client); await db.flush()

        lesson = Lesson(studio_id=sid, name="L", teacher_name="T", start_time=datetime.now(),
                        price=0, level="", equipment="", total_spots=20)
        db.add(lesson); await db.flush()

        # ─── Первый абонемент идёт сразу ──
        first = await attach_subscription(db, sid, client.id, package, None, mark_paid=False)
        await db.flush()
        assert first.status == "active", first.status
        assert first.starts_at == TODAY
        assert first.expires_at == TODAY + timedelta(days=DURATION)

        # ─── Второй встаёт в очередь: срок не начался ──
        second = await attach_subscription(db, sid, client.id, package, None, mark_paid=False)
        await db.flush()
        assert second.status == "pending", second.status
        assert second.starts_at is None, "срок ждущего не должен начаться при покупке"

        # ─── Пока первый жив, тратится он ──
        picked = await find_eligible_subscription(db, client.id, lesson)
        assert picked.id == first.id, "тратить надо идущий, а не очередь"

        # ─── Исчерпываем первый ──
        for i in range(8):
            res = Reservation(client_id=client.id, lesson_id=lesson.id, spot_number=i + 1, status="active")
            db.add(res); await db.flush()
            sub = await find_eligible_subscription(db, client.id, lesson)
            assert sub.id == first.id, f"шаг {i}: ушли в очередь раньше времени"
            await charge_reservation(db, sid, res, sub)
        await db.flush()
        assert first.status == "finished"
        assert second.status == "pending", "очередь всё ещё ждёт"
        assert second.starts_at is None

        # ─── Теперь записываемся по очереди: она доступна, но срок ещё не идёт ──
        res = Reservation(client_id=client.id, lesson_id=lesson.id, spot_number=99, status="active")
        db.add(res); await db.flush()
        picked = await find_eligible_subscription(db, client.id, lesson)
        assert picked.id == second.id, "первый исчерпан — должна подхватиться очередь"

        await charge_reservation(db, sid, res, picked)
        await db.flush()
        assert second.used_classes == 1
        assert second.status == "pending", "запись срок не запускает"
        assert second.starts_at is None

        # ─── Занятие прошло → срок пошёл, и отсчитывается от визита ──
        activated = await activate_pending_after_visit(db, res)
        assert activated is True
        assert second.status == "active"
        assert second.starts_at == TODAY
        assert second.expires_at == TODAY + timedelta(days=DURATION)

        # ─── Третий, купленный сейчас, снова встаёт в очередь ──
        third = await attach_subscription(db, sid, client.id, package, None, mark_paid=False)
        await db.flush()
        assert third.status == "pending", "второй теперь идёт → третий ждёт"

        await db.rollback()


def test_subscription_queue_flow():
    asyncio.run(_run())


if __name__ == "__main__":
    test_subscription_queue_flow()
    print("ALL PASS")
