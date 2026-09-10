"""HB-25: намерение уведомить переживает падение, но не откат.

Проверяется семь пунктов карточки:

  * откат транзакции перехода НЕ оставляет намерения;
  * успешный commit оставляет ровно одно, даже если процесс умер до отправки;
  * повтор воркера не создаёт вторую строку и не шлёт второй раз;
  * pending → hold → active даёт РАЗНЫЕ event_code при одной версии занятия;
  * перенос (новая версия занятия) — новое намерение;
  * ошибка доставки повторяется ограниченно и заканчивается terminal failed
    с диагностикой;
  * сеть не выполняется в транзакции перехода — транспорт здесь заглушка.

Реальная БД, ручная чистка. Запуск из back/:
    python -m pytest tests/test_hybrid_notifications.py -q
"""
import asyncio
import os
import time as _time
from datetime import datetime, timedelta

import pytest
from sqlalchemy import delete, select

from database import async_session_maker
from models import (BookingNotificationIntent, Client, Hall, Lesson, Reservation,
                    Studio, StudioBranch, User)
from models.booking_notification import FAILED, MAX_ATTEMPTS, PENDING, SENT
from services import booking_notifications as intents

_TAG = "TEST-HB-NOTIFY"


async def _seed() -> dict:
    stamp = f"{int(_time.time() * 1000)}-{os.getpid()}"
    async with async_session_maker() as db:
        studio = Studio(name=f"{_TAG}-{stamp}", tz_iana="Europe/Prague")
        db.add(studio)
        await db.flush()
        branch = StudioBranch(studio_id=studio.id, name="A")
        teacher = User(email=f"nt-{stamp}@test.local", hashed_password="x", name="T")
        db.add_all([branch, teacher])
        await db.flush()
        hall = Hall(studio_id=studio.id, branch_id=branch.id, name="H", capacity=5)
        client = Client(studio_id=studio.id, name="C", phone=f"+7999{stamp[-7:]}",
                        email=f"c-{stamp}@test.local")
        db.add_all([hall, client])
        await db.flush()
        lesson = Lesson(studio_id=studio.id, name="L", teacher_name="T", teacher_id=teacher.id,
                        branch_id=branch.id, hall_id=hall.id, tz_iana="Europe/Prague",
                        start_time=datetime.now() + timedelta(days=3), duration_min=60,
                        price=1000, level="", equipment="", total_spots=5, status="confirmed")
        db.add(lesson)
        await db.flush()
        reservation = Reservation(client_id=client.id, lesson_id=lesson.id,
                                  spot_number=1, status="active")
        db.add(reservation)
        await db.commit()
        return {"studio": studio.id, "lesson": lesson.id, "reservation": reservation.id,
                "client": client.id, "teacher": teacher.id, "branch": branch.id, "hall": hall.id}


async def _cleanup(ids: dict) -> None:
    async with async_session_maker() as db:
        await db.execute(delete(BookingNotificationIntent).where(
            BookingNotificationIntent.studio_id == ids["studio"]))
        await db.execute(delete(Reservation).where(Reservation.lesson_id == ids["lesson"]))
        await db.execute(delete(Lesson).where(Lesson.studio_id == ids["studio"]))
        for model in (Client, Hall, StudioBranch):
            await db.execute(delete(model).where(model.studio_id == ids["studio"]))
        await db.execute(delete(Studio).where(Studio.id == ids["studio"]))
        await db.execute(delete(User).where(User.id == ids["teacher"]))
        await db.commit()


@pytest.fixture
def booked():
    ids = asyncio.run(_seed())
    yield ids
    asyncio.run(_cleanup(ids))


async def _rows(ids):
    async with async_session_maker() as db:
        return list((await db.execute(select(BookingNotificationIntent).where(
            BookingNotificationIntent.studio_id == ids["studio"]
        ).order_by(BookingNotificationIntent.id))).scalars().all())


def test_rollback_leaves_no_intent(booked):
    async def run():
        async with async_session_maker() as db:
            await intents.record(db, studio_id=booked["studio"], reservation_id=booked["reservation"],
                                 lesson_version=1, event_code="booking_confirmed")
            await db.rollback()
    asyncio.run(run())
    assert asyncio.run(_rows(booked)) == []


def test_commit_keeps_exactly_one_intent_and_repeat_adds_none(booked):
    async def run():
        for _ in range(3):
            async with async_session_maker() as db:
                await intents.record(db, studio_id=booked["studio"],
                                     reservation_id=booked["reservation"],
                                     lesson_version=1, event_code="booking_confirmed")
                await db.commit()
    asyncio.run(run())
    rows = asyncio.run(_rows(booked))
    assert len(rows) == 1 and rows[0].state == PENDING and rows[0].attempt_count == 0


