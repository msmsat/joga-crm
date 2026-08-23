"""Заполняемость тренера (load_percent) — регрессия на умножение строк.

Загрузка = занятые места / все места по будущим занятиям окна в 4 недели.
Считалась одним запросом, где SUM(Lesson.total_spots) шёл через outer join к
броням: каждое занятие попадало в сумму столько раз, сколько на нём записей, и
знаменатель раздувался в среднее число броней на занятие. Владелец видел 13%
там, где реально 75%, — и ассистент строил на этом числе выводы.

Инвариант: 8 занятий × 8 мест = 64 места, 48 занятых -> 75%.

Реальная БД, ручная чистка. Запуск из back/:  python -m tests.test_staff_load_percent
"""
import asyncio
import warnings
from datetime import datetime, timedelta

warnings.filterwarnings("ignore")

from sqlalchemy import delete, select

from database import async_session_maker
from dependencies import StudioContext
from models import (
    Client, Lesson, Reservation, Studio, StudioBillingPlan, StudioMember, User,
)
from routers.staff.profiles import get_staff_profile

_OWNER_EMAIL = "load-pct-owner@test.local"
_TRAINER_EMAIL = "load-pct-trainer@test.local"
_EMAILS = [_OWNER_EMAIL, _TRAINER_EMAIL]

LESSONS, SPOTS, BOOKED_PER_LESSON = 8, 8, 6      # 64 места, 48 занятых -> 75%


async def _seed() -> dict:
    async with async_session_maker() as db:
        studio = Studio(name="TEST-LOAD-PCT", timezone="UTC+0", currency="EUR")
        db.add(studio)
        await db.flush()
        sid = studio.id
        db.add(StudioBillingPlan(studio_id=sid, plan_name="pro"))

        owner = User(email=_OWNER_EMAIL, hashed_password="x", name="Ольга")
        trainer = User(email=_TRAINER_EMAIL, hashed_password="x", name="Ирина")
        db.add_all([owner, trainer])
        await db.flush()
        db.add_all([
            StudioMember(studio_id=sid, user_id=owner.id, role="owner",
                         status="active", name="Ольга"),
            StudioMember(studio_id=sid, user_id=trainer.id, role="trainer",
                         status="active", name="Ирина", last_name="Дворжак"),
        ])
        clients = [Client(studio_id=sid, name=f"К{i}", phone=f"+42077710{i:04d}")
                   for i in range(BOOKED_PER_LESSON)]
        db.add_all(clients)
        await db.flush()

        base = datetime.now() + timedelta(days=1)
        for k in range(LESSONS):
            lesson = Lesson(studio_id=sid, name="Йога", teacher_name="Ирина",
                            teacher_id=trainer.id, start_time=base + timedelta(days=k),
                            price=800, level="", equipment="",
                            total_spots=SPOTS, status="confirmed")
            db.add(lesson)
            await db.flush()
            for spot, c in enumerate(clients, start=1):
                db.add(Reservation(client_id=c.id, lesson_id=lesson.id,
                                   spot_number=spot, status="active"))
            # Отменённая бронь в знаменатель и числитель не идёт.
            db.add(Reservation(client_id=clients[0].id, lesson_id=lesson.id,
                               spot_number=SPOTS, status="cancelled"))

        # Занятие ЗА окном в 4 недели и отменённое занятие — оба мимо расчёта.
        db.add_all([
            Lesson(studio_id=sid, name="Йога", teacher_name="Ирина", teacher_id=trainer.id,
                   start_time=base + timedelta(days=60), price=800, level="", equipment="",
                   total_spots=100, status="confirmed"),
            Lesson(studio_id=sid, name="Йога", teacher_name="Ирина", teacher_id=trainer.id,
                   start_time=base + timedelta(days=2), price=800, level="", equipment="",
                   total_spots=100, status="cancelled"),
        ])
        await db.commit()
        return {"sid": sid, "owner_id": owner.id, "trainer_id": trainer.id}


async def _cleanup(sid: int) -> None:
    async with async_session_maker() as db:
        lessons = (await db.execute(
            select(Lesson.id).where(Lesson.studio_id == sid))).scalars().all()
        if lessons:
            await db.execute(delete(Reservation).where(Reservation.lesson_id.in_(lessons)))
        await db.execute(delete(Lesson).where(Lesson.studio_id == sid))
        await db.execute(delete(Client).where(Client.studio_id == sid))
        await db.execute(delete(StudioMember).where(StudioMember.studio_id == sid))
        await db.execute(delete(StudioBillingPlan).where(StudioBillingPlan.studio_id == sid))
        await db.execute(delete(Studio).where(Studio.id == sid))
        await db.execute(delete(User).where(User.email.in_(_EMAILS)))
        await db.commit()


async def _run() -> None:
    ids = await _seed()
    try:
        async with async_session_maker() as db:
            owner = (await db.execute(
                select(User).where(User.id == ids["owner_id"]))).scalar_one()
            ctx = StudioContext(user=owner, studio_id=ids["sid"], role="owner")
            profile = await get_staff_profile(ids["trainer_id"], ctx=ctx, db=db)
        got = profile["stats"]["load_percent"]
        assert got == 75, (
            f"загрузка {got}% вместо 75%: {LESSONS}×{SPOTS}=64 места, "
            f"{LESSONS * BOOKED_PER_LESSON} занятых. Знаменатель умножен на число броней?"
        )
    finally:
        await _cleanup(ids["sid"])


def test_load_percent_not_multiplied_by_bookings():
    asyncio.run(_run())


if __name__ == "__main__":
    asyncio.run(_run())
    print("ok")
