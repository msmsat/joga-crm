"""«Поменять» оплату занятия, принятую у стойки (services/reservation_refund).

Проверяется то, за что отвечают деньги:
  * отмена кладёт назад ВСЁ, что взяла касса: доход гасится расходом
    «Возвраты» (проведённая строка не стирается), баллы, ваучер и промокод
    возвращаются клиенту, долг снова открыт по цене брони — и оплату можно
    принять заново, с теми же кодами;
  * отказы честные и ничего не двигают: долга нет, оплата картой онлайн,
    перенесённая история, тренер, повторная отмена;
  * персональное предложение и скидка новичка, погашенные этой оплатой, снова
    действуют.

Реальная БД, HTTP через ASGI — как соседний tests/test_journal_lesson_card.py.

Запуск из back/:  python -m pytest tests/test_reservation_payment_cancel.py -q
"""
import asyncio
from datetime import datetime

from sqlalchemy import select, update

import test_first_lesson_payment as flp
import test_hybrid_crm_api as crm
import test_resource_booking as resource
from database import async_session_maker
from dependencies import get_studio_context
from models import (
    Client, ClientLoyaltyCard, ClientOffer, ClientPayment, GiftCertificate, Operation, ReferralRecord,
    Reservation, Studio, StudioPromoCode,
)
from services import platform_fee, reservation_refund

enabled = resource.enabled
frozen_clock = flp.frozen_clock


async def _booked_with_debt(http, ids):
    """Индивидуальная запись без оплаты: первое занятие −50 % → долг 500."""
    key = (await flp._quote(http, ids))["quote_id"]
    created = await http.post("/schedule/bookings", json={"quote_id": key})
    assert created.status_code == 200, created.text
    return await flp._reservation(ids)


def _trainer_app(ids):
    """Вошедший сотрудник с ролью тренера: ручка сначала узнаёт человека, потом роль."""
    app = flp._app(ids)
    app.dependency_overrides[get_studio_context] = crm._app(ids, role="trainer").dependency_overrides[get_studio_context]
    return app


async def _points(ids) -> int:
    async with async_session_maker() as db:
        card = (await db.execute(select(ClientLoyaltyCard).where(
            ClientLoyaltyCard.client_id == ids["client"]))).scalar_one_or_none()
        return card.points_balance if card is not None else 0


async def _give_points(ids, points):
    async with async_session_maker() as db:
        card = (await db.execute(select(ClientLoyaltyCard).where(
            ClientLoyaltyCard.client_id == ids["client"]))).scalar_one_or_none()
        if card is None:
            db.add(ClientLoyaltyCard(client_id=ids["client"], studio_id=ids["studio"], points_balance=points))
        else:
            card.points_balance = points
        await db.commit()


def test_cancel_returns_everything_and_the_payment_can_be_taken_again():
    async def run():
        ids = await flp._seed(percent=50)
        code = f"GC-{ids['studio']}-ONCE"
        try:
            async with async_session_maker() as db:
                # Лимит в одно использование: если отмена не вернёт промокод,
                # повторная оплата с ним получит отказ.
                db.add(StudioPromoCode(studio_id=ids["studio"], code="ONCE20", discount_type="percent",
                                       value=20, usage_limit=1))
                db.add(GiftCertificate(studio_id=ids["studio"], code=code, amount=300,
                                       cert_type="amount", status="active"))
                await db.commit()
            await _give_points(ids, 100)

            async with crm._client(flp._app(ids)) as http:
                reservation = await _booked_with_debt(http, ids)
                url = f"/schedule/reservations/{reservation.id}"
                choice = {"first_lesson": False, "promo_code": "ONCE20", "certificate_code": code,
                          "use_bonuses": True}

                check = (await http.post(f"{url}/payment-preview", json=choice)).json()
                assert check["discounts"] == [{"kind": "promo", "amount": 200, "name": None}]
                assert check["certificate_applied"] == 300 and check["bonuses_applied"] > 0
                paid_total = check["total"]
                assert paid_total > 0
                paid = await http.post(f"{url}/pay", json={
                    **choice, "payment_method": "cash", "expected_total": paid_total})
                assert paid.status_code == 200, paid.text
                assert await _points(ids) < 100

                cancelled = await http.post(f"{url}/payment-cancel")
                assert cancelled.status_code == 200, cancelled.text

                # Журнал: долг снова открыт — по цене брони (первое занятие не
                # засчитали при оплате, значит полная цена), снимка чека нет.
                row = (await http.get(f"/schedule/lessons/{reservation.lesson_id}")).json()["booked_clients"][0]
                assert (row["debt"], row["paid_amount"], row["payment"]) == (1000, 0, None)

                async with async_session_maker() as db:
                    promo = (await db.execute(select(StudioPromoCode).where(
                        StudioPromoCode.studio_id == ids["studio"]))).scalar_one()
                    cert = (await db.execute(select(GiftCertificate).where(
                        GiftCertificate.code == code))).scalar_one()
                    ops = (await db.execute(select(Operation).where(
                        Operation.studio_id == ids["studio"]).order_by(Operation.id))).scalars().all()
                    booked = await db.get(Reservation, reservation.id)
                    debt = await db.get(ClientPayment, booked.debt_payment_id)
                assert promo.used_count == 0, "промокод вернулся"
                assert (cert.status, cert.used_at) == ("active", None), "ваучер вернулся"
                assert await _points(ids) == 100, "баллы вернулись, начисленные за оплату — сняты"
                assert (debt.status, debt.amount) == ("pending", 1000)
                assert booked.payment_breakdown is None and booked.auto_paid is False
                # Доход не стёрт, а погашен расходом той же суммы с того же счёта.
                assert [(o.type, o.amount, o.method) for o in ops] == [
                    ("in", paid_total, "cash"), ("out", paid_total, "cash")]
                assert platform_fee.is_refund_category(ops[1].category)
                assert ops[1].account_id == ops[0].account_id

                # Выбор заново — с тем же промокодом и ваучером, уже картой.
                again = (await http.post(f"{url}/payment-preview", json=choice)).json()
                assert again["total"] == paid_total and again["promo_valid"] is True
                repaid = await http.post(f"{url}/pay", json={
                    **choice, "payment_method": "transfer", "expected_total": paid_total})
                assert repaid.status_code == 200, repaid.text
                row = (await http.get(f"/schedule/lessons/{reservation.lesson_id}")).json()["booked_clients"][0]
                assert row["payment"]["method"] == "transfer" and row["debt"] == 0
        finally:
            await flp._cleanup(ids)
    asyncio.run(run())


