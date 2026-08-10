"""Выпуск сертификата пишет операцию в леджер, когда указан счёт (задача FN-2.1).
Погашение просроченного сертификата — лениво переводит в expired (V5-6, 1.3).

Запуск из back/:  python -m tests.test_certificate_ledger
"""
import asyncio
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from fastapi import HTTPException

import routers.loyalty.certificates as C


@dataclass
class _Ctx:
    studio_id: int = 7


class _Account:
    def __init__(self, id=1, balance=1000):
        self.id = id
        self.balance = balance


class _R:
    def __init__(self, v):
        self._v = v

    def scalar_one_or_none(self):
        return self._v

    # Выпуск сертификата читает студию через scalar_one() (нужна валюта для
    # комиссии платформы) — без этого метода фейк падал AttributeError.
    def scalar_one(self):
        return self._v


class _DB:
    """execute() отдаёт значения из seq по порядку вызовов; commit/refresh — no-op."""
    def __init__(self, seq):
        self._seq = list(seq)
        self.added = []

    def add(self, x):
        self.added.append(x)

    async def commit(self):
        pass

    async def refresh(self, _x):
        pass

    async def execute(self, _q):
        return _R(self._seq.pop(0))


def _op_count(db):
    return sum(1 for a in db.added if a.__class__.__name__ == "Operation")


class _Cert:
    def __init__(self, status="active", expires_at=None):
        self.status = status
        self.expires_at = expires_at
        self.used_at = None


class _Studio:
    currency = "CZK"


class _BillingPlan:
    """Тариф студии. Читает platform_fee.record_offline_fee при выпуске сертификата."""
    def __init__(self, billing_mode="subscription", percent_rate=None):
        self.billing_mode = billing_mode
        self.percent_rate = percent_rate


def _fee_count(db):
    return sum(1 for a in db.added if a.__class__.__name__ == "OfflineTransactionFee")


def test_issue_with_account_creates_operation():
    account = _Account(id=1, balance=1000)
    # Порядок запросов: cfg (expires_at не задан) → счёт → _unique_code → студия
    # (валюта для комиссии) → тариф студии. Последние два приехали вместе с
    # начислением комиссии платформы за продажу сертификата — без них фейк
    # обрывался на pop из пустого списка.
    db = _DB([None, account, None, _Studio(), _BillingPlan()])
    body = C.GiftCertificateCreate(amount=2500, cert_type="gift", account_id=1)
    cert = asyncio.run(C.create_certificate(body, _Ctx(), db))

    assert account.balance == 3500
    assert _op_count(db) == 1
    op = next(a for a in db.added if a.__class__.__name__ == "Operation")
    assert op.amount == 2500
    assert op.category == "Сертификаты"
    assert op.type == "in"
    assert cert.amount == 2500


def test_issue_on_percent_tariff_accrues_platform_fee():
    """Продажа сертификата — приём офлайн-денег, и комиссия берётся ЗДЕСЬ.

    При погашении её взять уже не с чего: сертификат гасит цену до нуля, продажа
    идёт по total_price = 0. Без этого начисления сертификаты были бы способом
    провести любой оборот мимо процента — поэтому путь закрыт тестом, а не только
    комментарием в коде.
    """
    db = _DB([None, _Account(id=1, balance=0), None, _Studio(), _BillingPlan("percent", 3.0)])
    body = C.GiftCertificateCreate(amount=2500, cert_type="gift", account_id=1)
    asyncio.run(C.create_certificate(body, _Ctx(), db))

    assert _fee_count(db) == 1
    fee = next(a for a in db.added if a.__class__.__name__ == "OfflineTransactionFee")
    # 2500 крон → 250000 галержей, 3% = 7500. Комиссия считается в МЛАДШИХ
    # единицах: посчитай её от крон — уедет в 100 раз.
    assert fee.sale_amount == 250000
    assert fee.fee_amount == 7500
    assert fee.payment_method == "certificate"


def test_issue_on_subscription_tariff_accrues_nothing():
    """На тарифе-подписке платформа с оборота студии не берёт ничего."""
    db = _DB([None, _Account(id=1, balance=0), None, _Studio(), _BillingPlan("subscription")])
    body = C.GiftCertificateCreate(amount=2500, cert_type="gift", account_id=1)
    asyncio.run(C.create_certificate(body, _Ctx(), db))

    assert _fee_count(db) == 0


def test_issue_without_account_skips_operation():
    db = _DB([None, None])  # cfg lookup + _unique_code, счёт не запрашивается
    body = C.GiftCertificateCreate(amount=1000, cert_type="gift")
    asyncio.run(C.create_certificate(body, _Ctx(), db))

    assert _op_count(db) == 0


def test_redeem_expired_marks_expired_and_400():
    cert = _Cert(status="active", expires_at=date.today() - timedelta(days=1))
    db = _DB([cert])
    try:
        asyncio.run(C.redeem_certificate(1, _Ctx(), db))
        assert False, "должно было упасть 400"
    except HTTPException as e:
        assert e.status_code == 400
        assert e.detail["code"] == "loyalty.cert_expired"
    assert cert.status == "expired"


def test_redeem_active_marks_used():
    cert = _Cert(status="active", expires_at=date.today() + timedelta(days=1))
    db = _DB([cert])
    result = asyncio.run(C.redeem_certificate(1, _Ctx(), db))
    assert result.status == "used"
    assert result.used_at is not None


def test_redeem_no_expiry_marks_used():
    cert = _Cert(status="active", expires_at=None)
    db = _DB([cert])
    result = asyncio.run(C.redeem_certificate(1, _Ctx(), db))
    assert result.status == "used"


if __name__ == "__main__":
    test_issue_with_account_creates_operation()
    test_issue_without_account_skips_operation()
    test_redeem_expired_marks_expired_and_400()
    test_redeem_active_marks_used()
    test_redeem_no_expiry_marks_used()
    print("ALL PASS")
