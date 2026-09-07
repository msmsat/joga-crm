"""Одна цена и один доход: экономическая цепочка записи целиком (P4, финал).

Здесь доказываются два свойства, и оба про деньги конкретного человека.

    СКОЛЬКО КЛИЕНТ СОГЛАСИЛСЯ ЗАПЛАТИТЬ — ОТВЕТ ОДИН.
    Он одинаков у предложения, у заявки Stripe, у проведения и у Финансов.

    УСПЕШНАЯ ОПЛАТА СТАНОВИТСЯ ДОХОДОМ РОВНО ОДИН РАЗ.
    Сколько бы вебхуков, возвратов на страницу и проходов сверки ни пришло.

Почему это отдельный файл. `test_booking_saga` проверяет нашу половину саги
против управляемого Stripe — что считается оплатой и когда освобождать место.
Здесь другой вопрос: КАКАЯ это сумма и куда она попадает в CRM. Смешав их, я
получил бы файл, падение в котором ничего не называет.

Сети нет: там, где нужен Stripe, подменяется та же граница, что в саге.

Реальная БД, ручная чистка. Запуск из back/:  python -m pytest tests/test_booking_money.py
"""
import asyncio
import os
import time as _time
import warnings
from datetime import datetime, time, timedelta, timezone

warnings.filterwarnings("ignore")

from sqlalchemy import delete, select

from database import async_session_maker
from models import (
    ActionProposal, ChannelThread, Client, ClientOffer, ClientPayment, Hall, Lesson,
    OnlineChannel, Operation, Reservation, Service, StripeCheckout, Studio,
    StudioBookingSettings, StudioDiscountConfig, User,
)
from services import booking, booking_payment, pricing

UTC = timezone.utc
_TAG = "TEST-MONEY"
NOW = datetime.now(UTC)
TOMORROW = NOW.date() + timedelta(days=1)
ACCOUNT = "acct_money_studio"
PRICE = 500


# ─── Данные ──────────────────────────────────────────────────────────────────

async def _seed() -> dict:
    stamp = f"{int(_time.time())}-{os.getpid()}"
    async with async_session_maker() as db:
        studio = Studio(name=f"{_TAG}-{stamp}", tz_iana="Europe/Prague",
                        currency="CZK", language="ru")
        db.add(studio)
        await db.flush()
        db.add_all([
            StudioBookingSettings(
                studio_id=studio.id, booking_window_days=30,
                min_booking_advance_min=1, prefill_on_booking=False,
                widget_work_start="00:00", widget_work_end="00:00"),
            OnlineChannel(studio_id=studio.id, channel_type="stripe",
                          is_active=True, account_id=ACCOUNT),
        ])
        hall = Hall(studio_id=studio.id, name="Зал", capacity=10)
        service = Service(studio_id=studio.id, name="Стретчинг", duration_min=60,
                          price=PRICE)
        teacher = User(email=f"money-{stamp}@test.local", hashed_password="x", name="T")
        katya = Client(studio_id=studio.id, name="Катя")
        db.add_all([hall, service, teacher, katya])
        await db.flush()
        lessons = []
        for hour in (18, 19):
            lesson = Lesson(studio_id=studio.id, name="Стретчинг", teacher_name="Т",
                            service_id=service.id, teacher_id=teacher.id,
                            hall_id=hall.id,
                            start_time=datetime.combine(TOMORROW, time(hour, 0)),
                            tz_iana="Europe/Prague", duration_min=60, price=PRICE,
                            level="", equipment="", total_spots=4, status="confirmed")
            db.add(lesson)
            lessons.append(lesson)
        await db.flush()
        ids = {"studio": studio.id, "katya": katya.id, "user": teacher.id,
               "paid": lessons[0].id, "second": lessons[1].id,
               "lessons": [row.id for row in lessons]}
        await db.commit()
    return ids


