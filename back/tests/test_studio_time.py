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


def test_note_and_photos_travel_to_the_journal_and_back():
    """Заметка и снимки «времени студии»: ставятся, едут в сетку вместе с блоком
    (окно правки открывается полным, без второго запроса), правятся и снимаются."""
    photo = "/static/notes/" + "a" * 32 + ".jpg"

    async def case(db, ctx, day, _):
        made = await create_studio_time(StudioTimeCreate(
            staff_id=ctx.user.id, start_time=at(day, 10), duration_min=30, label="Уборка",
            notes="  Протереть коврики\nПроверить колонку  ", photos=[photo]), ctx, db)
        assert (made["notes"], made["photos"]) == ("Протереть коврики\nПроверить колонку", [photo])
        busy = [b for b in await staff_blocks(day, day, ctx, db) if b["kind"] == "busy"]
        assert busy[0]["notes"] == made["notes"] and busy[0]["photos"] == [photo]
        # Перенос заметку не трогает: None — «не менять».
        moved = await update_studio_time(made["id"], StudioTimeUpdate(start_time=at(day, 11)), ctx, db)
        assert (moved["notes"], moved["photos"]) == (made["notes"], [photo])
        # Пустые значения — «убрать»; пустой блок едет в сетку без лишних полей.
        cleared = await update_studio_time(made["id"], StudioTimeUpdate(notes="   ", photos=[]), ctx, db)
        assert (cleared["notes"], cleared["photos"]) == ("", [])
        busy = [b for b in await staff_blocks(day, day, ctx, db) if b["kind"] == "busy"]
        assert "notes" not in busy[0] and "photos" not in busy[0]
        # Ассистент тоже пишет заметку, если человек её сказал.
        args = ai_tools.StudioTimeArgs(staff_id=ctx.user.id, start_time=at(day, 14), duration_min=15,
                                       label="Проветривание", notes="Открыть окна в зале")
        said = (await ai_tools.add_studio_time(ctx, db, args))["studio_time"]
        assert said["notes"] == "Открыть окна в зале"
    run(case)


def test_photos_are_only_paths_from_the_upload():
    base = {"staff_id": 1, "start_time": "2030-01-10T10:00:00", "duration_min": 30, "label": "Уборка"}
    with pytest.raises(ValidationError):
        StudioTimeCreate(**base, photos=["https://tracker.example/pixel.png"])
    with pytest.raises(ValidationError):
        StudioTimeUpdate(photos=["javascript:alert(1)"])
    with pytest.raises(ValidationError):
        StudioTimeCreate(**base, notes="x" * 2001)
    with pytest.raises(ValidationError):
        StudioTimeCreate(**base, photos=["/static/notes/" + f"{i:032x}" + ".png" for i in range(11)])


async def teammate(db, ctx, name="Оля", hours=("09:00", "21:00")):
    user = User(email=f"studio-time-{name}-{time.time_ns()}@test.local", hashed_password="x", name=name)
    db.add(user); await db.flush()
    db.add(StudioMember(studio_id=ctx.studio_id, user_id=user.id, role="trainer", status="active", name=name))
    if hours:
        for dow in range(7):
            db.add(StaffWorkingHours(studio_id=ctx.studio_id, user_id=user.id, day_of_week=dow,
                                     is_open=True, open_time=hours[0], close_time=hours[1]))
    await db.commit()
    return user.id


def test_one_block_for_the_whole_team():
    """«Планёрка всем»: один блок на нескольких сотрудников — в колонке у каждого,
    правится и убирается целиком; тренер видит, с кем она."""
    async def case(db, ctx, day, _):
        olya, dima = await teammate(db, ctx, "Оля"), await teammate(db, ctx, "Дима")
        team = [ctx.user.id, olya, dima]
        made = await create_studio_time(StudioTimeCreate(staff_ids=team, start_time=at(day, 9), duration_min=30,
                                                         label="Планёрка"), ctx, db)
        assert made["staff_ids"] == team and len(made["ids"]) == 3 and made["outside_hours"] == []
        busy = [b for b in await staff_blocks(day, day, ctx, db) if b["kind"] == "busy"]
        assert sorted(b["staff_id"] for b in busy) == sorted(team)
        assert all(b["staff_ids"] == team for b in busy)
        # Тренеру сетка отдаёт только его колонку, но с кем планёрка — видно.
        mine = SimpleNamespace(studio_id=ctx.studio_id, user=SimpleNamespace(id=olya), role="trainer")
        own = [b for b in await staff_blocks(day, day, mine, db) if b["kind"] == "busy"]
        assert [b["staff_id"] for b in own] == [olya] and own[0]["staff_ids"] == team
        # С кем — с именами: список команды тренеру не отдаётся.
        assert [m["name"] for m in own[0]["team"]] == ["T", "Оля", "Дима"]
        # Правка с любого из блоков двигает всю группу; снятый — уходит, новый — встаёт.
        anya = await teammate(db, ctx, "Аня")
        moved = await update_studio_time(busy[-1]["id"], StudioTimeUpdate(
            staff_ids=[ctx.user.id, olya, anya], start_time=at(day, 10)), ctx, db)
        assert moved["staff_ids"] == [ctx.user.id, olya, anya] and moved["start_time"] == at(day, 10)
        busy = [b for b in await staff_blocks(day, day, ctx, db) if b["kind"] == "busy"]
        assert sorted(b["staff_id"] for b in busy) == sorted([ctx.user.id, olya, anya])
        assert {b["start_minute"] for b in busy} == {600}
        # Освободившийся интервал перешёл к новому сотруднику, а не пересоздан.
        assert sorted(moved["ids"]) == sorted(made["ids"])
        removed = await delete_studio_time(moved["ids"][1], ctx, db)
        assert sorted(removed["staff_ids"]) == sorted([ctx.user.id, olya, anya])
        assert not [b for b in await staff_blocks(day, day, ctx, db) if b["kind"] == "busy"]
    run(case)


