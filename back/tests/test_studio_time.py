"""«Время студии»: блок без занятия из Журнала -> сетка -> ассистент.
Все записи живут в откатываемой транзакции тестовой БД, как в test_staff_schedule_editor.
"""
import asyncio
import time
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from database import engine
from models import Lesson, Studio, StudioMember, StaffWorkingHours, User
from routers.schedule.staff_blocks import (
    create_studio_time, delete_studio_time, staff_blocks, update_studio_time,
)
from schemas.schedule.time_blocks import StudioTimeCreate, StudioTimeUpdate
from services import ai_tools, time_blocks


def run(case):
    async def body():
        async with engine.connect() as conn:
            outer = await conn.begin()
            try:
                async with AsyncSession(bind=conn, join_transaction_mode="create_savepoint", expire_on_commit=False) as db:
                    studio = Studio(name="TEST-STUDIO-TIME", tz_iana="Europe/Prague", strict_schedule_enabled=False)
                    other = Studio(name="TEST-STUDIO-TIME-OTHER", tz_iana="Europe/Prague")
                    user = User(email=f"studio-time-{time.time_ns()}@test.local", hashed_password="x", name="T")
                    db.add_all([studio, other, user]); await db.flush()
                    db.add(StudioMember(studio_id=studio.id, user_id=user.id, role="trainer", status="active", name="T"))
                    for dow in range(7):
                        db.add(StaffWorkingHours(studio_id=studio.id, user_id=user.id, day_of_week=dow,
                                                 is_open=True, open_time="09:00", close_time="21:00"))
                    await db.commit()
                    day = date.today() + timedelta(days=14)
                    ctx = SimpleNamespace(studio_id=studio.id, user=SimpleNamespace(id=user.id), role="owner")
                    await case(db, ctx, day, other.id)
            finally:
                await outer.rollback()
    asyncio.run(body())


def at(day, hour, minute=0):
    return datetime.combine(day, datetime.min.time()) + timedelta(hours=hour, minutes=minute)


async def put(db, ctx, day, hour, minutes=60, label="Уборка", minute=0):
    return await create_studio_time(StudioTimeCreate(staff_id=ctx.user.id, start_time=at(day, hour, minute),
                                                     duration_min=minutes, label=label), ctx, db)


async def lesson(db, ctx, day, hour, *, after=0, status="confirmed"):
    row = Lesson(studio_id=ctx.studio_id, teacher_id=ctx.user.id, teacher_name="T", name="Пилатес",
                 start_time=at(day, hour), duration_min=60, price=100, level="", equipment="", total_spots=8,
                 status=status, tz_iana="Europe/Prague", buffer_after_min=after)
    db.add(row); await db.commit(); return row


def refused(exc: pytest.ExceptionInfo) -> str:
    detail = exc.value.detail
    return detail["code"] if isinstance(detail, dict) else detail


def test_block_reaches_journal_as_its_own_card():
    async def case(db, ctx, day, _):
        block = await put(db, ctx, day, 10, label="  Уборка   зала ")
        assert block["label"] == "Уборка зала" and block["duration_min"] == 60
        blocks = [b for b in await staff_blocks(day, day, ctx, db) if b["kind"] == "busy"]
        assert blocks == [{"staff_id": ctx.user.id, "date": day.isoformat(), "start_minute": 600,
                           "end_minute": 660, "kind": "busy", "label": "Уборка зала", "id": block["id"]}]
        # Две одинаковые «Уборки» встык — два блока: каждый правится и снимается отдельно.
        second = await put(db, ctx, day, 11, label="Уборка зала")
        ids = [b.get("id") for b in await staff_blocks(day, day, ctx, db) if b["kind"] == "busy"]
        assert ids == [block["id"], second["id"]]
        # Перерыв по графику id не получает — открывать на правку там нечего.
        assert all("id" not in b for b in await staff_blocks(day, day, ctx, db) if b["kind"] != "busy")
    run(case)


def test_block_goes_only_into_a_free_window():
    async def case(db, ctx, day, _):
        await lesson(db, ctx, day, 12, after=15)
        with pytest.raises(HTTPException) as exc:
            await put(db, ctx, day, 12, 30)
        assert exc.value.status_code == 409 and refused(exc) == "studio_time.lesson_overlap"
        # Уборка после клиента — тоже его время: буфер занятия не отдаётся блоку.
        with pytest.raises(HTTPException) as exc:
            await put(db, ctx, day, 13, 30)
        assert refused(exc) == "studio_time.lesson_overlap"
        await put(db, ctx, day, 13, 30, minute=15)            # сразу за буфером — свободно
        await lesson(db, ctx, day, 16, status="cancelled")
        await put(db, ctx, day, 16)                           # отменённое занятие окно не держит
        with pytest.raises(HTTPException) as exc:
            await put(db, ctx, day, 16, 30, minute=30, label="Планёрка")
        assert refused(exc) == "studio_time.overlap"
        await put(db, ctx, day, 17, label="Планёрка")         # встык к другому блоку — можно
    run(case)


