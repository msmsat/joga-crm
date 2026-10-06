"""«Время студии» — блок в журнале без занятия: уборка, подготовка, планёрка.

Хранится занятостью сотрудника (StaffBusyInterval с названием): журнал рисует
её в колонке мастера тем же языком, что и перерыв, а онлайн-запись и проверки
расписания уже вычитают её из доступности. Отдельной сущности «блок студии» не
заводим — у неё не было бы ни одного читателя, который не умеет занятость.

Один вход для журнала (routers/schedule/staff_blocks.py) и ассистента
(add_studio_time / remove_studio_time): правила здесь, а не в двух копиях.
"""
from datetime import date, datetime, time, timedelta
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Lesson, StaffBusyInterval, Studio, StudioMember
from services import booking_time, schedule_guard, studio_time


def _refuse(status: int, code: str, message: str) -> None:
    # Код — для перевода во фронте (common:errors.studio_time.*), текст — для
    # ассистента и старых клиентов, читающих detail строкой.
    raise HTTPException(status, detail={"code": code, "message": message})


def item(row: StaffBusyInterval) -> dict:
    return {
        "id": row.id, "staff_id": row.user_id, "start_time": row.start_time, "end_time": row.end_time,
        "duration_min": int((row.end_time - row.start_time).total_seconds() // 60), "label": row.reason,
    }


async def _assert_member(db: AsyncSession, studio_id: int, staff_id: int) -> None:
    member = (await db.execute(select(StudioMember.id).where(
        StudioMember.studio_id == studio_id, StudioMember.user_id == staff_id,
        StudioMember.status == "active"))).scalar_one_or_none()
    if member is None:
        raise HTTPException(404, detail="Сотрудник не найден")


async def _row(db: AsyncSession, studio_id: int, block_id: int) -> StaffBusyInterval:
    row = (await db.execute(select(StaffBusyInterval).where(
        StaffBusyInterval.id == block_id, StaffBusyInterval.studio_id == studio_id))).scalar_one_or_none()
    if row is None:
        _refuse(404, "studio_time.not_found", "Время студии не найдено — его уже убрали")
    return row


async def _assert_free(db: AsyncSession, studio: Studio, staff_id: int, start: datetime, end: datetime,
                       exclude_id: Optional[int]) -> None:
    """Время студии ставится в свободное окно мастера — без занятия и без
    другого такого же блока. Занятие считается вместе с буферами: уборка после
    клиента — тоже его время, и блок поверх неё обещал бы то, чего нет."""
    lessons = (await db.execute(select(Lesson).where(
        Lesson.studio_id == studio.id, Lesson.teacher_id == staff_id, Lesson.status != "cancelled",
        Lesson.start_time < end + timedelta(days=1), Lesson.start_time > start - timedelta(days=1),
    ))).scalars().all()
    for lesson in lessons:
        busy_from = lesson.start_time - timedelta(minutes=lesson.buffer_before_min or 0)
        busy_to = lesson.start_time + timedelta(minutes=lesson.duration_min + (lesson.buffer_after_min or 0))
        if busy_from < end and start < busy_to:
            _refuse(409, "studio_time.lesson_overlap",
                    f"В это время у сотрудника занятие «{lesson.name}» "
                    f"{lesson.start_time:%d.%m %H:%M} — время студии ставится в свободное окно")
    others = select(StaffBusyInterval).where(
        StaffBusyInterval.studio_id == studio.id, StaffBusyInterval.user_id == staff_id,
        StaffBusyInterval.start_time < end, StaffBusyInterval.end_time > start)
    if exclude_id is not None:
        others = others.where(StaffBusyInterval.id != exclude_id)
    other = (await db.execute(others.limit(1))).scalar_one_or_none()
    if other is not None:
        _refuse(409, "studio_time.overlap",
                f"На это время у сотрудника уже стоит «{other.reason or 'занятость'}» "
                f"{other.start_time:%H:%M}–{other.end_time:%H:%M}")


async def _place(db: AsyncSession, studio: Studio, row: StaffBusyInterval, *, staff_id: int,
                 start: datetime, duration_min: int, label: Optional[str]) -> None:
    end = start + timedelta(minutes=duration_min)
    # Зона студии известна — время обязано в ней существовать: «02:30» в ночь
    # перевода часов не наступает, а повторяющийся час неоднозначен. Студии без
    # зоны живут местным временем как есть, как и их занятия.
    if studio_time.parse(studio.tz_iana) is not None and booking_time.resolve_interval(start, end, studio.tz_iana) is None:
        _refuse(422, "studio_time.bad_clock", "Этого времени нет или оно повторяется из-за перевода часов — выберите другое")
    await _assert_member(db, studio.id, staff_id)
    # Свободное окно проверено прямо по занятиям мастера с буферами — блок не
    # отнимает время ни у одной записи. Общие стражи расписания
    # (assert_future_fits) тут лишние: они перепроверяют весь день и отказали
    # бы уборке в 10:00 из-за давней накладки вечером, к которой она не
    # прикасается.
    await _assert_free(db, studio, staff_id, start, end, row.id)
    row.user_id, row.start_time, row.end_time = staff_id, start, end
    row.reason, row.tz_iana = label, studio.tz_iana
    db.add(row)


async def create(db: AsyncSession, studio_id: int, *, staff_id: int, start: datetime,
                 duration_min: int, label: str) -> dict:
    studio = await schedule_guard.lock_studio(db, studio_id)
    row = StaffBusyInterval(studio_id=studio_id)
    await _place(db, studio, row, staff_id=staff_id, start=start, duration_min=duration_min, label=label)
    await db.commit()
    await db.refresh(row)
    return item(row)


async def update(db: AsyncSession, studio_id: int, block_id: int, *, staff_id: Optional[int] = None,
                 start: Optional[datetime] = None, duration_min: Optional[int] = None,
                 label: Optional[str] = None) -> dict:
    studio = await schedule_guard.lock_studio(db, studio_id)
    row = await _row(db, studio_id, block_id)
    current = item(row)
    await _place(
        db, studio, row,
        staff_id=staff_id if staff_id is not None else current["staff_id"],
        start=start if start is not None else current["start_time"],
        duration_min=duration_min if duration_min is not None else current["duration_min"],
        label=label if label is not None else current["label"],
    )
    await db.commit()
    await db.refresh(row)
    return item(row)


async def delete(db: AsyncSession, studio_id: int, block_id: int) -> dict:
    await schedule_guard.lock_studio(db, studio_id)
    row = await _row(db, studio_id, block_id)
    removed = item(row)
    await db.delete(row)
    await db.commit()
    return removed


async def list_period(db: AsyncSession, studio_id: int, date_from: date, date_to: date,
                      staff_id: Optional[int] = None) -> list[dict]:
    """Блоки за даты одним запросом — ассистенту рядом с занятиями, чтобы снять
    «уборку в четверг» без обхода сотрудников по одному."""
    query = select(StaffBusyInterval).where(
        StaffBusyInterval.studio_id == studio_id,
        StaffBusyInterval.start_time < datetime.combine(date_to + timedelta(days=1), time.min),
        StaffBusyInterval.end_time > datetime.combine(date_from, time.min),
    ).order_by(StaffBusyInterval.start_time)
    if staff_id is not None:
        query = query.where(StaffBusyInterval.user_id == staff_id)
    return [item(row) for row in (await db.execute(query)).scalars().all()]
