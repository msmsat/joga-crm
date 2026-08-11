"""«Кофе после занятия»: взаимность видимости, порог группы, доступ.

Главное свойство, которое здесь защищается: **имена участниц видит только та,
кто сама согласилась**. Это единственное место в продукте, где один клиент видит
другого, и гейт обязан стоять на сервере — спрятать список в интерфейсе
недостаточно, он всё равно уехал бы клиенту в JSON.

Реальная БД, откат.

Запуск из back/:  python -m tests.test_coffee_after
"""
import asyncio
import importlib
import warnings

warnings.filterwarnings("ignore")

from contextlib import asynccontextmanager
from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import delete
from starlette.requests import Request

from database import async_session_maker
from ratelimit import limiter
from models import Client, Lesson, Reservation, Studio, StudioBookingSettings

ML = importlib.import_module("routers.booking.miniapp_lessons")
BS = importlib.import_module("routers.booking.settings")

limiter.enabled = False

SPOTS = [
    {"name": "Kofein", "address": "Ptašínského 2", "url": "https://maps.example/kofein"},
    {"name": "Skog", "address": "Dominikánská 9", "url": None},
]


def _Req() -> Request:
    """Настоящий starlette.Request: slowapi отказывается работать с заглушкой."""
    return Request({
        "type": "http", "method": "POST", "path": "/", "headers": [],
        "query_string": b"", "client": ("127.0.0.1", 0),
    })


async def _setup(db, *, coffee_enabled=True, spots=SPOTS):
    studio = Studio(name="TEST-COFFEE", currency="CZK")
    db.add(studio)
    await db.flush()

    db.add(StudioBookingSettings(
        studio_id=studio.id, coffee_enabled=coffee_enabled, coffee_spots=spots,
    ))

    lesson = Lesson(
        studio_id=studio.id, name="Пилатес", teacher_name="Олена",
        start_time=datetime.now() + timedelta(days=1), duration_min=60,
        price=500, level="any", equipment="mat", total_spots=8,
    )
    db.add(lesson)
    await db.flush()

    people = []
    for index, name in enumerate(("Аня", "Марина", "Оля"), start=1):
        client = Client(studio_id=studio.id, name=name, is_active=True, avatar_color="#FCAE91")
        db.add(client)
        await db.flush()
        db.add(Reservation(
            client_id=client.id, lesson_id=lesson.id, spot_number=index, status="active",
        ))
        people.append(client)
    await db.flush()
    return studio.id, lesson, people


@asynccontextmanager
async def _case(**kwargs):
    """Своя студия на блок, с гарантированной уборкой после него.

    Откатом здесь не обойтись: `_set_coffee` внутри себя коммитит, и `rollback()`
    после него уже ничего не отменяет — тестовые студии оставались бы в dev-БД.
    Поэтому в конце удаляем студию явно, а связанное уносит FK ON DELETE CASCADE.
    """
    async with async_session_maker() as db:
        studio_id, lesson, people = await _setup(db, **kwargs)
        await db.commit()
        try:
            yield db, studio_id, lesson, people
        finally:
            await db.rollback()
            await db.execute(delete(Studio).where(Studio.id == studio_id))
            await db.commit()


