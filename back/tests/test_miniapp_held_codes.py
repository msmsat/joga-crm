"""Коды клиента при записи из мини-приложения (services/held_codes).

Клиент называет промокод, ваучер, баллы и депозит прямо при записи и платит
либо на месте, либо формой Stripe. Денег ещё нет, поэтому коды НЕ гасятся, а
держатся на брони. Проверяется то, за что отвечают деньги:
  * долг «оплата на месте» заводится уже с кодами, а занятый бронью ваучер,
    баллы и последний промокод второй раз не применить;
  * администратор жмёт «Оплатить», не вводя коды заново, — касса берёт их с
    брони и гасит;
  * отмена брони освобождает коды сама;
  * коды покрыли всё — оплата на ноль проводится сразу;
  * итог, который видел клиент, не сошёлся — брони нет вовсе;
  * онлайн: форма Stripe — на остаток, вебхук гасит коды тем же путём.

Запуск из back/:  python -m pytest tests/test_miniapp_held_codes.py -q
"""
import asyncio
from datetime import timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import update

import test_first_lesson_payment as flp
import test_hybrid_crm_api as crm
import test_journal_lesson_card as card
import test_resource_booking as resource
from database import async_session_maker
from models import Client, ClientLoyaltyCard, ClientPayment, GiftCertificate, Reservation, StudioPromoCode
from routers.checkout.router import perform_pay
from schemas.checkout import CheckoutPayRequest
from schemas.schedule import hybrid
from services import booking, booking_checkout, booking_quotes as quotes, resource_booking

enabled = resource.enabled
frozen_clock = flp.frozen_clock
PRICE = flp.PRICE


async def _seed():
    ids = await flp._seed(on=False)
    async with async_session_maker() as db:
        # Оплата на месте без телефона — PHONE_REQUIRED; клиенту он есть.
        await db.execute(update(Client).where(Client.id == ids["client"]).values(phone="+420700000001"))
        await db.commit()
    return ids


async def _voucher(ids, amount, suffix="A"):
    code = f"GC-{ids['studio']}-{suffix}"
    async with async_session_maker() as db:
        db.add(GiftCertificate(studio_id=ids["studio"], code=code, amount=amount,
                               cert_type="amount", status="active"))
        await db.commit()
    return code


async def _quote(ids, hours=0, method="venue"):
    request = hybrid.ResourceQuoteRequest(
        booking_mode="resource", service_id=ids["service"], branch_id=ids["branch_a"],
        starts_at=resource.START + timedelta(hours=hours), payment_method=method)
    async with async_session_maker() as db:
        row = await quotes.create(db, resource.actor(ids), request, now=resource.NOW)
        await db.commit()
        return row.id


async def _preview(ids, quote_id, **codes):
    async with async_session_maker() as db:
        return await booking_checkout.preview(db, resource.actor(ids), quote_id,
                                              hybrid.ClientPaymentCodes(**codes))


async def _book(ids, quote_id, **payment):
    """Ровно то, что делает POST /global/bookings: запись и удержание — одной транзакцией."""
    actor = resource.actor(ids)
    async with async_session_maker() as db:
        booked = await resource_booking.confirm(db, quote_id, actor, now=resource.NOW)
        try:
            await booking_checkout.hold(db, actor, booked, hybrid.ClientConfirmPayment(**payment))
        except Exception:
            await db.rollback()
            raise
        await db.commit()
        return booked


async def _row(reservation_id):
    async with async_session_maker() as db:
        reservation = await db.get(Reservation, reservation_id)
        debt = (await db.get(ClientPayment, reservation.debt_payment_id)
                if reservation.debt_payment_id else None)
        return reservation, debt


async def _certificate(code):
    async with async_session_maker() as db:
        return (await db.execute(GiftCertificate.__table__.select().where(
            GiftCertificate.code == code))).first()


def test_voucher_is_held_by_the_booking_and_paid_at_the_counter():
    async def run():
        ids = await _seed()
        try:
            code = await _voucher(ids, 300)
            key = await _quote(ids)
            receipt = await _preview(ids, key, certificate_code=code)
            assert receipt["certificate_applied"] == 300 and receipt["total"] == PRICE - 300

            booked = await _book(ids, key, certificate_code=code, expected_total=PRICE - 300)
            reservation, debt = await _row(booked["reservation_id"])
            assert (debt.status, debt.amount) == ("pending", PRICE - 300), "долг — уже с ваучером"
            assert reservation.held_codes["certificate_code"] == code
            assert (await _certificate(code)).status == "active", "ваучер не гасится без денег"

            # Тот же ваучер на вторую запись не ложится: он занят первой.
            second = await _preview(ids, await _quote(ids, hours=3), certificate_code=code)
            assert second["certificate_error"] == "loyalty.cert_used" and second["total"] == PRICE

            # Администратор кодов не вводит: касса берёт их с брони.
            async with crm._client(flp._app(ids)) as http:
                url = f"/schedule/reservations/{reservation.id}"
                check = (await http.post(f"{url}/payment-preview", json={})).json()
                assert check["total"] == PRICE - 300 and check["certificate_applied"] == 300
                paid = await http.post(f"{url}/pay", json={"payment_method": "cash",
                                                           "expected_total": PRICE - 300})
                assert paid.status_code == 200, paid.text

            reservation, debt = await _row(booked["reservation_id"])
            assert (debt.status, debt.amount) == ("success", PRICE - 300)
            assert reservation.held_codes is None
            assert reservation.payment_breakdown["certificate_applied"] == 300
            assert (await _certificate(code)).status == "used"
        finally:
            await flp._cleanup(ids)
    asyncio.run(run())


