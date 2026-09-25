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


def test_booking_window_limits_the_client_but_not_the_desk():
    """§6.2 п.7: горизонт, advance и часы виджета — правила САМОСТОЯТЕЛЬНОЙ
    записи клиента. У стойки запрет один — занятие уже прошло
    (`booking_rules.assert_staff_bookable`).

    Пока горизонт применялся ко всем, администратор не мог записать клиента
    дальше `booking_window_days` (по умолчанию 7): availability отдавал пустой
    список без всякой причины, и CRM выглядела сломанной.
    """
    data = snapshot()
    data.rules = BookingRules(min_booking_advance_min=0, booking_window_days=7,
                              widget_work_start="00:00", widget_work_end="00:00")
    # Сегодня — за месяц до запрашиваемого дня: он заведомо за горизонтом.
    far_now = datetime.combine(DAY - timedelta(days=30), datetime.min.time(), timezone.utc)

    assert slots(data, now=far_now, client=True).slots == [], "клиенту дальше горизонта нельзя"
    assert slots(data, now=far_now, client=False).slots, "стойке горизонт клиента не указ"

    # Прошлое закрыто обоим: запись задним числом — испорченные данные.
    past_now = datetime.combine(DAY + timedelta(days=1), datetime.min.time(), timezone.utc)
    assert slots(data, now=past_now, client=False).slots == []


def test_desk_books_to_the_minute_one_minute_after_the_buffer():
    """Стойка ставит запись с точностью до минуты — через минуту после конца
    предыдущей вместе с её буфером, но не в ту же минуту (решение владельца
    24.09.2026). Клиент в мини-приложении по-прежнему видит сетку студии."""
    data = snapshot()
    data.service = NS(duration_min=30, buffer_before_min=0, buffer_after_min=10)
    # 10:00–10:30 и буфер до 10:40: занято до 10:40.
    data.lessons = [NS(teacher_id=1, hall_id=None, start_time=datetime(2027, 6, 15, 10),
        duration_min=30, buffer_before_min=0, buffer_after_min=10, tz_iana="Europe/Prague")]
    desk = starts(slots(data, client=False))
    assert "10:40" not in desk, "начало в ту же минуту, где кончился буфер"
    assert "10:41" in desk, "стойка обязана видеть начало через минуту после буфера"
    # Своя запись с буфером (30 + 10) обязана закончиться до 10:00 минимум на минуту.
    assert "09:19" in desk and "09:20" not in desk
    client = starts(slots(data))
    assert "10:41" not in client and "10:45" in client, "клиенту — сетка студии (15 мин)"


def test_each_master_occupies_his_own_duration():
    """Окно под запись — длительность ЭТОГО мастера, а не каталожная.

    Смена до 18:00, услуга 45 минут плюс 15 буфера. У мастера со своим часом
    последний старт 16:45, у мастера без своего времени — 17:00. Одна сетка
    на всех дала бы одному запись за краем смены, а другому отняла бы окно.
    """
    data = snapshot()
    data.durations = {1: 60}
    result = slots(data)
    assert max(starts(result, 1)) == "16:45"
    assert max(starts(result, 2)) == "17:00"


@pytest.mark.parametrize("client", [True, False])
@pytest.mark.parametrize("minutes", [0, -1, 1440, 1441])
def test_invalid_duration_does_not_hide_other_masters(client, minutes):
    from services.resource_slots import by_staff
    data = snapshot()
    data.durations = {1: minutes, 2: 45}
    result = slots(data, client=client)
    assert result.reason is None
    assert starts(result, 2)
    assert not starts(result, 1)
    per_staff = by_staff(data, day=DAY, now=NOW, client=client)
    rows = {row.teacher_id: row for row in per_staff.staff}
    assert rows[1].reason == "config_incomplete"
    assert rows[2].reason is None and rows[2].free
    data.teacher_ids = [1]
    assert slots(data, client=client).reason == "config_incomplete"


def test_custom_duration_can_fit_when_catalog_duration_with_buffers_does_not():
    data = snapshot()
    data.service.duration_min = 1440
    data.durations = {1: 45, 2: 45}
    result = slots(data)
    assert result.reason is None and starts(result, 1) and starts(result, 2)
