"""«Удалить из журнала» у отменённого занятия.

Отмена оставляет занятие в сетке серым следом; кнопка убирает и его — но
только из сетки. Проверяется то, на чём держится доверие к этой кнопке:
  * отменённое занятие остаётся в базе вместе со своими отменёнными бронями:
    по ним история клиента, отчёты и ассистент знают, что оно было. Сетке
    оно приходит с отметкой hidden_at, деньги клиента остаются в Финансах;
  * занятие с живой записью убрать нельзя — его сперва отменяют, и записанным
    уходит уведомление;
  * событие в Google Calendar снимается: у убранного занятия — тем же push,
    что и у отменённого, у удалённого живого — по сохранённому id, потому что
    строки уже нет.

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


async def _cancelled(ids, reservation_id, **lesson_values):
    """Снять единственную бронь — индивидуальное занятие отменяется вместе с ней."""
    async with async_session_maker() as db:
        await booking.cancel(db, studio_id=ids["studio"], reservation_id=reservation_id,
                             actor="test", enforce_policy=False)
        if lesson_values:
            await db.execute(update(Lesson).where(
                Lesson.id == (await db.get(Reservation, reservation_id)).lesson_id,
            ).values(**lesson_values))
        await db.commit()


def _day():
    return {"date_from": resource.START.date().isoformat(), "date_to": resource.START.date().isoformat()}


def test_cancelled_lesson_leaves_the_journal_but_keeps_its_history():
    async def run():
        ids = await resource.seed()
        try:
            lesson_id, reservation_id = await _booked(ids)
            async with async_session_maker() as db:
                payment = ClientPayment(client_id=ids["client"], amount=900, description="Haircut",
                                        status="success", action_type="lesson", item_key="lesson")
                db.add(payment)
                await db.commit()
                payment_id = payment.id
            await _cancelled(ids, reservation_id)

            async with crm._client(crm._app(ids)) as http:
                gone = await http.delete(f"/schedule/lessons/{lesson_id}")
                assert gone.status_code == 204, gone.text
                listed = await http.get("/schedule/lessons", params=_day())
                assert listed.status_code == 200, listed.text
                # Список отдаёт его с отметкой: сетка пропускает, отчёты считают отмену.
                row = next(r for r in listed.json() if r["id"] == lesson_id)
                assert row["status"] == "cancelled" and row["hidden_at"] is not None, row
                # Повторное нажатие (второй админ, двойной клик) ничего не ломает.
                again = await http.delete(f"/schedule/lessons/{lesson_id}")
                assert again.status_code == 204, again.text

            async with async_session_maker() as db:
                lesson = await db.get(Lesson, lesson_id)
                assert lesson is not None and lesson.status == "cancelled"
                assert lesson.hidden_at is not None
                assert (await db.execute(select(Reservation.status).where(
                    Reservation.lesson_id == lesson_id))).scalars().all() == ["cancelled"]
                assert await db.get(ClientPayment, payment_id) is not None
        finally:
            await resource.cleanup(ids)
    asyncio.run(run())


def test_lesson_with_a_live_booking_is_cancelled_first_not_hidden():
    async def run():
        ids = await resource.seed()
        try:
            lesson_id, reservation_id = await _booked(ids)
            async with crm._client(crm._app(ids)) as http:
                refused = await http.delete(f"/schedule/lessons/{lesson_id}")
                assert refused.status_code == 409, refused.text
            async with async_session_maker() as db:
                lesson = await db.get(Lesson, lesson_id)
                assert lesson is not None and lesson.hidden_at is None
                assert (await db.get(Reservation, reservation_id)).status != "cancelled"
        finally:
            await resource.cleanup(ids)
    asyncio.run(run())


def test_hidden_lesson_takes_its_google_event_along(monkeypatch):
    pushed = []

    async def fake_push(_db, studio_id, lesson_id):
        pushed.append((studio_id, lesson_id))
        return True

    monkeypatch.setattr(gcal, "push_lesson", fake_push)

    async def run():
        ids = await resource.seed()
        try:
            lesson_id, reservation_id = await _booked(ids)
            # Отмена не дошла до Google — событие всё ещё висит в календаре.
            await _cancelled(ids, reservation_id, gcal_event_id="evt-1")
            pushed.clear()
            async with crm._client(crm._app(ids)) as http:
                gone = await http.delete(f"/schedule/lessons/{lesson_id}")
                assert gone.status_code == 204, gone.text
            # Строка на месте — push у отменённого занятия сам снимает событие.
            assert pushed == [(ids["studio"], lesson_id)]
        finally:
            await resource.cleanup(ids)
    asyncio.run(run())


def test_deleted_live_lesson_takes_its_google_event_along(monkeypatch):
    dropped = []

    async def fake_drop(_db, studio_id, event_id):
        dropped.append((studio_id, event_id))
        return True

    monkeypatch.setattr(gcal, "drop_event", fake_drop)

    async def run():
        ids = await resource.seed()
        try:
            lesson_id, reservation_id = await _booked(ids)
            # Живое занятие без записей — так выглядит откат только что созданного
            # и то, что стирает очистка расписания ассистентом.
            await _cancelled(ids, reservation_id, status="confirmed", gcal_event_id="evt-1")
            async with crm._client(crm._app(ids)) as http:
                gone = await http.delete(f"/schedule/lessons/{lesson_id}")
                assert gone.status_code == 204, gone.text
            async with async_session_maker() as db:
                assert await db.get(Lesson, lesson_id) is None
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
