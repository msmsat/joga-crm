"""Посещение по умолчанию — «пришёл» (services/attendance.py).

Проверяется то, за что отвечают деньги и отметка:
  * по окончании занятия неотмеченный становится пришедшим, а долг «оплата на
    месте» проводится наличными тем же движком кассы;
  * «не пришёл» после этого откатывает автозачисление: расход «Возвраты» гасит
    доход, долг снова открыт; «пришёл» — проводит заново;
  * тренер не может снять деньги, которые уже стоят в Финансах;
  * «не пришёл», поставленное до начала, автоматика не перебивает;
  * принятое кассиром не откатывается, а долг с придержанными кодами
    (сертификат, баллы…) автоматика оставляет кассиру;
  * закрытую бронь (в том числе всё прошлое после миграции) автоматика не трогает.

Занятие тестовой студии — в 2027 году, то есть в будущем по настоящим часам:
«до начала» проверяется через HTTP, «после конца» — через сервис с явным `now`.

Запуск из back/:  python -m pytest tests/test_attendance_autopilot.py -q
"""
import asyncio
from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import select

import test_first_lesson_payment as flp
import test_hybrid_crm_api as crm
import test_journal_lesson_card as card
import test_resource_booking as resource
from database import async_session_maker
from models import ClientPayment, Lesson, Operation, Reservation, Studio
from services import attendance, lesson_time, platform_fee

enabled = resource.enabled
frozen_clock = flp.frozen_clock

DEBT = 500  # первое занятие −50 % от 1000 (card._booked_with_debt)


async def _after_lesson(reservation_id: int) -> datetime:
    """Момент через минуту после конца занятия брони, naive UTC."""
    async with async_session_maker() as db:
        reservation = await db.get(Reservation, reservation_id)
        lesson = await db.get(Lesson, reservation.lesson_id)
        studio = await db.get(Studio, lesson.studio_id)
        instant = lesson_time.resolve(lesson, studio).instant
        assert instant is not None, "у индивидуальной записи всегда есть снимок зоны"
        return attendance._utcnow(instant) + timedelta(minutes=lesson.duration_min + 1)


async def _state(reservation_id: int):
    async with async_session_maker() as db:
        reservation = await db.get(Reservation, reservation_id)
        debt = await db.get(ClientPayment, reservation.debt_payment_id) if reservation.debt_payment_id else None
        lesson = await db.get(Lesson, reservation.lesson_id)
        ops = (await db.execute(select(Operation).where(Operation.studio_id == lesson.studio_id)
                                .order_by(Operation.id))).scalars().all()
        return reservation, debt, [(op.type, op.amount, op.method, op.category) for op in ops]


async def _mark(reservation_id: int, attended: bool, now: datetime, role: str = "owner"):
    async with async_session_maker() as db:
        reservation = await db.get(Reservation, reservation_id)
        lesson = await db.get(Lesson, reservation.lesson_id)
        studio = await db.get(Studio, lesson.studio_id)
        return await attendance.mark(db, studio=studio, lesson=lesson, reservation_id=reservation_id,
                                     attended=attended, role=role, now=now)


async def _autopilot(now: datetime) -> int:
    async with async_session_maker() as db:
        return await attendance.run_autopilot(db, now=now)


def test_lesson_end_marks_visit_and_takes_the_debt_in_cash():
    async def run():
        ids = await flp._seed(percent=50)
        try:
            async with crm._client(flp._app(ids)) as http:
                booked = await card._booked_with_debt(http, ids)
            after = await _after_lesson(booked.id)

            # До конца занятия автоматика бронь не трогает.
            assert await _autopilot(after - timedelta(minutes=5)) == 0
            reservation, debt, ops = await _state(booked.id)
            assert (reservation.status, reservation.closed_at, debt.status) == ("active", None, "pending")

            assert await _autopilot(after) >= 1
            reservation, debt, ops = await _state(booked.id)
            assert reservation.status == "attended" and reservation.closed_at is not None
            assert reservation.auto_paid and not reservation.no_show
            assert (debt.status, debt.amount) == ("success", DEBT)
            assert ops == [("in", DEBT, "cash", "Услуги")]
            assert reservation.payment_breakdown["method"] == "cash"

            # Второй проход — ничего нового: бронь закрыта.
            await _autopilot(after + timedelta(minutes=1))
            assert (await _state(booked.id))[2] == ops
        finally:
            await flp._cleanup(ids)
    asyncio.run(run())


