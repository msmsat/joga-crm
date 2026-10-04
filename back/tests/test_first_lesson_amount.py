"""Скидка на первое занятие СУММОЙ, а не только процентом.

Проверяется то, за что отвечают деньги:
  * сумма считается тем же движком цены и не больше цены занятия;
  * запись запоминает обещанную сумму, и касса берёт ровно её, даже если
    владелец потом переключил скидку на процент;
  * сумма, покрывающая занятие, — бесплатно и без долга, но это не «подарок»
    100 %: на занятии дороже она снова частичная;
  * мини-приложение показывает цену с той же суммой, что запишут;
  * Лояльность хранит процент и сумму порознь и не принимает «суммой» без суммы.

Запуск из back/:  python -m pytest tests/test_first_lesson_amount.py -q
"""
import asyncio
from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy import update

import test_first_lesson_payment as flp
import test_hybrid_crm_api as crm
from database import async_session_maker
from dependencies import StudioContext
from models import ClientPayment, StudioBookingSettings, User
from routers.booking.miniapp_lessons import _lesson_fields
from routers.loyalty.configs import get_first_lesson_config, update_first_lesson_config
from schemas.loyalty import FirstLessonConfigUpdate
from services.booking_access import trial_discount
from services.booking_rules import BookingRules
from services.discounts import FirstLessonDiscount, apply_discount
from services.pricing import resolve_price

enabled = flp.enabled
PRICE = flp.PRICE
frozen_clock = flp.frozen_clock


# ─── Без базы: значение скидки и его чтение ─────────────────────────────────

def test_discount_value_is_percent_or_amount_and_never_above_the_price():
    assert apply_discount(FirstLessonDiscount(amount=300), 1000) == 300
    assert apply_discount(FirstLessonDiscount(amount=1500), 1000) == 1000, "не больше цены"
    assert apply_discount(FirstLessonDiscount(percent=30), 1000) == 300
    assert FirstLessonDiscount(percent=100).gift and FirstLessonDiscount().gift
    assert not FirstLessonDiscount(amount=10_000).gift, "сумма подарком не бывает — решает цена"


def test_rules_and_reservation_snapshot_read_the_chosen_kind():
    assert BookingRules().first_lesson == FirstLessonDiscount(percent=100)
    assert BookingRules(trial_discount_type="amount", trial_discount_amount=300,
                        trial_discount_percent=50).first_lesson == FirstLessonDiscount(amount=300)
    assert BookingRules(trial_discount_type="percent", trial_discount_amount=300,
                        trial_discount_percent=50).first_lesson == FirstLessonDiscount(percent=50), \
        "сумма хранится, но не действует, пока выбран процент"

    def booked(**fields):
        return SimpleNamespace(**{"is_trial": True, "trial_discount_percent": None,
                                  "trial_discount_amount": None, **fields})
    assert trial_discount(booked(trial_discount_amount=300)) == FirstLessonDiscount(amount=300)
    assert trial_discount(booked(trial_discount_percent=50)) == FirstLessonDiscount(percent=50)
    assert trial_discount(booked()) == FirstLessonDiscount(percent=100), "старая пробная бронь — подарок"
    assert trial_discount(booked(is_trial=False, trial_discount_amount=300)) is None


def _card(price, first_lesson):
    lesson = SimpleNamespace(
        id=1, name="Хатха", level="", equipment="", teacher_name="T",
        start_time=datetime.now() + timedelta(days=1), duration_min=60, price=price, total_spots=5,
        hall_id=None, service_id=None, teacher_id=None, branch_id=None, booking_mode="event", tz_iana=None)
    return _lesson_fields(lesson, [], False, "CZK", {}, BookingRules(), first_lesson=first_lesson)


def test_miniapp_card_shows_the_price_with_the_amount_off():
    card = _card(1000, FirstLessonDiscount(amount=300))
    assert card["trial_available"] is False and card["first_lesson_discount"] == 0
    assert card["first_lesson_discount_amount_str"] and card["first_lesson_price_str"]
    assert "700" in card["first_lesson_price_str"] and "300" in card["first_lesson_discount_amount_str"]

    covered = _card(200, FirstLessonDiscount(amount=300))
    assert covered["trial_available"] is True, "сумма покрыла занятие — для клиента бесплатно"
    assert covered["first_lesson_discount_amount_str"] == "" and covered["first_lesson_price_str"] == ""

    percent = _card(1000, FirstLessonDiscount(percent=50))
    assert percent["first_lesson_discount"] == 50 and percent["first_lesson_discount_amount_str"] == ""


# ─── С базой: движок, запись, касса ─────────────────────────────────────────

def test_engine_counts_the_amount_as_a_candidate_like_any_other():
    async def run():
        ids = await flp._seed()
        try:
            async with async_session_maker() as db:
                off = await resolve_price(db, ids["studio"], ids["client"], PRICE,
                                          first_lesson=FirstLessonDiscount(amount=300))
                assert (off.final_price, off.first_lesson_discount_applied) == (700, 300)
                whole = await resolve_price(db, ids["studio"], ids["client"], PRICE,
                                            first_lesson=FirstLessonDiscount(amount=5000))
                assert (whole.final_price, whole.first_lesson_discount_applied) == (0, PRICE)
        finally:
            await flp._cleanup(ids)
    asyncio.run(run())


