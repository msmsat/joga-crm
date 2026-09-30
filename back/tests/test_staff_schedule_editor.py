"""Split hours from editor -> stored exceptions -> Journal -> booking gates.
All writes, including route commits, live inside a rolled-back test transaction.
"""
import asyncio
import time
from datetime import date, datetime, timedelta
from types import SimpleNamespace
import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from database import engine
from models import Studio, User, StudioMember, StaffWorkingHours, StaffDayOverride, Lesson
from routers.staff.schedule import get_schedule_editor, save_schedule_editor, set_day_override
from routers.schedule.staff_blocks import staff_blocks
from schemas.staff.staff import StaffScheduleEditorRequest, StaffWorkingHoursItem, StaffDayOverrideRequest
from services.working_hours import assert_within_working_hours

async def fixture(case):
    async with engine.connect() as conn:
        outer = await conn.begin()
        try:
            async with AsyncSession(bind=conn, join_transaction_mode="create_savepoint", expire_on_commit=False) as db:
                studio = Studio(name="TEST-STAFF-SPLIT", tz_iana="Europe/Prague", strict_schedule_enabled=False)
                other = Studio(name="TEST-STAFF-SPLIT-OTHER", tz_iana="Europe/Prague")
                user = User(email=f"staff-split-{time.time_ns()}@test.local", hashed_password="x", name="T")
                db.add_all([studio, other, user]); await db.flush()
                db.add(StudioMember(studio_id=studio.id, user_id=user.id, role="trainer", status="active", name="T"))
                for dow in range(7):
                    db.add(StaffWorkingHours(studio_id=studio.id, user_id=user.id, day_of_week=dow, is_open=True, open_time="09:00", close_time="22:00"))
                await db.commit()
                day = date.today() + timedelta(days=21)
                day -= timedelta(days=day.weekday())
                ctx = SimpleNamespace(studio_id=studio.id, user=SimpleNamespace(id=user.id), role="owner")
                await case(db, ctx, day, other.id)
        finally:
            await outer.rollback()

def item(dow=0, *, start="11:00", end="22:00", opened=True, breaks=None, label=None):
    return StaffWorkingHoursItem(day_of_week=dow, is_open=opened, open_time=start, close_time=end,
        breaks=breaks or [], off_label=label)

async def save(db, ctx, day, days, repeat=False):
    return await save_schedule_editor(ctx.user.id, StaffScheduleEditorRequest(week_start=day.isoformat(), repeat_weekly=repeat, days=days), ctx, db)

async def lesson(db, ctx, day, hour=14, minute=0, status="confirmed", after=0):
    row = Lesson(studio_id=ctx.studio_id, teacher_id=ctx.user.id, teacher_name="T", name="Occupied appointment",
        start_time=datetime.combine(day, datetime.min.time()) + timedelta(hours=hour, minutes=minute), duration_min=60,
        price=100, level="", equipment="", total_spots=1, status=status, tz_iana="Europe/Prague", buffer_after_min=after)
    db.add(row); await db.commit(); return row

PAUSE = [{"open_time":"15:00","close_time":"17:00","label":"Обед"}]

def test_once_hours_reach_journal_and_gate_without_changing_other_weeks():
    async def case(db, ctx, monday, _):
        await save(db, ctx, monday, [item(breaks=PAUSE)])
        current = await get_schedule_editor(ctx.user.id, monday, ctx, db)
        following = await get_schedule_editor(ctx.user.id, monday+timedelta(days=7), ctx, db)
        assert current["days"][0]["breaks"][0]["label"] == "Обед"
        assert following["days"][0]["breaks"] == [] and following["days"][0]["open_time"] == "09:00"
        blocks = await staff_blocks(monday, monday, ctx, db)
        lunch = next(b for b in blocks if b["kind"] == "break")
        assert (lunch["start_minute"], lunch["end_minute"], lunch["label"]) == (900, 1020, "Обед")
        with pytest.raises(HTTPException) as err:
            await assert_within_working_hours(db, ctx.studio_id, start_time=datetime.combine(monday,datetime.min.time())+timedelta(hours=15), duration_min=30, teacher_id=ctx.user.id, hall_id=None)
        assert err.value.status_code == 400 and "перерыв" in err.value.detail
        await assert_within_working_hours(db, ctx.studio_id, start_time=datetime.combine(monday,datetime.min.time())+timedelta(hours=17), duration_min=60, teacher_id=ctx.user.id, hall_id=None)
    asyncio.run(fixture(case))

def test_repeat_replaces_selected_date_but_keeps_other_dated_exceptions():
    async def case(db, ctx, monday, _):
        await save(db,ctx,monday,[item(start="12:00",end="16:00")])
        await save(db,ctx,monday+timedelta(days=7),[item(opened=False,label="Отпуск")])
        await save(db,ctx,monday,[item(breaks=PAUSE)],repeat=True)
        current = await get_schedule_editor(ctx.user.id,monday,ctx,db)
        holiday = await get_schedule_editor(ctx.user.id,monday+timedelta(days=7),ctx,db)
        regular = await get_schedule_editor(ctx.user.id,monday+timedelta(days=14),ctx,db)
        assert current["days"][0]["breaks"] == regular["days"][0]["breaks"] == PAUSE
        assert not holiday["days"][0]["is_open"] and holiday["days"][0]["off_label"] == "Отпуск"
    asyncio.run(fixture(case))

