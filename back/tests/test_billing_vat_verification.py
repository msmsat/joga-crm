"""Фиктивный VAT ID не должен и дальше обнулять нам налог.

Stripe Tax применяет reverse charge (0 % НДС) по ФОРМАТУ номера, не дожидаясь
сверки с VIES: `DE000000000` обнуляет налог так же, как настоящий номер. Сверка
приезжает вебхуком `customer.tax_id.updated` уже ПОСЛЕ оплаты, и если она не
прошла — права продавать без НДС у нас не было. Деньги за тариф те же, а 21 %
налоговая вычтет из выручки ПЛАТФОРМЫ.

Своей копии номера у нас больше нет — его вводят на странице Checkout, и живёт он
там же. Значит стирать в БД нечего, а «событие уже обработано» определяется ответом
самого Stripe: повторное удаление отвечает `resource_missing`.

Инварианты обработчика (routers/billing/webhook._handle_tax_id):
  1. `unverified` → номер снят у Stripe, владельцу ушло письмо.
  2. `pending` / `verified` / `unavailable` → не трогаем ничего. Первый — сверка
     ещё идёт (в test-режиме навсегда), третий — VIES не ответил; снимать по ним
     значит брать НДС с честной студии из-за чужого сбоя.
  3. Упавший запрос к Stripe → 500 и ретрай, а не проглоченная ошибка при живом
     reverse charge.
  4. Ретрай по уже снятому номеру не шлёт владельцу второе письмо.

Сеть и БД не трогаем: Stripe и отправка письма подменены заглушками.

Запуск из back/:  python -m pytest tests/test_billing_vat_verification.py
"""
import asyncio
import hashlib
import hmac
import json
import time
from types import SimpleNamespace

import pytest
import stripe

import routers.billing.webhook as W
import services.billing_mail as M
from services import stripe_billing as SB

_SECRET = "whsec_test"


# ─── стенд: подписанное событие + фейковая сессия ──────────────────────────────

class _Res:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class _DB:
    def __init__(self, studio=None):
        self.studio = studio
        self.commits = 0
        self.queries = 0

    async def execute(self, _q):
        self.queries += 1
        return _Res(self.studio)

    async def commit(self):
        self.commits += 1

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False


class _Req:
    def __init__(self, body: bytes, signature: str):
        self._body = body
        self.headers = {"stripe-signature": signature}

    async def body(self) -> bytes:
        return self._body


def _signed(payload: dict) -> tuple[bytes, str]:
    body = json.dumps(payload).encode()
    ts = str(int(time.time()))
    sig = hmac.new(_SECRET.encode(), ts.encode() + b"." + body, hashlib.sha256).hexdigest()
    return body, f"t={ts},v1={sig}"


def _event(status: str, value: str = "DE000000000") -> dict:
    """Тело `customer.tax_id.updated` в том виде, в каком его шлёт Stripe."""
    return {
        "id": "evt_1", "object": "event", "type": "customer.tax_id.updated",
        "data": {"object": {
            "id": "txi_1", "object": "tax_id", "customer": "cus_1",
            "type": "eu_vat", "value": value,
            "verification": {
                "status": status, "verified_name": None, "verified_address": None,
            },
        }},
    }


def _run(payload: dict, db: _DB, *, delete=None):
    """Гоняет НАСТОЯЩИЙ обработчик вебхука: подпись, диспетчер, _handle_tax_id.

    Возвращает (результат, снятые у Stripe номера, отправленные письма). Проверять
    маршрутизацию отдельным грепом по исходнику незачем — здесь она проходится.
    """
    deleted, mailed = [], []

    async def _delete(customer_id, tax_id):
        deleted.append((customer_id, tax_id))
        if delete is not None:
            # None от заглушки = «номера уже не было», как у настоящей delete_tax_id.
            return delete()
        return True

    async def _mail(_db, studio_id, vat_id):
        mailed.append((studio_id, vat_id))
        return True

    body, sig = _signed(payload)
    saved = (SB.WEBHOOK_SECRET, W.async_session_maker, SB.delete_tax_id, M.send_vat_rejected)
    SB.WEBHOOK_SECRET = _SECRET
    W.async_session_maker = lambda: db
    SB.delete_tax_id = _delete
    M.send_vat_rejected = _mail
    try:
        return asyncio.run(W.stripe_webhook(_Req(body, sig))), deleted, mailed
    finally:
        SB.WEBHOOK_SECRET, W.async_session_maker, SB.delete_tax_id, M.send_vat_rejected = saved


