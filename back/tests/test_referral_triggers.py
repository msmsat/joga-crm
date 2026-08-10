"""Реферальный бонус: все 3 триггера × все 3 типа бонуса (services/referral.py).

Владелец в CRM выбирает trigger_condition из {registration, first_visit,
first_payment} и bonus_type из {points, deposit, discount} — 9 сочетаний. До
объединения в fire_referral работали 2×2: 'registration' не срабатывал нигде, а
'discount' в одной копии кода не платил ничего (но ставил bonus_paid=True), в
другой — проводился деньгами на депозит.

Реальная БД, откат.

Запуск из back/:  python -m tests.test_referral_triggers
"""
import asyncio
import warnings

warnings.filterwarnings("ignore")

from sqlalchemy import select

from database import async_session_maker
from models import (
    Client, ClientLoyaltyCard, ClientOffer, ReferralRecord, Studio, StudioReferralConfig,
)
from services.referral import TRIGGERS, fire_referral

BONUS = 500


async def _fixture(db, trigger: str, bonus_type: str):
    """Студия с настроенной реферальной программой + пара «A пригласил B»."""
    studio = Studio(name=f"TEST-REF-{trigger}-{bonus_type}")
    db.add(studio)
    await db.flush()

    db.add(StudioReferralConfig(
        studio_id=studio.id, is_enabled=True, trigger_condition=trigger,
        bonus_type=bonus_type, referrer_bonus=BONUS, new_client_discount=15,
    ))
    referrer = Client(studio_id=studio.id, name="Referrer", is_active=True)
    referred = Client(studio_id=studio.id, name="Referred", is_active=True)
    db.add_all([referrer, referred])
    await db.flush()

    db.add(ClientLoyaltyCard(studio_id=studio.id, client_id=referrer.id))
    referral = ReferralRecord(
        studio_id=studio.id, referrer_client_id=referrer.id,
        referred_client_id=referred.id, status="pending",
    )
    db.add(referral)
    await db.flush()
    return studio.id, referrer, referred, referral


async def _payout(db, studio_id: int, referrer_id: int, bonus_type: str) -> int:
    """Сколько реально получил пригласивший — в единицах своего типа бонуса."""
    if bonus_type == "discount":
        offers = (await db.execute(
            select(ClientOffer).where(ClientOffer.client_id == referrer_id)
        )).scalars().all()
        # Оффер должен быть выдан в деньгах и в scope, который ищет resolve_price,
        # иначе он никогда не применится и «скидка» останется декорацией.
        assert all(o.discount_type == "amount" and o.scope == "renewal" for o in offers), offers
        return sum(o.value for o in offers)

    card = (await db.execute(
        select(ClientLoyaltyCard).where(ClientLoyaltyCard.client_id == referrer_id)
    )).scalar_one()
    await db.refresh(card)
    return card.points_balance if bonus_type == "points" else card.deposit_balance


async def _run():
    # ─── 9 сочетаний: правильный триггер платит ровно один раз ───────────────
    for trigger in TRIGGERS:
        for bonus_type in ("points", "deposit", "discount"):
            async with async_session_maker() as db:
                sid, referrer, referred, referral = await _fixture(db, trigger, bonus_type)
                label = f"{trigger}/{bonus_type}"

                paid = await fire_referral(db, sid, referred.id, trigger)
                await db.flush()
                assert paid is True, f"{label}: бонус не выдан"
                assert await _payout(db, sid, referrer.id, bonus_type) == BONUS, label

                await db.refresh(referral)
                assert referral.status == "completed", label
                assert referral.bonus_paid is True, label

                # Повторный вызов того же триггера не платит второй раз.
                assert await fire_referral(db, sid, referred.id, trigger) is False, label
                await db.flush()
                assert await _payout(db, sid, referrer.id, bonus_type) == BONUS, f"{label}: заплатили дважды"

                await db.rollback()

    # ─── Чужой триггер не платит: студия ждёт другого события ────────────────
    for configured in TRIGGERS:
        for fired in TRIGGERS:
            if fired == configured:
                continue
            async with async_session_maker() as db:
                sid, referrer, referred, referral = await _fixture(db, configured, "points")

                assert await fire_referral(db, sid, referred.id, fired) is False, f"{configured} != {fired}"
                await db.flush()
                assert await _payout(db, sid, referrer.id, "points") == 0
                await db.refresh(referral)
                assert referral.status == "pending"
                assert referral.bonus_paid is False

                await db.rollback()

    # ─── Программа выключена → не платим, обещание не гасим ──────────────────
    async with async_session_maker() as db:
        sid, referrer, referred, referral = await _fixture(db, "first_visit", "points")
        cfg = (await db.execute(
            select(StudioReferralConfig).where(StudioReferralConfig.studio_id == sid)
        )).scalar_one()
        cfg.is_enabled = False
        await db.flush()

        assert await fire_referral(db, sid, referred.id, "first_visit") is False
        await db.flush()
        assert await _payout(db, sid, referrer.id, "points") == 0
        await db.refresh(referral)
        assert referral.bonus_paid is False  # висит незакрытым, а не «выдан»

        await db.rollback()

    # ─── Неизвестный bonus_type: НЕ помечаем выплаченным ────────────────────
    # Молчаливое bonus_paid=True здесь и было старым багом 'discount' в public.py:
    # обещание исчезало, не будучи выполненным.
    async with async_session_maker() as db:
        sid, referrer, referred, referral = await _fixture(db, "first_visit", "points")
        cfg = (await db.execute(
            select(StudioReferralConfig).where(StudioReferralConfig.studio_id == sid)
        )).scalar_one()
        cfg.bonus_type = "carrier_pigeon"
        await db.flush()

        assert await fire_referral(db, sid, referred.id, "first_visit") is False
        await db.flush()
        await db.refresh(referral)
        assert referral.bonus_paid is False
        assert referral.status == "pending"

        await db.rollback()

    # ─── Клиент без реферала: тихо ничего ────────────────────────────────────
    async with async_session_maker() as db:
        studio = Studio(name="TEST-REF-NOBODY")
        db.add(studio)
        await db.flush()
        db.add(StudioReferralConfig(
            studio_id=studio.id, is_enabled=True, trigger_condition="first_visit",
            bonus_type="points", referrer_bonus=BONUS,
        ))
        solo = Client(studio_id=studio.id, name="Solo", is_active=True)
        db.add(solo)
        await db.flush()

        assert await fire_referral(db, studio.id, solo.id, "first_visit") is False

        await db.rollback()


def test_referral_triggers():
    asyncio.run(_run())


if __name__ == "__main__":
    test_referral_triggers()
    print("ALL PASS — реферальные триггеры 3x3 зелёные")
