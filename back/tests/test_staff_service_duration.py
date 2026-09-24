"""Индивидуальная длительность услуги у мастера: чему равна и что попадает в «от–до».

Сосед `test_staff_service_price.py` и по той же причине: длительность мастера
не видна ни типам, ни сборке, а ошибка в ней — это слот, который накрывает
чужую запись, или «45 минут» на витрине при часе в Журнале.

Сид тот же, что у цены (`_seed`), плюс своё время мастерам: anna — 45 минут,
boris — 90, clara — без своего (наследует 30), dima — уволен с 600 (в диапазон
попасть не смеет).

Запуск из back/:  python -m pytest tests/test_staff_service_duration.py -q
"""
import asyncio

from sqlalchemy import update

from database import async_session_maker
from models import Service
from models.base import user_services
from services import service_pricing
from test_staff_service_price import _cleanup, _seed


def _run(scenario):
    ids = asyncio.run(_seed())
    try:
        asyncio.run(_own_durations(ids))
        asyncio.run(scenario(ids))
    finally:
        asyncio.run(_cleanup(ids))


async def _own_durations(ids: dict) -> None:
    async with async_session_maker() as db:
        for key, minutes in (("anna", 45), ("boris", 90), ("dima", 600)):
            await db.execute(update(user_services).where(
                user_services.c.user_id == ids[key],
                user_services.c.service_id == ids["haircut"]).values(duration_min=minutes))
        await db.commit()


def test_duration_is_the_masters_own_or_the_services_one():
    async def scenario(ids):
        async with async_session_maker() as db:
            service = await db.get(Service, ids["haircut"])
            assert await service_pricing.duration_for(db, service, ids["anna"]) == 45
            assert await service_pricing.duration_for(db, service, ids["clara"]) == 30
            assert await service_pricing.duration_for(db, service, None) == 30
    _run(scenario)


def test_duration_range_spans_active_masters_only():
    async def scenario(ids):
        async with async_session_maker() as db:
            spans = await service_pricing.duration_ranges(
                db, ids["studio"], [ids["haircut"], ids["lonely"]])
            # Clara наследует 30, Boris — 90. Уволенный Dima с 600 — нет.
            assert (spans[ids["haircut"]].min, spans[ids["haircut"]].max) == (30, 90)
            assert spans[ids["lonely"]].is_range is False
            assert spans[ids["lonely"]].min == 30
    _run(scenario)


def test_durations_of_teachers_is_one_query_for_everyone():
    async def scenario(ids):
        async with async_session_maker() as db:
            service = await db.get(Service, ids["haircut"])
            seen = []
            original = db.execute

            async def counting(statement, *a, **kw):
                seen.append(statement)
                return await original(statement, *a, **kw)

            db.execute = counting
            found = await service_pricing.durations_of_teachers(
                db, service, [ids["anna"], ids["boris"], ids["clara"]])
            assert found == {ids["anna"]: 45, ids["boris"]: 90, ids["clara"]: 30}
            assert len(seen) == 1
    _run(scenario)


def test_masters_of_services_carry_their_duration():
    async def scenario(ids):
        async with async_session_maker() as db:
            found = await service_pricing.masters_of_services(db, ids["studio"], [ids["haircut"]])
            assert {m.user_id: m.duration_min for m in found[ids["haircut"]]} == {
                ids["anna"]: 45, ids["boris"]: 90, ids["clara"]: 30}
    _run(scenario)


def test_saving_durations_is_the_whole_truth_and_none_keeps_them():
    async def scenario(ids):
        async with async_session_maker() as db:
            # durations=None — о времени не говорили, своё время Анны живо.
            await service_pricing.apply_staff_prices(db, ids["anna"], ids["studio"], {})
            await db.commit()
        async with async_session_maker() as db:
            service = await db.get(Service, ids["haircut"])
            assert await service_pricing.duration_for(db, service, ids["anna"]) == 45

        async with async_session_maker() as db:
            await service_pricing.apply_staff_prices(
                db, ids["anna"], ids["studio"], {}, {ids["haircut"]: 50})
            await db.commit()
        async with async_session_maker() as db:
            own = await service_pricing.durations_of_staff(db, ids["anna"], ids["studio"])
            assert own[ids["haircut"]] == service_pricing.StaffDuration(duration_min=50, custom=True)

        async with async_session_maker() as db:
            await service_pricing.apply_staff_prices(db, ids["anna"], ids["studio"], {}, {})
            await db.commit()
        async with async_session_maker() as db:
            own = await service_pricing.durations_of_staff(db, ids["anna"], ids["studio"])
            assert own[ids["haircut"]] == service_pricing.StaffDuration(duration_min=30, custom=False)
    _run(scenario)
