"""HB-06 — `services/schedule_guard`: единый замок и транзакционная защита
занятости (docs/EPIC_HYBRID_BOOKING_IMPLEMENTATION.md §6.2).

ГЛАВНОЕ ОБЕЩАНИЕ КАРТОЧКИ: "конкурентные PostgreSQL-тесты используют отдельные
сессии и синхронизированный старт; две конфликтующие команды не проходят.
Нельзя заменить их моками `_find_schedule_conflict`". Ниже — РЕАЛЬНАЯ база,
ДВЕ независимые сессии (`async_session_maker()` дважды), `asyncio.gather` для
одновременного старта — то же самое устройство, что у
`test_booking_domain.py::_last_seat`.

Сценарии:
  1. `lock_studio` реально СЕРИАЛИЗУЕТ — второй запрос ждёт commit/rollback
     первого, а не проходит мимо.
  2. При `strict_schedule_enabled=True` два одновременных `create_lesson` на
     ОДНОГО тренера с пересекающимся временем — ровно один успех, второй
     получает 409 (`assert_interval_free`), и в базе остаётся ровно одно
     неотменённое занятие этого тренера на этот интервал.
  3. При `strict_schedule_enabled=False` (умолчание — легаси-поведение НЕ
     меняется) те же два запроса ОБА проходят: конфликт не проверяется
     транзакционно, только постфактум-уведомление (§1.2), как было.
  4. `assert_interval_free` отклоняет пересечение по ЗАЛУ так же, как по
     тренеру, и не срабатывает на самой редактируемой записи (exclude_lesson_id).

Запуск из back/:  python -m pytest tests/test_schedule_guard.py -q
"""
import asyncio
import os
import time as _time
import warnings
from datetime import datetime, timedelta

warnings.filterwarnings("ignore")

from fastapi import HTTPException
from sqlalchemy import delete, select

from database import async_session_maker
from dependencies import StudioContext
from models import Hall, Lesson, Service, Studio, StudioBranch, StudioMember, User
from schemas.schedule.lessons import LessonCreateRequest
from services import schedule_guard
import routers.schedule.lessons as lessons_router

_TAG = "TEST-SCHEDULE-GUARD"
TOMORROW = datetime.now() + timedelta(days=1)


async def _seed(*, strict: bool) -> dict:
    stamp = f"{int(_time.time())}-{os.getpid()}"
    async with async_session_maker() as db:
        studio = Studio(name=f"{_TAG}-{stamp}", tz_iana="Europe/Prague", currency="CZK",
                        strict_schedule_enabled=strict)
        db.add(studio)
        await db.flush()
        branch = StudioBranch(studio_id=studio.id, name="Branch")
        db.add(branch)
        await db.flush()
        hall = Hall(studio_id=studio.id, branch_id=branch.id, name="Hall", capacity=10)
        teacher = User(email=f"sg-{stamp}@test.local", hashed_password="x", name="T")
        db.add_all([hall, teacher])
        await db.flush()
        db.add(StudioMember(user_id=teacher.id, studio_id=studio.id, role="trainer",
                            status="active", name="T", last_name="T"))
        service = Service(studio_id=studio.id, name="Йога", price=500, duration_min=60)
        db.add(service)
        await db.commit()
        ids = {"studio": studio.id, "branch": branch.id, "hall": hall.id,
               "teacher": teacher.id, "service": service.id}
    return ids


async def _cleanup(ids: dict) -> None:
    async with async_session_maker() as db:
        await db.execute(delete(Lesson).where(Lesson.studio_id == ids["studio"]))
        await db.execute(delete(Service).where(Service.studio_id == ids["studio"]))
        await db.execute(delete(Hall).where(Hall.studio_id == ids["studio"]))
        await db.execute(delete(StudioMember).where(StudioMember.studio_id == ids["studio"]))
        await db.execute(delete(StudioBranch).where(StudioBranch.studio_id == ids["studio"]))
        await db.execute(delete(Studio).where(Studio.id == ids["studio"]))
        await db.execute(delete(User).where(User.id == ids["teacher"]))
        await db.commit()


def _create_body(ids, start, **kw) -> LessonCreateRequest:
    return LessonCreateRequest(
        service_id=ids["service"], teacher_id=ids["teacher"], hall_id=kw.get("hall_id", ids["hall"]),
        start_time=start, duration_min=kw.get("duration_min", 60), total_spots=8,
    )


def _ctx(ids) -> StudioContext:
    return StudioContext(user=None, studio_id=ids["studio"], role="owner")


async def _create(ids, start, **kw):
    """Один create_lesson в СВОЕЙ сессии — как отдельный HTTP-запрос в бою."""
    async with async_session_maker() as db:
        try:
            result = await lessons_router.create_lesson(
                _create_body(ids, start, **kw), _ctx(ids), db, background_tasks=None)
            return ("ok", result)
        except HTTPException as exc:
            return ("error", exc)


# ─── 1. lock_studio реально сериализует ──────────────────────────────────────

