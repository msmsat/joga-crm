"""Занятие должно попадать в рабочие часы всех, кого оно занимает: студии,
филиала (через зал) и самого тренера.

Проверка одна на все входы расписания — и создание, и перенос зовут её: гейт
только на создании обходится перетаскиванием карточки в журнале, а гейт только
на переносе — созданием сразу в выходной.

Строки графика в базе нет — не ограничиваем: пустая таблица значит «часы не
заполнили» (студия не дошла до Каталога/Сотрудников), а не «закрыто всегда».

Занятость сотрудника на конкретные часы — «время студии» из Журнала (уборка,
планёрка) и отсутствия из его карточки (StaffBusyInterval) — тоже здесь:
онлайн-запись её вычитала всегда (resource_hours), а групповое занятие из
журнала вставало поверх уборки молча.
"""
from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import (
    BranchWorkingHours, Hall, StaffBusyInterval, StaffDayOverride, StaffWorkingHours, StudioWorkingHours,
)

# (именительный, родительный) — падеж отличается в двух текстах отказа.
_STUDIO = ("Студия", "студии")
_BRANCH = ("Филиал", "филиала")
_STAFF = ("Сотрудник", "сотрудника")


def _minutes(hhmm: str) -> int:
    hours, _, mins = hhmm.partition(":")
    return int(hours) * 60 + int(mins)


def fits_hours(open_time: str, close_time: str, start: datetime, duration_min: int) -> bool:
    """Занятие целиком внутри [open; close].

    close <= open — смена через полночь (22:00–06:00): окно продлевается на
    следующие сутки, и ночное занятие (02:00) считается её хвостом, а не ранним
    утром предыдущего дня.
    """
    opens, closes = _minutes(open_time), _minutes(close_time)
    if closes <= opens:
        closes += 24 * 60
    at = start.hour * 60 + start.minute
    if at < opens:
        at += 24 * 60
    return at >= opens and at + duration_min <= closes


async def _assert_not_busy(db: AsyncSession, studio_id: int, teacher_id: int,
                           start: datetime, end: datetime) -> None:
    """Занятие не встаёт на «время студии» или отсутствие сотрудника.

    Сравнение в местном времени студии, как и у самих занятий: тем же правилом
    time_blocks не даёт поставить блок поверх занятия — стороны сходятся.
    Последним запросом гейта: часы и выходные объясняют отказ точнее.
    """
    busy = (await db.execute(
        select(StaffBusyInterval).where(
            StaffBusyInterval.studio_id == studio_id,
            StaffBusyInterval.user_id == teacher_id,
            StaffBusyInterval.start_time < end,
            StaffBusyInterval.end_time > start,
        ).order_by(StaffBusyInterval.start_time).limit(1)
    )).scalar_one_or_none()
    if busy is not None:
        raise HTTPException(status_code=400, detail={
            "code": "studio_time.blocks_lesson",
            "message": f"Занятие попадает на «{busy.reason or 'занятость'}» сотрудника "
                       f"({busy.start_time:%H:%M}–{busy.end_time:%H:%M}) — выберите другое время",
            "params": {"block_id": busy.id},
        })


def _assert_window(hours, start: datetime, duration_min: int, subject: tuple[str, str]) -> None:
    if hours is None:
        return
    if not hours.is_open:
        raise HTTPException(status_code=400, detail=f"{subject[0]} в этот день не работает")
    if not fits_hours(hours.open_time, hours.close_time, start, duration_min):
        raise HTTPException(
            status_code=400,
            detail=f"Занятие выходит за рабочие часы {subject[1]} "
                   f"({hours.open_time}–{hours.close_time})",
        )


async def assert_within_working_hours(
    db: AsyncSession,
    studio_id: int,
    *,
    start_time: datetime,
    duration_min: int,
    teacher_id: int | None,
    hall_id: int | None,
) -> None:
    """400, если занятие выходит за часы работы студии, филиала или тренера
    либо попадает в чей-то выходной."""
    dow = start_time.weekday()  # 0=Пн … 6=Вс — схема всех таблиц *_working_hours

    _assert_window((await db.execute(
        select(StudioWorkingHours).where(
            StudioWorkingHours.studio_id == studio_id,
            StudioWorkingHours.day_of_week == dow,
        )
    )).scalar_one_or_none(), start_time, duration_min, _STUDIO)

    # Зал знает свой филиал, а часы работы — у филиала (Каталог). Зал без
    # филиала (branch_id null) join не даёт строк — ограничения нет.
    if hall_id is not None:
        _assert_window((await db.execute(
            select(BranchWorkingHours)
            .join(Hall, Hall.branch_id == BranchWorkingHours.branch_id)
            .where(Hall.id == hall_id, BranchWorkingHours.day_of_week == dow)
        )).scalar_one_or_none(), start_time, duration_min, _BRANCH)

    if teacher_id is None:
        return
    end_time = start_time + timedelta(minutes=duration_min)

    # Отметка на конкретную дату сильнее недельного графика: «выходной» — отказ
    # сразу, «работает» — день открыт, даже если по неделе он нерабочий.
    override = (await db.execute(
        select(StaffDayOverride).where(
            StaffDayOverride.user_id == teacher_id,
            StaffDayOverride.studio_id == studio_id,
            StaffDayOverride.day == start_time.date(),
        )
    )).scalar_one_or_none()
    override_value = override if isinstance(override,bool) or override is None else override.is_working
    if override_value is False:
        raise HTTPException(status_code=400, detail="У сотрудника в этот день выходной")

    hours = (await db.execute(
        select(StaffWorkingHours).where(
            StaffWorkingHours.user_id == teacher_id,
            StaffWorkingHours.studio_id == studio_id,
            StaffWorkingHours.day_of_week == dow,
        )
    )).scalar_one_or_none()

    # Отметка «работает» открывает день, но не сутки: часы берём из недельной
    # строки. Отметки на рабочие дни проставляются автоматом (staff/schedule.py),
    # так что «есть отметка» само по себе часы тренера не отменяет.
    if override_value and hours is not None and not hours.is_open and not getattr(override,"hours",None):
        await _assert_not_busy(db, studio_id, teacher_id, start_time, end_time)
        return

    if getattr(override,"hours",None):
        from services.staff_hours import as_hours
        hours=as_hours(override.hours)
    _assert_window(hours, start_time, duration_min, _STAFF)
    if hours is not None and getattr(hours,"breaks",None):
        from services.staff_hours import schedule_contains
        if not schedule_contains(hours,start_time,end_time):
            raise HTTPException(status_code=400,detail="Занятие попадает на перерыв сотрудника")
    await _assert_not_busy(db, studio_id, teacher_id, start_time, end_time)
