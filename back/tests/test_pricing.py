"""resolve_price (V5-5, задача 4): студийная скидка + оффер + промокод,
без стека — берётся самая выгодная клиенту; со stackable — складываются.

Реальная БД, одна транзакция с откатом. Запуск из back/:
  python -m tests.test_pricing
"""
import asyncio
import warnings
from datetime import date, timedelta

warnings.filterwarnings("ignore")

from database import async_session_maker
from models import Client, ClientOffer, Studio, StudioDiscountConfig, StudioPromoCode
from services.pricing import resolve_price


async def _run():
    async with async_session_maker() as db:
        s = Studio(name="TEST-PRICING")
        db.add(s); await db.flush()
        sid = s.id

        c_none = Client(studio_id=sid, name="None", is_active=True)
        c_offer = Client(studio_id=sid, name="Offer", is_active=True)
        for c in (c_none, c_offer):
            db.add(c)
        await db.flush()

        # без скидок — цена как есть
        resolved = await resolve_price(db, sid, c_none.id, 1000, None)
        assert resolved.final_price == 1000
        assert resolved.offer is None and resolved.promo is None

        # студийная скидка 10% (percentage -> percent) + активный оффер 20% —
        # без stackable берём самую выгодную (оффер)
        cfg = StudioDiscountConfig(studio_id=sid, is_enabled=True, discount_type="percentage",
                                   discount_value=10, stackable=False)
        db.add(cfg)
        offer = ClientOffer(studio_id=sid, client_id=c_offer.id, discount_type="percent", value=20,
                            reason="manual", scope="renewal", valid_until=date.today() + timedelta(days=5))
        db.add(offer)
        await db.flush()

        resolved = await resolve_price(db, sid, c_offer.id, 1000, None)
        assert resolved.final_price == 800, resolved.final_price  # 20% выгоднее 10%
        assert resolved.offer is not None and resolved.offer.id == offer.id
        assert resolved.studio_discount_applied == 0  # не применена — не самая выгодная

        # cashback не снижает цену (переключаем ту же конфигурацию: studio_id уникален)
        cfg.discount_type = "cashback"
        cfg.discount_value = 15
        await db.flush()
        resolved = await resolve_price(db, sid, c_none.id, 1000, None)
        assert resolved.final_price == 1000

        await db.rollback()

    # stackable: студийная + оффер складываются (отдельная транзакция — своя студия)
    async with async_session_maker() as db:
        s2 = Studio(name="TEST-PRICING-STACK")
        db.add(s2); await db.flush()
        sid2 = s2.id
        c = Client(studio_id=sid2, name="Stacker", is_active=True)
        db.add(c); await db.flush()

        cfg = StudioDiscountConfig(studio_id=sid2, is_enabled=True, discount_type="fixed",
                                   discount_value=100, stackable=True)
        offer = ClientOffer(studio_id=sid2, client_id=c.id, discount_type="amount", value=50,
                            reason="manual", scope="renewal")
        db.add_all([cfg, offer])
        await db.flush()

        resolved = await resolve_price(db, sid2, c.id, 1000, None)
        assert resolved.final_price == 850, resolved.final_price  # 1000 - 100 - 50
        assert resolved.studio_discount_applied == 100
        assert resolved.offer_discount_applied == 50

        await db.rollback()

    # min_purchase_amount: скидка не применяется ниже порога
    async with async_session_maker() as db:
        s3 = Studio(name="TEST-PRICING-MIN")
        db.add(s3); await db.flush()
        sid3 = s3.id
        c = Client(studio_id=sid3, name="Cheap", is_active=True)
        db.add(c); await db.flush()
        cfg = StudioDiscountConfig(studio_id=sid3, is_enabled=True, discount_type="percentage",
                                   discount_value=10, min_purchase_amount=500)
        db.add(cfg); await db.flush()

        resolved = await resolve_price(db, sid3, c.id, 300, None)
        assert resolved.final_price == 300  # ниже порога — не применилась

        resolved = await resolve_price(db, sid3, c.id, 600, None)
        assert resolved.final_price == 540  # выше порога — применилась

        await db.rollback()

    # промокод: используется через resolve_price, is_active=False промокод сюда не передаётся
    async with async_session_maker() as db:
        s4 = Studio(name="TEST-PRICING-PROMO")
        db.add(s4); await db.flush()
        sid4 = s4.id
        c = Client(studio_id=sid4, name="Promo", is_active=True)
        db.add(c); await db.flush()
        promo = StudioPromoCode(studio_id=sid4, code="X10", discount_type="percent", value=10)
        db.add(promo); await db.flush()

        resolved = await resolve_price(db, sid4, c.id, 1000, promo)
        assert resolved.final_price == 900
        assert resolved.promo is not None and resolved.promo.id == promo.id

        await db.rollback()


def test_resolve_price():
    asyncio.run(_run())


if __name__ == "__main__":
    test_resolve_price()
    print("ALL PASS")
