"""POST /finances/operations с client_id (V5-8, Блок 3, Вариант A) — доходная
операция с привязкой к клиенту теперь ведёт себя как настоящая покупка для
лояльности: accrue_points (баллы по курсу) + register_purchase (total_spent/
уровень/кэшбек), как и касса/абонементы. Реальная БД, откат.

Запуск из back/:  python -m tests.test_operation_client_loyalty
"""
import asyncio
import warnings
from datetime import date

warnings.filterwarnings("ignore")

from sqlalchemy import select

import routers.finances.operations as O
from database import async_session_maker
from dependencies import StudioContext
from models import Client, ClientLoyaltyCard, Studio, StudioDiscountConfig, User
from schemas.finances.operations import OperationCreate


def _user():
    return User(email="owner@test.local", hashed_password="x", name="Owner", last_name="Test")


def _ctx(studio_id):
    return StudioContext(user=_user(), studio_id=studio_id, role="owner")


async def _run():
    # ─── Доход с client_id → total_spent растёт (register_purchase вызван) ────
    async with async_session_maker() as db:
        s = Studio(name="TEST-OP-CLIENT-LOYALTY")
        db.add(s); await db.flush()
        sid = s.id

        client = Client(studio_id=sid, name="Anna", is_active=True)
        db.add(client); await db.flush()

        body = OperationCreate(
            type="in", title="Оплата наличными мимо кассы", amount=1000,
            op_date=date.today(), client_id=client.id,
        )
        await O.create_operation(body, _ctx(sid), db)

        card = (await db.execute(
            select(ClientLoyaltyCard).where(ClientLoyaltyCard.client_id == client.id)
        )).scalar_one()
        assert card.total_spent == 1000  # register_purchase отработал

        await db.rollback()

    # ─── Кэшбек-конфиг включён → баллы начислены и через register_purchase тоже ──
    async with async_session_maker() as db:
        s = Studio(name="TEST-OP-CLIENT-LOYALTY-CASHBACK")
        db.add(s); await db.flush()
        sid = s.id

        client = Client(studio_id=sid, name="Boris", is_active=True)
        db.add(client); await db.flush()

        cfg = StudioDiscountConfig(studio_id=sid, is_enabled=True, discount_type="cashback", discount_value=5)
        db.add(cfg); await db.flush()

        body = OperationCreate(
            type="in", title="Оплата наличными", amount=1000,
            op_date=date.today(), client_id=client.id,
        )
        await O.create_operation(body, _ctx(sid), db)

        card = (await db.execute(
            select(ClientLoyaltyCard).where(ClientLoyaltyCard.client_id == client.id)
        )).scalar_one()
        assert card.total_spent == 1000
        assert card.points_balance == 50  # 5% кэшбек от register_purchase

        await db.rollback()

    # ─── Расход (type="out") с client_id → лояльность не трогается ────────────
    async with async_session_maker() as db:
        s = Studio(name="TEST-OP-CLIENT-LOYALTY-OUT")
        db.add(s); await db.flush()
        sid = s.id

        client = Client(studio_id=sid, name="Cyril", is_active=True)
        db.add(client); await db.flush()

        body = OperationCreate(
            type="out", title="Возврат клиенту", amount=500,
            op_date=date.today(), client_id=client.id,
        )
        await O.create_operation(body, _ctx(sid), db)

        card = (await db.execute(
            select(ClientLoyaltyCard).where(ClientLoyaltyCard.client_id == client.id)
        )).scalar_one_or_none()
        assert card is None  # ни accrue_points, ни register_purchase не вызывались

        await db.rollback()

    # ─── Доход без client_id → карта лояльности не создаётся ──────────────────
    async with async_session_maker() as db:
        s = Studio(name="TEST-OP-CLIENT-LOYALTY-NOCLIENT")
        db.add(s); await db.flush()
        sid = s.id

        body = OperationCreate(
            type="in", title="Прочий доход", amount=1000, op_date=date.today(),
        )
        result = await O.create_operation(body, _ctx(sid), db)
        assert result.client_id is None

        await db.rollback()


def test_operation_client_loyalty():
    asyncio.run(_run())


if __name__ == "__main__":
    test_operation_client_loyalty()
    print("ALL PASS — operation client loyalty V5-8 Блок 3 зелёные")
