"""HB-23: разрез дашборда event/resource на заранее рассчитанном наборе.

Набор один и тот же для всех проверок (§4.1 / AC-29):

  * группа 10:00–11:00, 10 мест: 2 attended, 1 active, 1 pending, 1 hold,
    1 cancelled;
  * отменённое групповое событие того же дня;
  * индивидуальная запись 14:00–15:00 (+15 минут буфера) БЕЗ ЗАЛА, но с
    филиалом — именно она исчезала на INNER JOIN halls;
  * отсутствие специалиста 12:00–13:00;
  * рабочий день специалиста и студии 09:00–18:00.

Реальная БД, ручная чистка — как в остальных HB-тестах.
Запуск из back/:  python -m pytest tests/test_hybrid_analytics.py -q
"""
import asyncio
import os
import time as _time
from datetime import date, datetime, timedelta

import pytest
from sqlalchemy import delete

from database import async_session_maker
from models import (Client, Hall, Lesson, Reservation, Service, StaffBusyInterval,
                    StaffWorkingHours, Studio, StudioBranch, StudioMember, StudioWorkingHours, User)
from routers.analytics._filters import ReportFilters
from routers.analytics.booking_modes import booking_mode_slices

_TAG = "TEST-HB-ANALYTICS"
DAY = date(2027, 6, 16)  # среда


async def _seed() -> dict:
    stamp = f"{int(_time.time())}-{os.getpid()}"
    async with async_session_maker() as db:
        studio = Studio(name=f"{_TAG}-{stamp}", tz_iana="Europe/Prague")
        db.add(studio)
        await db.flush()
        branch = StudioBranch(studio_id=studio.id, name="A")
        other = StudioBranch(studio_id=studio.id, name="B")
        db.add_all([branch, other])
        await db.flush()
        hall = Hall(studio_id=studio.id, branch_id=branch.id, name="H", capacity=10)
        db.add(hall)
        teacher = User(email=f"an-{stamp}@test.local", hashed_password="x", name="T")
        db.add(teacher)
        await db.flush()
        db.add(StudioMember(user_id=teacher.id, studio_id=studio.id, role="trainer",
                            status="active", name="T", last_name="T"))
        for dow in range(7):
            db.add(StudioWorkingHours(studio_id=studio.id, day_of_week=dow, is_open=True,
                                      open_time="09:00", close_time="18:00"))
            db.add(StaffWorkingHours(studio_id=studio.id, user_id=teacher.id, day_of_week=dow,
                                     is_open=True, open_time="09:00", close_time="18:00"))
        clients = [Client(studio_id=studio.id, name=f"C{i}", phone=f"+100000{stamp[-4:]}{i}")
                   for i in range(6)]
        db.add_all(clients)
        service = Service(studio_id=studio.id, name="S", price=1000, duration_min=60,
                          booking_mode="resource", buffer_after_min=15, service_type="individual")
        db.add(service)
        await db.flush()

        def lesson(**kw):
            base = dict(studio_id=studio.id, name="L", teacher_name="T", teacher_id=teacher.id,
                        branch_id=branch.id, tz_iana="Europe/Prague", level="", equipment="",
                        price=1000, status="confirmed")
            return Lesson(**{**base, **kw})

        group = lesson(hall_id=hall.id, start_time=datetime.combine(DAY, datetime.min.time()) + timedelta(hours=10),
                       duration_min=60, total_spots=10, booking_mode="event")
        dropped = lesson(hall_id=hall.id, start_time=datetime.combine(DAY, datetime.min.time()) + timedelta(hours=16),
                         duration_min=60, total_spots=10, booking_mode="event", status="cancelled")
        # Индивидуальная запись без зала — ровно тот случай из AC-29.
        solo = lesson(hall_id=None, start_time=datetime.combine(DAY, datetime.min.time()) + timedelta(hours=14),
                      duration_min=60, total_spots=1, booking_mode="resource",
                      buffer_after_min=15, service_id=service.id)
        db.add_all([group, dropped, solo])
        await db.flush()
        statuses = ["attended", "attended", "active", "pending", "hold", "cancelled"]
        db.add_all([Reservation(client_id=clients[i].id, lesson_id=group.id, spot_number=i + 1,
                                status=status) for i, status in enumerate(statuses)])
        db.add(Reservation(client_id=clients[0].id, lesson_id=solo.id, spot_number=1, status="active"))
        db.add(StaffBusyInterval(studio_id=studio.id, user_id=teacher.id, tz_iana="Europe/Prague",
                                 start_time=datetime.combine(DAY, datetime.min.time()) + timedelta(hours=12),
                                 end_time=datetime.combine(DAY, datetime.min.time()) + timedelta(hours=13),
                                 reason="break"))
        await db.commit()
        return {"studio": studio.id, "branch": branch.id, "other": other.id,
                "teacher": teacher.id, "hall": hall.id, "solo": solo.id}


