"""«Оплата на месте» → картой: клиент передумал и гасит долг записи онлайн.

Свойство, ради которого файл существует:

    ДОЛГ ГАСИТСЯ ОДИН РАЗ И ТОЙ ЖЕ СТРОКОЙ, ЧТО У СТОЙКИ.

Форма Stripe — на сумму, которую пересчитает касса (скидка администратора и
коды с записи); проведение закрывает ТУ ЖЕ строку долга, а не заводит вторую;
долг, закрытый у стойки, пока форма была открыта, делает карточный платёж
возвратом, а не вторым доходом. Бронь при этом не трогается: место за
человеком и так.

Сеть Stripe подменена сценарием из саги записи (`FakeStripe`). Реальная БД,
ручная чистка. Запуск из back/:  python -m pytest tests/test_debt_card_payment.py
"""
import asyncio
import os
import time as _time
import warnings
from datetime import datetime, time, timedelta, timezone
from types import SimpleNamespace

warnings.filterwarnings("ignore")

import pytest
from fastapi import HTTPException
from sqlalchemy import delete, select

from database import async_session_maker
from models import (
    Account, ActivityLog, BookingChannelConfig, Client, ClientPayment, Hall, Lesson,
    NotificationLog, OnlineChannel, Operation, Reservation, StripeCheckout, Studio,
    StudioBookingSettings,
)
from routers.booking.miniapp_lessons import my_lessons
from routers.checkout import stripe_pay
from services import booking, booking_payment, reservation_payment
from services.booking_payment import DEBT_KEY, PayOutcome
from test_booking_saga import FakeStripe, _Patched

UTC = timezone.utc
_TAG = "TEST-DEBT-CARD"
NOW = datetime.now(UTC)
TOMORROW = NOW.date() + timedelta(days=1)
ACCOUNT = "acct_debt_card"
RETURN_TO = "https://app.test/s/studio?pay="


async def _seed() -> dict:
    stamp = f"{int(_time.time())}-{os.getpid()}"
    async with async_session_maker() as db:
        studio = Studio(name=f"{_TAG}-{stamp}", tz_iana="Europe/Prague", currency="CZK")
        db.add(studio)
        await db.flush()
        db.add_all([
            StudioBookingSettings(
                studio_id=studio.id, booking_window_days=30, min_booking_advance_min=1,
                prefill_on_booking=False, widget_work_start="00:00", widget_work_end="00:00"),
            OnlineChannel(studio_id=studio.id, channel_type="stripe", is_active=True,
                          account_id=ACCOUNT),
            BookingChannelConfig(studio_id=studio.id, channel_type="telegram", is_active=True,
                                 config={"bot_username": "debt_card_bot"}),
        ])
        hall = Hall(studio_id=studio.id, name="Зал", capacity=10)
        katya = Client(studio_id=studio.id, name="Катя")
        olga = Client(studio_id=studio.id, name="Ольга")
        db.add_all([hall, katya, olga])
        await db.flush()
        lesson = Lesson(studio_id=studio.id, name="Стретчинг", teacher_name="Т",
                        hall_id=hall.id, start_time=datetime.combine(TOMORROW, time(18, 0)),
                        tz_iana="Europe/Prague", duration_min=60, price=500,
                        level="", equipment="", total_spots=5, status="confirmed")
        db.add(lesson)
        await db.flush()
        ids = {"studio": studio.id, "katya": katya.id, "olga": olga.id,
               "hall": hall.id, "lesson": lesson.id}
        await db.commit()
    return ids