def test_update_moves_and_renames_without_tripping_on_itself():
    async def case(db, ctx, day, _):
        block = await put(db, ctx, day, 10)
        moved = await update_studio_time(block["id"], StudioTimeUpdate(start_time=at(day, 10, 30)), ctx, db)
        assert (moved["start_time"], moved["duration_min"], moved["label"]) == (at(day, 10, 30), 60, "Уборка")
        renamed = await update_studio_time(block["id"], StudioTimeUpdate(label="Проветривание", duration_min=15), ctx, db)
        assert (renamed["end_time"], renamed["label"]) == (at(day, 10, 45), "Проветривание")
        await lesson(db, ctx, day, 14)
        with pytest.raises(HTTPException) as exc:
            await update_studio_time(block["id"], StudioTimeUpdate(start_time=at(day, 14)), ctx, db)
        assert refused(exc) == "studio_time.lesson_overlap"
    run(case)


def test_delete_and_foreign_studio():
    async def case(db, ctx, day, other_studio):
        block = await put(db, ctx, day, 10)
        stranger = SimpleNamespace(studio_id=other_studio, user=ctx.user, role="owner")
        for call in (lambda: delete_studio_time(block["id"], stranger, db),
                     lambda: update_studio_time(block["id"], StudioTimeUpdate(label="x"), stranger, db)):
            with pytest.raises(HTTPException) as exc:
                await call()
            assert exc.value.status_code == 404
        removed = await delete_studio_time(block["id"], ctx, db)
        assert removed["id"] == block["id"]
        assert not [b for b in await staff_blocks(day, day, ctx, db) if b["kind"] == "busy"]
        with pytest.raises(HTTPException) as exc:
            await delete_studio_time(block["id"], ctx, db)
        assert refused(exc) == "studio_time.not_found"
        # Сотрудник другой студии сюда не ставится.
        with pytest.raises(HTTPException) as exc:
            await create_studio_time(StudioTimeCreate(staff_id=ctx.user.id, start_time=at(day, 10),
                                                      duration_min=30, label="Уборка"), stranger, db)
        assert exc.value.status_code == 404
    run(case)


def test_daylight_saving_gap_is_refused():
    async def case(db, ctx, _day, __):
        # 29.03.2026 в Праге часы прыгают с 02:00 на 03:00 — 02:30 не наступает.
        gap = date(2026, 3, 29)
        with pytest.raises(HTTPException) as exc:
            await put(db, ctx, gap, 2, 30, minute=15)
        assert refused(exc) == "studio_time.bad_clock"
    run(case)


def test_schema_guards():
    base = {"staff_id": 1, "start_time": "2030-01-10T10:00:00", "duration_min": 30}
    with pytest.raises(ValidationError):
        StudioTimeCreate(**base, label="   ")
    with pytest.raises(ValidationError):
        StudioTimeCreate(**base, label="x" * 81)
    with pytest.raises(ValidationError):
        StudioTimeCreate(**{**base, "duration_min": 4}, label="Уборка")
    with pytest.raises(ValidationError):
        StudioTimeCreate(**{**base, "start_time": datetime(2030, 1, 10, 10, tzinfo=timezone.utc)}, label="Уборка")


def test_assistant_puts_lists_and_undoes():
    async def case(db, ctx, day, _):
        args = ai_tools.StudioTimeArgs(staff_id=ctx.user.id, start_time=at(day, 9), duration_min=45, label="Планёрка")
        made = (await ai_tools.add_studio_time(ctx, db, args))["studio_time"]
        listed = await time_blocks.list_period(db, ctx.studio_id, day, day)
        assert [(b["id"], b["label"]) for b in listed] == [(made["id"], "Планёрка")]
        # Кнопка «Вернуть» у карточки ассистента снимает поставленный блок.
        await ai_tools.UNDO["add_studio_time"]({"id": made["id"]}, ctx, db)
        assert await time_blocks.list_period(db, ctx.studio_id, day, day) == []
    run(case)