async def _cleanup(ids) -> None:
    async with async_session_maker() as db:
        sid = ids["studio"]
        from models import Account, ActivityLog, NotificationLog
        for stmt in (
            delete(Operation).where(Operation.studio_id == sid),
            delete(ClientPayment).where(ClientPayment.client_id == ids["katya"]),
            delete(StripeCheckout).where(StripeCheckout.studio_id == sid),
            delete(ActionProposal).where(ActionProposal.studio_id == sid),
            delete(ChannelThread).where(ChannelThread.studio_id == sid),
            delete(Reservation).where(Reservation.lesson_id.in_(ids["lessons"])),
            delete(ClientOffer).where(ClientOffer.client_id == ids["katya"]),
            delete(StudioDiscountConfig).where(StudioDiscountConfig.studio_id == sid),
            delete(Lesson).where(Lesson.studio_id == sid),
            delete(Hall).where(Hall.studio_id == sid),
            delete(Service).where(Service.studio_id == sid),
            delete(Client).where(Client.studio_id == sid),
            delete(OnlineChannel).where(OnlineChannel.studio_id == sid),
            delete(StudioBookingSettings).where(StudioBookingSettings.studio_id == sid),
            delete(Account).where(Account.studio_id == sid),
            delete(ActivityLog).where(ActivityLog.studio_id == sid),
            delete(NotificationLog).where(NotificationLog.studio_id == sid),
            delete(Studio).where(Studio.id == sid),
            delete(User).where(User.id == ids["user"]),
        ):
            await db.execute(stmt)
        await db.commit()


async def _wipe(ids) -> None:
    async with async_session_maker() as db:
        sid = ids["studio"]
        await db.execute(delete(Operation).where(Operation.studio_id == sid))
        await db.execute(delete(ClientPayment).where(
            ClientPayment.client_id == ids["katya"]))
        await db.execute(delete(StripeCheckout).where(StripeCheckout.studio_id == sid))
        await db.execute(delete(Reservation).where(
            Reservation.lesson_id.in_(ids["lessons"])))
        await db.commit()


async def _discount(ids, percent: int | None) -> None:
    """Включить/выключить студийную скидку. None — убрать вовсе."""
    async with async_session_maker() as db:
        row = (await db.execute(select(StudioDiscountConfig).where(
            StudioDiscountConfig.studio_id == ids["studio"]))).scalar_one_or_none()
        if percent is None:
            if row is not None:
                await db.delete(row)
        elif row is None:
            db.add(StudioDiscountConfig(
                studio_id=ids["studio"], is_enabled=True,
                discount_type="percentage", discount_value=percent))
        else:
            row.is_enabled, row.discount_value = True, percent
            row.discount_type = "percentage"
        await db.commit()


async def _quote(ids, lesson_key="paid"):
    async with async_session_maker() as db:
        return await booking.quote(db, studio_id=ids["studio"],
                                   client_id=ids["katya"],
                                   lesson_id=ids[lesson_key], now=NOW)


async def _hold(ids, lesson_key="paid"):
    """Карточная бронь: место держится, заявка заведена по цене клиента."""
    async with async_session_maker() as db:
        result = await booking.create(
            db, studio_id=ids["studio"], client_id=ids["katya"],
            lesson_id=ids[lesson_key], source="agent", hold_for_payment=True, now=NOW)
        assert result.outcome is booking.Outcome.OK, result
        started = await booking_payment.start(
            db, studio_id=ids["studio"], reservation_id=result.reservation_id,
            client_id=ids["katya"], lesson_id=ids[lesson_key], terms=result.terms,
            account_id=ACCOUNT)
        await db.commit()
    async with async_session_maker() as db:
        row = await db.get(StripeCheckout, started.checkout_id)
        row.session_id = f"cs_money_{started.checkout_id}"
        await db.commit()
        session_id = row.session_id
    return result, started, session_id


async def _settle(session_id: str):
    """Проведение общим путём продукта: тем же, что зовёт вебхук."""
    from routers.checkout.stripe_pay import apply_paid

    async with async_session_maker() as db:
        try:
            return await apply_paid(db, session_id, account_id=ACCOUNT)
        except Exception as exc:
            return exc


async def _finance(ids) -> list[Operation]:
    async with async_session_maker() as db:
        return (await db.execute(select(Operation).where(
            Operation.studio_id == ids["studio"],
            Operation.type == "in"))).scalars().all()


# ─── ЦЕНА ────────────────────────────────────────────────────────────────────

async def _discount_reaches_the_card(ids):
    """500 по прайсу, скидка 20% -> с карты списывается 400. И только 400."""
    await _discount(ids, 20)
    offered = await _quote(ids)
    assert offered.outcome is booking.Outcome.OK, offered
    assert offered.terms.funding.kind is booking.FundingKind.PAY
    assert offered.terms.funding.price == 400, offered.terms.funding.price
    assert offered.terms.base_price == PRICE

    _booked, started, session_id = await _hold(ids)
    assert started.amount == 400, started.amount
    async with async_session_maker() as db:
        row = await db.get(StripeCheckout, started.checkout_id)
        assert row.amount == 400
        assert row.payload["amount"] == 400
        assert row.payload["currency"] == "CZK"

    assert await _settle(session_id) is True
    income = await _finance(ids)
    assert len(income) == 1 and income[0].amount == 400, [o.amount for o in income]
    await _discount(ids, None)


