"""Кого администратор может записать на групповое занятие и чем покрыта запись.

GET /schedule/lessons/{id}/eligible-clients раньше отдавал только владельцев
подходящего абонемента: у студии, ещё не продавшей ни одного, окно «Добавить
клиента» в Журнале было пустым при десятках клиентов в базе. Теперь за стойкой
записывают любого активного клиента — без абонемента и первого занятия запись
встаёт долгом «оплата на месте», как у индивидуальной записи
(`booking_quotes.funding_rule`), — а список называет основание каждого.

Чужая студия проверяется фейковой сессией, остальное — на настоящей базе
(localyoga_test, как test_journal_time_rules); роль — через HTTP, потому что
её стережёт зависимость роутера (require_role), а не тело функции.

Запуск из back/:  python -m pytest tests/test_eligible_clients.py
"""
import asyncio
import os
import time as _time
from datetime import date, datetime, timedelta

from fastapi import FastAPI, HTTPException
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, update

import routers.clients.profiles as P
import routers.schedule.lessons as L
import routers.schedule.reservations as RES
from database import async_session_maker, get_db
from dependencies import StudioContext, get_studio_context
from models import (
    Client, ClientPayment, ClientSubscription, Lesson, Reservation, Service, Studio,
    StudioBookingSettings, StudioSubscriptionProgramConfig, SubscriptionPackage, User,
)
from ratelimit import limiter
from routers.schedule.router import router as schedule_router
from schemas.schedule.reservations import BookingCreate, ReservationCreate


# ─── Чужая студия: фейковая сессия отдаёт ответ get_scoped_lesson ─────────────

class _FakeUser:
    id = 1


class _R:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class _DB:
    def __init__(self, seq):
        self._seq = list(seq)

    async def execute(self, _q):
        return _R(self._seq.pop(0))


def test_foreign_studio_404():
    ctx = StudioContext(user=_FakeUser(), studio_id=1, role="owner")
    try:
        asyncio.run(L.get_eligible_clients(1, ctx, _DB([None])))
        raise AssertionError("ожидали 404")
    except HTTPException as e:
        assert e.status_code == 404


# ─── Правила: настоящая база ─────────────────────────────────────────────────

PRICE = 500


def _lesson_row(studio_id, service_id, teacher_id, *, price, days):
    start = datetime.combine(date.today() + timedelta(days=days), datetime.min.time()).replace(hour=10)
    return Lesson(
        studio_id=studio_id, name="Йога", teacher_name="T", service_id=service_id,
        teacher_id=teacher_id, start_time=start, tz_iana="Europe/Prague", duration_min=60,
        price=price, level="", equipment="", total_spots=8, status="confirmed",
        booking_mode="event",
    )


async def _seed(*, price=PRICE, trial=False, percent=100) -> dict:
    stamp = f"{int(_time.time() * 1000)}-{os.getpid()}"
    async with async_session_maker() as db:
        studio = Studio(name=f"TEST-ELIGIBLE-{stamp}", tz_iana="Europe/Prague", currency="CZK")
        db.add(studio)
        await db.flush()
        db.add(StudioBookingSettings(studio_id=studio.id, trial_lesson_free=trial,
                                     trial_discount_percent=percent))
        yoga = Service(studio_id=studio.id, name="Йога", duration_min=60, price=price)
        pilates = Service(studio_id=studio.id, name="Пилатес", duration_min=60, price=price)
        teacher = User(email=f"elig-{stamp}@test.local", hashed_password="x", name="T")
        db.add_all([yoga, pilates, teacher])
        await db.flush()
        config = StudioSubscriptionProgramConfig(studio_id=studio.id, is_enabled=True)
        db.add(config)
        await db.flush()
        pilates_only = SubscriptionPackage(
            studio_id=studio.id, config_id=config.id, name="Пилатес 8", class_count=8,
            price=4000, per_visit_price=PRICE, service_ids=[pilates.id])
        db.add(pilates_only)

        people = {}
        for key, name, active in (("anna", "Анна", True), ("boris", "Борис", True),
                                  ("vera", "Вера", True), ("gleb", "Глеб", True),
                                  ("dina", "Дина", False), ("egor", "Егор", True)):
            people[key] = Client(studio_id=studio.id, name=name, is_active=active,
                                 phone=f"+42077700{len(people):04d}")
        db.add_all(people.values())
        await db.flush()

        expires = date.today() + timedelta(days=60)
        anna_sub = ClientSubscription(client_id=people["anna"].id, type="Йога", total_classes=10,
                                      used_classes=3, expires_at=expires, status="active")
        db.add_all([
            anna_sub,
            # Абонемент только на пилатес — на йогу он не пускает.
            ClientSubscription(client_id=people["boris"].id, type="Пилатес", total_classes=8,
                               used_classes=0, expires_at=expires, status="active",
                               package_id=pilates_only.id),
        ])
        lesson = _lesson_row(studio.id, yoga.id, teacher.id, price=price, days=2)
        earlier = _lesson_row(studio.id, yoga.id, teacher.id, price=price, days=-5)
        db.add_all([lesson, earlier])
        await db.flush()
        db.add_all([
            Reservation(client_id=people["egor"].id, lesson_id=lesson.id, spot_number=1, status="active"),
            # Глеб уже ходил — первое занятие ему не положено.
            Reservation(client_id=people["gleb"].id, lesson_id=earlier.id, spot_number=1, status="attended"),
        ])
        await db.commit()
        return {"studio": studio.id, "user": teacher.id, "lesson": lesson.id,
                "anna_sub": anna_sub.id, **{key: c.id for key, c in people.items()}}


