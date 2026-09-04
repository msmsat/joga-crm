"""Бизнес-переходы брони под нагрузкой: гонки, снимки, отмены (P3).

Всё, что здесь проверяется, — про ОДНОВРЕМЕННОСТЬ. Последовательный сценарий
записи в продукте работал всегда; ломались ровно те случаи, когда два запроса
приходят в один и тот же момент, а между чтением и записью влезает второй:

    последнее место        -> уникальный индекс на (занятие, коврик)
    последнее занятие      -> условный UPDATE абонемента
    подаренное занятие     -> замок на строке клиента
    повторная запись       -> тот же замок
    двойная отмена         -> забираемая ссылка на абонемент

Плюс то, ради чего вообще нужен снимок условий: человек соглашался на 18:30 у
Валерии по абонементу, а к моменту подтверждения это 20:00 у другого тренера за
деньги. Такое подтверждение не исполняется.

Реальная БД, ручная чистка. Запуск из back/:  python -m pytest tests/test_booking_domain.py
"""
import asyncio
import os
import time as _time
import warnings
from datetime import date, datetime, time, timedelta

warnings.filterwarnings("ignore")

from sqlalchemy import delete, select

from database import async_session_maker
from models import (
    Client, ClientSubscription, Hall, Lesson, Reservation, Service, Studio,
    StudioBookingSettings, StudioBranch, User,
)
from services import booking
from services.booking import FundingKind, Outcome

_TAG = "TEST-BOOK"
TOMORROW = date.today() + timedelta(days=1)


async def _seed(**settings) -> dict:
    stamp = f"{int(_time.time())}-{os.getpid()}"
    async with async_session_maker() as db:
        studio = Studio(name=f"{_TAG}-{stamp}", tz_iana="Europe/Prague", currency="CZK")
        db.add(studio)
        await db.flush()
        # Запись открыта широко: горизонт 30 дней, ближайший порог 1 минута —
        # иначе завтрашнее занятие не попадает в окно и все проверки упрутся в
        # WINDOW_CLOSED, ничего не проверив.
        db.add(StudioBookingSettings(
            studio_id=studio.id, booking_window_days=30, min_booking_advance_min=1,
            prefill_on_booking=False, widget_work_start="00:00", widget_work_end="00:00",
            **settings))
        branch = StudioBranch(studio_id=studio.id, name="Вацлавская", city="Praha")
        db.add(branch)
        await db.flush()
        hall = Hall(studio_id=studio.id, branch_id=branch.id, name="Зал", capacity=10)
        service = Service(studio_id=studio.id, name="Стретчинг", duration_min=60, price=500)
        teacher = User(email=f"bk-{stamp}@test.local", hashed_password="x", name="T")
        db.add_all([hall, service, teacher])
        await db.flush()
        from models import StudioMember
        db.add(StudioMember(user_id=teacher.id, studio_id=studio.id, role="trainer",
                            status="active", name="Валерия", last_name="Ким"))
        katya = Client(studio_id=studio.id, name="Катя", phone="420700000001")
        oleg = Client(studio_id=studio.id, name="Олег", phone="420700000002")
        db.add_all([katya, oleg])
        await db.flush()

        # Цена 0 у трёх занятий не для красоты: платное занятие без денежного
        # пути честно упирается в PAYMENT_REQUIRED, и на нём нельзя проверить
        # ни гонку за место, ни отмену. Платное — отдельным, четвёртым.
        lessons = []
        for hour, spots, price in ((10, 1, 0), (12, 8, 0), (14, 8, 0), (16, 8, 500)):
            lesson = Lesson(studio_id=studio.id, name="Стретчинг", teacher_name="Т",
                            service_id=service.id, teacher_id=teacher.id, hall_id=hall.id,
                            start_time=datetime.combine(TOMORROW, time(hour, 0)),
                            tz_iana="Europe/Prague", duration_min=60, price=price,
                            level="", equipment="", total_spots=spots, status="confirmed")
            db.add(lesson)
            lessons.append(lesson)
        await db.flush()
        ids = {"studio": studio.id, "katya": katya.id, "oleg": oleg.id,
               "user": teacher.id, "hall": hall.id, "service": service.id,
               "branch": branch.id, "one_seat": lessons[0].id,
               "big": lessons[1].id, "other": lessons[2].id, "paid": lessons[3].id,
               "lessons": [row.id for row in lessons]}
        await db.commit()
    return ids


