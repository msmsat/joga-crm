"""HB-26: конкурентность на настоящем PostgreSQL, а не на моках.

КАЖДЫЙ СЦЕНАРИЙ — ДВЕ И БОЛЕЕ НЕЗАВИСИМЫХ СЕССИИ и одновременный старт через
`asyncio.gather`. Последовательный вызов здесь ничего не доказывает: он
проходит и при полностью снятой защите.

ПРОВЕРЯЮТСЯ КОНЕЧНЫЕ СТРОКИ, а не коды ответов. «Вернулось 409» и «в базе одна
бронь» — разные утверждения, и эпик требует второго (§8.1).

БЕЗ АВТОМАТИЧЕСКИХ RETRY. Повтор внутри теста замаскировал бы ровно ту
проблему, которую тест ищет.

Запуск из back/:  python -m pytest tests/test_hybrid_concurrency.py -q
"""
import asyncio
from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import delete, func, select

import test_resource_booking as base
from database import async_session_maker
from models import BookingQuote, Client, Lesson, Reservation, Studio
from services import booking, booking_quotes as quotes, resource_booking, schedule_guard

CONCURRENT = 20


@pytest.fixture
def studio():
    ids = asyncio.run(base.seed())
    yield ids
    asyncio.run(base.cleanup(ids))


async def _live_resource_lessons(studio_id: int) -> int:
    async with async_session_maker() as db:
        return (await db.execute(select(func.count(Lesson.id)).where(
            Lesson.studio_id == studio_id, Lesson.booking_mode == "resource",
            Lesson.status != "cancelled"))).scalar_one()


async def _outcomes(coros):
    """Одновременный старт; исключения возвращаются, а не рушат прогон."""
    return await asyncio.gather(*coros, return_exceptions=True)


def _ok(results):
    return [r for r in results if not isinstance(r, BaseException)]


def _codes(results):
    out = []
    for item in results:
        if isinstance(item, HTTPException):
            detail = item.detail
            out.append(detail.get("code") if isinstance(detail, dict) else str(detail))
    return out


# ─── AC-06/AC-14: двадцать заявок на один ресурсный слот ─────────────────────

def test_twenty_quotes_for_one_slot_produce_exactly_one_booking(studio):
    """Успехов не больше доступности. Ни одного лишнего технического Lesson."""
    async def run():
        ids = [await base.quote(studio) for _ in range(CONCURRENT)]
        results = await _outcomes([base.confirm(studio, quote_id) for quote_id in ids])
        return results, await _live_resource_lessons(studio["studio"])

    results, lessons = asyncio.run(run())
    succeeded = _ok(results)
    assert len(succeeded) == 1, [type(r).__name__ for r in results]
    assert lessons == 1, "лишний технический интервал после отклонённых подтверждений"
    # Отказ обязан быть ПОНЯТНЫМ: не 500 и не пустой detail.
    assert all(code in {"SLOT_UNAVAILABLE", "TERMS_CHANGED", "CONFIG_INCOMPLETE"}
               for code in _codes(results)), _codes(results)


def test_repeat_of_one_quote_never_takes_a_second_slot(studio):
    """AC-14: потерянный ответ и повтор дают ТУ ЖЕ бронь, а не вторую."""
    async def run():
        quote_id = await base.quote(studio)
        results = await _outcomes([base.confirm(studio, quote_id) for _ in range(5)])
        return results, await _live_resource_lessons(studio["studio"])

    results, lessons = asyncio.run(run())
    succeeded = _ok(results)
    assert succeeded, [r for r in results if isinstance(r, BaseException)]
    assert len({row["reservation_id"] for row in succeeded}) == 1
    assert lessons == 1


# ─── AC-10/QA-07: событие CRM против resource-подтверждения ──────────────────

def test_group_creation_and_resource_confirm_cannot_both_win(studio):
    """Оба пути пишут в расписание одного мастера — выжить должен один."""
    async def create_group():
        async with async_session_maker() as db:
            record = await schedule_guard.lock_studio(db, studio["studio"])
            local = base.START.replace(tzinfo=None) + timedelta(hours=2)  # 10:00 Prague
            await schedule_guard.assert_interval_free(
                db, record, teacher_id=studio["teacher"], hall_id=None,
                start=local, end=local + timedelta(minutes=60), tz_iana=record.tz_iana)
            db.add(Lesson(studio_id=studio["studio"], name="Group", teacher_name="T",
                          teacher_id=studio["teacher"], branch_id=studio["branch_a"],
                          start_time=local, tz_iana=record.tz_iana, duration_min=60,
                          price=0, level="", equipment="", total_spots=10, status="confirmed"))
            await db.commit()
            return "group"

    async def run():
        quote_id = await base.quote(studio)
        results = await _outcomes([create_group(), base.confirm(studio, quote_id)])
        async with async_session_maker() as db:
            rows = (await db.execute(select(Lesson).where(
                Lesson.studio_id == studio["studio"], Lesson.status != "cancelled"))).scalars().all()
        return results, rows

    results, rows = asyncio.run(run())
    assert len(_ok(results)) == 1, [type(r).__name__ for r in results]
    assert len(rows) == 1, [(r.id, r.booking_mode, r.start_time) for r in rows]


# ─── AC-13: правка графика против подтверждения ─────────────────────────────

