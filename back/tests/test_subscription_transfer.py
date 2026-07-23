"""POST /clients/{id}/subscriptions/{sub_id}/transfer — передача абонемента
другому клиенту (V5-7, Блок 4.1). Реальная БД, откат.

Запуск из back/:  python -m tests.test_subscription_transfer
"""
import asyncio
import warnings
from datetime import date, timedelta

warnings.filterwarnings("ignore")

from fastapi import HTTPException
from sqlalchemy import select

from database import async_session_maker
from dependencies import StudioContext
from models import ActivityLog, Client, ClientSubscription, Studio, StudioSubscriptionProgramConfig, User
from routers.clients.subscriptions import transfer_subscription
from schemas.clients.subscriptions import SubscriptionTransferRequest


def _ctx(studio_id, role="owner"):
    user = User(email="owner@test.local", hashed_password="x", name="Owner", last_name="Test")
    return StudioContext(user=user, studio_id=studio_id, role=role)


async def _setup(db, *, allow_transfer=True):
    s = Studio(name="TEST-SUB-TRANSFER")
    db.add(s); await db.flush()
    sid = s.id

    db.add(StudioSubscriptionProgramConfig(studio_id=sid, is_enabled=True, allow_transfer=allow_transfer))

    a = Client(studio_id=sid, name="Alice", is_active=True)
    b = Client(studio_id=sid, name="Bob", is_active=True)
    db.add_all([a, b]); await db.flush()

    sub = ClientSubscription(
        client_id=a.id, type="8 занятий", total_classes=8, used_classes=2,
        expires_at=date.today() + timedelta(days=30), status="active",
    )
    db.add(sub); await db.flush()

    return sid, a, b, sub


async def _run():
    # ─── Успешная передача: остаток переносится, событие пишется обоим ──
    async with async_session_maker() as db:
        sid, a, b, sub = await _setup(db)

        result = await transfer_subscription(
            a.id, sub.id, SubscriptionTransferRequest(target_client_id=b.id), _ctx(sid), db,
        )
        assert result.remaining == 6

        await db.refresh(sub)
        assert sub.client_id == b.id

        logs = (await db.execute(select(ActivityLog).where(ActivityLog.studio_id == sid))).scalars().all()
        assert len(logs) == 2
        assert {l.entity_id for l in logs} == {a.id, b.id}

        await db.rollback()

    # ─── allow_transfer выключен → 400 loyalty.transfer_disabled ──
    async with async_session_maker() as db:
        sid, a, b, sub = await _setup(db, allow_transfer=False)

        try:
            await transfer_subscription(
                a.id, sub.id, SubscriptionTransferRequest(target_client_id=b.id), _ctx(sid), db,
            )
            raise AssertionError("ожидали 400")
        except HTTPException as e:
            assert e.status_code == 400
            assert e.detail["code"] == "loyalty.transfer_disabled"

        await db.refresh(sub)
        assert sub.client_id == a.id  # ничего не изменилось

        await db.rollback()

    # ─── Себе же — 400, без похода в БД за флагом ──
    async with async_session_maker() as db:
        sid, a, b, sub = await _setup(db)

        try:
            await transfer_subscription(
                a.id, sub.id, SubscriptionTransferRequest(target_client_id=a.id), _ctx(sid), db,
            )
            raise AssertionError("ожидали 400")
        except HTTPException as e:
            assert e.status_code == 400
            assert e.detail["code"] == "loyalty.transfer_self"

        await db.rollback()

    # ─── Исчерпанный абонемент (used == total) → 400 transfer_inactive ──
    async with async_session_maker() as db:
        sid, a, b, sub = await _setup(db)
        sub.used_classes = sub.total_classes
        await db.flush()

        try:
            await transfer_subscription(
                a.id, sub.id, SubscriptionTransferRequest(target_client_id=b.id), _ctx(sid), db,
            )
            raise AssertionError("ожидали 400")
        except HTTPException as e:
            assert e.status_code == 400
            assert e.detail["code"] == "loyalty.transfer_inactive"

        await db.rollback()


def test_subscription_transfer():
    asyncio.run(_run())


if __name__ == "__main__":
    test_subscription_transfer()
    print("ALL PASS — subscription transfer V5-7 4.1 зелёные")
