"""Свободное время всех индивидуальных услуг на день — одной операцией.

Мастер записи журнала сначала называет время и показывает только услуги, на
которые в это время можно записать. Ответ обязан совпадать с поштучным
`availability` по каждой паре «услуга × филиал» (иначе список обещал бы время,
которого quote не даст), а число запросов к базе — не расти с числом услуг:
ради этого операция и заведена вместо N вызовов с экрана.

Реальная БД, ручная чистка (как в test_staff_day). Запуск из back/:
    python -m pytest tests/test_services_day.py -q
"""
import asyncio
import warnings

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, insert

import test_staff_day as sd
from database import async_session_maker, get_db
from dependencies import StudioContext, get_studio_context
from models import Service, User
from ratelimit import limiter
from routers.schedule.router import router as schedule_router
from models.base import user_services
from schemas.schedule import hybrid
from services import resource_availability

warnings.filterwarnings("ignore")


@pytest.fixture(autouse=True)
def enabled(monkeypatch):
    monkeypatch.setattr(hybrid, "AVAILABLE_BOOKING_MODES", frozenset({"event", "resource", "hybrid"}))


async def _add_services(ids: dict, count: int, *, teachers: list[int]) -> list[int]:
    """Ещё индивидуальные услуги у тех же мастеров — разной длительности."""
    added = []
    async with async_session_maker() as db:
        for n in range(count):
            service = Service(studio_id=ids["studio"], name=f"Extra {n}", price=0,
                              duration_min=30 + 15 * n, service_type="individual", booking_mode="resource")
            db.add(service)
            await db.flush()
            for user_id in teachers:
                await db.execute(insert(user_services).values(user_id=user_id, service_id=service.id))
            added.append(service.id)
        await db.commit()
    return added


async def _drop_services(service_ids: list[int]) -> None:
    async with async_session_maker() as db:
        await db.execute(delete(user_services).where(user_services.c.service_id.in_(service_ids)))
        await db.execute(delete(Service).where(Service.id.in_(service_ids)))
        await db.commit()


async def _day(ids, db=None):
    if db is not None:
        return await resource_availability.services_day(db, studio_id=ids["studio"], day=sd.DAY, now=sd.NOW)
    async with async_session_maker() as session:
        return await resource_availability.services_day(session, studio_id=ids["studio"], day=sd.DAY, now=sd.NOW)


async def _single(ids, service_id: int, branch_id: int, *, client: bool = True):
    async with async_session_maker() as db:
        return await resource_availability.availability(
            db, studio_id=ids["studio"], service_id=service_id, branch_id=branch_id,
            date_from=sd.DAY, date_to=sd.DAY, now=sd.NOW, client=client)


async def _matches_single_availability(ids):
    """Каждая пара — ровно то, что дал бы поштучный `availability`: те же начала
    и те же мастера у каждого. Занятость мастера в середине дня учтена."""
    await sd._occupy(ids, ids["teacher"], 12, 60)
    extra = await _add_services(ids, 2, teachers=[ids["teacher"], ids["mate"]])
    try:
        days = await _day(ids)
        assert {(row.service_id, row.branch_id) for row in days} == {
            (service_id, ids["branch_a"]) for service_id in [ids["service"], *extra]}, \
            "пары — только там, где услугу кто-то ведёт: оба мастера назначены на филиал A"
        for row in days:
            single = await _single(ids, row.service_id, row.branch_id)
            assert row.availability.reason == single.reason
            got = [(slot.starts_at, sorted(slot.teacher_ids)) for slot in row.availability.slots]
            want = [(slot.starts_at, sorted(slot.teacher_ids)) for slot in single.slots]
            assert got == want, f"услуга {row.service_id}: список разошёлся с availability"
            assert got, "мастера на смене — свободное время обязано быть"
    finally:
        await _drop_services(extra)


async def _query_count_does_not_grow_with_services(ids, monkeypatch):
    async def measure():
        async with async_session_maker() as db:
            queries = []
            original = db.execute

            async def counted(query, *args, **kwargs):
                queries.append(str(query))
                return await original(query, *args, **kwargs)

            monkeypatch.setattr(db, "execute", counted)
            return len(await _day(ids, db)), len(queries)

    few, few_queries = await measure()
    extra = await _add_services(ids, 5, teachers=[ids["teacher"], ids["mate"]])
    try:
        many, many_queries = await measure()
    finally:
        await _drop_services(extra)
    assert (few, many) == (1, 6)
    assert few_queries == many_queries, (few_queries, many_queries)


async def _http_answers_in_minutes(ids):
    """Эндпоинт отдаёт начала минутами от местной полуночи — те же, что у
    `availability`, только без объекта на каждое начало."""
    app = FastAPI()
    app.state.limiter = limiter
    app.include_router(schedule_router, prefix="/schedule")

    async def session():
        async with async_session_maker() as db:
            yield db

    async def context():
        async with async_session_maker() as db:
            user = await db.get(User, ids["teacher"])
        return StudioContext(user=user, studio_id=ids["studio"], role="owner")

    app.dependency_overrides[get_db] = session
    app.dependency_overrides[get_studio_context] = context
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as http:
        answer = await http.get("/schedule/availability/services", params={"day": sd.DAY.isoformat()})
    assert answer.status_code == 200, answer.text
    rows = answer.json()["services"]
    assert [(row["service_id"], row["branch_id"]) for row in rows] == [(ids["service"], ids["branch_a"])]
    # CRM считает поминутно (client=False) — эталон в том же режиме.
    single = await _single(ids, ids["service"], ids["branch_a"], client=False)
    assert rows[0]["free"] == [slot.local_start.hour * 60 + slot.local_start.minute for slot in single.slots]


def test_services_day_against_the_database(monkeypatch):
    async def run():
        ids = await sd._seed()
        try:
            await _query_count_does_not_grow_with_services(ids, monkeypatch)
            await _http_answers_in_minutes(ids)
            await _matches_single_availability(ids)
        finally:
            await sd._cleanup(ids)

    asyncio.run(run())
