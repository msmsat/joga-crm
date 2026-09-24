"""Цена мастера на денежных путях ПОМИМО форм сотрудника.

ЗАЧЕМ. Правило одно (`services/service_pricing`), но спрашивают его пять мест,
и каждое может обойти его по-своему — не ошибкой в правиле, а тем, что
подставит чужое число раньше, чем правило спросят. Здесь по тесту на обход,
который однажды уже был в коде:

* касса продавала разовый визит без мастера по цене Каталога, даже когда за
  неё не работал никто (единственный мастер со своей ценой);
* ассистент подставлял в занятие цену Каталога, и роутер принимал её за
  названную человеком — цену тренера он тогда не спрашивал вовсе;
* справка в чате называла клиенту базовую цену, а не «от–до»;
* ассистенту владельца список мастеров раздувал ответ get_services, и в
  потолок ответа влезало меньше услуг.

И смена тренера у занятия — её логика до этого файла тестом не держалась.

Реальная БД, ручная чистка. Запуск из back/:
    python -m pytest tests/test_price_paths.py -q
"""
import asyncio
import warnings
from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import delete, insert, select

from database import async_session_maker
from dependencies import StudioContext
from models import Client, Lesson, Reservation, Service, Studio, StudioMember, User
from models.base import user_services
from routers.checkout.router import _get_client_package
from routers.schedule.lessons import update_lesson
from schemas.schedule.lessons import LessonUpdateRequest
from services import ai_tools, information, service_pricing
from services.response_render import fact_lines
from services.search_intent import InfoKind, UserSearchIntent

warnings.filterwarnings("ignore")

_PREFIX = "price-paths-"
_EMAILS = [f"{_PREFIX}{who}@velora-test.com" for who in ("owner", "anna", "boris")]


async def _seed() -> dict:
    """Стрижка 800 в Каталоге. Анна берёт за неё 1400, Борис — по Каталогу.

    Борода 500 — её ведёт одна Анна, и своя цена у неё 700: «диапазон» из
    одного числа, которое НЕ равно базовой.
    """
    async with async_session_maker() as db:
        studio = Studio(name="TEST-PRICE-PATHS", tz_iana="Europe/Prague", currency="CZK")
        db.add(studio)
        await db.flush()
        owner, anna, boris = (User(email=e, hashed_password="x", name=n)
                              for e, n in zip(_EMAILS, ("Olga", "Anna", "Boris")))
        db.add_all([owner, anna, boris])
        await db.flush()
        db.add_all([
            StudioMember(user_id=owner.id, studio_id=studio.id, role="owner",
                         status="active", name="Olga"),
            StudioMember(user_id=anna.id, studio_id=studio.id, role="trainer",
                         status="active", name="Anna"),
            StudioMember(user_id=boris.id, studio_id=studio.id, role="trainer",
                         status="active", name="Boris"),
        ])
        haircut = Service(studio_id=studio.id, name="Стрижка", price=800, duration_min=45)
        beard = Service(studio_id=studio.id, name="Борода", price=500, duration_min=30)
        db.add_all([haircut, beard])
        await db.flush()
        await db.execute(insert(user_services), [
            {"user_id": anna.id, "service_id": haircut.id, "price": 1400},
            {"user_id": boris.id, "service_id": haircut.id, "price": None},
            {"user_id": anna.id, "service_id": beard.id, "price": 700},
        ])
        client = Client(studio_id=studio.id, name="Katya", phone="+420777123987")
        db.add(client)
        await db.flush()
        await db.commit()
        return {"sid": studio.id, "owner": owner.id, "anna": anna.id, "boris": boris.id,
                "haircut": haircut.id, "beard": beard.id, "client": client.id}


async def _cleanup(sid: int) -> None:
    async with async_session_maker() as db:
        lessons = select(Lesson.id).where(Lesson.studio_id == sid)
        await db.execute(delete(Reservation).where(Reservation.lesson_id.in_(lessons)))
        await db.execute(delete(Lesson).where(Lesson.studio_id == sid))
        await db.execute(delete(Client).where(Client.studio_id == sid))
        await db.execute(delete(user_services).where(user_services.c.service_id.in_(
            select(Service.id).where(Service.studio_id == sid))))
        await db.execute(delete(Service).where(Service.studio_id == sid))
        await db.execute(delete(StudioMember).where(StudioMember.studio_id == sid))
        await db.execute(delete(Studio).where(Studio.id == sid))
        await db.execute(delete(User).where(User.email.in_(_EMAILS)))
        await db.commit()


