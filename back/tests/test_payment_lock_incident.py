"""Regression for the production wait chain: Studio -> notification FK -> checkout."""
import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy import delete

from database import async_session_maker
from models import BookingQuote, Client, Lesson, NotificationLog, Reservation, StripeCheckout, Studio
from services import attendance, outbox, schedule_guard
from services.notifier import Recipient


@pytest.mark.parametrize("kind", ["notification", "checkout", "quote"])
def test_studio_guard_allows_independent_child_inserts(kind):
    async def run():
        async with async_session_maker() as db:
            studio = Studio(name=f"TEST-LOCK-INCIDENT-{uuid4()}", currency="CZK")
            db.add(studio)
            await db.flush()
            client = Client(studio_id=studio.id, name="Lock regression")
            db.add(client)
            await db.commit()
            studio_id, client_id = studio.id, client.id

        async def insert_child():
            if kind == "notification":
                return await outbox.claim(studio_id, "c4", "email",
                                          Recipient(client_id, "lock@example.test", None, None),
                                          {"amount": 25}, causal=str(uuid4()))
            async with async_session_maker() as db:
                if kind == "checkout":
                    row = StripeCheckout(studio_id=studio_id, account_id="acct_test_lock",
                                         attempt_id=str(uuid4()), payload={"client_id": client_id},
                                         amount=25, status="pending", application_fee=0)
                else:
                    now = datetime.now(timezone.utc)
                    row = BookingQuote(studio_id=studio_id, client_id=client_id, surface="miniapp",
                                       booking_mode="resource", terms={}, created_at=now,
                                       expires_at=now + timedelta(minutes=5))
                db.add(row)
                await db.commit()
                return row.id

        try:
            async with async_session_maker() as business:
                await schedule_guard.lock_studio(business, studio_id)
                # The outer transaction cannot finish until this independent
                # insert returns. FOR UPDATE deadlocks here through the FK.
                inserted_id = await asyncio.wait_for(insert_child(), timeout=3)
                assert inserted_id
                await business.rollback()
            async with async_session_maker() as db:
                model = {"notification": NotificationLog, "checkout": StripeCheckout,
                         "quote": BookingQuote}[kind]
                assert await db.get(model, inserted_id) is not None
        finally:
            async with async_session_maker() as db:
                await db.execute(delete(Studio).where(Studio.id == studio_id))
                await db.commit()

    asyncio.run(run())


@pytest.mark.parametrize("held_codes", [None, {"vouchers": [{"code": "LOCK-TEST", "amount": 25}]}])
def test_attendance_releases_studio_before_sending_review_request(monkeypatch, held_codes):
    async def run():
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        async with async_session_maker() as db:
            studio = Studio(name=f"TEST-ATTENDANCE-LOCK-{uuid4()}", currency="CZK")
            db.add(studio)
            await db.flush()
            client = Client(studio_id=studio.id, name="Already paid")
            lesson = Lesson(studio_id=studio.id, name="Paid appointment", teacher_name="Master",
                            start_time=now - timedelta(hours=2), duration_min=40, price=25,
                            level="All", equipment="")
            db.add_all([client, lesson])
            await db.flush()
            reservation = Reservation(lesson_id=lesson.id, client_id=client.id,
                                      spot_number=1, status="attended", held_codes=held_codes)
            db.add(reservation)
            await db.commit()
            studio_id, lesson_id, reservation_id = studio.id, lesson.id, reservation.id

        notifications = []

        async def rules(*args):
            return SimpleNamespace(review_request=True)

        async def notification(db, sid, role, event, context):
            # A second booking writer must enter WHILE provider I/O is pending.
            # Child FK inserts alone would miss a retained NO KEY UPDATE lock.
            async with async_session_maker() as competing_booking:
                await asyncio.wait_for(schedule_guard.lock_studio(competing_booking, sid), timeout=3)
                notifications.append(event)

        monkeypatch.setattr(attendance, "load_rules", rules)
        monkeypatch.setattr(attendance, "notify", notification)
        try:
            async with async_session_maker() as business:
                await attendance._close(business, studio_id, lesson_id, reservation_id, now)
            assert notifications == ["c8"]
            async with async_session_maker() as db:
                closed = await db.get(Reservation, reservation_id)
                assert closed.status == "attended" and closed.closed_at == now
                assert closed.auto_paid is False
        finally:
            async with async_session_maker() as db:
                await db.execute(delete(Studio).where(Studio.id == studio_id))
                await db.commit()

    asyncio.run(run())
