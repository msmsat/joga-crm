"""HB-02 — совместимые поля и таблицы гибридной записи существуют и работают.

Проверяет ровно то, что обещает миграция `6cdd4f27a359` и модели
`models/studio.py`, `models/service.py`, `models/schedule.py`, `models/staff.py`,
`models/booking_quote.py` (docs/EPIC_HYBRID_BOOKING_IMPLEMENTATION.md §6.1):

  * у Studio/Service/Lesson новые поля есть и по умолчанию — `event`/`generic`;
  * CHECK-ограничения реально отклоняют мусор на НОВОЙ записи (а не только
    существуют в DDL): недопустимый `booking_mode`, буфер вне диапазона,
    resource без обязательных полей, неположительная длительность;
  * `StaffBranchAssignment` не даёт задвоить назначение сотрудника на филиал;
  * `StaffBusyInterval` не даёт интервал с концом раньше начала;
  * `BookingQuote` пишется и читается с канонической JSON-структурой условий.

Совместимость старых данных (бэкофилл `branch_id` только по `Hall.branch_id`,
сохранение статусов/ID при апгрейде схемы) проверена ОТДЕЛЬНО, реальным
`alembic upgrade` со снимка предыдущей головы (`7628ffa12be3`) на изолированной
scratch-БД — это разовая ручная проверка HB-02, а не автотест: пересоздавать
всю историю миграций в каждом прогоне pytest избыточно, а `create_all` пустой
базы, как отдельно оговорено в задаче, ничего не доказывает про апгрейд.
Результат зафиксирован в docs/HYBRID_BOOKING_PROGRESS.md (HB-02).

Реальная БД, ручная чистка. Запуск из back/:
    python -m pytest tests/test_hybrid_schema.py -q
"""
import asyncio
import os
import time as _time
import warnings
from datetime import date, datetime, time, timedelta, timezone

warnings.filterwarnings("ignore")

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError

from database import async_session_maker
from models import (
    BookingQuote, Client, Hall, Lesson, Service, Studio, StudioBranch,
    StudioMember, StaffBranchAssignment, StaffBusyInterval, User,
)

_TAG = "TEST-HYBRID-SCHEMA"
TOMORROW = date.today() + timedelta(days=1)


async def _seed() -> dict:
    stamp = f"{int(_time.time())}-{os.getpid()}"
    async with async_session_maker() as db:
        studio = Studio(name=f"{_TAG}-{stamp}")
        db.add(studio)
        await db.flush()
        branch = StudioBranch(studio_id=studio.id, name="Branch")
        db.add(branch)
        await db.flush()
        hall = Hall(studio_id=studio.id, branch_id=branch.id, name="Hall", capacity=5)
        teacher = User(email=f"hs-{stamp}@test.local", hashed_password="x", name="T")
        db.add_all([hall, teacher])
        await db.flush()
        db.add(StudioMember(user_id=teacher.id, studio_id=studio.id, role="trainer",
                            status="active", name="T", last_name="T"))
        client = Client(studio_id=studio.id, name="Client")
        db.add(client)
        await db.flush()
        ids = {"studio": studio.id, "branch": branch.id, "hall": hall.id,
               "teacher": teacher.id, "client": client.id}
        await db.commit()
    return ids


async def _cleanup(ids: dict) -> None:
    async with async_session_maker() as db:
        await db.execute(delete(BookingQuote).where(BookingQuote.studio_id == ids["studio"]))
        await db.execute(delete(StaffBusyInterval).where(StaffBusyInterval.studio_id == ids["studio"]))
        await db.execute(delete(StaffBranchAssignment).where(StaffBranchAssignment.studio_id == ids["studio"]))
        await db.execute(delete(Lesson).where(Lesson.studio_id == ids["studio"]))
        await db.execute(delete(Service).where(Service.studio_id == ids["studio"]))
        await db.execute(delete(Client).where(Client.studio_id == ids["studio"]))
        await db.execute(delete(StudioMember).where(StudioMember.studio_id == ids["studio"]))
        await db.execute(delete(Hall).where(Hall.studio_id == ids["studio"]))
        await db.execute(delete(StudioBranch).where(StudioBranch.studio_id == ids["studio"]))
        await db.execute(delete(Studio).where(Studio.id == ids["studio"]))
        await db.execute(delete(User).where(User.id == ids["teacher"]))
        await db.commit()


