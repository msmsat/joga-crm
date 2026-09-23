"""Цены услуг сотрудника через сами ручки: PUT /staff и GET /staff/{id}.

ЗАЧЕМ ОТДЕЛЬНО ОТ test_staff_service_price. Тот проверяет ПРАВИЛО
(`services/service_pricing`), этот — как правило доезжает до владельца через
роутер. Два места, где это ломается незаметно:

1. «Поля нет» против «поле пустое». Правку ставки клиент шлёт без
   `service_prices`, и прочитать это как «снять все надбавки» значит молча
   вернуть услуги мастера к прайсу Каталога — владелец узнает об этом от
   клиента у стойки.
2. Цена на услугу, которую мастеру не назначили. Молча проглотить её нельзя:
   владелец увидел бы в интерфейсе сумму, которой в базе нет.

Реальная БД, ручная чистка. Запуск из back/:
    python -m pytest tests/test_staff_price_endpoints.py -q
"""
import asyncio
import warnings

import pytest
from fastapi import HTTPException
from sqlalchemy import delete, select

from database import async_session_maker
from dependencies import StudioContext
from models import Service, Studio, StudioMember, User
from models.base import user_services
from routers.staff.profiles import get_staff_profile, update_staff
from services import ai_tools
from schemas.settings.team import StaffServicePrice, StaffUpdate

warnings.filterwarnings("ignore")

# Домен НЕ .local: `StaffUpdate.email` проходит через EmailStr, а тот считает
# .local служебным именем и такой адрес не принимает. Тесты роутера обязаны
# собирать ровно то тело, что собирает форма.
_OWNER = "svc-price-owner@velora-test.com"
_TRAINER = "svc-price-trainer@velora-test.com"
_EMAILS = [_OWNER, _TRAINER]


async def _seed() -> dict:
    async with async_session_maker() as db:
        studio = Studio(name="TEST-SVC-PRICE", tz_iana="Europe/Prague", currency="EUR")
        db.add(studio)
        await db.flush()

        owner = User(email=_OWNER, hashed_password="x", name="Olga")
        trainer = User(email=_TRAINER, hashed_password="x", name="Irina")
        db.add_all([owner, trainer])
        await db.flush()
        db.add_all([
            StudioMember(user_id=owner.id, studio_id=studio.id, role="owner",
                         status="active", name="Olga"),
            StudioMember(user_id=trainer.id, studio_id=studio.id, role="trainer",
                         status="active", name="Irina", rate=100, rate_type="fixed"),
        ])

        haircut = Service(studio_id=studio.id, name="Haircut", price=300, duration_min=30)
        beard = Service(studio_id=studio.id, name="Beard", price=200, duration_min=20)
        spare = Service(studio_id=studio.id, name="Spare", price=700, duration_min=60)
        db.add_all([haircut, beard, spare])
        await db.flush()
        await db.commit()
        return {"sid": studio.id, "owner": owner.id, "trainer": trainer.id,
                "haircut": haircut.id, "beard": beard.id, "spare": spare.id}


async def _cleanup(sid: int) -> None:
    async with async_session_maker() as db:
        await db.execute(delete(user_services).where(user_services.c.service_id.in_(
            select(Service.id).where(Service.studio_id == sid))))
        await db.execute(delete(Service).where(Service.studio_id == sid))
        await db.execute(delete(StudioMember).where(StudioMember.studio_id == sid))
        await db.execute(delete(Studio).where(Studio.id == sid))
        await db.execute(delete(User).where(User.email.in_(_EMAILS)))
        await db.commit()


def _body(ids: dict, **over) -> StaffUpdate:
    """Тело правки сотрудника — как его собирает форма: имя и email целиком."""
    fields = {
        "name": "Irina", "email": _TRAINER, "role": "trainer",
        "rate": 100, "rate_type": "fixed",
        "service_ids": [ids["haircut"], ids["beard"]],
    }
    fields.update(over)
    return StaffUpdate(**fields)