async def _ctx(ids: dict, db) -> StudioContext:
    owner = (await db.execute(select(User).where(User.id == ids["owner"]))).scalar_one()
    return StudioContext(user=owner, studio_id=ids["sid"], role="owner")


def _run(scenario):
    ids = asyncio.run(_seed())
    try:
        asyncio.run(scenario(ids))
    finally:
        asyncio.run(_cleanup(ids["sid"]))


# ─── Цена без мастера ────────────────────────────────────────────────────────

def test_price_without_master_is_the_only_price_masters_charge():
    """Один мастер со своей ценой — это и есть цена, а не база Каталога."""
    async def scenario(ids):
        async with async_session_maker() as db:
            beard = await db.get(Service, ids["beard"])
            haircut = await db.get(Service, ids["haircut"])
            assert await service_pricing.price_without_master(db, beard) == 700
            # У стрижки цены у мастеров разные — одного ответа нет.
            assert await service_pricing.price_without_master(db, haircut) is None
    _run(scenario)


# ─── Касса ───────────────────────────────────────────────────────────────────

async def _single(ids, service_key, teacher=None, *, require_master=False) -> int:
    async with async_session_maker() as db:
        _client, package = await _get_client_package(
            db, ids["sid"], ids["client"], ids[service_key], "single",
            ids[teacher] if teacher else None, require_master=require_master)
    return package.price


def test_checkout_sells_at_the_chosen_masters_price():
    async def scenario(ids):
        assert await _single(ids, "haircut", "anna", require_master=True) == 1400
        assert await _single(ids, "haircut", "boris", require_master=True) == 800
    _run(scenario)


def test_checkout_without_master_takes_the_one_price_nobody_disputes():
    """Бороду делает одна Анна за 700. Продать её за 800 Каталога значило бы
    взять сумму, которой нет ни у одного мастера, — касса мастера здесь не
    спрашивает, потому что «от–до» схлопнулся в одну цифру."""
    async def scenario(ids):
        assert await _single(ids, "beard", require_master=True) == 700
    _run(scenario)


def test_checkout_refuses_to_sell_a_ranged_service_without_master():
    """Цена зависит от мастера — продажа без него отказ, а не цена «в среднем».
    Фронт кнопку и так блокирует; сервер держит правило сам, потому что
    кассу зовёт не только эта кнопка."""
    async def scenario(ids):
        with pytest.raises(HTTPException) as failure:
            await _single(ids, "haircut", require_master=True)
        assert failure.value.status_code == 400
        assert failure.value.detail["code"] == "checkout.master_required"
        # Предварительный расчёт, пока кассир выбирает, не отказывает.
        assert await _single(ids, "haircut") == 800
    _run(scenario)


# ─── Ассистент ───────────────────────────────────────────────────────────────

def test_assistant_lesson_defaults_take_the_teachers_price():
    """«Поставь Анне стрижку» — цена Анны, а не Каталога.

    Подставленная цена уходит в роутер как названная, и цену тренера он
    тогда уже не спрашивает: промах здесь не исправит никто дальше по цепочке."""
    async def scenario(ids):
        async with async_session_maker() as db:
            ctx = await _ctx(ids, db)
            anna = await ai_tools._lesson_defaults(
                {"service_id": ids["haircut"], "teacher_id": ids["anna"]}, ctx, db)
            boris = await ai_tools._lesson_defaults(
                {"service_id": ids["haircut"], "teacher_id": ids["boris"]}, ctx, db)
            named = await ai_tools._lesson_defaults(
                {"service_id": ids["haircut"], "teacher_id": ids["anna"], "price": 999}, ctx, db)
            garbage = await ai_tools._lesson_defaults(
                {"service_id": ids["haircut"], "teacher_id": "Anna"}, ctx, db)
            as_text = await ai_tools._lesson_defaults(
                {"service_id": ids["haircut"], "teacher_id": str(ids["anna"])}, ctx, db)
        assert anna["price"] == 1400
        assert boris["price"] == 800
        # Названное человеком не перебиваем.
        assert named["price"] == 999
        # id строкой проверка аргументов прочтёт как число — и цена обязана
        # быть того же тренера, а не Каталога.
        assert as_text["price"] == 1400
        # Тренер не число — цену не подставляем: роутер спросит её сам после
        # проверки аргументов, а не упадёт тут на сравнении строки с id.
        assert "price" not in garbage
    _run(scenario)