async def _rejects(coro) -> bool:
    """True, если создание строки упало на CHECK/UNIQUE (а не по другой причине)."""
    async with async_session_maker() as db:
        try:
            await coro(db)
            await db.commit()
            return False
        except IntegrityError:
            await db.rollback()
            return True


# ─── Дефолты: старая студия/услуга/занятие остаются event ────────────────────

async def _defaults_are_event(ids):
    async with async_session_maker() as db:
        studio = await db.get(Studio, ids["studio"])
        assert studio.booking_mode == "event"
        assert studio.terminology_profile == "generic"
        assert studio.booking_config_version == 1
        assert studio.strict_schedule_enabled is False

        service = Service(studio_id=ids["studio"], name="Стретчинг", price=500, duration_min=60)
        db.add(service)
        await db.flush()
        assert service.booking_mode == "event"
        assert service.buffer_before_min == 0
        assert service.buffer_after_min == 0
        assert service.is_bookable is True

        lesson = Lesson(studio_id=ids["studio"], name="L", teacher_name="T",
                        teacher_id=ids["teacher"], hall_id=ids["hall"],
                        start_time=datetime.combine(TOMORROW, time(10, 0)),
                        duration_min=60, price=0, level="", equipment="",
                        total_spots=8, status="confirmed")
        db.add(lesson)
        await db.flush()
        assert lesson.booking_mode == "event"
        assert lesson.buffer_before_min == 0 and lesson.buffer_after_min == 0
        assert lesson.version == 1
        assert lesson.branch_id is None, (
            "модель не подставляет branch_id сама — это делает только миграция "
            "по Hall.branch_id (HB-02 п.2); ORM-дефолт остаётся NULL")
        await db.rollback()


# ─── CHECK: booking_mode, буферы, resource ⇒ обязательные поля ───────────────

async def _service_booking_mode_rejected(ids):
    async def make(db):
        db.add(Service(studio_id=ids["studio"], name="X", price=100, duration_min=60,
                       booking_mode="bogus"))
        await db.flush()
    assert await _rejects(make)


async def _service_buffer_range_rejected(ids):
    async def make(db):
        db.add(Service(studio_id=ids["studio"], name="X", price=100, duration_min=60,
                       buffer_before_min=999))
        await db.flush()
    assert await _rejects(make)


async def _service_resource_duration_range_rejected(ids):
    async def make(db):
        db.add(Service(studio_id=ids["studio"], name="X", price=100, duration_min=2000,
                       booking_mode="resource"))
        await db.flush()
    assert await _rejects(make)
    # тот же диапазон для event НЕ действует.
    async with async_session_maker() as db:
        db.add(Service(studio_id=ids["studio"], name="X", price=100, duration_min=2000,
                       booking_mode="event"))
        await db.flush()
        await db.rollback()


async def _lesson_duration_positive_rejected(ids):
    async def make(db):
        db.add(Lesson(studio_id=ids["studio"], name="X", teacher_name="T",
                      start_time=datetime.combine(TOMORROW, time(11, 0)),
                      duration_min=0, price=0, level="", equipment="",
                      total_spots=8, status="confirmed"))
        await db.flush()
    assert await _rejects(make)


