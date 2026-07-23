"""expire_points (V5-7 Блок 3 / V5-8 Блок 2) — ленивое сгорание баллов старше
StudioLoyaltyConfig.expiry_period. Агрегатная формула (earned_old + spent_total),
эквивалентная FIFO, идемпотентная. Реальная БД, откат.

Запуск из back/:  python -m tests.test_points_expiry
"""
import asyncio
import warnings
from datetime import datetime, timedelta

warnings.filterwarnings("ignore")

from sqlalchemy import select

import routers.clients.loyalty as L
from database import async_session_maker
from models import Client, ClientLoyaltyCard, LoyaltyPointTransaction, Studio, StudioLoyaltyConfig


async def _run():
    # ─── 500 баллов начислены 200 дней назад, expiry_period='6m' (180д) → сгорают все 500 ──
    async with async_session_maker() as db:
        s = Studio(name="TEST-POINTS-EXPIRY-FULL")
        db.add(s); await db.flush()
        sid = s.id

        client = Client(studio_id=sid, name="Anna", is_active=True)
        db.add(client); await db.flush()

        cfg = StudioLoyaltyConfig(studio_id=sid, is_enabled=True, expiry_period="6m")
        db.add(cfg); await db.flush()

        card = ClientLoyaltyCard(studio_id=sid, client_id=client.id, points_balance=500)
        db.add(card); await db.flush()
        db.add(LoyaltyPointTransaction(
            studio_id=sid, client_id=client.id, points=500, description="Начисление",
            created_at=datetime.utcnow() - timedelta(days=200),
        ))
        await db.flush()

        expired = await L.expire_points(db, sid, client.id)
        assert expired == 500

        await db.flush()
        await db.refresh(card)
        assert card.points_balance == 0

        # ─── Повторный вызов сразу после — идемпотентность, 0, баланс не в минус ──
        expired_again = await L.expire_points(db, sid, client.id)
        assert expired_again == 0

        await db.flush()
        await db.refresh(card)
        assert card.points_balance == 0

        await db.rollback()

    # ─── Свежие баллы (начислены только что) при expiry_period='6m' — не сгорают ──
    async with async_session_maker() as db:
        s = Studio(name="TEST-POINTS-EXPIRY-FRESH")
        db.add(s); await db.flush()
        sid = s.id

        client = Client(studio_id=sid, name="Boris", is_active=True)
        db.add(client); await db.flush()

        cfg = StudioLoyaltyConfig(studio_id=sid, is_enabled=True, expiry_period="6m")
        db.add(cfg); await db.flush()

        card = ClientLoyaltyCard(studio_id=sid, client_id=client.id, points_balance=300)
        db.add(card); await db.flush()
        db.add(LoyaltyPointTransaction(
            studio_id=sid, client_id=client.id, points=300, description="Начисление",
        ))
        await db.flush()

        expired = await L.expire_points(db, sid, client.id)
        assert expired == 0

        await db.flush()
        await db.refresh(card)
        assert card.points_balance == 300

        await db.rollback()

    # ─── Смешанный случай: 500 старых + 200 свежих + было списание 300 → сгорает 200 ──
    async with async_session_maker() as db:
        s = Studio(name="TEST-POINTS-EXPIRY-MIXED")
        db.add(s); await db.flush()
        sid = s.id

        client = Client(studio_id=sid, name="Cyril", is_active=True)
        db.add(client); await db.flush()

        cfg = StudioLoyaltyConfig(studio_id=sid, is_enabled=True, expiry_period="6m")
        db.add(cfg); await db.flush()

        # 500 старых (200д назад) + 200 свежих начислено, 300 уже потрачено -> баланс 400.
        card = ClientLoyaltyCard(studio_id=sid, client_id=client.id, points_balance=400)
        db.add(card); await db.flush()
        db.add(LoyaltyPointTransaction(
            studio_id=sid, client_id=client.id, points=500, description="Начисление старое",
            created_at=datetime.utcnow() - timedelta(days=200),
        ))
        db.add(LoyaltyPointTransaction(
            studio_id=sid, client_id=client.id, points=200, description="Начисление свежее",
        ))
        db.add(LoyaltyPointTransaction(
            studio_id=sid, client_id=client.id, points=-300, description="Обычная трата",
        ))
        await db.flush()

        expired = await L.expire_points(db, sid, client.id)
        assert expired == 200  # max(0, 500 - 300) = 200

        await db.flush()
        await db.refresh(card)
        assert card.points_balance == 200  # 400 - 200 сгоревших, свежие 200 не тронуты

        await db.rollback()

    # ─── expiry_period='never' (дефолт) → 0 без побочных эффектов ─────────────
    async with async_session_maker() as db:
        s = Studio(name="TEST-POINTS-EXPIRY-NEVER")
        db.add(s); await db.flush()
        sid = s.id

        client = Client(studio_id=sid, name="Dana", is_active=True)
        db.add(client); await db.flush()

        cfg = StudioLoyaltyConfig(studio_id=sid, is_enabled=True)  # expiry_period default "never"
        db.add(cfg); await db.flush()

        card = ClientLoyaltyCard(studio_id=sid, client_id=client.id, points_balance=999)
        db.add(card); await db.flush()
        db.add(LoyaltyPointTransaction(
            studio_id=sid, client_id=client.id, points=999, description="Начисление",
            created_at=datetime.utcnow() - timedelta(days=1000),
        ))
        await db.flush()

        expired = await L.expire_points(db, sid, client.id)
        assert expired == 0

        await db.flush()
        await db.refresh(card)
        assert card.points_balance == 999  # не тронуто

        await db.rollback()

    # ─── Конфига StudioLoyaltyConfig нет у студии вообще → 0, не падает ───────
    async with async_session_maker() as db:
        s = Studio(name="TEST-POINTS-EXPIRY-NOCONFIG")
        db.add(s); await db.flush()
        sid = s.id

        client = Client(studio_id=sid, name="Elena", is_active=True)
        db.add(client); await db.flush()

        expired = await L.expire_points(db, sid, client.id)
        assert expired == 0

        await db.rollback()


def test_points_expiry():
    asyncio.run(_run())


if __name__ == "__main__":
    test_points_expiry()
    print("ALL PASS — points expiry V5-8 Блок 2 зелёные")