async def _cleanup(ids) -> None:
    sid = ids["studio"]
    async with async_session_maker() as db:
        for stmt in (
            delete(Operation).where(Operation.studio_id == sid),
            delete(StripeCheckout).where(StripeCheckout.studio_id == sid),
            delete(Reservation).where(Reservation.lesson_id == ids["lesson"]),
            delete(ClientPayment).where(ClientPayment.client_id.in_([ids["katya"], ids["olga"]])),
            delete(Lesson).where(Lesson.studio_id == sid),
            delete(Hall).where(Hall.studio_id == sid),
            delete(Client).where(Client.studio_id == sid),
            delete(Account).where(Account.studio_id == sid),
            delete(ActivityLog).where(ActivityLog.studio_id == sid),
            delete(NotificationLog).where(NotificationLog.studio_id == sid),
            delete(BookingChannelConfig).where(BookingChannelConfig.studio_id == sid),
            delete(OnlineChannel).where(OnlineChannel.studio_id == sid),
            delete(StudioBookingSettings).where(StudioBookingSettings.studio_id == sid),
            delete(Studio).where(Studio.id == sid),
        ):
            await db.execute(stmt)
        await db.commit()


async def _wipe(ids) -> None:
    async with async_session_maker() as db:
        await db.execute(delete(Operation).where(Operation.studio_id == ids["studio"]))
        await db.execute(delete(StripeCheckout).where(StripeCheckout.studio_id == ids["studio"]))
        await db.execute(delete(Reservation).where(Reservation.lesson_id == ids["lesson"]))
        await db.execute(delete(ClientPayment).where(
            ClientPayment.client_id.in_([ids["katya"], ids["olga"]])))
        await db.commit()


async def _venue_booking(ids, client_key="katya") -> int:
    """Запись «оплачу на месте»: бронь состоялась, долг открыт."""
    async with async_session_maker() as db:
        result = await booking.create(
            db, studio_id=ids["studio"], client_id=ids[client_key], lesson_id=ids["lesson"],
            source="miniapp", allow_payment=True, now=NOW)
        assert result.outcome is booking.Outcome.OK, result
        assert result.status == "active", result
        await db.commit()
        row = await db.get(Reservation, result.reservation_id)
        assert row.debt_payment_id is not None, "долг «на месте» не открыт"
        return result.reservation_id


async def _pay_link(ids, reservation_id, client_key="katya"):
    async with async_session_maker() as db:
        return await booking_payment.pay_link(
            db, studio_id=ids["studio"], reservation_id=reservation_id,
            client_id=ids[client_key], channel="web", return_to=RETURN_TO)


async def _debt(reservation_id) -> ClientPayment:
    async with async_session_maker() as db:
        row = await db.get(Reservation, reservation_id)
        return await db.get(ClientPayment, row.debt_payment_id)


async def _apply(session_id: str) -> bool:
    async with async_session_maker() as db:
        return await stripe_pay.apply_paid(db, session_id, account_id=ACCOUNT)


async def _my(ids, client_key="katya"):
    async with async_session_maker() as db:
        client = await db.get(Client, ids[client_key])
        return await my_lessons(client=client, db=db)


# ─── 1. Передумал: долг гасится картой той же строкой ───────────────────────