def test_no_show_reverses_the_automatic_cash_and_attended_takes_it_again():
    async def run():
        ids = await flp._seed(percent=50)
        try:
            async with crm._client(flp._app(ids)) as http:
                booked = await card._booked_with_debt(http, ids)
            after = await _after_lesson(booked.id)
            await _autopilot(after)

            # Тренер кассу не ведёт: деньги в Финансах он не снимет.
            with pytest.raises(HTTPException) as refused:
                await _mark(booked.id, False, after, role="trainer")
            assert refused.value.status_code == 403

            marked = await _mark(booked.id, False, after)
            assert (marked.status, marked.no_show, marked.auto_paid) == ("active", True, False)
            reservation, debt, ops = await _state(booked.id)
            assert (debt.status, debt.amount) == ("pending", DEBT), "неявка оставляет долг открытым"
            assert reservation.payment_breakdown is None
            assert ops == [("in", DEBT, "cash", "Услуги"), ("out", DEBT, "cash", platform_fee.REFUND_CATEGORY)]

            marked = await _mark(booked.id, True, after)
            assert (marked.status, marked.no_show, marked.auto_paid) == ("attended", False, True)
            reservation, debt, ops = await _state(booked.id)
            assert debt.status == "success"
            net = sum(amount if kind == "in" else -amount for kind, amount, _, _ in ops)
            assert net == DEBT, ops
        finally:
            await flp._cleanup(ids)
    asyncio.run(run())


def test_no_show_set_before_the_lesson_survives_its_end():
    async def run():
        ids = await flp._seed(percent=50)
        try:
            async with crm._client(flp._app(ids)) as http:
                booked = await card._booked_with_debt(http, ids)
                response = await http.patch(f"/schedule/reservations/{booked.id}/attendance",
                                            json={"attended": False})
                assert response.status_code == 200, response.text
                assert (response.json()["status"], response.json()["no_show"]) == ("active", True)

                detail = (await http.get(f"/schedule/lessons/{booked.lesson_id}")).json()
                row = detail["booked_clients"][0]
                assert (row["no_show"], row["auto_paid"]) == (True, False)

            after = await _after_lesson(booked.id)
            await _autopilot(after)
            reservation, debt, ops = await _state(booked.id)
            assert reservation.status == "active" and reservation.no_show
            assert reservation.closed_at is not None
            assert debt.status == "pending" and ops == []
        finally:
            await flp._cleanup(ids)
    asyncio.run(run())


def test_cash_taken_by_the_cashier_is_never_reversed():
    async def run():
        ids = await flp._seed(percent=50)
        try:
            async with crm._client(flp._app(ids)) as http:
                booked = await card._booked_with_debt(http, ids)
                paid = await http.post(f"/schedule/reservations/{booked.id}/pay",
                                       json={"payment_method": "cash", "expected_total": DEBT})
                assert paid.status_code == 200, paid.text
            after = await _after_lesson(booked.id)
            await _autopilot(after)
            reservation, _, ops = await _state(booked.id)
            assert reservation.status == "attended" and not reservation.auto_paid

            marked = await _mark(booked.id, False, after)
            assert marked.no_show and marked.status == "active"
            _, debt, after_ops = await _state(booked.id)
            assert debt.status == "success" and after_ops == ops, "деньги кассира — факт, не предположение"
        finally:
            await flp._cleanup(ids)
    asyncio.run(run())


def test_debt_with_held_codes_is_left_to_the_cashier():
    async def run():
        ids = await flp._seed(percent=50)
        try:
            async with crm._client(flp._app(ids)) as http:
                booked = await card._booked_with_debt(http, ids)
            async with async_session_maker() as db:
                reservation = await db.get(Reservation, booked.id)
                reservation.held_codes = {"use_bonuses": True}
                await db.commit()
            await _autopilot(await _after_lesson(booked.id))
            reservation, debt, ops = await _state(booked.id)
            assert reservation.status == "attended" and not reservation.auto_paid
            assert debt.status == "pending" and ops == []
        finally:
            await flp._cleanup(ids)
    asyncio.run(run())


def test_closed_reservation_is_left_alone():
    """Так миграция закрывает всё прошлое: неотмеченная бронь прошедшего
    занятия была неявкой — визитом и наличными она не станет."""
    async def run():
        ids = await flp._seed(percent=50)
        try:
            async with crm._client(flp._app(ids)) as http:
                booked = await card._booked_with_debt(http, ids)
            async with async_session_maker() as db:
                reservation = await db.get(Reservation, booked.id)
                reservation.closed_at = datetime(2026, 1, 1)
                await db.commit()
            await _autopilot(await _after_lesson(booked.id))
            reservation, debt, ops = await _state(booked.id)
            assert (reservation.status, debt.status, ops) == ("active", "pending", [])
        finally:
            await flp._cleanup(ids)
    asyncio.run(run())