async def _run():
    # ─── Взаимность: не согласилась — видит только счётчик, без имён ──────────
    async with _case() as (db, _, lesson, (anya, marina, olya)):
        # Согласились двое, Оля — нет.
        await ML._set_coffee(db, anya, lesson.id, True)
        await ML._set_coffee(db, marina, lesson.id, True)

        rules = await ML.load_rules(db, anya.studio_id)

        state = (await ML._coffee_map(db, [lesson.id], olya.id, rules))[lesson.id]
        assert state["count"] == 2, state
        assert state["joined"] is False, state
        assert state["participants"] == [], f"имена уехали тому, кто не согласился: {state}"

        # А согласившаяся видит вторую — и только её, без самой себя.
        state = (await ML._coffee_map(db, [lesson.id], anya.id, rules))[lesson.id]
        assert state["joined"] is True, state
        assert [p["name"] for p in state["participants"]] == ["Марина"], state

        # Наружу уходит только имя и цвет аватара.
        assert set(state["participants"][0]) == {"name", "avatar_color"}, state["participants"][0]

    # ─── Не записан — не видит даже счётчика ──────────────────────────────────
    # Кофе на чужом занятии не касается того, кто листает расписание: участвовать
    # он всё равно не может (POST требует брони), а социальные планы чужой группы
    # ему знать незачем.
    async with _case() as (db, studio_id, lesson, (anya, marina, _)):
        await ML._set_coffee(db, anya, lesson.id, True)
        await ML._set_coffee(db, marina, lesson.id, True)

        outsider = Client(studio_id=studio_id, name="Прохожая", is_active=True)
        db.add(outsider)
        await db.flush()

        rules = await ML.load_rules(db, studio_id)
        # Так зовут списки расписания: множество занятий, где у клиента есть бронь.
        state = (await ML._coffee_map(db, [lesson.id], outsider.id, rules, set()))[lesson.id]
        assert state["count"] == 0, f"счётчик чужого занятия уехал незаписанному: {state}"
        assert state["participants"] == [] and state["spots"] == [], state
        assert state["enabled"] is True, state

    # ─── Порог: места появляются со второго человека ──────────────────────────
    async with _case() as (db, _, lesson, (anya, marina, _)):

        state = await ML._set_coffee(db, anya, lesson.id, True)
        assert state.count == 1, state
        assert state.spots == [], f"одной идти некуда, а места показаны: {state}"

        state = await ML._set_coffee(db, marina, lesson.id, True)
        assert state.count == 2, state
        assert [s.name for s in state.spots] == ["Kofein", "Skog"], state

        # Передумала — счётчик падает, места снова прячутся.
        state = await ML._set_coffee(db, marina, lesson.id, False)
        assert state.count == 1, state
        assert state.spots == [], state

    # ─── Отменённая бронь выпадает из списка сама ─────────────────────────────
    async with _case() as (db, _, lesson, (anya, marina, _)):
        await ML._set_coffee(db, anya, lesson.id, True)
        await ML._set_coffee(db, marina, lesson.id, True)

        reservation = (await db.execute(
            ML.select(Reservation).where(
                Reservation.lesson_id == lesson.id, Reservation.client_id == marina.id,
            )
        )).scalar_one()
        reservation.status = "cancelled"
        await db.flush()

        rules = await ML.load_rules(db, anya.studio_id)
        state = (await ML._coffee_map(db, [lesson.id], anya.id, rules))[lesson.id]
        assert state["count"] == 1, f"отменившая бронь осталась в кофе: {state}"
        assert state["participants"] == [], state

    # ─── Без брони участвовать нельзя ─────────────────────────────────────────
    async with _case() as (db, studio_id, lesson, _):
        stranger = Client(studio_id=studio_id, name="Чужая", is_active=True)
        db.add(stranger)
        await db.flush()

        try:
            await ML._set_coffee(db, stranger, lesson.id, True)
            raise AssertionError("согласие принято без брони на занятие")
        except HTTPException as exc:
            assert exc.status_code == 404, exc

    # ─── Механика выключена владельцем ────────────────────────────────────────
    async with _case(coffee_enabled=False) as (db, _, lesson, (anya, *_)):
        rules = await ML.load_rules(db, anya.studio_id)

        assert await ML._coffee_map(db, [lesson.id], anya.id, rules) == {}, \
            "выключенная механика всё равно ходила в базу"

        try:
            await ML._set_coffee(db, anya, lesson.id, True)
            raise AssertionError("согласие принято при выключенной механике")
        except HTTPException as exc:
            assert exc.status_code == 403, exc

    # ─── Студия без заданных мест: NULL не роняет выдачу ──────────────────────
    async with _case(spots=None) as (db, studio_id, lesson, (anya, marina, _)):
        await ML._set_coffee(db, anya, lesson.id, True)
        state = await ML._set_coffee(db, marina, lesson.id, True)
        assert state.count == 2, state
        assert state.spots == [], state

        # Та же NULL-колонка глазами CRM. Проверка появилась по факту 500 на
        # GET /booking/settings: `_read` подменял None на [] через model_copy,
        # но тот работает ПОСЛЕ валидации — до подмены дело не доходило.
        # Читаем настройки студии ровно тем же кодом, что и роутер.
        row = (await db.execute(
            ML.select(StudioBookingSettings).where(
                StudioBookingSettings.studio_id == studio_id,
            )
        )).scalar_one()
        assert BS._read(row).coffee_spots == [], "NULL в coffee_spots роняет чтение настроек"

    # ─── Ссылку на место пишет владелец, а открывает её клиент ────────────────
    # Схема — граница доверия: `javascript:` в этом поле = чужой скрипт в webview
    # клиента. Проверка без БД, поэтому живёт прямо здесь.
    from pydantic import ValidationError

    from schemas.settings.booking import CoffeeSpotInput

    for bad in ("javascript:alert(1)", "JavaScript:alert(1)", " javascript:alert(1)",
                "data:text/html,<script>alert(1)</script>", "vbscript:msgbox(1)"):
        try:
            CoffeeSpotInput(name="X", url=bad)
            raise AssertionError(f"схема пропущена: {bad!r}")
        except ValidationError:
            pass

    # Нормальный ввод владельца не ломаем: без схемы дописываем https, пустое — None.
    assert CoffeeSpotInput(name="X", url="https://maps.example/k").url == "https://maps.example/k"
    assert CoffeeSpotInput(name="X", url="http://maps.example/k").url == "http://maps.example/k"
    assert CoffeeSpotInput(name="X", url="maps.example/k").url == "https://maps.example/k"
    assert CoffeeSpotInput(name="X", url="  ").url is None
    assert CoffeeSpotInput(name="X").url is None


def test_coffee_after():
    asyncio.run(_run())


if __name__ == "__main__":
    test_coffee_after()
    print("ALL PASS — кофе после занятия: взаимность, порог, доступ")
