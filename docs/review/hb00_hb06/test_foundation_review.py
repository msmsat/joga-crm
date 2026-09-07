"""Independent HB-00..06 acceptance reproducers. Run from back with -p conftest.
Uses repository test DB guards and exact-ID fixture cleanup; no application edits.
"""
import asyncio
import sys
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(r'C:\projects\freelance\joga_crm\back\tests')))
import test_schedule_guard as sg
import test_resource_hours as rh
from database import async_session_maker
from sqlalchemy import delete
from models import Studio, Lesson, Service, StaffBusyInterval, StaffDayOverride
from services import schedule_guard
from routers.staff.schedule import create_busy_interval
from schemas.staff.staff import StaffBusyIntervalCreate


def test_lock_refreshes_preloaded_studio():
    async def run():
        ids = await sg._seed(strict=False)
        try:
            async with async_session_maker() as reader:
                cached = await reader.get(Studio, ids['studio'])
                assert cached.strict_schedule_enabled is False
                async with async_session_maker() as writer:
                    current = await schedule_guard.lock_studio(writer, ids['studio'])
                    current.strict_schedule_enabled = True
                    await writer.commit()
                locked = await schedule_guard.lock_studio(reader, ids['studio'])
                assert locked.strict_schedule_enabled is True, 'FOR UPDATE returned stale strict=False'
        finally:
            await sg._cleanup(ids)
    asyncio.run(run())


def test_working_override_opens_known_closed_weekday():
    async def run():
        ids = await rh._seed()
        try:
            await rh._assign(ids)
            await rh._staff_hours(ids, rh.DAY.weekday(), '09:00', '18:00', is_open=False)
            async with async_session_maker() as db:
                db.add(StaffDayOverride(studio_id=ids['studio'], user_id=ids['teacher'],
                                        day=rh.DAY, is_working=True))
                await db.commit()
            window = await rh._query(ids)
            assert window.intervals == [(datetime.combine(rh.DAY, datetime.min.time()).replace(hour=9),
                                         datetime.combine(rh.DAY, datetime.min.time()).replace(hour=18))]
        finally:
            await rh._cleanup(ids)
    asyncio.run(run())


def test_future_assignment_includes_after_buffer():
    async def run():
        ids = await rh._seed()
        try:
            await rh._assign(ids)
            await rh._staff_hours(ids, rh.DAY.weekday(), '09:00', '18:00')
            async with async_session_maker() as db:
                studio = await schedule_guard.lock_studio(db, ids['studio'])
                studio.strict_schedule_enabled = True
                service = Service(studio_id=ids['studio'], name='Review', price=100,
                                  duration_min=60, service_type='individual', booking_mode='resource')
                db.add(service)
                await db.flush()
                start = datetime.combine(rh.DAY, datetime.min.time()).replace(hour=10)
                lesson = Lesson(studio_id=ids['studio'], name='Review', teacher_name='T', price=100, teacher_id=ids['teacher'],
                    branch_id=ids['branch_a'], service_id=service.id, booking_mode='resource',
                    start_time=start, duration_min=60, total_spots=1, tz_iana='Europe/Prague',
                    buffer_before_min=0, buffer_after_min=30, level='', equipment='')
                db.add(lesson)
                db.add(StaffBusyInterval(studio_id=ids['studio'], user_id=ids['teacher'],
                    start_time=start+timedelta(hours=1), end_time=start+timedelta(hours=1, minutes=30),
                    tz_iana='Europe/Prague'))
                await db.flush()
                conflicts = await schedule_guard.assert_future_assignments_valid(db, studio, user_id=ids['teacher'])
                assert [c.lesson_id for c in conflicts] == [lesson.id], 'Absence overlaps buffer, but change accepted'
                # Session rollback also removes the lesson/service even if assertion fails.
        finally:
            await rh._cleanup(ids)
    asyncio.run(run())


def test_busy_creation_pins_timezone():
    async def run():
        ids = await sg._seed(strict=True)
        try:
            start = datetime(2027, 6, 16, 12)
            async with async_session_maker() as db:
                row = await create_busy_interval(ids['teacher'],
                    StaffBusyIntervalCreate(start_time=start, end_time=start+timedelta(hours=1)),
                    sg._ctx(ids), db)
                assert row.tz_iana == 'Europe/Prague', 'New busy interval has no timezone snapshot'
        finally:
            async with async_session_maker() as db:
                await db.execute(delete(StaffBusyInterval).where(StaffBusyInterval.studio_id == ids['studio']))
                await db.commit()
            await sg._cleanup(ids)
    asyncio.run(run())


def test_interval_guard_rejects_busy_interval():
    async def run():
        ids = await sg._seed(strict=True)
        try:
            start = datetime(2027, 6, 16, 12)
            async with async_session_maker() as db:
                studio = await schedule_guard.lock_studio(db, ids['studio'])
                db.add(StaffBusyInterval(studio_id=ids['studio'], user_id=ids['teacher'],
                    start_time=start, end_time=start+timedelta(hours=1), tz_iana='Europe/Prague'))
                await db.flush()
                import pytest
                from fastapi import HTTPException
                with pytest.raises(HTTPException) as error:
                    await schedule_guard.assert_interval_free(db, studio, teacher_id=ids['teacher'],
                        hall_id=ids['hall'], start=start, end=start+timedelta(hours=1))
                assert error.value.status_code == 409
        finally:
            await sg._cleanup(ids)
    asyncio.run(run())


def test_busy_snapshot_survives_studio_timezone_change():
    async def run():
        ids = await rh._seed()
        try:
            await rh._assign(ids)
            await rh._staff_hours(ids, rh.DAY.weekday(), '09:00', '18:00')
            async with async_session_maker() as db:
                studio = await db.get(Studio, ids['studio'])
                studio.tz_iana = 'Europe/London'
                db.add(StaffBusyInterval(studio_id=ids['studio'], user_id=ids['teacher'],
                    start_time=datetime(2027, 6, 16, 12), end_time=datetime(2027, 6, 16, 13),
                    tz_iana='Europe/Prague'))
                await db.commit()
            result = await rh._query(ids)
            # Prague 12:00-13:00 is London 11:00-12:00 on this date.
            assert result.intervals == [(datetime(2027, 6, 16, 9), datetime(2027, 6, 16, 11)),
                                        (datetime(2027, 6, 16, 12), datetime(2027, 6, 16, 18))]
        finally:
            await rh._cleanup(ids)
    asyncio.run(run())


def test_old_unknown_timezone_does_not_block_unrelated_future():
    async def run():
        ids = await sg._seed(strict=True)
        try:
            async with async_session_maker() as db:
                studio = await schedule_guard.lock_studio(db, ids['studio'])
                db.add(Lesson(studio_id=ids['studio'], name='Historical', teacher_name='T',
                    teacher_id=ids['teacher'], service_id=ids['service'], hall_id=ids['hall'],
                    branch_id=ids['branch'], start_time=datetime(2020, 1, 15, 10), tz_iana=None,
                    duration_min=60, total_spots=8, price=100, level='', equipment=''))
                await db.flush()
                await schedule_guard.assert_interval_free(db, studio,
                    teacher_id=ids['teacher'], hall_id=ids['hall'],
                    start=datetime(2027, 6, 16, 12), end=datetime(2027, 6, 16, 13))
        finally:
            await sg._cleanup(ids)
    asyncio.run(run())