async def _cleanup(ids) -> None:
    async with async_session_maker() as db:
        # Студию уносит каскад БД (клиенты, занятия, брони, долги, абонементы);
        # тренер — пользователь платформы, его отдельно.
        await db.execute(delete(Studio).where(Studio.id == ids["studio"]))
        await db.execute(delete(User).where(User.id == ids["user"]))
        await db.commit()


def _ctx(ids, role="owner"):
    return StudioContext(user=type("U", (), {"id": ids["user"]})(), studio_id=ids["studio"], role=role)


async def _eligible(ids):
    async with async_session_maker() as db:
        return await L.get_eligible_clients(ids["lesson"], _ctx(ids), db)


def _run(scenario, **seed):
    async def run():
        ids = await _seed(**seed)
        try:
            await scenario(ids)
        finally:
            await _cleanup(ids)
    asyncio.run(run())


def _http(ids, role):
    """Роутер расписания с подменённой ролью — require_role работает по-настоящему."""
    app = FastAPI()
    app.state.limiter = limiter
    app.include_router(schedule_router, prefix="/schedule")

    async def database():
        async with async_session_maker() as session:
            yield session

    async def context():
        return _ctx(ids, role)

    app.dependency_overrides[get_db] = database
    app.dependency_overrides[get_studio_context] = context
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def test_trainer_books_on_own_lesson_but_gets_no_phone_numbers():
    """Тренер записывает клиентов на своё занятие (в посеве он его и ведёт), и
    выбирать ему есть из кого. Но список — вся база студии, а в Клиентах он
    видит только своих: контактов остальных запись на занятие ему не выдаёт."""
    async def scenario(ids):
        async with _http(ids, "trainer") as http:
            listed = await http.get(f"/schedule/lessons/{ids['lesson']}/eligible-clients")
        assert listed.status_code == 200 and len(listed.json()) == 4, listed.text
        assert all(row["phone"] is None for row in listed.json())
        async with _http(ids, "admin") as http:
            listed = await http.get(f"/schedule/lessons/{ids['lesson']}/eligible-clients")
        assert listed.status_code == 200 and len(listed.json()) == 4, listed.text
        assert all(row["phone"] for row in listed.json())
    _run(scenario)


def test_everyone_active_is_listed_with_how_the_booking_is_covered():
    async def scenario(ids):
        rows = await _eligible(ids)
        by_id = {row.id: row for row in rows}
        assert ids["egor"] not in by_id, "уже записанный в списке"
        assert ids["dina"] not in by_id, "неактивного домен записи не пускает"
        assert (by_id[ids["anna"]].funding, by_id[ids["anna"]].classes_left) == ("subscription", 7)
        assert by_id[ids["boris"]].funding == "pay", "абонемент на пилатес не покрывает йогу"
        assert by_id[ids["vera"]].funding == "pay"
        assert by_id[ids["gleb"]].funding == "pay"
        assert rows[0].id == ids["anna"], "покрытые абонементом — первыми"
        assert [row.id for row in rows[1:]] == [ids["boris"], ids["vera"], ids["gleb"]], "дальше по имени"
    _run(scenario)


def test_first_lesson_is_named_only_for_clients_without_any_booking():
    async def scenario(ids):
        by_id = {row.id: row for row in await _eligible(ids)}
        assert (by_id[ids["vera"]].funding, by_id[ids["vera"]].trial_percent) == ("trial", 50)
        assert by_id[ids["boris"]].funding == "trial", "чужой абонемент первому занятию не мешает"
        assert by_id[ids["gleb"]].funding == "pay", "у Глеба уже была бронь"
        assert by_id[ids["anna"]].funding == "subscription", "абонемент важнее подарка"
    _run(scenario, trial=True, percent=50)


def test_free_lesson_costs_nothing_to_anyone():
    async def scenario(ids):
        by_id = {row.id: row for row in await _eligible(ids)}
        assert by_id[ids["vera"]].funding == "free"
        assert by_id[ids["anna"]].funding == "subscription"
    _run(scenario, price=0)


def test_cancelled_lesson_lists_nobody():
    async def scenario(ids):
        async with async_session_maker() as db:
            await db.execute(update(Lesson).where(Lesson.id == ids["lesson"]).values(status="cancelled"))
            await db.commit()
        assert await _eligible(ids) == []
    _run(scenario)


def test_journal_books_a_client_without_subscription_with_a_debt():
    async def scenario(ids):
        async with async_session_maker() as db:
            booked = await RES.create_reservation(
                ReservationCreate(client_id=ids["vera"], lesson_id=ids["lesson"]), _ctx(ids), db)
        assert booked.status == "active"
        async with async_session_maker() as db:
            row = await db.get(Reservation, booked.id)
            assert row.subscription_id is None
            debt = await db.get(ClientPayment, row.debt_payment_id)
            assert (debt.amount, debt.status) == (PRICE, "pending"), "оплата на месте — долг по цене занятия"

        # С абонементом — списание, долга нет.
        async with async_session_maker() as db:
            covered = await RES.create_reservation(
                ReservationCreate(client_id=ids["anna"], lesson_id=ids["lesson"]), _ctx(ids), db)
        async with async_session_maker() as db:
            row = await db.get(Reservation, covered.id)
            assert (row.subscription_id, row.debt_payment_id) == (ids["anna_sub"], None)
    _run(scenario)


def test_client_card_books_by_the_same_rule():
    async def scenario(ids):
        staff = type("U", (), {"id": ids["user"], "name": "Админ", "last_name": None})()
        async with async_session_maker() as db:
            created = await P.book_lesson(ids["gleb"], BookingCreate(lesson_id=ids["lesson"]),
                                          _ctx(ids), staff, db)
        async with async_session_maker() as db:
            row = await db.get(Reservation, created.id)
            assert row.subscription_id is None and row.debt_payment_id is not None
    _run(scenario)