async def _ctx(ids: dict, db) -> StudioContext:
    owner = (await db.execute(select(User).where(User.id == ids["owner"]))).scalar_one()
    return StudioContext(user=owner, studio_id=ids["sid"], role="owner")


async def _save(ids: dict, body: StaffUpdate) -> None:
    async with async_session_maker() as db:
        await update_staff(ids["trainer"], body, ctx=await _ctx(ids, db), db=db)


async def _services(ids: dict) -> dict[int, dict]:
    async with async_session_maker() as db:
        profile = await get_staff_profile(ids["trainer"], ctx=await _ctx(ids, db), db=db)
    return {row["id"]: row for row in profile["services"]}


def _run(scenario):
    ids = asyncio.run(_seed())
    try:
        asyncio.run(scenario(ids))
    finally:
        asyncio.run(_cleanup(ids["sid"]))


def test_profile_tells_own_price_apart_from_the_catalogue_one():
    async def scenario(ids):
        await _save(ids, _body(ids, service_prices=[
            StaffServicePrice(service_id=ids["haircut"], price=500),
        ]))
        rows = await _services(ids)
        # Стрижка — своя цена, борода досталась из Каталога. Интерфейс обязан
        # их различать: унаследованная поедет за правкой Каталога, своя — нет.
        assert (rows[ids["haircut"]]["price"], rows[ids["haircut"]]["price_custom"]) == (500, True)
        assert (rows[ids["beard"]]["price"], rows[ids["beard"]]["price_custom"]) == (200, False)
        # base_price — всегда цена Каталога, от неё владелец отсчитывает свою.
        assert rows[ids["haircut"]]["base_price"] == 300
    _run(scenario)


def test_update_without_the_field_keeps_the_prices():
    """Правка одной только ставки не смеет снять надбавки.

    Так карточку правят старые клиенты и ассистент, когда речь вообще не о
    деньгах за услуги. Прочитать отсутствие поля как «снять все» значит тихо
    вернуть мастера к прайсу Каталога."""
    async def scenario(ids):
        await _save(ids, _body(ids, service_prices=[
            StaffServicePrice(service_id=ids["haircut"], price=500),
        ]))
        await _save(ids, _body(ids, rate=250))          # service_prices не прислан
        rows = await _services(ids)
        assert (rows[ids["haircut"]]["price"], rows[ids["haircut"]]["price_custom"]) == (500, True)
    _run(scenario)


def test_empty_list_is_an_explicit_reset():
    """Пустой список — осознанное «снять все», а не то же самое, что «не прислали»."""
    async def scenario(ids):
        await _save(ids, _body(ids, service_prices=[
            StaffServicePrice(service_id=ids["haircut"], price=500),
        ]))
        await _save(ids, _body(ids, service_prices=[]))
        rows = await _services(ids)
        assert (rows[ids["haircut"]]["price"], rows[ids["haircut"]]["price_custom"]) == (300, False)
    _run(scenario)


def test_price_for_an_unassigned_service_is_rejected():
    """Цена на услугу, которой у мастера нет, — отказ, а не «назначить заодно».

    Иначе список услуг получил бы второй источник правды, и владелец увидел бы
    сумму на услуге, которую этот человек не оказывает."""
    async def scenario(ids):
        with pytest.raises(HTTPException) as failure:
            await _save(ids, _body(ids, service_prices=[
                StaffServicePrice(service_id=ids["spare"], price=900),
            ]))
        assert failure.value.status_code == 400
        # Отказ не оставил половины изменений: чужой услуги у мастера нет.
        assert ids["spare"] not in await _services(ids)
    _run(scenario)


def test_taking_the_service_away_takes_its_price():
    """Сняли услугу — своя цена ушла с ней, а не дождалась повторного назначения."""
    async def scenario(ids):
        await _save(ids, _body(ids, service_prices=[
            StaffServicePrice(service_id=ids["haircut"], price=500),
        ]))
        await _save(ids, _body(ids, service_ids=[ids["beard"]], service_prices=[]))
        await _save(ids, _body(ids))                    # стрижку вернули без цены
        rows = await _services(ids)
        assert (rows[ids["haircut"]]["price"], rows[ids["haircut"]]["price_custom"]) == (300, False)
    _run(scenario)