def test_team_block_refuses_whole_and_names_who():
    async def case(db, ctx, day, _):
        olya = await teammate(db, ctx, "Оля")
        await lesson(db, ctx, day, 12)
        with pytest.raises(HTTPException) as exc:
            await create_studio_time(StudioTimeCreate(staff_ids=[olya, ctx.user.id], start_time=at(day, 12),
                                                      duration_min=30, label="Планёрка"), ctx, db)
        assert refused(exc) == "studio_time.lesson_overlap" and exc.value.detail["staff_id"] == ctx.user.id
        # Отказ у одного — не встаёт ни у кого.
        assert not [b for b in await staff_blocks(day, day, ctx, db) if b["kind"] == "busy"]
    run(case)


def test_outside_working_hours_is_allowed_but_named():
    async def case(db, ctx, day, _):
        olya = await teammate(db, ctx, "Оля", hours=("12:00", "18:00"))
        free = await teammate(db, ctx, "Без графика", hours=None)
        made = await create_studio_time(StudioTimeCreate(staff_ids=[ctx.user.id, olya, free], start_time=at(day, 10),
                                                         duration_min=60, label="Уборка"), ctx, db)
        # 10:00 — рабочее время у первого (09–21), до смены у Оли (12–18); без графика — всегда на месте.
        assert made["outside_hours"] == [{"staff_id": olya, "kind": "off_hours"}]
        early = await update_studio_time(made["id"], StudioTimeUpdate(start_time=at(day, 7)), ctx, db)
        assert {o["staff_id"] for o in early["outside_hours"]} == {ctx.user.id, olya}
        late = await update_studio_time(made["id"], StudioTimeUpdate(start_time=at(day, 12)), ctx, db)
        assert late["outside_hours"] == []
        # Часы без занятостей — то, по чему окно предупреждает заранее.
        hours = await staff_blocks(day, day, ctx, db, hours_only=True)
        assert not [b for b in hours if b["kind"] == "busy"]
        assert any(b["staff_id"] == olya and b["kind"] == "off_hours" and b["start_minute"] == 0 for b in hours)
    run(case)


def test_team_schema_merges_the_old_single_form():
    base = {"start_time": "2030-01-10T10:00:00", "duration_min": 30, "label": "Уборка"}
    assert StudioTimeCreate(**base, staff_id=3, staff_ids=[5, 3]).staff_ids == [3, 5]
    assert StudioTimeUpdate(staff_id=4).staff_ids == [4]
    assert StudioTimeUpdate(label="x").staff_ids is None
    with pytest.raises(ValidationError):
        StudioTimeCreate(**base)
    with pytest.raises(ValidationError):
        StudioTimeCreate(**base, staff_ids=[])


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
        olya = await teammate(db, ctx, "Оля")
        args = ai_tools.StudioTimeArgs(staff_id=ctx.user.id, also_staff_ids=[olya], start_time=at(day, 9),
                                       duration_min=45, label="Планёрка")
        made = (await ai_tools.add_studio_time(ctx, db, args))["studio_time"]
        assert made["staff_ids"] == [ctx.user.id, olya]
        # Блок на двоих — одной строкой: ассистент снимает его целиком.
        listed = await time_blocks.list_period(db, ctx.studio_id, day, day)
        assert [(b["id"], b["label"], b["staff_ids"]) for b in listed] == [(made["id"], "Планёрка", [ctx.user.id, olya])]
        assert [b["id"] for b in await time_blocks.list_period(db, ctx.studio_id, day, day, staff_id=olya)] == [made["id"]]
        # Кнопка «Вернуть» у карточки ассистента снимает поставленный блок.
        await ai_tools.UNDO["add_studio_time"]({"id": made["id"]}, ctx, db)
        assert await time_blocks.list_period(db, ctx.studio_id, day, day) == []
    run(case)


def test_lesson_cannot_land_on_studio_time():
    """Онлайн-запись блок вычитала всегда; теперь и групповое занятие из Журнала —
    создание, перенос, повторяющиеся и ассистент ходят через один гейт."""
    from services.working_hours import assert_within_working_hours

    async def case(db, ctx, day, _):
        await put(db, ctx, day, 10)
        gate = lambda hour, minute=0, length=60: assert_within_working_hours(  # noqa: E731
            db, ctx.studio_id, start_time=at(day, hour, minute), duration_min=length,
            teacher_id=ctx.user.id, hall_id=None)
        for hour, minute, length in ((10, 30, 30), (9, 30, 60), (9, 0, 180)):
            with pytest.raises(HTTPException) as exc:
                await gate(hour, minute, length)
            assert exc.value.status_code == 400 and refused(exc) == "studio_time.blocks_lesson"
        await gate(9)         # встык до уборки
        await gate(11)        # и сразу после неё
    run(case)


def test_assistant_fill_skips_studio_time():
    """fill_schedule считает свободные начала сам: без блока в занятом он
    обещал бы слоты, которые роутер на исполнении отклонит."""
    async def case(db, ctx, day, _):
        await put(db, ctx, day, 12)
        args = ai_tools.FillScheduleArgs(teacher_id=ctx.user.id, service_id=1, date_from=day, date_to=day,
                                         time_from="10:00", time_to="15:00", duration_min=60)
        slots = await ai_tools._free_slots(day, args, {}, ctx, db)
        assert [s.hour for s in slots] == [10, 11, 13, 14]
    run(case)
