"""Скидка на первое занятие и оплата на шаге индивидуальной записи в Журнале.

docs/superpowers/specs/2026-09-26-first-lesson-discount-and-booking-payment-design.md

Проверяется то, за что отвечают деньги:
  * процент считает единый движок цены (без стека — самая выгодная скидка);
  * бронь запоминает обещанный процент, и касса позже берёт ровно его, даже
    если владелец процент поменял;
  * выключатель администратора делает запись обычной;
  * чек шага оплаты (промокод, ваучер) и запись с наличными — одной
    транзакцией: не прошла оплата — нет и брони;
  * 100 % — прежний подарок (бесплатно, без долга);
  * первое занятие со скидкой не требует абонемента в групповом Журнале и в
    мини-приложении при «Предоплате при записи».

HTTP — через ASGI, как в test_hybrid_crm_api.py. Реальная БД; уборку в конце
прогона делает conftest (TRUNCATE), своя — по возможности.

Запуск из back/:  python -m pytest tests/test_first_lesson_payment.py -q
"""
import asyncio
from datetime import datetime, time, timedelta

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, update

import test_hybrid_crm_api as crm
import test_resource_booking as resource
from database import async_session_maker, get_db
from dependencies import StudioContext, get_current_user, get_studio_context, require_role
from models import (
    ClientOffer, ClientPayment, GiftCertificate, Lesson, Operation, Reservation, Studio,
    StudioBookingSettings, StudioDiscountConfig, StudioPromoCode, User,
)
from ratelimit import limiter
from routers.loyalty.configs import get_first_lesson_config, update_first_lesson_config
from routers.schedule.router import router as schedule_router
from schemas.loyalty import FirstLessonConfigUpdate
from services import booking, booking_quotes
from services.booking import Actor, FundingKind, Outcome
from services.pricing import resolve_price

enabled = resource.enabled
PRICE = 1000


@pytest.fixture(autouse=True)
def frozen_clock(monkeypatch):
    moment = booking_quotes.utcnow
    monkeypatch.setattr(booking_quotes, "utcnow", lambda now=None: moment(now or resource.NOW))


async def _seed(percent=50, on=True, prefill=False):
    ids = await resource.seed(price=PRICE)
    await crm._owner(ids)
    async with async_session_maker() as db:
        await db.execute(update(StudioBookingSettings)
                         .where(StudioBookingSettings.studio_id == ids["studio"])
                         .values(trial_lesson_free=on, trial_discount_percent=percent,
                                 prefill_on_booking=prefill))
        await db.commit()
    return ids


async def _cleanup(ids):
    """Деньги первыми: брони и клиентов держат платежи и операции. Не вышло —
    не страшно, conftest вычистит базу в конце прогона."""
    try:
        async with async_session_maker() as db:
            clients = select(Reservation.client_id).join(Lesson).where(Lesson.studio_id == ids["studio"])
            await db.execute(update(Reservation).where(Reservation.client_id.in_(clients))
                             .values(debt_payment_id=None))
            await db.execute(ClientPayment.__table__.delete().where(ClientPayment.client_id == ids["client"]))
            await db.execute(Operation.__table__.delete().where(Operation.studio_id == ids["studio"]))
            await db.execute(GiftCertificate.__table__.delete().where(GiftCertificate.studio_id == ids["studio"]))
            await db.execute(StudioPromoCode.__table__.delete().where(StudioPromoCode.studio_id == ids["studio"]))
            await db.commit()
        await resource.cleanup(ids)
    except Exception:  # noqa: BLE001 — уборка необязательна, см. докстринг
        pass


def _app(ids):
    app = crm._app(ids)

    async def owner():
        async with async_session_maker() as session:
            return await session.get(User, ids["owner"])

    app.dependency_overrides[get_current_user] = owner
    return app


async def _slot(http, ids):
    day = str(resource.hours.DAY)
    free = await http.get("/schedule/availability", params={
        "service_id": ids["service"], "branch_id": ids["branch_a"], "date_from": day, "date_to": day})
    assert free.status_code == 200, free.text
    return free.json()["slots"][0]["starts_at"]


async def _quote(http, ids, **extra):
    response = await http.post("/schedule/booking-quotes", json={
        "booking_mode": "resource", "client_id": ids["client"], "service_id": ids["service"],
        "branch_id": ids["branch_a"], "starts_at": await _slot(http, ids), **extra})
    assert response.status_code == 201, response.text
    return response.json()


async def _preview(http, quote_id, **codes):
    response = await http.post(f"/schedule/booking-quotes/{quote_id}/payment-preview", json=codes)
    assert response.status_code == 200, response.text
    return response.json()


