"""Индивидуальная запись в Журнале: перетаскивание, растягивание, смена мастера.

Всё это — один путь, перенос (services/resource_reschedule): quote → confirm с
версией. Здесь проверяется то, что добавило к нему перетаскивание:

* стойка переносит запись к мастеру с другой ценой — сумма клиента становится
  его ценой (тем же правилом скидок), долг «оплата на месте» — тоже;
* мастер тот же — цена записи прежняя, даже если прайс мастера с тех пор
  поменялся: клиент записывался на эту сумму;
* клиент к мастеру с другой ценой себя не переносит — иначе записался бы к
  дешёвому, оплатил и перенёсся к дорогому;
* растягивание меняет длительность, но не цену, и следующий перенос её не
  теряет;
* растянуть поверх следующей записи нельзя;
* уже заплаченные деньги перенос не двигает, а сообщает о них.

Реальная БД, стенд test_resource_booking. Запуск из back/:
    python -m pytest tests/test_journal_resource_moves.py -q
"""
import asyncio
from datetime import datetime, timedelta
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import delete, insert, update

import test_resource_booking as resource
import test_resource_hours as hours
from database import async_session_maker
from models import ClientPayment, Lesson, Reservation, StaffBranchAssignment, StaffWorkingHours, StudioMember, User
from models.base import user_services
from routers.schedule.hybrid import _moment
from schemas.schedule import hybrid
from services import booking_quotes as quotes, resource_booking, resource_reschedule as moves

enabled = resource.enabled


async def _seed() -> dict:
    """Стрижка 1000 в Каталоге. Анна (мастер стенда) берёт 1400, Борис — 800."""
    ids = await resource.seed(price=1000)
    async with async_session_maker() as db:
        owner = User(email=f"jrm-owner-{ids['studio']}@test.local", hashed_password="x", name="O")
        boris = User(email=f"jrm-boris-{ids['studio']}@test.local", hashed_password="x", name="Boris")
        db.add_all([owner, boris])
        await db.flush()
        db.add_all([
            StudioMember(user_id=owner.id, studio_id=ids["studio"], role="owner",
                         status="active", name="O"),
            StudioMember(user_id=boris.id, studio_id=ids["studio"], role="trainer",
                         status="active", name="Boris", last_name="B"),
            StaffBranchAssignment(studio_id=ids["studio"], user_id=boris.id, branch_id=ids["branch_a"]),
            StaffWorkingHours(user_id=boris.id, studio_id=ids["studio"], day_of_week=hours.DAY.weekday(),
                              is_open=True, open_time="09:00", close_time="18:00"),
        ])
        await db.execute(update(user_services).where(
            user_services.c.user_id == ids["teacher"], user_services.c.service_id == ids["service"],
        ).values(price=1400))
        await db.execute(insert(user_services).values(user_id=boris.id, service_id=ids["service"], price=800))
        await db.commit()
        ids.update(owner=owner.id, boris=boris.id)
    return ids


async def _cleanup(ids: dict) -> None:
    await resource.cleanup(ids)
    async with async_session_maker() as db:
        await db.execute(delete(User).where(User.id.in_([ids["owner"], ids["boris"]])))
        await db.commit()


def _staff(ids):
    return quotes.Actor(ids["studio"], ids["client"], ids["owner"], "crm")


def _run(scenario):
    async def run():
        ids = await _seed()
        try:
            await scenario(ids)
        finally:
            await _cleanup(ids)
    asyncio.run(run())


async def _book(ids, *, hours_from_start=0) -> dict:
    """Запись к Анне из Журнала: стойка, «оплата на месте» — открывается долг."""
    request = resource.request(ids, teacher_id=ids["teacher"]).model_copy(
        update={"starts_at": resource.START + timedelta(hours=hours_from_start)})
    async with async_session_maker() as db:
        row = await quotes.create(db, _staff(ids), request, now=resource.NOW)
        await db.commit()
        key = row.id
    async with async_session_maker() as db:
        result = await resource_booking.confirm(db, key, _staff(ids), now=resource.NOW)
        await db.commit()
        return result


async def _move(ids, created, *, hours=1, teacher=None, duration=None, actor=None) -> dict:
    act = actor or _staff(ids)
    request = resource.request(ids, teacher_id=teacher or ids["teacher"]).model_copy(
        update={"starts_at": resource.START + timedelta(hours=hours)})
    async with async_session_maker() as db:
        lesson = await db.get(Lesson, created["lesson_id"])
        version = lesson.version
        row = await moves.create_quote(db, act, created["reservation_id"], request,
                                       now=resource.NOW, duration_min=duration)
        await db.commit()
        key = row.id
    async with async_session_maker() as db:
        result = await moves.confirm(db, act, created["reservation_id"], key, version, now=resource.NOW)
        await db.commit()
        return result


async def _state(created) -> tuple[Lesson, Reservation, ClientPayment | None]:
    async with async_session_maker() as db:
        lesson = await db.get(Lesson, created["lesson_id"])
        reservation = await db.get(Reservation, created["reservation_id"])
        debt = (await db.get(ClientPayment, reservation.debt_payment_id)
                if reservation.debt_payment_id else None)
        return lesson, reservation, debt


# ─── Смена мастера ───────────────────────────────────────────────────────────

