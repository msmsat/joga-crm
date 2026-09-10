"""HB-09/10: quote purity, exact consent, race serialization and atomic rollback."""
import asyncio
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from sqlalchemy import delete, insert, select

import test_resource_hours as hours
from database import async_session_maker
from models import BookingQuote, Client, Lesson, Reservation, Service, Studio, StudioBookingSettings
from models.base import user_services
from schemas.schedule import hybrid
from services import booking, booking_quotes as quotes, resource_booking

NOW = datetime.combine(hours.DAY - timedelta(days=1), datetime.min.time(), timezone.utc)
START = datetime.combine(hours.DAY, datetime.min.time(), timezone.utc).replace(hour=8)  # 10:00 Prague


async def seed(price=0, approval=False):
    ids = await hours._seed()
    await hours._assign(ids)
    await hours._staff_hours(ids, hours.DAY.weekday(), "09:00", "18:00")
    async with async_session_maker() as db:
        studio = await db.get(Studio, ids["studio"])
        studio.booking_mode, studio.strict_schedule_enabled, studio.journal_time_step = "hybrid", True, 15
        service = Service(studio_id=studio.id, name="Haircut", price=price, duration_min=45,
            buffer_after_min=15, service_type="individual", booking_mode="resource")
        client = Client(studio_id=studio.id, name="Customer")
        db.add_all([service, client, StudioBookingSettings(studio_id=studio.id, prefill_on_booking=False,
            min_booking_advance_min=0, trainer_confirmation_required=approval,
            widget_work_start="00:00", widget_work_end="00:00")])
        await db.flush()
        await db.execute(insert(user_services).values(user_id=ids["teacher"], service_id=service.id))
        ids.update(service=service.id, client=client.id)
        await db.commit()
    return ids


async def cleanup(ids):
    async with async_session_maker() as db:
        await db.execute(delete(BookingQuote).where(BookingQuote.studio_id == ids["studio"]))
        await db.execute(delete(Reservation).where(Reservation.lesson_id.in_(
            select(Lesson.id).where(Lesson.studio_id == ids["studio"]))))
        await db.execute(delete(Lesson).where(Lesson.studio_id == ids["studio"]))
        await db.execute(delete(Client).where(Client.studio_id == ids["studio"]))
        await db.execute(delete(Service).where(Service.studio_id == ids["studio"]))
        await db.execute(delete(StudioBookingSettings).where(StudioBookingSettings.studio_id == ids["studio"]))
        await db.commit()
    await hours._cleanup(ids)


def actor(ids):
    return quotes.Actor(ids["studio"], ids["client"])


def request(ids, **kw):
    return hybrid.ResourceQuoteRequest(booking_mode="resource", service_id=ids["service"],
        branch_id=ids["branch_a"], starts_at=START, **kw)


async def quote(ids, **kw):
    async with async_session_maker() as db:
        row = await quotes.create(db, actor(ids), request(ids, **kw), now=NOW)
        await db.commit()
        return row.id


async def confirm(ids, quote_id, now=NOW):
    async with async_session_maker() as db:
        result = await resource_booking.confirm(db, quote_id, actor(ids), now=now)
        await db.commit()
        return result


@pytest.fixture(autouse=True)
def enabled(monkeypatch):
    monkeypatch.setattr(hybrid, "AVAILABLE_BOOKING_MODES", frozenset({"event", "resource", "hybrid"}))


def test_quote_is_read_only_except_journal_and_same_quote_confirms_once():
    async def run():
        ids = await seed()
        try:
            key = await quote(ids)
            async with async_session_maker() as db:
                assert (await db.execute(select(Lesson.id).where(Lesson.studio_id == ids["studio"]))).all() == []
            a, b = await asyncio.wait_for(asyncio.gather(confirm(ids, key), confirm(ids, key)), 15)
            assert a == b
            assert a["booking_mode"] == "resource" and a["status"] == "active"
            assert await confirm(ids, key, NOW + timedelta(hours=2)) == a
            async with async_session_maker() as db:
                assert len((await db.execute(select(Lesson.id).where(Lesson.studio_id == ids["studio"]))).all()) == 1
                await booking.cancel(db, studio_id=ids["studio"], reservation_id=a["reservation_id"],
                                     actor="test", enforce_policy=False)
                await db.commit()
                lesson = await db.get(Lesson, a["lesson_id"], populate_existing=True)
                assert lesson.status == "cancelled"
            assert (await confirm(ids, key))["status"] == "cancelled"
        finally:
            await cleanup(ids)
    asyncio.run(run())


def test_two_quotes_compete_for_one_interval_without_orphan_lesson():
    async def run():
        ids = await seed()
        try:
            keys = [await quote(ids), await quote(ids)]
            results = await asyncio.wait_for(asyncio.gather(*(confirm(ids, key) for key in keys),
                                                            return_exceptions=True), 15)
            assert sum(isinstance(r, dict) for r in results) == 1
            errors = [r for r in results if isinstance(r, HTTPException)]
            assert len(errors) == 1 and errors[0].detail["code"] == "SLOT_UNAVAILABLE"
            async with async_session_maker() as db:
                assert len((await db.execute(select(Lesson.id).where(Lesson.studio_id == ids["studio"]))).all()) == 1
        finally:
            await cleanup(ids)
    asyncio.run(run())


@pytest.mark.parametrize("change", ["price", "expiry"])
def test_changed_price_or_expired_quote_never_creates_booking(change):
    async def run():
        ids = await seed()
        try:
            key = await quote(ids)
            if change == "price":
                async with async_session_maker() as db:
                    service = await db.get(Service, ids["service"])
                    service.price = 123
                    await db.commit()
            with pytest.raises(HTTPException) as error:
                await confirm(ids, key, NOW + timedelta(minutes=5) if change == "expiry" else NOW)
            assert error.value.detail["code"] == ("QUOTE_EXPIRED" if change == "expiry" else "TERMS_CHANGED")
            async with async_session_maker() as db:
                assert (await db.execute(select(Lesson.id).where(Lesson.studio_id == ids["studio"]))).all() == []
                assert (await db.get(BookingQuote, key)).consumed_at is None
        finally:
            await cleanup(ids)
    asyncio.run(run())
