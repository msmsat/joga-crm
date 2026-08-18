"""Запись клиента через НАСТОЯЩУЮ БД: статус брони, коврики, долг.

Остальные тесты записи ходят в фейковую сессию — там нет ни CHECK-констрейнта,
ни уникального индекса, и ровно поэтому мимо них прошли два боевых дефекта:

  * `status='pending'` («Подтверждение тренером») не проходил
    check_reservation_status — запись падала IntegrityError, а тесты зеленели;
  * номер коврика ставился как «занято + 1»: после отмены в середине счёт
    возвращал УЖЕ занятый номер, и два человека получали один коврик (в dev-БД
    такая пара нашлась).

Поэтому здесь всё по-настоящему: живая сессия, реальные ограничения, откат.

Запуск из back/:  python -m tests.test_reservation_seats
"""
import asyncio
import warnings
from datetime import datetime, time, timedelta

warnings.filterwarnings("ignore")

from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from starlette.requests import Request

from database import async_session_maker
from ratelimit import limiter
from models import (
    Client, ClientPayment, Lesson, Reservation, Service, Studio, StudioBookingSettings,
)
from routers.booking.miniapp_lessons import ReservationCreateRequest, create_reservation

PRICE = 1500

limiter.enabled = False  # 10/минуту мешает прогону (см. test_miniapp_checkout.py)


def _Req() -> Request:
    return Request({
        "type": "http", "method": "POST", "path": "/", "headers": [],
        "query_string": b"", "client": ("127.0.0.1", 0),
    })


async def _setup(db, *, confirmation=False, repeat=False, spots=3):
    """Студия с занятием завтра в полдень — внутри окна записи и часов виджета."""
    studio = Studio(name="TEST-RESERVATION-SEATS", currency="CZK")
    db.add(studio)
    await db.flush()

    db.add(StudioBookingSettings(
        studio_id=studio.id, booking_active=True,
        # Предоплату выключаем: проверяем оплату на месте, а не гейт абонемента.
        prefill_on_booking=False,
        trainer_confirmation_required=confirmation,
        repeat_booking_allowed=repeat,
        coffee_enabled=False,
    ))
    service = Service(studio_id=studio.id, name="Хатха", price=PRICE, duration_min=60)
    await db.flush()

    lesson = Lesson(
        studio_id=studio.id, name="Хатха", teacher_name="Олена",
        start_time=datetime.combine((datetime.now() + timedelta(days=1)).date(), time(12, 0)),
        duration_min=60, price=PRICE, total_spots=spots, status="confirmed",
        level="", equipment="",
    )
    db.add_all([service, lesson])
    await db.flush()

    # Телефон обязателен: без него запись с оплатой на месте отвечает 428.
    clients = []
    for name in ("Катя", "Оля", "Ніна"):
        client = Client(studio_id=studio.id, name=name, phone=f"+420{len(name)}0000000{len(clients)}",
                        is_active=True)
        db.add(client)
        clients.append(client)
    await db.flush()
    return studio.id, lesson, clients


async def _book(db, client, lesson, spot):
    return await create_reservation(
        _Req(), ReservationCreateRequest(lesson_id=lesson.id, spot_number=spot), client, db,
    )


async def _cleanup(db, studio_id):
    """Убираем студию целиком — брони, долги, занятия и клиентов уносит каскад.

    Тест коммитит (иначе не проверить ни CHECK, ни уникальный индекс), поэтому
    прибирает за собой сам: осевшая тестовая студия попадёт в вечернюю рассылку
    dev-стенда владельцу (см. scripts/purge_test_studios.py).

    DELETE запросом, а не `db.delete(studio)`: ORM на своей стороне пытается
    обнулить clients.studio_id вместо каскада БД и падает на NOT NULL.
    """
    await db.execute(delete(Studio).where(Studio.id == studio_id))
    await db.commit()


