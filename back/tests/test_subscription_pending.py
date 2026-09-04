"""Отложенный старт абонемента из очереди: срок начинается с реального визита.

РАНЬШЕ ФАЙЛ РАБОТАЛ НА ПОДДЕЛЬНОЙ СЕССИИ. Это перестало быть возможным, когда
списание и возврат занятия переехали в базу условными UPDATE'ами: подделке
нечем их выполнить, а главное — она не умеет воспроизвести то, ради чего они
там оказались (две одновременные записи на одно последнее занятие). Все
проверки смысла сохранены слово в слово, просто теперь на настоящих строках.

Реальная БД, ручная чистка. Запуск из back/:  python -m pytest tests/test_subscription_pending.py
"""
import asyncio
import os
import time as _time
import warnings
from datetime import date, datetime, time, timedelta

warnings.filterwarnings("ignore")

from sqlalchemy import delete

from database import async_session_maker
from models import (
    Client, ClientSubscription, Hall, Lesson, Reservation, Service, Studio, User,
)
from services.subscription_charge import (
    activate_pending_after_visit, charge_reservation, refund_reservation,
)

_TAG = "TEST-PENDING"
TODAY = date.today()
TOMORROW = TODAY + timedelta(days=1)


async def _seed() -> dict:
    stamp = f"{int(_time.time())}-{os.getpid()}"
    async with async_session_maker() as db:
        studio = Studio(name=f"{_TAG}-{stamp}", tz_iana="Europe/Prague", currency="CZK")
        db.add(studio)
        await db.flush()
        client = Client(studio_id=studio.id, name="Катя")
        service = Service(studio_id=studio.id, name="Стретчинг", duration_min=60, price=0)
        hall = Hall(studio_id=studio.id, name="Зал", capacity=10)
        teacher = User(email=f"pnd-{stamp}@test.local", hashed_password="x", name="T")
        db.add_all([client, service, hall, teacher])
        await db.flush()
        lesson = Lesson(studio_id=studio.id, name="Стретчинг", teacher_name="T",
                        service_id=service.id, teacher_id=teacher.id, hall_id=hall.id,
                        start_time=datetime.combine(TOMORROW, time(10, 0)),
                        tz_iana="Europe/Prague", duration_min=60, price=0,
                        level="", equipment="", total_spots=20, status="confirmed")
        db.add(lesson)
        await db.flush()
        ids = {"studio": studio.id, "client": client.id, "user": teacher.id,
               "lesson": lesson.id}
        await db.commit()
    return ids


async def _cleanup(ids) -> None:
    async with async_session_maker() as db:
        await db.execute(delete(Reservation).where(Reservation.lesson_id == ids["lesson"]))
        await db.execute(delete(ClientSubscription).where(
            ClientSubscription.client_id == ids["client"]))
        await db.execute(delete(Lesson).where(Lesson.studio_id == ids["studio"]))
        await db.execute(delete(Hall).where(Hall.studio_id == ids["studio"]))
        await db.execute(delete(Service).where(Service.studio_id == ids["studio"]))
        await db.execute(delete(Client).where(Client.studio_id == ids["studio"]))
        await db.execute(delete(Studio).where(Studio.id == ids["studio"]))
        await db.execute(delete(User).where(User.id == ids["user"]))
        await db.commit()


_spot = [0]


async def _charged(ids, *, status: str, used: int, total: int, duration: int = 30,
                   starts_at=None, expires_at=None):
    """Абонемент + бронь со списанием — в одной сессии, как в бою.

    Возвращает (id абонемента, id брони).
    """
    _spot[0] += 1
    async with async_session_maker() as db:
        sub = ClientSubscription(
            client_id=ids["client"], type="Стретчинг", total_classes=total,
            used_classes=used, status=status, duration_days=duration,
            starts_at=starts_at,
            expires_at=expires_at or (TODAY + timedelta(days=duration)))
        db.add(sub)
        await db.flush()
        reservation = Reservation(client_id=ids["client"], lesson_id=ids["lesson"],
                                  spot_number=_spot[0], status="active")
        db.add(reservation)
        await charge_reservation(db, ids["studio"], reservation, sub)
        await db.commit()
        return sub.id, reservation.id


async def _sub(sub_id: int):
    async with async_session_maker() as db:
        return await db.get(ClientSubscription, sub_id)


# ─── Списание с очереди не закрывает её и не двигает срок ────────────────────

