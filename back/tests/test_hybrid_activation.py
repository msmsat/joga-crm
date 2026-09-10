"""HB-24: аудит наследия и безопасное включение/откат режима.

Проверяется НЕ «поле сохранилось», а правила §6.6:

  * аудит находит неизвестную зону, пересечение, отсутствующий филиал и
    незаполненные назначения/часы — и ничего не исправляет сам;
  * включение strict/resource повторяет проверки в транзакции включения,
    а не доверяет отчёту, снятому раньше;
  * resource нельзя завести без strict;
  * strict нельзя снять, пока существуют resource-интервалы (HB-24 п.5);
  * откат режима в event разрешён и обслуживание существующих записей
    сохраняется (QA-26/AC-05).

Реальная БД, ручная чистка. Запуск из back/:
    python -m pytest tests/test_hybrid_activation.py -q
"""
import asyncio
import os
import time as _time
from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import delete, select

from database import async_session_maker
from models import (Client, Hall, Lesson, Reservation, Service, StaffBranchAssignment,
                    StaffWorkingHours, Studio, StudioBranch, StudioMember,
                    StudioWorkingHours, User)
from services import hybrid_audit, schedule_guard

_TAG = "TEST-HB-ACTIVATION"


def _future(hour: int, days: int = 30) -> datetime:
    return (datetime.now() + timedelta(days=days)).replace(
        hour=hour, minute=0, second=0, microsecond=0)


async def _seed(**studio_kw) -> dict:
    stamp = f"{int(_time.time() * 1000)}-{os.getpid()}"
    async with async_session_maker() as db:
        studio = Studio(name=f"{_TAG}-{stamp}", tz_iana="Europe/Prague", **studio_kw)
        db.add(studio)
        await db.flush()
        branch = StudioBranch(studio_id=studio.id, name="A")
        db.add(branch)
        await db.flush()
        hall = Hall(studio_id=studio.id, branch_id=branch.id, name="H", capacity=10)
        teacher = User(email=f"act-{stamp}@example.com", hashed_password="x", name="T")
        db.add_all([hall, teacher])
        await db.flush()
        db.add(StudioMember(user_id=teacher.id, studio_id=studio.id, role="trainer",
                            status="active", name="T", last_name="T"))
        db.add(StaffBranchAssignment(studio_id=studio.id, user_id=teacher.id, branch_id=branch.id))
        for dow in range(7):
            db.add(StudioWorkingHours(studio_id=studio.id, day_of_week=dow, is_open=True,
                                      open_time="08:00", close_time="22:00"))
            db.add(StaffWorkingHours(studio_id=studio.id, user_id=teacher.id, day_of_week=dow,
                                     is_open=True, open_time="08:00", close_time="22:00"))
        service = Service(studio_id=studio.id, name="S", price=1000, duration_min=60,
                          booking_mode="resource", service_type="individual")
        client = Client(studio_id=studio.id, name="C", phone=f"+7999{stamp[-7:]}")
        db.add_all([service, client])
        await db.commit()
        return {"studio": studio.id, "branch": branch.id, "hall": hall.id,
                "teacher": teacher.id, "service": service.id, "client": client.id}


async def _cleanup(ids: dict) -> None:
    async with async_session_maker() as db:
        lessons = list((await db.execute(delete(Lesson).where(
            Lesson.studio_id == ids["studio"]).returning(Lesson.id))).scalars().all())
        await db.execute(delete(Reservation).where(Reservation.lesson_id.in_(lessons or [0])))
        for model in (StaffBranchAssignment, StaffWorkingHours, StudioWorkingHours,
                      StudioMember, Client, Service, Hall, StudioBranch):
            await db.execute(delete(model).where(model.studio_id == ids["studio"]))
        await db.execute(delete(Studio).where(Studio.id == ids["studio"]))
        await db.execute(delete(User).where(User.id == ids["teacher"]))
        await db.commit()


def _lesson(ids, **kw):
    base = dict(studio_id=ids["studio"], name="L", teacher_name="T", teacher_id=ids["teacher"],
                branch_id=ids["branch"], hall_id=ids["hall"], tz_iana="Europe/Prague",
                duration_min=60, price=1000, level="", equipment="", total_spots=10,
                status="confirmed", booking_mode="event")
    return Lesson(**{**base, **kw})


async def _audit(ids):
    async with async_session_maker() as db:
        return await hybrid_audit.collect(db, await db.get(Studio, ids["studio"]))


