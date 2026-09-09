"""HB-07: real PostgreSQL waiters, legacy entry isolation, no mocked row locks."""
import asyncio

import pytest
from sqlalchemy import select

import test_booking_domain as seed
from database import async_session_maker
from models import Lesson, Reservation, Studio
from services import booking, booking_payment, schedule_guard


@pytest.mark.parametrize("transition,status", [("approve", "pending"), ("activate_paid", "hold")])
def test_waiting_transition_cannot_resurrect_cancelled_reservation(transition, status):
    async def run():
        ids = await seed._seed()
        try:
            async with async_session_maker() as db:
                row = Reservation(lesson_id=ids["big"], client_id=ids["katya"],
                                  spot_number=1, status=status)
                db.add(row)
                await db.commit()
                reservation_id = row.id
            async with async_session_maker() as reader, async_session_maker() as writer:
                cached = await reader.get(Reservation, reservation_id)
                cached_studio = await reader.get(Studio, ids["studio"])
                assert cached.status == status
                studio = await schedule_guard.lock_studio(writer, ids["studio"])
                studio.strict_schedule_enabled = True
                result = await booking.cancel(writer, studio_id=ids["studio"],
                    reservation_id=reservation_id, actor="review", enforce_policy=False)
                assert result.outcome is booking.Outcome.OK
                kwargs = dict(studio_id=ids["studio"], reservation_id=reservation_id)
                if transition == "approve":
                    kwargs["actor"] = "review"
                task = asyncio.create_task(getattr(booking, transition)(reader, **kwargs))
                try:
                    with pytest.raises(asyncio.TimeoutError):
                        await asyncio.wait_for(asyncio.shield(task), .15)
                    await writer.commit()
                    result = await asyncio.wait_for(task, 5)
                    assert result.outcome is booking.Outcome.ALREADY_CANCELLED
                    assert cached.status == "cancelled"
                    assert cached_studio.strict_schedule_enabled is True
                    await reader.commit()
                finally:
                    if not task.done():
                        task.cancel()
                        await asyncio.gather(task, return_exceptions=True)
            async with async_session_maker() as db:
                assert (await db.get(Reservation, reservation_id)).status == "cancelled"
        finally:
            await seed._cleanup(ids)
    asyncio.run(run())


def test_legacy_quote_and_create_reject_private_resource_interval():
    async def run():
        ids = await seed._seed()
        try:
            async with async_session_maker() as db:
                lesson = await db.get(Lesson, ids["one_seat"])
                lesson.booking_mode = "resource"
                lesson.branch_id = ids["branch"]
                await db.commit()
                args = dict(studio_id=ids["studio"], client_id=ids["oleg"], lesson_id=lesson.id)
                assert (await booking.quote(db, **args)).outcome is booking.Outcome.LESSON_UNAVAILABLE
                assert (await booking.create(db, **args, source="public")).outcome is booking.Outcome.LESSON_UNAVAILABLE
                await db.commit()
                assert (await db.execute(select(Reservation.id).where(
                    Reservation.lesson_id == lesson.id))).scalars().all() == []
        finally:
            await seed._cleanup(ids)
    asyncio.run(run())


def test_payment_sweeper_does_not_cancel_already_attended_booking():
    async def run():
        ids = await seed._seed()
        try:
            async with async_session_maker() as db:
                row = Reservation(lesson_id=ids["big"], client_id=ids["katya"],
                                  spot_number=1, status="attended")
                db.add(row)
                await db.commit()
                await booking_payment._release(db, studio_id=ids["studio"],
                    reservation_id=row.id, reason="stale")
                await db.refresh(row)
                assert row.status == "attended"
        finally:
            await seed._cleanup(ids)
    asyncio.run(run())
