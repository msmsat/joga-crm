"""Аналитика продлений (V5-4, задача 7). Реальная БД, ручная чистка.
Запуск из back/:  python -m tests.test_retention
"""
import asyncio
import warnings
from datetime import date, datetime, timedelta

warnings.filterwarnings("ignore")

from sqlalchemy import delete, select

from database import async_session_maker
from dependencies import StudioContext
from models import Client, ClientSubscription, Studio
from routers.loyalty.segments import get_retention


async def _seed() -> int:
    async with async_session_maker() as db:
        s = Studio(name="TEST-RETENTION"); db.add(s); await db.flush()
        sid = s.id
        today = date.today()
        cA = Client(studio_id=sid, name="A", is_active=True)
        cB = Client(studio_id=sid, name="B", is_active=True)
        cC = Client(studio_id=sid, name="C", is_active=True)
        for c in (cA, cB, cC):
            db.add(c)
        await db.flush()

        def sub(cid, created, expires):
            db.add(ClientSubscription(client_id=cid, type="P", total_classes=10, used_classes=0,
                                      expires_at=expires, status="active", created_at=created))

        # A продлил (второй куплен через 5 дней после окончания первого)
        sub(cA.id, datetime.now() - timedelta(days=90), today - timedelta(days=60))
        sub(cA.id, datetime.now() - timedelta(days=55), today + timedelta(days=30))
        # B истёк, не продлил
        sub(cB.id, datetime.now() - timedelta(days=100), today - timedelta(days=40))
        # C ещё активен (не eligible)
        sub(cC.id, datetime.now() - timedelta(days=5), today + timedelta(days=85))
        await db.commit()
        return sid


async def _cleanup(sid: int) -> None:
    async with async_session_maker() as db:
        cids = (await db.execute(select(Client.id).where(Client.studio_id == sid))).scalars().all()
        if cids:
            await db.execute(delete(ClientSubscription).where(ClientSubscription.client_id.in_(cids)))
        await db.execute(delete(Client).where(Client.studio_id == sid))
        await db.execute(delete(Studio).where(Studio.id == sid))
        await db.commit()


async def _run():
    sid = await _seed()
    ctx = StudioContext(user=None, studio_id=sid, role="owner")
    try:
        async with async_session_maker() as db:
            r = await get_retention(ctx=ctx, db=db)
        assert r.has_data is True
        # eligible = A, B (первый истёк); renewed = A → 50%
        assert r.renewal_rate == 50, r.renewal_rate
        # 4 суба / 3 клиента = 1.3
        assert r.avg_packages_per_client == 1.3, r.avg_packages_per_client
        assert len(r.months) == 6
        assert sum(m.sold for m in r.months) == 4
        assert sum(m.renewed for m in r.months) == 1
    finally:
        await _cleanup(sid)

    # empty-state
    async with async_session_maker() as db:
        s = Studio(name="TEST-RETENTION-EMPTY"); db.add(s); await db.flush(); sid2 = s.id; await db.commit()
    try:
        async with async_session_maker() as db:
            r2 = await get_retention(ctx=StudioContext(user=None, studio_id=sid2, role="owner"), db=db)
        assert r2.has_data is False and r2.renewal_rate == 0 and len(r2.months) == 6
    finally:
        async with async_session_maker() as db:
            await db.execute(delete(Studio).where(Studio.id == sid2)); await db.commit()


def test_retention():
    asyncio.run(_run())


if __name__ == "__main__":
    test_retention()
    print("ALL PASS")