async def _activate(ids, changes: dict):
    """Тот же путь, что у PATCH /settings/general: замок → присвоение → аудит."""
    async with async_session_maker() as db:
        studio = await schedule_guard.lock_studio(db, ids["studio"])
        for field, value in changes.items():
            setattr(studio, field, value)
        await db.flush()
        try:
            await hybrid_audit.assert_can_activate(db, studio, changes)
            await db.commit()
            return None
        except HTTPException as exc:
            await db.rollback()
            return exc


@pytest.fixture
def clean_studio():
    ids = asyncio.run(_seed())
    yield ids
    asyncio.run(_cleanup(ids))


def _add(ids, *rows):
    async def run():
        async with async_session_maker() as db:
            db.add_all(rows)
            await db.commit()
            return [row.id for row in rows]
    return asyncio.run(run())


def test_clean_studio_has_no_findings_and_activates(clean_studio):
    _add(clean_studio, _lesson(clean_studio, start_time=_future(10)))
    report = asyncio.run(_audit(clean_studio))
    assert report.findings == [], report.to_json()
    assert asyncio.run(_activate(clean_studio, {"strict_schedule_enabled": True})) is None


def test_audit_reports_overlap_unknown_zone_and_missing_config(clean_studio):
    ids = clean_studio
    _add(ids,
         _lesson(ids, start_time=_future(10)),
         _lesson(ids, start_time=_future(10, days=30)),                      # пересечение
         _lesson(ids, start_time=_future(14), tz_iana=None),                 # неизвестная зона
         _lesson(ids, start_time=_future(16), hall_id=None, branch_id=None))  # филиал неизвестен
    kinds = {f.kind for f in asyncio.run(_audit(ids)).findings}
    assert {"overlap", "unknown_timezone", "undefined_branch"} <= kinds
    # Ни одна строка не исправлена: отчёт объясняет, а не чинит.
    assert asyncio.run(_audit(ids)).to_json()["blocking"] > 0

    failure = asyncio.run(_activate(ids, {"strict_schedule_enabled": True}))
    assert failure is not None and failure.detail["code"] == "AUDIT_BLOCKED"

    async def unchanged():
        async with async_session_maker() as db:
            return (await db.get(Studio, ids["studio"])).strict_schedule_enabled
    assert asyncio.run(unchanged()) is False


def test_missing_assignment_and_hours_block_activation(clean_studio):
    ids = clean_studio

    async def strip():
        async with async_session_maker() as db:
            await db.execute(delete(StaffBranchAssignment).where(
                StaffBranchAssignment.studio_id == ids["studio"]))
            await db.execute(delete(StaffWorkingHours).where(
                StaffWorkingHours.studio_id == ids["studio"]))
            await db.commit()
    _add(ids, _lesson(ids, start_time=_future(10)))
    asyncio.run(strip())
    kinds = {f.kind for f in asyncio.run(_audit(ids)).findings}
    assert {"missing_branch_assignment", "missing_working_hours"} <= kinds
    assert asyncio.run(_activate(ids, {"strict_schedule_enabled": True})).detail["code"] == "AUDIT_BLOCKED"


def test_resource_requires_strict_first(clean_studio):
    failure = asyncio.run(_activate(clean_studio, {"booking_mode": "resource"}))
    assert failure.detail["code"] == "STRICT_SCHEDULE_REQUIRED"
    assert asyncio.run(_activate(clean_studio, {"strict_schedule_enabled": True})) is None
    assert asyncio.run(_activate(clean_studio, {"booking_mode": "hybrid"})) is None


def test_strict_cannot_be_removed_while_resource_history_exists(clean_studio):
    ids = clean_studio
    assert asyncio.run(_activate(ids, {"strict_schedule_enabled": True})) is None
    assert asyncio.run(_activate(ids, {"booking_mode": "resource"})) is None
    lesson_id = _add(ids, _lesson(ids, start_time=_future(11), booking_mode="resource",
                                  total_spots=1, service_id=ids["service"], hall_id=None))[0]
    _add(ids, Reservation(client_id=ids["client"], lesson_id=lesson_id, spot_number=1, status="active"))

    failure = asyncio.run(_activate(ids, {"strict_schedule_enabled": False}))
    assert failure.detail["code"] == "RESOURCE_HISTORY_EXISTS"

    # QA-26: сам режим откатить можно — новые resource-записи закрываются,
    # обслуживание существующей брони остаётся.
    assert asyncio.run(_activate(ids, {"booking_mode": "event"})) is None
    async def still_live():
        async with async_session_maker() as db:
            return await hybrid_audit.live_resource_bookings(db, ids["studio"])
    assert asyncio.run(still_live()) != []