def test_zero_survives_the_round_trip():
    """Ноль — цена, а не отсутствие цены: бесплатная услуга у стажёра."""
    async def scenario(ids):
        await _save(ids, _body(ids, service_prices=[
            StaffServicePrice(service_id=ids["haircut"], price=0),
        ]))
        rows = await _services(ids)
        assert (rows[ids["haircut"]]["price"], rows[ids["haircut"]]["price_custom"]) == (0, True)
    _run(scenario)


def test_assistant_editing_the_rate_keeps_the_prices():
    """Ассистент правит ставку — надбавки остаются.

    Инструмент собирает тело из профиля, и не понеси он туда цены, каждая
    фраза «поставь Ирине 250 в час» тихо возвращала бы её услуги к прайсу
    Каталога. Заметить это на стороне модели невозможно: ответ был бы
    «готово», и он был бы правдой про ставку."""
    async def scenario(ids):
        await _save(ids, _body(ids, service_prices=[
            StaffServicePrice(service_id=ids["haircut"], price=500),
        ]))
        async with async_session_maker() as db:
            await ai_tools.update_staff(
                await _ctx(ids, db), db,
                ai_tools.UpdateStaffArgs(staff_id=ids["trainer"], rate=250, rate_type="hourly"),
            )
        rows = await _services(ids)
        assert (rows[ids["haircut"]]["price"], rows[ids["haircut"]]["price_custom"]) == (500, True)
    _run(scenario)


def test_assistant_can_set_a_price():
    """И наоборот: «у Ирины стрижка 700» — инструмент это умеет."""
    async def scenario(ids):
        await _save(ids, _body(ids))            # услуги мастеру уже назначены
        async with async_session_maker() as db:
            await ai_tools.update_staff(
                await _ctx(ids, db), db,
                ai_tools.UpdateStaffArgs(
                    staff_id=ids["trainer"],
                    service_prices=[ai_tools.StaffServicePriceArg(
                        service_id=ids["haircut"], price=700)],
                ),
            )
        rows = await _services(ids)
        assert (rows[ids["haircut"]]["price"], rows[ids["haircut"]]["price_custom"]) == (700, True)
        # Вторая услуга мастера не пострадала: он её по-прежнему делает.
        assert rows[ids["beard"]]["price_custom"] is False
    _run(scenario)


def test_assistant_dropping_a_service_does_not_choke_on_its_old_price():
    """Убрали услугу — её прежняя цена не превращается в отказ.

    Тело инструмента несёт цены, прочитанные из профиля. Останься там цена
    снятой услуги, роутер ответил бы 400 — формально честно, а по сути
    человек просил снять услугу, а не назначить ей цену."""
    async def scenario(ids):
        await _save(ids, _body(ids, service_prices=[
            StaffServicePrice(service_id=ids["haircut"], price=500),
        ]))
        async with async_session_maker() as db:
            await ai_tools.update_staff(
                await _ctx(ids, db), db,
                ai_tools.UpdateStaffArgs(staff_id=ids["trainer"], service_ids=[ids["beard"]]),
            )
        rows = await _services(ids)
        assert set(rows) == {ids["beard"]}
    _run(scenario)


def test_assistant_naming_an_unassigned_service_gets_a_refusal():
    """«У Ирины массаж 900», а массажа она не делает — отказ, а не тишина.

    Молча проглоченная цена стоила бы человеку «готово» в ответ и никакой
    цены в базе: он узнал бы об этом у стойки, а не в разговоре."""
    async def scenario(ids):
        await _save(ids, _body(ids))
        with pytest.raises(HTTPException) as failure:
            async with async_session_maker() as db:
                await ai_tools.update_staff(
                    await _ctx(ids, db), db,
                    ai_tools.UpdateStaffArgs(
                        staff_id=ids["trainer"],
                        service_prices=[ai_tools.StaffServicePriceArg(
                            service_id=ids["spare"], price=900)],
                    ),
                )
        assert failure.value.status_code == 400
    _run(scenario)
