"""Логика баллов лояльности без БД: фейковая сессия.

Запуск из back/:  python -m tests.test_loyalty_points
"""
import asyncio

from fastapi import HTTPException
from sqlalchemy import Update

import routers.clients.loyalty as L


class _Card:
    def __init__(self, bal=0, deposit=0):
        self.id = 1
        self.points_balance = bal
        self.deposit_balance = deposit


class _Cfg:
    def __init__(self, enabled=True, rate=100):
        self.is_enabled = enabled
        self.points_exchange_rate = rate


class _R:
    def __init__(self, v):
        self._v = v

    def scalar_one_or_none(self):
        return self._v


class _Rows:
    """Результат UPDATE: сколько строк он реально задел."""
    def __init__(self, rowcount):
        self.rowcount = rowcount


class _DB:
    """execute() отдаёт значения из seq по порядку вызовов.

    UPDATE обрабатывается ОТДЕЛЬНО и всерьёз: остаток теперь сдвигается атомарным
    `SET x = x + :delta WHERE x + :delta >= 0`, и заглушка обязана вести себя так
    же — иначе тесты на отказ при нехватке проверяли бы несуществующий код.
    Дельту и колонку достаём из скомпилированного запроса, а не угадываем.
    """

    def __init__(self, seq, card=None):
        self._seq = list(seq)
        self.added = []
        # Карта, к которой применяется UPDATE. По умолчанию — первая из seq.
        self._card = card or next((x for x in seq if isinstance(x, _Card)), None)

    def add(self, x):
        self.added.append(x)

    async def flush(self):
        pass

    async def refresh(self, _obj):
        pass

    async def execute(self, q):
        if isinstance(q, Update):
            compiled = q.compile()
            column = "points_balance" if "points_balance" in str(compiled) else "deposit_balance"
            delta = compiled.params[f"{column}_1"]
            current = getattr(self._card, column)
            if current + delta < 0:
                return _Rows(0)
            setattr(self._card, column, current + delta)
            return _Rows(1)
        return _R(self._seq.pop(0))


def _txn_count(db):
    return sum(1 for a in db.added if a.__class__.__name__ == "LoyaltyPointTransaction")


def test_accrue_rate():
    # 1500 ₽, курс 100 ₽ за балл → 15 баллов
    card = _Card(0)
    db = _DB([_Cfg(True, 100), card])
    asyncio.run(L.accrue_points(db, 7, 1, 1_500))
    assert card.points_balance == 15
    assert _txn_count(db) == 1


def test_accrue_disabled_skips():
    db = _DB([_Cfg(False, 100)])
    asyncio.run(L.accrue_points(db, 7, 1, 1_500))
    assert db.added == []


def test_negative_balance_guard():
    db = _DB([_Card(5)])
    try:
        asyncio.run(L.apply_points_change(1, 7, -10, "списание", db))
        assert False, "должно было упасть 400"
    except HTTPException as e:
        assert e.status_code == 400


def test_valid_spend():
    card = _Card(20)
    db = _DB([card])
    asyncio.run(L.apply_points_change(1, 7, -10, "списание", db))
    assert card.points_balance == 10


def test_deposit_negative_balance_guard():
    db = _DB([_Card(deposit=100)])
    try:
        asyncio.run(L.apply_deposit_change(1, 7, -150, "списание", db))
        assert False, "должно было упасть 400"
    except HTTPException as e:
        assert e.status_code == 400


def test_deposit_topup_and_spend():
    card = _Card(deposit=100)
    db = _DB([card])
    asyncio.run(L.apply_deposit_change(1, 7, 50, "пополнение", db))
    assert card.deposit_balance == 150
    db2 = _DB([card])
    asyncio.run(L.apply_deposit_change(1, 7, -150, "списание в оплату", db2))
    assert card.deposit_balance == 0


if __name__ == "__main__":
    test_accrue_rate()
    test_accrue_disabled_skips()
    test_negative_balance_guard()
    test_valid_spend()
    test_deposit_negative_balance_guard()
    test_deposit_topup_and_spend()
    print("ALL PASS")
