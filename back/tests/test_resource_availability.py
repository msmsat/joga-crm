"""HB-08: business boundaries, DST, isolated staff and bounded query count."""
import asyncio
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace as NS

import pytest
from sqlalchemy import delete, insert

from database import async_session_maker
from models import Lesson, Service, StaffWorkingHours
from models.base import user_services
from schemas.schedule import hybrid
from services import resource_availability as api
from services.booking_rules import BookingRules
from services.resource_slots import AvailabilityData, generate
import test_resource_hours as fixtures

DAY = date(2027, 6, 15)
NOW = datetime(2027, 6, 14, tzinfo=timezone.utc)


def snapshot(open_time="09:00", close_time="18:00"):
    hours = [NS(day_of_week=d, is_open=True, open_time=open_time, close_time=close_time) for d in range(7)]
    return AvailabilityData(
        studio=NS(tz_iana="Europe/Prague", journal_time_step=15),
        service=NS(duration_min=45, buffer_before_min=0, buffer_after_min=15),
        rules=BookingRules(min_booking_advance_min=0, booking_window_days=31,
                           widget_work_start="00:00", widget_work_end="00:00"),
        teacher_ids=[1, 2], studio_hours=hours, branch_hours=hours,
        staff_hours=[NS(**vars(row), user_id=uid) for uid in [1, 2] for row in hours],
    )


def slots(data, day=DAY, now=NOW, **kw):
    return generate(data, date_from=day, date_to=day, now=now, **kw)


def starts(result, teacher=1):
    return {row.local_start.strftime("%H:%M") for row in result.slots if teacher in row.teacher_ids}


def test_empty_group_blocks_staff_in_other_branch_including_buffer():
    data = snapshot()
    data.lessons = [NS(teacher_id=1, hall_id=90, start_time=datetime(2027, 6, 15, 10),
        duration_min=45, buffer_before_min=0, buffer_after_min=15, tz_iana="Europe/Prague")]
    result = slots(data)
    assert "10:45" not in starts(result)
    assert "11:00" in starts(result)
    assert "09:15" not in starts(result)  # this candidate's after-buffer would overlap the group
    assert "10:00" in starts(result, 2)


def test_busy_interval_snapshot_and_requested_hall_are_both_respected():
    data = snapshot()
    data.busy = [NS(user_id=1, start_time=datetime(2027, 6, 15, 8),
                    end_time=datetime(2027, 6, 15, 9), tz_iana="UTC")]
    data.hall_id = 90
    data.lessons = [NS(teacher_id=999, hall_id=90, start_time=datetime(2027, 6, 15, 12),
        duration_min=60, buffer_before_min=0, buffer_after_min=0, tz_iana="Europe/Prague")]
    result = slots(data)
    assert "10:00" not in starts(result)
    assert "10:00" in starts(result, 2)
    assert "12:00" not in starts(result, 1) | starts(result, 2)


def test_night_shift_tail_and_full_buffer_stay_inside_shift():
    data = snapshot("22:00", "06:00")
    result = slots(data)
    assert "00:00" in starts(result)
    assert "05:00" in starts(result)
    assert "05:15" not in starts(result)
    assert "12:00" not in starts(result)


@pytest.mark.parametrize("day", [date(2027, 3, 28), date(2027, 10, 31)])
def test_dst_repeated_missing_and_crossing_slots_are_excluded(day):
    data = snapshot("00:00", "00:00")
    data.service.duration_min = 120
    data.service.buffer_after_min = 0
    result = slots(data, day, datetime.combine(day - timedelta(days=1), datetime.min.time(), timezone.utc))
    assert "00:00" not in starts(result)  # end is 02:00: invalid or repeated
    assert "01:00" not in starts(result)  # crosses the offset change
    assert "02:00" not in starts(result)
    assert "03:00" in starts(result)


def test_missing_hours_never_become_24h_and_staff_cannot_book_in_past():
    data = snapshot()
    data.staff_hours = []
    assert slots(data).reason == "config_incomplete"
    assert slots(data).slots == []
    data = snapshot()
    result = slots(data, now=datetime(2027, 6, 15, 10, tzinfo=timezone.utc), client=False)
    assert "11:45" not in starts(result)
    assert "12:00" in starts(result)


def test_unknown_legacy_interval_blocks_only_relevant_dates():
    data = snapshot()
    data.teacher_ids = [1]
    data.lessons = [NS(teacher_id=1, hall_id=None, start_time=datetime(2020, 1, 1),
        duration_min=60, buffer_before_min=0, buffer_after_min=0, tz_iana=None)]
    assert slots(data).slots
    data.lessons[0].start_time = datetime(2027, 6, 15, 10)
    assert slots(data).slots == []
    assert slots(data).reason == "config_incomplete"


def test_batch_loader_filters_assignments_and_finds_long_legacy_interval(monkeypatch):
    monkeypatch.setattr(hybrid, "AVAILABLE_BOOKING_MODES", frozenset({"event", "resource", "hybrid"}))
    async def run():
        ids = await fixtures._seed()
        try:
            await fixtures._assign(ids)
            await fixtures._staff_hours(ids, fixtures.DAY.weekday(), "09:00", "18:00")
            async with async_session_maker() as db:
                from models import Studio
                studio = await db.get(Studio, ids["studio"])
                studio.booking_mode, studio.strict_schedule_enabled = "hybrid", True
                service = Service(studio_id=studio.id, name="Haircut", price=100,
                    duration_min=45, booking_mode="resource", service_type="individual")
                db.add(service)
                await db.flush()
                await db.execute(insert(user_services).values(user_id=ids["teacher"], service_id=service.id))
                db.add(Lesson(studio_id=studio.id, service_id=service.id, teacher_id=ids["teacher"],
                    teacher_name="T", name="Long legacy group", level="", equipment="", price=0,
                    start_time=datetime.combine(fixtures.DAY - timedelta(days=10), datetime.min.time()),
                    duration_min=11 * 1440, tz_iana="Europe/Prague", total_spots=10))
                await db.commit()
                queries = []
                original = db.execute
                async def counted(query, *args, **kwargs):
                    queries.append(str(query))
                    return await original(query, *args, **kwargs)
                monkeypatch.setattr(db, "execute", counted)
                scope = dict(studio_id=studio.id, service_id=service.id, branch_id=ids["branch_a"],
                             date_from=fixtures.DAY, date_to=fixtures.DAY)
                data = await api.load(db, **scope)
                assert data.teacher_ids == [ids["teacher"]]
                assert len(data.lessons) == 1  # SQL must use actual legacy duration, not a 24h lookback
                first_count = len(queries)
                queries.clear()
                await api.load(db, **{**scope, "date_to": fixtures.DAY + timedelta(days=30)})
                assert len(queries) == first_count <= 12
                scope["branch_id"] = ids["branch_b"]
                assert (await api.load(db, **scope)).teacher_ids == []
        finally:
            async with async_session_maker() as db:
                await db.execute(delete(Lesson).where(Lesson.studio_id == ids["studio"]))
                await db.execute(delete(Service).where(Service.studio_id == ids["studio"]))
                await db.commit()
            await fixtures._cleanup(ids)
    asyncio.run(run())
