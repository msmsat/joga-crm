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
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Lesson, Studio
from services import lesson_time, resource_hours, studio_time


async def lock_studio(db: AsyncSession, studio_id: int) -> Studio:
    """`SELECT studios FOR UPDATE` — держит строку до commit/rollback
    вызывающего. 404, если студии нет (тот же ответ, что у любого чужого id
    в проекте — не подсказывать существование чужой строки)."""
    studio = (await db.execute(
        select(Studio).where(Studio.id == studio_id).with_for_update()
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

    new_start = _instant_or_none(start - timedelta(minutes=buffer_before_min), studio)
    new_end = _instant_or_none(end + timedelta(minutes=buffer_after_min), studio)
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

    stmt = select(Lesson).where(
        Lesson.studio_id == studio.id,
        Lesson.status != "cancelled",
        or_(*conditions),
    )
    if exclude_lesson_id is not None:
        stmt = stmt.where(Lesson.id != exclude_lesson_id)

    for other in (await db.execute(stmt)).scalars().all():
        when = lesson_time.resolve(other, studio)
        if when.instant is None:
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
        Lesson.booking_mode == "resource",
        Lesson.status != "cancelled",
        Lesson.start_time >= lesson_time.local_now(studio),
    ]
    if branch_id is not None:
        conditions.append(Lesson.branch_id == branch_id)
    rows = (await db.execute(select(Lesson).where(*conditions))).scalars().all()
    if not rows:
        return []

    conflicts: list[AssignmentConflict] = []
    for row in rows:
        window = await resource_hours.available_intervals(
            db, studio_id=studio.id, user_id=user_id, branch_id=row.branch_id,
            day=row.start_time.date(),
        )
        start, end = row.start_time, row.start_time + timedelta(minutes=row.duration_min)
        fits = any(s <= start and end <= e for s, e in window.intervals)
        if not fits:
            conflicts.append(AssignmentConflict(row.id, row.start_time))
    return conflicts


def raise_if_conflicts(conflicts: Sequence[AssignmentConflict]) -> None:
    """409 с перечнем — общий хвост для вызывающих `assert_future_assignments_valid`."""
    if not conflicts:
        return
    raise HTTPException(
        status_code=409,
        detail={
            "code": "FUTURE_ASSIGNMENT_CONFLICT",
            "message": "Изменение конфликтует с будущими resource-записями специалиста",
            "params": {"lesson_ids": [c.lesson_id for c in conflicts]},
        },
    )
