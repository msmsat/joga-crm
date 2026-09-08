"""HB-05 — `services/resource_hours.available_intervals`: чистый расчёт
ограниченного рабочего окна специалиста в филиале на календарную дату.

Сценарии из карточки задачи: ночная смена 22:00–06:00, выходной, нет строки
(CONFIG_INCOMPLETE, НЕ 00:00–24:00 — отличие от permissive `working_hours.py`
у event), отсутствующий филиал, два филиала, активность членства, перерыв в
середине смены.

Реальная БД, ручная чистка. Запуск из back/:
    python -m pytest tests/test_resource_hours.py -q
"""
import asyncio
import os
import time as _time
import warnings
from datetime import date, datetime, time, timedelta

warnings.filterwarnings("ignore")

from sqlalchemy import delete, select

from database import async_session_maker
from models import (
    BranchWorkingHours, StaffBranchAssignment, StaffBusyInterval, StaffDayOverride,
    StaffWorkingHours, Studio, StudioBranch, StudioMember, StudioWorkingHours, User,
)
from services import resource_hours as rh

_TAG = "TEST-RESOURCE-HOURS"
# Дата фиксирована произвольно далеко в будущем — функция не читает "сейчас",
# только день недели этой даты и предыдущей.
DAY = date(2027, 6, 16)  # среда
YESTERDAY = DAY - timedelta(days=1)  # вторник


async def _seed() -> dict:
    stamp = f"{int(_time.time())}-{os.getpid()}"
    async with async_session_maker() as db:
        studio = Studio(name=f"{_TAG}-{stamp}", tz_iana="Europe/Prague")
        db.add(studio)
        await db.flush()
        branch_a = StudioBranch(studio_id=studio.id, name="A")
        branch_b = StudioBranch(studio_id=studio.id, name="B")
        db.add_all([branch_a, branch_b])
        await db.flush()
        teacher = User(email=f"rh-{stamp}@test.local", hashed_password="x", name="T")
        db.add(teacher)
        await db.flush()
        db.add(StudioMember(user_id=teacher.id, studio_id=studio.id, role="trainer",
                            status="active", name="T", last_name="T"))
        # Студия и филиал A открыты КРУГЛОСУТОЧНО оба дня ("00:00"-"00:00" —
        # тот же приём, что widget_work_start/end в booking_rules: close<=open
        # оборачивается в полные сутки, см. _to_interval). Так тесты СПЕЦИАЛИСТА
        # сами определяют итоговую доступность, не упираясь в часы студии.
        for dow in (DAY.weekday(), YESTERDAY.weekday()):
            db.add(StudioWorkingHours(studio_id=studio.id, day_of_week=dow,
                                      is_open=True, open_time="00:00", close_time="00:00"))
            db.add(BranchWorkingHours(branch_id=branch_a.id, day_of_week=dow,
                                      is_open=True, open_time="00:00", close_time="00:00"))
        await db.commit()
        ids = {"studio": studio.id, "branch_a": branch_a.id, "branch_b": branch_b.id,
               "teacher": teacher.id}
    return ids


async def _cleanup(ids: dict) -> None:
    async with async_session_maker() as db:
        await db.execute(delete(StaffBusyInterval).where(StaffBusyInterval.studio_id == ids["studio"]))
        await db.execute(delete(StaffBranchAssignment).where(StaffBranchAssignment.studio_id == ids["studio"]))
        await db.execute(delete(StaffDayOverride).where(StaffDayOverride.studio_id == ids["studio"]))
        await db.execute(delete(StaffWorkingHours).where(StaffWorkingHours.studio_id == ids["studio"]))
        await db.execute(delete(BranchWorkingHours).where(
            BranchWorkingHours.branch_id.in_([ids["branch_a"], ids["branch_b"]])))
        await db.execute(delete(StudioWorkingHours).where(StudioWorkingHours.studio_id == ids["studio"]))
        await db.execute(delete(StudioBranch).where(StudioBranch.studio_id == ids["studio"]))
        await db.execute(delete(StudioMember).where(StudioMember.studio_id == ids["studio"]))
        await db.execute(delete(Studio).where(Studio.id == ids["studio"]))
        await db.execute(delete(User).where(User.id == ids["teacher"]))
        await db.commit()