async def _charging_pending(ids):
    """Иначе возврат при отмене поднял бы ждущий абонемент в active с чужим сроком."""
    sub_id, _res = await _charged(ids, status="pending", used=7, total=8)
    row = await _sub(sub_id)
    assert row.used_classes == 8
    assert row.status == "pending", "очередь не закрываем до визита"
    assert row.starts_at is None

    provisional = TODAY + timedelta(days=30)
    sub_id, _res = await _charged(ids, status="pending", used=0, total=8,
                                  expires_at=provisional)
    row = await _sub(sub_id)
    assert row.expires_at == provisional, "запись срок не двигает"
    assert row.starts_at is None


# ─── Визит запускает срок ────────────────────────────────────────────────────

async def _visit_activates(ids):
    sub_id, res_id = await _charged(ids, status="pending", used=0, total=8)
    async with async_session_maker() as db:
        reservation = await db.get(Reservation, res_id)
        assert await activate_pending_after_visit(db, reservation) is True
        await db.commit()
    row = await _sub(sub_id)
    assert row.status == "active"
    assert row.starts_at == TODAY
    assert row.expires_at == TODAY + timedelta(days=30), "срок отсчитывается от визита"

    # «Разовое» — абонемент на одно занятие: визит его сразу и закрывает.
    sub_id, res_id = await _charged(ids, status="pending", used=0, total=1)
    async with async_session_maker() as db:
        reservation = await db.get(Reservation, res_id)
        assert await activate_pending_after_visit(db, reservation) is True
        await db.commit()
    row = await _sub(sub_id)
    assert row.status == "finished"
    assert row.starts_at == TODAY

    # Повторная отметка ничего не двигает.
    sub_id, res_id = await _charged(ids, status="pending", used=0, total=8)
    async with async_session_maker() as db:
        reservation = await db.get(Reservation, res_id)
        await activate_pending_after_visit(db, reservation)
        await db.commit()
    started = (await _sub(sub_id)).expires_at
    async with async_session_maker() as db:
        reservation = await db.get(Reservation, res_id)
        assert await activate_pending_after_visit(db, reservation) is False
        await db.commit()
    assert (await _sub(sub_id)).expires_at == started

    # Идущему абонементу визит срок не продлевает.
    sub_id, res_id = await _charged(ids, status="active", used=0, total=8,
                                    starts_at=TODAY - timedelta(days=10),
                                    expires_at=TODAY + timedelta(days=20))
    before = (await _sub(sub_id)).expires_at
    async with async_session_maker() as db:
        reservation = await db.get(Reservation, res_id)
        assert await activate_pending_after_visit(db, reservation) is False
        await db.commit()
    assert (await _sub(sub_id)).expires_at == before

    # Разовая оплата мимо абонемента — активировать нечего.
    async with async_session_maker() as db:
        empty = Reservation(client_id=ids["client"], lesson_id=ids["lesson"],
                            spot_number=19, status="active")
        db.add(empty)
        assert await activate_pending_after_visit(db, empty) is False
        await db.rollback()


# ─── Записался и не пришёл ───────────────────────────────────────────────────

async def _cancel_before_visit(ids):
    sub_id, res_id = await _charged(ids, status="pending", used=0, total=8)
    async with async_session_maker() as db:
        reservation = await db.get(Reservation, res_id)
        await refund_reservation(db, reservation)
        await db.commit()
        assert reservation.subscription_id is None
    row = await _sub(sub_id)
    assert row.used_classes == 0
    assert row.status == "pending", "не пришёл — абонемент всё ещё ждёт"
    assert row.starts_at is None

    # Возврат последнего занятия очереди её не активирует.
    sub_id, res_id = await _charged(ids, status="pending", used=7, total=8)
    async with async_session_maker() as db:
        reservation = await db.get(Reservation, res_id)
        await refund_reservation(db, reservation)
        await db.commit()
    row = await _sub(sub_id)
    assert row.used_classes == 7
    assert row.status == "pending"


def test_subscription_pending_against_the_database():
    async def run():
        ids = await _seed()
        try:
            await _charging_pending(ids)
            await _visit_activates(ids)
            await _cancel_before_visit(ids)
        finally:
            await _cleanup(ids)

    asyncio.run(run())


if __name__ == "__main__":
    test_subscription_pending_against_the_database()
    print("subscription pending ok")
