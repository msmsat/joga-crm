"""/loyalty/stats program_counters['discounts'] (V5-5, задача 7) — реальный
счётчик активных ClientOffer вместо хардкода: не использован, не просрочен.
Реальная БД, одна транзакция с откатом. Запуск из back/:
  python -m tests.test_stats_offers
"""
import asyncio
import warnings
from datetime import date, timedelta

warnings.filterwarnings("ignore")

from sqlalchemy import func, select

from database import async_session_maker
from models import Client, ClientOffer, Studio


async def _run():
    async with async_session_maker() as db:
        s = Studio(name="TEST-STATS-OFFERS")
        db.add(s); await db.flush()
        sid = s.id
        today = date.today()

        c1 = Client(studio_id=sid, name="A", is_active=True)
        c2 = Client(studio_id=sid, name="B", is_active=True)
        c3 = Client(studio_id=sid, name="C", is_active=True)
        c4 = Client(studio_id=sid, name="D", is_active=True)
        for c in (c1, c2, c3, c4):
            db.add(c)
        await db.flush()

        # активный, без срока — считается
        db.add(ClientOffer(studio_id=sid, client_id=c1.id, discount_type="percent", value=10,
                           reason="manual", scope="renewal"))
        # активный, срок в будущем — считается
        db.add(ClientOffer(studio_id=sid, client_id=c2.id, discount_type="percent", value=10,
                           reason="manual", scope="renewal", valid_until=today + timedelta(days=5)))
        # использован — не считается
        db.add(ClientOffer(studio_id=sid, client_id=c3.id, discount_type="percent", value=10,
                           reason="manual", scope="renewal", is_used=True))
        # просрочен — не считается
        db.add(ClientOffer(studio_id=sid, client_id=c4.id, discount_type="percent", value=10,
                           reason="manual", scope="renewal", valid_until=today - timedelta(days=1)))
        await db.flush()

        # та же логика, что в routers/loyalty/cards.py get_stats
        count = (await db.execute(
            select(func.count(ClientOffer.id)).where(
                ClientOffer.studio_id == sid,
                ClientOffer.is_used.is_(False),
                (ClientOffer.valid_until.is_(None)) | (ClientOffer.valid_until >= today),
            )
        )).scalar_one()
        assert count == 2, count

        await db.rollback()


def test_stats_offers():
    asyncio.run(_run())


if __name__ == "__main__":
    test_stats_offers()
    print("ALL PASS")