async def _full_discount_needs_no_payment(ids):
    """Скидка 100% -> платить нечего: ни формы, ни долга, ни дохода."""
    await _discount(ids, 100)
    offered = await _quote(ids)
    assert offered.terms.funding.kind is booking.FundingKind.FREE, offered.terms.funding
    assert offered.terms.funding.price == 0
    assert offered.payment_required is False

    async with async_session_maker() as db:
        result = await booking.create(
            db, studio_id=ids["studio"], client_id=ids["katya"],
            lesson_id=ids["paid"], source="agent", hold_for_payment=True, now=NOW)
        await db.commit()
    assert result.status == "active", result
    async with async_session_maker() as db:
        row = await db.get(Reservation, result.reservation_id)
        # Долга «оплата на месте» тоже нет: человек ничего не должен.
        assert row.debt_payment_id is None
        rows = (await db.execute(select(StripeCheckout).where(
            StripeCheckout.studio_id == ids["studio"]))).scalars().all()
    assert rows == [], "завели платёжную форму на нулевую сумму"
    await _discount(ids, None)


async def _rounding_is_deterministic(ids):
    """Копейки не выдумываются: расчёт целочисленный и повторяемый."""
    async with async_session_maker() as db:
        for percent, base, expected in ((33, 500, 335), (1, 99, 99), (99, 1, 1),
                                        (50, 333, 167), (100, 777, 0)):
            await _discount(ids, percent)
            got = await pricing.resolve_price(db, ids["studio"], ids["katya"], base)
            assert got.final_price == expected, (percent, base, got.final_price)
            assert isinstance(got.final_price, int)
    await _discount(ids, None)


async def _stale_price_needs_new_consent(ids):
    """Скидка изменилась между показом и «да» -> подтверждать нечего."""
    await _discount(ids, 20)
    shown = (await _quote(ids)).terms
    assert shown.funding.price == 400

    for percent, why in ((None, "скидку убрали"), (30, "скидку увеличили")):
        await _discount(ids, percent)
        async with async_session_maker() as db:
            result = await booking.create(
                db, studio_id=ids["studio"], client_id=ids["katya"],
                lesson_id=ids["paid"], source="agent", shown=shown,
                hold_for_payment=True, now=NOW)
            await db.rollback()
        assert result.outcome is booking.Outcome.TERMS_CHANGED, (why, result)
        assert await _finance(ids) == []
    await _discount(ids, None)


async def _funding_kind_is_material(ids):
    """Цена та же, основание другое — это тоже другие условия."""
    await _discount(ids, 100)
    free = (await _quote(ids)).terms
    assert free.funding.kind is booking.FundingKind.FREE and free.funding.price == 0
    await _discount(ids, None)
    async with async_session_maker() as db:
        lesson = await db.get(Lesson, ids["paid"])
        lesson.price = 0
        await db.commit()
    now_free = (await _quote(ids)).terms
    # Обе «бесплатно», но одна — по скидке, другая — по прайсу. Числа совпадают,
    # снимок занятия нет: изменилась цена самого занятия.
    assert now_free.funding.price == free.funding.price
    assert booking.material_change(free, now_free), "правка прайса прошла как «не менялось»"
    async with async_session_maker() as db:
        lesson = await db.get(Lesson, ids["paid"])
        lesson.price = PRICE
        await db.commit()


async def _one_time_offer_burns_only_on_success(ids):
    """Одноразовая скидка сгорает от СОСТОЯВШЕЙСЯ оплаты и только от неё.

    Персональный оффер — это разовое право. Брошенная на полпути оплата не
    должна его сжигать (человек не получил ничего), а состоявшаяся обязана —
    иначе одну скидку можно потратить дважды. Помечает использованным
    `consume_quote` внутри общего денежного движка; предложение и открытая
    форма её не трогают.
    """
    from datetime import date as _date

    async def _offer() -> ClientOffer:
        async with async_session_maker() as db:
            row = ClientOffer(studio_id=ids["studio"], client_id=ids["katya"],
                              discount_type="percent", value=20, reason="manual",
                              scope="renewal", valid_until=_date.today() + timedelta(days=7))
            db.add(row)
            await db.commit()
            return row

    async def _used(offer_id: int) -> bool:
        async with async_session_maker() as db:
            return (await db.get(ClientOffer, offer_id)).is_used

    # 1. Предложение и открытая форма скидку НЕ жгут.
    offer = await _offer()
    offered = await _quote(ids)
    assert offered.terms.funding.price == 400, offered.terms.funding.price
    assert not await _used(offer.id), "предложение сожгло одноразовую скидку"
    _booked, _started, session_id = await _hold(ids)
    assert not await _used(offer.id), "открытая форма сожгла одноразовую скидку"

    # 2. Состоявшаяся оплата — жжёт.
    assert await _settle(session_id) is True
    assert await _used(offer.id), "оплата не погасила одноразовую скидку"
    income = await _finance(ids)
    assert len(income) == 1 and income[0].amount == 400, [o.amount for o in income]
    async with async_session_maker() as db:
        await db.execute(delete(ClientOffer).where(ClientOffer.client_id == ids["katya"]))
        await db.commit()


