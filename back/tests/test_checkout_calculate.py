"""POST /checkout/calculate (CL-6, задача 6.7) — итоговая цена: база − скидка/промо
− бонусы. Реальная БД, одна транзакция с откатом. Образец — tests/test_pricing.py.

Запуск из back/:  python -m tests.test_checkout_calculate
"""
import asyncio
import importlib
import warnings

warnings.filterwarnings("ignore")

from fastapi import HTTPException

from database import async_session_maker
from dependencies import StudioContext
from models import Client, ClientLoyaltyCard, Service, Studio, StudioPromoCode, StudioSubscriptionProgramConfig, SubscriptionPackage
from schemas.checkout import CheckoutCalculateRequest

# import routers.checkout.router as CO не сработает: routers/checkout/__init__.py
# делает `from .router import router`, из-за чего атрибут `router` пакета
# перекрывает подмодуль `router.py` с тем же именем — берём модуль явно.
CO = importlib.import_module("routers.checkout.router")


class _User:
    id = 1


def _ctx(studio_id, role="owner"):
    return StudioContext(user=_User(), studio_id=studio_id, role=role)


async def _run():
    async with async_session_maker() as db:
        s = Studio(name="TEST-CHECKOUT")
        db.add(s); await db.flush()
        sid = s.id

        cfg = StudioSubscriptionProgramConfig(studio_id=sid, is_enabled=True)
        db.add(cfg); await db.flush()

        pkg = SubscriptionPackage(
            studio_id=sid, config_id=cfg.id, name="10 занятий",
            class_count=10, price=10000, per_visit_price=1200, is_active=True,
        )
        pkg_inactive = SubscriptionPackage(
            studio_id=sid, config_id=cfg.id, name="Старый пакет",
            class_count=5, price=5000, per_visit_price=1200, is_active=False,
        )
        db.add_all([pkg, pkg_inactive]); await db.flush()

        client = Client(studio_id=sid, name="Anna", is_active=True)
        db.add(client); await db.flush()

        promo = StudioPromoCode(studio_id=sid, code="SALE10", discount_type="percent", value=10)
        db.add(promo); await db.flush()

        card = ClientLoyaltyCard(studio_id=sid, client_id=client.id, points_balance=300)
        db.add(card); await db.flush()

        # V5-7: «Разовые» (product_type="single") продаются из Service, не из пакета.
        service = Service(studio_id=sid, name="Разовое посещение", price=1200, duration_min=60)
        db.add(service); await db.flush()

        # ─── Без промокода/бонусов — итог равен базовой цене ────────────────
        body = CheckoutCalculateRequest(client_id=client.id, product_id=pkg.id, product_type="subscription")
        result = await CO.calculate(body, _ctx(sid), db)
        assert result.base_price == 10000
        assert result.discount == 0
        assert result.total_price == 10000
        assert result.promo_valid is True  # промокод не передавался — считаем валидным-по-умолчанию

        # ─── product_type="single" берёт цену услуги ─────────────────────────
        body = CheckoutCalculateRequest(client_id=client.id, product_id=service.id, product_type="single")
        result = await CO.calculate(body, _ctx(sid), db)
        assert result.base_price == 1200
        assert result.total_price == 1200

        # ─── Валидный промокод снижает цену ───────────────────────────────────
        body = CheckoutCalculateRequest(
            client_id=client.id, product_id=pkg.id, product_type="subscription", promo_code="sale10",
        )
        result = await CO.calculate(body, _ctx(sid), db)
        assert result.promo_valid is True
        assert result.discount == 1000
        assert result.total_price == 9000

        # ─── Невалидный промокод не роняет запрос: promo_valid=False, скидки нет ──
        body = CheckoutCalculateRequest(
            client_id=client.id, product_id=pkg.id, product_type="subscription", promo_code="NOPE",
        )
        result = await CO.calculate(body, _ctx(sid), db)
        assert result.promo_valid is False
        assert result.discount == 0
        assert result.total_price == 10000

        # ─── Бонусы: min(points_balance, final_price), 1 балл = 1 ₽ ─────────
        body = CheckoutCalculateRequest(
            client_id=client.id, product_id=service.id, product_type="single", use_bonuses=True,
        )
        result = await CO.calculate(body, _ctx(sid), db)
        assert result.bonuses_available == 300
        assert result.bonuses_applied == 300  # 300 < 1200
        assert result.total_price == 900  # 1200 - 300

        # ─── Промокод + бонусы вместе, итог не уходит в минус ───────────────
        body = CheckoutCalculateRequest(
            client_id=client.id, product_id=pkg.id, product_type="subscription",
            promo_code="SALE10", use_bonuses=True,
        )
        result = await CO.calculate(body, _ctx(sid), db)
        assert result.discount == 1000       # 10% от 10000
        assert result.bonuses_applied == 300  # весь баланс, 300 < 9000
        assert result.total_price == 8700     # 10000 - 1000 - 300
        assert result.total_price >= 0

        # ─── Снятый с продажи пакет → 400 ────────────────────────────────────
        body = CheckoutCalculateRequest(client_id=client.id, product_id=pkg_inactive.id, product_type="subscription")
        try:
            await CO.calculate(body, _ctx(sid), db)
            raise AssertionError("ожидали 400")
        except HTTPException as e:
            assert e.status_code == 400

        # ─── Чужой клиент → 404 ──────────────────────────────────────────────
        s2 = Studio(name="TEST-CHECKOUT-OTHER")
        db.add(s2); await db.flush()
        body = CheckoutCalculateRequest(client_id=client.id, product_id=pkg.id, product_type="subscription")
        try:
            await CO.calculate(body, _ctx(s2.id), db)
            raise AssertionError("ожидали 404")
        except HTTPException as e:
            assert e.status_code == 404

        await db.rollback()


def test_checkout_calculate():
    asyncio.run(_run())


if __name__ == "__main__":
    test_checkout_calculate()
    print("ALL PASS — checkout/calculate CL-6.7 зелёные")
