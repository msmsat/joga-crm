"""Оплата занятия картой: что имеет право перевести бронь в запись (P4).

Единственное свойство, ради которого этот файл существует:

    БРОНЬ СТАНОВИТСЯ ЗАПИСЬЮ ТОЛЬКО ОТ АВТОРИТЕТНОЙ ОПЛАТЫ ЗА НЕЁ.

Не от названия события («completed» — не деньги), не от суммы «примерно той»,
не от аккаунта «примерно того». Каждая из этих подмен — реальный сценарий:
владелец подключённого аккаунта Stripe распоряжается им сам и может создать у
себя сессию с чужой обратной ссылкой; клиент может оплатить крону вместо пяти
сотен; вебхук приходит дважды и в перепутанном порядке.

Место при этом ДЕРЖИТСЯ статусом `hold`: пока человек платит, последний коврик
не должен уйти второму. Но `hold` — не запись: ни в посещаемость, ни в отчёты
подтверждённых броней он не попадает, и человеку не говорится «вы записаны».

Сети здесь нет: Stripe в тестах не вызывается вовсе — проверяется наша половина
саги, та, где принимаются решения.

Реальная БД, ручная чистка. Запуск из back/:  python -m pytest tests/test_booking_payment.py
"""
import asyncio
import logging
import os
import time as _time
import warnings
from datetime import date, datetime, time, timedelta, timezone

warnings.filterwarnings("ignore")

from sqlalchemy import delete, select

from database import async_session_maker
from models import (
    Client, Hall, Lesson, Reservation, Service, StripeCheckout, Studio,
    StudioBookingSettings, User,
)
from services import booking, booking_payment
from services.booking_payment import Settlement

UTC = timezone.utc
_TAG = "TEST-PAY"
NOW = datetime.now(UTC)
TOMORROW = NOW.date() + timedelta(days=1)
ACCOUNT = "acct_test_booking"


async def _seed() -> dict:
    stamp = f"{int(_time.time())}-{os.getpid()}"
    async with async_session_maker() as db:
        studio = Studio(name=f"{_TAG}-{stamp}", tz_iana="Europe/Prague", currency="CZK")
        other = Studio(name=f"{_TAG}-B-{stamp}", tz_iana="Europe/Prague", currency="EUR")
        db.add_all([studio, other])
        await db.flush()
        for row in (studio, other):
            db.add(StudioBookingSettings(
                studio_id=row.id, booking_window_days=30, min_booking_advance_min=1,
                prefill_on_booking=False, widget_work_start="00:00",
                widget_work_end="00:00"))
        hall = Hall(studio_id=studio.id, name="Зал", capacity=10)
        service = Service(studio_id=studio.id, name="Стретчинг", duration_min=60, price=500)
        teacher = User(email=f"pay-{stamp}@test.local", hashed_password="x", name="T")
        katya = Client(studio_id=studio.id, name="Катя")
        db.add_all([hall, service, teacher, katya])
        await db.flush()
        lessons = []
        for hour in (18, 19):
            lesson = Lesson(studio_id=studio.id, name="Стретчинг", teacher_name="Т",
                            service_id=service.id, teacher_id=teacher.id,
                            hall_id=hall.id,
                            start_time=datetime.combine(TOMORROW, time(hour, 0)),
                            tz_iana="Europe/Prague", duration_min=60, price=500,
                            level="", equipment="", total_spots=1,
                            status="confirmed")
            db.add(lesson)
            lessons.append(lesson)
        await db.flush()
        ids = {"studio": studio.id, "other": other.id, "katya": katya.id,
               "user": teacher.id, "hall": hall.id, "service": service.id,
               "paid": lessons[0].id, "second": lessons[1].id,
               "lessons": [row.id for row in lessons]}
        await db.commit()
    return ids


async def _cleanup(ids) -> None:
    async with async_session_maker() as db:
        studios = [ids["studio"], ids["other"]]
        await db.execute(delete(StripeCheckout).where(
            StripeCheckout.studio_id.in_(studios)))
        await db.execute(delete(Reservation).where(
            Reservation.lesson_id.in_(ids["lessons"])))
        await db.execute(delete(Lesson).where(Lesson.studio_id.in_(studios)))
        await db.execute(delete(Hall).where(Hall.studio_id.in_(studios)))
        await db.execute(delete(Service).where(Service.studio_id.in_(studios)))
        await db.execute(delete(Client).where(Client.studio_id.in_(studios)))
        await db.execute(delete(StudioBookingSettings).where(
            StudioBookingSettings.studio_id.in_(studios)))
        await db.execute(delete(Studio).where(Studio.id.in_(studios)))
        await db.execute(delete(User).where(User.id == ids["user"]))
        await db.commit()


