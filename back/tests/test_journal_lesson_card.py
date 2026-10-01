"""Карточка занятия в Журнале: оплата брони со скидкой и баллами, адрес, сводка клиента.

Проверяется то, за что отвечают деньги и доверие к экрану:
  * чек `payment-preview` брони считает тем же ядром, что и оплата: ручная
    скидка в общем ряду (без стека), баллы-кешбэк списываются после скидок;
  * оплата проводит ровно названную сумму, а устаревший итог — отказ без
    движения денег;
  * занятие отдаёт место (зал, филиал, адрес) и отметку «оплачено»;
  * сводка клиента считает визиты, неявки и отзывы на сервере.

Реальная БД, HTTP через ASGI — как соседний tests/test_first_lesson_payment.py.

Запуск из back/:  python -m pytest tests/test_journal_lesson_card.py -q
"""
import asyncio
from datetime import datetime, timedelta

from sqlalchemy import update

import test_first_lesson_payment as flp
import test_hybrid_crm_api as crm
import test_resource_booking as resource
from database import async_session_maker
from models import (
    ClientLoyaltyCard, ClientPayment, GiftCertificate, Lesson, Reservation, StudioBranch, StudioPromoCode,
)
from routers.clients.router import router as clients_router

enabled = resource.enabled
frozen_clock = flp.frozen_clock


async def _booked_with_debt(http, ids):
    """Индивидуальная запись без оплаты: первое занятие −50 % → долг 500."""
    key = (await flp._quote(http, ids))["quote_id"]
    created = await http.post("/schedule/bookings", json={"quote_id": key})
    assert created.status_code == 200, created.text
    return await flp._reservation(ids)


async def _give_points(ids, points):
    async with async_session_maker() as db:
        card = (await db.execute(ClientLoyaltyCard.__table__.select().where(
            ClientLoyaltyCard.client_id == ids["client"]))).first()
        if card is None:
            db.add(ClientLoyaltyCard(client_id=ids["client"], studio_id=ids["studio"], points_balance=points))
        else:
            await db.execute(update(ClientLoyaltyCard)
                             .where(ClientLoyaltyCard.client_id == ids["client"])
                             .values(points_balance=points))
        await db.commit()


def test_manual_discount_and_points_are_quoted_and_paid_by_the_same_engine():
    async def run():
        ids = await flp._seed(percent=50)
        try:
            async with crm._client(flp._app(ids)) as http:
                reservation = await _booked_with_debt(http, ids)
                url = f"/schedule/reservations/{reservation.id}"

                plain = await http.post(f"{url}/payment-preview", json={})
                assert plain.status_code == 200, plain.text
                assert plain.json()["total"] == 500 and plain.json()["debt"] == 500

                # 60 % от администратора выгоднее −50 % первого занятия — действует
                # одна, самая выгодная; 30 % проигрывает и помечается.
                best = (await http.post(f"{url}/payment-preview", json={"manual_discount_percent": 60})).json()
                assert best["total"] == 400
                assert [d["kind"] for d in best["discounts"]] == ["manual"]
                weaker = (await http.post(f"{url}/payment-preview", json={"manual_discount_percent": 30})).json()
                assert weaker["total"] == 500 and weaker["manual_outweighed"] is True

                # Баллы гасят остаток ПОСЛЕ скидки.
                await _give_points(ids, 100)
                with_points = (await http.post(f"{url}/payment-preview", json={
                    "manual_discount_percent": 60, "use_bonuses": True})).json()
                assert with_points["bonuses_available"] == 100
                assert with_points["total"] == 400 - with_points["bonuses_value"]
                assert with_points["bonuses_value"] > 0

                paid = await http.post(f"{url}/pay", json={
                    "payment_method": "cash", "manual_discount_percent": 60, "use_bonuses": True,
                    "expected_total": with_points["total"]})
                assert paid.status_code == 200, paid.text

                # Снимок кассы на брони: Журнал показывает, чем именно оплачено.
                detail = (await http.get(f"/schedule/lessons/{reservation.lesson_id}")).json()
                receipt = detail["booked_clients"][0]["payment"]
                assert receipt["discounts"] == [{"kind": "manual", "amount": 600}]
                assert receipt["bonuses_value"] == with_points["bonuses_value"]
                assert receipt["total"] == with_points["total"] and receipt["method"] == "cash"
                assert receipt["base_price"] == 1000 and receipt["paid_at"]

            async with async_session_maker() as db:
                debt = await db.get(ClientPayment, reservation.debt_payment_id)
                card = (await db.execute(ClientLoyaltyCard.__table__.select().where(
                    ClientLoyaltyCard.client_id == ids["client"]))).first()
            assert (debt.status, debt.amount) == ("success", with_points["total"])
            assert card.points_balance < 100, "баллы списаны оплатой, а не чеком"
        finally:
            await flp._cleanup(ids)
    asyncio.run(run())


