"""Аудит наследия перед включением строгого расписания и Resource (HB-24, §6.6 п.4).

ЧИТАЕТ И ОБЪЯСНЯЕТ, НЕ ЧИНИТ. Ни один найденный факт не исправляется: угаданный
филиал, приписанная зона или молча отменённое пересечение — это порча данных
владельца под видом миграции. Отчёт называет строки, владелец решает сам.

ОДНА РЕАЛИЗАЦИЯ, ДВА ВХОДА. Тот же `collect()` вызывает и CLI
(`scripts/hybrid_booking_audit.py`), и путь включения режима под замком студии
(`routers/settings/general.py`). Отчёт, снятый минуту назад, доказательством не
считается — HB-24 п.3 требует повторить проверки в самой транзакции включения.

БЕЗ ПЕРСОНАЛЬНЫХ ДАННЫХ. В находках только ID расписания и специалистов: отчёт
уходит в логи и в поддержку, и телефон клиента там неуместен.
"""
from dataclasses import dataclass, field
from datetime import timedelta

from sqlalchemy import or_, select

from models import (Hall, Lesson, Reservation, StaffBranchAssignment, StaffWorkingHours,
                    Studio, StudioMember)
from services import booking_time, lesson_time, studio_time

# Сколько будущего проверяем. Прошлое не трогаем вовсе: включение строгого
# расписания не обязано переписывать историю, а старое пересечение уже
# состоялось и ничего не займёт заново.
HORIZON_DAYS = 400

# Находки, которые ЗАПРЕЩАЮТ включение. `overlap` намеренно не блокирует
# перевод в strict сам по себе — см. `blocking` ниже.
BLOCKING_KINDS = frozenset({
    "unknown_timezone", "invalid_duration", "invalid_resource_row",
    "undefined_branch", "missing_branch_assignment", "missing_working_hours",
    "overlap",
})


@dataclass
class Finding:
    kind: str
    lesson_id: int | None = None
    user_id: int | None = None
    branch_id: int | None = None
    details: dict = field(default_factory=dict)

    def to_json(self) -> dict:
        return {"kind": self.kind, "lesson_id": self.lesson_id, "user_id": self.user_id,
                "branch_id": self.branch_id, **self.details}


@dataclass
class Report:
    studio_id: int
    booking_mode: str
    strict_schedule_enabled: bool
    resource_lessons: int
    findings: list[Finding]

    @property
    def blocking(self) -> list[Finding]:
        return [f for f in self.findings if f.kind in BLOCKING_KINDS]

    def to_json(self) -> dict:
        return {"studio_id": self.studio_id, "booking_mode": self.booking_mode,
                "strict_schedule_enabled": self.strict_schedule_enabled,
                "resource_lessons": self.resource_lessons,
                "blocking": len(self.blocking),
                "findings": [f.to_json() for f in self.findings]}


def _window(row):
    """Окно занятия с буферами в его собственных стенных часах."""
    return (row.start_time - timedelta(minutes=row.buffer_before_min),
            row.start_time + timedelta(minutes=row.duration_min + row.buffer_after_min))