async def _wipe(ids) -> None:
    async with async_session_maker() as db:
        await db.execute(delete(StripeCheckout).where(
            StripeCheckout.studio_id.in_([ids["studio"], ids["other"]])))
        await db.execute(delete(Reservation).where(
            Reservation.lesson_id.in_(ids["lessons"])))
        await db.commit()


async def _hold(ids, lesson_key="paid"):
    """Подтверждённая карточная бронь: место держится, оплаты ещё нет."""
    async with async_session_maker() as db:
        result = await booking.create(
            db, studio_id=ids["studio"], client_id=ids["katya"],
            lesson_id=ids[lesson_key], source="agent", hold_for_payment=True,
            now=NOW)
        assert result.outcome is booking.Outcome.OK, result
        assert result.status == "hold", result
        started = await booking_payment.start(
            db, studio_id=ids["studio"], reservation_id=result.reservation_id,
            client_id=ids["katya"], lesson_id=ids[lesson_key],
            terms=result.terms, account_id=ACCOUNT)
        await db.commit()
        return result, started


async def _checkout(checkout_id: int) -> StripeCheckout:
    async with async_session_maker() as db:
        return await db.get(StripeCheckout, checkout_id)


async def _status(reservation_id: int) -> str:
    async with async_session_maker() as db:
        row = await db.get(Reservation, reservation_id)
        return row.status if row else "gone"


async def _settle(checkout_id: int, **overrides) -> Settlement:
    """Провести оплату. `overrides` подменяет заявку — так проверяются подлоги."""
    async with async_session_maker() as db:
        checkout = await db.get(StripeCheckout, checkout_id)
        for field, value in overrides.items():
            if field == "payload":
                checkout.payload = {**checkout.payload, **value}
            else:
                setattr(checkout, field, value)
        result = await booking_payment.settle(db, checkout)
        await db.commit()
        return result


# ─── Место держится, но записью не является ──────────────────────────────────

async def _hold_semantics(ids):
    booked, _started = await _hold(ids)
    assert await _status(booked.reservation_id) == "hold"

    # Место ЗАНЯТО: второй на единственный коврик не сядет.
    async with async_session_maker() as db:
        second = await booking.create(
            db, studio_id=ids["studio"], client_id=ids["katya"],
            lesson_id=ids["paid"], source="agent", hold_for_payment=True, now=NOW)
        await db.rollback()
    assert second.outcome in (booking.Outcome.NO_CAPACITY,
                              booking.Outcome.ALREADY_BOOKED,
                              booking.Outcome.SPOT_TAKEN), second

    # …но подтверждённой записью НЕ считается: отчёты и посещаемость смотрят
    # на явные списки статусов, и `hold` в них не входит.
    async with async_session_maker() as db:
        confirmed = (await db.execute(select(Reservation).where(
            Reservation.lesson_id == ids["paid"],
            Reservation.status.in_(("active", "attended"))))).scalars().all()
        assert confirmed == [], "неоплаченная бронь попала в подтверждённые"
        occupying = (await db.execute(select(Reservation).where(
            Reservation.lesson_id == ids["paid"],
            Reservation.status != "cancelled"))).scalars().all()
        assert len(occupying) == 1, "неоплаченная бронь не держит место"

    # ВИТРИНА ТОЖЕ СЧИТАЕТ МЕСТО ЗАНЯТЫМ. Проверяем через каталог — тот самый
    # источник, из которого расписание берёт «сколько мест свободно»: иначе
    # человек увидит свободный коврик, нажмёт и упрётся в «место занято».
    from services import catalog

    async with async_session_maker() as db:
        facts = await catalog.lesson(db, ids["studio"], ids["paid"])
    assert facts is not None
    assert facts.available_spots == 0, "витрина показывает место под неоплаченной бронью"
    assert facts.taken_spots == 1

    # Долга «оплата на месте» под карточную бронь не заводится: иначе человек
    # заплатит дважды.
    async with async_session_maker() as db:
        row = await db.get(Reservation, booked.reservation_id)
        assert row.debt_payment_id is None


