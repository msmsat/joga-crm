"""POST /checkout/pay (CL-6, задача 6.9) — атомарная оплата: доход, продукт,
списание бонусов, промокод/оффер использованы, событие. Реальная БД, откат.
Образец — tests/test_checkout_calculate.py, tests/test_pricing.py.

Запуск из back/:  python -m tests.test_checkout_pay
"""
import asyncio
import importlib
import warnings

warnings.filterwarnings("ignore")

from fastapi import HTTPException
from sqlalchemy import select

from database import async_session_maker
from dependencies import StudioContext
from models import (
    Account, ActivityLog, Client, ClientLoyaltyCard, ClientPayment, ClientSubscription,
    Operation, Service, Studio, StudioPromoCode, StudioSubscriptionProgramConfig, SubscriptionPackage, User,
)
from schemas.checkout import CheckoutPayRequest

CO = importlib.import_module("routers.checkout.router")


def _user():
    return User(email="owner@test.local", hashed_password="x", name="Owner", last_name="Test")


def _ctx(studio_id, role="owner"):
    return StudioContext(user=_user(), studio_id=studio_id, role=role)


async def _setup(db, *, points_balance=0):
    s = Studio(name="TEST-CHECKOUT-PAY")
    db.add(s); await db.flush()
    sid = s.id

    cfg = StudioSubscriptionProgramConfig(studio_id=sid, is_enabled=True)
    db.add(cfg); await db.flush()

    pkg = SubscriptionPackage(
        studio_id=sid, config_id=cfg.id, name="10 занятий",
        class_count=10, price=10000, per_visit_price=1200, is_active=True,
    )
    db.add(pkg); await db.flush()

    client = Client(studio_id=sid, name="Anna", is_active=True)
    db.add(client); await db.flush()

    account = Account(studio_id=sid, name="Касса", type="cash", balance=0, color="#000000")
    db.add(account); await db.flush()

    card = ClientLoyaltyCard(studio_id=sid, client_id=client.id, points_balance=points_balance)
    db.add(card); await db.flush()

    return sid, pkg, client, account, card