async def _wipe_staff_config(ids: dict) -> None:
    async with async_session_maker() as db:
        await db.execute(delete(StaffBusyInterval).where(StaffBusyInterval.studio_id == ids["studio"]))
        await db.execute(delete(StaffBranchAssignment).where(StaffBranchAssignment.studio_id == ids["studio"]))
        await db.execute(delete(StaffDayOverride).where(StaffDayOverride.studio_id == ids["studio"]))
        await db.execute(delete(StaffWorkingHours).where(StaffWorkingHours.studio_id == ids["studio"]))
        await db.commit()


async def _assign(ids: dict, branch_key: str = "branch_a") -> None:
    async with async_session_maker() as db:
        db.add(StaffBranchAssignment(studio_id=ids["studio"], user_id=ids["teacher"],
                                     branch_id=ids[branch_key]))
        await db.commit()


async def _staff_hours(ids: dict, dow: int, open_time: str, close_time: str, is_open: bool = True) -> None:
    async with async_session_maker() as db:
        db.add(StaffWorkingHours(user_id=ids["teacher"], studio_id=ids["studio"],
                                 day_of_week=dow, is_open=is_open,
                                 open_time=open_time, close_time=close_time))
        await db.commit()


async def _query(ids: dict, branch_key: str = "branch_a", day: date = DAY) -> rh.ResourceDayWindow:
    async with async_session_maker() as db:
        return await rh.available_intervals(
            db, studio_id=ids["studio"], user_id=ids["teacher"], branch_id=ids[branch_key], day=day)


# ─── Нет назначения на филиал ─────────────────────────────────────────────────

async def _not_assigned(ids):
    result = await _query(ids)
    assert result.intervals == [] and result.reason == rh.NOT_ASSIGNED


# ─── Членство неактивно ───────────────────────────────────────────────────────

async def _membership_not_active(ids):
    await _assign(ids)
    await _staff_hours(ids, DAY.weekday(), "09:00", "18:00")
    async with async_session_maker() as db:
        member = (await db.execute(
            select(StudioMember).where(
                StudioMember.user_id == ids["teacher"], StudioMember.studio_id == ids["studio"])
        )).scalar_one()
        member.status = "pending"
        await db.commit()
    result = await _query(ids)
    assert result.intervals == [] and result.reason == rh.NOT_ACTIVE
    async with async_session_maker() as db:
        member = (await db.execute(
            select(StudioMember).where(
                StudioMember.user_id == ids["teacher"], StudioMember.studio_id == ids["studio"])
        )).scalar_one()
        member.status = "active"
        await db.commit()


# ─── Нет строки графика вовсе — CONFIG_INCOMPLETE, НЕ 00:00–24:00 ────────────

async def _no_row_is_config_incomplete(ids):
    await _assign(ids)
    result = await _query(ids)
    assert result.intervals == [] and result.reason == rh.CONFIG_INCOMPLETE


# ─── Обычная смена в пределах одного дня, пересечение студия/филиал/сотрудник ─

async def _plain_shift_intersected(ids):
    await _assign(ids)
    await _staff_hours(ids, DAY.weekday(), "10:00", "16:00")
    result = await _query(ids)
    assert result.reason is None
    assert result.intervals == [(datetime(2027, 6, 16, 10, 0), datetime(2027, 6, 16, 16, 0))]


# ─── Ночная смена 22:00–06:00: хвост вчерашней смены виден сегодня ───────────

async def _night_shift_tail(ids):
    await _assign(ids)
    # Смена началась ВЧЕРА в 22:00 и кончилась СЕГОДНЯ в 06:00.
    await _staff_hours(ids, YESTERDAY.weekday(), "22:00", "06:00")
    result = await _query(ids)
    assert result.reason is None, result
    assert result.intervals == [(datetime(2027, 6, 16, 0, 0), datetime(2027, 6, 16, 6, 0))], result.intervals