# ─── Авторитетная оплата и только она ────────────────────────────────────────

async def _settlement(ids):
    booked, started = await _hold(ids)
    assert await _settle(started.checkout_id) is Settlement.ACTIVATED
    assert await _status(booked.reservation_id) == "active"

    # Повтор (второй вебхук, возврат на success_url, сверка) — безобиден.
    assert await _settle(started.checkout_id) is Settlement.ALREADY
    assert await _status(booked.reservation_id) == "active"


async def _wrong_payment(ids):
    # Сумма не та.
    booked, started = await _hold(ids)
    assert await _settle(started.checkout_id, amount=1) is Settlement.MISMATCH
    assert await _status(booked.reservation_id) == "hold", "чужая сумма активировала бронь"
    await _wipe(ids)

    # Валюта не та.
    booked, started = await _hold(ids)
    assert await _settle(started.checkout_id,
                         payload={"currency": "EUR"}) is Settlement.MISMATCH
    assert await _status(booked.reservation_id) == "hold"
    await _wipe(ids)

    # Занятие в заявке не то.
    booked, started = await _hold(ids)
    assert await _settle(started.checkout_id,
                         payload={"lesson_id": ids["second"]}) is Settlement.MISMATCH
    assert await _status(booked.reservation_id) == "hold"
    await _wipe(ids)

    # Чужая студия: заявка другой студии нашу бронь не находит вовсе.
    booked, started = await _hold(ids)
    assert await _settle(started.checkout_id,
                         studio_id=ids["other"]) is Settlement.UNFULFILLABLE
    assert await _status(booked.reservation_id) == "hold", "событие чужой студии активировало бронь"
    await _wipe(ids)

    # Брони нет вовсе.
    booked, started = await _hold(ids)
    assert await _settle(started.checkout_id,
                         payload={"reservation_id": 10 ** 9}) is Settlement.UNFULFILLABLE


# ─── Оплата пришла, а исполнить нечего ───────────────────────────────────────

async def _unfulfillable(ids):
    # Занятие отменили, пока человек платил.
    booked, started = await _hold(ids)
    async with async_session_maker() as db:
        lesson = await db.get(Lesson, ids["paid"])
        lesson.status = "cancelled"
        await db.commit()
    assert await _settle(started.checkout_id) is Settlement.UNFULFILLABLE
    assert await _status(booked.reservation_id) == "hold", \
        "оплата активировала бронь на отменённое занятие"
    async with async_session_maker() as db:
        lesson = await db.get(Lesson, ids["paid"])
        lesson.status = "confirmed"
        await db.commit()
    await _wipe(ids)

    # Бронь сняли, пока человек платил.
    booked, started = await _hold(ids)
    async with async_session_maker() as db:
        await booking.cancel(db, studio_id=ids["studio"],
                             reservation_id=booked.reservation_id,
                             actor="staff", enforce_policy=False)
        await db.commit()
    assert await _settle(started.checkout_id) is Settlement.UNFULFILLABLE
    assert await _status(booked.reservation_id) == "cancelled"


# ─── Одна живая форма на одну бронь ──────────────────────────────────────────

async def _one_live_session(ids):
    booked, first = await _hold(ids)
    # Повторное подтверждение той же брони: заявка ТА ЖЕ, вторая форма не
    # заводится — детерминированный ключ попытки этого не позволяет.
    async with async_session_maker() as db:
        again = await booking_payment.start(
            db, studio_id=ids["studio"], reservation_id=booked.reservation_id,
            client_id=ids["katya"], lesson_id=ids["paid"],
            terms=booked.terms, account_id=ACCOUNT)
        await db.commit()
    assert again.checkout_id == first.checkout_id, "на одну бронь завели две заявки"
    assert again.attempt_id == first.attempt_id

    async with async_session_maker() as db:
        rows = (await db.execute(select(StripeCheckout).where(
            StripeCheckout.studio_id == ids["studio"],
            StripeCheckout.status == "pending"))).scalars().all()
    assert len(rows) == 1, [r.id for r in rows]


def _terms_of(started):
    """Условия из заявки — на случай, если место уже занято и quote пуст."""
    from services.booking import Funding, FundingKind, Terms

    return Terms(lesson_id=0, local_start=NOW.replace(tzinfo=None),
                 service_name="", trainer_name="", branch_name=None,
                 funding=Funding(FundingKind.PAY, None, started.amount,
                                 started.currency),
                 approval_required=False)


