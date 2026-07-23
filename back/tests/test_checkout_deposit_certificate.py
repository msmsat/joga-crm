"""POST /checkout/pay — оплата депозитом и сертификатом (V5-6, задача 1.1).
Порядок списаний: скидки → сертификат → депозит → бонусы → остаток методом.
Реальная БД, откат.

Запуск из back/:  python -m tests.test_checkout_deposit_certificate
"""
import asyncio
import importlib
import secrets
import warnings
from datetime import date, timedelta

warnings.filterwarnings("ignore")

from fastapi import HTTPException
from sqlalchemy import select

from database import async_session_maker
from dependencies import StudioContext
from models import (
    Account, Client, ClientLoyaltyCard, GiftCertificate, Operation,
    Service, Studio, User,
)
from schemas.checkout import CheckoutPayRequest

CO = importlib.import_module("routers.checkout.router")


def _user():
    return User(email="owner@test.local", hashed_password="x", name="Owner", last_name="Test")


def _ctx(studio_id, role="owner"):
    return StudioContext(user=_user(), studio_id=studio_id, role=role)


def _code() -> str:
    # pay() коммитит сертификат внутри транзакции — rollback() после не откатывает
    # уже закоммиченное, поэтому код должен быть уникален и между запусками теста.
    return "GC-" + secrets.token_hex(6).upper()


async def _setup(db, *, deposit_balance=0):
    s = Studio(name="TEST-CHECKOUT-DEPOSIT-CERT")
    db.add(s); await db.flush()
    sid = s.id

    # «Разовое» после V5-6 Блока 3 — услуга Каталога, не пакет лояльности.
    pkg = Service(studio_id=sid, name="Разовое", price=1000)
    db.add(pkg); await db.flush()

    client = Client(studio_id=sid, name="Deposit", is_active=True)
    db.add(client); await db.flush()

    account = Account(studio_id=sid, name="Касса", type="cash", balance=0, color="#000000")
    db.add(account); await db.flush()

    card = ClientLoyaltyCard(studio_id=sid, client_id=client.id, deposit_balance=deposit_balance)
    db.add(card); await db.flush()

    return sid, pkg, client, account, card


async def _run():
    current_user = _user()

    # ─── Депозит 400 + сертификат 300 на разовое за 1000 → total_price == 300 ──
    async with async_session_maker() as db:
        sid, pkg, client, account, card = await _setup(db, deposit_balance=400)

        code = _code()
        cert = GiftCertificate(
            studio_id=sid, code=code, amount=300, cert_type="gift", status="active",
        )
        db.add(cert); await db.flush()

        body = CheckoutPayRequest(
            client_id=client.id, product_id=pkg.id, product_type="single",
            account_id=account.id, use_deposit=True, certificate_code=code,
            payment_method="cash",
        )
        result = await CO.pay(body, _ctx(sid), current_user, db)

        assert result.total_price == 300
        assert result.deposit_applied == 400
        assert result.certificate_applied == 300

        await db.refresh(card)
        assert card.deposit_balance == 0

        await db.refresh(cert)
        assert cert.status == "used"
        assert cert.used_at is not None

        ops = (await db.execute(select(Operation).where(Operation.studio_id == sid))).scalars().all()
        assert len(ops) == 1 and ops[0].amount == 300

        await db.refresh(account)
        assert account.balance == 300  # только реально уплаченная деньгами часть

        await db.rollback()

    # ─── Депозит + сертификат покрывают всё (total_price == 0) → без Operation, card не нужен ──
    async with async_session_maker() as db:
        sid, pkg, client, account, card = await _setup(db, deposit_balance=1000)

        code = _code()
        cert = GiftCertificate(
            studio_id=sid, code=code, amount=500, cert_type="gift", status="active",
        )
        db.add(cert); await db.flush()

        body = CheckoutPayRequest(
            client_id=client.id, product_id=pkg.id, product_type="single",
            account_id=account.id, use_deposit=True, certificate_code=code,
            payment_method="card",  # метод не важен — остаток полностью покрыт
        )
        result = await CO.pay(body, _ctx(sid), current_user, db)

        assert result.total_price == 0
        assert result.certificate_applied == 500
        assert result.deposit_applied == 500  # остаток 500 после сертификата, депозита с запасом

        await db.refresh(card)
        assert card.deposit_balance == 500  # 1000 - 500 списано

        ops = (await db.execute(select(Operation).where(Operation.studio_id == sid))).scalars().all()
        assert ops == []  # 0 ₽ — Operation не создаётся (защита от двойного учёта)

        await db.refresh(account)
        assert account.balance == 0

        await db.rollback()

    # ─── Просроченный сертификат → 400 loyalty.cert_expired, ничего не проведено ──
    async with async_session_maker() as db:
        sid, pkg, client, account, card = await _setup(db)

        code = _code()
        cert = GiftCertificate(
            studio_id=sid, code=code, amount=300, cert_type="gift", status="active",
            expires_at=date.today() - timedelta(days=1),
        )
        db.add(cert); await db.flush()

        body = CheckoutPayRequest(
            client_id=client.id, product_id=pkg.id, product_type="single",
            account_id=account.id, certificate_code=code, payment_method="cash",
        )
        try:
            await CO.pay(body, _ctx(sid), current_user, db)
            raise AssertionError("ожидали 400")
        except HTTPException as e:
            assert e.status_code == 400
            assert e.detail["code"] == "loyalty.cert_expired"

        await db.refresh(account)
        assert account.balance == 0

        await db.rollback()

    # ─── Оставшийся остаток > 0 при payment_method="card" → 400 (метод ещё нужен) ──
    async with async_session_maker() as db:
        sid, pkg, client, account, card = await _setup(db, deposit_balance=100)

        body = CheckoutPayRequest(
            client_id=client.id, product_id=pkg.id, product_type="single",
            account_id=account.id, use_deposit=True, payment_method="card",
        )
        try:
            await CO.pay(body, _ctx(sid), current_user, db)
            raise AssertionError("ожидали 400")
        except HTTPException as e:
            assert e.status_code == 400
            assert e.detail["code"] == "checkout.card_unavailable"

        await db.rollback()


def test_checkout_deposit_certificate():
    asyncio.run(_run())


if __name__ == "__main__":
    test_checkout_deposit_certificate()
    print("ALL PASS — checkout deposit/certificate V5-6 1.1 зелёные")
