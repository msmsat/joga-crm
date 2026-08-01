"""apply_paid: оплата картой проводится РОВНО ОДИН РАЗ.

Вебхук Stripe и возврат кассира на success_url прилетают независимо и почти
одновременно — без защиты клиент получил бы два абонемента за одну оплату.

Запуск из back/:  python -m tests.test_stripe_checkout
"""
import asyncio
import hashlib
import hmac
import json
import time

from fastapi import HTTPException
from sqlalchemy import Update

import routers.checkout.stripe_pay as S
import services.stripe_connect as SC
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
    def __init__(self, v, rowcount=0):
        self._v = v
        self.rowcount = rowcount

    def scalar_one_or_none(self):
        return self._v


class _DB:
    """Фейк с транзакцией: rollback обязан вернуть статус к последнему commit'у.

    Без этого вся ветка «списано, но не проведено» тестировалась бы вхолостую —
    apply_paid ставит status='paid' ДО перевода денег, и решение пометить заявку
    failed принимается именно по откаченному значению.
    """

    def __init__(self, row):
        self._row = row
        self._committed = row.status if row is not None else None

    async def execute(self, q):
        # UPDATE ... SET status='failed' фейк применяет к строке сам, иначе
        # проверить пометку заявки было бы нечем.
        if isinstance(q, Update):
            hit = self._row is not None and self._row.status == "pending"
            if hit:
                self._row.status = "failed"
            return _R(None, rowcount=1 if hit else 0)
        return _R(self._row)

    async def rollback(self):
        if self._row is not None:
            self._row.status = self._committed

    async def commit(self):
        if self._row is not None:
            self._committed = self._row.status


def _run(db, calls, total=1500, raises=None, account_id=None, commit_first=False):
    """apply_paid с подменённым perform_pay — считаем, сколько раз провели оплату."""
    async def _fake_perform_pay(_db, _studio_id, _user_id, _body, *, method):
        calls.append(method)
        if raises is not None:
            # commit_first — сбой уже ПОСЛЕ проведения (perform_pay коммитит сам,
            # падают уведомления следом).
            if commit_first:
                await _db.commit()
            raise raises
        await _db.commit()
        return CheckoutPayResult(total_price=total, bonuses_applied=0)

    saved = S.perform_pay
    S.perform_pay = _fake_perform_pay
    try:
        return asyncio.run(S.apply_paid(db, "cs_test_1", account_id=account_id))
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


def test_event_from_foreign_account_is_ignored():
    """На один эндпоинт сыплются события ВСЕХ подключённых аккаунтов — заявку
    одной студии не должно закрывать событие другой."""
    checkout = _Checkout()
    calls = []

    assert _run(_DB(checkout), calls, account_id="acct_someone_else") is False
    assert checkout.status == "pending"
    assert calls == []
    # Свой аккаунт — проводим как обычно.
    assert _run(_DB(checkout), calls, account_id="acct_123") is True


def test_business_rejection_marks_failed_and_raises():
    """Деньги списаны, а провести нельзя (сертификат погасили в другом окне).
    Заявка не должна остаться pending: иначе оплата теряется без следа."""
    checkout = _Checkout()
    calls = []

    try:
        _run(_DB(checkout), calls, raises=HTTPException(status_code=400, detail={"code": "loyalty.cert_used"}))
    except HTTPException as exc:
        assert exc.detail["code"] == "checkout.paid_not_applied"
    else:
        raise AssertionError("должно подняться paid_not_applied, а не проглотиться")

    assert checkout.status == "failed"


def test_failure_after_commit_is_not_reported_as_lost():
    """Упало уже ПОСЛЕ проведения (например уведомления) — оплата на месте,
    заявку в failed не переводим и ложную тревогу кассиру не поднимаем."""
    checkout = _Checkout()
    calls = []

    assert _run(
        _DB(checkout), calls, commit_first=True,
        raises=HTTPException(status_code=400, detail={"code": "whatever"}),
    ) is True
    assert checkout.status == "paid"
    assert calls == ["stripe"]


def test_delayed_payment_event_is_handled():
    """Банковский перевод подтверждается async_payment_succeeded — без него
    отложенная оплата не провелась бы в CRM никогда."""
    assert "checkout.session.async_payment_succeeded" in S._PAID_EVENTS
    assert "checkout.session.completed" in S._PAID_EVENTS


