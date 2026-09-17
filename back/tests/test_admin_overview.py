"""Арифметика обзора: воронка и деньги.

Главное здесь — что суммы в разных валютах НЕ складываются в одно число.
Это ровно та ошибка, которую в проекте уже ловили на счетах.

Запуск из back/:  pytest tests/test_admin_overview.py -v
"""
import warnings

warnings.filterwarnings("ignore")

import uuid
from datetime import datetime, timedelta

import pytest_asyncio
from sqlalchemy import delete

from database import async_session_maker
from models import LandingVisit, PlatformRevenueLedger, Studio, StudioBillingPlan, User
from services.platform_stats import money_by_currency, period_bounds


@pytest_asyncio.fixture
async def seeded():
    tag = uuid.uuid4().hex[:8]
    anon = f"test-{tag}"
    async with async_session_maker() as db:
        studio = Studio(name=f"TEST-OVW-{tag}", created_at=datetime.utcnow())
        db.add(studio)
        await db.flush()
        sid = studio.id
        db.add(
            StudioBillingPlan(
                studio_id=sid,
                plan_name="free_trial",
                status="trial",
                trial_started_at=datetime.utcnow() - timedelta(days=2),
                expires_at=datetime.utcnow() + timedelta(days=28),
            )
        )
        db.add(
            User(
                email=f"{tag}@velora-test.invalid",
                name="Тест",
                hashed_password="x",
                created_at=datetime.utcnow(),
                signup_anon_id=anon,
            )
        )
        db.add(LandingVisit(anon_id=anon, path="/", device="desktop", country="CZ"))
        db.add(
            PlatformRevenueLedger(
                studio_id=sid, source="subscription", amount=3900,
                currency="eur", external_id=f"test-{tag}-eur",
            )
        )
        db.add(
            PlatformRevenueLedger(
                studio_id=sid, source="offline_fee", amount=25000,
                currency="czk", external_id=f"test-{tag}-czk",
            )
        )
        await db.commit()

    yield {"studio_id": sid, "anon": anon, "tag": tag}

    async with async_session_maker() as db:
        await db.execute(delete(PlatformRevenueLedger).where(PlatformRevenueLedger.studio_id == sid))
        await db.execute(delete(StudioBillingPlan).where(StudioBillingPlan.studio_id == sid))
        await db.execute(delete(LandingVisit).where(LandingVisit.anon_id == anon))
        await db.execute(delete(User).where(User.signup_anon_id == anon))
        await db.execute(delete(Studio).where(Studio.id == sid))
        await db.commit()


def test_period_bounds_covers_whole_days():
    start, end = period_bounds(7)
    assert (end - start).days == 7


def test_period_bounds_clamps_absurd_input():
    # days=100000 иначе превращается в полный скан таблицы.
    start, end = period_bounds(100000)
    assert (end - start).days == 365


async def test_money_is_split_by_currency(seeded):
    async with async_session_maker() as db:
        rows = await money_by_currency(db, *period_bounds(30))
    by = {r["currency"]: r["amount"] for r in rows}
    # Именно две отдельные строки: 3900 центов и 25000 галержей — это НЕ 28900
    # чего бы то ни было.
    assert by["eur"] >= 3900
    assert by["czk"] >= 25000
    assert all(len(key) == 3 for key in by)


async def test_overview_funnel_links_visit_to_registration(seeded):
    from routers.admin.overview import admin_overview

    async with async_session_maker() as db:
        data = await admin_overview(days=30, db=db, _claims={})
    assert data["funnel"]["visits"] >= 1
    assert data["funnel"]["registrations_from_landing"] >= 1
    assert data["paying_studios"] >= 1


async def test_traffic_groups_sources(seeded):
    from routers.admin.overview import admin_traffic

    async with async_session_maker() as db:
        data = await admin_traffic(days=30, db=db, _claims={})
    assert any(row["visits"] > 0 for row in data["by_day"])
    # Визит без referrer и без utm — это "direct", а не пустая строка.
    assert any(row["key"] == "direct" for row in data["sources"])
    assert any(row["code"] == "CZ" for row in data["countries"])


def test_source_key_prefers_utm_then_referrer_host():
    from routers.admin.overview import _source_of

    assert _source_of("https://www.google.com/search?q=x", None) == "google.com"
    assert _source_of("https://www.google.com/", "newsletter") == "newsletter"
    assert _source_of(None, None) == "direct"