async def _card_settles_the_same_debt(ids):
    reservation_id = await _venue_booking(ids)
    debt_before = await _debt(reservation_id)
    assert debt_before.status == "pending" and debt_before.amount == 500

    listed = (await _my(ids)).upcoming[0]
    assert listed.debt == 500 and "pay" in listed.allowed_actions, listed.allowed_actions

    fake = FakeStripe()
    with _Patched(fake):
        payable = await _pay_link(ids, reservation_id)
        assert payable.outcome is PayOutcome.OPEN, payable
        assert payable.amount == 500
        # Повтор нажатия — та же форма, второй не заводится.
        again = await _pay_link(ids, reservation_id)
        assert again.checkout_id == payable.checkout_id and again.url == payable.url
    assert len(fake.sessions) == 1
    session = fake.only()
    assert session.amount_total == 50_000  # 500 Kč в младших единицах

    async with async_session_maker() as db:
        checkout = await db.get(StripeCheckout, payable.checkout_id)
        assert checkout.payload[DEBT_KEY] == debt_before.id
        # Открытая форма долга — не брошенное держание места: разбор её не трогает.
        assert await booking_payment.unfulfillable_reason(db, checkout) is None

    with _Patched(fake):
        fake.pay(session.id)
        assert await _apply(session.id) is True
        # Дубль вебхука безобиден.
        assert await _apply(session.id) is False

    async with async_session_maker() as db:
        row = await db.get(Reservation, reservation_id)
        assert row.status == "active", "оплата долга двинула бронь"
        assert row.debt_payment_id == debt_before.id, "ссылка на долг потеряна"
        payments = (await db.execute(select(ClientPayment).where(
            ClientPayment.client_id == ids["katya"]))).scalars().all()
        assert [(p.id, p.status, p.amount) for p in payments] == [(debt_before.id, "success", 500)], \
            "долг не закрыт той же строкой"
        income = (await db.execute(select(Operation).where(
            Operation.studio_id == ids["studio"]))).scalars().all()
        assert [(o.type, o.amount, o.method) for o in income] == [("in", 500, "stripe")]

    listed = (await _my(ids)).upcoming[0]
    assert listed.debt == 0 and "pay" not in listed.allowed_actions
    assert listed.paid_online is True


# ─── 2. Скидка администратора на долг доходит до формы и до кассы ───────────

async def _manual_discount_reaches_the_card(ids):
    reservation_id = await _venue_booking(ids)
    async with async_session_maker() as db:
        row = await db.get(Reservation, reservation_id)
        await reservation_payment.discount_debt(db, ids["studio"], row, 20)
        await db.commit()
    assert (await _debt(reservation_id)).amount == 400

    fake = FakeStripe()
    with _Patched(fake):
        payable = await _pay_link(ids, reservation_id)
        assert payable.outcome is PayOutcome.OPEN and payable.amount == 400, payable
        fake.pay(fake.only().id)
        # Касса пересчитывает со скидкой брони и сходится со списанным.
        assert await _apply(fake.only().id) is True
    debt = await _debt(reservation_id)
    assert (debt.status, debt.amount) == ("success", 400)


# ─── 3. Долг закрыли у стойки, пока форма была открыта ──────────────────────

async def _desk_wins_the_race(ids):
    reservation_id = await _venue_booking(ids)
    fake = FakeStripe()
    with _Patched(fake):
        payable = await _pay_link(ids, reservation_id)
    assert payable.outcome is PayOutcome.OPEN

    # Кассир отметил «оплатил наличными».
    async with async_session_maker() as db:
        row = await db.get(Reservation, reservation_id)
        (await db.get(ClientPayment, row.debt_payment_id)).status = "success"
        await db.commit()
        checkout = await db.get(StripeCheckout, payable.checkout_id)
        # Форма больше ничего не ждёт — разбор закроет её, запись не тронет.
        assert await booking_payment.unfulfillable_reason(db, checkout) == "no_longer_waiting"

    with _Patched(fake):
        fake.pay(fake.only().id)
        with pytest.raises(HTTPException) as refused:
            await _apply(fake.only().id)
    assert refused.value.status_code == 409
    async with async_session_maker() as db:
        checkout = await db.get(StripeCheckout, payable.checkout_id)
        assert checkout.status == "failed", "второй платёж за долг тихо проведён"
        assert (await db.get(Reservation, reservation_id)).status == "active"
        income = (await db.execute(select(Operation).where(
            Operation.studio_id == ids["studio"]))).scalars().all()
        assert income == [], "второй доход за то же занятие"


# ─── 4. Платить нечего: отказ без формы ─────────────────────────────────────

