"""Списание и возврат занятия абонемента — включая гонку за последнее занятие.

РАНЬШЕ ЭТОТ ФАЙЛ РАБОТАЛ НА ПОДДЕЛЬНОЙ СЕССИИ и проверял арифметику в Python:
`sub.used_classes += 1`. Именно она и была боевым багом — два одновременных
запроса читали одну и ту же семёрку из восьми и оба записывали восьмёрку, то
есть одно занятие оплачивало две брони. Проверить это подделкой невозможно:
гонки в ней не бывает по построению.

Теперь списание делает база условным UPDATE'ом, и тест обязан быть настоящим:
две параллельные сессии, одно последнее занятие, ровно один победитель.

Реальная БД, ручная чистка. Запуск из back/:  python -m pytest tests/test_subscription_charge.py
"""
import asyncio
import os
import time as _time
import warnings
from datetime import date, datetime, time, timedelta

warnings.filterwarnings("ignore")

from sqlalchemy import delete, select

from database import async_session_maker
from models import (
    Client, ClientSubscription, Hall, Lesson, Reservation, Service, Studio, User,
)
from services.subscription_charge import charge_reservation, refund_reservation

_TAG = "TEST-CHARGE"
TOMORROW = date.today() + timedelta(days=1)


async def _seed() -> dict:
    stamp = f"{int(_time.time())}-{os.getpid()}"
    async with async_session_maker() as db:
        studio = Studio(name=f"{_TAG}-{stamp}", tz_iana="Europe/Prague", currency="CZK")
        db.add(studio)
        await db.flush()
        client = Client(studio_id=studio.id, name="Катя")
        service = Service(studio_id=studio.id, name="Стретчинг", duration_min=60, price=500)
        hall = Hall(studio_id=studio.id, name="Зал", capacity=10)
        teacher = User(email=f"chg-{stamp}@test.local", hashed_password="x", name="T")
        db.add_all([client, service, hall, teacher])
        await db.flush()
        lessons = []
        for hour in (10, 12):
            lesson = Lesson(studio_id=studio.id, name="Стретчинг", teacher_name="T",
                            service_id=service.id, teacher_id=teacher.id, hall_id=hall.id,
                            start_time=datetime.combine(TOMORROW, time(hour, 0)),
                            tz_iana="Europe/Prague", duration_min=60, price=500,
                            level="", equipment="", total_spots=8, status="confirmed")
            db.add(lesson)
            lessons.append(lesson)
        await db.flush()
        ids = {"studio": studio.id, "client": client.id, "user": teacher.id,
               "hall": hall.id, "service": service.id,
               "lessons": [row.id for row in lessons]}
        await db.commit()
    return ids


async def _cleanup(ids: dict) -> None:
    async with async_session_maker() as db:
        await db.execute(delete(Reservation).where(
            Reservation.lesson_id.in_(ids["lessons"])))
        await db.execute(delete(ClientSubscription).where(
            ClientSubscription.client_id == ids["client"]))
        await db.execute(delete(Lesson).where(Lesson.studio_id == ids["studio"]))
        await db.execute(delete(Hall).where(Hall.studio_id == ids["studio"]))
        await db.execute(delete(Service).where(Service.studio_id == ids["studio"]))
        await db.execute(delete(Client).where(Client.studio_id == ids["studio"]))
        await db.execute(delete(Studio).where(Studio.id == ids["studio"]))
        await db.execute(delete(User).where(User.id == ids["user"]))
        await db.commit()


async def _make_sub(ids, *, used: int, total: int) -> int:
    async with async_session_maker() as db:
        sub = ClientSubscription(client_id=ids["client"], type="Стретчинг",
                                 total_classes=total, used_classes=used,
                                 expires_at=TOMORROW + timedelta(days=30),
                                 status="active")
        db.add(sub)
        await db.commit()
        return sub.id


async def _book(ids, sub_id: int, lesson_id: int, spot: int):
    """Одна попытка записи со списанием — в СВОЕЙ сессии, как в бою."""
    async with async_session_maker() as db:
        sub = await db.get(ClientSubscription, sub_id)
        reservation = Reservation(client_id=ids["client"], lesson_id=lesson_id,
                                  spot_number=spot, status="active")
        db.add(reservation)
        remaining = await charge_reservation(db, ids["studio"], reservation, sub)
        await db.commit()
        return remaining, reservation.id