# ─── ДОХОД ───────────────────────────────────────────────────────────────────

async def _one_payment_one_income(ids):
    """Оплата -> ровно один доход, одна строка в истории платежей клиента."""
    booked, started, session_id = await _hold(ids)
    assert await _settle(session_id) is True

    income = await _finance(ids)
    assert len(income) == 1, [(o.amount, o.title) for o in income]
    op = income[0]
    assert op.amount == PRICE and op.method == "stripe"
    assert op.client_id == ids["katya"]
    assert op.category == "Услуги"
    async with async_session_maker() as db:
        payments = (await db.execute(select(ClientPayment).where(
            ClientPayment.client_id == ids["katya"]))).scalars().all()
        row = await db.get(Reservation, booked.reservation_id)
    assert len(payments) == 1 and payments[0].status == "success"
    assert payments[0].amount == PRICE and payments[0].action_type == "lesson"
    assert row.status == "active"

    # Повтор проведения (второй вебхук, возврат на страницу, сверка) дохода не
    # добавляет: заявка уже не `pending`.
    assert await _settle(session_id) is False
    assert len(await _finance(ids)) == 1


async def _four_concurrent_settlements(ids):
    """Вебхук, страница успеха, уборка и ручная сверка — одновременно."""
    _booked, _started, session_id = await _hold(ids)
    results = await asyncio.gather(*[_settle(session_id) for _ in range(4)])
    assert sum(1 for r in results if r is True) == 1, results
    assert len(await _finance(ids)) == 1, await _finance(ids)
    async with async_session_maker() as db:
        rows = (await db.execute(select(Reservation).where(
            Reservation.lesson_id == ids["paid"],
            Reservation.status == "active"))).scalars().all()
    assert len(rows) == 1


async def _crash_before_settlement(ids):
    """Деньги у Stripe, процесс убит до проводки -> сверка доводит ровно один раз.

    «Убит до проводки» здесь и означает: локальная транзакция не начиналась,
    заявка осталась `pending`. Повторное проведение — это и есть то, что сделает
    сверка после перезапуска.
    """
    _booked, _started, session_id = await _hold(ids)
    assert await _finance(ids) == []          # до проводки дохода нет
    assert await _settle(session_id) is True  # сверка после перезапуска
    assert len(await _finance(ids)) == 1
    assert await _settle(session_id) is False  # и ещё один заход ничего не меняет
    assert len(await _finance(ids)) == 1


async def _no_payment_no_income(ids):
    """Не оплачено, не та сумма, не та студия — дохода нет ни в одном случае."""
    # 1. Заявка есть, оплаты не было: проводить нечего.
    booked, started, _session = await _hold(ids)
    assert await _finance(ids) == []

    # 2. Сумма в заявке разошлась с телом — проведение отвергнуто.
    async with async_session_maker() as db:
        row = await db.get(StripeCheckout, started.checkout_id)
        row.payload = {**row.payload, "amount": 1}
        await db.commit()
    outcome = await _settle(f"cs_money_{started.checkout_id}")
    assert isinstance(outcome, Exception), outcome
    assert await _finance(ids) == [], "не та сумма завела доход"
    async with async_session_maker() as db:
        row = await db.get(StripeCheckout, started.checkout_id)
        assert row.status == "failed"
        res = await db.get(Reservation, booked.reservation_id)
        assert res.status == "hold", "не та сумма активировала бронь"
    await _wipe(ids)

    # 3. Событие чужого аккаунта Connect.
    _booked, started, session_id = await _hold(ids)
    from routers.checkout.stripe_pay import apply_paid
    async with async_session_maker() as db:
        assert await apply_paid(db, session_id, account_id="acct_stranger") is False
    assert await _finance(ids) == [], "чужой аккаунт завёл доход"


