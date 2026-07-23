"""Реферальная программа — инвайт-код + триггер 'первая оплата' (V5-6, 1.4).

Клиент B заведён по коду клиента A; первая оплата B начисляет реферу (A) бонус
ровно один раз; вторая оплата B бонус не повторяет.
Реальная БД, откат.

Запуск из back/:  python -m tests.test_referral_first_payment
"""
import asyncio
import importlib
import warnings

warnings.filterwarnings("ignore")

from sqlalchemy import select

import routers.clients.loyalty as L
from database import async_session_maker
from dependencies import StudioContext
from models import Client, ClientLoyaltyCard, ReferralRecord, Studio, StudioReferralConfig, User
from schemas.clients.clients import ClientCreate

PROFILES = importlib.import_module("routers.clients.profiles")
REFERRALS = importlib.import_module("routers.clients.referrals")


def _user():
    return User(email="owner@test.local", hashed_password="x", name="Owner", last_name="Test")


def _ctx(studio_id, role="owner"):
    return StudioContext(user=_user(), studio_id=studio_id, role=role)


async def _run():
    current_user = _user()

    # ─── Инвайт-код: лениво создаётся, стабилен между вызовами ──────────────
    async with async_session_maker() as db:
        s = Studio(name="TEST-REFERRAL-CODE")
        db.add(s); await db.flush()
        sid = s.id

        client_a = Client(studio_id=sid, name="Referrer", is_active=True)
        db.add(client_a); await db.flush()

        r1 = await REFERRALS.get_invite_code(client_a.id, _ctx(sid), db)
        r2 = await REFERRALS.get_invite_code(client_a.id, _ctx(sid), db)
        assert r1.invite_code == r2.invite_code
        assert len(r1.invite_code) == 8

        await db.rollback()

    # ─── B заведён по коду A → ReferralRecord(pending); первая оплата B ──────
    # начисляет A бонус ровно один раз; вторая оплата не повторяет.
    async with async_session_maker() as db:
        s = Studio(name="TEST-REFERRAL-PAYMENT")
        db.add(s); await db.flush()
        sid = s.id

        cfg = StudioReferralConfig(
            studio_id=sid, is_enabled=True, trigger_condition="first_payment",
            bonus_type="points", referrer_bonus=500,
        )
        db.add(cfg); await db.flush()

        client_a = Client(studio_id=sid, name="Referrer", is_active=True)
        db.add(client_a); await db.flush()
        card_a = ClientLoyaltyCard(studio_id=sid, client_id=client_a.id)
        db.add(card_a); await db.flush()

        invite = await REFERRALS.get_invite_code(client_a.id, _ctx(sid), db)

        body = ClientCreate(
            name="Referred", phone="1", email="b@test.local", city="Msk",
            invite_code=invite.invite_code,
        )
        created = await PROFILES.create_client(body, _ctx(sid), current_user, db)
        client_b_id = created.id

        referral = (await db.execute(
            select(ReferralRecord).where(ReferralRecord.referred_client_id == client_b_id)
        )).scalar_one()
        assert referral.referrer_client_id == client_a.id
        assert referral.status == "pending"
        assert referral.bonus_paid is False

        # Первая оплата B → бонус A начислен, referral завершён.
        await L.register_purchase(db, sid, client_b_id, 1000)
        await db.flush()  # register_purchase не коммитит — refresh() не автофлашит сам

        await db.refresh(card_a)
        assert card_a.points_balance == 500

        await db.refresh(referral)
        assert referral.status == "completed"
        assert referral.bonus_paid is True

        # Вторая оплата B → бонус НЕ повторяется (referral уже не pending).
        await L.register_purchase(db, sid, client_b_id, 1000)
        await db.flush()

        await db.refresh(card_a)
        assert card_a.points_balance == 500  # не выросло повторно

        await db.rollback()

    # ─── trigger_condition == 'first_visit' → register_purchase НЕ триггерит ──
    async with async_session_maker() as db:
        s = Studio(name="TEST-REFERRAL-WRONG-TRIGGER")
        db.add(s); await db.flush()
        sid = s.id

        cfg = StudioReferralConfig(
            studio_id=sid, is_enabled=True, trigger_condition="first_visit",
            bonus_type="points", referrer_bonus=500,
        )
        db.add(cfg); await db.flush()

        client_a = Client(studio_id=sid, name="Referrer", is_active=True)
        db.add(client_a); await db.flush()
        card_a = ClientLoyaltyCard(studio_id=sid, client_id=client_a.id)
        db.add(card_a); await db.flush()

        client_b = Client(studio_id=sid, name="Referred", is_active=True)
        db.add(client_b); await db.flush()
        db.add(ReferralRecord(
            studio_id=sid, referrer_client_id=client_a.id, referred_client_id=client_b.id, status="pending",
        ))
        await db.flush()

        await L.register_purchase(db, sid, client_b.id, 1000)
        await db.flush()

        await db.refresh(card_a)
        assert card_a.points_balance == 0  # first_visit — не наш триггер, молча пропускаем

        await db.rollback()

    # ─── Невалидный/чужой инвайт-код → ReferralRecord не создаётся ───────────
    async with async_session_maker() as db:
        s = Studio(name="TEST-REFERRAL-INVALID-CODE")
        db.add(s); await db.flush()
        sid = s.id

        body = ClientCreate(
            name="Solo", phone="2", email="solo@test.local", city="Msk",
            invite_code="NOSUCHCODE",
        )
        created = await PROFILES.create_client(body, _ctx(sid), current_user, db)

        referrals = (await db.execute(
            select(ReferralRecord).where(ReferralRecord.referred_client_id == created.id)
        )).scalars().all()
        assert referrals == []

        await db.rollback()


def test_referral_first_payment():
    asyncio.run(_run())


if __name__ == "__main__":
    test_referral_first_payment()
    print("ALL PASS — referral first_payment V5-6 1.4 зелёные")
