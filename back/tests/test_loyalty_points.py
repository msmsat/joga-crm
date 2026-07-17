"""Логика баллов лояльности без БД: фейковая сессия.

Запуск из back/:  python -m tests.test_loyalty_points
"""
import asyncio

from fastapi import HTTPException

import routers.clients.loyalty as L


class _Card:
    def __init__(self, bal=0):
        self.points_balance = bal


class _Cfg:
    def __init__(self, enabled=True, rate=100):
        self.is_enabled = enabled
        self.points_exchange_rate = rate


class _R:
    def __init__(self, v):
        self._v = v

    def scalar_one_or_none(self):
        return self._v


class _DB:
    """execute() отдаёт значения из seq по порядку вызовов."""
    def __init__(self, seq):
        self._seq = list(seq)
        self.added = []

    def add(self, x):
        self.added.append(x)

    async def flush(self):
        pass

    async def execute(self, _q):
        return _R(self._seq.pop(0))


def _txn_count(db):
    return sum(1 for a in db.added if a.__class__.__name__ == "LoyaltyPointTransaction")


def test_accrue_rate():
    # 1000 ₽ = 100000 копеек, курс 100 → 10 баллов
    card = _Card(0)
    db = _DB([_Cfg(True, 100), card])
    asyncio.run(L.accrue_points(db, 7, 1, 100_000))
    assert card.points_balance == 10
    assert _txn_count(db) == 1


def test_accrue_disabled_skips():
    db = _DB([_Cfg(False, 100)])
    asyncio.run(L.accrue_points(db, 7, 1, 100_000))
    assert db.added == []


def test_negative_balance_guard():
    db = _DB([_Card(5)])
    try:
        asyncio.run(L._apply_points(1, 7, -10, "списание", db))
        assert False, "должно было упасть 400"
    except HTTPException as e:
        assert e.status_code == 400


def test_valid_spend():
    card = _Card(20)
    db = _DB([card])
    asyncio.run(L._apply_points(1, 7, -10, "списание", db))
    assert card.points_balance == 10


if __name__ == "__main__":
    test_accrue_rate()
    test_accrue_disabled_skips()
    test_negative_balance_guard()
    test_valid_spend()
    print("ALL PASS")
