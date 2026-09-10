"""Финальная приёмка: CRM-путь Hybrid Booking ЧЕРЕЗ HTTP, а не через вызов функций.

ЗАЧЕМ ОТДЕЛЬНЫЙ ФАЙЛ. Предыдущее ревью поймало дефект, невидимый ни сборке, ни
типам, ни тестам роутера: `GET /schedule/lessons` не выбирал `booking_mode` и
`version`, а Pydantic подставлял умолчания — интерфейс получал «событие» для
каждой строки, и весь разбор механики в CRM не работал НИКОГДА. Ловится это
только сравнением СЕРИАЛИЗОВАННОГО ответа с тем, что лежит в базе.

Поэтому здесь всё идёт через ASGI: запрос → роутер → домен → база → JSON.
Проверяется путь целиком, включая то, что реально увидит фронт.

Запуск из back/:  python -m pytest tests/test_hybrid_crm_api.py -q
"""
import asyncio
from datetime import timedelta

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

import test_resource_booking as resource
from database import async_session_maker, get_db
from dependencies import StudioContext, get_studio_context
from models import Lesson, Reservation, StudioMember, User
from ratelimit import limiter
from routers.schedule.router import router as schedule_router
from services import booking_quotes

enabled = resource.enabled


async def _owner(ids):
    """Владелец студии — отдельный человек, а не тренер из фикстуры.

    `booking_quotes.authorize` требует активного StudioMember с ролью
    owner/admin: quote в CRM привязан к СОТРУДНИКУ, который его открыл.
    """
    if "owner" in ids:
        return ids["owner"]
    async with async_session_maker() as db:
        user = User(email=f"crm-owner-{ids['studio']}@example.com",
                    hashed_password="x", name="Owner")
        db.add(user)
        await db.flush()
        db.add(StudioMember(user_id=user.id, studio_id=ids["studio"], role="owner",
                            status="active", name="Owner", last_name="O"))
        await db.commit()
        ids["owner"] = user.id
        return user.id


def _app(ids, role="owner"):
    app = FastAPI()
    app.state.limiter = limiter
    app.include_router(schedule_router, prefix="/schedule")

    async def database():
        async with async_session_maker() as session:
            yield session

    async def context():
        async with async_session_maker() as session:
            user = await session.get(User, ids["owner"])
        return StudioContext(user=user, studio_id=ids["studio"], role=role)

    app.dependency_overrides[get_db] = database
    app.dependency_overrides[get_studio_context] = context
    return app


def _client(app):
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def _lesson_row(studio_id):
    async with async_session_maker() as db:
        return (await db.execute(select(Lesson).where(
            Lesson.studio_id == studio_id, Lesson.booking_mode == "resource",
            Lesson.status != "cancelled"))).scalar_one()


