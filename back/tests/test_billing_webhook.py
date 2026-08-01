"""Сквозная проверка вебхука оплаты тарифа — без сети и без реального Stripe:
гоняем настоящий обработчик stripe_webhook с фейковой сессией БД.

События проходят НАСТОЯЩИЙ construct_event с настоящей подписью, а не подсовываются
разобранными: иначе тесты не заметили бы, что у StripeObject нет `.get()` и разбор
metadata падает на первом же реальном событии.

Запуск из back/:  python -m tests.test_billing_webhook
"""
import asyncio
import hashlib
import hmac
import json
import time
from datetime import datetime, timedelta

import routers.billing.webhook as W
from services import stripe_billing
from services.plan_limits import _limit_for
from routers.billing.plans import amount_for

_SECRET = "whsec_test"


# ─── Фейки моделей и сессии (паттерн tests/test_loyalty_points.py) ──────────────
class _Invoice:
    def __init__(self, status="pending", studio_id=1, user_id=None,
                 plan_name="pro", period_months=1, invoice_id=1):
        self.id = invoice_id
        self.status = status
        self.order_id = None
        self.studio_id = studio_id
        # user_id=None по умолчанию: с ним _activate не идёт сохранять карту, а
        # значит не ходит в сеть. Тест карты подсовывает fetch_session сам.
        self.user_id = user_id
        self.plan_name = plan_name
        self.period_months = period_months
        self.amount = amount_for(plan_name, period_months)
        self.paid_at = None
        self.payment_method = None
        self.pdf_url = None


class _Plan:
    def __init__(self, studio_id=1, plan_name="pro", status="active", expires_at=None):
        self.studio_id = studio_id
        self.plan_name = plan_name
        self.status = status
        self.expires_at = expires_at
        self.auto_renewal = True
        self.max_staff = 5


class _R:
    def __init__(self, v): self._v = v
    def scalar_one_or_none(self): return self._v


class _DB:
    """execute() отдаёт значения из seq по порядку запросов обработчика."""
    def __init__(self, seq):
        self._seq = list(seq)
        self.added = []
        self.committed = False

    def add(self, x): self.added.append(x)
    async def flush(self): pass
    async def commit(self): self.committed = True
    async def execute(self, _q): return _R(self._seq.pop(0))
    async def __aenter__(self): return self
    async def __aexit__(self, *a): return False


class _Req:
    """Мини-Request: только то, что читает stripe_webhook."""
    def __init__(self, body: bytes, signature: str):
        self._body = body
        self.headers = {"stripe-signature": signature}

    async def body(self) -> bytes: return self._body


def _signed(payload: dict) -> tuple[bytes, str]:
    body = json.dumps(payload).encode()
    ts = str(int(time.time()))
    sig = hmac.new(_SECRET.encode(), ts.encode() + b"." + body, hashlib.sha256).hexdigest()
    return body, f"t={ts},v1={sig}"


def _session_event(event_type: str, *, invoice_id=1, payment_status="paid",
                   amount_total=None, currency=None, session_id="cs_test_1", account=None):
    obj = {"id": session_id, "object": "checkout.session", "metadata": {"invoice_id": str(invoice_id)}}
    if payment_status is not None:
        obj["payment_status"] = payment_status
    if amount_total is not None:
        obj["amount_total"] = amount_total
    obj["currency"] = currency if currency is not None else stripe_billing.CURRENCY
    event = {"id": "evt_1", "object": "event", "type": event_type, "data": {"object": obj}}
    if account is not None:
        event["account"] = account
    return _signed(event)


def _run_webhook(signed, db):
    """Гоняет настоящий обработчик, подсунув фейковую сессию и секрет подписи."""
    body, sig = signed
    saved_secret, saved_maker = stripe_billing.WEBHOOK_SECRET, W.async_session_maker
    stripe_billing.WEBHOOK_SECRET = _SECRET
    W.async_session_maker = lambda: db
    try:
        return asyncio.run(W.stripe_webhook(_Req(body, sig)))
    finally:
        stripe_billing.WEBHOOK_SECRET = saved_secret
        W.async_session_maker = saved_maker


