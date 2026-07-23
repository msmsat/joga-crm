"""GET/PUT /finances/gateways: connected считается по secret_key, ключ наружу не течёт (задача FN-3.1).

Запуск из back/:  python -m tests.test_gateways
"""
import asyncio
from dataclasses import dataclass

import routers.finances.gateways as G


@dataclass
class _Ctx:
    studio_id: int = 7


class _Channel:
    def __init__(self, channel_type, is_active=False, public_key=None, secret_key=None):
        self.studio_id = 7
        self.channel_type = channel_type
        self.is_active = is_active
        self.public_key = public_key
        self.secret_key = secret_key


class _R:
    def __init__(self, v):
        self._v = v

    def scalar_one_or_none(self):
        return self._v

    def scalars(self):
        return self

    def all(self):
        return self._v


class _DB:
    """execute() отдаёт значения из seq по порядку вызовов; add/commit/refresh — no-op."""
    def __init__(self, seq):
        self._seq = list(seq)

    def add(self, _x):
        pass

    async def commit(self):
        pass

    async def refresh(self, _x):
        pass

    async def execute(self, _q):
        return _R(self._seq.pop(0))


def test_list_gateways_always_two_virtual_when_absent():
    db = _DB([[]])  # ни stripe, ни fondy в БД
    result = asyncio.run(G.list_gateways(_Ctx(), db))

    assert [r.gateway_type for r in result] == ["stripe", "fondy"]
    assert all(r.connected is False and r.is_active is False for r in result)


def test_update_gateway_with_keys_sets_connected_true_and_hides_secret():
    db = _DB([None])  # ещё нет строки stripe → создаётся новая
    body = G.GatewayUpdate(public_key="pk_live_123", secret_key="sk_live_456", is_active=True)
    result = asyncio.run(G.update_gateway("stripe", body, _Ctx(), db))

    assert result.connected is True
    assert result.public_key == "pk_live_123"
    assert result.is_active is True
    assert not hasattr(result, "secret_key")


def test_update_gateway_empty_secret_key_sets_connected_false():
    existing = _Channel("fondy", is_active=True, public_key="pk_old", secret_key="sk_old")
    db = _DB([existing])
    body = G.GatewayUpdate(is_active=False)  # secret_key не передан -> остаётся старым
    result = asyncio.run(G.update_gateway("fondy", body, _Ctx(), db))

    assert result.connected is True

    db2 = _DB([existing])
    body2 = G.GatewayUpdate(secret_key="")
    result2 = asyncio.run(G.update_gateway("fondy", body2, _Ctx(), db2))
    assert result2.connected is False


if __name__ == "__main__":
    test_list_gateways_always_two_virtual_when_absent()
    test_update_gateway_with_keys_sets_connected_true_and_hides_secret()
    test_update_gateway_empty_secret_key_sets_connected_false()
    print("ALL PASS")