# ─── Одобрение раньше денег ──────────────────────────────────────────────────

async def _approval_before_money(ids):
    async with async_session_maker() as db:
        row = (await db.execute(select(StudioBookingSettings).where(
            StudioBookingSettings.studio_id == ids["studio"]))).scalar_one()
        row.trainer_confirmation_required = True
        await db.commit()

    async with async_session_maker() as db:
        result = await booking.create(
            db, studio_id=ids["studio"], client_id=ids["katya"],
            lesson_id=ids["paid"], source="agent", hold_for_payment=True, now=NOW)
        await db.commit()
    # Студия ещё не одобрила — значит и платить не за что: `pending`, не `hold`.
    assert result.status == "pending", result
    async with async_session_maker() as db:
        rows = (await db.execute(select(StripeCheckout).where(
            StripeCheckout.studio_id == ids["studio"]))).scalars().all()
    assert rows == [], "деньги взяты до одобрения студии"

    async with async_session_maker() as db:
        row = (await db.execute(select(StudioBookingSettings).where(
            StudioBookingSettings.studio_id == ids["studio"]))).scalar_one()
        row.trainer_confirmation_required = False
        await db.commit()


# ─── Просроченный hold ───────────────────────────────────────────────────────

async def _stale_hold(ids):
    booked, started = await _hold(ids)
    # Свежий hold в уборку не попадает.
    async with async_session_maker() as db:
        assert await booking_payment.stale_holds(db, now=NOW.replace(tzinfo=None)) == []

    async with async_session_maker() as db:
        row = await db.get(Reservation, booked.reservation_id)
        row.created_at = datetime.utcnow() - timedelta(
            minutes=booking_payment.HOLD_MINUTES + 5)
        await db.commit()
    async with async_session_maker() as db:
        stale = await booking_payment.stale_holds(db)
    assert booked.reservation_id in [r[0] for r in stale], stale
    # По брони находится её незакрытая заявка — есть о чём спрашивать Stripe.
    async with async_session_maker() as db:
        row = await booking_payment.checkout_for(
            db, studio_id=ids["studio"], reservation_id=booked.reservation_id)
    assert row is not None and row.id == started.checkout_id
    # НО МЕСТО НЕ ОСВОБОЖДЕНО: список — это повод спросить у платёжной системы,
    # а не решение. Освободить под возможную оплату значит получить деньги за
    # бронь, которой уже нет.
    assert await _status(booked.reservation_id) == "hold"


# ─── Уборка не зависит от раскатки ───────────────────────────────────────────

async def _sweeper_ignores_the_flag(ids):
    """Флаг решает, заводить ли НОВЫЕ оплаты. Уже начатые доводятся всегда.

    Выключение раскатки не имеет права бросить чужие деньги: место держится,
    заявка живёт, и кто-то обязан о них помнить независимо от того, включён ли
    эксперимент.
    """
    from workers.main import _watch_stale_holds

    booked, _started = await _hold(ids)
    async with async_session_maker() as db:
        row = await db.get(Reservation, booked.reservation_id)
        row.created_at = datetime.utcnow() - timedelta(
            minutes=booking_payment.HOLD_MINUTES + 5)
        await db.commit()

    seen: list = []

    class _Catcher(logging.Handler):
        def emit(self, record):
            seen.append(record.getMessage())

    handler = _Catcher()
    logger = logging.getLogger("velora.worker")
    logger.addHandler(handler)
    try:
        # Флага в этом проходе нет вовсе — и это проверяется вызовом без него.
        await _watch_stale_holds()
    finally:
        logger.removeHandler(handler)
    assert any("hold_too_old" in line for line in seen), seen
    # …и место при этом НЕ освобождено: проход только сообщает.
    assert await _status(booked.reservation_id) == "hold"


def test_sweeper_is_not_behind_a_feature_flag():
    """В проходе уборки нет ни одного обращения к флагам."""
    import inspect

    from workers import main as worker

    source = inspect.getsource(worker._watch_stale_holds)
    assert "feature_flags" not in source and "is_enabled" not in source
    assert "stale_holds" in source


# ─── Архитектура ─────────────────────────────────────────────────────────────

def test_no_second_payment_ledger():
    """P4 расширяет существующую заявку, а не заводит вторую таблицу денег."""
    import inspect

    source = inspect.getsource(booking_payment)
    assert "StripeCheckout" in source
    for banned in ("class PaymentAttempt", "payment_attempts", "class Payment("):
        assert banned not in source, banned
    # Заявку заводит существующая функция продукта, а не своя копия.
    assert "reserve_checkout" in source


