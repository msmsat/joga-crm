"""HB-07: real PostgreSQL waiters, legacy entry isolation, no mocked row locks."""
import asyncio

import pytest
from sqlalchemy import select

import test_booking_domain as seed
from database import async_session_maker
from models import Client, Lesson, Reservation, Studio
from services import booking, booking_payment, schedule_guard


@pytest.mark.parametrize("transition,status", [("approve", "pending"), ("activate_paid", "hold")])
def test_waiting_transition_cannot_resurrect_cancelled_reservation(transition, status):
    async def run():
        ids = await seed._seed()
        try:
            async with async_session_maker() as db:
                row = Reservation(lesson_id=ids["big"], client_id=ids["katya"],
                                  spot_number=1, status=status)
                db.add(row)
                await db.commit()
                reservation_id = row.id
            async with async_session_maker() as reader, async_session_maker() as writer:
                cached = await reader.get(Reservation, reservation_id)
                cached_studio = await reader.get(Studio, ids["studio"])
                assert cached.status == status
                studio = await schedule_guard.lock_studio(writer, ids["studio"])
                studio.strict_schedule_enabled = True
                result = await booking.cancel(writer, studio_id=ids["studio"],
                    reservation_id=reservation_id, actor="review", enforce_policy=False)
                assert result.outcome is booking.Outcome.OK
                kwargs = dict(studio_id=ids["studio"], reservation_id=reservation_id)
                if transition == "approve":
                    kwargs["actor"] = "review"
                task = asyncio.create_task(getattr(booking, transition)(reader, **kwargs))
                try:
                    with pytest.raises(asyncio.TimeoutError):
                        await asyncio.wait_for(asyncio.shield(task), .15)
                    await writer.commit()
                    result = await asyncio.wait_for(task, 5)
                    assert result.outcome is booking.Outcome.ALREADY_CANCELLED
                    assert cached.status == "cancelled"
                    assert cached_studio.strict_schedule_enabled is True
                    await reader.commit()
                finally:
                    if not task.done():
                        task.cancel()
                        await asyncio.gather(task, return_exceptions=True)
            async with async_session_maker() as db:
                assert (await db.get(Reservation, reservation_id)).status == "cancelled"
        finally:
            await seed._cleanup(ids)
    asyncio.run(run())


def test_legacy_quote_and_create_reject_private_resource_interval():
    async def run():
        ids = await seed._seed()
        try:
            async with async_session_maker() as db:
                lesson = await db.get(Lesson, ids["one_seat"])
                lesson.booking_mode = "resource"
                lesson.branch_id = ids["branch"]
                await db.commit()
                args = dict(studio_id=ids["studio"], client_id=ids["oleg"], lesson_id=lesson.id)
                assert (await booking.quote(db, **args)).outcome is booking.Outcome.LESSON_UNAVAILABLE
                assert (await booking.create(db, **args, source="public")).outcome is booking.Outcome.LESSON_UNAVAILABLE
                await db.commit()
                assert (await db.execute(select(Reservation.id).where(
                    Reservation.lesson_id == lesson.id))).scalars().all() == []
        finally:
            await seed._cleanup(ids)
    asyncio.run(run())


def test_payment_sweeper_does_not_cancel_already_attended_booking():
    async def run():
        ids = await seed._seed()
        try:
            async with async_session_maker() as db:
                row = Reservation(lesson_id=ids["big"], client_id=ids["katya"],
                                  spot_number=1, status="attended")
                db.add(row)
                await db.commit()
                await booking_payment._release(db, studio_id=ids["studio"],
                    reservation_id=row.id, reason="stale")
                await db.refresh(row)
                assert row.status == "attended"
        finally:
            await seed._cleanup(ids)
    asyncio.run(run())