async def _reservation(ids):
    async with async_session_maker() as db:
        return (await db.execute(select(Reservation).join(Lesson).where(
            Lesson.studio_id == ids["studio"]))).scalar_one_or_none()


# ─── Движок цены ────────────────────────────────────────────────────────────

def test_engine_takes_the_best_discount_and_stacks_only_when_allowed():
    async def run():
        ids = await _seed()
        try:
            async with async_session_maker() as db:
                alone = await resolve_price(db, ids["studio"], ids["client"], PRICE, first_lesson_percent=50)
                assert (alone.final_price, alone.first_lesson_discount_applied) == (500, 500)

                # Персональный оффер 70 % выгоднее первого занятия 50 % — без стека
                # действует он один.
                db.add(ClientOffer(studio_id=ids["studio"], client_id=ids["client"], discount_type="percent",
                                   value=70, reason="manual", scope="renewal"))
                await db.flush()
                best = await resolve_price(db, ids["studio"], ids["client"], PRICE, first_lesson_percent=50)
                assert best.final_price == 300 and best.first_lesson_discount_applied == 0, best

                # Студия разрешила складывать скидки — складываются все.
                db.add(StudioDiscountConfig(studio_id=ids["studio"], is_enabled=True, discount_type="fixed",
                                            discount_value=100, stackable=True))
                await db.flush()
                stacked = await resolve_price(db, ids["studio"], ids["client"], PRICE, first_lesson_percent=10)
                assert stacked.final_price == PRICE - 100 - 700 - 100, stacked
                await db.rollback()
        finally:
            await _cleanup(ids)
    asyncio.run(run())


# ─── Условия записи и выключатель ───────────────────────────────────────────

def test_quote_applies_first_lesson_and_the_switch_turns_it_off():
    async def run():
        ids = await _seed(percent=50)
        try:
            async with crm._client(_app(ids)) as http:
                terms = (await _quote(http, ids))["terms"]
                assert terms["first_lesson_offered"] is True and terms["first_lesson"] is True
                assert terms["first_lesson_percent"] == 50
                assert terms["domain"]["funding"]["kind"] == "pay"
                assert terms["domain"]["funding"]["price"] == 500

                off = (await _quote(http, ids, first_lesson=False))["terms"]
                assert off["first_lesson_offered"] is True, "выключатель рисуется и выключенным"
                assert off["first_lesson"] is False
                assert off["domain"]["funding"]["price"] == PRICE

                # Выключенная скидка остаётся выключенной и в самой записи.
                created = await http.post("/schedule/bookings", json={"quote_id": (await _quote(
                    http, ids, first_lesson=False))["quote_id"]})
                assert created.status_code == 200, created.text
                reservation = await _reservation(ids)
                assert reservation.is_trial is False and reservation.trial_discount_percent is None
                async with async_session_maker() as db:
                    debt = await db.get(ClientPayment, reservation.debt_payment_id)
                assert debt.amount == PRICE and debt.status == "pending"
        finally:
            await _cleanup(ids)
    asyncio.run(run())


# ─── Чек шага оплаты ────────────────────────────────────────────────────────

def test_preview_lists_first_lesson_promo_and_voucher():
    async def run():
        ids = await _seed(percent=50)
        try:
            async with async_session_maker() as db:
                db.add(StudioPromoCode(studio_id=ids["studio"], code="WELCOME20", discount_type="percent", value=20))
                db.add(GiftCertificate(studio_id=ids["studio"], code=f"GC-{ids['studio']}-200",
                                       amount=200, cert_type="amount", status="active"))
                db.add(GiftCertificate(studio_id=ids["studio"], code=f"GC-{ids['studio']}-USED",
                                       amount=500, cert_type="amount", status="used"))
                await db.commit()
            async with crm._client(_app(ids)) as http:
                key = (await _quote(http, ids))["quote_id"]

                plain = await _preview(http, key)
                assert plain["total"] == 500 and plain["base_price"] == PRICE
                assert plain["discounts"] == [{"kind": "first_lesson", "amount": 500}]
                assert plain["first_lesson_applied"] is True and plain["first_lesson_percent"] == 50

                # Промокод действует, но −20 % проигрывает −50 %: скидки не суммируются.
                promo = await _preview(http, key, promo_code="welcome20")
                assert promo["promo_valid"] is True and promo["promo_outweighed"] is True
                assert promo["total"] == 500

                bad = await _preview(http, key, promo_code="NOPE")
                assert bad["promo_valid"] is False and bad["total"] == 500

                voucher = await _preview(http, key, certificate_code=f"GC-{ids['studio']}-200")
                assert voucher["certificate_applied"] == 200 and voucher["certificate_amount"] == 200
                assert voucher["total"] == 300

                used = await _preview(http, key, certificate_code=f"GC-{ids['studio']}-USED")
                assert used["certificate_error"] == "loyalty.cert_used" and used["total"] == 500
                missing = await _preview(http, key, certificate_code="NO-SUCH")
                assert missing["certificate_error"] == "loyalty.cert_not_found"
        finally:
            await _cleanup(ids)
    asyncio.run(run())