def test_assistant_services_list_keeps_the_range_but_not_the_masters():
    async def scenario(ids):
        async with async_session_maker() as db:
            result = await ai_tools.get_services(
                await _ctx(ids, db), db, ai_tools.NoArgs())
        rows = {row["id"]: row for row in result["items"]}
        assert all("masters" not in row for row in rows.values())
        assert (rows[ids["haircut"]]["price_min"], rows[ids["haircut"]]["price_max"]) == (800, 1400)
        # Борода: в Каталоге 500, а единственный мастер берёт 700. Диапазона
        # нет, но price_min/max остаются: без них модель назвала бы 500 —
        # цену, по которой эту услугу не делает никто.
        assert (rows[ids["beard"]]["price_min"], rows[ids["beard"]]["price_max"]) == (700, 700)
    _run(scenario)


# ─── Справка в чате ──────────────────────────────────────────────────────────

def test_chat_answers_the_price_as_a_range():
    """«Сколько стоит стрижка?» — «от 800 до 1 400», а не одна цена Каталога."""
    async def scenario(ids):
        intent = UserSearchIntent.model_validate({
            "info": {"kind": InfoKind.SERVICE_PRICE.value},
            "service_mentions": [{"surface": "стрижка"}],
        })
        async with async_session_maker() as db:
            result = await information.resolve(
                db, ids["sid"], intent, user_text="сколько стоит стрижка?",
                reference_now=datetime.now())
        item = result.facts.items[0]
        assert (item.price, item.price_max) == (800, 1400)
        text = fact_lines(result.facts, "ru")
        assert "от 800 Kč до 1 400 Kč" in text
        assert "from 800 Kč to 1 400 Kč" in fact_lines(result.facts, "en")
    _run(scenario)


# ─── Смена тренера у занятия ─────────────────────────────────────────────────

async def _lesson(ids, *, booked: bool) -> int:
    async with async_session_maker() as db:
        lesson = Lesson(studio_id=ids["sid"], name="Стрижка", teacher_name="Anna",
                        teacher_id=ids["anna"], service_id=ids["haircut"],
                        start_time=datetime.now().replace(microsecond=0) + timedelta(days=3),
                        duration_min=45, price=1400, level="", equipment="",
                        total_spots=1, status="confirmed")
        db.add(lesson)
        await db.flush()
        if booked:
            db.add(Reservation(client_id=ids["client"], lesson_id=lesson.id,
                               spot_number=1, status="active"))
        await db.commit()
        return lesson.id


async def _move_to_boris(ids, lesson_id) -> int:
    async with async_session_maker() as db:
        await update_lesson(lesson_id, LessonUpdateRequest(teacher_id=ids["boris"]),
                            ctx=await _ctx(ids, db), db=db, background_tasks=None)
    async with async_session_maker() as db:
        return (await db.get(Lesson, lesson_id)).price


def test_new_teacher_brings_his_price_to_an_empty_lesson():
    """Занятие перетащили в колонку Бориса — цена стала его."""
    async def scenario(ids):
        assert await _move_to_boris(ids, await _lesson(ids, booked=False)) == 800
    _run(scenario)


def test_booked_lesson_keeps_the_price_people_signed_up_for():
    """Люди записывались на 1400 — смена тренера цену задним числом не меняет."""
    async def scenario(ids):
        assert await _move_to_boris(ids, await _lesson(ids, booked=True)) == 1400
    _run(scenario)
