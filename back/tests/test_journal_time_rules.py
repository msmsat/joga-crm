"""Полномочия студии за стойкой: что администратор может сделать в Журнале с
записью клиента и когда сервер обязан отказать.

Раньше здесь жило фикс-окно в 2 часа: записать и снять клиента менее чем за два
часа до начала запрещалось. Правило было заимствовано у САМОСТОЯТЕЛЬНОЙ записи
клиента и администратору только мешало — человека, пришедшего за 20 минут на
свободное место, штатно записать было нельзя. Теперь у стойки один предел:
занятие, которое уже закончилось (services/booking_rules — «Полномочия студии
за стойкой»). Плюс два исключения на снятии: pending отклоняется всегда,
attended не снимается никогда.

ПОЧЕМУ ТЕПЕРЬ НАСТОЯЩАЯ БАЗА. Прежде тут стояла поддельная сессия, отдававшая
заранее выложенную очередь ответов. Она держалась на том, СКОЛЬКО запросов
сделает роутер, — то есть ломалась от любой перестановки внутри, включая ту,
ради которой всё и затевалось: перенос перехода в домен (services/booking).
Проверять надо правило, а не число обращений к базе.

Правила самого занятия (создание за 3 часа, перенос и отмена за 2) — другое
дело и лежат в test_lesson_time_rules.py.

Реальная БД, ручная чистка. Запуск из back/:  python -m pytest tests/test_journal_time_rules.py
"""
import asyncio
import os
import time as _time
import warnings
from datetime import datetime, timedelta

warnings.filterwarnings("ignore")

from fastapi import HTTPException
from sqlalchemy import delete, select

import routers.schedule.reservations as RES
from database import async_session_maker
from dependencies import StudioContext
from models import (
    Client, ClientSubscription, Hall, Lesson, Reservation, Service, Studio,
    StudioBookingSettings, User,
)
from schemas.schedule.reservations import ReservationCreate

_TAG = "TEST-JOURNAL"


async def _seed() -> dict:
    stamp = f"{int(_time.time())}-{os.getpid()}"
    async with async_session_maker() as db:
        studio = Studio(name=f"{_TAG}-{stamp}", tz_iana="Europe/Prague", currency="CZK")
        db.add(studio)
        await db.flush()
        db.add(StudioBookingSettings(studio_id=studio.id))
        hall = Hall(studio_id=studio.id, name="Зал", capacity=10)
        service = Service(studio_id=studio.id, name="Йога", duration_min=60, price=0)
        teacher = User(email=f"jr-{stamp}@test.local", hashed_password="x", name="T")
        client = Client(studio_id=studio.id, name="Катя")
        db.add_all([hall, service, teacher, client])
        await db.flush()
        # Абонемент: Журнал записывает только по покрытию, и без него все
        # проверки упёрлись бы в «нет абонемента», ничего не сказав о времени.
        db.add(ClientSubscription(
            client_id=client.id, type="Йога", total_classes=50, used_classes=0,
            expires_at=(datetime.now() + timedelta(days=365)).date(), status="active"))
        ids = {"studio": studio.id, "client": client.id, "user": teacher.id,
               "hall": hall.id, "service": service.id, "lessons": []}
        await db.commit()
    return ids


async def _lesson(ids, *, starts_in: timedelta, duration_min: int = 60) -> int:
    async with async_session_maker() as db:
        lesson = Lesson(
            studio_id=ids["studio"], name="Йога", teacher_name="T",
            service_id=ids["service"], teacher_id=ids["user"], hall_id=ids["hall"],
            start_time=datetime.now() + starts_in, tz_iana="Europe/Prague",
            duration_min=duration_min, price=0, level="", equipment="",
            total_spots=8, status="confirmed")
        db.add(lesson)
        await db.commit()
        ids["lessons"].append(lesson.id)
        return lesson.id