# ─── Запись с наличными ─────────────────────────────────────────────────────

def test_confirm_with_cash_books_and_pays_in_one_transaction():
    async def run():
        ids = await _seed(percent=50)
        code = f"GC-{ids['studio']}-CASH"
        try:
            async with async_session_maker() as db:
                db.add(GiftCertificate(studio_id=ids["studio"], code=code, amount=200,
                                       cert_type="amount", status="active"))
                await db.commit()
            async with crm._client(_app(ids)) as http:
                key = (await _quote(http, ids))["quote_id"]
                total = (await _preview(http, key, certificate_code=code))["total"]
                assert total == 300
                created = await http.post("/schedule/bookings", json={
                    "quote_id": key, "payment": {"certificate_code": code, "expected_total": total}})
                assert created.status_code == 200, created.text
                assert created.json()["status"] == "active"

                # Двойное нажатие — та же запись, второй раз деньги не берутся.
                again = await http.post("/schedule/bookings", json={
                    "quote_id": key, "payment": {"certificate_code": code, "expected_total": total}})
                assert again.status_code == 200, again.text

            reservation = await _reservation(ids)
            assert reservation.is_trial is True and reservation.trial_discount_percent == 50
            async with async_session_maker() as db:
                debt = await db.get(ClientPayment, reservation.debt_payment_id)
                assert (debt.status, debt.amount) == ("success", 300), (debt.status, debt.amount)
                income = (await db.execute(select(Operation).where(
                    Operation.studio_id == ids["studio"], Operation.type == "in"))).scalars().all()
                assert [(op.amount, op.method) for op in income] == [(300, "cash")], income
                cert = (await db.execute(select(GiftCertificate).where(GiftCertificate.code == code))).scalar_one()
                assert cert.status == "used"
        finally:
            await _cleanup(ids)
    asyncio.run(run())


def test_confirm_with_a_stale_total_leaves_neither_booking_nor_money():
    async def run():
        ids = await _seed(percent=50)
        try:
            async with crm._client(_app(ids)) as http:
                key = (await _quote(http, ids))["quote_id"]
                refused = await http.post("/schedule/bookings", json={
                    "quote_id": key, "payment": {"expected_total": 999}})
                assert refused.status_code == 409, refused.text
                assert refused.json()["detail"]["code"] == "AMOUNT_CHANGED"
            assert await _reservation(ids) is None, "не прошла оплата — нет и брони"
            async with async_session_maker() as db:
                lessons = (await db.execute(select(Lesson.id).where(Lesson.studio_id == ids["studio"]))).all()
                assert lessons == [], "и интервала в Журнале тоже"
        finally:
            await _cleanup(ids)
    asyncio.run(run())


def test_free_first_lesson_needs_no_money():
    async def run():
        ids = await _seed(percent=100)
        try:
            async with crm._client(_app(ids)) as http:
                quote = await _quote(http, ids)
                assert quote["terms"]["domain"]["funding"]["kind"] == "trial"
                preview = await _preview(http, quote["quote_id"], promo_code="ANY")
                assert preview["covered_by"] == "trial" and preview["total"] == 0
                created = await http.post("/schedule/bookings", json={
                    "quote_id": quote["quote_id"], "payment": {"expected_total": 0}})
                assert created.status_code == 200, created.text
            reservation = await _reservation(ids)
            assert reservation.is_trial is True and reservation.trial_discount_percent == 100
            assert reservation.debt_payment_id is None, "подарок — долга нет"
        finally:
            await _cleanup(ids)
    asyncio.run(run())


# ─── Обещанный процент переживает смену настройки ───────────────────────────

