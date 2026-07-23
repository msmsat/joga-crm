"""POST /checkout/{calculate,pay} с product_type="subscription" при выключенной
программе абонементов (V5-8, Блок 1 / V5-7 4.3) — должно возвращать 400
checkout.subscriptions_disabled. «Разовые» (product_type="single") не зависят
от этого флага — не про абонементы. Реальная БД, откат.

Запуск из back/:  python -m tests.test_checkout_subscriptions_disabled
"""
import asyncio
import importlib
import warnings

warnings.filterwarnings("ignore")

from fastapi import HTTPException

from database import async_session_maker
from dependencies import StudioContext
from models import Client, Service, Studio, StudioSubscriptionProgramConfig, SubscriptionPackage
from schemas.checkout import CheckoutCalculateRequest, CheckoutPayRequest

CO = importlib.import_module("routers.checkout.router")


class _User:
    id = 1
    name = "Owner"
    last_name = "Test"


def _ctx(studio_id, role="owner"):
    return StudioContext(user=_User(), studio_id=studio_id, role=role)


async def _setup(db, *, is_enabled: bool, with_config: bool = True):
    s = Studio(name="TEST-CHECKOUT-SUBS-DISABLED")
    db.add(s); await db.flush()
    sid = s.id

    pkg = None
    if with_config:
        cfg = StudioSubscriptionProgramConfig(studio_id=sid, is_enabled=is_enabled)
        db.add(cfg); await db.flush()

        pkg = SubscriptionPackage(
            studio_id=sid, config_id=cfg.id, name="10 занятий",
            class_count=10, price=10000, per_visit_price=1200, is_active=True,
        )
        db.add(pkg); await db.flush()

    service = Service(studio_id=sid, name="Разовое посещение", price=1200, duration_min=60)
    db.add(service); await db.flush()

    client = Client(studio_id=sid, name="Anna", is_active=True)
    db.add(client); await db.flush()

    return sid, pkg, service, client


async def _run():
    current_user = _User()

    # ─── Программа выключена → calculate 400 checkout.subscriptions_disabled ──
    async with async_session_maker() as db:
        sid, pkg, _service, client = await _setup(db, is_enabled=False)

        body = CheckoutCalculateRequest(client_id=client.id, product_id=pkg.id, product_type="subscription")
        try:
            await CO.calculate(body, _ctx(sid), db)
            raise AssertionError("ожидали 400")
        except HTTPException as e:
            assert e.status_code == 400
            assert e.detail["code"] == "checkout.subscriptions_disabled"

        await db.rollback()

    # ─── Программа выключена → pay тоже 400, ничего не проведено ──────────────
    async with async_session_maker() as db:
        sid, pkg, _service, client = await _setup(db, is_enabled=False)

        body = CheckoutPayRequest(
            client_id=client.id, product_id=pkg.id, product_type="subscription",
            payment_method="cash",
        )
        try:
            await CO.pay(body, _ctx(sid), current_user, db)
            raise AssertionError("ожидали 400")
        except HTTPException as e:
            assert e.status_code == 400
            assert e.detail["code"] == "checkout.subscriptions_disabled"

        await db.rollback()

    # ─── Программа включена → calculate проходит как обычно ───────────────────
    async with async_session_maker() as db:
        sid, pkg, _service, client = await _setup(db, is_enabled=True)

        body = CheckoutCalculateRequest(client_id=client.id, product_id=pkg.id, product_type="subscription")
        result = await CO.calculate(body, _ctx(sid), db)
        assert result.total_price == 10000

        await db.rollback()

    # ─── «Разовые» не зависят от флага программы абонементов ──────────────────
    async with async_session_maker() as db:
        sid, _pkg, service, client = await _setup(db, is_enabled=False)

        body = CheckoutCalculateRequest(client_id=client.id, product_id=service.id, product_type="single")
        result = await CO.calculate(body, _ctx(sid), db)
        assert result.total_price == 1200

        await db.rollback()


def test_checkout_subscriptions_disabled():
    asyncio.run(_run())


if __name__ == "__main__":
    test_checkout_subscriptions_disabled()
    print("ALL PASS — checkout subscriptions-disabled V5-8 Блок 1 зелёные")