async def _cleanup(ids) -> None:
    async with async_session_maker() as db:
        await db.execute(delete(Reservation).where(
            Reservation.lesson_id.in_(ids["lessons"] or [0])))
        await db.execute(delete(ClientSubscription).where(
            ClientSubscription.client_id == ids["client"]))
        await db.execute(delete(Lesson).where(Lesson.studio_id == ids["studio"]))
        await db.execute(delete(Hall).where(Hall.studio_id == ids["studio"]))
        await db.execute(delete(Service).where(Service.studio_id == ids["studio"]))
        await db.execute(delete(Client).where(Client.studio_id == ids["studio"]))
        await db.execute(delete(StudioBookingSettings).where(
            StudioBookingSettings.studio_id == ids["studio"]))
        from models import ActivityLog, NotificationLog
        await db.execute(delete(ActivityLog).where(ActivityLog.studio_id == ids["studio"]))
        await db.execute(delete(NotificationLog).where(
            NotificationLog.studio_id == ids["studio"]))
        await db.execute(delete(Studio).where(Studio.id == ids["studio"]))
        await db.execute(delete(User).where(User.id == ids["user"]))
        await db.commit()


def _ctx(ids, role="owner"):
    return StudioContext(user=type("U", (), {"id": ids["user"]})(),
                         studio_id=ids["studio"], role=role)


async def _book(ids, lesson_id: int):
    async with async_session_maker() as db:
        return await RES.create_reservation(
            ReservationCreate(client_id=ids["client"], lesson_id=lesson_id),
            _ctx(ids), db)


async def _remove(ids, reservation_id: int):
    async with async_session_maker() as db:
        return await RES.cancel_reservation(reservation_id, _ctx(ids), db)


_spot = [0]


async def _reserve(ids, lesson_id: int, status: str) -> int:
    """Готовая бронь нужного статуса — минуя роутер, чтобы проверять снятие."""
    _spot[0] += 1
    async with async_session_maker() as db:
        row = Reservation(client_id=ids["client"], lesson_id=lesson_id,
                          spot_number=_spot[0], status=status)
        db.add(row)
        await db.commit()
        return row.id


async def _refused(coro, status: int, needle: str):
    try:
        await coro
    except HTTPException as exc:
        assert exc.status_code == status, exc.status_code
        assert needle in str(exc.detail), exc.detail
        return
    raise AssertionError(f"ожидали HTTPException {status} про «{needle}»")


# ─── Запись клиента ──────────────────────────────────────────────────────────

async def _booking_rules(ids):
    # Клиент пришёл за 20 минут, место свободно — запись обязана пройти.
    soon = await _lesson(ids, starts_in=timedelta(minutes=20))
    booked = await _book(ids, soon)
    assert booked.status == "active", booked

    # Занятие идёт — опоздавшего записывают: он в зале.
    running = await _lesson(ids, starts_in=timedelta(minutes=-10))
    assert (await _book(ids, running)).status == "active"

    # Закончилось — задним числом посадить в зал нельзя.
    over = await _lesson(ids, starts_in=timedelta(hours=-3))
    await _refused(_book(ids, over), 400, "закончилось")


# ─── Снятие клиента ──────────────────────────────────────────────────────────

async def _removal_rules(ids):
    # Клиент позвонил за 20 минут — место обязано освободиться.
    soon = await _lesson(ids, starts_in=timedelta(minutes=20))
    booked = await _book(ids, soon)
    removed = await _remove(ids, booked.id)
    assert removed.status == "cancelled"

    # Занятие закончилось — снимать уже нечего.
    over = await _lesson(ids, starts_in=timedelta(hours=-3))
    stale = await _reserve(ids, over, "active")
    await _refused(_remove(ids, stale), 400, "закончилось")

    # Визит состоялся: снятие вернуло бы занятие на абонемент и стёрло визит
    # из посещаемости.
    passed = await _lesson(ids, starts_in=timedelta(minutes=-30))
    attended = await _reserve(ids, passed, "attended")
    await _refused(_remove(ids, attended), 409, "пришедший")

    # Неподтверждённую заявку студия отклоняет когда угодно — иначе она
    # зависает навсегда.
    waiting = await _reserve(ids, over, "pending")
    assert (await _remove(ids, waiting)).status == "cancelled"


def test_journal_desk_authority():
    async def run():
        ids = await _seed()
        try:
            await _booking_rules(ids)
            await _removal_rules(ids)
        finally:
            await _cleanup(ids)

    asyncio.run(run())


if __name__ == "__main__":
    test_journal_desk_authority()
    print("journal desk authority ok")