def test_refusals_move_no_money():
    async def run():
        ids = await flp._seed(percent=50)
        try:
            async with crm._client(flp._app(ids)) as http:
                reservation = await _booked_with_debt(http, ids)
                url = f"/schedule/reservations/{reservation.id}/payment-cancel"

                unpaid = await http.post(url)
                assert unpaid.status_code == 409, unpaid.text

                assert (await http.post(f"/schedule/reservations/{reservation.id}/pay",
                                        json={"payment_method": "cash"})).status_code == 200

            async with crm._client(_trainer_app(ids)) as http:
                assert (await http.post(url)).status_code == 403

            # Оплата картой онлайн и перенесённая история — не наше дело.
            for patch in ({"method": "stripe"}, {"migration_basis": "owner_confirmed_completed_cash"}):
                async with async_session_maker() as db:
                    booked = await db.get(Reservation, reservation.id)
                    original = dict(booked.payment_breakdown)
                    booked.payment_breakdown = {**original, **patch}
                    await db.commit()
                async with crm._client(flp._app(ids)) as http:
                    refused = await http.post(url)
                    assert refused.status_code == 409, refused.text
                async with async_session_maker() as db:
                    booked = await db.get(Reservation, reservation.id)
                    debt = await db.get(ClientPayment, booked.debt_payment_id)
                    assert debt.status == "success"
                    booked.payment_breakdown = original
                    await db.commit()

            async with crm._client(flp._app(ids)) as http:
                assert (await http.post(url)).status_code == 200
                again = await http.post(url)
                assert again.status_code == 409, "вторая отмена — долг уже открыт"

            async with async_session_maker() as db:
                ops = (await db.execute(select(Operation).where(
                    Operation.studio_id == ids["studio"]))).scalars().all()
            assert sorted(o.type for o in ops) == ["in", "out"], "одна оплата — один возврат"
        finally:
            await flp._cleanup(ids)
    asyncio.run(run())


def test_one_time_discounts_spent_by_the_payment_come_back():
    async def run():
        ids = await flp._seed(percent=50)
        paid_at = datetime.utcnow().replace(microsecond=0)
        try:
            async with async_session_maker() as db:
                studio = await db.get(Studio, ids["studio"])
                friend = Client(studio_id=ids["studio"], name="Friend")
                db.add(friend)
                await db.flush()
                db.add(ClientOffer(studio_id=ids["studio"], client_id=ids["client"], value=10,
                                   is_used=True, used_at=paid_at))
                # Чужое, давно погашенное предложение — не трогаем.
                db.add(ClientOffer(studio_id=ids["studio"], client_id=ids["client"], value=15,
                                   is_used=True, used_at=datetime(2026, 1, 1)))
                db.add(ReferralRecord(studio_id=ids["studio"], referrer_client_id=friend.id,
                                      referred_client_id=ids["client"], status="completed",
                                      discount_used=True))
                await db.flush()
                await reservation_refund._restore_one_time(db, studio.id, ids["client"], {
                    "discounts": [{"kind": "offer", "amount": 100}, {"kind": "referral", "amount": 50}],
                    "paid_at": paid_at.isoformat(),
                })
                await db.commit()

            async with async_session_maker() as db:
                offers = (await db.execute(select(ClientOffer).where(
                    ClientOffer.client_id == ids["client"]).order_by(ClientOffer.value))).scalars().all()
                referral = (await db.execute(select(ReferralRecord).where(
                    ReferralRecord.referred_client_id == ids["client"]))).scalar_one()
            assert [(o.value, o.is_used) for o in offers] == [(10, False), (15, True)]
            assert referral.discount_used is False
        finally:
            async with async_session_maker() as db:
                await db.execute(update(ReferralRecord).where(ReferralRecord.studio_id == ids["studio"])
                                 .values(referrer_client_id=None, referred_client_id=None))
                await db.execute(ReferralRecord.__table__.delete().where(ReferralRecord.studio_id == ids["studio"]))
                await db.execute(ClientOffer.__table__.delete().where(ClientOffer.studio_id == ids["studio"]))
                await db.commit()
            await flp._cleanup(ids)
    asyncio.run(run())
