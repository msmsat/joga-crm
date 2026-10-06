"""«Удалить навсегда» у отменённого занятия в Журнале.

Отмена оставляет занятие в сетке серым следом; удаление навсегда убирает и
его. Проверяется то, на чём держится доверие к этой кнопке:
  * отменённое занятие уходит вместе со своими отменёнными бронями, а деньги
    клиента (ClientPayment) на занятие не ссылаются и остаются в Финансах;
  * занятие с живой записью удалить нельзя — его сперва отменяют, и записанным
    уходит уведомление;
  * событие в Google Calendar снимается вместе с занятием: push_lesson ищет
    занятие по id, а строки уже нет.

Реальная БД, HTTP через ASGI — как tests/test_hybrid_crm_api.py.

Запуск из back/:  python -m pytest tests/test_lesson_purge.py -q
"""
import asyncio

from sqlalchemy import select, update

import test_hybrid_crm_api as crm
import test_resource_booking as resource
from database import async_session_maker
from models import ClientPayment, Lesson, Reservation
from services import booking, gcal

enabled = resource.enabled


async def _booked(ids):
    """Занятие с одной живой записью: (lesson_id, reservation_id)."""
    await crm._owner(ids)
    made = await resource.confirm(ids, await resource.quote(ids))
    return made["lesson_id"], made["reservation_id"]


def test_cancelled_lesson_goes_with_its_bookings_and_the_money_stays():
    async def run():
        ids = await resource.seed()
        try:
            lesson_id, reservation_id = await _booked(ids)
            async with async_session_maker() as db:
                payment = ClientPayment(client_id=ids["client"], amount=900, description="Haircut",
                                        status="success", action_type="lesson", item_key="lesson")
                db.add(payment)
                await booking.cancel(db, studio_id=ids["studio"], reservation_id=reservation_id,
                                     actor="test", enforce_policy=False)
                await db.commit()
                payment_id = payment.id
                assert (await db.get(Lesson, lesson_id)).status == "cancelled"

            async with crm._client(crm._app(ids)) as http:
                gone = await http.delete(f"/schedule/lessons/{lesson_id}")
                assert gone.status_code == 204, gone.text
                listed = await http.get("/schedule/lessons", params={
                    "date_from": resource.START.date().isoformat(),
                    "date_to": resource.START.date().isoformat(),
                })
                assert listed.status_code == 200, listed.text
                assert lesson_id not in [row["id"] for row in listed.json()]

            async with async_session_maker() as db:
                assert await db.get(Lesson, lesson_id) is None
                assert (await db.execute(
                    select(Reservation.id).where(Reservation.lesson_id == lesson_id))).all() == []
                assert await db.get(ClientPayment, payment_id) is not None
        finally:
            await resource.cleanup(ids)
    asyncio.run(run())


def test_lesson_with_a_live_booking_is_cancelled_first_not_deleted():
    async def run():
        ids = await resource.seed()
        try:
            lesson_id, reservation_id = await _booked(ids)
            async with crm._client(crm._app(ids)) as http:
                refused = await http.delete(f"/schedule/lessons/{lesson_id}")
                assert refused.status_code == 409, refused.text
            async with async_session_maker() as db:
                assert await db.get(Lesson, lesson_id) is not None
                assert (await db.get(Reservation, reservation_id)).status != "cancelled"
        finally:
            await resource.cleanup(ids)
    asyncio.run(run())


def test_deleted_lesson_takes_its_google_event_along(monkeypatch):
    dropped = []

    async def fake_drop(_db, studio_id, event_id):
        dropped.append((studio_id, event_id))
        return True

    monkeypatch.setattr(gcal, "drop_event", fake_drop)

    async def run():
        ids = await resource.seed()
        try:
            lesson_id, reservation_id = await _booked(ids)
            async with async_session_maker() as db:
                await booking.cancel(db, studio_id=ids["studio"], reservation_id=reservation_id,
                                     actor="test", enforce_policy=False)
                # Отмена не дошла до Google — событие всё ещё висит в календаре.
                await db.execute(update(Lesson).where(Lesson.id == lesson_id).values(gcal_event_id="evt-1"))
                await db.commit()
            async with crm._client(crm._app(ids)) as http:
                gone = await http.delete(f"/schedule/lessons/{lesson_id}")
                assert gone.status_code == 204, gone.text
            assert dropped == [(ids["studio"], "evt-1")]
        finally:
            await resource.cleanup(ids)
    asyncio.run(run())


def test_drop_event_deletes_the_event_by_its_id(monkeypatch):
    requests = []

    async def calendar_of(_db, _studio_id):
        return object(), "cal-1", "refresh"

    async def access_token(_refresh):
        return "token"

    async def calendar_request(method, _token, path, **_kw):
        requests.append((method, path))
        return {"_status": 204}

    monkeypatch.setattr(gcal, "_calendar_of", calendar_of)
    monkeypatch.setattr(gcal, "_access_token", access_token)
    monkeypatch.setattr(gcal, "_calendar_request", calendar_request)

    assert asyncio.run(gcal.drop_event(None, 1, "evt-1")) is True
    assert requests == [("DELETE", "/calendars/cal-1/events/evt-1")]


def test_drop_event_is_quiet_without_a_connected_calendar(monkeypatch):
    async def calendar_of(_db, _studio_id):
        return None

    async def calendar_request(*_a, **_kw):
        raise AssertionError("без календаря в Google не ходят")

    monkeypatch.setattr(gcal, "_calendar_of", calendar_of)
    monkeypatch.setattr(gcal, "_calendar_request", calendar_request)

    assert asyncio.run(gcal.drop_event(None, 1, "evt-1")) is False
