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


def test_issue_with_account_creates_operation():
    account = _Account(id=1, balance=1000)
    # execute() вызывается: cfg lookup (expires_at не задан) -> account lookup -> _unique_code
    db = _DB([None, account, None])
    body = C.GiftCertificateCreate(amount=2500, cert_type="gift", account_id=1)
    cert = asyncio.run(C.create_certificate(body, _Ctx(), db))

    assert account.balance == 3500
    assert _op_count(db) == 1
    op = next(a for a in db.added if a.__class__.__name__ == "Operation")
    assert op.amount == 2500
    assert op.category == "Сертификаты"
    assert op.type == "in"
    assert cert.amount == 2500


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