# ─── Чек-лист ───────────────────────────────────────────────────────────────────
def test_success_activates():
    """1. Оплата картой → счёт paid, подписка active, срок +период."""
    inv = _Invoice(status="pending", plan_name="pro", period_months=1)
    plan = _Plan(status="active", expires_at=None)
    db = _DB([inv, plan])  # 1) поиск счёта, 2) поиск подписки в _activate
    res = _run_webhook(_session_event("checkout.session.completed", amount_total=inv.amount), db)

    assert res == {"status": "ok"}
    assert inv.status == "paid"
    assert inv.paid_at is not None
    assert inv.order_id == "cs_test_1"
    assert inv.pdf_url is not None and inv.pdf_url.endswith(f"/billing/invoices/{inv.id}/receipt.pdf")
    assert plan.status == "active"
    assert plan.expires_at is not None and plan.expires_at > datetime.utcnow()
    assert db.committed is True


def test_unpaid_session_does_nothing():
    """2. completed по отложенному методу приходит неоплаченным — денег ещё нет."""
    inv = _Invoice(status="pending")
    db = _DB([inv])
    res = _run_webhook(_session_event("checkout.session.completed", payment_status="unpaid"), db)

    assert res == {"status": "ok"}
    assert inv.status == "pending"
    assert db.committed is False


def test_expired_session_fails_invoice():
    """3. Страница протухла → счёт failed, подписки не касаемся."""
    inv = _Invoice(status="pending")
    db = _DB([inv])
    res = _run_webhook(_session_event("checkout.session.expired", payment_status=None), db)

    assert res == {"status": "ok"}
    assert inv.status == "failed"
    assert db.committed is True


def test_refund_rolls_back_subscription():
    """4. charge.refunded → счёт refunded, срок откатан; в прошлом → expired."""
    inv = _Invoice(status="paid", period_months=1)
    # срок кончается через 10 дней; откат на 1 мес уводит его в прошлое → expired
    plan = _Plan(status="active", expires_at=datetime.utcnow() + timedelta(days=10))
    db = _DB([inv, plan])
    res = _run_webhook(_session_event("charge.refunded", payment_status=None), db)

    assert res == {"status": "ok"}
    assert inv.status == "refunded"
    assert plan.expires_at < datetime.utcnow()
    assert plan.status == "expired"


def test_idempotent_repeat_paid():
    """5. Ретрай Stripe по уже оплаченному счёту → no-op, тариф не начисляется дважды."""
    inv = _Invoice(status="paid")
    plan = _Plan(status="active", expires_at=datetime.utcnow() + timedelta(days=30))
    before = plan.expires_at
    db = _DB([inv])  # обработчик выйдет на идемпотентности ДО чтения подписки
    res = _run_webhook(_session_event("checkout.session.completed", amount_total=inv.amount), db)

    assert res == {"status": "ok"}
    assert plan.expires_at == before          # срок не сдвинулся
    assert db.committed is False              # ничего не коммитили


def test_bad_signature_changes_nothing():
    """6. Подделанное событие не должно ничего активировать."""
    inv = _Invoice(status="pending")
    db = _DB([inv])
    body, _sig = _session_event("checkout.session.completed", amount_total=inv.amount)
    res = _run_webhook((body, "t=1,v1=deadbeef"), db)

    assert res == {"status": "ignored"}
    assert inv.status == "pending"
    assert db.committed is False


def test_wrong_amount_does_not_activate():
    """7. Заплатили не ту сумму — тариф не выдаём: иначе оплата на 1 крону
    активировала бы Business на два года."""
    inv = _Invoice(status="pending", plan_name="business", period_months=24)
    db = _DB([inv])  # до _activate дело не доходит — подписка не читается
    res = _run_webhook(_session_event("checkout.session.completed", amount_total=100), db)

    assert res == {"status": "ok"}
    assert inv.status == "pending"
    assert db.committed is False


def test_wrong_currency_does_not_activate():
    """8. Та же сумма, но в другой валюте — это другие деньги."""
    inv = _Invoice(status="pending")
    db = _DB([inv])
    res = _run_webhook(
        _session_event("checkout.session.completed", amount_total=inv.amount, currency="xxx"), db,
    )

    assert res == {"status": "ok"}
    assert inv.status == "pending"


def test_expired_event_cannot_unpay_invoice():
    """9. Брошенная вкладка протухает уже ПОСЛЕ оплаты с другого устройства —
    оплаченный счёт назад в failed не роняем."""
    inv = _Invoice(status="paid")
    db = _DB([inv])
    res = _run_webhook(_session_event("checkout.session.expired", payment_status=None), db)

    assert res == {"status": "ok"}
    assert inv.status == "paid"
    assert db.committed is False


