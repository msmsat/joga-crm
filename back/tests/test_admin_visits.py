"""Лента заходов на лендинг и счёт «впервые пришедших».

Главное здесь — что «новый» считается по ВСЕЙ истории браузера, а не по
выбранному периоду: вернувшийся через месяц человек новым уже не бывает.

Запуск из back/:  pytest tests/test_admin_visits.py -v
"""
import warnings

warnings.filterwarnings("ignore")

import uuid
from datetime import datetime, timedelta

import pytest_asyncio
from sqlalchemy import delete

from database import async_session_maker
from models import LandingVisit


@pytest_asyncio.fixture
async def visitors():
    tag = uuid.uuid4().hex[:8]
    old = f"test-old-{tag}"
    fresh = f"test-new-{tag}"
    now = datetime.utcnow()
    async with async_session_maker() as db:
        # Заходил сорок дней назад и вернулся сегодня — вернувшийся.
        db.add(LandingVisit(anon_id=old, path="/", device="desktop",
                            created_at=now - timedelta(days=40)))
        db.add(LandingVisit(anon_id=old, path="/", device="desktop",
                            created_at=now - timedelta(minutes=5)))
        # Первый раз в жизни — новый.
        db.add(LandingVisit(anon_id=fresh, path="/", device="mobile",
                            created_at=now - timedelta(minutes=4)))
        await db.commit()

    yield {"old": old, "fresh": fresh}

    async with async_session_maker() as db:
        await db.execute(delete(LandingVisit).where(LandingVisit.anon_id.in_([old, fresh])))
        await db.commit()


async def test_feed_tells_new_from_returning(visitors):
    from routers.admin.feed import admin_visits

    async with async_session_maker() as db:
        data = await admin_visits(days=7, limit=1000, db=db, _claims={})

    rows = {row["anon_id"]: row for row in data["items"]}
    assert rows[visitors["fresh"]]["is_new"] is True
    assert rows[visitors["fresh"]]["visits_total"] == 1
    # Сегодняшний заход старого браузера — не первый, хотя в семидневное окно
    # попал только он: первый заход ищется по всей таблице.
    assert rows[visitors["old"]]["is_new"] is False
    assert rows[visitors["old"]]["visits_total"] == 2


async def test_overview_splits_new_and_returning(visitors):
    from routers.admin.overview import admin_overview

    async with async_session_maker() as db:
        data = await admin_overview(days=7, db=db, _claims={})

    assert data["new_visitors"] >= 1
    assert data["returning_visitors"] >= 1
    # Инвариант: каждый уникальный посетитель периода ровно один раз попал
    # либо в новых, либо в вернувшихся.
    assert data["new_visitors"] + data["returning_visitors"] == data["unique_visitors"]
    assert data["visits"] >= data["unique_visitors"]
