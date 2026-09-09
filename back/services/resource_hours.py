"""Ограниченный рабочий интервал специалиста в филиале на календарную дату
(HB-05, docs/EPIC_HYBRID_BOOKING_IMPLEMENTATION.md §4.3/§6.2).

ЧТО ЭТО И ПОЧЕМУ ОТДЕЛЬНО ОТ `services/working_hours.py`. Тот модуль решает
другую задачу: «занятие уже создали — попадает ли оно в чьи-то часы», и при
отсутствующей строке НЕ ограничивает (пустая таблица = «часы не заполнили», не
«закрыто всегда» — так и должно оставаться для event, флаг off это не меняет).
Resource-доступность — противоположный вопрос: «можно ли вообще предложить
клиенту это время», и здесь молчание про часы обязано читаться как «настройка
не готова», а не как разрешение записаться круглосуточно. Два разных ответа на
похожий вопрос — не баг, а разные последствия ошибки: пропущенное занятие в
Журнале операторы Тут же видят и чинят руками, а бесконечная доступность в
Mini-app product молча продаёт то, чего нет.

ЧТО ЗДЕСЬ СОЗНАТЕЛЬНО НЕ РЕШАЕТСЯ: пересечение с уже существующими Lesson и
буферами услуги — это `services/resource_availability.py` (HB-08), он вызовет
эту функцию как один из источников. Здесь — только чистое пересечение часов
студии/филиала/специалиста минус перерывы, без обращения к расписанию и без
сети.

НОЧНАЯ СМЕНА. `Lesson`/`working_hours.fits_hours` уже решают её как «close <=
open — окно продлевается на следующие сутки». Здесь то же правило, но с другой
стороны: интервал, ОТКРЫТЫЙ ВЧЕРА и продлившийся за полночь, обязан войти в
ответ на «сегодня», иначе смена 22:00–06:00 не даёт доступности после полуночи
вовсе (запрошено HB-05 п.3, п.6).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import (
    BranchWorkingHours, StaffBranchAssignment, StaffBusyInterval, StaffDayOverride,
    StaffWorkingHours, StudioMember, StudioWorkingHours, Studio,
)
from services import booking_time, studio_time

Interval = tuple[datetime, datetime]


@dataclass(frozen=True)
class ResourceDayWindow:
    """Результат на одну календарную дату одного специалиста в одном филиале.

    `intervals` — куски [start, end) в МЕСТНОМ времени студии (naive datetime,
    тот же контракт, что у `Lesson.start_time`), отсортированные, без
    пересечений, уже за вычетом перерывов. Пустой список — не всегда ошибка:
    `reason=None` при пустом списке значит «часы всех троих известны, но не
    пересекаются» (законный ответ, HB-08 покажет «нет времени на этот день»).
    `reason` заполнен ТОЛЬКО когда пустой список — это отсутствие данных для
    решения, а не решение «нет мест».
    """
    intervals: list[Interval]
    reason: Optional[str] = None


# Причины, машиночитаемые для HB-08/HB-13 (§6.3 CONFIG_INCOMPLETE).
NOT_ASSIGNED = "not_assigned"          # нет StaffBranchAssignment на этот филиал
NOT_ACTIVE = "not_active"              # сотрудник не активен в этой студии
DAY_OFF = "day_off"                    # явный выходной (override) — законный ноль
CONFIG_INCOMPLETE = "config_incomplete"  # не хватает часов, чтобы посчитать


def _to_interval(open_time: str, close_time: str, anchor: date) -> Optional[Interval]:
    """Час открытия/закрытия на КОНКРЕТНУЮ дату → абсолютный интервал.

    `close <= open` — смена через полночь, конец уезжает на anchor+1 (тот же
    приём, что `services/working_hours.fits_hours`). Нераспознанное время
    (не HH:MM) — None, а не крах: строка не читается как открытая на сутки.
    """
    try:
        start = datetime.combine(anchor, time.fromisoformat(open_time))
        end = datetime.combine(anchor, time.fromisoformat(close_time))
    except (TypeError, ValueError):
        return None
    if end <= start:
        end += timedelta(days=1)
    return start, end


def _clip(intervals: list[Interval], window: Interval) -> list[Interval]:
    """Куски `intervals`, попадающие в `window` (полуоткрытый)."""
    win_start, win_end = window
    out = []
    for start, end in intervals:
        s, e = max(start, win_start), min(end, win_end)
        if s < e:
            out.append((s, e))
    return out


def _intersect_all(groups: list[list[Interval]]) -> list[Interval]:
    """Пересечение нескольких списков интервалов (студия ∩ филиал ∩ специалист).

    Пустая группа (сущность недоступна вовсе в этот день) обнуляет результат —
    ровно как логическое И.
    """
    if not groups:
        return []
    result = groups[0]
    for group in groups[1:]:
        merged: list[Interval] = []
        for a_start, a_end in result:
            for b_start, b_end in group:
                s, e = max(a_start, b_start), min(a_end, b_end)
                if s < e:
                    merged.append((s, e))
        result = merged
        if not result:
            return []
    return booking_time.merge_intervals(result)


def _subtract(intervals: list[Interval], busy: list[Interval]) -> list[Interval]:
    """`intervals` минус `busy` — перерыв может разрезать смену на куски."""
    out = list(intervals)
    for b_start, b_end in busy:
        next_out: list[Interval] = []
        for s, e in out:
            if b_end <= s or b_start >= e:
                next_out.append((s, e))
                continue
            if b_start > s:
                next_out.append((s, b_start))
            if b_end < e:
                next_out.append((b_end, e))
        out = next_out
    return sorted(out)


async def _weekly_intervals(
    db: AsyncSession, model, scope_col, scope_id: int, day: date,
) -> tuple[list[Interval], bool]:
    """Интервалы модели `model` (Studio/BranchWorkingHours) на `day`, включая
    хвост смены, начавшейся накануне. Второе значение — были ли вообще строки
    на оба дня (False = нет данных, а не «закрыто»)."""
    yesterday = day - timedelta(days=1)
    rows = (await db.execute(
        select(model).where(
            scope_col == scope_id,
            model.day_of_week.in_({day.weekday(), yesterday.weekday()}),
        )
    )).scalars().all()
    return weekly_intervals(rows, day)


def weekly_intervals(rows, day: date) -> tuple[list[Interval], bool]:
    """Pure weekly-hours calculation shared by single-day and batched loaders."""
    yesterday = day - timedelta(days=1)
    by_dow = {row.day_of_week: row for row in rows}
    known = day.weekday() in by_dow or yesterday.weekday() in by_dow
    if not known:
        return [], False

    window = (datetime.combine(day, time.min), datetime.combine(day + timedelta(days=1), time.min))
    candidates: list[Interval] = []
    today_row = by_dow.get(day.weekday())
    if today_row is not None and today_row.is_open:
        interval = _to_interval(today_row.open_time, today_row.close_time, day)
        if interval is not None:
            candidates.append(interval)
    prev_row = by_dow.get(yesterday.weekday())
    if prev_row is not None and prev_row.is_open:
        interval = _to_interval(prev_row.open_time, prev_row.close_time, yesterday)
        if interval is not None:
            candidates.append(interval)
    return _clip(candidates, window), True


async def _staff_intervals(
    db: AsyncSession, user_id: int, studio_id: int, day: date,
) -> tuple[list[Interval], Optional[str]]:
    """Интервалы специалиста на `day` — недельный график, скорректированный
    точечными отметками (`StaffDayOverride`) на сам день и на день накануне
    (тот же учёт ночного хвоста, что и для студии/филиала).

    Флаг «работает» поверх дня без часов НЕ означает сутки (HB-05, в отличие
    от `services/working_hours.assert_within_working_hours`, где ровно этот
    случай трактуется как «без ограничений» — для event это осознанно
    оставлено как есть, для resource это `CONFIG_INCOMPLETE`).
    """
    yesterday = day - timedelta(days=1)
    hours_rows = (await db.execute(
        select(StaffWorkingHours).where(
            StaffWorkingHours.user_id == user_id,
            StaffWorkingHours.studio_id == studio_id,
            StaffWorkingHours.day_of_week.in_({day.weekday(), yesterday.weekday()}),
        )
    )).scalars().all()
    override_rows = (await db.execute(
        select(StaffDayOverride).where(
            StaffDayOverride.user_id == user_id,
            StaffDayOverride.studio_id == studio_id,
            StaffDayOverride.day.in_([day, yesterday]),
        )
    )).scalars().all()
    return staff_intervals(hours_rows, override_rows, day)


def staff_intervals(hours_rows, override_rows, day: date) -> tuple[list[Interval], Optional[str]]:
    """Pure staff hours/overrides calculation; no per-slot database reads."""
    yesterday = day - timedelta(days=1)
    hours_by_dow = {row.day_of_week: row for row in hours_rows}
    override_by_day = {row.day: row.is_working for row in override_rows}

    if override_by_day.get(day) is False:
        return [], DAY_OFF

    window = (datetime.combine(day, time.min), datetime.combine(day + timedelta(days=1), time.min))
    candidates: list[Interval] = []
    known = False

    for anchor, weekday in ((day, day.weekday()), (yesterday, yesterday.weekday())):
        override = override_by_day.get(anchor)
        row = hours_by_dow.get(weekday)
        if override is False:
            # Явный выходной этого (или вчерашнего) дня — его смена в счёт не
            # идёт, включая её ночной хвост.
            continue
        if row is not None:
            known = True
            if override is True or row.is_open:
                interval = _to_interval(row.open_time, row.close_time, anchor)
                if interval is not None:
                    candidates.append(interval)
        elif override is True:
            # «Работает» без недельной строки — открывает день, но часов не
            # даёт: без них резервировать нечего (см. докстринг функции).
            return [], CONFIG_INCOMPLETE

    if not known:
        return [], CONFIG_INCOMPLETE
    return _clip(candidates, window), None


async def available_intervals(
    db: AsyncSession, *, studio_id: int, user_id: int, branch_id: int, day: date,
) -> ResourceDayWindow:
    """Свободное (от занятости специалиста — не от уже поставленных Lesson)
    рабочее окно на `day`: пересечение часов студии, филиала и специалиста,
    минус его перерывы/отсутствия. Чтения — GET-безопасные: ничего не
    создаёт (ни `StaffDayOverride`, ни строк расписания) и не ходит в сеть.
    """
    membership = (await db.execute(
        select(StudioMember.status).where(
            StudioMember.user_id == user_id, StudioMember.studio_id == studio_id,
        )
    )).scalar_one_or_none()
    if membership is None or membership != "active":
        return ResourceDayWindow([], NOT_ACTIVE)

    assigned = (await db.execute(
        select(StaffBranchAssignment.id).where(
            StaffBranchAssignment.studio_id == studio_id,
            StaffBranchAssignment.user_id == user_id,
            StaffBranchAssignment.branch_id == branch_id,
        )
    )).scalar_one_or_none()
    if assigned is None:
        return ResourceDayWindow([], NOT_ASSIGNED)

    studio_intervals, studio_known = await _weekly_intervals(
        db, StudioWorkingHours, StudioWorkingHours.studio_id, studio_id, day)
    if not studio_known:
        return ResourceDayWindow([], CONFIG_INCOMPLETE)

    branch_intervals, branch_known = await _weekly_intervals(
        db, BranchWorkingHours, BranchWorkingHours.branch_id, branch_id, day)
    if not branch_known:
        return ResourceDayWindow([], CONFIG_INCOMPLETE)

    staff_intervals, staff_reason = await _staff_intervals(db, user_id, studio_id, day)
    if staff_reason is not None:
        return ResourceDayWindow([], staff_reason)

    combined = _intersect_all([studio_intervals, branch_intervals, staff_intervals])
    if not combined:
        return ResourceDayWindow([], None)

    window = (datetime.combine(day, time.min), datetime.combine(day + timedelta(days=1), time.min))
    studio = (await db.execute(select(Studio).where(Studio.id == studio_id))).scalar_one()
    if not studio_time.clock(studio).verified:
        return ResourceDayWindow([], CONFIG_INCOMPLETE)
    busy_rows = (await db.execute(
        select(StaffBusyInterval).where(
            StaffBusyInterval.studio_id == studio_id,
            StaffBusyInterval.user_id == user_id,
            StaffBusyInterval.start_time < window[1] + timedelta(days=2),
            StaffBusyInterval.end_time > window[0] - timedelta(days=2),
        )
    )).scalars().all()
    busy = []
    for row in busy_rows:
        resolved = booking_time.resolve_interval(row.start_time, row.end_time, row.tz_iana)
        if resolved is None:
            return ResourceDayWindow([], CONFIG_INCOMPLETE)
        busy.append(tuple(studio_time.to_local(t, studio).replace(tzinfo=None) for t in resolved))
    free = _subtract(combined, busy)
    return ResourceDayWindow(free, None)