def test_cancelled_booking_releases_its_voucher():
    async def run():
        ids = await _seed()
        try:
            code = await _voucher(ids, 300)
            booked = await _book(ids, await _quote(ids), certificate_code=code, expected_total=PRICE - 300)
            async with async_session_maker() as db:
                await booking.cancel(db, studio_id=ids["studio"], reservation_id=booked["reservation_id"],
                                     client_id=ids["client"], actor="miniapp", by=booking.Actor.CLIENT)
                await db.commit()
            again = await _preview(ids, await _quote(ids, hours=3), certificate_code=code)
            assert again["certificate_applied"] == 300 and again["certificate_error"] is None
        finally:
            await flp._cleanup(ids)
    asyncio.run(run())


def test_codes_covering_everything_pay_the_booking_at_once():
    async def run():
        ids = await _seed()
        try:
            code = await _voucher(ids, PRICE * 2)
            booked = await _book(ids, await _quote(ids), certificate_code=code, expected_total=0)
            reservation, debt = await _row(booked["reservation_id"])
            assert debt.status == "success" and reservation.held_codes is None
            assert reservation.payment_breakdown["certificate_applied"] == PRICE
            assert (await _certificate(code)).status == "used"
        finally:
            await flp._cleanup(ids)
    asyncio.run(run())


def test_wrong_total_leaves_no_booking():
    async def run():
        ids = await _seed()
        try:
            code = await _voucher(ids, 300)
            with pytest.raises(HTTPException) as refused:
                await _book(ids, await _quote(ids), certificate_code=code, expected_total=PRICE)
            assert refused.value.detail["code"] == "AMOUNT_CHANGED"
            assert await flp._reservation(ids) is None
        finally:
            await flp._cleanup(ids)
    asyncio.run(run())


def test_held_points_are_not_spent_twice():
    async def run():
        ids = await _seed()
        try:
            await card._give_points(ids, 100)
            receipt = await _preview(ids, await _quote(ids), use_bonuses=True)
            assert receipt["bonuses_applied"] == 100
            key = await _quote(ids)
            await _book(ids, key, use_bonuses=True, expected_total=receipt["total"])
            other = await _preview(ids, await _quote(ids, hours=3), use_bonuses=True)
            assert other["bonuses_available"] == 0 and other["total"] == PRICE
            async with async_session_maker() as db:
                points = (await db.execute(ClientLoyaltyCard.__table__.select().where(
                    ClientLoyaltyCard.client_id == ids["client"]))).first().points_balance
            assert points == 100, "баллы держатся, а не списываются, пока денег нет"
        finally:
            await flp._cleanup(ids)
    asyncio.run(run())


def test_last_promo_use_is_held():
    async def run():
        ids = await _seed()
        try:
            async with async_session_maker() as db:
                db.add(StudioPromoCode(studio_id=ids["studio"], code="ONCE", discount_type="percent",
                                       value=10, usage_limit=1))
                await db.commit()
            receipt = await _preview(ids, await _quote(ids), promo_code="once")
            assert receipt["promo_valid"] is True and receipt["total"] == PRICE - 100
            await _book(ids, await _quote(ids), promo_code="once", expected_total=PRICE - 100)
            other = await _preview(ids, await _quote(ids, hours=3), promo_code="ONCE")
            assert other["promo_valid"] is False and other["total"] == PRICE
        finally:
            await flp._cleanup(ids)
    asyncio.run(run())


def test_online_payment_charges_the_rest_and_the_webhook_redeems_codes():
    async def run():
        ids = await _seed()
        try:
            code = await _voucher(ids, 300)
            booked = await _book(ids, await _quote(ids, method="card"), certificate_code=code,
                                 expected_total=PRICE - 300)
            reservation, debt = await _row(booked["reservation_id"])
            assert reservation.status == "hold" and reservation.held_codes["certificate_code"] == code
            async with async_session_maker() as db:
                reservation = await db.get(Reservation, booked["reservation_id"])
                assert await booking_checkout.held_total(db, ids["studio"], reservation) == PRICE - 300

            # Так проводит оплату вебхук (booking_payment.record_income): без кодов
            # в запросе, с суммой, которую уже списал Stripe.
            async with async_session_maker() as db:
                await perform_pay(
                    db, ids["studio"], None,
                    CheckoutPayRequest(client_id=ids["client"], product_id=booked["lesson_id"],
                                       product_type="lesson", payment_method="card"),
                    method="stripe", expected_total=PRICE - 300, reservation_id=booked["reservation_id"])
            reservation, _ = await _row(booked["reservation_id"])
            assert reservation.held_codes is None
            assert reservation.payment_breakdown["certificate_applied"] == 300
            assert (await _certificate(code)).status == "used"
        finally:
            await flp._cleanup(ids)
    asyncio.run(run())


def test_nothing_to_pay_online_is_refused():
    async def run():
        ids = await _seed()
        try:
            code = await _voucher(ids, PRICE)
            with pytest.raises(HTTPException) as refused:
                await _book(ids, await _quote(ids, method="card"), certificate_code=code, expected_total=0)
            assert refused.value.detail["code"] == "NOTHING_TO_PAY"
            assert await flp._reservation(ids) is None
        finally:
            await flp._cleanup(ids)
    asyncio.run(run())
