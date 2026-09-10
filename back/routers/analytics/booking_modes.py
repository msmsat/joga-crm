"""Разрез дашборда по модели записи (HB-23, §4.1).

ДВА РАЗНЫХ ЗНАМЕНАТЕЛЯ, И ЭТО НЕ СТИЛИСТИКА. У группового события ёмкость —
места (`total_spots`), у индивидуальной услуги ёмкости в местах нет вовсе:
занят не коврик, а время специалиста. Поэтому загрузка event считается как
«занятые места / места неотменённых событий», а загрузка resource — как
«объединённая длительность занятых интервалов с буферами / рабочее время,
оставшееся после групп и отсутствий».

ОБЪЕДИНЕНИЕ, А НЕ СУММА. Исторические наложения (две записи на одного
специалиста в одно время — легаси допускал) при суммировании давали бы больше
100 %. Числитель и знаменатель считаются по merge_intervals.

НОЛЬ ЗНАМЕНАТЕЛЯ — ЭТО `None`, А НЕ 0 %. «У специалистов не заполнены часы»
и «часы есть, но всё свободно» — разные факты, и рисовать их одной цифрой
значит врать владельцу.

ЗАПРОСЫ ПАКЕТНЫЕ. Число SELECT не зависит ни от длины периода, ни от числа
специалистов: графики, отсутствия и занятия читаются один раз на весь период.
"""
from datetime import date, datetime, time, timedelta

from sqlalchemy import func, select

from models import (BranchWorkingHours, Hall, Lesson, Reservation, StaffBusyInterval,
                    StaffDayOverride, StaffWorkingHours, StudioWorkingHours)
from schemas.analytics.reports import BookingModeSlice
from services import booking_time, resource_hours

from ._filters import ReportFilters, join_hall, lesson_conds, needs_hall_join

MODES = ("event", "resource")


def _minutes(intervals) -> float:
    return sum((end - start).total_seconds() for start, end in intervals) / 60


def _lesson_window(row) -> tuple[datetime, datetime]:
    """Локальное окно занятия вместе с буферами — то же, что занимает слот."""
    return (row.start_time - timedelta(minutes=row.buffer_before_min),
            row.start_time + timedelta(minutes=row.duration_min + row.buffer_after_min))


async def _counts(f: ReportFilters, sid: int, db) -> dict[str, dict[str, int]]:
    """Событий, записей и их статусов по каждой модели — одним запросом.

    События считаются `count(distinct Lesson.id)`, иначе группа с десятью
    участниками стала бы десятью событиями (§4.1).
    """
    conds = lesson_conds(f, sid, include_cancelled=True)
    stmt = select(
        Lesson.booking_mode,
        func.count(func.distinct(Lesson.id)).filter(Lesson.status != "cancelled"),
        func.count(func.distinct(Lesson.id)).filter(Lesson.status == "cancelled"),
        func.count(Reservation.id).filter(Reservation.status.in_(("active", "attended", "pending", "hold"))),
        func.count(Reservation.id).filter(Reservation.status == "attended"),
        func.count(Reservation.id).filter(Reservation.status == "pending"),
        func.count(Reservation.id).filter(Reservation.status == "hold"),
    ).select_from(Lesson).join(Reservation, Reservation.lesson_id == Lesson.id, isouter=True)
    if needs_hall_join(f):
        stmt = join_hall(stmt)
    rows = (await db.execute(stmt.where(*conds).group_by(Lesson.booking_mode))).all()
    return {mode: {"events": int(live), "cancelled": int(dead), "bookings": int(booked),
                   "attended": int(seen), "pending": int(waiting), "hold": int(held)}
            for mode, live, dead, booked, seen, waiting, held in rows}


async def _event_utilization(f: ReportFilters, sid: int, db) -> float | None:
    """Занятые места / вместимость неотменённых событий периода."""
    conds = lesson_conds(f, sid) + [Lesson.booking_mode == "event"]
    stmt = select(
        func.count(Reservation.id).filter(Reservation.status.in_(("active", "attended"))),
        func.max(Lesson.total_spots),
    ).select_from(Lesson).join(Reservation, Reservation.lesson_id == Lesson.id, isouter=True)
    if needs_hall_join(f):
        stmt = join_hall(stmt)
    rows = (await db.execute(stmt.where(*conds).group_by(Lesson.id))).all()
    capacity = sum(int(cap or 0) for _, cap in rows)
    if not capacity:
        return None
    occupied = sum(int(occ or 0) for occ, _ in rows)
    return round(occupied / capacity * 100, 1)