async def _run():
    # ─── «Подтверждение тренером»: бронь реально ложится в БД со статусом pending ──
    async with async_session_maker() as db:
        studio_id, lesson, clients = await _setup(db, confirmation=True)

        reservation = await _book(db, clients[0], lesson, 1)
        assert reservation.status == "pending", reservation.status

        # Именно чтение из БД: до миграции d4b2e70c1a93 сюда не доезжало —
        # CHECK отвергал статус, и коммит падал IntegrityError.
        stored = (await db.execute(
            select(Reservation.status).where(Reservation.id == reservation.id)
        )).scalar_one()
        assert stored == "pending", stored

        await _cleanup(db, studio_id)

    # ─── Оплата на месте: за платное занятие без абонемента заводится долг ─────
    async with async_session_maker() as db:
        studio_id, lesson, clients = await _setup(db)

        reservation = await _book(db, clients[0], lesson, 2)
        row = (await db.execute(
            select(Reservation).where(Reservation.id == reservation.id)
        )).scalar_one()
        assert row.debt_payment_id is not None, "долг за оплату на месте не открыт"

        debt = await db.get(ClientPayment, row.debt_payment_id)
        assert (debt.amount, debt.status) == (PRICE, "pending"), (debt.amount, debt.status)

        await _cleanup(db, studio_id)

    # ─── Освободившийся коврик занимает следующий, а не «занято + 1» ──────────
    # Тот самый случай, который наплодил двойников: заняты 1 и 2, снялся 1 —
    # свободен именно первый, и следующая запись обязана встать на него.
    async with async_session_maker() as db:
        studio_id, lesson, clients = await _setup(db)

        first = await _book(db, clients[0], lesson, 1)
        await _book(db, clients[1], lesson, 2)

        row = await db.get(Reservation, first.id)
        row.status = "cancelled"
        await db.commit()

        from services.booking_access import next_free_spot
        assert await next_free_spot(db, lesson) == 1, "первый свободный коврик — №1"

        # И повторная запись на него проходит: индекс частичный, отменённая
        # бронь на том же месте занять его снова не мешает.
        again = await _book(db, clients[2], lesson, 1)
        assert again.spot_number == 1

        await _cleanup(db, studio_id)

    # ─── Два человека на одном коврике: БД не пускает даже в обход роутера ────
    # Проверка «место занято» в роутере остаётся, но она не арбитр: между ней и
    # вставкой влезает второй клиент. Здесь этот зазор и воспроизводим.
    async with async_session_maker() as db:
        studio_id, lesson, clients = await _setup(db)

        await _book(db, clients[0], lesson, 3)

        db.add(Reservation(
            client_id=clients[1].id, lesson_id=lesson.id, spot_number=3,
            status="active", booking_channel="telegram",
        ))
        try:
            await db.commit()
            raise AssertionError("БД пустила двоих на один коврик")
        except IntegrityError:
            await db.rollback()

        await _cleanup(db, studio_id)

    # ─── Повторная запись выключена: второй коврик тому же клиенту не дают ────
    async with async_session_maker() as db:
        studio_id, lesson, clients = await _setup(db)

        await _book(db, clients[0], lesson, 1)
        try:
            await _book(db, clients[0], lesson, 2)
            raise AssertionError("вторая бронь при выключенной повторной записи")
        except HTTPException as exc:
            assert exc.status_code == 409, exc

        await _cleanup(db, studio_id)

    # ─── Повторная запись включена: второй коврик тому же клиенту разрешён ────
    # Ровно то, что теперь умеет и мини-приложение (кнопка «Занять ещё коврик»).
    async with async_session_maker() as db:
        studio_id, lesson, clients = await _setup(db, repeat=True)

        await _book(db, clients[0], lesson, 1)
        second = await _book(db, clients[0], lesson, 2)
        assert second.spot_number == 2, second.spot_number

        mine = (await db.execute(
            select(Reservation).where(
                Reservation.lesson_id == lesson.id, Reservation.client_id == clients[0].id,
            )
        )).scalars().all()
        assert len(mine) == 2, mine
        # Долг у каждой брони свой — иначе вторая ушла бы студии бесплатно.
        assert len({r.debt_payment_id for r in mine}) == 2, mine

        await _cleanup(db, studio_id)


def test_reservation_seats():
    asyncio.run(_run())


if __name__ == "__main__":
    test_reservation_seats()
    print("ALL PASS — статус брони, коврики и долг на реальной БД")