async def _two_equal_payments_are_two_incomes(ids):
    """Две законные покупки на одну сумму не схлопываются в одну."""
    _a, _sa, first = await _hold(ids, "paid")
    _b, _sb, second = await _hold(ids, "second")
    assert await _settle(first) is True
    assert await _settle(second) is True
    income = await _finance(ids)
    assert len(income) == 2, [(o.amount, o.title) for o in income]
    assert {o.amount for o in income} == {PRICE}


async def _income_uses_the_settled_amount(ids):
    """В Финансы попадает уплаченное, а не то, что стоило бы сегодня."""
    await _discount(ids, 20)
    _booked, started, session_id = await _hold(ids)
    assert started.amount == 400
    # Скидку убрали ПОСЛЕ создания заявки: договор от этого не меняется, но и
    # провести «как сегодня» нельзя — пересчёт не сойдётся со списанным.
    await _discount(ids, None)
    outcome = await _settle(session_id)
    assert isinstance(outcome, Exception), "проведено по сегодняшней цене"
    assert await _finance(ids) == [], "в Финансы попала не уплаченная сумма"
    async with async_session_maker() as db:
        row = await db.get(StripeCheckout, started.checkout_id)
        assert row.status == "failed", row.status


# ─── ЦЕПОЧКА ЦЕЛИКОМ ─────────────────────────────────────────────────────────

async def _one_answer_everywhere(ids):
    """Предложение = заявка = Stripe = проведение = Финансы. И валюта тоже."""
    await _discount(ids, 20)
    shown = (await _quote(ids)).terms
    booked, started, session_id = await _hold(ids)
    assert await _settle(session_id) is True

    async with async_session_maker() as db:
        checkout = await db.get(StripeCheckout, started.checkout_id)
        studio = await db.get(Studio, ids["studio"])
        payment = (await db.execute(select(ClientPayment).where(
            ClientPayment.client_id == ids["katya"]))).scalars().one()
    income = await _finance(ids)
    amounts = {shown.funding.price, started.amount, checkout.amount,
               checkout.payload["amount"], income[0].amount, payment.amount}
    assert amounts == {400}, amounts
    assert shown.funding.currency == checkout.payload["currency"] == studio.currency
    await _discount(ids, None)


# ─── Архитектура ─────────────────────────────────────────────────────────────

def test_paid_path_never_prices_from_the_lesson():
    """Платёжный путь не берёт цену из прайса напрямую."""
    import inspect

    # Единственное место, где прайс превращается в цену клиента.
    assert "pricing.resolve_price" in inspect.getsource(booking.client_price)
    for fn in (booking_payment.pay_link, booking_payment.start,
               booking_payment.record_income):
        source = inspect.getsource(fn)
        assert "lesson.price" not in source or "client_price" in source, fn.__name__
    # Цену считает домен, а не мост и не агент.
    from services import agent_search
    for module in (agent_search, booking_payment):
        assert "resolve_price" not in inspect.getsource(module), module.__name__


def test_finance_goes_through_the_common_engine():
    """Доход по занятию заводит общий движок, а не своя проводка."""
    import inspect

    source = inspect.getsource(booking_payment.record_income)
    assert "perform_pay" in source
    # Своих денежных строк платёжный мост не создаёт.
    module = inspect.getsource(booking_payment)
    for banned in ("Operation(", "ClientPayment(", "accrue_points", "register_purchase"):
        assert banned not in module, banned


def test_lesson_booking_is_known_to_every_money_branch():
    """Оплата занятия проходит все существующие развилки денежного пути."""
    import inspect

    from routers.checkout import stripe_pay

    for fn in (stripe_pay.apply_paid, stripe_pay._revert_sale):
        assert "booking_payment.is_booking" in inspect.getsource(fn), fn.__name__


# ─── Один прогон ─────────────────────────────────────────────────────────────

def test_booking_money_against_the_database():
    async def run():
        ids = await _seed()
        try:
            for step in (_discount_reaches_the_card, _full_discount_needs_no_payment,
                         _rounding_is_deterministic, _stale_price_needs_new_consent,
                         _funding_kind_is_material,
                         _one_time_offer_burns_only_on_success,
                         _one_payment_one_income,
                         _four_concurrent_settlements, _crash_before_settlement,
                         _no_payment_no_income, _two_equal_payments_are_two_incomes,
                         _income_uses_the_settled_amount, _one_answer_everywhere):
                await step(ids)
                await _wipe(ids)
        finally:
            await _cleanup(ids)

    asyncio.run(run())


if __name__ == "__main__":
    test_paid_path_never_prices_from_the_lesson()
    test_finance_goes_through_the_common_engine()
    test_lesson_booking_is_known_to_every_money_branch()
    test_booking_money_against_the_database()
    print("booking money ok")