# --- сам вебхук, а не только apply_paid -------------------------------------
# Тесты выше зовут apply_paid напрямую и потому не заметили, что хендлер падал
# в 500 на первом же обращении к полю события: у StripeObject нет .get().
# Здесь событие проходит настоящий construct_event с настоящей подписью.

_SECRET = "whsec_test"


def _signed(payload: dict) -> tuple[bytes, str]:
    body = json.dumps(payload).encode()
    ts = str(int(time.time()))
    sig = hmac.new(_SECRET.encode(), ts.encode() + b"." + body, hashlib.sha256).hexdigest()
    return body, f"t={ts},v1={sig}"


def _event(event_type: str, payment_status: str | None = None) -> tuple[bytes, str]:
    session = {"id": "cs_test_1", "object": "checkout.session"}
    if payment_status is not None:
        session["payment_status"] = payment_status
    return _signed({
        "id": "evt_1", "object": "event", "type": event_type, "account": "acct_123",
        "data": {"object": session},
    })


class _Req:
    """Минимум от fastapi.Request, который читает stripe_webhook."""

    def __init__(self, body: bytes, signature: str):
        self._body = body
        self.headers = {"stripe-signature": signature}

    async def body(self) -> bytes:
        return self._body


class _NullDB:
    """Считает UPDATE'ы — по ним видно, сняли ли заявку с pending."""

    def __init__(self):
        self.updates = 0

    async def execute(self, q):
        if isinstance(q, Update):
            self.updates += 1
        return _R(None, rowcount=1)

    async def commit(self):
        pass


def _webhook(body: bytes, signature: str, applied: list, db: _NullDB):
    async def _fake_apply_paid(_db, session_id, *, account_id=None):
        applied.append((session_id, account_id))
        return True

    class _CM:
        async def __aenter__(self):
            return db

        async def __aexit__(self, *_exc):
            return False

    saved = SC.WEBHOOK_SECRET, S.apply_paid, S.async_session_maker
    SC.WEBHOOK_SECRET, S.apply_paid, S.async_session_maker = _SECRET, _fake_apply_paid, _CM
    try:
        return asyncio.run(S.stripe_webhook(_Req(body, signature)))
    finally:
        SC.WEBHOOK_SECRET, S.apply_paid, S.async_session_maker = saved


def test_webhook_applies_real_signed_event():
    """Оплаченная сессия доходит до apply_paid вместе с acct_… из поля account."""
    applied, db = [], _NullDB()

    assert _webhook(*_event("checkout.session.completed", "paid"), applied, db) == {"status": "ok"}
    assert applied == [("cs_test_1", "acct_123")]


def test_webhook_skips_unpaid_session():
    """completed по отложенному методу приходит неоплаченным — денег ещё нет."""
    applied, db = [], _NullDB()

    assert _webhook(*_event("checkout.session.completed", "unpaid"), applied, db) == {"status": "ok"}
    assert applied == []


def test_webhook_cancels_expired_session():
    """Протухшая сессия снимает заявку с pending, иначе она висит вечно."""
    applied, db = [], _NullDB()

    assert _webhook(*_event("checkout.session.expired"), applied, db) == {"status": "ok"}
    assert applied == []
    assert db.updates == 1


def test_webhook_rejects_bad_signature():
    """Подделанное событие не должно ничего проводить."""
    applied, db = [], _NullDB()
    body, _sig = _event("checkout.session.completed", "paid")

    assert _webhook(body, "t=1,v1=deadbeef", applied, db) == {"status": "ignored"}
    assert applied == []


if __name__ == "__main__":
    test_pending_checkout_is_paid_once()
    test_second_delivery_is_noop()
    test_unknown_session_is_ignored()
    test_amount_mismatch_still_records_but_warns()
    test_event_from_foreign_account_is_ignored()
    test_business_rejection_marks_failed_and_raises()
    test_failure_after_commit_is_not_reported_as_lost()
    test_delayed_payment_event_is_handled()
    test_webhook_applies_real_signed_event()
    test_webhook_skips_unpaid_session()
    test_webhook_cancels_expired_session()
    test_webhook_rejects_bad_signature()
    print("ALL PASS")
