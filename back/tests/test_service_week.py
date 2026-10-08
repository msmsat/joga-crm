"""Блок «На этой неделе» карточки услуги Каталога: GET /studio/services/week
(все услуги одним запросом) и GET /studio/services/{id}/week.

Прежний ответ — пары «день, час» по часам сервера. Карточка из-за этого
теряла минуты (18:30 рисовалось как 18:00), склеивала два занятия одного часа
в одно, а неделя начиналась по часам сервера, а не студии. Теперь каждое
занятие — отдельной строкой: точное время, длительность, ведущий и сколько
записано из скольких мест.

Настоящая база (localyoga_test, как test_eligible_clients).
Запуск из back/:  python -m pytest tests/test_service_week.py
"""
import asyncio
import os
import time as _time
from datetime import datetime, time, timedelta

from sqlalchemy import delete

import routers.studio.services as S
from database import async_session_maker
from dependencies import StudioContext
from models import Client, Lesson, Reservation, Service, Studio, User
from services import lesson_time


def _lesson(studio_id, service_id, start, *, status="confirmed", spots=12):
    return Lesson(
        studio_id=studio_id, name="Барре", teacher_name="Petra", service_id=service_id,
        start_time=start, tz_iana="Europe/Prague", duration_min=55, price=330, level="",
        equipment="", total_spots=spots, status=status, booking_mode="event",
    )


async def _seed() -> dict:
    stamp = f"{int(_time.time() * 1000)}-{os.getpid()}"
    async with async_session_maker() as db:
        studio = Studio(name=f"TEST-SVC-WEEK-{stamp}", tz_iana="Europe/Prague", currency="CZK")
        db.add(studio)
        await db.flush()
        barre = Service(studio_id=studio.id, name="Барре", duration_min=55, price=330)
        other = Service(studio_id=studio.id, name="Йога", duration_min=60, price=290)
        owner = User(email=f"svc-week-{stamp}@test.local", hashed_password="x", name="O")
        db.add_all([barre, other, owner])
        await db.flush()

        today = lesson_time.local_now(studio).date()
        monday = datetime.combine(today - timedelta(days=today.weekday()), time.min)
        at = lambda day, hh, mm: monday + timedelta(days=day, hours=hh, minutes=mm)  # noqa: E731
        evening = _lesson(studio.id, barre.id, at(1, 18, 30))
        same_hour = _lesson(studio.id, barre.id, at(1, 18, 0))
        early = _lesson(studio.id, barre.id, at(0, 7, 15), spots=1)
        db.add_all([
            evening, same_hour, early,
            # Не попадают: отменённое, прошлая и следующая неделя, чужая услуга.
            _lesson(studio.id, barre.id, at(2, 9, 0), status="cancelled"),
            _lesson(studio.id, barre.id, at(-1, 20, 0)),
            _lesson(studio.id, barre.id, at(7, 9, 0)),
            _lesson(studio.id, other.id, at(3, 10, 0)),
        ])
        await db.flush()
        people = [Client(studio_id=studio.id, name=f"C{i}", phone=f"+42077710{i:04d}") for i in range(3)]
        db.add_all(people)
        await db.flush()
        db.add_all([
            Reservation(client_id=people[0].id, lesson_id=evening.id, spot_number=1, status="active"),
            Reservation(client_id=people[1].id, lesson_id=evening.id, spot_number=2, status="attended"),
            # Отменённая запись место не занимает.
            Reservation(client_id=people[2].id, lesson_id=evening.id, spot_number=3, status="cancelled"),
        ])
        await db.commit()
        return {"studio": studio.id, "user": owner.id, "service": barre.id, "monday": monday.date()}


async def _cleanup(ids) -> None:
    async with async_session_maker() as db:
        await db.execute(delete(Studio).where(Studio.id == ids["studio"]))
        await db.execute(delete(User).where(User.id == ids["user"]))
        await db.commit()


def test_week_lists_every_lesson_with_exact_time_and_fill():
    async def run():
        ids = await _seed()
        try:
            ctx = StudioContext(user=type("U", (), {"id": ids["user"]})(), studio_id=ids["studio"], role="owner")
            async with async_session_maker() as db:
                rows = await S.get_service_week(ids["service"], ctx, db)
            async with async_session_maker() as db:
                everything = await S.get_services_week(ctx, db)
        finally:
            await _cleanup(ids)

        assert [(r.day_of_week, r.start) for r in rows] == [(0, "07:15"), (1, "18:00"), (1, "18:30")]
        evening = rows[2]
        assert (evening.hour, evening.booked, evening.capacity) == (18, 2, 12)
        assert evening.day == ids["monday"] + timedelta(days=1)
        assert (evening.duration_min, evening.teacher_name) == (55, "Petra")
        assert (rows[0].booked, rows[0].capacity) == (0, 1)
        # Общий набор — те же строки плюс занятия других услуг, с пометкой чьи.
        assert [r.lesson_id for r in everything if r.service_id == ids["service"]] == [r.lesson_id for r in rows]
        assert len(everything) == len(rows) + 1
    asyncio.run(run())