# ─── Выходной override закрывает день целиком ────────────────────────────────

async def _day_off_override(ids):
    await _assign(ids)
    await _staff_hours(ids, DAY.weekday(), "09:00", "18:00")
    async with async_session_maker() as db:
        db.add(StaffDayOverride(user_id=ids["teacher"], studio_id=ids["studio"], day=DAY, is_working=False))
        await db.commit()
    result = await _query(ids)
    assert result.intervals == [] and result.reason == rh.DAY_OFF


# ─── «Работает» без недельной строки — не сутки, а CONFIG_INCOMPLETE ─────────

async def _override_without_hours_is_incomplete(ids):
    await _assign(ids)
    async with async_session_maker() as db:
        db.add(StaffDayOverride(user_id=ids["teacher"], studio_id=ids["studio"], day=DAY, is_working=True))
        await db.commit()
    result = await _query(ids)
    assert result.intervals == [] and result.reason == rh.CONFIG_INCOMPLETE, (
        "override=True без часов не должен открывать сутки")


# ─── Перерыв в середине смены разрезает интервал на два куска ────────────────

async def _break_splits_shift(ids):
    await _assign(ids)
    await _staff_hours(ids, DAY.weekday(), "09:00", "18:00")
    async with async_session_maker() as db:
        db.add(StaffBusyInterval(
            studio_id=ids["studio"], user_id=ids["teacher"],
            start_time=datetime(2027, 6, 16, 13, 0), end_time=datetime(2027, 6, 16, 14, 0),
            reason="обед",
        ))
        await db.commit()
    result = await _query(ids)
    assert result.reason is None
    assert result.intervals == [
        (datetime(2027, 6, 16, 9, 0), datetime(2027, 6, 16, 13, 0)),
        (datetime(2027, 6, 16, 14, 0), datetime(2027, 6, 16, 18, 0)),
    ], result.intervals


# ─── Два филиала: назначение и часы не путаются между ними ───────────────────

async def _two_branches_independent(ids):
    await _assign(ids, "branch_a")
    await _staff_hours(ids, DAY.weekday(), "09:00", "18:00")
    # Филиал B не заведён в графике вовсе (нет BranchWorkingHours) — запрос по
    # нему должен упасть на CONFIG_INCOMPLETE, а не подхватить часы филиала A.
    result_a = await _query(ids, "branch_a")
    assert result_a.reason is None and result_a.intervals, result_a

    result_b = await _query(ids, "branch_b")
    assert result_b.intervals == [] and result_b.reason == rh.NOT_ASSIGNED, (
        "специалист не назначен на филиал B — филиал A не должен его подменить")

    # Назначаем и на B — но часов у филиала B всё ещё нет.
    await _assign(ids, "branch_b")
    result_b2 = await _query(ids, "branch_b")
    assert result_b2.intervals == [] and result_b2.reason == rh.CONFIG_INCOMPLETE


def test_resource_hours_against_the_database():
    async def run():
        ids = await _seed()
        try:
            await _not_assigned(ids)
            await _wipe_staff_config(ids)
            await _membership_not_active(ids)
            await _wipe_staff_config(ids)
            await _no_row_is_config_incomplete(ids)
            await _wipe_staff_config(ids)
            await _plain_shift_intersected(ids)
            await _wipe_staff_config(ids)
            await _night_shift_tail(ids)
            await _wipe_staff_config(ids)
            await _day_off_override(ids)
            await _wipe_staff_config(ids)
            await _override_without_hours_is_incomplete(ids)
            await _wipe_staff_config(ids)
            await _break_splits_shift(ids)
            await _wipe_staff_config(ids)
            await _two_branches_independent(ids)
        finally:
            await _cleanup(ids)

    asyncio.run(run())


if __name__ == "__main__":
    test_resource_hours_against_the_database()