def test_missing_metadata_is_ignored():
    """10. Событие без metadata.invoice_id (чужой платёж на том же аккаунте) —
    не наш счёт, молча пропускаем, а не падаем в 500."""
    body, sig = _signed({
        "id": "evt_1", "object": "event", "type": "checkout.session.completed",
        "data": {"object": {"id": "cs_x", "object": "checkout.session", "payment_status": "paid"}},
    })
    db = _DB([])  # ни одного запроса в БД быть не должно
    assert _run_webhook((body, sig), db) == {"status": "ok"}


def test_card_saved_from_session():
    """11. После оплаты сохраняется карта для кнопки «Продлить» — маска и
    идентификаторы Stripe, номер карты к нам не попадает."""
    inv = _Invoice(status="pending", user_id=7)
    plan = _Plan(status="active")
    db = _DB([inv, plan, None])  # счёт, подписка, поиск существующей карты

    class _Card:
        last4, brand, exp_month, exp_year = "4242", "visa", 4, 2031

    class _Method:
        id, card = "pm_123", _Card()

    class _Session:
        payment_intent = type("PI", (), {"payment_method": _Method()})()
        customer = "cus_123"

    async def _fake_fetch(_sid): return _Session()

    saved, stripe_billing.fetch_session = stripe_billing.fetch_session, _fake_fetch
    try:
        res = _run_webhook(_session_event("checkout.session.completed", amount_total=inv.amount), db)
    finally:
        stripe_billing.fetch_session = saved

    assert res == {"status": "ok"}
    assert inv.status == "paid"
    card = next(x for x in db.added if getattr(x, "rectoken", None) == "pm_123")
    assert card.card_last4 == "4242"
    assert card.card_brand == "visa"
    assert card.card_expiry == "04/31"
    assert card.stripe_customer_id == "cus_123"


def test_event_from_connected_account_is_ignored():
    """13. Тариф платят платформе. Событие подключённого аккаунта отбрасываем:
    metadata на своём аккаунте задаёт его владелец, и студия выписала бы себе
    оплаченный счёт, заплатив ту же сумму самой себе."""
    inv = _Invoice(status="pending")
    db = _DB([])  # ни одного запроса в БД быть не должно
    res = _run_webhook(
        _session_event("checkout.session.completed", amount_total=inv.amount, account="acct_evil"), db,
    )

    assert res == {"status": "ignored"}
    assert inv.status == "pending"
    assert db.committed is False


def test_refunded_invoice_cannot_be_reactivated():
    """14. Возврат конечен: сессия у Stripe так и осталась paid, и повторное
    событие (или ручная сверка) не должно начислять период второй раз."""
    inv = _Invoice(status="refunded")
    plan = _Plan(status="expired", expires_at=datetime.utcnow() - timedelta(days=1))
    before = plan.expires_at
    db = _DB([inv])  # выходим на статусе ДО чтения подписки
    res = _run_webhook(_session_event("checkout.session.completed", amount_total=inv.amount), db)

    assert res == {"status": "ok"}
    assert inv.status == "refunded"
    assert plan.expires_at == before
    assert db.committed is False


def test_limits_before_and_after_upgrade():
    """12. Лимиты: Старт ограничен, Pro/free_trial свободнее, Business безлимит."""
    assert _limit_for("start", "staff") == 3
    assert _limit_for("pro", "staff") == 15
    assert _limit_for("free_trial", "staff") == 15    # триал = лимиты Pro
    assert _limit_for("business", "staff") is None     # безлимит


if __name__ == "__main__":
    test_success_activates()
    test_unpaid_session_does_nothing()
    test_expired_session_fails_invoice()
    test_refund_rolls_back_subscription()
    test_idempotent_repeat_paid()
    test_bad_signature_changes_nothing()
    test_wrong_amount_does_not_activate()
    test_wrong_currency_does_not_activate()
    test_expired_event_cannot_unpay_invoice()
    test_missing_metadata_is_ignored()
    test_card_saved_from_session()
    test_event_from_connected_account_is_ignored()
    test_refunded_invoice_cannot_be_reactivated()
    test_limits_before_and_after_upgrade()
    print("ALL PASS — вебхук оплаты тарифа зелёный на уровне логики")
