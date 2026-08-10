"""Скидка новичку по реферальной ссылке применяется РОВНО ОДИН раз.

Проверяет разделение двух обещаний реферальной записи: бонус пригласившему
(`bonus_paid`) и скидка приглашённому (`discount_used`). Раньше скидка
ключевалась на `status == 'pending'`, и это ломалось с обеих сторон:

  - trigger_condition='registration' → запись становится 'completed' сразу при
    регистрации, и новичок не получал обещанные проценты НИКОГДА;
  - trigger_condition='first_visit' → до первого визита запись остаётся
    'pending', и скидка срабатывала на КАЖДОЙ покупке.

Плюс: resolve_price сам по себе ничего не гасит — брошенная сессия Stripe не
должна сжигать скидку (гасит только mark_used, вызываемый после оплаты).

Реальная БД, откат.

Запуск из back/:  python -m tests.test_referral_discount_once
"""
import asyncio
import warnings

warnings.filterwarnings("ignore")

from database import async_session_maker
from models import Client, ReferralRecord, Studio, StudioReferralConfig
from services.pricing import resolve_price

PRICE = 1000
DISCOUNT_PCT = 15
EXPECTED = PRICE - PRICE * DISCOUNT_PCT // 100  # 850


async def _fixture(db, name: str, status: str = "pending"):
    studio = Studio(name=name)
    db.add(studio)
    await db.flush()

    db.add(StudioReferralConfig(
        studio_id=studio.id, is_enabled=True, trigger_condition="first_visit",
        bonus_type="points", referrer_bonus=500, new_client_discount=DISCOUNT_PCT,
    ))
    referrer = Client(studio_id=studio.id, name="Referrer", is_active=True)
    referred = Client(studio_id=studio.id, name="Referred", is_active=True)
    db.add_all([referrer, referred])
    await db.flush()

    referral = ReferralRecord(
        studio_id=studio.id, referrer_client_id=referrer.id,
        referred_client_id=referred.id, status=status,
    )
    db.add(referral)
    await db.flush()
    return studio.id, referred, referral


async def _run():
    # ─── Скидка применяется, но resolve_price её НЕ гасит ───────────────────
    # Это и есть «брошенная корзина»: цену посчитали, оплаты не случилось.
    async with async_session_maker() as db:
        sid, referred, referral = await _fixture(db, "TEST-REFDISC-ONCE")

        first = await resolve_price(db, sid, referred.id, PRICE)
        assert first.final_price == EXPECTED, first.final_price
        assert first.referral_discount_applied == PRICE - EXPECTED
        assert first.referral is not None, "resolve_price обязан вернуть запись — её нужно гасить"
        await db.refresh(referral)
        assert referral.discount_used is False, "расчёт цены не должен сжигать скидку"

        # Повторный расчёт (клиент вернулся) — та же цена, скидка не потеряна.
        again = await resolve_price(db, sid, referred.id, PRICE)
        assert again.final_price == EXPECTED

        # Оплата состоялась → гасим.
        again.mark_used()
        await db.flush()
        await db.refresh(referral)
        assert referral.discount_used is True

        # Следующая покупка — уже по полной цене.
        second = await resolve_price(db, sid, referred.id, PRICE)
        assert second.final_price == PRICE, "скидка новичку сработала дважды"
        assert second.referral is None

        await db.rollback()

    # ─── Регрессия 'registration': запись completed, скидка ВСЁ РАВНО даётся ─
    async with async_session_maker() as db:
        sid, referred, referral = await _fixture(db, "TEST-REFDISC-REG", status="completed")

        resolved = await resolve_price(db, sid, referred.id, PRICE)
        assert resolved.final_price == EXPECTED, (
            "при триггере 'registration' бонус уже выдан и статус completed — "
            "но скидка новичку ещё не использована и обязана примениться"
        )

        resolved.mark_used()
        await db.flush()
        assert (await resolve_price(db, sid, referred.id, PRICE)).final_price == PRICE

        await db.rollback()

    # ─── Отменённый реферал скидки не даёт ──────────────────────────────────
    async with async_session_maker() as db:
        sid, referred, _ = await _fixture(db, "TEST-REFDISC-CANCELLED", status="cancelled")

        resolved = await resolve_price(db, sid, referred.id, PRICE)
        assert resolved.final_price == PRICE
        assert resolved.referral is None

        await db.rollback()

    # ─── Программа выключена → скидки нет ───────────────────────────────────
    async with async_session_maker() as db:
        from sqlalchemy import select

        sid, referred, _ = await _fixture(db, "TEST-REFDISC-OFF")
        cfg = (await db.execute(
            select(StudioReferralConfig).where(StudioReferralConfig.studio_id == sid)
        )).scalar_one()
        cfg.is_enabled = False
        await db.flush()

        assert (await resolve_price(db, sid, referred.id, PRICE)).final_price == PRICE

        await db.rollback()

    # ─── Клиент без реферала: полная цена ───────────────────────────────────
    async with async_session_maker() as db:
        studio = Studio(name="TEST-REFDISC-NOBODY")
        db.add(studio)
        await db.flush()
        db.add(StudioReferralConfig(
            studio_id=studio.id, is_enabled=True, trigger_condition="first_visit",
            bonus_type="points", referrer_bonus=500, new_client_discount=DISCOUNT_PCT,
        ))
        solo = Client(studio_id=studio.id, name="Solo", is_active=True)
        db.add(solo)
        await db.flush()

        assert (await resolve_price(db, studio.id, solo.id, PRICE)).final_price == PRICE

        await db.rollback()


def test_referral_discount_once():
    asyncio.run(_run())


if __name__ == "__main__":
    test_referral_discount_once()
    print("ALL PASS — скидка новичку одноразовая, 'registration' не теряет её")