async def _nothing_to_pay(ids):
    reservation_id = await _venue_booking(ids)
    fake = FakeStripe()
    with _Patched(fake):
        # Чужая бронь.
        assert (await _pay_link(ids, reservation_id, "olga")).outcome is PayOutcome.STALE

        # Ждёт одобрения студии: одобрение первее денег.
        async with async_session_maker() as db:
            (await db.get(Reservation, reservation_id)).status = "pending"
            await db.commit()
        assert (await _pay_link(ids, reservation_id)).outcome is PayOutcome.STALE

        # Занятие уже началось: по его окончании долг зачислит система.
        async with async_session_maker() as db:
            (await db.get(Reservation, reservation_id)).status = "active"
            lesson = await db.get(Lesson, ids["lesson"])
            original_start = lesson.start_time
            lesson.start_time = datetime.combine(NOW.date() - timedelta(days=1), time(18, 0))
            await db.commit()
        assert (await _pay_link(ids, reservation_id)).outcome is PayOutcome.STALE
        async with async_session_maker() as db:
            (await db.get(Lesson, ids["lesson"])).start_time = original_start
            await db.commit()

        # Отменённая бронь.
        async with async_session_maker() as db:
            await booking.cancel(db, studio_id=ids["studio"], reservation_id=reservation_id,
                                 actor="test", enforce_policy=False)
            await db.commit()
        assert (await _pay_link(ids, reservation_id)).outcome is PayOutcome.STALE
    assert fake.sessions == {}, "форма заведена там, где платить нечего"

    # Студия не принимает карты — кнопки нет.
    reservation_id = await _venue_booking(ids, "olga")
    async with async_session_maker() as db:
        channel = (await db.execute(select(OnlineChannel).where(
            OnlineChannel.studio_id == ids["studio"]))).scalar_one()
        channel.is_active = False
        await db.commit()
    try:
        listed = (await _my(ids, "olga")).upcoming[0]
        assert listed.debt == 500 and "pay" not in listed.allowed_actions
    finally:
        async with async_session_maker() as db:
            channel = (await db.execute(select(OnlineChannel).where(
                OnlineChannel.studio_id == ids["studio"]))).scalar_one()
            channel.is_active = True
            await db.commit()


# ─── 5. Разбор: срок формы — от формы, отмена записи закрывает форму ────────

async def _sweep_reads_the_debt_form(ids):
    reservation_id = await _venue_booking(ids)
    async with async_session_maker() as db:
        # Запись сделана неделю назад — свежая форма от этого не «протухает».
        (await db.get(Reservation, reservation_id)).created_at = datetime.utcnow() - timedelta(days=7)
        await db.commit()
    fake = FakeStripe()
    with _Patched(fake):
        payable = await _pay_link(ids, reservation_id)
    async with async_session_maker() as db:
        checkout = await db.get(StripeCheckout, payable.checkout_id)
        assert await booking_payment.unfulfillable_reason(db, checkout) is None
        later = datetime.utcnow() + timedelta(minutes=booking_payment.HOLD_MINUTES + 5)
        assert await booking_payment.unfulfillable_reason(db, checkout, now=later) == "stale"

        await booking.cancel(db, studio_id=ids["studio"], reservation_id=reservation_id,
                             actor="test", enforce_policy=False)
        await db.commit()
        assert await booking_payment.unfulfillable_reason(db, checkout) == "booking_gone"

    # Разбор закрывает форму у Stripe; запись не воскрешает и не трогает.
    with _Patched(fake):
        async with async_session_maker() as db:
            checkout = await db.get(StripeCheckout, payable.checkout_id)
            assert await booking_payment._resolve(db, checkout, "booking_gone") == "released"
    assert fake.expires == [fake.only().id]
    async with async_session_maker() as db:
        assert (await db.get(StripeCheckout, payable.checkout_id)).status == "cancelled"


def test_debt_card_payment_against_the_database():
    async def run():
        ids = await _seed()
        try:
            for step in (_card_settles_the_same_debt, _manual_discount_reaches_the_card,
                         _desk_wins_the_race, _nothing_to_pay, _sweep_reads_the_debt_form):
                await step(ids)
                await _wipe(ids)
        finally:
            await _cleanup(ids)

    asyncio.run(run())