def test_booking_with_cash_takes_the_price_minus_the_amount_and_remembers_it():
    async def run():
        ids = await flp._seed(amount=300)
        try:
            async with crm._client(flp._app(ids)) as http:
                quoted = await flp._quote(http, ids)
                terms = quoted["terms"]
                assert (terms["first_lesson_percent"], terms["first_lesson_amount"]) == (None, 300)
                assert terms["domain"]["funding"]["kind"] == "pay"
                assert terms["domain"]["funding"]["price"] == 700

                preview = await flp._preview(http, quoted["quote_id"])
                assert preview["total"] == 700 and preview["first_lesson_amount"] == 300
                assert preview["discounts"] == [{"kind": "first_lesson", "amount": 300}]

                created = await http.post("/schedule/bookings", json={
                    "quote_id": quoted["quote_id"], "payment": {"expected_total": 700}})
                assert created.status_code == 200, created.text

            reservation = await flp._reservation(ids)
            assert reservation.is_trial is True
            assert (reservation.trial_discount_percent, reservation.trial_discount_amount) == (None, 300)
            async with async_session_maker() as db:
                debt = await db.get(ClientPayment, reservation.debt_payment_id)
            assert (debt.status, debt.amount) == ("success", 700)
        finally:
            await flp._cleanup(ids)
    asyncio.run(run())


def test_debt_is_paid_at_the_promised_amount_after_the_owner_switches_to_percent():
    async def run():
        ids = await flp._seed(amount=300)
        try:
            async with crm._client(flp._app(ids)) as http:
                key = (await flp._quote(http, ids))["quote_id"]
                assert (await http.post("/schedule/bookings", json={"quote_id": key})).status_code == 200
                reservation = await flp._reservation(ids)

                async with async_session_maker() as db:
                    ctx = StudioContext(user=await db.get(User, ids["owner"]), studio_id=ids["studio"], role="owner")
                    await update_first_lesson_config(
                        FirstLessonConfigUpdate(discount_type="percent", discount_percent=50), ctx, db)

                preview = await http.post(f"/schedule/reservations/{reservation.id}/payment-preview", json={})
                assert preview.status_code == 200, preview.text
                assert (preview.json()["first_lesson_amount"], preview.json()["total"]) == (300, 700)

                paid = await http.post(f"/schedule/reservations/{reservation.id}/pay",
                                       json={"payment_method": "cash"})
                assert paid.status_code == 200, paid.text
            async with async_session_maker() as db:
                debt = await db.get(ClientPayment, reservation.debt_payment_id)
            assert (debt.status, debt.amount) == ("success", 700), "клиент платит обещанные −300, а не новые −50 %"
        finally:
            await flp._cleanup(ids)
    asyncio.run(run())


def test_amount_covering_the_price_is_free_without_debt():
    async def run():
        ids = await flp._seed(amount=PRICE + 500)
        try:
            async with crm._client(flp._app(ids)) as http:
                quoted = await flp._quote(http, ids)
                assert quoted["terms"]["domain"]["funding"]["kind"] == "free"
                created = await http.post("/schedule/bookings", json={
                    "quote_id": quoted["quote_id"], "payment": {"expected_total": 0}})
                assert created.status_code == 200, created.text
            reservation = await flp._reservation(ids)
            assert reservation.is_trial is True and reservation.trial_discount_amount == PRICE + 500
            assert reservation.debt_payment_id is None, "платить нечего — долга нет"
        finally:
            await flp._cleanup(ids)
    asyncio.run(run())


# ─── Настройка в Лояльности ─────────────────────────────────────────────────

def test_loyalty_keeps_percent_and_amount_apart_and_refuses_amount_without_a_sum():
    async def run():
        ids = await flp._seed(percent=30)
        try:
            async def ctx_of(db):
                return StudioContext(user=await db.get(User, ids["owner"]), studio_id=ids["studio"], role="owner")

            async with async_session_maker() as db:
                with pytest.raises(HTTPException) as refused:
                    await update_first_lesson_config(FirstLessonConfigUpdate(discount_type="amount"),
                                                     await ctx_of(db), db)
                assert refused.value.status_code == 422

            async with async_session_maker() as db:
                saved = await update_first_lesson_config(
                    FirstLessonConfigUpdate(discount_type="amount", discount_amount=250), await ctx_of(db), db)
                assert (saved.discount_type, saved.discount_amount, saved.discount_percent) == ("amount", 250, 30)

            async with async_session_maker() as db:
                back = await update_first_lesson_config(
                    FirstLessonConfigUpdate(discount_type="percent"), await ctx_of(db), db)
                assert (back.discount_type, back.discount_percent, back.discount_amount) == ("percent", 30, 250), \
                    "переключение вида не стирает другое значение"
                # Сумма уже задана — переключиться на неё можно и без суммы в запросе.
                again = await update_first_lesson_config(
                    FirstLessonConfigUpdate(discount_type="amount"), await ctx_of(db), db)
                assert (again.discount_type, again.discount_amount) == ("amount", 250)

            async with async_session_maker() as db:
                read = await get_first_lesson_config(await ctx_of(db), db)
                assert (read.discount_type, read.discount_amount) == ("amount", 250)
                settings = (await db.execute(
                    StudioBookingSettings.__table__.select()
                    .where(StudioBookingSettings.studio_id == ids["studio"]))).mappings().one()
                assert settings["trial_discount_type"] == "amount"

            for wrong in (0, -5):
                with pytest.raises(ValueError):
                    FirstLessonConfigUpdate(discount_amount=wrong)
            with pytest.raises(ValueError):
                FirstLessonConfigUpdate(discount_type="fixed")
        finally:
            async with async_session_maker() as db:
                await db.execute(update(StudioBookingSettings)
                                 .where(StudioBookingSettings.studio_id == ids["studio"])
                                 .values(trial_discount_type="percent"))
                await db.commit()
            await flp._cleanup(ids)
    asyncio.run(run())
