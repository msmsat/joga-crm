"""Сколько получает мастер: процент — от суммы, которую заплатил клиент, СО скидкой.

850 по прайсу, скидка 20 % — клиент платит 680, и мастер на 40 % получает 272,
а не 340. Правило одно (services/lesson_compensation): итог мастера записи
показывает его владельцу до подтверждения (превью оплаты записи), а зарплата в
Финансах считает по нему процент за индивидуальные занятия.

Реальная БД. Запуск из back/:  python -m pytest tests/test_master_earning.py -q
"""
import asyncio
import os
import time as _time
from datetime import date, datetime, timedelta

from sqlalchemy import delete, select, update

import test_first_lesson_payment as flp
import test_hybrid_crm_api as crm
from database import async_session_maker
from models import Client, ClientPayment, Lesson, Reservation, Studio, StudioMember, User
from routers.finances import salary
from services import lesson_compensation as LC

enabled = flp.enabled
frozen_clock = flp.frozen_clock


async def _rate(ids, rate, rate_type):
    async with async_session_maker() as db:
        await db.execute(update(StudioMember).where(
            StudioMember.user_id == ids["teacher"], StudioMember.studio_id == ids["studio"],
        ).values(rate=rate, rate_type=rate_type))
        await db.commit()


def _preview_as(ids, role, **codes):
    async def run():
        async with crm._client(crm._app(ids, role=role)) as http:
            key = (await flp._quote(http, ids, first_lesson=False))["quote_id"]
            return await flp._preview(http, key, **codes)
    return run()


def test_percent_master_earns_from_the_discounted_total():
    async def run():
        ids = await flp._seed(percent=50)
        try:
            await _rate(ids, 40, "percent")
            receipt = await _preview_as(ids, "owner", manual_discount_percent=20)
            assert receipt["total"] < receipt["base_price"], receipt
            earning = receipt["compensation"]
            assert earning["kind"] == "percent" and earning["rate"] == 40
            assert earning["base_amount"] == receipt["total"], "база — сумма со скидкой, не прайс"
            assert earning["amount"] == round(receipt["total"] * 0.4, 2)
        finally:
            await flp._cleanup(ids)
    asyncio.run(run())


def test_hourly_master_earns_by_duration():
    async def run():
        ids = await flp._seed(percent=50)
        try:
            await _rate(ids, 600, "hourly")
            receipt = await _preview_as(ids, "owner", manual_discount_percent=20)
            earning = receipt["compensation"]
            assert earning["kind"] == "hourly"
            assert earning["amount"] == round(600 * earning["duration_min"] / 60, 2)
        finally:
            await flp._cleanup(ids)
    asyncio.run(run())


def test_staff_terms_stay_with_the_owner():
    async def run():
        ids = await flp._seed(percent=50)
        try:
            await _rate(ids, 40, "percent")
            receipt = await _preview_as(ids, "admin", manual_discount_percent=20)
            assert receipt["compensation"] is None
        finally:
            await flp._cleanup(ids)
    asyncio.run(run())


# ─── Зарплата: процент за индивидуальное занятие — от оплаченного ────────────

def test_individual_lesson_revenue_rule():
    assert LC.lesson_revenue(850, [{"debt": 680}]) == 680
    assert LC.lesson_revenue(850, [{"payment": {"total": 600, "deposit_applied": 80}}]) == 680
    # Визит по абонементу цены не несёт — как и раньше, цена занятия.
    assert LC.lesson_revenue(850, [{"by_subscription": True}]) == 850
    # Подарок (бесплатное первое занятие) не принёс ничего.
    assert LC.lesson_revenue(850, [{"is_trial": True}]) == 0
    # Запись без учёта оплаты — прежнее правило, цена занятия.
    assert LC.lesson_revenue(850, [{}]) == 850
    assert LC.lesson_revenue(850, []) == 850


async def _payroll_seed() -> dict:
    stamp = f"{int(_time.time() * 1000)}-{os.getpid()}"
    async with async_session_maker() as db:
        studio = Studio(name=f"TEST-PAYROLL-{stamp}", currency="CZK")
        db.add(studio)
        await db.flush()
        master = User(email=f"payroll-{stamp}@test.local", hashed_password="x", name="Анастасия")
        db.add(master)
        await db.flush()
        db.add(StudioMember(user_id=master.id, studio_id=studio.id, role="trainer", status="active",
                            name="Анастасия", rate=40, rate_type="percent"))
        dasha = Client(studio_id=studio.id, name="Дарина")
        db.add(dasha)
        await db.flush()
        day = datetime.combine(date.today() - timedelta(days=1), datetime.min.time())

        def lesson(hour, *, spots=1, price=850):
            return Lesson(studio_id=studio.id, name="Бикини", teacher_name="Анастасия", teacher_id=master.id,
                          start_time=day.replace(hour=hour), duration_min=30, price=price, level="",
                          equipment="", total_spots=spots, status="confirmed", booking_mode="event")

        discounted, by_subscription, gift, group = lesson(10), lesson(11), lesson(12), lesson(13, spots=8, price=500)
        db.add_all([discounted, by_subscription, gift, group])
        await db.flush()
        debt = ClientPayment(client_id=dasha.id, amount=680, status="pending", action_type="lesson",
                             item_key=str(discounted.id), description="Бикини")
        db.add(debt)
        await db.flush()
        db.add_all([
            Reservation(client_id=dasha.id, lesson_id=discounted.id, spot_number=1, status="attended",
                        debt_payment_id=debt.id, manual_discount_percent=20),
            Reservation(client_id=dasha.id, lesson_id=gift.id, spot_number=1, status="attended",
                        is_trial=True, trial_discount_percent=100),
            Reservation(client_id=dasha.id, lesson_id=group.id, spot_number=1, status="attended"),
        ])
        await db.commit()
        return {"studio": studio.id, "master": master.id, "day": day.date(),
                "subscription_lesson": by_subscription.id, "client": dasha.id}


def test_payroll_takes_master_percent_from_the_discounted_amount():
    async def run():
        ids = await _payroll_seed()
        try:
            async with async_session_maker() as db:
                sessions, hours, revenue = await salary._sessions_and_hours(
                    ids["master"], ids["studio"], ids["day"], ids["day"], db)
            # 680 со скидкой + 850 визит без учёта оплаты (как прежде) + 0 подарок
            # + 500 групповое по цене занятия.
            assert sessions == 4 and hours == 2
            assert revenue == 680 + 850 + 0 + 500
            assert salary._compute_amount(40, "percent", hours, revenue) == round(revenue * 0.4)
        finally:
            async with async_session_maker() as db:
                await db.execute(delete(Reservation).where(Reservation.client_id == ids["client"]))
                await db.execute(delete(ClientPayment).where(ClientPayment.client_id == ids["client"]))
                await db.execute(delete(Studio).where(Studio.id == ids["studio"]))
                await db.execute(delete(User).where(User.id == ids["master"]))
                await db.commit()
    asyncio.run(run())