async def collect(db, studio: Studio, *, now=None) -> Report:
    """Полный отчёт по будущему расписанию студии. Ничего не пишет."""
    local_now = lesson_time.local_now(studio, now)
    rows = (await db.execute(select(Lesson).where(
        Lesson.studio_id == studio.id,
        Lesson.status != "cancelled",
        Lesson.start_time >= local_now - timedelta(days=2),
        Lesson.start_time <= local_now + timedelta(days=HORIZON_DAYS),
    ).order_by(Lesson.id))).scalars().all()
    resource_total = (await db.execute(select(Lesson.id).where(
        Lesson.studio_id == studio.id, Lesson.booking_mode == "resource"))).scalars().all()

    findings: list[Finding] = []
    if not studio_time.clock(studio).verified:
        findings.append(Finding("unknown_timezone", details={"scope": "studio"}))

    halls = dict((await db.execute(select(Hall.id, Hall.branch_id).where(
        Hall.studio_id == studio.id))).all())
    assignments = {(a.user_id, a.branch_id) for a in (await db.execute(select(
        StaffBranchAssignment).where(StaffBranchAssignment.studio_id == studio.id))).scalars().all()}
    with_hours = set((await db.execute(select(StaffWorkingHours.user_id).where(
        StaffWorkingHours.studio_id == studio.id).distinct())).scalars().all())
    members = {m.user_id: m for m in (await db.execute(select(StudioMember).where(
        StudioMember.studio_id == studio.id))).scalars().all()}

    resolved: list[tuple[Lesson, tuple]] = []
    for row in rows:
        if row.duration_min is None or row.duration_min <= 0:
            findings.append(Finding("invalid_duration", row.id,
                                    details={"duration_min": row.duration_min}))
        if row.booking_mode == "resource" and (
                row.total_spots != 1 or row.service_id is None
                or row.teacher_id is None or row.branch_id is None):
            findings.append(Finding("invalid_resource_row", row.id))
        interval = booking_time.resolve_interval(*_window(row), row.tz_iana)
        if interval is None:
            # Момент неизвестен: зона не подтверждена либо время попало в
            # дыру/повтор перевода часов. Строгую проверку занятости на таком
            # ряду построить нельзя — угадывать зону запрещено (AC-22).
            findings.append(Finding("unknown_timezone", row.id,
                                    details={"tz_iana": row.tz_iana}))
        else:
            resolved.append((row, interval))
        branch_id = row.branch_id or halls.get(row.hall_id)
        if branch_id is None:
            findings.append(Finding("undefined_branch", row.id))
        elif row.teacher_id is not None:
            if (row.teacher_id, branch_id) not in assignments:
                findings.append(Finding("missing_branch_assignment", row.id,
                                        row.teacher_id, branch_id))
            if row.teacher_id not in with_hours:
                findings.append(Finding("missing_working_hours", row.id, row.teacher_id))
            member = members.get(row.teacher_id)
            if member is None or member.status != "active" or member.role != "trainer":
                findings.append(Finding("inactive_specialist", row.id, row.teacher_id))

    # Пересечения — попарно внутри одного ресурса, по разрешённым моментам.
    # Сортировка + ранний выход держит это линейным на реальных данных вместо
    # квадрата по всему расписанию.
    for key in ("teacher_id", "hall_id"):
        buckets: dict[int, list] = {}
        for row, interval in resolved:
            value = getattr(row, key)
            if value is not None:
                buckets.setdefault(value, []).append((interval, row.id))
        for value, items in buckets.items():
            items.sort()
            for i, ((start, end), lesson_id) in enumerate(items):
                for (other_start, other_end), other_id in items[i + 1:]:
                    if other_start >= end:
                        break
                    findings.append(Finding("overlap", lesson_id, details={
                        "other_lesson_id": other_id, "resource": key}))
    return Report(studio.id, studio.booking_mode, studio.strict_schedule_enabled,
                  len(resource_total), findings)


async def has_resource_history(db, studio_id: int) -> bool:
    """Есть ли хоть один resource-интервал — включая отменённый.

    Отменённый тоже считается: у него остались Reservation, деньги и история,
    которые обязаны читаться и после отката режима (AC-05).
    """
    return (await db.execute(select(Lesson.id).where(
        Lesson.studio_id == studio_id, Lesson.booking_mode == "resource").limit(1)
    )).scalar_one_or_none() is not None


async def live_resource_bookings(db, studio_id: int) -> list[int]:
    """Незакрытые resource-брони — их нельзя бросить, выключая режим."""
    return list((await db.execute(select(Reservation.id).join(Lesson).where(
        Lesson.studio_id == studio_id, Lesson.booking_mode == "resource",
        Reservation.status.in_(("active", "pending", "hold"))).limit(100))).scalars().all())


async def assert_can_activate(db, studio: Studio, changes: dict, *, now=None) -> None:
    """Проверки §6.6 п.5/п.7 в ТОЙ ЖЕ транзакции, где меняется режим.

    Вызывать ПОСЛЕ `schedule_guard.lock_studio` и после присвоения полей — она
    смотрит на итоговое состояние студии, а не на запрос.
    """
    from fastapi import HTTPException

    wants_resource = studio.booking_mode in {"resource", "hybrid"}
    turning_strict_on = changes.get("strict_schedule_enabled") is True
    turning_strict_off = changes.get("strict_schedule_enabled") is False

    if turning_strict_off and await has_resource_history(db, studio.id):
        # Guard нельзя снять, пока такие интервалы существуют (HB-24 п.5):
        # без строгой занятости их место немедленно продадут второй раз.
        raise HTTPException(status_code=409, detail={
            "code": "RESOURCE_HISTORY_EXISTS",
            "message": "Строгое расписание нельзя выключить: в студии есть индивидуальные записи",
            "params": {}})

    if wants_resource and not studio.strict_schedule_enabled:
        raise HTTPException(status_code=409, detail={
            "code": "STRICT_SCHEDULE_REQUIRED",
            "message": "Сначала включите строгое расписание",
            "params": {}})

    if not (turning_strict_on or (wants_resource and "booking_mode" in changes)):
        return  # Ничего не включаем — аудит не нужен.

    report = await collect(db, studio, now=now)
    if report.blocking:
        raise HTTPException(status_code=409, detail={
            "code": "AUDIT_BLOCKED",
            "message": "Расписание содержит записи, несовместимые со строгим режимом",
            "params": {"findings": [f.to_json() for f in report.blocking[:50]]}})