# ─── 1. unverified: номер снимается у Stripe ───────────────────────────────────

def test_unverified_vat_is_wiped_from_stripe():
    studio = SimpleNamespace(id=7)
    res, deleted, mailed = _run(_event("unverified"), _DB(studio))

    assert res == {"status": "ok"}
    assert deleted == [("cus_1", "txi_1")], "номер остался у Stripe — reverse charge продолжит действовать"
    assert mailed == [(7, "DE000000000")], "владелец не предупреждён, что счета вырастут на ставку НДС"


def test_our_own_copy_is_wiped_too():
    """Своя копия номера лежит на аккаунте владельца (форма реквизитов), и снять его
    только у Stripe мало: следующее оформление зальёт обратно ровно тот номер,
    который мы отклонили (checkout._ensure_customer), и защита превратится в
    отсрочку на одну оплату."""
    db = _DB(SimpleNamespace(id=7))
    _run(_event("unverified"), db)

    assert db.commits == 1, "стирание своей копии не закоммичено — её увидит только этот запрос"


# ─── 2. остальные статусы не трогают ничего ────────────────────────────────────

@pytest.mark.parametrize("status", ["pending", "verified", "unavailable"])
def test_other_verification_states_change_nothing(status):
    """`pending` висит вечно в test-режиме, `unavailable` — это лежащий VIES.
    Снять номер по ним значит начать брать НДС с честной студии за чужой сбой."""
    res, deleted, mailed = _run(_event(status, value="CZ12345678"), _DB(SimpleNamespace(id=7)))

    assert res == {"status": "ok"}
    assert deleted == [] and mailed == []


# ─── 3. сбой Stripe → ретрай, а не тихая потеря ────────────────────────────────

def test_stripe_failure_is_retried_not_swallowed():
    """500 заставит Stripe повторить доставку. Проглоченная ошибка оставила бы
    номер живым у Stripe навсегда: второго события по нему не будет."""
    db = _DB(SimpleNamespace(id=7, vat_id="DE000000000"))

    def boom():
        raise stripe.APIConnectionError("Stripe недоступен")

    with pytest.raises(stripe.APIConnectionError):
        _run(_event("unverified"), db, delete=boom)

    assert db.commits == 0


def test_delete_tolerates_an_already_removed_number():
    """Ретрай по уже обработанному событию не должен падать бесконечно."""
    def gone(*_a, **_kw):
        raise stripe.InvalidRequestError(
            "No such tax id: 'txi_1'", param="id", code="resource_missing",
        )

    saved = stripe.Customer.delete_tax_id
    stripe.Customer.delete_tax_id = gone
    try:
        # False, а не None: по нему обработчик понимает «событие уже обработано»
        # и не шлёт владельцу второе письмо.
        assert asyncio.run(SB.delete_tax_id("cus_1", "txi_1")) is False
    finally:
        stripe.Customer.delete_tax_id = saved


def test_delete_does_not_swallow_other_stripe_errors():
    def boom(*_a, **_kw):
        raise stripe.InvalidRequestError("nope", param="id", code="parameter_invalid_empty")

    saved = stripe.Customer.delete_tax_id
    stripe.Customer.delete_tax_id = boom
    try:
        with pytest.raises(stripe.InvalidRequestError):
            asyncio.run(SB.delete_tax_id("cus_1", "txi_1"))
    finally:
        stripe.Customer.delete_tax_id = saved


# ─── 4. повторная доставка события ─────────────────────────────────────────────

def test_retry_of_a_handled_event_does_not_mail_twice():
    """Stripe ретраит доставку трое суток. Номер уже снят, delete_tax_id отвечает
    False — второе письмо «ваш VAT отклонён» владельцу не нужно."""
    studio = SimpleNamespace(id=7)
    _res, deleted, mailed = _run(
        _event("unverified"), _DB(studio), delete=lambda: False,
    )

    assert deleted == [("cus_1", "txi_1")]
    assert mailed == []


def test_unknown_customer_is_not_a_failure():
    """Клиент без студии в нашей БД (ручной объект в дашборде): номер у Stripe
    снимаем, но 500 из-за этого не отдаём — ретраи ничего не изменят."""
    res, deleted, mailed = _run(_event("unverified"), _DB(studio=None))

    assert res == {"status": "ok"}
    assert deleted == [("cus_1", "txi_1")]
    assert mailed == []


if __name__ == "__main__":
    import sys
    sys.exit(pytest.main([__file__, "-q"]))