def test_staff_move_to_another_master_takes_his_price_and_the_debt_follows():
    async def scenario(ids):
        created = await _book(ids)
        lesson, _, debt = await _state(created)
        assert (lesson.price, debt.amount) == (1400, 1400)

        result = await _move(ids, created, teacher=ids["boris"])
        lesson, _, debt = await _state(created)
        assert lesson.teacher_id == ids["boris"]
        assert (lesson.price, debt.amount, debt.status) == (800, 800, "pending")
        # Не заплачено — сообщать о возврате нечего, долг уже новый сам.
        assert result["repricing"] == {"previous": 1400, "current": 800, "paid": None}
    _run(scenario)


def test_same_master_keeps_the_booked_price_even_if_his_price_changed():
    """Анна подняла прайс до 1600 — перенос её клиента по времени цену не трогает."""
    async def scenario(ids):
        created = await _book(ids)
        async with async_session_maker() as db:
            await db.execute(update(user_services).where(
                user_services.c.user_id == ids["teacher"], user_services.c.service_id == ids["service"],
            ).values(price=1600))
            await db.commit()
        result = await _move(ids, created, hours=2)
        lesson, _, debt = await _state(created)
        assert (lesson.price, debt.amount) == (1400, 1400)
        assert "repricing" not in result
    _run(scenario)


def test_client_cannot_move_himself_to_a_master_with_another_price():
    async def scenario(ids):
        created = await _book(ids)
        with pytest.raises(HTTPException) as failure:
            await _move(ids, created, teacher=ids["boris"], actor=resource.actor(ids))
        assert failure.value.detail["code"] == "TERMS_CHANGED"
        lesson, _, _ = await _state(created)
        assert (lesson.teacher_id, lesson.price) == (ids["teacher"], 1400)
    _run(scenario)


def test_move_of_a_paid_booking_reports_what_was_paid_and_moves_no_money():
    """Долг уже погашен у стойки: 1400 заплачено, цена стала 800. Деньги —
    решение человека, система только говорит, сколько было и сколько стало."""
    async def scenario(ids):
        created = await _book(ids)
        _, reservation, _ = await _state(created)
        async with async_session_maker() as db:
            await db.execute(update(ClientPayment).where(
                ClientPayment.id == reservation.debt_payment_id).values(status="success"))
            await db.commit()
        result = await _move(ids, created, teacher=ids["boris"])
        lesson, _, payment = await _state(created)
        assert lesson.price == 800
        assert (payment.amount, payment.status) == (1400, "success")
        assert result["repricing"] == {"previous": 1400, "current": 800, "paid": 1400}
    _run(scenario)


# ─── Растягивание ────────────────────────────────────────────────────────────

def test_resize_changes_the_duration_and_not_the_price():
    async def scenario(ids):
        created = await _book(ids)
        result = await _move(ids, created, hours=0, duration=60)
        lesson, _, debt = await _state(created)
        assert (lesson.duration_min, lesson.price, debt.amount) == (60, 1400, 1400)
        assert "repricing" not in result
        # Следующий перенос по времени длительность записи не теряет — она
        # больше не каталожные 45 минут.
        await _move(ids, created, hours=3)
        lesson, _, _ = await _state(created)
        assert lesson.duration_min == 60
    _run(scenario)


def test_resize_over_the_next_booking_is_refused():
    async def scenario(ids):
        created = await _book(ids)                       # 10:00–10:45 (+15 буфер)
        await _book(ids, hours_from_start=2)             # 12:00
        with pytest.raises(HTTPException) as failure:
            await _move(ids, created, hours=0, duration=120)
        assert failure.value.detail["code"] == "SLOT_UNAVAILABLE"
        lesson, _, _ = await _state(created)
        assert lesson.duration_min == 45
    _run(scenario)


def test_client_cannot_change_the_duration():
    """Клиентская схема поля не знает, а сервис не верит и прямому вызову."""
    async def scenario(ids):
        created = await _book(ids)
        with pytest.raises(HTTPException) as failure:
            await _move(ids, created, duration=60, actor=resource.actor(ids))
        assert failure.value.detail["code"] == "TERMS_CHANGED"
    _run(scenario)
    with pytest.raises(ValidationError):
        hybrid.ResourceQuoteRequest(booking_mode="resource", service_id=1, branch_id=1,
                                    starts_at=resource.START, duration_min=60)


# ─── Запрос Журнала ──────────────────────────────────────────────────────────

def test_journal_sends_the_studios_wall_clock_time():
    """Журнал живёт в местном времени студии и шлёт его как есть; момент
    считает сервер — по зоне студии, а не браузера."""
    async def scenario(ids):
        wall = (resource.START + timedelta(hours=1)).astimezone(
            ZoneInfo("Europe/Prague")).replace(tzinfo=None)
        body = hybrid.CrmRescheduleQuoteRequest(
            booking_mode="resource", service_id=ids["service"], branch_id=ids["branch_a"],
            local_start=wall)
        async with async_session_maker() as db:
            request = await _moment(db, SimpleNamespace(studio_id=ids["studio"]), body)
        assert request.starts_at == resource.START + timedelta(hours=1)
    _run(scenario)


def test_journal_request_takes_exactly_one_moment():
    base = dict(booking_mode="resource", service_id=1, branch_id=1)
    with pytest.raises(ValidationError):
        hybrid.CrmRescheduleQuoteRequest(**base)
    with pytest.raises(ValidationError):
        hybrid.CrmRescheduleQuoteRequest(**base, starts_at=resource.START,
                                         local_start=datetime(2026, 9, 26, 10, 0))