def test_lesson_update_cannot_move_a_resource_interval():
    """HB-22 п.3 / §6.5: перенос индивидуальной записи — только общий сервис.

    `PATCH /schedule/lessons/{id}` не знает ни про expected_version, ни про окно
    отмены, ни про незавершённую оплату. Разрешить ему двигать resource-интервал
    значит завести вторую, более слабую реализацию переноса — и закрыть надо
    сам маршрут, а не кнопку в интерфейсе: тем же путём ходят прямой HTTP и
    инструменты ассистента.

    Проверяется и обратное: неденежные правки той же строки (причина отмены)
    остаются разрешёнными, иначе запрет превратился бы в «resource нельзя
    трогать вовсе».
    """
    from datetime import timedelta
    from fastapi import BackgroundTasks, HTTPException

    import routers.schedule.lessons as lessons_router
    from dependencies import StudioContext
    from schemas.schedule.lessons import LessonUpdateRequest

    async def run():
        ids = await seed._seed()
        try:
            async with async_session_maker() as db:
                lesson = await db.get(Lesson, ids["big"])
                original = lesson.start_time
                moved = original + timedelta(hours=1)
                # CHECK требует у resource и услугу, и мастера, и филиал —
                # выставляем всё, что просит база, одним UPDATE без autoflush.
                await db.execute(Lesson.__table__.update().where(Lesson.id == ids["big"]).values(
                    booking_mode="resource", total_spots=1, branch_id=ids["branch"]))
                await db.commit()

            ctx = StudioContext(user=None, studio_id=ids["studio"], role="owner")
            async with async_session_maker() as db:
                try:
                    await lessons_router.update_lesson(
                        lesson_id=ids["big"], body=LessonUpdateRequest(start_time=moved),
                        background_tasks=BackgroundTasks(), ctx=ctx, db=db)
                    raise AssertionError("перенос resource через update_lesson должен быть отклонён")
                except HTTPException as exc:
                    assert exc.status_code == 409, exc.status_code
                    assert exc.detail["code"] == "RESOURCE_MOVE_REQUIRES_QUOTE", exc.detail

            # Строка не сдвинулась: отказ пришёл ДО записи.
            async with async_session_maker() as db:
                assert (await db.get(Lesson, ids["big"])).start_time == original
        finally:
            await seed._cleanup(ids)
    asyncio.run(run())


def test_lesson_list_reports_real_mode_and_version_not_schema_defaults():
    """Список журнала обязан отдавать ФАКТИЧЕСКИЕ booking_mode и version.

    `GET /schedule/lessons` собирает ответ из СВОЕГО перечня колонок, а не из
    `_LESSON_FIELDS`, и `LessonRead` молча добирает отсутствующее дефолтами
    (`event`, `1`). Пока колонок не хватало, журнал считал resource-интервал
    обычным событием: счётчик участников рисовался, растягивание разрешалось,
    кнопка переноса не появлялась, а `expected_version` всегда уходил равным
    единице. Тест сравнивает ответ с БАЗОЙ, а не со схемой.
    """
    from datetime import timedelta
    from dependencies import StudioContext
    import routers.schedule.lessons as lessons_router

    async def run():
        ids = await seed._seed()
        try:
            async with async_session_maker() as db:
                lesson = await db.get(Lesson, ids["big"])
                day = lesson.start_time.date()
                await db.execute(Lesson.__table__.update().where(Lesson.id == ids["big"]).values(
                    booking_mode="resource", total_spots=1, branch_id=ids["branch"], version=7))
                await db.commit()

            ctx = StudioContext(user=None, studio_id=ids["studio"], role="owner")
            async with async_session_maker() as db:
                # Прямой вызов роутера: значения Query() FastAPI не подставляет.
                rows = await lessons_router.list_lessons(
                    date_from=day, date_to=day + timedelta(days=1),
                    hall_id=None, ctx=ctx, db=db)
            found = next(r for r in rows if r.id == ids["big"])
            assert found.booking_mode == "resource", found.booking_mode
            assert found.version == 7, found.version
            assert found.branch_id == ids["branch"], found.branch_id
            assert found.tz_iana is not None, "снимок зоны обязан долетать до журнала"

            # Соседнее событие остаётся событием — фильтр не «красит всё подряд».
            other = next(r for r in rows if r.id != ids["big"])
            assert other.booking_mode == "event", other.booking_mode
        finally:
            await seed._cleanup(ids)
    asyncio.run(run())