def test_stale_total_moves_no_money():
    async def run():
        ids = await flp._seed(percent=50)
        try:
            async with crm._client(flp._app(ids)) as http:
                reservation = await _booked_with_debt(http, ids)
                refused = await http.post(f"/schedule/reservations/{reservation.id}/pay", json={
                    "payment_method": "cash", "manual_discount_percent": 60, "expected_total": 500})
                assert refused.status_code == 409, refused.text
                assert refused.json()["detail"]["code"] == "checkout.amount_changed"
            async with async_session_maker() as db:
                debt = await db.get(ClientPayment, reservation.debt_payment_id)
            assert debt.status == "pending", "долг остаётся — денег не приняли"
        finally:
            await flp._cleanup(ids)
    asyncio.run(run())


def test_first_lesson_can_be_waived_and_promo_and_voucher_are_taken():
    """Групповая запись у стойки — те же рычаги, что у индивидуальной: первое
    занятие можно не засчитать, промокод и сертификат гасят сумму тем же ядром."""
    async def run():
        ids = await flp._seed(percent=50)
        try:
            async with async_session_maker() as db:
                db.add(StudioPromoCode(studio_id=ids["studio"], code="WELCOME20", discount_type="percent", value=20))
                db.add(GiftCertificate(studio_id=ids["studio"], code=f"GC-{ids['studio']}-USED",
                                       amount=500, cert_type="amount", status="used"))
                await db.commit()
            async with crm._client(flp._app(ids)) as http:
                reservation = await _booked_with_debt(http, ids)
                url = f"/schedule/reservations/{reservation.id}"

                trial = (await http.post(f"{url}/payment-preview", json={})).json()
                assert trial["first_lesson_offered"] is True and trial["first_lesson_applied"] is True
                assert trial["first_lesson_percent"] == 50 and trial["total"] == 500

                waived = (await http.post(f"{url}/payment-preview", json={"first_lesson": False})).json()
                assert waived["first_lesson_offered"] is True and waived["first_lesson_applied"] is False
                assert waived["total"] == 1000 and waived["discounts"] == []

                promo = (await http.post(f"{url}/payment-preview", json={
                    "first_lesson": False, "promo_code": " welcome20 "})).json()
                assert promo["promo_valid"] is True and promo["promo_outweighed"] is False
                assert promo["discounts"] == [{"kind": "promo", "amount": 200}] and promo["total"] == 800

                # С первым занятием −50 % выгоднее −20 %: скидки не суммируются.
                weaker = (await http.post(f"{url}/payment-preview", json={"promo_code": "WELCOME20"})).json()
                assert weaker["promo_outweighed"] is True and weaker["total"] == 500

                bad = (await http.post(f"{url}/payment-preview", json={"promo_code": "NOPE"})).json()
                assert bad["promo_valid"] is False and bad["total"] == 500

                used = (await http.post(f"{url}/payment-preview", json={
                    "certificate_code": f"GC-{ids['studio']}-USED"})).json()
                assert used["certificate_error"].startswith("loyalty.cert_")
                assert used["certificate_applied"] == 0 and used["total"] == 500

                paid = await http.post(f"{url}/pay", json={
                    "payment_method": "cash", "first_lesson": False, "promo_code": "WELCOME20",
                    "expected_total": 800})
                assert paid.status_code == 200, paid.text

            async with async_session_maker() as db:
                debt = await db.get(ClientPayment, reservation.debt_payment_id)
                booked = await db.get(Reservation, reservation.id)
            assert (debt.status, debt.amount) == ("success", 800)
            assert booked.is_trial is False and booked.trial_discount_percent is None
        finally:
            await flp._cleanup(ids)
    asyncio.run(run())


def test_refused_payment_keeps_the_first_lesson():
    async def run():
        ids = await flp._seed(percent=50)
        try:
            async with crm._client(flp._app(ids)) as http:
                reservation = await _booked_with_debt(http, ids)
                refused = await http.post(f"/schedule/reservations/{reservation.id}/pay", json={
                    "payment_method": "cash", "first_lesson": False, "expected_total": 1})
                assert refused.status_code == 409, refused.text
            async with async_session_maker() as db:
                booked = await db.get(Reservation, reservation.id)
            assert booked.is_trial is True, "касса отказала — снимок первого занятия на месте"
        finally:
            await flp._cleanup(ids)
    asyncio.run(run())


