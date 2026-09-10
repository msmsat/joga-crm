import asyncio
from datetime import timedelta

import pytest
from fastapi import HTTPException

import test_resource_booking as resource
import test_resource_booking as base
from database import async_session_maker
from models import Client, Lesson, Reservation
from services import booking, booking_quotes as quotes, resource_reschedule
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


def test_move_rejects_a_foreign_or_cancelled_reservation():
    """AC-24: чужую бронь не переносят, отменённую — не воскрешают переносом.

    Обе проверки на СЕРВЕРЕ: кнопку переноса интерфейс чужой брони и так не
    покажет, но ручка зовётся по `reservation_id`, и перебор номеров не должен
    давать ни доступа, ни подсказки о существовании строки.
    """
    async def run():
        ids = await base.seed()
        try:
            created = await base.confirm(ids, await base.quote(ids))
            async with async_session_maker() as db:
                stranger = Client(studio_id=ids["studio"], name="Stranger")
                db.add(stranger)
                await db.commit()
                stranger_id = stranger.id

            outsider = quotes.Actor(ids["studio"], stranger_id)
            async with async_session_maker() as db:
                try:
                    await resource_reschedule.create_quote(
                        db, outsider, created["reservation_id"], base.request(ids), now=base.NOW)
                    raise AssertionError("чужая бронь не должна переноситься")
                except HTTPException as exc:
                    assert exc.status_code == 404, exc.status_code

            # Отменённая бронь: перенос обязан отказать, а не «оживить» её.
            async with async_session_maker() as db:
                result = await booking.cancel(db, studio_id=ids["studio"],
                    reservation_id=created["reservation_id"], actor="test", enforce_policy=False)
                assert result.outcome is booking.Outcome.OK
                await db.commit()
            async with async_session_maker() as db:
                try:
                    await resource_reschedule.create_quote(
                        db, base.actor(ids), created["reservation_id"], base.request(ids), now=base.NOW)
                    raise AssertionError("отменённая бронь не должна переноситься")
                except HTTPException as exc:
                    assert exc.status_code == 409, exc.status_code
            async with async_session_maker() as db:
                assert (await db.get(Reservation, created["reservation_id"])).status == "cancelled"
        finally:
            await base.cleanup(ids)
    asyncio.run(run())
