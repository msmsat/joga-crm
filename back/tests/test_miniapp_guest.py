"""Гость видит расписание студии, но не чужой кабинет.

Занятие в мини-приложении выбирают ДО регистрации: форма входа, стоящая на
пороге, перекрывает единственное, зачем человек открыл ссылку студии. Поэтому
две ручки витрины — каталог и расписание дня — принимают `studio_id` вместо
токена (`get_viewer`). Здесь проверяется ровно граница этого послабления:

  1. без токена, но со студией — расписание отдаётся;
  2. клиентские поля у гостя пустые: своей брони, подарка первого занятия и
     «кофе» у него нет, потому что нет карточки. Чужие занятые коврики видны —
     их видит и клиент, без них нечего выбирать;
  3. тот же клиент с той же зависимостью видит свою бронь — послабление не
     сломало обычный путь;
  4. без токена и без студии — по-прежнему 401.

Реальная БД (как и остальные тесты каталога): студия создаётся и удаляется.

Запуск из back/:  python -m tests.test_miniapp_guest
"""
import asyncio
import importlib
import warnings

warnings.filterwarnings("ignore")

from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import delete
from starlette.requests import Request

from database import async_session_maker
from ratelimit import limiter
from models import Client, Lesson, Reservation, Studio

MA = importlib.import_module("routers.booking.miniapp")
ML = importlib.import_module("routers.booking.miniapp_lessons")
MS = importlib.import_module("routers.booking.miniapp_studio")

limiter.enabled = False

SPOT = 3


def _Req() -> Request:
    """Настоящий starlette.Request: slowapi отказывается работать с заглушкой."""
    return Request({
        "type": "http", "method": "GET", "path": "/", "headers": [],
        "query_string": b"", "client": ("127.0.0.1", 0),
    })


async def _run():
    async with async_session_maker() as db:
        studio = Studio(name="TEST-MINIAPP-GUEST", currency="CZK")
        db.add(studio)
        await db.flush()

        # Завтра в полдень: день целиком внутри окна записи любых правил.
        start = (datetime.now() + timedelta(days=1)).replace(
            hour=12, minute=0, second=0, microsecond=0,
        )
        lesson = Lesson(
            studio_id=studio.id, name="Pilates", teacher_name="Olena",
            start_time=start, duration_min=60, price=500,
            level="all", equipment="mat", total_spots=8, status="confirmed",
        )
        client = Client(studio_id=studio.id, name="Katya", is_active=True)
        db.add_all([lesson, client])
        await db.flush()

        db.add(Reservation(
            client_id=client.id, lesson_id=lesson.id, spot_number=SPOT, status="active",
        ))
        await db.flush()

        try:
            # 1. Гость: студию называет запрос, токена нет.
            guest = await MA.get_viewer(studio_id=studio.id, token=None, db=db)
            assert guest.client is None, guest.client
            assert guest.studio_id == studio.id, guest.studio_id

            day = await ML.lessons_by_date(start.date(), guest, db)
            assert [l.id for l in day] == [lesson.id], day
            card = day[0]

            # 2. Чужая бронь видна (без неё нечего выбирать), своего — ничего.
            assert card.taken_spots == [SPOT], card.taken_spots
            assert card.is_booked_by_user is False, card.is_booked_by_user
            assert card.trial_available is False, card.trial_available
            assert card.coffee.enabled is False, card.coffee
            assert card.total_spots == 8, card.total_spots

            # 3. Клиент через ту же зависимость видит СВОЮ бронь.
            mine = await ML.lessons_by_date(start.date(), MA.Viewer(client, studio.id), db)
            assert mine[0].is_booked_by_user is True, mine[0].is_booked_by_user

            # Каталог витрины гостю тоже открыт — по нему рисуется расписание.
            catalog = await MS.get_studio_catalog(_Req(), guest, db)
            assert catalog.studio.id == studio.id, catalog.studio.id

            # 4. Ни токена, ни студии — назвать нечего, ответ прежний.
            try:
                await MA.get_viewer(studio_id=None, token=None, db=db)
                raise AssertionError("гость без студии обязан получить 401")
            except HTTPException as e:
                assert e.status_code == 401, e.status_code

            # Несуществующая студия из ссылки — 404, а не 500.
            ghost = await MA.get_viewer(studio_id=0, token=None, db=db)
            try:
                await MS.get_studio_catalog(_Req(), ghost, db)
                raise AssertionError("каталог несуществующей студии обязан дать 404")
            except HTTPException as e:
                assert e.status_code == 404, e.status_code
        finally:
            # Core-DELETE, а не db.delete(): ON DELETE CASCADE в схеме сносит
            # занятие, клиента и бронь сам.
            await db.execute(delete(Studio).where(Studio.id == studio.id))
            await db.commit()


def test_miniapp_guest_sees_schedule():
    asyncio.run(_run())


if __name__ == "__main__":
    test_miniapp_guest_sees_schedule()
    print("ALL PASS — гость видит расписание, кабинет остаётся за токеном")