def test_crm_books_moves_and_cancels_an_individual_service_over_http(monkeypatch):
    """Полный CRM-сценарий одним проходом по HTTP.

    Availability → quote (с client_id и hall_id) → confirm → список журнала →
    перенос по expected_version → отмена. На каждом шаге сверяется не только
    код ответа, но и строка в базе.
    """
    moment = booking_quotes.utcnow
    monkeypatch.setattr(booking_quotes, "utcnow", lambda now=None: moment(now or resource.NOW))

    async def run():
        ids = await resource.seed()
        try:
            await _owner(ids)
            app = _app(ids)
            async with _client(app) as http:
                day = str(resource.hours.DAY)
                scope = {"service_id": ids["service"], "branch_id": ids["branch_a"],
                         "date_from": day, "date_to": day}

                # 1. Свободное время считает сервер.
                free = await http.get("/schedule/availability", params=scope)
                assert free.status_code == 200, free.text
                slots = free.json()["slots"]
                assert slots, free.text
                first = slots[0]
                assert set(first) == {"starts_at", "local_start", "tz_iana", "teacher_ids"}

                # 2. Условия — тоже сервер. Клиент их не диктует.
                quote = await http.post("/schedule/booking-quotes", json={
                    "booking_mode": "resource", "client_id": ids["client"],
                    "service_id": ids["service"], "branch_id": ids["branch_a"],
                    "starts_at": first["starts_at"],
                })
                assert quote.status_code == 201, quote.text
                key = quote.json()["quote_id"]

                # 3. Подтверждение создаёт интервал и бронь В ОДНОЙ транзакции.
                created = await http.post("/schedule/bookings", json={"quote_id": key})
                assert created.status_code == 200, created.text
                booking = created.json()
                assert booking["booking_mode"] == "resource" and booking["status"] == "active"

                lesson = await _lesson_row(ids["studio"])
                assert lesson.id == booking["lesson_id"]

                # 4. КЛЮЧЕВОЕ: журнал видит фактические поля, а не умолчания схемы.
                listed = await http.get("/schedule/lessons", params={
                    "date_from": day, "date_to": str(resource.hours.DAY + timedelta(days=1))})
                assert listed.status_code == 200, listed.text
                card = next(row for row in listed.json() if row["id"] == lesson.id)
                assert card["booking_mode"] == "resource", card
                assert card["version"] == lesson.version, (card["version"], lesson.version)
                assert card["branch_id"] == lesson.branch_id
                assert card["tz_iana"] == lesson.tz_iana
                assert card["total_spots"] == 1

                # 5. Перенос: та же бронь, новое время, версия выросла.
                later = slots[-1]
                assert later["starts_at"] != first["starts_at"], "нужен второй слот для переноса"
                move_quote = await http.post(
                    f'/schedule/reservations/{booking["reservation_id"]}/reschedule-quotes',
                    json={"booking_mode": "resource", "service_id": ids["service"],
                          "branch_id": ids["branch_a"], "starts_at": later["starts_at"]})
                assert move_quote.status_code == 201, move_quote.text

                stale = await http.post(
                    f'/schedule/reservations/{booking["reservation_id"]}/reschedule',
                    json={"quote_id": move_quote.json()["quote_id"], "expected_version": 99})
                assert stale.status_code == 409, stale.text
                assert stale.json()["detail"]["code"] == "VERSION_CONFLICT", stale.text

                moved = await http.post(
                    f'/schedule/reservations/{booking["reservation_id"]}/reschedule',
                    json={"quote_id": move_quote.json()["quote_id"],
                          "expected_version": card["version"]})
                assert moved.status_code == 200, moved.text
                assert moved.json()["reservation_id"] == booking["reservation_id"], "бронь обязана уцелеть"
                assert moved.json()["version"] == card["version"] + 1

                after = await _lesson_row(ids["studio"])
                assert after.id == lesson.id, "перенос обязан править ТОТ ЖЕ интервал"
                assert after.start_time != lesson.start_time

                # Журнал сразу отдаёт новую версию — иначе следующий перенос
                # ушёл бы со устаревшим expected_version и получил 409.
                relisted = await http.get("/schedule/lessons", params={
                    "date_from": day, "date_to": str(resource.hours.DAY + timedelta(days=1))})
                assert next(r for r in relisted.json() if r["id"] == lesson.id)["version"] == after.version

                # 6. Отмена конкретной брони освобождает интервал.
                cancelled = await http.post(
                    f'/schedule/reservations/{booking["reservation_id"]}/cancel')
                assert cancelled.status_code == 200, cancelled.text
                assert cancelled.json()["status"] == "cancelled"
                async with async_session_maker() as db:
                    assert (await db.get(Lesson, lesson.id)).status == "cancelled"
        finally:
            await resource.cleanup(ids)
    asyncio.run(run())


def test_crm_rejects_client_supplied_terms_and_foreign_scope(monkeypatch):
    """Сервер сам отклоняет всё, чего клиент диктовать не вправе."""
    moment = booking_quotes.utcnow
    monkeypatch.setattr(booking_quotes, "utcnow", lambda now=None: moment(now or resource.NOW))

    async def run():
        ids = await resource.seed()
        try:
            await _owner(ids)
            app = _app(ids)
            async with _client(app) as http:
                day = str(resource.hours.DAY)
                free = await http.get("/schedule/availability", params={
                    "service_id": ids["service"], "branch_id": ids["branch_a"],
                    "date_from": day, "date_to": day})
                start = free.json()["slots"][0]["starts_at"]
                base = {"booking_mode": "resource", "client_id": ids["client"],
                        "service_id": ids["service"], "branch_id": ids["branch_a"],
                        "starts_at": start}

                # Цена, длительность и вместимость — не поля запроса.
                for field, value in [("price", 1), ("duration_min", 5),
                                     ("total_spots", 9), ("studio_id", 1)]:
                    bad = await http.post("/schedule/booking-quotes", json={**base, field: value})
                    assert bad.status_code == 422, (field, bad.text)

                # Чужой мастер: этот специалист услугу не оказывает.
                async with async_session_maker() as db:
                    outsider = User(email=f"crm-out-{ids['studio']}@example.com",
                                    hashed_password="x", name="X")
                    db.add(outsider)
                    await db.flush()
                    db.add(StudioMember(user_id=outsider.id, studio_id=ids["studio"],
                                        role="trainer", status="active", name="X", last_name="X"))
                    await db.commit()
                    outsider_id = outsider.id
                foreign = await http.post("/schedule/booking-quotes",
                                          json={**base, "teacher_id": outsider_id})
                assert foreign.status_code == 409, foreign.text

                # Время не из ответа availability — тоже отказ.
                shifted = await http.post("/schedule/booking-quotes", json={
                    **base, "starts_at": start.replace("T0", "T2") if "T0" in start else start})
                assert shifted.status_code in (409, 422), shifted.text

                # Просроченный quote не исполняется.
                fresh = await http.post("/schedule/booking-quotes", json=base)
                assert fresh.status_code == 201, fresh.text
                monkeypatch.setattr(booking_quotes, "utcnow",
                                    lambda now=None: moment(now or resource.NOW + timedelta(minutes=10)))
                expired = await http.post("/schedule/bookings",
                                          json={"quote_id": fresh.json()["quote_id"]})
                assert expired.status_code == 409, expired.text
                assert expired.json()["detail"]["code"] == "QUOTE_EXPIRED", expired.text
                async with async_session_maker() as db:
                    assert (await db.execute(select(Reservation.id).join(Lesson).where(
                        Lesson.studio_id == ids["studio"]))).first() is None, \
                        "просроченный quote не должен оставлять брони"
        finally:
            await resource.cleanup(ids)
    asyncio.run(run())


