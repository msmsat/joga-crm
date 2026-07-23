"""GET /clients/{id}/wallet — активные и архивные продукты клиента (CL-6, задача 6.5).
Образец фейковой сессии — tests/test_booking_access.py.

Запуск из back/:  python -m tests.test_wallet
"""
import asyncio
from datetime import date, timedelta

from fastapi import HTTPException

import routers.clients.subscriptions as S
from dependencies import StudioContext


class _User:
    id = 1


class _Sub:
    def __init__(self, id, status="active", used=0, total=10, expires_days=30, is_frozen=False):
        self.id = id
        self.type = "Йога 10 занятий"
        self.status = status
        self.used_classes = used
        self.total_classes = total
        self.expires_at = date.today() + timedelta(days=expires_days)
        self.is_frozen = is_frozen


class _R:
    def __init__(self, v):
        self._v = v

    def scalar_one_or_none(self):
        return self._v

    def scalars(self):
        return self

    def all(self):
        return self._v if isinstance(self._v, list) else [self._v]


class _DB:
    def __init__(self, seq):
        self._seq = list(seq)

    async def execute(self, _q):
        return _R(self._seq.pop(0))


def _ctx(role="owner"):
    return StudioContext(user=_User(), studio_id=1, role=role)


def _run(db):
    return asyncio.run(S.get_wallet(1, _ctx(), db))


# ─── Чужой клиент (не найден в студии) → 404 ─────────────────────────────────
def test_foreign_client_404():
    db = _DB([None])
    try:
        _run(db)
        raise AssertionError("ожидали 404")
    except HTTPException as e:
        assert e.status_code == 404


# ─── Активный с остатком, не истёкший → active ───────────────────────────────
def test_active_with_remaining():
    sub = _Sub(id=1, used=3, total=10, expires_days=30)
    db = _DB([1, [sub]])  # client.id, subs
    wallet = _run(db)
    assert [w.id for w in wallet.active] == [1]
    assert wallet.archived == []


# ─── Исчерпан (used == total) → archived ─────────────────────────────────────
def test_exhausted_goes_archived():
    sub = _Sub(id=1, used=10, total=10, expires_days=30)
    db = _DB([1, [sub]])
    wallet = _run(db)
    assert wallet.active == []
    assert [w.id for w in wallet.archived] == [1]


# ─── Просрочен (expires_at < today) → archived ───────────────────────────────
def test_expired_goes_archived():
    sub = _Sub(id=1, used=2, total=10, expires_days=-1)
    db = _DB([1, [sub]])
    wallet = _run(db)
    assert wallet.active == []
    assert [w.id for w in wallet.archived] == [1]


# ─── status="finished" → archived, даже если формально остаток есть ─────────
def test_finished_status_archived():
    sub = _Sub(id=1, status="finished", used=5, total=10, expires_days=30)
    db = _DB([1, [sub]])
    wallet = _run(db)
    assert wallet.active == []
    assert [w.id for w in wallet.archived] == [1]


# ─── Заморожен, но активен по остальным критериям → остаётся в active ───────
def test_frozen_stays_active():
    sub = _Sub(id=1, used=3, total=10, expires_days=30, is_frozen=True)
    db = _DB([1, [sub]])
    wallet = _run(db)
    assert [w.id for w in wallet.active] == [1]
    assert wallet.archived == []


if __name__ == "__main__":
    test_foreign_client_404()
    test_active_with_remaining()
    test_exhausted_goes_archived()
    test_expired_goes_archived()
    test_finished_status_archived()
    test_frozen_stays_active()
    print("ALL PASS — wallet CL-6.5 зелёные")