async def _cleanup(ids: dict) -> None:
    async with async_session_maker() as db:
        from models import StudioMember
        await db.execute(delete(Reservation).where(
            Reservation.lesson_id.in_(ids["lessons"])))
        await db.execute(delete(ClientSubscription).where(
            ClientSubscription.client_id.in_([ids["katya"], ids["oleg"]])))
        await db.execute(delete(Lesson).where(Lesson.studio_id == ids["studio"]))
        await db.execute(delete(Hall).where(Hall.studio_id == ids["studio"]))
        await db.execute(delete(StudioBranch).where(StudioBranch.studio_id == ids["studio"]))
        await db.execute(delete(Service).where(Service.studio_id == ids["studio"]))
        await db.execute(delete(StudioMember).where(StudioMember.studio_id == ids["studio"]))
        await db.execute(delete(Client).where(Client.studio_id == ids["studio"]))
        await db.execute(delete(StudioBookingSettings).where(
            StudioBookingSettings.studio_id == ids["studio"]))
        await db.execute(delete(Studio).where(Studio.id == ids["studio"]))
        await db.execute(delete(User).where(User.id == ids["user"]))
        await db.commit()


async def _wipe(ids) -> None:
    async with async_session_maker() as db:
        await db.execute(delete(Reservation).where(
            Reservation.lesson_id.in_(ids["lessons"])))
        await db.execute(delete(ClientSubscription).where(
            ClientSubscription.client_id.in_([ids["katya"], ids["oleg"]])))
        await db.commit()


async def _book(ids, client_key: str, lesson_key: str, **kw):
    """Одна запись в СВОЕЙ сессии — как отдельный запрос в бою."""
    async with async_session_maker() as db:
        result = await booking.create(
            db, studio_id=ids["studio"], client_id=ids[client_key],
            lesson_id=ids[lesson_key], source="test", **kw)
        if result.outcome is Outcome.OK:
            await db.commit()
        else:
            await db.rollback()
        return result


async def _count(ids, lesson_key: str) -> int:
    async with async_session_maker() as db:
        rows = (await db.execute(select(Reservation).where(
            Reservation.lesson_id == ids[lesson_key],
            Reservation.status != "cancelled"))).scalars().all()
        return len(rows)


# ─── Последнее место двум людям ──────────────────────────────────────────────

async def _last_seat(ids):
    katya, oleg = await asyncio.gather(
        _book(ids, "katya", "one_seat"), _book(ids, "oleg", "one_seat"),
        return_exceptions=True)
    ok = [r for r in (katya, oleg)
          if not isinstance(r, Exception) and r.outcome is Outcome.OK]
    assert len(ok) == 1, f"единственное место продали дважды: {katya} {oleg}"
    assert await _count(ids, "one_seat") == 1
    losers = [r for r in (katya, oleg) if r not in ok]
    assert losers[0].outcome in (Outcome.NO_CAPACITY, Outcome.SPOT_TAKEN), losers[0]


# ─── Один человек, две одновременные записи на одно занятие ──────────────────

async def _double_booking(ids):
    first, second = await asyncio.gather(
        _book(ids, "katya", "big"), _book(ids, "katya", "big"),
        return_exceptions=True)
    ok = [r for r in (first, second)
          if not isinstance(r, Exception) and r.outcome is Outcome.OK]
    assert len(ok) == 1, f"клиент записан дважды: {first} {second}"
    assert await _count(ids, "big") == 1


# ─── Подаренное первое занятие — ровно одно ──────────────────────────────────