async def _used(sub_id: int) -> tuple[int, str]:
    async with async_session_maker() as db:
        row = await db.get(ClientSubscription, sub_id)
        return row.used_classes, row.status


async def _charge_and_refund(ids):
    sub_id = await _make_sub(ids, used=3, total=8)
    remaining, res_id = await _book(ids, sub_id, ids["lessons"][0], 1)
    assert remaining == 4, remaining
    assert await _used(sub_id) == (4, "active")

    # Повторное списание той же записи не проходит: ссылка уже стоит.
    async with async_session_maker() as db:
        sub = await db.get(ClientSubscription, sub_id)
        reservation = await db.get(Reservation, res_id)
        assert await charge_reservation(db, ids["studio"], reservation, sub) is None
        await db.commit()
    assert await _used(sub_id) == (4, "active")

    # Отмена возвращает занятие ровно на тот же абонемент.
    async with async_session_maker() as db:
        reservation = await db.get(Reservation, res_id)
        await refund_reservation(db, reservation)
        await db.commit()
        assert reservation.subscription_id is None
    assert await _used(sub_id) == (3, "active")


async def _last_class_race(ids):
    """ГЛАВНОЕ: одно оставшееся занятие — две одновременные записи."""
    sub_id = await _make_sub(ids, used=7, total=8)
    first, second = await asyncio.gather(
        _book(ids, sub_id, ids["lessons"][0], 1),
        _book(ids, sub_id, ids["lessons"][1], 1),
        return_exceptions=True,
    )
    charged = [r for r in (first, second)
               if not isinstance(r, Exception) and r[0] is not None]
    assert len(charged) == 1, f"последнее занятие списали дважды: {first} {second}"
    used, status = await _used(sub_id)
    assert used == 8, used
    assert status == "finished", status

    # Проигравшая бронь осталась без абонемента — она платная, а не подарочная.
    async with async_session_maker() as db:
        rows = (await db.execute(select(Reservation).where(
            Reservation.lesson_id.in_(ids["lessons"])))).scalars().all()
        linked = [r for r in rows if r.subscription_id == sub_id]
        assert len(linked) == 1, [r.subscription_id for r in rows]


async def _double_refund(ids):
    """Две одновременные отмены одной брони возвращают ОДНО занятие."""
    sub_id = await _make_sub(ids, used=4, total=8)
    _remaining, res_id = await _book(ids, sub_id, ids["lessons"][0], 2)
    assert await _used(sub_id) == (5, "active")

    async def cancel():
        async with async_session_maker() as db:
            reservation = await db.get(Reservation, res_id)
            await refund_reservation(db, reservation)
            await db.commit()

    await asyncio.gather(cancel(), cancel(), return_exceptions=True)
    used, _status = await _used(sub_id)
    assert used == 4, f"двойная отмена вернула два занятия: {used}"


async def _exhausted(ids):
    """Абонемент кончился между выбором и списанием — подарка не случается."""
    sub_id = await _make_sub(ids, used=8, total=8)
    async with async_session_maker() as db:
        sub = await db.get(ClientSubscription, sub_id)
        reservation = Reservation(client_id=ids["client"], lesson_id=ids["lessons"][1],
                                  spot_number=3, status="active")
        db.add(reservation)
        assert await charge_reservation(db, ids["studio"], reservation, sub) is None
        assert reservation.subscription_id is None
        await db.commit()
    assert (await _used(sub_id))[0] == 8


def test_subscription_charge_against_the_database():
    async def run():
        ids = await _seed()
        try:
            await _charge_and_refund(ids)
            await _cleanup_reservations(ids)
            await _last_class_race(ids)
            await _cleanup_reservations(ids)
            await _double_refund(ids)
            await _cleanup_reservations(ids)
            await _exhausted(ids)
        finally:
            await _cleanup(ids)

    asyncio.run(run())


async def _cleanup_reservations(ids) -> None:
    async with async_session_maker() as db:
        await db.execute(delete(Reservation).where(
            Reservation.lesson_id.in_(ids["lessons"])))
        await db.execute(delete(ClientSubscription).where(
            ClientSubscription.client_id == ids["client"]))
        await db.commit()


if __name__ == "__main__":
    test_subscription_charge_against_the_database()
    print("subscription charge ok")