async def _resource_utilization(f: ReportFilters, sid: int, db) -> float | None:
    """Объединённое занятое время resource / рабочее время после вычета групп.

    Сравнение идёт по ЛОКАЛЬНЫМ стенным часам студии: обе стороны дроби взяты
    из одного календаря, и перевод в моменты ничего бы здесь не изменил, а
    легаси без подтверждённой зоны выбросил бы из знаменателя целые дни.
    """
    days = [f.date_from + timedelta(days=i) for i in range((f.date_to - f.date_from).days + 1)]
    window = (datetime.combine(f.date_from, time.min), datetime.combine(f.date_to, time.max))

    lessons = (await db.execute(select(Lesson).where(
        Lesson.studio_id == sid, Lesson.status != "cancelled", Lesson.teacher_id.is_not(None),
        Lesson.start_time >= window[0] - timedelta(days=2), Lesson.start_time <= window[1] + timedelta(days=1),
        *( [Lesson.teacher_id == f.trainer_id] if f.trainer_id is not None else [] ),
    ))).scalars().all()
    if f.branch_id is not None:
        halls = dict((await db.execute(select(Hall.id, Hall.branch_id).where(Hall.studio_id == sid))).all())
        lessons = [row for row in lessons if (row.branch_id or halls.get(row.hall_id)) == f.branch_id]

    teachers = sorted({row.teacher_id for row in lessons})
    if not teachers:
        return None

    studio_hours = list((await db.execute(select(StudioWorkingHours).where(
        StudioWorkingHours.studio_id == sid))).scalars().all())
    branch_hours = list((await db.execute(select(BranchWorkingHours).where(
        BranchWorkingHours.branch_id == f.branch_id))).scalars().all()) if f.branch_id is not None else None
    staff_hours = list((await db.execute(select(StaffWorkingHours).where(
        StaffWorkingHours.studio_id == sid, StaffWorkingHours.user_id.in_(teachers)))).scalars().all())
    overrides = list((await db.execute(select(StaffDayOverride).where(
        StaffDayOverride.studio_id == sid, StaffDayOverride.user_id.in_(teachers),
        StaffDayOverride.day >= f.date_from - timedelta(days=1),
        StaffDayOverride.day <= f.date_to + timedelta(days=1)))).scalars().all())
    busy = list((await db.execute(select(StaffBusyInterval).where(
        StaffBusyInterval.studio_id == sid, StaffBusyInterval.user_id.in_(teachers),
        StaffBusyInterval.start_time <= window[1], StaffBusyInterval.end_time >= window[0]))).scalars().all())

    occupied_total = available_total = 0.0
    for teacher_id in teachers:
        mine = [row for row in lessons if row.teacher_id == teacher_id]
        resource = booking_time.merge_intervals(
            [_lesson_window(row) for row in mine if row.booking_mode == "resource"])
        events = booking_time.merge_intervals(
            [_lesson_window(row) for row in mine if row.booking_mode != "resource"])
        away = booking_time.merge_intervals(
            [(row.start_time, row.end_time) for row in busy if row.user_id == teacher_id])
        hours = [row for row in staff_hours if row.user_id == teacher_id]
        mine_overrides = [row for row in overrides if row.user_id == teacher_id]

        shift: list = []
        for day in days:
            studio_day, known_studio = resource_hours.weekly_intervals(studio_hours, day)
            staff_day, reason = resource_hours.staff_intervals(hours, mine_overrides, day)
            if not known_studio or reason is not None:
                continue
            groups = [studio_day, staff_day]
            if branch_hours is not None:
                branch_day, known_branch = resource_hours.weekly_intervals(branch_hours, day)
                if not known_branch:
                    continue
                groups.insert(1, branch_day)
            shift.extend(resource_hours._intersect_all(groups))
        shift = resource_hours._clip(booking_time.merge_intervals(shift), window)
        if not shift:
            continue
        # Знаменатель — рабочее время БЕЗ групп и отсутствий. Занятое resource
        # время из него НЕ вычитается: оно и есть числитель этой же дроби, и
        # вычесть его значило бы делить занятое на свободное.
        available = resource_hours._subtract(shift, booking_time.merge_intervals(events + away))
        available_total += _minutes(available)
        occupied_total += _minutes(resource_hours._clip(resource, tuple(window)))

    if available_total <= 0:
        return None
    # Легаси-запись вне смены может дать числитель больше знаменателя; 100 %
    # честнее «120 % загрузки», а сама аномалия — предмет аудита HB-24.
    return round(min(occupied_total / available_total * 100, 100.0), 1)


async def booking_mode_slices(f: ReportFilters, sid: int, db) -> list[BookingModeSlice]:
    counts = await _counts(f, sid, db)
    utilization = {"event": await _event_utilization(f, sid, db),
                   "resource": await _resource_utilization(f, sid, db)}
    modes = [f.booking_mode] if f.booking_mode is not None else list(MODES)
    return [BookingModeSlice(booking_mode=mode, utilization_pct=utilization[mode],
                             **counts.get(mode, {"events": 0, "bookings": 0, "attended": 0,
                                                 "pending": 0, "hold": 0, "cancelled": 0}))
            for mode in modes]