def _code(source: str) -> str:
    """Код без комментариев и строк документации.

    Проверка ищет ВЫЗОВЫ, а не упоминания: докстринг, объясняющий, почему сеть
    живёт в соседней функции, запретом быть не может — иначе объяснять пришлось
    бы иносказаниями.
    """
    import io as _io
    import tokenize

    out = []
    previous = tokenize.INDENT
    for tok in tokenize.generate_tokens(_io.StringIO(source).readline):
        if tok.type == tokenize.COMMENT:
            continue
        if (tok.type == tokenize.STRING
                and previous in (tokenize.INDENT, tokenize.NEWLINE, tokenize.NL)):
            continue                     # строка-документация
        out.append(tok.string)
        if tok.type not in (tokenize.NL, tokenize.COMMENT):
            previous = tok.type
    return " ".join(out)


def test_no_network_inside_the_booking_transaction():
    """Сеть в открытой транзакции — запрет, на котором стоит весь P0.

    Домен записи проверяется ЦЕЛИКОМ: там сети не должно быть нигде. Платёжный
    мост — ПОФУНКЦИОНАЛЬНО: он обязан ходить в Stripe, но только из своих
    функций (`pay_link`, `sweep`), которые вызываются вне чужой транзакции.
    Проверка по модулю здесь была бы либо ложной, либо снятой целиком — и
    граница осталась бы на внимательности.
    """
    import inspect

    banned = ("stripe.", "httpx", "aiohttp", "requests.",
              "create_checkout_session", "create_hosted_checkout_session",
              "fetch_session", "expire_session", "apply_paid")
    for word in banned:
        assert word not in _code(inspect.getsource(booking)), ("services.booking", word)

    # Эти функции живут в транзакции вызывающего: подтверждение записи и
    # проведение оплаты. Сеть внутри них означала бы открытую транзакцию,
    # ждущую ответа Stripe.
    for fn in (booking_payment.start, booking_payment.settle,
               booking_payment.unfulfillable_reason,
               booking_payment.stale_holds, booking_payment.checkout_for,
               booking_payment._paid_sibling, booking_payment._tell_the_client):
        text = _code(inspect.getsource(fn))
        for word in banned:
            assert word not in text, (fn.__name__, word)

    # …а эти обязаны ходить в сеть — иначе просрочка формы была бы нашим
    # локальным мнением, а не операцией у платёжной системы.
    for fn in (booking_payment.pay_link, booking_payment._resolve):
        text = inspect.getsource(fn)
        assert "stripe_connect." in text, fn.__name__


def test_event_name_is_not_money():
    """`settle` не знает про типы событий вовсе — он смотрит на состояние."""
    import inspect

    source = inspect.getsource(booking_payment.settle)
    for banned in ("checkout.session.completed", "event", "type"):
        assert banned not in source.replace("# ", ""), banned


def test_hold_is_in_the_status_contract():
    """Статус, который пишет код, обязан проходить CHECK в базе."""
    import re

    from models.schedule import Reservation as R

    allowed = set()
    for arg in R.__table_args__:
        text = str(getattr(arg, "sqltext", ""))
        if "status" in text:
            allowed = set(re.findall(r"'(\w+)'", text))
    assert "hold" in allowed, allowed


# ─── Один прогон ─────────────────────────────────────────────────────────────

def test_booking_payment_against_the_database():
    async def run():
        ids = await _seed()
        try:
            await _hold_semantics(ids)
            await _wipe(ids)
            await _settlement(ids)
            await _wipe(ids)
            await _wrong_payment(ids)
            await _wipe(ids)
            await _unfulfillable(ids)
            await _wipe(ids)
            await _one_live_session(ids)
            await _wipe(ids)
            await _approval_before_money(ids)
            await _wipe(ids)
            await _stale_hold(ids)
            await _wipe(ids)
            await _sweeper_ignores_the_flag(ids)
        finally:
            await _cleanup(ids)

    asyncio.run(run())


if __name__ == "__main__":
    test_no_second_payment_ledger()
    test_no_network_inside_the_booking_transaction()
    test_event_name_is_not_money()
    test_hold_is_in_the_status_contract()
    test_booking_payment_against_the_database()
    print("booking payment ok")