def test_lesson_detail_carries_place_and_paid_mark():
    async def run():
        ids = await flp._seed(percent=50)
        try:
            async with async_session_maker() as db:
                await db.execute(update(StudioBranch).where(StudioBranch.id == ids["branch_a"])
                                 .values(address="Vinohradská 12", city="Praha"))
                await db.commit()
            async with crm._client(flp._app(ids)) as http:
                reservation = await _booked_with_debt(http, ids)
                before = (await http.get(f"/schedule/lessons/{reservation.lesson_id}")).json()
                assert before["location"]["address"] == "Vinohradská 12"
                assert before["location"]["city"] == "Praha"
                row = before["booked_clients"][0]
                assert (row["debt"], row["paid_amount"]) == (500, 0)
                assert row["booked_at"] is not None

                assert (await http.post(f"/schedule/reservations/{reservation.id}/pay",
                                        json={"payment_method": "cash"})).status_code == 200
                after = (await http.get(f"/schedule/lessons/{reservation.lesson_id}")).json()
                assert (after["booked_clients"][0]["debt"], after["booked_clients"][0]["paid_amount"]) == (0, 500)
        finally:
            await flp._cleanup(ids)
    asyncio.run(run())


def test_trainer_cannot_quote_payment():
    async def run():
        ids = await flp._seed(percent=50)
        try:
            async with crm._client(flp._app(ids)) as http:
                reservation = await _booked_with_debt(http, ids)
            async with crm._client(crm._app(ids, role="trainer")) as http:
                refused = await http.post(f"/schedule/reservations/{reservation.id}/payment-preview", json={})
                assert refused.status_code == 403
        finally:
            await flp._cleanup(ids)
    asyncio.run(run())


def test_client_digest_counts_visits_no_shows_and_reviews():
    async def run():
        ids = await flp._seed(percent=50)
        try:
            async with crm._client(flp._app(ids)) as http:
                reservation = await _booked_with_debt(http, ids)
            async with async_session_maker() as db:
                lesson = await db.get(Lesson, reservation.lesson_id)
                past = datetime(2020, 5, 4, 10, 0)

                def old_lesson(name, when):
                    return Lesson(studio_id=ids["studio"], name=name, teacher_name="Anna",
                                  teacher_id=ids["teacher"], start_time=when, tz_iana=lesson.tz_iana,
                                  duration_min=60, price=100, level="", equipment="", total_spots=5,
                                  status="confirmed", booking_mode="event")
                attended, missed = old_lesson("Хатха", past), old_lesson("Хатха", past + timedelta(days=7))
                db.add_all([attended, missed])
                await db.flush()
                db.add_all([
                    Reservation(client_id=ids["client"], lesson_id=attended.id, spot_number=1,
                                status="attended", rating=5, review_text="Отлично"),
                    # Неявка — явная отметка (services/attendance): неотмеченная
                    # бронь прошедшего занятия считается визитом, а прошлое до
                    # этого правила миграция перевела в no_show.
                    Reservation(client_id=ids["client"], lesson_id=missed.id, spot_number=1, status="active",
                                no_show=True),
                ])
                await db.commit()

            app = crm._app(ids)
            app.include_router(clients_router, prefix="/clients")
            async with crm._client(app) as http:
                digest = await http.get(f"/clients/{ids['client']}/digest")
            assert digest.status_code == 200, digest.text
            body = digest.json()
            assert (body["attended"], body["missed"]) == (1, 1)
            assert body["attendance_rate"] == 50
            assert body["avg_rating"] == 5.0
            assert body["favorite_trainer"] == "Anna" and body["favorite_lesson"] == "Хатха"
            assert [v["status"] for v in body["history"]] == ["upcoming", "missed", "attended"], "новые сверху"
            assert body["history"][2]["review_text"] == "Отлично"
            assert body["next_visit"] is not None, "индивидуальная запись впереди"
            ahead = next(v for v in body["history"] if v["status"] == "upcoming")
            assert (ahead["price"], ahead["debt"], ahead["trial_discount_percent"]) == (1000, 500, 50),                 "в истории видно, за сколько записан и сколько должен"
        finally:
            async with async_session_maker() as db:
                await db.execute(Reservation.__table__.delete().where(
                    Reservation.client_id == ids["client"], Reservation.status.in_(("attended", "active"))
                    , Reservation.debt_payment_id.is_(None)))
                await db.commit()
            await flp._cleanup(ids)
    asyncio.run(run())
