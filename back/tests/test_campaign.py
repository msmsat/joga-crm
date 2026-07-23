"""Кампании по сегменту (V5-4, задача 6): bulk-баллы и рассылка.

Реальная БД; run_campaign коммитит сам, поэтому чистим тестовые строки явно.
Запуск из back/:  python -m tests.test_campaign
"""
import asyncio
import warnings
from datetime import date, timedelta

warnings.filterwarnings("ignore")

from fastapi import HTTPException
from sqlalchemy import delete, select

from database import async_session_maker
from dependencies import StudioContext
from models import Client, ClientLoyaltyCard, LoyaltyPointTransaction, Studio
from routers.loyalty.segments import run_campaign
from schemas.loyalty import CampaignCreate


async def _seed() -> int:
    async with async_session_maker() as db:
        s = Studio(name="TEST-CAMPAIGN"); db.add(s); await db.flush()
        sid = s.id
        today = date.today()
        db.add(Client(studio_id=sid, name="A1", email="a1@x.com", is_active=True, status="active", last_visit_date=today - timedelta(days=30)))
        db.add(Client(studio_id=sid, name="A2", email="a2@x.com", is_active=True, status="active", last_visit_date=today - timedelta(days=30)))
        db.add(Client(studio_id=sid, name="A3", email=None, is_active=True, status="active", last_visit_date=today - timedelta(days=30)))
        await db.commit()
        return sid


async def _cleanup(sid: int) -> None:
    async with async_session_maker() as db:
        await db.execute(delete(LoyaltyPointTransaction).where(LoyaltyPointTransaction.studio_id == sid))
        await db.execute(delete(ClientLoyaltyCard).where(ClientLoyaltyCard.studio_id == sid))
        await db.execute(delete(Client).where(Client.studio_id == sid))
        await db.execute(delete(Studio).where(Studio.id == sid))
        await db.commit()


async def _run():
    sid = await _seed()
    ctx = StudioContext(user=None, studio_id=sid, role="owner")
    try:
        # points: обработано 3, писем 0, у каждого +200
        async with async_session_maker() as db:
            r = await run_campaign("at_risk", CampaignCreate(action="points", points=200), ctx=ctx, db=db)
        assert r.processed == 3 and r.emails_sent == 0, r
        async with async_session_maker() as db:
            bals = (await db.execute(select(ClientLoyaltyCard.points_balance).where(ClientLoyaltyCard.studio_id == sid))).scalars().all()
        assert sorted(bals) == [200, 200, 200], bals

        # email: обработано 3, писем 2 (клиент без email пропущен)
        async with async_session_maker() as db:
            r2 = await run_campaign("at_risk", CampaignCreate(action="email", message="hi"), ctx=ctx, db=db)
        assert r2.processed == 3 and r2.emails_sent == 2, r2

        # валидация
        for body in (CampaignCreate(action="points"), CampaignCreate(action="email", message="  ")):
            async with async_session_maker() as db:
                try:
                    await run_campaign("at_risk", body, ctx=ctx, db=db)
                    raise AssertionError("expected 400")
                except HTTPException as e:
                    assert e.status_code == 400

        # неизвестный сегмент
        async with async_session_maker() as db:
            try:
                await run_campaign("nope", CampaignCreate(action="points", points=1), ctx=ctx, db=db)
                raise AssertionError("expected 404")
            except HTTPException as e:
                assert e.status_code == 404
    finally:
        await _cleanup(sid)


def test_campaign():
    asyncio.run(_run())


if __name__ == "__main__":
    test_campaign()
    print("ALL PASS")