async def _cleanup(ids: dict) -> None:
    async with async_session_maker() as db:
        lessons = [row for (row,) in (await db.execute(
            delete(Lesson).where(Lesson.studio_id == ids["studio"]).returning(Lesson.id))).all()]
        await db.execute(delete(Reservation).where(Reservation.lesson_id.in_(lessons or [0])))
        await db.execute(delete(StaffBusyInterval).where(StaffBusyInterval.studio_id == ids["studio"]))
        await db.execute(delete(StaffWorkingHours).where(StaffWorkingHours.studio_id == ids["studio"]))
        await db.execute(delete(StudioWorkingHours).where(StudioWorkingHours.studio_id == ids["studio"]))
        await db.execute(delete(Client).where(Client.studio_id == ids["studio"]))
        await db.execute(delete(Service).where(Service.studio_id == ids["studio"]))
        await db.execute(delete(Hall).where(Hall.studio_id == ids["studio"]))
        await db.execute(delete(StudioMember).where(StudioMember.studio_id == ids["studio"]))
        await db.execute(delete(StudioBranch).where(StudioBranch.studio_id == ids["studio"]))
        await db.execute(delete(Studio).where(Studio.id == ids["studio"]))
        await db.execute(delete(User).where(User.id == ids["teacher"]))
        await db.commit()


def _filters(ids, **kw):
    scope = dict(date_from=DAY, date_to=DAY, branch_id=None, hall_id=None,
                 trainer_id=None, service_id=None)
    return ReportFilters(**{**scope, **kw})


async def _slices(ids, **kw):
    async with async_session_maker() as db:
        rows = await booking_mode_slices(_filters(ids, **kw), ids["studio"], db)
    return {row.booking_mode: row for row in rows}


@pytest.fixture(scope="module")
def seeded():
    ids = asyncio.run(_seed())
    yield ids
    asyncio.run(_cleanup(ids))


def test_group_counts_events_and_bookings_separately(seeded):
    rows = asyncio.run(_slices(seeded))
    event = rows["event"]
    # Одно живое событие с шестью бронями — это 1 событие, а не 6 (§4.1).
    assert (event.events, event.cancelled) == (1, 1)
    assert (event.bookings, event.attended, event.pending, event.hold) == (5, 2, 1, 1)
    # Занято 3 из 10 мест: attended + active. pending/hold в занятость не идут.
    assert event.utilization_pct == 30.0


def test_resource_counts_one_interval_and_one_booking(seeded):
    rows = asyncio.run(_slices(seeded))
    resource = rows["resource"]
    assert (resource.events, resource.bookings, resource.cancelled) == (1, 1, 0)
    assert (resource.pending, resource.hold) == (0, 0)
    # Смена 09:00–18:00 = 540 минут; минус группа 10:00–11:00 и перерыв
    # 12:00–13:00 остаётся 420. Занято 14:00–15:15 с буфером = 75 минут.
    assert resource.utilization_pct == round(75 / 420 * 100, 1)


def test_hall_less_resource_survives_branch_filter(seeded):
    """AC-29: индивидуальная запись без зала обязана остаться в срезе филиала."""
    rows = asyncio.run(_slices(seeded, branch_id=seeded["branch"]))
    assert rows["resource"].bookings == 1
    assert rows["event"].bookings == 5
    foreign = asyncio.run(_slices(seeded, branch_id=seeded["other"]))
    assert foreign["resource"].bookings == 0 and foreign["event"].bookings == 0


def test_booking_mode_filter_narrows_the_whole_dashboard(seeded):
    rows = asyncio.run(_slices(seeded, booking_mode="resource"))
    assert set(rows) == {"resource"}
    assert rows["resource"].bookings == 1


def test_zero_denominator_is_not_zero_percent(seeded):
    """Пустой день: знаменателя нет — «Нет данных», а не 0 % загрузки."""
    async def run():
        empty = ReportFilters(date_from=DAY + timedelta(days=30), date_to=DAY + timedelta(days=30),
                              branch_id=None, hall_id=None, trainer_id=None, service_id=None)
        async with async_session_maker() as db:
            return {row.booking_mode: row for row in await booking_mode_slices(empty, seeded["studio"], db)}
    rows = asyncio.run(run())
    assert rows["event"].utilization_pct is None
    assert rows["resource"].utilization_pct is None