def test_hold_payload_is_unchanged():
    """Прежние заявки (держание места) выглядят как раньше — без ключа долга."""
    body = booking_payment.payload_for(reservation_id=1, client_id=2, lesson_id=3,
                                       amount=500, currency="CZK")
    assert DEBT_KEY not in body
    row = type("X", (), {"payload": body})()
    assert booking_payment.settles_debt(row) is None
    body = booking_payment.payload_for(reservation_id=1, client_id=2, lesson_id=3,
                                       amount=500, currency="CZK", debt_payment_id=9)
    assert booking_payment.settles_debt(type("X", (), {"payload": body})()) == 9


def test_rejected_charge_blocks_another_card_payment(monkeypatch):
    async def run():
        ids = await _seed()
        try:
            reservation_id = await _venue_booking(ids)
            fake = FakeStripe()
            with _Patched(fake):
                payable = await _pay_link(ids, reservation_id)
                async with async_session_maker() as db:
                    row = await db.get(Reservation, reservation_id)
                    await reservation_payment.discount_debt(db, ids['studio'], row, 20)
                    await db.commit()
                fake.pay(fake.only().id)
                with pytest.raises(HTTPException):
                    await _apply(fake.only().id)
                async with async_session_maker() as db:
                    assert (await db.get(StripeCheckout, payable.checkout_id)).status == 'failed'
                again = await _pay_link(ids, reservation_id)
                assert again.outcome.value == 'REVIEW' and again.url is None
                assert len(fake.sessions) == 1
            listed = (await _my(ids)).upcoming[0]
            assert listed.payment_review is True and 'pay' not in listed.allowed_actions
            assert listed.paid_online is False and listed.debt == 400
            async def session_for_payment(*_):
                return fake.only().id
            monkeypatch.setattr(stripe_pay, '_checkout_for_payment', session_for_payment)
            # A partial refund still leaves charged money unresolved.
            await stripe_pay._mark_reversed(SimpleNamespace(payment_intent='pi_test', amount=50000,
                amount_refunded=10000), 'charge.refunded', ACCOUNT)
            with _Patched(fake):
                assert (await _pay_link(ids, reservation_id)).outcome.value == 'REVIEW'
            # Only a verified full refund unlocks a new form; no sale ever existed
            # to reverse, so the pending debt and income ledger must stay intact.
            await stripe_pay._mark_reversed(SimpleNamespace(payment_intent='pi_test', amount=50000,
                amount_refunded=50000), 'charge.refunded', ACCOUNT)
            listed = (await _my(ids)).upcoming[0]
            assert listed.payment_review is False and listed.debt == 400
            async with async_session_maker() as db:
                assert (await db.get(StripeCheckout, payable.checkout_id)).status == 'refunded'
                assert (await db.execute(select(Operation).where(Operation.studio_id == ids['studio']))).all() == []
            with _Patched(fake):
                again = await _pay_link(ids, reservation_id)
                assert again.outcome is PayOutcome.OPEN and again.amount == 400
        finally:
            await _cleanup(ids)
    asyncio.run(run())


def test_started_hold_cannot_open_a_payment_form_or_advertise_pay():
    async def run():
        ids = await _seed()
        try:
            async with async_session_maker() as db:
                result = await booking.create(db, studio_id=ids['studio'], client_id=ids['katya'],
                    lesson_id=ids['lesson'], source='miniapp', hold_for_payment=True, now=NOW)
                assert result.status == 'hold'
                reservation_id = result.reservation_id
                (await db.get(Lesson, ids['lesson'])).start_time = datetime.utcnow() - timedelta(hours=1)
                await db.commit()
            fake = FakeStripe()
            with _Patched(fake):
                assert (await _pay_link(ids, reservation_id)).outcome is PayOutcome.STALE
                assert fake.sessions == {}
            listed = (await _my(ids)).past[0]
            assert 'pay' not in listed.allowed_actions
        finally:
            await _cleanup(ids)
    asyncio.run(run())