async def _lesson_resource_requires_fields(ids):
    # resource без branch/tz/teacher — отклонён.
    async def missing(db):
        db.add(Lesson(studio_id=ids["studio"], name="X", teacher_name="T",
                      start_time=datetime.combine(TOMORROW, time(12, 0)),
                      duration_min=60, price=100, level="", equipment="",
                      total_spots=1, status="confirmed", booking_mode="resource"))
        await db.flush()
    assert await _rejects(missing)

    # resource со всеми полями (включая service_id) и capacity=1 — принят.
    async with async_session_maker() as db:
        service = Service(studio_id=ids["studio"], name="Resource svc", price=100,
                          duration_min=60, booking_mode="resource")
        db.add(service)
        await db.flush()
        lesson = Lesson(studio_id=ids["studio"], name="X", teacher_name="T",
                        teacher_id=ids["teacher"], hall_id=ids["hall"],
                        branch_id=ids["branch"], tz_iana="Europe/Prague",
                        service_id=service.id,
                        start_time=datetime.combine(TOMORROW, time(12, 0)),
                        duration_min=60, price=100, level="", equipment="",
                        total_spots=1, status="confirmed", booking_mode="resource")
        db.add(lesson)
        await db.flush()
        assert lesson.id is not None
        await db.rollback()

    # event с capacity=1 (старый individual-as-event) НЕ требует этих полей.
    async with async_session_maker() as db:
        lesson = Lesson(studio_id=ids["studio"], name="X", teacher_name="T",
                        teacher_id=ids["teacher"],
                        start_time=datetime.combine(TOMORROW, time(13, 0)),
                        duration_min=60, price=100, level="", equipment="",
                        total_spots=1, status="confirmed", booking_mode="event")
        db.add(lesson)
        await db.flush()
        assert lesson.id is not None
        await db.rollback()


# ─── StaffBranchAssignment: уникальность тройки ──────────────────────────────

async def _staff_branch_assignment_unique(ids):
    async with async_session_maker() as db:
        db.add(StaffBranchAssignment(studio_id=ids["studio"], user_id=ids["teacher"],
                                     branch_id=ids["branch"]))
        await db.commit()

    async def dup(db):
        db.add(StaffBranchAssignment(studio_id=ids["studio"], user_id=ids["teacher"],
                                     branch_id=ids["branch"]))
        await db.flush()
    assert await _rejects(dup)


# ─── StaffBusyInterval: конец обязан быть после начала ───────────────────────

async def _staff_busy_interval_range(ids):
    async def backwards(db):
        db.add(StaffBusyInterval(
            studio_id=ids["studio"], user_id=ids["teacher"],
            start_time=datetime.combine(TOMORROW, time(10, 0)),
            end_time=datetime.combine(TOMORROW, time(9, 0)),
        ))
        await db.flush()
    assert await _rejects(backwards)

    async with async_session_maker() as db:
        interval = StaffBusyInterval(
            studio_id=ids["studio"], user_id=ids["teacher"],
            start_time=datetime.combine(TOMORROW, time(9, 0)),
            end_time=datetime.combine(TOMORROW, time(10, 0)),
            tz_iana="Europe/Prague", reason="перерыв",
        )
        db.add(interval)
        await db.commit()
        assert interval.id is not None


# ─── BookingQuote: пишется и читается целиком ────────────────────────────────

async def _booking_quote_roundtrip(ids):
    now = datetime.now(timezone.utc)
    async with async_session_maker() as db:
        quote = BookingQuote(
            studio_id=ids["studio"], client_id=ids["client"], actor_user_id=None,
            surface="miniapp", booking_mode="resource", terms={"lesson_id": None, "price": 1000},
            created_at=now, expires_at=now + timedelta(minutes=5),
        )
        db.add(quote)
        await db.commit()
        quote_id = quote.id

    assert quote_id is not None and len(quote_id) == 36, "id обязан быть uuid4-строкой"

    async with async_session_maker() as db:
        loaded = await db.get(BookingQuote, quote_id)
        assert loaded is not None
        assert loaded.terms == {"lesson_id": None, "price": 1000}
        assert loaded.reservation_id is None and loaded.consumed_at is None
        assert loaded.payload_version == 1


def test_hybrid_schema_against_the_database():
    async def run():
        ids = await _seed()
        try:
            await _defaults_are_event(ids)
            await _service_booking_mode_rejected(ids)
            await _service_buffer_range_rejected(ids)
            await _service_resource_duration_range_rejected(ids)
            await _lesson_duration_positive_rejected(ids)
            await _lesson_resource_requires_fields(ids)
            await _staff_branch_assignment_unique(ids)
            await _staff_busy_interval_range(ids)
            await _booking_quote_roundtrip(ids)
        finally:
            await _cleanup(ids)

    asyncio.run(run())


if __name__ == "__main__":
    test_hybrid_schema_against_the_database()
