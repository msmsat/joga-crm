"""Единый порядок блокировок и транзакционная защита занятости (HB-06),
docs/EPIC_HYBRID_BOOKING_IMPLEMENTATION.md §6.2.

ПОРЯДОК, ОБЯЗАТЕЛЬНЫЙ ДЛЯ ВСЕХ ПИШУЩИХ ПУТЕЙ, СПОСОБНЫХ ЗАТРОНУТЬ STRICT-СТУДИЮ:

    Studio → Quote (если есть) → Lesson по ID → Reservation по ID → Client →
    финансовые строки.

`lock_studio` — первый шаг этого порядка. Берётся ВСЕГДА, даже у legacy-студии
с `strict_schedule_enabled=False` — иначе команда, начатая до включения
strict, могла бы записать конфликт уже ПОСЛЕ его включения (гонка на самом
включении режима). Остальные блокировки в порядке — забота вызывающего кода;
этот модуль не открывает своих сессий и не коммитит — держится до commit/
rollback вызывающего.

Сетевые вызовы и длительная генерация календаря под этим замком запрещены —
это грубая блокировка ОДНОЙ строки studios, и удерживать её на что-то кроме
коротких SQL-операций значит сериализовать ползаписи чужих несвязанных
операций той же студии без нужды.

READ COMMITTED: любой объект, прочитанный ДО того, как этот процесс встал в
очередь на lock_studio, может быть устаревшим к моменту, когда замок достался
именно ему. Вызывающий обязан перечитать состояние того, что проверяет,
ПОСЛЕ lock_studio (populate_existing/refresh/новый SELECT), а не доверять
снимку, снятому раньше.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional, Sequence

from fastapi import HTTPException
from sqlalchemy import or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from models import Lesson, Studio, StaffBusyInterval, StudioMember, Service, User
from services import working_hours
from services import booking_time
from services import lesson_time, resource_hours, studio_time


async def lock_studio(db: AsyncSession, studio_id: int) -> Studio:
    """`SELECT studios FOR UPDATE` — держит строку до commit/rollback
    вызывающего. 404, если студии нет (тот же ответ, что у любого чужого id
    в проекте — не подсказывать существование чужой строки)."""
    studio = (await db.execute(
        select(Studio).where(Studio.id == studio_id).with_for_update().execution_options(populate_existing=True)
    )).scalar_one_or_none()
    if studio is None:
        raise HTTPException(status_code=404, detail="Студия не найдена")
    return studio


def _instant_or_none(local: datetime, studio) -> Optional[datetime]:
    """Момент местного времени по ТЕКУЩЕЙ (не снимку) зоне студии. None — зона
    не подтверждена, либо время не существует/неоднозначно (переход на
    летнее/зимнее) — считать его безопасным нельзя."""
    if not studio_time.clock(studio).verified:
        return None
    try:
        return studio_time.to_utc(local, studio)
    except (studio_time.NonexistentLocalTime, studio_time.AmbiguousLocalTime):
        return None


async def assert_interval_free(
    db: AsyncSession, studio: Studio, *,
    teacher_id: Optional[int], hall_id: Optional[int],
    start: datetime, end: datetime,
    buffer_before_min: int = 0, buffer_after_min: int = 0,
    exclude_lesson_id: Optional[int] = None,
    tz_iana: Optional[str] = None,
) -> None:
    """409, если `[start-buffer_before; end+buffer_after)` пересекает
    существующее неотменённое занятие ТОГО ЖЕ мастера (в ЛЮБОМ филиале
    студии — специалист физически не может вести два занятия одновременно
    в разных местах, §6.2 п.4) или того же зала.

    Вызывать ПОСЛЕ `lock_studio(db, studio.id)` — без него гонка не закрыта:
    два одновременных запроса читают "свободно" одинаково и оба проходят.

    Сравнение — по ТОЧНЫМ МОМЕНТАМ (studio.tz_iana сейчас + снимок каждого
    существующего занятия), не по стенным часам: наивное сравнение обмануло
    бы себя, если зона студии менялась между двумя занятиями. Момент любой
    стороны неизвестен (зона не подтверждена, DST-дыра/повтор) — конфликт
    доказать нечем, и это отклоняется как незавершённая конфигурация, а не
    молча пропускается (§6.2 п.3: "будущую запись с неизвестной зоной при
    включении strict отвергать").
    """
    if teacher_id is None and hall_id is None:
        return

    resolved = booking_time.resolve_interval(
        start - timedelta(minutes=buffer_before_min), end + timedelta(minutes=buffer_after_min),
        tz_iana or studio.tz_iana)
    new_start, new_end = resolved if resolved else (None, None)
    if new_start is None or new_end is None:
        raise HTTPException(
            status_code=409,
            detail="Часовой пояс студии не подтверждён или время неоднозначно — "
                   "строгая проверка занятости невозможна",
        )

    conditions = []
    if teacher_id is not None:
        conditions.append(Lesson.teacher_id == teacher_id)
    if hall_id is not None:
        conditions.append(Lesson.hall_id == hall_id)

    # Отбор ограничен по времени тем же консервативным запасом в двое суток,
    # что и `possibly_overlaps`: ни один существующий IANA-offset не сдвигает
    # момент дальше. Без границы каждый create читал бы ВСЮ историю мастера —
    # на студии с десятками тысяч занятий это скан под замком студии.
    # Условие считается по фактической длительности и буферам самой строки,
    # поэтому длинное legacy-занятие из выборки не выпадает.
    margin = timedelta(days=2)
    stmt = select(Lesson).where(
        Lesson.studio_id == studio.id,
        Lesson.status != "cancelled",
        or_(*conditions),
        Lesson.start_time - Lesson.buffer_before_min * text("INTERVAL '1 minute'")
        < new_end.replace(tzinfo=None) + margin,
        Lesson.start_time + (Lesson.duration_min + Lesson.buffer_after_min) * text("INTERVAL '1 minute'")
        > new_start.replace(tzinfo=None) - margin,
    )
    if exclude_lesson_id is not None:
        stmt = stmt.where(Lesson.id != exclude_lesson_id)

    for other in (await db.execute(stmt)).scalars().all():
        when = lesson_time.resolve(other, studio)
        if when.instant is None:
            if not booking_time.possibly_overlaps(
                other.start_time - timedelta(minutes=other.buffer_before_min),
                other.start_time + timedelta(minutes=other.duration_min + other.buffer_after_min),
                new_start, new_end):
                continue
            raise HTTPException(
                status_code=409,
                detail=f"Занятие #{other.id} без подтверждённого момента времени — "
                       "строгая проверка занятости невозможна",
            )

        other_start = when.instant - timedelta(minutes=other.buffer_before_min)
        other_end = when.instant + timedelta(minutes=other.duration_min + other.buffer_after_min)
        if other_start < new_end and new_start < other_end:
            resource = "trainer" if teacher_id is not None and other.teacher_id == teacher_id else "hall"
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "SLOT_UNAVAILABLE",
                    "message": f"Пересечение с занятием #{other.id}",
                    "params": {"lesson_id": other.id, "resource": resource},
                },
            )


    if teacher_id is not None:
        rows = (await db.execute(select(StaffBusyInterval).where(
            StaffBusyInterval.studio_id == studio.id, StaffBusyInterval.user_id == teacher_id,
            StaffBusyInterval.start_time < new_end + timedelta(days=2),
            StaffBusyInterval.end_time > new_start - timedelta(days=2),
        ))).scalars().all()
        for row in rows:
            interval = booking_time.resolve_interval(row.start_time, row.end_time, row.tz_iana)
            if interval is None or (interval[0] < new_end and new_start < interval[1]):
                raise HTTPException(409, detail={"code": "SLOT_UNAVAILABLE",
                    "message": "Специалист недоступен в выбранное время",
                    "params": {"busy_interval_id": row.id}})


@dataclass(frozen=True)
class AssignmentConflict:
    lesson_id: int
    start_time: datetime


async def assert_future_assignments_valid(
    db: AsyncSession, studio: Studio, *, user_id: int, branch_id: Optional[int] = None,
) -> Sequence[AssignmentConflict]:
    """При strict — существующие БУДУЩИЕ resource-записи специалиста ещё
    обязаны попадать в его доступность ПОСЛЕ уже применённого в этой же
    транзакции изменения (новые часы/отсутствия/назначения филиалов —
    вызывающий сохраняет их через flush ДО этого вызова, чтобы SELECT ниже
    их увидел). Возвращает список конфликтов вместо тихого False — карточка
    HB-06 требует "перечень конфликтов", а откатывать данные владельца
    самостоятельно нельзя (история не удаляется).

    Единственный источник правды о доступности — `resource_hours` (тот же,
    что считает слоты клиенту), вторая копия правил здесь не заводится.
    `branch_id=None` — проверяются записи во ВСЕХ филиалах специалиста.

    При strict=false — всегда пустой список: старое поведение не имеет этого
    понятия вовсе, и флаг off его не создаёт.
    """
    if not studio.strict_schedule_enabled:
        return []

    conditions = [
        Lesson.studio_id == studio.id,
        Lesson.teacher_id == user_id,
        Lesson.status != "cancelled",
        Lesson.start_time >= lesson_time.local_now(studio) - timedelta(days=2),
    ]
    if branch_id is not None:
        conditions.append(Lesson.branch_id == branch_id)
    rows = (await db.execute(select(Lesson).where(*conditions))).scalars().all()
    if not rows:
        return []

    conflicts: list[AssignmentConflict] = []
    member = (await db.execute(select(StudioMember).where(
        StudioMember.studio_id == studio.id, StudioMember.user_id == user_id
    ).execution_options(populate_existing=True))).scalar_one_or_none()
    service_ids = set((await db.execute(select(Service.id).join(User.services).where(
        User.id == user_id, Service.studio_id == studio.id))).scalars().all())
    for row in rows:
        interval = booking_time.resolve_interval(
            row.start_time - timedelta(minutes=row.buffer_before_min),
            row.start_time + timedelta(minutes=row.duration_min + row.buffer_after_min), row.tz_iana)
        if interval is None:
            conflicts.append(AssignmentConflict(row.id, row.start_time))
            continue
        start, end = (studio_time.to_local(t, studio).replace(tzinfo=None) for t in interval)
        if end <= lesson_time.local_now(studio):
            continue
        if member is None or member.status != "active" or member.role != "trainer":
            conflicts.append(AssignmentConflict(row.id, row.start_time))
            continue
        if row.booking_mode == "event":
            try:
                await working_hours.assert_within_working_hours(db, studio.id,
                    start_time=start, duration_min=int((end-start).total_seconds()//60),
                    teacher_id=user_id, hall_id=row.hall_id)
                await assert_interval_free(db, studio, teacher_id=user_id, hall_id=row.hall_id,
                    start=start, end=end, exclude_lesson_id=row.id)
            except HTTPException:
                conflicts.append(AssignmentConflict(row.id, row.start_time))
            continue
        if row.service_id not in service_ids:
            conflicts.append(AssignmentConflict(row.id, row.start_time))
            continue
        intervals = []
        day = start.date()
        while day <= end.date():
            window = await resource_hours.available_intervals(
                db, studio_id=studio.id, user_id=user_id, branch_id=row.branch_id, day=day)
            intervals.extend(window.intervals)
            day += timedelta(days=1)
        fits = any(s <= start and end <= e for s, e in booking_time.merge_intervals(intervals))
        if not fits:
            conflicts.append(AssignmentConflict(row.id, row.start_time))
    return conflicts


async def assert_studio_assignments_valid(db: AsyncSession, studio: Studio) -> None:
    """Validate shared hours/timezone edits against every affected specialist."""
    if not studio.strict_schedule_enabled:
        return
    teacher_ids = (await db.execute(select(Lesson.teacher_id).where(
        Lesson.studio_id == studio.id,
        Lesson.status != "cancelled",
        Lesson.teacher_id.is_not(None),
        Lesson.start_time >= lesson_time.local_now(studio) - timedelta(days=2),
    ).distinct())).scalars().all()
    conflicts = []
    for teacher_id in teacher_ids:
        conflicts.extend(await assert_future_assignments_valid(db, studio, user_id=teacher_id))
    raise_if_conflicts(conflicts)


async def assert_catalog_entity_removable(db: AsyncSession, studio: Studio, *,
                                         branch_id: int | None = None,
                                         hall_id: int | None = None) -> None:
    """Keep Resource snapshots readable and strict future events assigned."""
    from models import Hall
    scope = Lesson.hall_id == hall_id
    if branch_id is not None:
        scope = or_(Lesson.branch_id == branch_id, Lesson.hall_id.in_(
            select(Hall.id).where(Hall.studio_id == studio.id, Hall.branch_id == branch_id)))
    protected = Lesson.booking_mode == "resource"
    if studio.strict_schedule_enabled:
        from sqlalchemy import and_
        protected = or_(protected, and_(
            Lesson.status != "cancelled",
            Lesson.start_time >= lesson_time.local_now(studio) - timedelta(days=2)))
    ids = (await db.execute(select(Lesson.id).where(
        Lesson.studio_id == studio.id, scope, protected).order_by(Lesson.id).limit(100)
    )).scalars().all()
    if ids:
        raise HTTPException(status_code=409, detail={
            "code": "CATALOG_ENTITY_IN_USE", "params": {"lesson_ids": list(ids)},
            "message": "Филиал или зал используется в записях",
        })


async def assert_service_mode_changeable(db: AsyncSession, studio: Studio, service) -> None:
    """§4.4: сменить механику услуги при живых будущих занятиях нельзя.

    Копия услуги — допустимый путь; история при этом сохраняется. Ищем сами
    занятия, а не брони: пустая группа тоже занимает специалиста, и её режим
    менять так же нельзя.
    """
    ids = (await db.execute(select(Lesson.id).where(
        Lesson.studio_id == studio.id, Lesson.service_id == service.id,
        Lesson.status != "cancelled",
        Lesson.start_time >= lesson_time.local_now(studio) - timedelta(days=2),
    ).order_by(Lesson.id).limit(100))).scalars().all()
    if ids:
        raise HTTPException(status_code=409, detail={
            "code": "SERVICE_MODE_LOCKED",
            "message": "У услуги есть будущие занятия — создайте копию с новой механикой",
            "params": {"lesson_ids": list(ids)}})


async def assert_service_removable(db: AsyncSession, studio: Studio, service_id: int) -> None:
    """Resource-история ссылается на услугу обязательным полем.

    `Lesson.service_id` объявлен `ON DELETE SET NULL`, а CHECK
    `check_lesson_resource_requires_fields` требует у resource-интервала
    непустую услугу: удаление услуги уронило бы вставку/обновление такой
    строки уже на уровне базы. Понятный 409 здесь — вместо CHECK-ошибки
    там (§6.1). Правильный путь для владельца — `is_bookable=false`.
    """
    ids = (await db.execute(select(Lesson.id).where(
        Lesson.studio_id == studio.id, Lesson.service_id == service_id,
        Lesson.booking_mode == "resource").order_by(Lesson.id).limit(100))).scalars().all()
    if ids:
        raise HTTPException(status_code=409, detail={
            "code": "SERVICE_IN_USE",
            "message": "Услуга используется индивидуальными записями — снимите её с записи вместо удаления",
            "params": {"lesson_ids": list(ids)}})


def raise_if_conflicts(conflicts: Sequence[AssignmentConflict]) -> None:
    """409 с перечнем — общий хвост для вызывающих `assert_future_assignments_valid`."""
    if not conflicts:
        return
    raise HTTPException(
        status_code=409,
        detail={
            "code": "FUTURE_ASSIGNMENT_CONFLICT",
            "message": "Изменение конфликтует с будущими записями специалиста",
            "params": {"lesson_ids": [c.lesson_id for c in conflicts]},
        },
    )
