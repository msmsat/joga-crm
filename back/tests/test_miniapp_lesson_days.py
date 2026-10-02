"""Сводка расписания по дням для ленты мастера записи (`/global/lessons/days`).

Лента дней на главной мини-приложения отмечает дни, в которых есть куда
записаться. Проверяется ровно то, что эту отметку делает честной:

  1. день попадает в ответ, только если в нём есть занятие, на которое можно
     записаться: полное и отменённое — нет;
  2. своя бронь считается и на полном занятии — у неё отмена или второй
     коврик, и гость этого дня не видит, а записанный видит;
  3. фильтр филиала сужает выборку;
  4. диапазон проверяется: перевёрнутый и слишком широкий — 422;
  5. всё одной операцией — число запросов к БД не растёт с числом дней.

Реальная БД (как и остальные тесты витрины): студия создаётся и удаляется.

Запуск из back/:  python -m tests.test_miniapp_lesson_days
"""
import asyncio
import importlib
import warnings

warnings.filterwarnings("ignore")

from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import delete, event

from database import async_session_maker, engine
from models import Client, Lesson, Reservation, Studio, StudioBranch

MA = importlib.import_module("routers.booking.miniapp")
ML = importlib.import_module("routers.booking.miniapp_lessons")


def _lesson(studio_id: int, start: datetime, **over) -> Lesson:
    fields = dict(
        studio_id=studio_id, name="Pilates", teacher_name="Olena", start_time=start,
        duration_min=60, price=500, level="all", equipment="mat", total_spots=8, status="confirmed",
    )
    fields.update(over)
    return Lesson(**fields)


async def _run():
    async with async_session_maker() as db:
        studio = Studio(name="TEST-MINIAPP-LESSON-DAYS", currency="CZK")
        db.add(studio)
        await db.flush()
        branch_a = StudioBranch(studio_id=studio.id, name="A")
        branch_b = StudioBranch(studio_id=studio.id, name="B")
        db.add_all([branch_a, branch_b])
        await db.flush()

        # Завтра и послезавтра днём: внутри окна записи и часов виджета любых правил.
        tomorrow = (datetime.now() + timedelta(days=1)).replace(hour=12, minute=0, second=0, microsecond=0)
        after = tomorrow + timedelta(days=1)
        third = tomorrow + timedelta(days=2)

        open_noon = _lesson(studio.id, tomorrow, branch_id=branch_a.id)
        twin_noon = _lesson(studio.id, tomorrow, branch_id=branch_b.id)
        full_evening = _lesson(studio.id, tomorrow.replace(hour=18), total_spots=1, branch_id=branch_a.id)
        cancelled = _lesson(studio.id, after, status="cancelled", branch_id=branch_a.id)
        only_b = _lesson(studio.id, third.replace(hour=10), branch_id=branch_b.id)
        guest_client = Client(studio_id=studio.id, name="Other", is_active=True)
        me = Client(studio_id=studio.id, name="Katya", is_active=True)
        db.add_all([open_noon, twin_noon, full_evening, cancelled, only_b, guest_client, me])
        await db.flush()
        # Единственный коврик вечернего занятия — мой.
        db.add(Reservation(client_id=me.id, lesson_id=full_evening.id, spot_number=1, status="active"))
        await db.flush()

        try:
            guest = await MA.get_viewer(studio_id=studio.id, token=None, db=db)
            span = (tomorrow.date(), third.date())

            # 1. Полное и отменённое не отмечают день; одинаковое время — одной отметкой.
            days = await ML.lessons_days(*span, guest, db)
            assert [(d.day, d.times) for d in days] == [
                (tomorrow.date(), ["12:00"]),
                (third.date(), ["10:00"]),
            ], days

            # 2. Своя бронь на полном занятии — в отметке дня.
            mine = await ML.lessons_days(*span, MA.Viewer(me, studio.id), db)
            assert mine[0].times == ["12:00", "18:00"], mine[0].times

            # 3. Филиал сужает: в «B» нет вечера и есть третий день.
            in_b = await ML.lessons_days(*span, guest, db, branch_id=[branch_b.id])
            assert [(d.day, d.times) for d in in_b] == [
                (tomorrow.date(), ["12:00"]),
                (third.date(), ["10:00"]),
            ], in_b
            in_a = await ML.lessons_days(*span, guest, db, branch_id=[branch_a.id])
            assert [d.day for d in in_a] == [tomorrow.date()], in_a

            # 4. Диапазон: перевёрнутый и шире потолка — 422.
            for bad in ((third.date(), tomorrow.date()),
                        (tomorrow.date(), tomorrow.date() + timedelta(days=ML.DAYS_LIMIT))):
                try:
                    await ML.lessons_days(*bad, guest, db)
                    raise AssertionError(f"диапазон {bad} обязан дать 422")
                except HTTPException as e:
                    assert e.status_code == 422, e.status_code

            # 5. Одна операция над диапазоном: запросов столько же на 3 дня, сколько на 60.
            statements: list[str] = []

            def count(*_args):
                statements.append("x")

            event.listen(engine.sync_engine, "before_cursor_execute", count)
            try:
                await ML.lessons_days(*span, guest, db)
                short = len(statements)
                statements.clear()
                await ML.lessons_days(tomorrow.date(), tomorrow.date() + timedelta(days=ML.DAYS_LIMIT - 1), guest, db)
                assert len(statements) == short, (short, len(statements))
            finally:
                event.remove(engine.sync_engine, "before_cursor_execute", count)
        finally:
            # Core-DELETE: ON DELETE CASCADE сносит занятия, клиентов, брони и филиалы.
            await db.execute(delete(Studio).where(Studio.id == studio.id))
            await db.commit()


def test_lesson_days_marks_only_bookable_days():
    asyncio.run(_run())


if __name__ == "__main__":
    test_lesson_days_marks_only_bookable_days()
    print("ALL PASS — лента дней отмечает только дни, куда можно записаться")
