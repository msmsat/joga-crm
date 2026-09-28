"""Итог индивидуальной записи в Журнале: «Оплата» и «Посещение».

Запись создаётся неоплаченной и неотмеченной; на итоге можно дать свою скидку
на это занятие, выбрать способ оплаты (наличные или карта) с баллами и отметить
приход. Проверяется то, за что отвечают деньги и экран:
  * своя скидка записи без оплаты ложится в долг, и оплата позже берёт её сама
    (0 — снять явно);
  * оплата при записи проводит выбранный способ и баллы тем же ядром кассы;
  * чек показывает приглашения клиента;
  * список занятий считает отмеченных «пришёл» — по нему сетка рисует неявку.

Запуск из back/:  python -m pytest tests/test_booking_settle.py -q
"""
import asyncio

from sqlalchemy import select

import test_first_lesson_payment as flp
import test_hybrid_crm_api as crm
import test_journal_lesson_card as card
import test_resource_booking as resource
from database import async_session_maker
from models import Client, ClientPayment, Operation, ReferralRecord, Reservation, StudioReferralConfig

enabled = resource.enabled
frozen_clock = flp.frozen_clock


def test_unpaid_booking_keeps_its_own_discount_until_payment():
    async def run():
        ids = await flp._seed(percent=50)
        try:
            async with crm._client(flp._app(ids)) as http:
                key = (await flp._quote(http, ids, first_lesson=False))["quote_id"]
                for wrong in (0, 101):
                    refused = await http.post("/schedule/bookings", json={
                        "quote_id": key, "manual_discount_percent": wrong})
                    assert refused.status_code == 422, refused.text
                created = await http.post("/schedule/bookings", json={
                    "quote_id": key, "manual_discount_percent": 20})
                assert created.status_code == 200, created.text

                reservation = await flp._reservation(ids)
                assert reservation.manual_discount_percent == 20
                async with async_session_maker() as db:
                    debt = await db.get(ClientPayment, reservation.debt_payment_id)
                assert (debt.status, debt.amount) == ("pending", 800), "долг — уже со скидкой"

                detail = (await http.get(f"/schedule/lessons/{reservation.lesson_id}")).json()
                row = detail["booked_clients"][0]
                assert (row["debt"], row["manual_discount_percent"]) == (800, 20)

                url = f"/schedule/reservations/{reservation.id}"
                kept = (await http.post(f"{url}/payment-preview", json={})).json()
                assert kept["total"] == 800 and kept["manual_discount_percent"] == 20
                dropped = (await http.post(f"{url}/payment-preview", json={"manual_discount_percent": 0})).json()
                assert dropped["total"] == 1000 and dropped["manual_discount_percent"] is None

                # Кассир о скидке не говорит (ассистент, старое окно) — берётся та,
                # что дали при записи.
                paid = await http.post(f"{url}/pay", json={"payment_method": "cash", "expected_total": 800})
                assert paid.status_code == 200, paid.text
            async with async_session_maker() as db:
                debt = await db.get(ClientPayment, reservation.debt_payment_id)
            assert (debt.status, debt.amount) == ("success", 800)
        finally:
            await flp._cleanup(ids)
    asyncio.run(run())


def test_full_discount_leaves_no_debt():
    async def run():
        ids = await flp._seed(percent=50)
        try:
            async with crm._client(flp._app(ids)) as http:
                key = (await flp._quote(http, ids, first_lesson=False))["quote_id"]
                created = await http.post("/schedule/bookings", json={
                    "quote_id": key, "manual_discount_percent": 100})
                assert created.status_code == 200, created.text
            reservation = await flp._reservation(ids)
            assert reservation.debt_payment_id is None and reservation.manual_discount_percent == 100
        finally:
            await flp._cleanup(ids)
    asyncio.run(run())


def test_booking_is_paid_by_card_with_points_in_one_transaction():
    async def run():
        ids = await flp._seed(percent=50)
        try:
            await card._give_points(ids, 100)
            async with crm._client(flp._app(ids)) as http:
                key = (await flp._quote(http, ids))["quote_id"]
                receipt = await flp._preview(http, key, use_bonuses=True)
                assert receipt["bonuses_available"] == 100 and receipt["bonuses_value"] > 0
                assert receipt["total"] == 500 - receipt["bonuses_value"]
                created = await http.post("/schedule/bookings", json={"quote_id": key, "payment": {
                    "use_bonuses": True, "method": "transfer", "expected_total": receipt["total"]}})
                assert created.status_code == 200, created.text

            reservation = await flp._reservation(ids)
            async with async_session_maker() as db:
                debt = await db.get(ClientPayment, reservation.debt_payment_id)
                income = (await db.execute(select(Operation).where(
                    Operation.studio_id == ids["studio"], Operation.type == "in"))).scalars().all()
            assert (debt.status, debt.amount) == ("success", receipt["total"])
            assert [(op.amount, op.method) for op in income] == [(receipt["total"], "transfer")], income
            assert reservation.payment_breakdown["method"] == "transfer"
        finally:
            await flp._cleanup(ids)
    asyncio.run(run())


def test_receipt_shows_who_invited_the_client():
    async def run():
        ids = await flp._seed(percent=50)
        try:
            async with async_session_maker() as db:
                friend = Client(studio_id=ids["studio"], name="Olga", last_name="K")
                db.add(friend)
                await db.flush()
                db.add(StudioReferralConfig(studio_id=ids["studio"], is_enabled=True, referrer_bonus=300,
                                            new_client_discount=10, bonus_type="points"))
                db.add(ReferralRecord(studio_id=ids["studio"], referrer_client_id=friend.id,
                                      referred_client_id=ids["client"]))
                await db.commit()
            async with crm._client(flp._app(ids)) as http:
                key = (await flp._quote(http, ids))["quote_id"]
                referral = (await flp._preview(http, key))["referral"]
            assert referral == {"invited_by": "Olga K", "discount_percent": 10, "invited_count": 0,
                                "invite_bonus": 300, "invite_bonus_type": "points"}
        finally:
            async with async_session_maker() as db:
                await db.execute(ReferralRecord.__table__.delete().where(ReferralRecord.studio_id == ids["studio"]))
                await db.execute(StudioReferralConfig.__table__.delete().where(
                    StudioReferralConfig.studio_id == ids["studio"]))
                await db.commit()
            await flp._cleanup(ids)
    asyncio.run(run())


def test_lesson_list_counts_who_came():
    async def run():
        ids = await flp._seed(percent=50)
        try:
            async with crm._client(flp._app(ids)) as http:
                reservation = await card._booked_with_debt(http, ids)
                day = str(resource.hours.DAY)
                params = {"date_from": day, "date_to": day}

                async def counted():
                    lessons = (await http.get("/schedule/lessons", params=params)).json()
                    row = next(l for l in lessons if l["id"] == reservation.lesson_id)
                    return row["booked_count"], row["attended_count"]

                assert await counted() == (1, 0)
                attended = await http.patch(f"/schedule/reservations/{reservation.id}/attend")
                assert attended.status_code == 200, attended.text
                assert await counted() == (1, 1)
            async with async_session_maker() as db:
                assert (await db.get(Reservation, reservation.id)).status == "attended"
        finally:
            await flp._cleanup(ids)
    asyncio.run(run())