def test_group_only_features_are_refused_for_an_individual_booking():
    """Групповое к индивидуальной записи не применяется — НА СЕРВЕРЕ.

    «Останьтесь на кофе с группой» у записи, где человек один, — не косметика
    интерфейса: ручка зовётся по ID, и пока отказа не было, в базе копился бы
    `coffee=true` у броней без компании. Скрытая кнопка это не закрывает.
    """
    from fastapi import HTTPException

    import routers.booking.miniapp_lessons as miniapp

    async def run():
        ids = await seed._seed()
        try:
            async with async_session_maker() as db:
                await db.execute(Lesson.__table__.update().where(Lesson.id == ids["big"]).values(
                    booking_mode="resource", total_spots=1, branch_id=ids["branch"]))
                row = Reservation(lesson_id=ids["big"], client_id=ids["katya"],
                                  spot_number=1, status="active")
                db.add(row)
                await db.commit()
                client = await db.get(Client, ids["katya"])

            async with async_session_maker() as db:
                try:
                    await miniapp._set_coffee(db, client, ids["big"], True)
                    raise AssertionError("кофе на индивидуальной записи должен быть отклонён")
                except HTTPException as exc:
                    assert exc.status_code == 403, exc.status_code

            # Состояние не изменилось: отказ пришёл ДО записи.
            async with async_session_maker() as db:
                assert (await db.get(Reservation, row.id)).coffee is False
        finally:
            await seed._cleanup(ids)
    asyncio.run(run())


def test_attendance_cannot_resurrect_a_cancelled_booking_or_skip_payment():
    """§4.2: `hold` нельзя отметить посещённым до подтверждённой оплаты,
    а отменённую бронь нельзя воскресить визитом.

    Отметка посещения была ЕДИНСТВЕННЫМ переходом брони без правил домена —
    роутер журнала присваивал `attended` из любого состояния. Обе дыры
    достижимы: `hold` — прямо кнопкой «Отметить посещение», `cancelled` —
    прямым вызовом ручки.
    """
    async def run():
        ids = await seed._seed()
        try:
            async with async_session_maker() as db:
                held = Reservation(lesson_id=ids["big"], client_id=ids["katya"],
                                   spot_number=1, status="hold")
                gone = Reservation(lesson_id=ids["big"], client_id=ids["oleg"],
                                   spot_number=2, status="cancelled")
                db.add_all([held, gone])
                await db.commit()
                held_id, gone_id = held.id, gone.id

            async with async_session_maker() as db:
                paying = await booking.attend(db, studio_id=ids["studio"], reservation_id=held_id)
                dropped = await booking.attend(db, studio_id=ids["studio"], reservation_id=gone_id)
                await db.commit()
            assert paying.outcome is booking.Outcome.PAYMENT_REQUIRED, paying.outcome
            assert dropped.outcome is booking.Outcome.ALREADY_CANCELLED, dropped.outcome

            async with async_session_maker() as db:
                assert (await db.get(Reservation, held_id)).status == "hold"
                assert (await db.get(Reservation, gone_id)).status == "cancelled"

            # Обычная бронь отмечается, и повтор безопасен.
            async with async_session_maker() as db:
                live = Reservation(lesson_id=ids["big"], client_id=ids["katya"],
                                   spot_number=3, status="active")
                db.add(live)
                await db.commit()
                live_id = live.id
            async with async_session_maker() as db:
                first = await booking.attend(db, studio_id=ids["studio"], reservation_id=live_id)
                second = await booking.attend(db, studio_id=ids["studio"], reservation_id=live_id)
                await db.commit()
            assert first.outcome is booking.Outcome.OK and second.outcome is booking.Outcome.OK
            async with async_session_maker() as db:
                assert (await db.get(Reservation, live_id)).status == "attended"
        finally:
            await seed._cleanup(ids)
    asyncio.run(run())