async def _run():
    current_user = _user()

    # ─── Оплата абонемента наличными — полный happy path ────────────────────
    async with async_session_maker() as db:
        sid, pkg, client, account, card = await _setup(db, points_balance=100)

        body = CheckoutPayRequest(
            client_id=client.id, product_id=pkg.id, product_type="subscription",
            account_id=account.id, use_bonuses=True, payment_method="cash",
        )
        result = await CO.pay(body, _ctx(sid), current_user, db)

        assert result.bonuses_applied == 100
        assert result.total_price == 9900  # 10000 - 100 бонусов
        assert result.subscription_id is not None

        await db.refresh(account)
        assert account.balance == 9900

        sub = (await db.execute(
            select(ClientSubscription).where(ClientSubscription.id == result.subscription_id)
        )).scalar_one()
        assert sub.status == "active"
        assert sub.total_classes == 10

        await db.refresh(card)
        assert card.points_balance == 0  # 100 списано бонусами, начислено заново от 9900

        payment = (await db.execute(
            select(ClientPayment).where(ClientPayment.client_id == client.id)
        )).scalars().all()
        assert len(payment) == 1 and payment[0].action_type == "subscription"

        log = (await db.execute(
            select(ActivityLog).where(ActivityLog.studio_id == sid, ActivityLog.event_type == "payment")
        )).scalars().all()
        assert len(log) == 1

        await db.rollback()

    # ─── Разовое: Operation категория «Услуги», без Reservation ─────────────
    # V5-7: «Разовые» продаются из Каталог → Услуги (Service), не из пакетов.
    async with async_session_maker() as db:
        sid, pkg, client, account, card = await _setup(db)
        service = Service(studio_id=sid, name="Разовое посещение", price=1200, duration_min=60)
        db.add(service); await db.flush()

        body = CheckoutPayRequest(
            client_id=client.id, product_id=service.id, product_type="single",
            account_id=account.id, payment_method="cash",
        )
        result = await CO.pay(body, _ctx(sid), current_user, db)
        assert result.total_price == 1200
        assert result.subscription_id is None

        ops = (await db.execute(select(Operation).where(Operation.studio_id == sid))).scalars().all()
        assert len(ops) == 1 and ops[0].category == "Услуги" and ops[0].amount == 1200

        payment = (await db.execute(
            select(ClientPayment).where(ClientPayment.client_id == client.id)
        )).scalars().all()
        assert len(payment) == 1 and payment[0].action_type == "single"

        await db.rollback()

    # ─── payment_method="card" → 400, ничего не создано ──────────────────────
    async with async_session_maker() as db:
        sid, pkg, client, account, card = await _setup(db)

        body = CheckoutPayRequest(
            client_id=client.id, product_id=pkg.id, product_type="subscription",
            account_id=account.id, payment_method="card",
        )
        try:
            await CO.pay(body, _ctx(sid), current_user, db)
            raise AssertionError("ожидали 400")
        except HTTPException as e:
            assert e.status_code == 400
            assert e.detail["code"] == "checkout.card_unavailable"  # CL-7.6: код ошибки для i18n

        subs = (await db.execute(
            select(ClientSubscription).where(ClientSubscription.client_id == client.id)
        )).scalars().all()
        assert subs == []

        await db.rollback()

    # ─── Несуществующий пакет → 404 с кодом checkout.package_not_found ──────
    async with async_session_maker() as db:
        sid, pkg, client, account, card = await _setup(db)

        body = CheckoutPayRequest(
            client_id=client.id, product_id=pkg.id + 9999, product_type="subscription",
            account_id=account.id, payment_method="cash",
        )
        try:
            await CO.pay(body, _ctx(sid), current_user, db)
            raise AssertionError("ожидали 404")
        except HTTPException as e:
            assert e.status_code == 404
            assert e.detail["code"] == "checkout.package_not_found"

        await db.rollback()

    # ─── Промокод, использованный сверх лимита → 400, ничего не записано ────
    async with async_session_maker() as db:
        sid, pkg, client, account, card = await _setup(db)
        promo = StudioPromoCode(
            studio_id=sid, code="ONE", discount_type="percent", value=10,
            usage_limit=1, used_count=1,  # уже исчерпан
        )
        db.add(promo); await db.flush()

        body = CheckoutPayRequest(
            client_id=client.id, product_id=pkg.id, product_type="subscription",
            account_id=account.id, promo_code="ONE", payment_method="cash",
        )
        try:
            await CO.pay(body, _ctx(sid), current_user, db)
            raise AssertionError("ожидали 400")
        except HTTPException as e:
            assert e.status_code == 400
            assert e.detail["code"] == "checkout.promo_expired"

        await db.refresh(account)
        assert account.balance == 0  # ничего не проведено
        subs = (await db.execute(
            select(ClientSubscription).where(ClientSubscription.client_id == client.id)
        )).scalars().all()
        assert subs == []

        await db.rollback()

    # ─── Валидный промокод помечается used_count += 1 после оплаты ──────────
    async with async_session_maker() as db:
        sid, pkg, client, account, card = await _setup(db)
        promo = StudioPromoCode(studio_id=sid, code="TEN", discount_type="percent", value=10)
        db.add(promo); await db.flush()

        body = CheckoutPayRequest(
            client_id=client.id, product_id=pkg.id, product_type="subscription",
            account_id=account.id, promo_code="ten", payment_method="cash",
        )
        result = await CO.pay(body, _ctx(sid), current_user, db)
        assert result.total_price == 9000  # 10000 - 10%

        await db.refresh(promo)
        assert promo.used_count == 1

        await db.rollback()

    # ─── Студия без единого счёта: account_id=None → автосоздание «Основная касса» (V5-6, 2.1) ──
    async with async_session_maker() as db:
        s = Studio(name="TEST-CHECKOUT-PAY-NO-ACCOUNT")
        db.add(s); await db.flush()
        sid = s.id

        cfg = StudioSubscriptionProgramConfig(studio_id=sid, is_enabled=True)
        db.add(cfg); await db.flush()

        pkg = SubscriptionPackage(
            studio_id=sid, config_id=cfg.id, name="10 занятий",
            class_count=10, price=10000, per_visit_price=1200, is_active=True,
        )
        db.add(pkg); await db.flush()

        client = Client(studio_id=sid, name="NoAccount", is_active=True)
        db.add(client); await db.flush()

        body = CheckoutPayRequest(
            client_id=client.id, product_id=pkg.id, product_type="subscription",
            payment_method="cash",
        )
        result = await CO.pay(body, _ctx(sid), current_user, db)
        assert result.total_price == 10000

        accounts = (await db.execute(select(Account).where(Account.studio_id == sid))).scalars().all()
        assert len(accounts) == 1
        assert accounts[0].name == "Основная касса"
        assert accounts[0].balance == 10000

        await db.rollback()

    # ─── Недостаточно бонусов сверх calculate (гонка) → 400, атомарность ────
    # apply_points_change бросает 400 если баланс уходит в минус; _quote уже
    # ограничивает bonuses_applied <= balance, так что это скорее defensive-кейс
    # на будущее — здесь просто проверяем, что списание не может увести в минус.
    async with async_session_maker() as db:
        sid, pkg, client, account, card = await _setup(db, points_balance=50)
        body = CheckoutPayRequest(
            client_id=client.id, product_id=pkg.id, product_type="subscription",
            account_id=account.id, use_bonuses=True, payment_method="cash",
        )
        result = await CO.pay(body, _ctx(sid), current_user, db)
        assert result.bonuses_applied == 50  # весь баланс, меньше цены

        await db.refresh(card)
        assert card.points_balance >= 0

        await db.rollback()


def test_checkout_pay():
    asyncio.run(_run())


if __name__ == "__main__":
    test_checkout_pay()
    print("ALL PASS — checkout/pay CL-6.9 зелёные")