async def _lock_serializes(ids):
    events: list[str] = []
    a_locked = asyncio.Event()  # A сигналит РОВНО момент захвата — без угадывания таймингом

    async def holder():
        async with async_session_maker() as db:
            await schedule_guard.lock_studio(db, ids["studio"])
            events.append("A-locked")
            a_locked.set()
            await asyncio.sleep(0.4)  # держим замок — второй обязан ждать здесь
            events.append("A-commit")
            await db.commit()

    async def waiter():
        await a_locked.wait()  # ждём ПОДТВЕРЖДЁННОГО захвата, не фиксированную паузу
        async with async_session_maker() as db:
            before = _time.monotonic()
            await schedule_guard.lock_studio(db, ids["studio"])
            waited = _time.monotonic() - before
            events.append("B-locked")
            await db.rollback()
            return waited

    _, waited = await asyncio.gather(holder(), waiter())
    # B ждал СТРОГО после того, как A подтверждённо держал замок — раз он всё
    # равно провёл в lock_studio заметное время, значит реально стоял в очереди
    # у Postgres, а не получил строку сразу же.
    assert waited > 0.2, f"lock_studio не заблокировал второго: ждал {waited:.3f}с"
    assert events == ["A-locked", "A-commit", "B-locked"], events


# ─── 2/3. Два конфликтующих create_lesson на одного тренера ─────────────────

async def _concurrent_conflict(ids, *, strict: bool):
    start = TOMORROW.replace(minute=0, second=0, microsecond=0)
    (outcome_a, res_a), (outcome_b, res_b) = await asyncio.gather(
        _create(ids, start),
        _create(ids, start + timedelta(minutes=30)),  # пересекается с первым (60 мин)
    )
    outcomes = [outcome_a, outcome_b]

    async with async_session_maker() as db:
        live = (await db.execute(
            select(Lesson).where(
                Lesson.studio_id == ids["studio"], Lesson.teacher_id == ids["teacher"],
                Lesson.status != "cancelled",
            )
        )).scalars().all()

    if strict:
        assert outcomes.count("ok") == 1, (outcome_a, res_a, outcome_b, res_b)
        assert outcomes.count("error") == 1
        err = res_a if outcome_a == "error" else res_b
        assert err.status_code == 409, err.status_code
        assert len(live) == 1, "strict обязан оставить ровно одно занятие тренера"
    else:
        # Легаси: транзакционной защиты нет, обе команды проходят — конфликт
        # остаётся только постфактум-уведомлением (§1.2), это НЕ регрессия.
        assert outcomes == ["ok", "ok"], (outcome_a, res_a, outcome_b, res_b)
        assert len(live) == 2, "legacy-поведение не должно было измениться"


# ─── 4. assert_interval_free: зал, и exclude_lesson_id не бьёт сам по себе ───

async def _assert_interval_free_unit(ids):
    async with async_session_maker() as db:
        studio = await db.get(Studio, ids["studio"])
        lesson = Lesson(
            studio_id=ids["studio"], name="X", teacher_name="T", teacher_id=ids["teacher"],
            hall_id=ids["hall"], branch_id=ids["branch"], service_id=ids["service"],
            tz_iana="Europe/Prague", start_time=TOMORROW.replace(microsecond=0),
            duration_min=60, price=500, level="", equipment="", total_spots=8,
            status="confirmed",
        )
        db.add(lesson)
        await db.commit()
        lesson_id = lesson.id

    try:
        async with async_session_maker() as db:
            studio = await db.get(Studio, ids["studio"])
            # Пересечение по ДРУГОМУ тренеру, но ТОМУ ЖЕ залу — тоже конфликт.
            try:
                await schedule_guard.assert_interval_free(
                    db, studio, teacher_id=None, hall_id=ids["hall"],
                    start=TOMORROW + timedelta(minutes=30),
                    end=TOMORROW + timedelta(minutes=90),
                )
                raise AssertionError("пересечение по залу должно быть отклонено")
            except HTTPException as exc:
                assert exc.status_code == 409

        async with async_session_maker() as db:
            studio = await db.get(Studio, ids["studio"])
            # Та же запись, exclude_lesson_id=её id — сама себе не конфликт.
            await schedule_guard.assert_interval_free(
                db, studio, teacher_id=ids["teacher"], hall_id=ids["hall"],
                start=TOMORROW.replace(microsecond=0),
                end=TOMORROW.replace(microsecond=0) + timedelta(minutes=60),
                exclude_lesson_id=lesson_id,
            )
    finally:
        async with async_session_maker() as db:
            await db.execute(delete(Lesson).where(Lesson.id == lesson_id))
            await db.commit()


def test_lock_studio_serializes_concurrent_transactions():
    async def run():
        ids = await _seed(strict=False)
        try:
            await _lock_serializes(ids)
        finally:
            await _cleanup(ids)
    asyncio.run(run())


def test_strict_rejects_concurrent_conflicting_create():
    async def run():
        ids = await _seed(strict=True)
        try:
            await _concurrent_conflict(ids, strict=True)
        finally:
            await _cleanup(ids)
    asyncio.run(run())


def test_legacy_still_allows_concurrent_conflicting_create():
    async def run():
        ids = await _seed(strict=False)
        try:
            await _concurrent_conflict(ids, strict=False)
        finally:
            await _cleanup(ids)
    asyncio.run(run())


def test_assert_interval_free_hall_and_self_exclusion():
    async def run():
        ids = await _seed(strict=True)
        try:
            await _assert_interval_free_unit(ids)
        finally:
            await _cleanup(ids)
    asyncio.run(run())


if __name__ == "__main__":
    test_lock_studio_serializes_concurrent_transactions()
    test_strict_rejects_concurrent_conflicting_create()
    test_legacy_still_allows_concurrent_conflicting_create()
    test_assert_interval_free_hall_and_self_exclusion()
    print("ALL PASS")