def test_debt_is_paid_at_the_promised_percent_after_the_owner_changes_it():
    async def run():
        ids = await _seed(percent=50)
        try:
            async with crm._client(_app(ids)) as http:
                key = (await _quote(http, ids))["quote_id"]
                assert (await http.post("/schedule/bookings", json={"quote_id": key})).status_code == 200
                reservation = await _reservation(ids)

                async with async_session_maker() as db:
                    ctx = StudioContext(user=await db.get(User, ids["owner"]), studio_id=ids["studio"], role="owner")
                    await update_first_lesson_config(FirstLessonConfigUpdate(discount_percent=20), ctx, db)

                paid = await http.post(f"/schedule/reservations/{reservation.id}/pay",
                                       json={"payment_method": "cash"})
                assert paid.status_code == 200, paid.text
            async with async_session_maker() as db:
                debt = await db.get(ClientPayment, reservation.debt_payment_id)
            assert (debt.status, debt.amount) == ("success", 500), "клиент платит обещанные −50 %, а не новые −20 %"
        finally:
            await _cleanup(ids)
    asyncio.run(run())


# ─── Первое занятие не требует абонемента ───────────────────────────────────

def test_first_lesson_waives_coverage_in_the_journal_and_the_miniapp():
    async def run():
        ids = await _seed(percent=50, prefill=True)
        try:
            async with async_session_maker() as db:
                studio = await db.get(Studio, ids["studio"])
                lesson = Lesson(studio_id=studio.id, name="Групповое", teacher_name="T",
                                teacher_id=ids["teacher"], branch_id=ids["branch_a"],
                                start_time=datetime.combine(resource.hours.DAY, time(15, 0)),
                                tz_iana=studio.tz_iana, duration_min=60, price=PRICE, level="",
                                equipment="", total_spots=5, status="confirmed", booking_mode="event")
                db.add(lesson)
                await db.commit()
                lesson_id = lesson.id

            # Журнал (групповое): покрытие обязательно, но первое занятие — не отказ, а долг.
            async with async_session_maker() as db:
                result = await booking.create(db, studio_id=ids["studio"], client_id=ids["client"],
                                              lesson_id=lesson_id, source="manual", actor=Actor.STAFF,
                                              require_funding=True, allow_payment=True)
                assert result.outcome is Outcome.OK, result.outcome
                assert result.terms.funding.kind is FundingKind.PAY and result.terms.funding.price == 500
                await db.rollback()

            # Мини-приложение при «Предоплате при записи» — то же самое.
            async with async_session_maker() as db:
                result = await booking.create(db, studio_id=ids["studio"], client_id=ids["client"],
                                              lesson_id=lesson_id, source="telegram", spot_number=1,
                                              allow_payment=True, actor=Actor.STAFF)
                assert result.outcome is Outcome.OK, result.outcome
                await db.rollback()

            # Без программы первого занятия предоплата по-прежнему требует абонемент.
            async with async_session_maker() as db:
                await db.execute(update(StudioBookingSettings)
                                 .where(StudioBookingSettings.studio_id == ids["studio"])
                                 .values(trial_lesson_free=False))
                result = await booking.create(db, studio_id=ids["studio"], client_id=ids["client"],
                                              lesson_id=lesson_id, source="telegram", spot_number=1,
                                              allow_payment=True, actor=Actor.STAFF)
                assert result.outcome is Outcome.NO_FUNDING, result.outcome
                await db.rollback()
        finally:
            await _cleanup(ids)
    asyncio.run(run())


# ─── Настройка в Лояльности ─────────────────────────────────────────────────

def test_loyalty_setting_writes_the_booking_rule_and_invalidates_open_quotes():
    async def run():
        ids = await _seed(percent=100, on=False)
        try:
            async with async_session_maker() as db:
                ctx = StudioContext(user=await db.get(User, ids["owner"]), studio_id=ids["studio"], role="owner")
                before = (await db.get(Studio, ids["studio"])).booking_config_version
                saved = await update_first_lesson_config(
                    FirstLessonConfigUpdate(is_enabled=True, discount_percent=30), ctx, db)
                assert (saved.is_enabled, saved.discount_percent) == (True, 30)
            async with async_session_maker() as db:
                ctx = StudioContext(user=await db.get(User, ids["owner"]), studio_id=ids["studio"], role="owner")
                read = await get_first_lesson_config(ctx, db)
                assert (read.is_enabled, read.discount_percent) == (True, 30)
                after = (await db.get(Studio, ids["studio"], populate_existing=True)).booking_config_version
                assert after == before + 1, "открытые условия записи должны устареть"
            for wrong in (0, 101):
                with pytest.raises(ValueError):
                    FirstLessonConfigUpdate(discount_percent=wrong)
            assert require_role  # ручка — только владельцу (require_role("owner") в роутере)
        finally:
            await _cleanup(ids)
    asyncio.run(run())
