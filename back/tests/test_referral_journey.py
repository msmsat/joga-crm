"""Путь приглашённого клиента целиком: регистрация → запись → покупка.

Юниты (test_referral_triggers, test_referral_discount_once) проверяют части.
Здесь — их взаимодействие, где и жил главный баг: выдача бонуса пригласившему
меняет `status` реферальной записи, и раньше это ГАСИЛО скидку приглашённому.
При триггере 'registration' обе вещи происходили в одну секунду, и новичок
терял обещанные проценты, ни разу их не увидев.

Инвариант, который держим для всех трёх триггеров:
  - пригласивший получает бонус РОВНО один раз;
  - приглашённый получает свою скидку РОВНО один раз;
  - момент выдачи бонуса не влияет на скидку и наоборот.

Реальная БД, откат.

Запуск из back/:  python -m tests.test_referral_journey
"""
import asyncio
import warnings

warnings.filterwarnings("ignore")

from sqlalchemy import select

import routers.clients.loyalty as L
from database import async_session_maker
from models import (
    Client, ClientLoyaltyCard, ReferralRecord, Studio, StudioReferralConfig,
)
from services.pricing import resolve_price
from services.referral import TRIGGERS, fire_referral

BONUS = 500
PRICE = 1000
DISCOUNT_PCT = 15
DISCOUNTED = PRICE - PRICE * DISCOUNT_PCT // 100  # 850


async def _journey(db, trigger: str):
    """Студия с триггером `trigger`; A пригласил B. Возвращает (sid, A, B, запись)."""
    studio = Studio(name=f"TEST-REF-JOURNEY-{trigger}")
    db.add(studio)
    await db.flush()

    db.add(StudioReferralConfig(
        studio_id=studio.id, is_enabled=True, trigger_condition=trigger,
        bonus_type="points", referrer_bonus=BONUS, new_client_discount=DISCOUNT_PCT,
    ))
    referrer = Client(studio_id=studio.id, name="Anna", is_active=True)
    db.add(referrer)
    await db.flush()
    db.add(ClientLoyaltyCard(studio_id=studio.id, client_id=referrer.id))

    # Шаг 1. B регистрируется по ссылке A — так это делает мини-приложение
    # (booking/miniapp._create_pending_referral) и карточка клиента в CRM.
    referred = Client(studio_id=studio.id, name="Katya", is_active=True)
    db.add(referred)
    await db.flush()
    referral = ReferralRecord(
        studio_id=studio.id, referrer_client_id=referrer.id,
        referred_client_id=referred.id, status="pending",
    )
    db.add(referral)
    await db.flush()
    await fire_referral(db, studio.id, referred.id, "registration", referred_name=referred.name)
    await db.flush()

    return studio.id, referrer, referred, referral


async def _points(db, client_id: int) -> int:
    card = (await db.execute(
        select(ClientLoyaltyCard).where(ClientLoyaltyCard.client_id == client_id)
    )).scalar_one()
    await db.refresh(card)
    return card.points_balance


async def _run():
    for trigger in TRIGGERS:
        async with async_session_maker() as db:
            sid, referrer, referred, referral = await _journey(db, trigger)

            # После регистрации бонус выдан только при своём триггере.
            expected_after_registration = BONUS if trigger == "registration" else 0
            assert await _points(db, referrer.id) == expected_after_registration, trigger

            # Шаг 2. B записывается на первое занятие (booking/public.py и
            # booking/miniapp_lessons.py зовут ровно это).
            await fire_referral(db, sid, referred.id, "first_visit", referred_name=referred.name)
            await db.flush()
            expected_after_visit = BONUS if trigger in ("registration", "first_visit") else 0
            assert await _points(db, referrer.id) == expected_after_visit, trigger

            # Шаг 3. B покупает абонемент. Скидка новичка обязана примениться
            # НЕЗАВИСИМО от того, выдан ли уже бонус пригласившему.
            resolved = await resolve_price(db, sid, referred.id, PRICE)
            assert resolved.final_price == DISCOUNTED, (
                f"{trigger}: приглашённый не получил обещанную скидку "
                f"({resolved.final_price} вместо {DISCOUNTED})"
            )

            # Оплата: гасим скидку и проводим покупку. register_purchase сам
            # дёргает триггер 'first_payment' — тот же путь, что у кассы CRM,
            # автосписания и Stripe мини-приложения.
            resolved.mark_used()
            await L.register_purchase(db, sid, referred.id, resolved.final_price)
            await db.flush()

            # Бонус выдан ровно один раз — каким бы ни был триггер.
            assert await _points(db, referrer.id) == BONUS, (
                f"{trigger}: бонус пригласившему выдан {await _points(db, referrer.id)} вместо {BONUS}"
            )
            await db.refresh(referral)
            assert referral.bonus_paid is True, trigger
            assert referral.status == "completed", trigger

            # Шаг 4. Вторая покупка — полная цена, бонус не повторяется.
            second = await resolve_price(db, sid, referred.id, PRICE)
            assert second.final_price == PRICE, f"{trigger}: скидка новичка сработала дважды"
            await L.register_purchase(db, sid, referred.id, second.final_price)
            await db.flush()
            assert await _points(db, referrer.id) == BONUS, f"{trigger}: бонус выдан дважды"

            await db.rollback()


def test_referral_journey():
    asyncio.run(_run())


if __name__ == "__main__":
    test_referral_journey()
    print("ALL PASS — путь приглашённого клиента целиком, все 3 триггера")