def test_schedule_change_and_confirm_end_in_a_consistent_state(studio):
    """Либо бронь сохранена и правка отвергнута, либо наоборот — не оба."""
    async def close_the_day():
        from models import StaffWorkingHours
        async with async_session_maker() as db:
            record = await schedule_guard.lock_studio(db, studio["studio"])
            await db.execute(delete(StaffWorkingHours).where(
                StaffWorkingHours.studio_id == studio["studio"]))
            await db.flush()
            conflicts = await schedule_guard.assert_future_assignments_valid(
                db, record, user_id=studio["teacher"])
            schedule_guard.raise_if_conflicts(conflicts)
            await db.commit()
            return "closed"

    async def run():
        quote_id = await base.quote(studio)
        results = await _outcomes([close_the_day(), base.confirm(studio, quote_id)])
        from models import StaffWorkingHours
        async with async_session_maker() as db:
            hours = (await db.execute(select(func.count(StaffWorkingHours.id)).where(
                StaffWorkingHours.studio_id == studio["studio"]))).scalar_one()
        return results, hours, await _live_resource_lessons(studio["studio"])

    results, hours, lessons = asyncio.run(run())
    booked = not isinstance(results[1], BaseException)
    closed = not isinstance(results[0], BaseException)
    # Согласованность: график снят ⇔ часов в базе нет; бронь есть ⇔ интервал есть.
    assert closed == (hours == 0)
    assert booked == (lessons == 1)
    # AC-13 дословно: РОВНО одна из двух команд. Обе успешные означали бы бронь
    # в окне, которого уже нет; обе отклонённые — потерю обеих операций.
    assert booked != closed, f"booked={booked} closed={closed} hours={hours} lessons={lessons}"


# ─── QA-15: отмена против активации оплатой ─────────────────────────────────

def test_payment_never_activates_a_cancelled_booking(studio):
    """Отменённая бронь не воскресает поздним подтверждением оплаты."""
    async def run():
        quote_id = await base.quote(studio)
        created = await base.confirm(studio, quote_id)
        reservation_id = created["reservation_id"]

        async with async_session_maker() as db:
            row = await db.get(Reservation, reservation_id)
            row.status = "hold"
            await db.commit()

        async def cancel():
            async with async_session_maker() as db:
                result = await booking.cancel(db, studio_id=studio["studio"],
                    reservation_id=reservation_id, actor="test", enforce_policy=False)
                await db.commit()
                return result.outcome

        async def activate():
            async with async_session_maker() as db:
                result = await booking.activate_paid(db, studio_id=studio["studio"],
                                                     reservation_id=reservation_id)
                await db.commit()
                return result.outcome

        results = await _outcomes([cancel(), activate()])
        async with async_session_maker() as db:
            row = await db.get(Reservation, reservation_id)
            lesson = await db.get(Lesson, row.lesson_id)
            return results, row.status, lesson.status

    results, status, lesson_status = asyncio.run(run())
    assert not [r for r in results if isinstance(r, BaseException)], results
    # Порядок гонки не задан, но исход — задан: активной отменённая не станет.
    assert status in {"cancelled", "active"}
    if status == "cancelled":
        assert lesson_status == "cancelled", "интервал отменённой брони обязан освободиться"


def test_cancel_twice_refunds_once_and_frees_the_interval(studio):
    """AC-19: повтор отмены не возвращает абонемент второй раз."""
    async def run():
        quote_id = await base.quote(studio)
        created = await base.confirm(studio, quote_id)

        async def cancel():
            async with async_session_maker() as db:
                result = await booking.cancel(db, studio_id=studio["studio"],
                    reservation_id=created["reservation_id"], actor="test", enforce_policy=False)
                await db.commit()
                return result.outcome

        results = await _outcomes([cancel() for _ in range(4)])
        return results, await _live_resource_lessons(studio["studio"])

    results, lessons = asyncio.run(run())
    outcomes = [r for r in results if not isinstance(r, BaseException)]
    assert outcomes.count(booking.Outcome.OK) == 1, outcomes
    assert all(o in {booking.Outcome.OK, booking.Outcome.ALREADY_CANCELLED} for o in outcomes)
    assert lessons == 0


# ─── AC-24: чужой quote недоступен даже одновременно со своим ───────────────

def test_foreign_quote_is_not_visible_to_another_client(studio):
    async def run():
        quote_id = await base.quote(studio)
        async with async_session_maker() as db:
            stranger = Client(studio_id=studio["studio"], name="Stranger")
            db.add(stranger)
            await db.commit()
            stranger_id = stranger.id
        outsider = quotes.Actor(studio["studio"], stranger_id)
        try:
            async with async_session_maker() as db:
                await resource_booking.confirm(db, quote_id, outsider)
            return None
        except HTTPException as exc:
            return exc
        finally:
            async with async_session_maker() as db:
                await db.execute(delete(Client).where(Client.id == stranger_id))
                await db.commit()

    failure = asyncio.run(run())
    assert failure is not None and failure.status_code == 404


# ─── Замок студии действительно сериализует resource-подтверждения ──────────

def test_quotes_created_in_parallel_do_not_bypass_occupancy(studio):
    """Два quote, созданные ОДНОВРЕМЕННО, всё равно конкурируют на confirm."""
    async def run():
        ids = await asyncio.gather(base.quote(studio), base.quote(studio))
        results = await _outcomes([base.confirm(studio, ids[0]), base.confirm(studio, ids[1])])
        async with async_session_maker() as db:
            consumed = (await db.execute(select(func.count(BookingQuote.id)).where(
                BookingQuote.studio_id == studio["studio"],
                BookingQuote.consumed_at.is_not(None)))).scalar_one()
        return results, consumed, await _live_resource_lessons(studio["studio"])

    results, consumed, lessons = asyncio.run(run())
    assert len(_ok(results)) == 1
    assert consumed == 1, "отклонённый quote не должен быть помечен исполненным"
    assert lessons == 1
