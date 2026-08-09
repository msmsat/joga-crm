"""Вебхук Stripe по подписке на тариф: идемпотентность apply_status, подпись,
отбраковка событий подключённого аккаунта.

Полный проход обработчика (customer.subscription.*, invoice.*, charge.refunded,
активация тарифа) прогоняется сквозным сетевым тестом в
test_billing_subscription.py — здесь только offline-логика, без Stripe.

Прежняя версия файла была написана под удалённый контракт
(checkout.session.completed/expired) и импортировала amount_matches/find_invoice,
убранные вместе с разовыми оплатами (Task 7) — collect падал. Переписан под
apply_status/map_subscription_status.

Запуск из back/:  python -m tests.test_billing_webhook
"""
import asyncio
import hashlib
import hmac
import json
import time
import types

import routers.billing.webhook as W
from routers.billing.webhook import apply_status, map_subscription_status
from services import stripe_billing

_SECRET = "whsec_test"


async def _noop():
    return None


# ─── apply_status: идемпотентность и терминальные статусы ──────────────────────

def test_repeat_paid_is_noop():
    """Ретрай вебхука не начисляет тариф дважды."""
    db = types.SimpleNamespace(commit=lambda: _noop())
    invoice = types.SimpleNamespace(status="paid")
    assert asyncio.run(apply_status(db, invoice, "paid")) is False


def test_paid_never_falls_back_to_failed():
    """Неудачная попытка, пришедшая после успешной оплаты, не отменяет её."""
    db = types.SimpleNamespace(commit=lambda: _noop())
    invoice = types.SimpleNamespace(status="paid")
    assert asyncio.run(apply_status(db, invoice, "failed")) is False
    assert invoice.status == "paid"


def test_refunded_is_terminal():
    """Сверка по возвращённому счёту не начисляет период второй раз."""
    db = types.SimpleNamespace(commit=lambda: _noop())
    invoice = types.SimpleNamespace(status="refunded")
    assert asyncio.run(apply_status(db, invoice, "paid")) is False
    assert invoice.status == "refunded"


def test_unknown_status_denies_access():
    """Ошибаться безопаснее в сторону «не пустить»."""
    assert map_subscription_status("новьё") == "expired"


def test_paid_sends_receipt():
    """Переход счёта в paid обязан отправить чек владельцу.

    Проверяем именно проводку: отправка живёт в services/billing_mail и зовётся из
    apply_status ПОСЛЕ коммита. Тумблер «Чек на email» проверяет self-check самого
    модуля — здесь важно, что вызов не потерялся. Стабим и БД, и отправку: письмо
    из теста уходило бы настоящим SMTP.
    """
    import services.billing_mail as M

    sent = []
    saved = M.send_receipt

    async def _fake_send_receipt(_db, invoice):
        sent.append(invoice.status)
        return True

    class _NoPlan:
        """apply_status ищет план студии — отдаём «нет строки», чтобы _activate и
        синхронизация карты не пошли в сеть."""
        def scalar_one_or_none(self):
            return None

    db = types.SimpleNamespace(commit=lambda: _noop(), execute=lambda _q: _resolve(_NoPlan()))

    async def _resolve(value):
        return value

    M.send_receipt = _fake_send_receipt
    try:
        # kind="subscription" — счёт за тариф (дефолт модели). У счёта за
        # комиссию _activate выходит раньше, подписку не трогая.
        # stripe_invoice_id=None — леджер доходов в этом тесте не проверяем.
        invoice = types.SimpleNamespace(
            status="pending", studio_id=1, paid_at=None,
            kind="subscription", plan_name="pro", stripe_invoice_id=None,
        )
        assert asyncio.run(apply_status(db, invoice, "paid")) is True
    finally:
        M.send_receipt = saved

    assert invoice.status == "paid"
    assert sent == ["paid"], "чек не отправлен при переходе счёта в paid"


# ─── Подпись и отбраковка событий подключённого аккаунта ───────────────────────
# Эта логика не менялась между разовыми оплатами и подписками — она защищает
# от подделанных запросов и от событий чужого (Connect) аккаунта, где студия
# могла бы выписать себе оплаченный счёт, заплатив ту же сумму самой себе.

class _Req:
    """Мини-Request: только то, что читает stripe_webhook."""
    def __init__(self, body: bytes, signature: str):
        self._body = body
        self.headers = {"stripe-signature": signature}

    async def body(self) -> bytes:
        return self._body


class _DB:
    """Событие должно быть отброшено ДО похода в БД — execute/commit не должны
    вызываться вовсе. Любой вызов — сам по себе провал теста."""
    async def execute(self, _q):
        raise AssertionError("БД не должна была получить запрос")

    async def commit(self):
        raise AssertionError("коммит не должен был случиться")

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False


def _signed(payload: dict) -> tuple[bytes, str]:
    body = json.dumps(payload).encode()
    ts = str(int(time.time()))
    sig = hmac.new(_SECRET.encode(), ts.encode() + b"." + body, hashlib.sha256).hexdigest()
    return body, f"t={ts},v1={sig}"


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


def test_bad_signature_changes_nothing():
    """Подделанное событие не должно ничего обработать."""
    payload = {
        "id": "evt_1", "object": "event", "type": "invoice.paid",
        "data": {"object": {"id": "in_1"}},
    }
    body, _sig = _signed(payload)
    res = _run_webhook((body, "t=1,v1=deadbeef"), _DB())
    assert res == {"status": "ignored"}


def test_event_from_connected_account_is_ignored():
    """Тариф платят платформе, событий подключённых аккаунтов тут быть не может.
    У них заполнено `account` — без этой проверки студия выписывала бы себе
    оплаченный счёт, заплатив ту же сумму самой себе (деньги садятся на её же
    баланс)."""
    payload = {
        "id": "evt_1", "object": "event", "type": "invoice.paid",
        "account": "acct_evil",
        "data": {"object": {"id": "in_1"}},
    }
    res = _run_webhook(_signed(payload), _DB())
    assert res == {"status": "ignored"}


if __name__ == "__main__":
    test_repeat_paid_is_noop()
    test_paid_never_falls_back_to_failed()
    test_refunded_is_terminal()
    test_unknown_status_denies_access()
    test_paid_sends_receipt()
    test_bad_signature_changes_nothing()
    test_event_from_connected_account_is_ignored()
    print("ALL PASS — вебхук подписки зелёный на уровне логики")