@pytest.mark.parametrize("repeat", [False, True])
def test_any_live_lesson_blocks_break_even_without_reservations_and_rolls_back(repeat):
    async def case(db,ctx,monday,_):
        occupied = await lesson(db,ctx,monday,hour=15)
        with pytest.raises(HTTPException) as err:
            await save(db,ctx,monday,[item(breaks=PAUSE)],repeat=repeat)
        assert err.value.status_code == 409
        assert err.value.detail["params"]["lesson_id"] == occupied.id
        await db.rollback()
        current = await get_schedule_editor(ctx.user.id,monday,ctx,db)
        assert current["days"][0]["breaks"] == [] and current["days"][0]["open_time"] == "09:00"
    asyncio.run(fixture(case))

def test_cancelled_lesson_allows_custom_day_off_and_journal_shows_whole_day():
    async def case(db,ctx,monday,_):
        await lesson(db,ctx,monday,status="cancelled")
        await save(db,ctx,monday,[item(opened=False,label="Семейный день")])
        blocks = await staff_blocks(monday,monday,ctx,db)
        assert blocks == [{"staff_id":ctx.user.id,"date":monday.isoformat(),"start_minute":0,"end_minute":1440,"kind":"day_off","label":"Семейный день"}]
    asyncio.run(fixture(case))

def test_occupied_buffers_block_break():
    async def case(db,ctx,monday,_):
        await lesson(db,ctx,monday,hour=14,after=15)
        with pytest.raises(HTTPException):
            await save(db,ctx,monday,[item(breaks=PAUSE)])
        await db.rollback()
    asyncio.run(fixture(case))

def test_month_day_off_cannot_hide_a_lesson_without_clients():
    async def case(db,ctx,monday,_):
        await lesson(db,ctx,monday)
        with pytest.raises(HTTPException) as err:
            await set_day_override(ctx.user.id,StaffDayOverrideRequest(date=monday.isoformat(),is_working=False),ctx,db)
        assert err.value.status_code == 409
    asyncio.run(fixture(case))

def test_other_studio_cannot_read_or_change_staff_schedule():
    async def case(db,ctx,monday,other):
        wrong=SimpleNamespace(studio_id=other,user=ctx.user,role="owner")
        with pytest.raises(HTTPException) as err:
            await get_schedule_editor(ctx.user.id,monday,wrong,db)
        assert err.value.status_code == 404
        with pytest.raises(HTTPException):
            await save(db,wrong,monday,[item(opened=False)])
        assert await staff_blocks(monday,monday,wrong,db) == []
    asyncio.run(fixture(case))

def test_night_break_is_shown_on_next_calendar_day():
    async def case(db,ctx,monday,_):
        await save(db,ctx,monday,[item(start="22:00",end="06:00",breaks=[{"open_time":"01:00","close_time":"02:00","label":"Пауза"}])],repeat=True)
        await save(db,ctx,monday,[item(1,opened=False)],repeat=True)
        blocks=await staff_blocks(monday+timedelta(days=1),monday+timedelta(days=1),ctx,db)
        pause=next(b for b in blocks if b["kind"]=="break")
        assert (pause["start_minute"],pause["end_minute"],pause["label"])==(60,120,"Пауза")
    asyncio.run(fixture(case))

def test_invalid_breaks_rejected_before_writing():
    for breaks in [[{"open_time":"10:00","close_time":"12:00"}], PAUSE+[{"open_time":"16:00","close_time":"18:00"}], [{"open_time":"11:00","close_time":"22:00"}]]:
        with pytest.raises(ValidationError): item(breaks=breaks)


@pytest.mark.parametrize("assigned", [False, True])
def test_owner_with_assigned_service_can_set_weekly_hours_in_strict_studio(assigned):
    async def case(db,ctx,monday,_):
        from models import Service, user_services
        from sqlalchemy import insert
        studio=await db.get(Studio,ctx.studio_id)
        studio.strict_schedule_enabled=True
        member=(await db.execute(select(StudioMember).where(StudioMember.studio_id==ctx.studio_id,StudioMember.user_id==ctx.user.id))).scalar_one()
        member.role="owner"
        service=Service(studio_id=ctx.studio_id,name="Owner service",price=100,duration_min=60)
        db.add(service); await db.flush()
        if assigned:
            await db.execute(insert(user_services).values(user_id=ctx.user.id,service_id=service.id))
        await db.commit()
        await lesson(db,ctx,monday)
        if assigned:
            await save(db,ctx,monday,[item(start="09:00",end="22:00")],repeat=True)
        else:
            with pytest.raises(HTTPException) as err:
                await save(db,ctx,monday,[item(start="09:00",end="22:00")],repeat=True)
            assert err.value.detail["code"] == "FUTURE_ASSIGNMENT_CONFLICT"
    asyncio.run(fixture(case))


def test_today_cannot_be_marked_off_after_a_lesson_has_finished():
    async def case(db,ctx,_,other):
        today=date.today()
        monday=today-timedelta(days=today.weekday())
        await lesson(db,ctx,today,hour=0)
        with pytest.raises(HTTPException) as err:
            await save(db,ctx,monday,[item(today.weekday(),opened=False)])
        assert err.value.detail["code"] == "STAFF_SCHEDULE_CONFLICT"
    asyncio.run(fixture(case))
