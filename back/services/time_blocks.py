"""«Время студии» — блок в журнале без занятия: уборка, подготовка, планёрка.

Хранится занятостью сотрудника (StaffBusyInterval с названием): журнал рисует
её в колонке мастера тем же языком, что и перерыв, а онлайн-запись и проверки
расписания уже вычитают её из доступности. Отдельной сущности «блок студии» не
заводим — у неё не было бы ни одного читателя, который не умеет занятость.

Один блок может касаться нескольких сотрудников (планёрка всей команде): это
интервал на каждого с общим group_key. Правка и удаление идут по всей группе —
двигают одну планёрку, а не восемь; убрать одного человека — снять с него
отметку в окне.

Вне рабочих часов блок ставить можно (уборка до открытия, планёрка в выходной),
но ответ называет, кого он там застаёт (`outside_hours`), — окно и ассистент
предупреждают об этом человека.

Один вход для журнала (routers/schedule/staff_blocks.py) и ассистента
(add_studio_time / remove_studio_time): правила здесь, а не в двух копиях.
"""
import uuid
from contextlib import asynccontextmanager
from datetime import date, datetime, time, timedelta
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Lesson, StaffBusyInterval, StaffDayOverride, StaffWorkingHours, Studio, StudioMember
from services import booking_time, schedule_guard, studio_time
from services.staff_hours import unavailable_blocks

# Что считается «вне рабочего времени» и в каком порядке это называть: выходной
# весомее нерабочего часа, нерабочий час — перерыва по графику.
_OFF_KINDS = ("day_off", "off_hours", "break")


def _refuse(status: int, code: str, message: str, **extra) -> None:
    # Код — для перевода во фронте (common:errors.studio_time.*), текст — для
    # ассистента и старых клиентов, читающих detail строкой. staff_id в extra —
    # у кого из выбранных сотрудников отказ: при «всем» иначе не понять, у кого.
    raise HTTPException(status, detail={"code": code, "message": message, **extra})


def item(row: StaffBusyInterval) -> dict:
    return {
        "id": row.id, "staff_id": row.user_id, "start_time": row.start_time, "end_time": row.end_time,
        "duration_min": int((row.end_time - row.start_time).total_seconds() // 60), "label": row.reason,
        "notes": row.notes or "", "photos": list(row.photos or []),
    }


def group_item(rows: list[StaffBusyInterval], outside: Optional[list[dict]] = None) -> dict:
    """Блок целиком: время, название и заметка — первого интервала (у группы
    они общие), плюс кого он касается и id интервалов по сотрудникам."""
    return {**item(rows[0]), "staff_ids": [r.user_id for r in rows], "ids": [r.id for r in rows],
            "outside_hours": outside or []}


async def _members(db: AsyncSession, studio_id: int, row: StaffBusyInterval) -> list[StaffBusyInterval]:
    if not row.group_key:
        return [row]
    rows = (await db.execute(select(StaffBusyInterval).where(
        StaffBusyInterval.studio_id == studio_id, StaffBusyInterval.group_key == row.group_key,
    ).order_by(StaffBusyInterval.id))).scalars().all()
    return list(rows) or [row]


async def outside_hours(db: AsyncSession, studio_id: int, staff_ids: list[int],
                        start: datetime, end: datetime) -> list[dict]:
    """Кого блок застаёт вне рабочих часов: выходной, нерабочее время, перерыв
    по графику. Сотрудник без графика вовсе — всегда «на месте», как и в сетке.
    Считается по тем же часам, что рисует журнал (staff_hours.unavailable_blocks),
    но без занятостей: блок не должен «прятать» нерабочий час под собой."""
    if not staff_ids:
        return []
    first, last = start.date(), (end - timedelta(microseconds=1)).date()
    hours = (await db.execute(select(StaffWorkingHours).where(
        StaffWorkingHours.studio_id == studio_id, StaffWorkingHours.user_id.in_(staff_ids)))).scalars().all()
    overrides = (await db.execute(select(StaffDayOverride).where(
        StaffDayOverride.studio_id == studio_id, StaffDayOverride.user_id.in_(staff_ids),
        StaffDayOverride.day >= first - timedelta(days=1), StaffDayOverride.day <= last))).scalars().all()
    result = []
    for staff_id in staff_ids:
        mine_hours = [h for h in hours if h.user_id == staff_id]
        mine_overrides = [o for o in overrides if o.user_id == staff_id]
        kinds = set()
        for n in range((last - first).days + 1):
            for block in unavailable_blocks(mine_hours, mine_overrides, [], first + timedelta(days=n)):
                if block["start_time"] < end and start < block["end_time"] and block["kind"] in _OFF_KINDS:
                    kinds.add(block["kind"])
        if kinds:
            result.append({"staff_id": staff_id, "kind": next(k for k in _OFF_KINDS if k in kinds)})
    return result


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
                    f"В это время у сотрудника {staff_id} занятие «{lesson.name}» "
                    f"{lesson.start_time:%d.%m %H:%M} — время студии ставится в свободное окно",
                    staff_id=staff_id)
    others = select(StaffBusyInterval).where(
        StaffBusyInterval.studio_id == studio.id, StaffBusyInterval.user_id == staff_id,
        StaffBusyInterval.start_time < end, StaffBusyInterval.end_time > start)
    if exclude_id is not None:
        others = others.where(StaffBusyInterval.id != exclude_id)
    other = (await db.execute(others.limit(1))).scalar_one_or_none()
    if other is not None:
        _refuse(409, "studio_time.overlap",
                f"На это время у сотрудника {staff_id} уже стоит «{other.reason or 'занятость'}» "
                f"{other.start_time:%H:%M}–{other.end_time:%H:%M}", staff_id=staff_id)