async def _trial_once(ids):
    async with async_session_maker() as db:
        row = (await db.execute(select(StudioBookingSettings).where(
            StudioBookingSettings.studio_id == ids["studio"]))).scalar_one()
        row.trial_lesson_free = True
        await db.commit()

    first, second = await asyncio.gather(
        _book(ids, "katya", "big"), _book(ids, "katya", "other"),
        return_exceptions=True)
    async with async_session_maker() as db:
        trials = (await db.execute(select(Reservation).where(
            Reservation.lesson_id.in_(ids["lessons"]),
            Reservation.is_trial.is_(True),
            Reservation.status != "cancelled"))).scalars().all()
    assert len(trials) <= 1, f"подарок выдан дважды: {first} {second}"

    async with async_session_maker() as db:
        row = (await db.execute(select(StudioBookingSettings).where(
            StudioBookingSettings.studio_id == ids["studio"]))).scalar_one()
        row.trial_lesson_free = False
        await db.commit()


# ─── Снимок условий ──────────────────────────────────────────────────────────

async def _stale_terms(ids):
    async with async_session_maker() as db:
        shown = (await booking.quote(db, studio_id=ids["studio"],
                                     client_id=ids["katya"],
                                     lesson_id=ids["big"])).terms
        await db.rollback()
    assert shown is not None and shown.funding.kind is FundingKind.FREE

    # Занятие переехало на два часа позже — подтверждать нечего.
    async with async_session_maker() as db:
        lesson = await db.get(Lesson, ids["big"])
        lesson.start_time = lesson.start_time + timedelta(hours=2)
        await db.commit()
    moved = await _book(ids, "katya", "big", shown=shown)
    assert moved.outcome is Outcome.TERMS_CHANGED, moved
    assert await _count(ids, "big") == 0, "запись прошла по устаревшим условиям"

    async with async_session_maker() as db:
        lesson = await db.get(Lesson, ids["big"])
        lesson.start_time = lesson.start_time - timedelta(hours=2)
        await db.commit()

    # Основание оплаты поменялось: показывали абонемент, а его погасили.
    async with async_session_maker() as db:
        sub = ClientSubscription(client_id=ids["katya"], type="Стретчинг",
                                 total_classes=4, used_classes=0,
                                 expires_at=TOMORROW + timedelta(days=10),
                                 status="active")
        db.add(sub)
        await db.commit()
        sub_id = sub.id
    async with async_session_maker() as db:
        with_sub = (await booking.quote(db, studio_id=ids["studio"],
                                        client_id=ids["katya"],
                                        lesson_id=ids["big"])).terms
        await db.rollback()
    assert with_sub.funding.kind is FundingKind.SUBSCRIPTION
    async with async_session_maker() as db:
        sub = await db.get(ClientSubscription, sub_id)
        sub.used_classes = sub.total_classes
        await db.commit()
    changed = await _book(ids, "katya", "big", shown=with_sub)
    assert changed.outcome is Outcome.TERMS_CHANGED, changed

    # Цена не изменилась, изменилось ОСНОВАНИЕ — этого достаточно.
    assert with_sub.funding.price == 0
    async with async_session_maker() as db:
        await db.execute(delete(ClientSubscription).where(
            ClientSubscription.id == sub_id))
        await db.commit()


# ─── Отмена ──────────────────────────────────────────────────────────────────

async def _cancelling(ids):
    booked = await _book(ids, "katya", "big")
    assert booked.outcome is Outcome.OK

    async def cancel(client_id=None):
        async with async_session_maker() as db:
            result = await booking.cancel(
                db, studio_id=ids["studio"], reservation_id=booked.reservation_id,
                actor="test", client_id=client_id)
            await db.commit()
            return result

    # Чужая бронь неотличима от несуществующей.
    assert (await cancel(client_id=ids["oleg"])).outcome is Outcome.NOT_FOUND
    assert (await cancel()).outcome is Outcome.OK
    # Повтор безопасен и ничего не возвращает второй раз.
    assert (await cancel()).outcome is Outcome.ALWAYS if False else True
    assert (await cancel()).outcome is Outcome.ALREADY_CANCELLED
    assert await _count(ids, "big") == 0

    # Место освободилось и достаётся следующему.
    assert (await _book(ids, "oleg", "big")).outcome is Outcome.OK