def test_audit_cli_is_read_only_and_reports_by_exit_code(clean_studio, capsys):
    """Скрипт HB-24: обязателен --studio-id, вывод без контактов, ничего не пишет."""
    from scripts import hybrid_booking_audit as cli

    ids = clean_studio
    _add(ids, _lesson(ids, start_time=_future(10)))
    assert cli.main(["--studio-id", str(ids["studio"])]) == 0

    _add(ids, _lesson(ids, start_time=_future(10)))  # пересечение с первым
    assert cli.main(["--studio-id", str(ids["studio"]), "--json"]) == 1
    printed = capsys.readouterr().out
    assert "overlap" in printed
    # Ни клиента, ни телефона в отчёте быть не должно.
    assert "+7999" not in printed and '"phone"' not in printed

    async def untouched():
        async with async_session_maker() as db:
            studio = await db.get(Studio, ids["studio"])
            rows = list((await db.execute(delete(Lesson).where(Lesson.id < 0).returning(Lesson.id))).all())
            return studio.strict_schedule_enabled, studio.booking_mode, rows
    assert asyncio.run(untouched()) == (False, "event", [])

    with pytest.raises(SystemExit):
        cli.main([])


def test_saving_a_profile_without_branch_ids_keeps_existing_assignments(clean_studio):
    """Ревью HB-00…06, п.2: отсутствие поля ≠ пустой список — НА РОУТЕРЕ.

    Старый экран сотрудников не знает про `branch_ids`. Если сохранение
    карточки трактует отсутствие поля как «стереть все назначения», обычная
    правка имени молча лишает специалиста Resource-доступности во всех филиалах.

    Проверяется сам путь сохранения, а не значение по умолчанию у Pydantic:
    схема отдаёт `[]` в обоих случаях, и различает их только `model_fields_set`
    внутри `update_staff`. Тест на схеме прошёл бы и после удаления этой ветки.
    """
    from dependencies import StudioContext
    from routers.staff.profiles import update_staff
    from schemas.settings.team import StaffUpdate

    ids = clean_studio
    ctx = StudioContext(user=None, studio_id=ids["studio"], role="owner")

    async def assignments():
        async with async_session_maker() as db:
            return sorted((await db.execute(select(StaffBranchAssignment.branch_id).where(
                StaffBranchAssignment.studio_id == ids["studio"]))).scalars().all())

    async def save(**extra):
        async with async_session_maker() as db:
            user = await db.get(User, ids["teacher"])
            body = StaffUpdate(name="T", last_name="T", email=user.email, **extra)
            await update_staff(staff_id=ids["teacher"], data=body, ctx=ctx, db=db)

    assert asyncio.run(assignments()) == [ids["branch"]]

    # Поля нет вовсе — назначения обязаны уцелеть.
    asyncio.run(save())
    assert asyncio.run(assignments()) == [ids["branch"]], "сохранение без branch_ids стёрло назначения"

    # Явный список — применяется как есть.
    asyncio.run(save(branch_ids=[ids["branch"]]))
    assert asyncio.run(assignments()) == [ids["branch"]]

    # Явный ПУСТОЙ список — это осознанное «нигде не доступен», и он стирает.
    asyncio.run(save(branch_ids=[]))
    assert asyncio.run(assignments()) == [], "явный пустой список обязан снимать назначения"


def test_service_used_by_resource_cannot_be_deleted_or_switched(clean_studio):
    ids = clean_studio
    _add(ids, _lesson(ids, start_time=_future(11), booking_mode="resource", total_spots=1,
                      service_id=ids["service"], hall_id=None))

    async def run():
        async with async_session_maker() as db:
            studio = await db.get(Studio, ids["studio"])
            service = await db.get(Service, ids["service"])
            out = []
            for check in (lambda: schedule_guard.assert_service_removable(db, studio, service.id),
                          lambda: schedule_guard.assert_service_mode_changeable(db, studio, service)):
                try:
                    await check()
                    out.append(None)
                except HTTPException as exc:
                    out.append(exc.detail["code"])
            return out
    assert asyncio.run(run()) == ["SERVICE_IN_USE", "SERVICE_MODE_LOCKED"]
