"""Список студий и ленты: владелец находится, деньги не смешиваются.

Запуск из back/:  pytest tests/test_admin_accounts.py -v
"""
import warnings

warnings.filterwarnings("ignore")

import uuid
from datetime import datetime

import pytest_asyncio
from sqlalchemy import delete

from database import async_session_maker
from models import PlatformRevenueLedger, Studio, StudioBillingPlan, StudioMember, User


@pytest_asyncio.fixture
async def account():
    tag = uuid.uuid4().hex[:8]
    async with async_session_maker() as db:
        owner = User(
            email=f"owner-{tag}@velora-test.invalid", name="Владелец",
            hashed_password="x", created_at=datetime.utcnow(),
        )
        db.add(owner)
        studio = Studio(name=f"TEST-ACC-{tag}", created_at=datetime.utcnow())
        db.add(studio)
        await db.flush()
        db.add(StudioMember(
            user_id=owner.id, studio_id=studio.id,
            role="owner", status="active", name="Владелец",
        ))
        db.add(StudioBillingPlan(studio_id=studio.id, plan_name="pro", status="active"))
        db.add(PlatformRevenueLedger(
            studio_id=studio.id, source="subscription", amount=9900,
            currency="eur", external_id=f"test-acc-{tag}",
        ))
        await db.commit()
        sid, uid = studio.id, owner.id

    yield {"studio_id": sid, "user_id": uid, "tag": tag}

    async with async_session_maker() as db:
        await db.execute(delete(PlatformRevenueLedger).where(PlatformRevenueLedger.studio_id == sid))
        await db.execute(delete(StudioBillingPlan).where(StudioBillingPlan.studio_id == sid))
        await db.execute(delete(StudioMember).where(StudioMember.studio_id == sid))
        await db.execute(delete(Studio).where(Studio.id == sid))
        await db.execute(delete(User).where(User.id == uid))
        await db.commit()


async def test_account_row_has_owner_and_money(account):
    from routers.admin.accounts import admin_accounts

    async with async_session_maker() as db:
        data = await admin_accounts(
            q=f"TEST-ACC-{account['tag']}", limit=10, offset=0, db=db, _claims={}
        )
    assert data["total"] == 1
    row = data["items"][0]
    assert row["owner"]["email"].startswith("owner-")
    assert row["plan"]["name"] == "pro"
    assert row["paid"] == [{"currency": "eur", "amount": 9900}]
    assert row["is_paying"] is True


async def test_search_by_owner_email(account):
    from routers.admin.accounts import admin_accounts

    async with async_session_maker() as db:
        data = await admin_accounts(
            q=f"owner-{account['tag']}", limit=10, offset=0, db=db, _claims={}
        )
    assert data["total"] == 1


async def test_payments_feed_lists_the_income(account):
    from routers.admin.feed import admin_payments

    async with async_session_maker() as db:
        data = await admin_payments(days=90, limit=100, db=db, _claims={})
    mine = [r for r in data["received"] if r["studio_id"] == account["studio_id"]]
    assert len(mine) == 1
    assert mine[0]["currency"] == "eur"
    assert mine[0]["amount"] == 9900


async def test_logins_feed_runs(account):
    from routers.admin.feed import admin_logins

    async with async_session_maker() as db:
        data = await admin_logins(days=7, limit=100, db=db, _claims={})
    assert isinstance(data["items"], list)