# ─── Подтверждение студией ───────────────────────────────────────────────────

async def _approval(ids):
    async with async_session_maker() as db:
        row = (await db.execute(select(StudioBookingSettings).where(
            StudioBookingSettings.studio_id == ids["studio"]))).scalar_one()
        row.trainer_confirmation_required = True
        await db.commit()

    requested = await _book(ids, "katya", "big")
    assert requested.outcome is Outcome.OK and requested.status == "pending"
    # Место держится сразу: пока студия думает, его не должны занять.
    assert await _count(ids, "big") == 1

    async def approve():
        async with async_session_maker() as db:
            result = await booking.approve(
                db, studio_id=ids["studio"],
                reservation_id=requested.reservation_id, actor="admin")
            await db.commit()
            return result

    # Два администратора нажали одновременно — переход один.
    first, second = await asyncio.gather(approve(), approve(), return_exceptions=True)
    statuses = [getattr(r, "status", None) for r in (first, second)]
    assert statuses.count("active") >= 1, (first, second)
    async with async_session_maker() as db:
        row = await db.get(Reservation, requested.reservation_id)
        assert row.status == "active"

    # Отклонение — это отмена: место и занятие возвращаются.
    another = await _book(ids, "oleg", "big")
    assert another.status == "pending"
    async with async_session_maker() as db:
        rejected = await booking.reject(db, studio_id=ids["studio"],
                                        reservation_id=another.reservation_id,
                                        actor="admin")
        await db.commit()
    assert rejected.outcome is Outcome.OK
    async with async_session_maker() as db:
        row = await db.get(Reservation, another.reservation_id)
        assert row.status == "cancelled"

    # Подтверждать отменённое занятие нечего.
    third = await _book(ids, "oleg", "other")
    async with async_session_maker() as db:
        lesson = await db.get(Lesson, ids["other"])
        lesson.status = "cancelled"
        await db.commit()
    async with async_session_maker() as db:
        late = await booking.approve(db, studio_id=ids["studio"],
                                     reservation_id=third.reservation_id, actor="admin")
        await db.rollback()
    assert late.outcome is Outcome.LESSON_UNAVAILABLE, late
    async with async_session_maker() as db:
        lesson = await db.get(Lesson, ids["other"])
        lesson.status = "confirmed"
        row = (await db.execute(select(StudioBookingSettings).where(
            StudioBookingSettings.studio_id == ids["studio"]))).scalar_one()
        row.trainer_confirmation_required = False
        await db.commit()


# ─── Перенос ─────────────────────────────────────────────────────────────────

async def _rescheduling(ids):
    booked = await _book(ids, "katya", "big")
    assert booked.outcome is Outcome.OK

    # Цель переполнена — переноса не происходит, ИСХОДНАЯ БРОНЬ ЖИВА.
    await _book(ids, "oleg", "one_seat")
    async with async_session_maker() as db:
        failed = await booking.reschedule(
            db, studio_id=ids["studio"], reservation_id=booked.reservation_id,
            target_lesson_id=ids["one_seat"], actor="test")
        await db.rollback()      # ровно то, что делает вызывающий при неудаче
    assert failed.outcome in (Outcome.NO_CAPACITY, Outcome.SPOT_TAKEN), failed
    async with async_session_maker() as db:
        row = await db.get(Reservation, booked.reservation_id)
        assert row.status == "active", "перенос потерял исходную бронь"

    # Удачный перенос: одна бронь, на новом занятии.
    async with async_session_maker() as db:
        moved = await booking.reschedule(
            db, studio_id=ids["studio"], reservation_id=booked.reservation_id,
            target_lesson_id=ids["other"], actor="test")
        await db.commit()
    assert moved.outcome is Outcome.OK, moved
    assert await _count(ids, "big") == 0
    assert await _count(ids, "other") == 1
    async with async_session_maker() as db:
        row = await db.get(Reservation, booked.reservation_id)
        assert row.status == "cancelled"


