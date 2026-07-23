"""register_purchase (V5-6, задача 1.2) — total_spent/уровень/кэшбек при оплате.
Реальная БД, откат.

Запуск из back/:  python -m tests.test_register_purchase
"""
import asyncio
import warnings

warnings.filterwarnings("ignore")

from sqlalchemy import select

import routers.clients.loyalty as L
from database import async_session_maker
from models import Client, ClientLoyaltyCard, LoyaltyLevel, Studio, StudioDiscountConfig


async def _run():
    # ─── Порог уровня: сумма пересекает 10000 → «Золото» ────────────────────
    async with async_session_maker() as db:
        s = Studio(name="TEST-REGISTER-PURCHASE")
        db.add(s); await db.flush()
        sid = s.id

        client = Client(studio_id=sid, name="Anna", is_active=True)
        db.add(client); await db.flush()

        await L.register_purchase(db, sid, client.id, 9_500)
        await L.register_purchase(db, sid, client.id, 1_000)  # total_spent 10500 -> Золото

        card = (await db.execute(
            select(ClientLoyaltyCard).where(ClientLoyaltyCard.client_id == client.id)
        )).scalar_one()
        assert card.total_spent == 10_500

        gold = (await db.execute(
            select(LoyaltyLevel).where(LoyaltyLevel.studio_id == sid, LoyaltyLevel.name == "Золото")
        )).scalar_one()
        assert card.level_id == gold.id

        await db.rollback()

    # ─── Кэшбек: StudioDiscountConfig discount_type='cashback' начисляет баллы ──
    async with async_session_maker() as db:
        s = Studio(name="TEST-REGISTER-PURCHASE-CASHBACK")
        db.add(s); await db.flush()
        sid = s.id

        client = Client(studio_id=sid, name="Boris", is_active=True)
        db.add(client); await db.flush()

        cfg = StudioDiscountConfig(studio_id=sid, is_enabled=True, discount_type="cashback", discount_value=5)
        db.add(cfg); await db.flush()

        await L.register_purchase(db, sid, client.id, 1_000)  # 5% -> 50 баллов

        card = (await db.execute(
            select(ClientLoyaltyCard).where(ClientLoyaltyCard.client_id == client.id)
        )).scalar_one()
        assert card.total_spent == 1_000
        assert card.points_balance == 50

        await db.rollback()

    # ─── Cashback выключен/не настроен → без начисления баллов ──────────────
    async with async_session_maker() as db:
        s = Studio(name="TEST-REGISTER-PURCHASE-NOCASHBACK")
        db.add(s); await db.flush()
        sid = s.id

        client = Client(studio_id=sid, name="Cyril", is_active=True)
        db.add(client); await db.flush()

        await L.register_purchase(db, sid, client.id, 1_000)

        card = (await db.execute(
            select(ClientLoyaltyCard).where(ClientLoyaltyCard.client_id == client.id)
        )).scalar_one()
        assert card.points_balance == 0

        await db.rollback()

    # ─── amount <= 0 → no-op, карта даже не создаётся ────────────────────────
    async with async_session_maker() as db:
        s = Studio(name="TEST-REGISTER-PURCHASE-ZERO")
        db.add(s); await db.flush()
        sid = s.id

        client = Client(studio_id=sid, name="Dana", is_active=True)
        db.add(client); await db.flush()

        await L.register_purchase(db, sid, client.id, 0)

        card = (await db.execute(
            select(ClientLoyaltyCard).where(ClientLoyaltyCard.client_id == client.id)
        )).scalar_one_or_none()
        assert card is None

        await db.rollback()


def test_register_purchase():
    asyncio.run(_run())


if __name__ == "__main__":
    test_register_purchase()
    print("ALL PASS — register_purchase V5-6 1.2 зелёные")