def test_admin_may_book_but_trainer_may_not(monkeypatch):
    """AC-24: роль проверяется сервером, а не пунктом меню."""
    moment = booking_quotes.utcnow
    monkeypatch.setattr(booking_quotes, "utcnow", lambda now=None: moment(now or resource.NOW))

    async def run():
        ids = await resource.seed()
        try:
            await _owner(ids)
            day = str(resource.hours.DAY)
            scope = {"service_id": ids["service"], "branch_id": ids["branch_a"],
                     "date_from": day, "date_to": day}
            async with _client(_app(ids, role="trainer")) as http:
                assert (await http.get("/schedule/availability", params=scope)).status_code == 403
                assert (await http.post("/schedule/booking-quotes", json={
                    "booking_mode": "resource", "client_id": ids["client"],
                    "service_id": ids["service"], "branch_id": ids["branch_a"],
                    "starts_at": "2027-06-16T08:00:00Z"})).status_code == 403
            async with _client(_app(ids, role="admin")) as http:
                assert (await http.get("/schedule/availability", params=scope)).status_code == 200
        finally:
            await resource.cleanup(ids)
    asyncio.run(run())


def test_individual_service_cannot_be_scheduled_as_an_event(monkeypatch):
    """§4.4: resource-услугу нельзя поставить в расписание событием.

    Список услуг в форме «создать занятие» её уже не предлагает, но закрывать
    надо МАРШРУТ: этим же путём ходят прямой HTTP и инструменты ассистента
    (`ai_tools.create_lesson` / `update_lesson` вызывают эти самые функции).
    Иначе индивидуальная услуга появлялась бы групповым занятием с чужой
    механикой — вместимостью, буферами и «местами», которых у неё нет.
    """
    moment = booking_quotes.utcnow
    monkeypatch.setattr(booking_quotes, "utcnow", lambda now=None: moment(now or resource.NOW))

    async def run():
        ids = await resource.seed()
        try:
            await _owner(ids)
            async with _client(_app(ids)) as http:
                start = (resource.hours.DAY - timedelta(days=1)).isoformat() + "T10:00:00"

                created = await http.post("/schedule/lessons", json={
                    "service_id": ids["service"], "teacher_id": ids["teacher"],
                    "start_time": start, "duration_min": 60})
                assert created.status_code == 409, created.text
                assert created.json()["detail"]["code"] == "SERVICE_IS_INDIVIDUAL", created.text

                async with async_session_maker() as db:
                    assert (await db.execute(select(Lesson.id).where(
                        Lesson.studio_id == ids["studio"]))).first() is None,                         "отказ не должен оставлять занятие в базе"

                # Событие из обычной услуги — создаётся, и подменить его услугу
                # на индивидуальную тоже нельзя.
                async with async_session_maker() as db:
                    from models import Service
                    plain = Service(studio_id=ids["studio"], name="Group", price=0,
                                    duration_min=60, booking_mode="event")
                    db.add(plain)
                    await db.commit()
                    plain_id = plain.id

                ok = await http.post("/schedule/lessons", json={
                    "service_id": plain_id, "teacher_id": ids["teacher"],
                    "start_time": start, "duration_min": 60})
                assert ok.status_code == 201, ok.text
                lesson_id = ok.json()["id"]

                swapped = await http.patch(f"/schedule/lessons/{lesson_id}",
                                           json={"service_id": ids["service"]})
                assert swapped.status_code == 409, swapped.text
                assert swapped.json()["detail"]["code"] == "SERVICE_IS_INDIVIDUAL", swapped.text
                async with async_session_maker() as db:
                    assert (await db.get(Lesson, lesson_id)).service_id == plain_id
        finally:
            await resource.cleanup(ids)
    asyncio.run(run())