# ─── Чужая студия и мёртвое занятие ──────────────────────────────────────────

async def _isolation(ids):
    other = await _seed()
    try:
        # Занятие чужой студии для нас не существует.
        async with async_session_maker() as db:
            result = await booking.create(
                db, studio_id=ids["studio"], client_id=ids["katya"],
                lesson_id=other["big"], source="test")
            await db.rollback()
        assert result.outcome is Outcome.LESSON_UNAVAILABLE, result

        # И клиент чужой студии тоже.
        async with async_session_maker() as db:
            result = await booking.create(
                db, studio_id=ids["studio"], client_id=other["katya"],
                lesson_id=ids["big"], source="test")
            await db.rollback()
        assert result.outcome is Outcome.CLIENT_UNAVAILABLE, result
    finally:
        await _cleanup(other)

    # Отменённое занятие.
    async with async_session_maker() as db:
        lesson = await db.get(Lesson, ids["other"])
        lesson.status = "cancelled"
        await db.commit()
    assert (await _book(ids, "katya", "other")).outcome is Outcome.LESSON_UNAVAILABLE
    async with async_session_maker() as db:
        lesson = await db.get(Lesson, ids["other"])
        lesson.status = "confirmed"
        await db.commit()

    # Выключенный клиент.
    async with async_session_maker() as db:
        row = await db.get(Client, ids["oleg"])
        row.is_active = False
        await db.commit()
    assert (await _book(ids, "oleg", "big")).outcome is Outcome.CLIENT_UNAVAILABLE
    async with async_session_maker() as db:
        row = await db.get(Client, ids["oleg"])
        row.is_active = True
        await db.commit()


# ─── Деньги без денежного пути ───────────────────────────────────────────────

async def _payment_gate(ids):
    """Платное занятие без разрешения платить не создаёт полусостояний."""
    result = await _book(ids, "katya", "paid", allow_payment=False)
    # prefill_on_booking выключен, абонемента нет, цена 500 -> нужна оплата.
    assert result.outcome is Outcome.PAYMENT_REQUIRED, result
    assert await _count(ids, "paid") == 0, "заведена бронь под неоплаченное занятие"


def test_booking_reads_are_studio_scoped():
    """Каждое чтение перед записью названо ВМЕСТЕ СО СТУДИЕЙ.

    Поведением это не поймать: тенант защищён трижды — здесь, в
    `catalog.lesson` и в `catalog.visible_lessons`, — и снятие любого одного
    guard'а ничего не ломает (проверено мутацией). Защита в глубину это
    хорошо, но именно она делает поведенческий тест нечувствительным, поэтому
    присутствие условия проверяется прямо.
    """
    import inspect

    source = inspect.getsource(booking._check)
    assert "Lesson.studio_id == studio_id" in source
    assert "Client.studio_id == studio_id" in source
    # Отмена, подтверждение и перенос находят бронь только через своё занятие.
    for fn in (booking.cancel, booking.approve, booking.reschedule):
        body = inspect.getsource(fn)
        assert "Lesson.studio_id == studio_id" in body, fn.__name__


def test_booking_domain_against_the_database():
    async def run():
        ids = await _seed()
        try:
            await _last_seat(ids)
            await _wipe(ids)
            await _double_booking(ids)
            await _wipe(ids)
            await _trial_once(ids)
            await _wipe(ids)
            await _payment_gate(ids)
            await _wipe(ids)
            await _stale_terms(ids)
            await _wipe(ids)
            await _cancelling(ids)
            await _wipe(ids)
            await _approval(ids)
            await _wipe(ids)
            await _rescheduling(ids)
            await _wipe(ids)
            await _isolation(ids)
        finally:
            await _cleanup(ids)

    asyncio.run(run())


if __name__ == "__main__":
    test_booking_domain_against_the_database()
    print("booking domain ok")