def test_payment_stages_and_reschedule_are_separate_events(booked):
    async def run():
        async with async_session_maker() as db:
            # Версия занятия НЕ меняется между этими тремя — различает их код.
            for code in ("booking_pending", "booking_hold", "booking_activated"):
                await intents.record(db, studio_id=booked["studio"],
                                     reservation_id=booked["reservation"],
                                     lesson_version=1, event_code=code)
            # Перенос — новая версия того же занятия.
            await intents.record(db, studio_id=booked["studio"],
                                 reservation_id=booked["reservation"],
                                 lesson_version=2, event_code="booking_rescheduled")
            await db.commit()
    asyncio.run(run())
    rows = asyncio.run(_rows(booked))
    assert {(r.event_code, r.lesson_version) for r in rows} == {
        ("booking_pending", 1), ("booking_hold", 1),
        ("booking_activated", 1), ("booking_rescheduled", 2)}


def test_unknown_event_code_is_a_programming_error(booked):
    async def run():
        async with async_session_maker() as db:
            await intents.record(db, studio_id=booked["studio"], reservation_id=booked["reservation"],
                                 lesson_version=1, event_code="booking_teleported")
    with pytest.raises(ValueError):
        asyncio.run(run())


def test_worker_sends_once_and_repeat_does_not_resend(booked, monkeypatch):
    sent = []

    async def fake_notify(db, studio_id, role, event_id, context=None, owner_fallback=True):
        sent.append((studio_id, event_id, (context or {}).get("_causal")))
        return True

    monkeypatch.setattr("services.notifier.notify", fake_notify)

    async def run():
        async with async_session_maker() as db:
            await intents.record(db, studio_id=booked["studio"], reservation_id=booked["reservation"],
                                 lesson_version=1, event_code="booking_confirmed")
            await db.commit()
        first = await intents.run_due()
        second = await intents.run_due()
        return first, second

    first, second = asyncio.run(run())
    assert first["sent"] == 1 and second == {"sent": 0, "retry": 0, "failed": 0}
    assert len(sent) == 1 and sent[0][1] == "c1"
    # Причинный ключ уходит в журнал отправок вместо календарного часа.
    assert sent[0][2].startswith("intent:")
    rows = asyncio.run(_rows(booked))
    assert [r.state for r in rows] == [SENT]


def test_delivery_failure_retries_then_becomes_terminal_with_diagnostics(booked, monkeypatch):
    async def broken_notify(*args, **kwargs):
        raise RuntimeError("провайдер недоступен")

    monkeypatch.setattr("services.notifier.notify", broken_notify)

    async def run():
        async with async_session_maker() as db:
            await intents.record(db, studio_id=booked["studio"], reservation_id=booked["reservation"],
                                 lesson_version=1, event_code="booking_cancelled")
            await db.commit()
        counts = []
        moment = datetime.utcnow()
        for _ in range(MAX_ATTEMPTS + 2):
            # Двигаем время вперёд — иначе backoff не даст следующей попытке
            # начаться, и тест доказывал бы только наличие паузы.
            moment += timedelta(seconds=600)
            counts.append(await intents.run_due(now=moment))
        return counts

    counts = asyncio.run(run())
    assert sum(c["retry"] for c in counts) == MAX_ATTEMPTS - 1
    assert sum(c["failed"] for c in counts) == 1
    rows = asyncio.run(_rows(booked))
    assert rows[0].state == FAILED and rows[0].attempt_count == MAX_ATTEMPTS
    assert "провайдер недоступен" in rows[0].last_error
    # Terminal-строка больше не берётся в работу.
    assert asyncio.run(intents.run_due()) == {"sent": 0, "retry": 0, "failed": 0}


def test_intent_without_client_template_closes_without_network(booked, monkeypatch):
    async def forbidden(*args, **kwargs):
        raise AssertionError("hold не имеет клиентского шаблона — сеть не нужна")

    monkeypatch.setattr("services.notifier.notify", forbidden)

    async def run():
        async with async_session_maker() as db:
            await intents.record(db, studio_id=booked["studio"], reservation_id=booked["reservation"],
                                 lesson_version=1, event_code="booking_hold")
            await db.commit()
        return await intents.run_due()

    assert asyncio.run(run())["sent"] == 1
    assert asyncio.run(_rows(booked))[0].state == SENT
