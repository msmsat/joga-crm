"""Автопродление абонемента за счёт депозита при attend → remaining == 0
(V5-7, Блок 4.2). Тестируем хелпер `_try_auto_renew` напрямую (не коммитит) —
он изолированно вызывается внутри attend_reservation одной транзакцией.
Реальная БД, откат.

Запуск из back/:  python -m tests.test_subscription_auto_renewal
"""
import asyncio
import warnings
from datetime import date, timedelta

warnings.filterwarnings("ignore")

from sqlalchemy import select

from database import async_session_maker
from models import (
    ActivityLog, Client, ClientLoyaltyCard, ClientSubscription, Operation, Studio,
    StudioSubscriptionProgramConfig, SubscriptionPackage,
)
from routers.schedule.reservations import _try_auto_renew


async def _setup(db, *, auto_renewal=True, package_active=True, deposit_balance=0):
    s = Studio(name="TEST-AUTO-RENEWAL")
    db.add(s); await db.flush()
    sid = s.id

    config = StudioSubscriptionProgramConfig(studio_id=sid, is_enabled=True, auto_renewal=auto_renewal)
    db.add(config); await db.flush()

    package = SubscriptionPackage(
        studio_id=sid, config_id=config.id, name="8 занятий", class_count=8,
        price=4000, per_visit_price=500, is_active=package_active, duration_days=90,
    )
    db.add(package); await db.flush()

    client = Client(studio_id=sid, name="Client", is_active=True)
    db.add(client); await db.flush()

    card = ClientLoyaltyCard(studio_id=sid, client_id=client.id, deposit_balance=deposit_balance)
    db.add(card); await db.flush()

    finished_sub = ClientSubscription(
        client_id=client.id, type=package.name, total_classes=8, used_classes=8,
        expires_at=date.today() + timedelta(days=1), status="finished", package_id=package.id,
    )
    db.add(finished_sub); await db.flush()

    return sid, client, package, card, finished_sub


async def _run():
    # ─── Депозита хватает + флаг включён → новый абонемент, депозит списан ──
    async with async_session_maker() as db:
        sid, client, package, card, finished_sub = await _setup(db, deposit_balance=4000)

        await _try_auto_renew(db, sid, client.id, finished_sub)
        await db.flush()

        subs = (await db.execute(
            select(ClientSubscription).where(ClientSubscription.client_id == client.id, ClientSubscription.status == "active")
        )).scalars().all()
        assert len(subs) == 1
        assert subs[0].total_classes == 8 and subs[0].used_classes == 0

        await db.refresh(card)
        assert card.deposit_balance == 0

        ops = (await db.execute(select(Operation).where(Operation.studio_id == sid))).scalars().all()
        assert ops == []  # price=0 — Operation не заводится (защита от двойного учёта дохода)

        logs = (await db.execute(select(ActivityLog).where(ActivityLog.studio_id == sid))).scalars().all()
        assert any("автопродлён" in l.title for l in logs)

        await db.rollback()

    # ─── Депозита не хватает → только событие, нового абонемента нет ──
    async with async_session_maker() as db:
        sid, client, package, card, finished_sub = await _setup(db, deposit_balance=1000)

        await _try_auto_renew(db, sid, client.id, finished_sub)
        await db.flush()

        subs = (await db.execute(
            select(ClientSubscription).where(ClientSubscription.client_id == client.id, ClientSubscription.status == "active")
        )).scalars().all()
        assert subs == []

        await db.refresh(card)
        assert card.deposit_balance == 1000  # не тронут

        logs = (await db.execute(select(ActivityLog).where(ActivityLog.studio_id == sid))).scalars().all()
        assert any("закончился" in l.title for l in logs)

        await db.rollback()

    # ─── auto_renewal выключен → только событие, депозит не тронут даже если хватает ──
    async with async_session_maker() as db:
        sid, client, package, card, finished_sub = await _setup(db, auto_renewal=False, deposit_balance=4000)

        await _try_auto_renew(db, sid, client.id, finished_sub)
        await db.flush()

        await db.refresh(card)
        assert card.deposit_balance == 4000

        subs = (await db.execute(
            select(ClientSubscription).where(ClientSubscription.client_id == client.id, ClientSubscription.status == "active")
        )).scalars().all()
        assert subs == []

        await db.rollback()

    # ─── Пакет снят с продажи → только событие ──
    async with async_session_maker() as db:
        sid, client, package, card, finished_sub = await _setup(db, package_active=False, deposit_balance=4000)

        await _try_auto_renew(db, sid, client.id, finished_sub)
        await db.flush()

        await db.refresh(card)
        assert card.deposit_balance == 4000

        await db.rollback()


def test_subscription_auto_renewal():
    asyncio.run(_run())


if __name__ == "__main__":
    test_subscription_auto_renewal()
    print("ALL PASS - subscription auto-renewal V5-7 4.2")