async def _place(db: AsyncSession, studio: Studio, row: StaffBusyInterval, *, staff_id: int,
                 start: datetime, duration_min: int, label: Optional[str], notes: str,
                 photos: list[str]) -> None:
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
    row.notes, row.photos = notes, list(photos)
    db.add(row)


@asynccontextmanager
async def _all_or_nothing(db: AsyncSession):
    """Отказ у одного сотрудника группы — откат и уже расставленных. Без этого
    их интервалы оставались в сессии, и следующий шаг плана ассистента (та же
    сессия) закоммитил бы планёрку половине команды."""
    try:
        yield
    except HTTPException:
        await db.rollback()
        raise


async def create(db: AsyncSession, studio_id: int, *, staff_ids: list[int], start: datetime,
                 duration_min: int, label: str, notes: str = "", photos: Optional[list[str]] = None) -> dict:
    """Один блок на всех выбранных: по интервалу на сотрудника с общим ключом.
    Отказ у любого — не ставится ни у кого (одна транзакция)."""
    studio = await schedule_guard.lock_studio(db, studio_id)
    key = uuid.uuid4().hex
    rows = []
    async with _all_or_nothing(db):
        for staff_id in dict.fromkeys(staff_ids):
            row = StaffBusyInterval(studio_id=studio_id, group_key=key)
            await _place(db, studio, row, staff_id=staff_id, start=start, duration_min=duration_min, label=label,
                         notes=notes, photos=photos or [])
            rows.append(row)
    end = start + timedelta(minutes=duration_min)
    outside = await outside_hours(db, studio_id, [r.user_id for r in rows], start, end)
    await db.commit()
    for row in rows:
        await db.refresh(row)
    return group_item(rows, outside)


async def update(db: AsyncSession, studio_id: int, block_id: int, *, staff_ids: Optional[list[int]] = None,
                 start: Optional[datetime] = None, duration_min: Optional[int] = None,
                 label: Optional[str] = None, notes: Optional[str] = None,
                 photos: Optional[list[str]] = None) -> dict:
    """Правка всей группы блока. staff_ids — новый состав: оставшимся интервал
    правится на месте, снятым — удаляется, новым — заводится. Освободившийся
    интервал переходит к новому сотруднику (тот же id), а не пересоздаётся:
    «передать уборку Оле» остаётся тем же блоком."""
    studio = await schedule_guard.lock_studio(db, studio_id)
    row = await _row(db, studio_id, block_id)
    members = await _members(db, studio_id, row)
    current = item(row)
    wanted = list(dict.fromkeys(staff_ids)) if staff_ids else [m.user_id for m in members]
    key = row.group_key or uuid.uuid4().hex
    by_staff = {m.user_id: m for m in members}
    spare = [m for m in members if m.user_id not in wanted]
    values = dict(
        start=start if start is not None else current["start_time"],
        duration_min=duration_min if duration_min is not None else current["duration_min"],
        label=label if label is not None else current["label"],
        notes=notes if notes is not None else current["notes"],
        photos=photos if photos is not None else current["photos"],
    )
    kept = []
    async with _all_or_nothing(db):
        for staff_id in wanted:
            target = by_staff.get(staff_id) or (spare.pop(0) if spare else StaffBusyInterval(studio_id=studio_id))
            target.group_key = key
            await _place(db, studio, target, staff_id=staff_id, **values)
            kept.append(target)
    for gone in spare:
        await db.delete(gone)
    end = values["start"] + timedelta(minutes=values["duration_min"])
    outside = await outside_hours(db, studio_id, wanted, values["start"], end)
    await db.commit()
    for target in kept:
        await db.refresh(target)
    return group_item(kept, outside)


async def delete(db: AsyncSession, studio_id: int, block_id: int) -> dict:
    """Убирает блок целиком — у всех, кого он касался."""
    await schedule_guard.lock_studio(db, studio_id)
    row = await _row(db, studio_id, block_id)
    members = await _members(db, studio_id, row)
    removed = group_item(members)
    for member in members:
        await db.delete(member)
    await db.commit()
    return removed


async def list_period(db: AsyncSession, studio_id: int, date_from: date, date_to: date,
                      staff_id: Optional[int] = None) -> list[dict]:
    """Блоки за даты одним запросом — ассистенту рядом с занятиями, чтобы снять
    «уборку в четверг» без обхода сотрудников по одному. Блок на нескольких
    сотрудников — одной строкой со staff_ids: снимается он тоже целиком."""
    query = select(StaffBusyInterval).where(
        StaffBusyInterval.studio_id == studio_id,
        StaffBusyInterval.start_time < datetime.combine(date_to + timedelta(days=1), time.min),
        StaffBusyInterval.end_time > datetime.combine(date_from, time.min),
    ).order_by(StaffBusyInterval.start_time, StaffBusyInterval.id)
    rows = list((await db.execute(query)).scalars().all())
    groups: dict[object, list[StaffBusyInterval]] = {}
    for row in rows:
        groups.setdefault(row.group_key or ("row", row.id), []).append(row)
    blocks = [group_item(members) for members in groups.values()]
    if staff_id is not None:
        blocks = [b for b in blocks if staff_id in b["staff_ids"]]
    return blocks
