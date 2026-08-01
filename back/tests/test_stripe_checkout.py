"""apply_paid: оплата картой проводится РОВНО ОДИН РАЗ.

Вебхук Stripe и возврат кассира на success_url прилетают независимо и почти
одновременно — без защиты клиент получил бы два абонемента за одну оплату.

Запуск из back/:  python -m tests.test_stripe_checkout
"""
import asyncio

import routers.checkout.stripe_pay as S
from schemas.checkout import CheckoutPayResult

_PAYLOAD = {"client_id": 1, "product_id": 2, "product_type": "subscription", "payment_method": "cash"}


class _Checkout:
    def __init__(self, status="pending", amount=1500):
        self.session_id = "cs_test_1"
        self.studio_id = 7
        self.user_id = 3
        self.account_id = "acct_123"
        self.payload = dict(_PAYLOAD)
        self.amount = amount
        self.status = status


class _R:
    def __init__(self, v):
        self._v = v

    def scalar_one_or_none(self):
        return self._v


class _DB:
    def __init__(self, row):
        self._row = row

    async def execute(self, _q):
        return _R(self._row)


def _run(db, calls, total=1500):
    """apply_paid с подменённым perform_pay — считаем, сколько раз провели оплату."""
    async def _fake_perform_pay(_db, _studio_id, _user_id, _body, *, method):
        calls.append(method)
        return CheckoutPayResult(total_price=total, bonuses_applied=0)

    saved = S.perform_pay
    S.perform_pay = _fake_perform_pay
    try:
        return asyncio.run(S.apply_paid(db, "cs_test_1"))
    finally:
        S.perform_pay = saved


def test_pending_checkout_is_paid_once():
    checkout = _Checkout()
    calls = []

    assert _run(_DB(checkout), calls) is True
    assert checkout.status == "paid"
    # Метод именно "stripe": деньги пришли картой, а не из кассы наличными.
    assert calls == ["stripe"]


def test_second_delivery_is_noop():
    """Вебхук пришёл вторым (или Stripe его ретраит) — повторно не проводим."""
    checkout = _Checkout()
    calls = []

    assert _run(_DB(checkout), calls) is True
    assert _run(_DB(checkout), calls) is False
    assert calls == ["stripe"]  # ровно одно проведение на две доставки


def test_unknown_session_is_ignored():
    """Чужой/устаревший session_id не должен ронять вебхук — Stripe будет ретраить."""
    calls = []
    assert _run(_DB(None), calls) is False
    assert calls == []


def test_amount_mismatch_still_records_but_warns():
    """Пересчёт разошёлся со списанной суммой — оплату теряем, а не проводим
    молча: деньги уже у студии. Расхождение уходит в лог (ponytail-потолок)."""
    checkout = _Checkout(amount=1500)
    calls = []
    assert _run(_DB(checkout), calls, total=1200) is True
    assert checkout.status == "paid"


if __name__ == "__main__":
    test_pending_checkout_is_paid_once()
    test_second_delivery_is_noop()
    test_unknown_session_is_ignored()
    test_amount_mismatch_still_records_but_warns()
    print("ALL PASS")
