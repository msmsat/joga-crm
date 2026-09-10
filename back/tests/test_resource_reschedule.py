import asyncio
from datetime import timedelta

import pytest
from fastapi import HTTPException

import test_resource_booking as resource
from database import async_session_maker
from models import Lesson, Reservation
from services import resource_reschedule as moves

enabled = resource.enabled


async def move_quote(ids, created, *, hours=1):
    request = resource.request(ids).model_copy(update={"starts_at": resource.START + timedelta(hours=hours)})
    async with async_session_maker() as db:
        q = await moves.create_quote(db, resource.actor(ids), created["reservation_id"], request, now=resource.NOW)
        await db.commit()
        return q.id


async def confirm(ids, created, key, version=1):
    async with async_session_maker() as db:
        result = await moves.confirm(db, resource.actor(ids), created["reservation_id"], key, version, now=resource.NOW)
        await db.commit()
        return result


def test_move_preserves_reservation_and_replay_and_rejects_old_version():
    async def run():
        ids = await resource.seed()
        try:
            created = await resource.confirm(ids, await resource.quote(ids))
            first = await move_quote(ids, created)
            obsolete = await move_quote(ids, created, hours=2)
            result = await confirm(ids, created, first)
            assert result["reservation_id"] == created["reservation_id"]
            assert result["lesson_id"] == created["lesson_id"] and result["version"] == 2
            assert await confirm(ids, created, first) == result
            with pytest.raises(HTTPException) as error:
                await confirm(ids, created, obsolete)
            assert error.value.detail["code"] == "VERSION_CONFLICT"
            async with async_session_maker() as db:
                lesson = await db.get(Lesson, created["lesson_id"])
                reservation = await db.get(Reservation, created["reservation_id"])
                assert lesson.start_time.hour == 11 and reservation.status == "active"
        finally:
            await resource.cleanup(ids)
    asyncio.run(run())


def test_conflict_keeps_original_interval_and_card_hold_cannot_move():
    async def run():
        ids = await resource.seed()
        try:
            created = await resource.confirm(ids, await resource.quote(ids))
            key = await move_quote(ids, created)
            async with async_session_maker() as db:
                source = await db.get(Lesson, created["lesson_id"])
                busy = Lesson(studio_id=ids["studio"], name="Group", teacher_name="T", teacher_id=ids["teacher"],
                    start_time=source.start_time + timedelta(hours=1), tz_iana=source.tz_iana,
                    duration_min=60, price=0, level="", equipment="", total_spots=10)
                db.add(busy)
                await db.commit()
            with pytest.raises(HTTPException) as error:
                await confirm(ids, created, key)
            assert error.value.detail["code"] == "SLOT_UNAVAILABLE"
            async with async_session_maker() as db:
                assert (await db.get(Lesson, created["lesson_id"])).start_time.hour == 10
                reservation = await db.get(Reservation, created["reservation_id"])
                reservation.status = "hold"
                await db.commit()
            with pytest.raises(HTTPException) as error:
                await move_quote(ids, created, hours=3)
            assert error.value.detail["code"] == "PAYMENT_IN_PROGRESS"
        finally:
            await resource.cleanup(ids)
    asyncio.run(run())
