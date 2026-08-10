"""apply_paid: оплата картой проводится РОВНО ОДИН РАЗ.

Вебхук Stripe и возврат кассира на success_url прилетают независимо и почти
одновременно — без защиты клиент получил бы два абонемента за одну оплату.

Запуск из back/:  python -m tests.test_stripe_checkout
"""
import asyncio
import hashlib
import hmac
import inspect
import json
import time
from types import SimpleNamespace

from fastapi import HTTPException
from sqlalchemy import Update

import routers.checkout.stripe_pay as S
import services.stripe_connect as SC
from routers.checkout.router import perform_pay, reject_dead_promo
from schemas.checkout import CheckoutPayResult

_PAYLOAD = {"client_id": 1, "product_id": 2, "product_type": "subscription", "payment_method": "cash"}


class _Checkout:
    def __init__(self, status="pending", amount=1500, application_fee=0):
        self.session_id = "cs_test_1"
        self.studio_id = 7
        self.user_id = 3
        self.account_id = "acct_123"
        self.payload = dict(_PAYLOAD)
        self.amount = amount
        # Доля платформы, удержанная Stripe (тарифы «процент»/«комбо»). 0 —
        # тариф-подписка: строка в леджер доходов не пишется вовсе.
        self.application_fee = application_fee
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
    async def _fake_perform_pay(_db, _studio_id, _user_id, _body, *, method, expected_total=None):
        calls.append(method)
        # Контракт настоящего perform_pay: пересчёт разошёлся со списанным — 409
        # ДО любых изменений в БД.
        if expected_total is not None and total != expected_total:
            raise HTTPException(status_code=409, detail={"code": "checkout.amount_changed"})
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


def test_amount_mismatch_is_not_recorded_silently():
    """Пересчёт разошёлся со списанной суммой (бонусы потратили в другом окне) —
    в Финансы нельзя записать не то, что забрали у клиента. Заявка в failed,
    кассиру paid_not_applied, разбор вручную."""
    checkout = _Checkout(amount=1500)
    calls = []

    try:
        _run(_DB(checkout), calls, total=1200)
    except HTTPException as exc:
        assert exc.detail["code"] == "checkout.paid_not_applied"
    else:
        raise AssertionError("расхождение суммы не должно проводиться молча")

    assert checkout.status == "failed"


def test_dead_promo_blocks_both_money_paths():
    """Протухший промокод обязан отваливаться ДО Stripe, а не после списания.
    Гард общий у наличных (perform_pay) и карты (create_session)."""
    quote_bad = SimpleNamespace(promo_valid=False)
    quote_ok = SimpleNamespace(promo_valid=True)

    try:
        reject_dead_promo("SUMMER30", quote_bad)
    except HTTPException as exc:
        assert exc.detail["code"] == "checkout.promo_expired"
    else:
        raise AssertionError("невалидный промокод должен падать 400")

    # Промокода не вводили — оплата идёт как обычно.
    assert reject_dead_promo(None, quote_bad) is None
    assert reject_dead_promo("SUMMER30", quote_ok) is None
    # Оба денежных пути зовут именно этот гард.
    assert "reject_dead_promo" in inspect.getsource(S.create_session)
    assert "reject_dead_promo" in inspect.getsource(perform_pay)


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
    """Подделанное событие ничего не проводит — и получает 400, а не 200 «ignored».

    Раньше здесь был 200. Настоящая причина несошедшейся подписи — разъехавшийся
    секрет, и при 200 Stripe считает доставку удачной: ретраев нет, в дашборде
    зелено. Цена именно на ЭТОМ эндпоинте максимальная: покупка абонемента в
    мини-приложении проводится только вебхуком, страховки вида /checkout/confirm
    (её зовёт касса CRM) у клиента нет — молча отброшенное событие значит «клиент
    заплатил и не получил ничего».
    """
    applied, db = [], _NullDB()
    body, _sig = _event("checkout.session.completed", "paid")

    try:
        _webhook(body, "t=1,v1=deadbeef", applied, db)
        raise AssertionError("подделка прошла молча — Stripe не узнает о поломке секрета")
    except HTTPException as exc:
        assert exc.status_code == 400
    assert applied == []


# ------------------------------------------------------- возврат откатывает продажу

def test_full_refund_is_recognised():
    """Вернули всю сумму — только это считается полным возвратом."""
    assert S._is_full_refund(SimpleNamespace(amount=1500, amount_refunded=1500)) is True
    assert S._is_full_refund(SimpleNamespace(amount=1500, amount_refunded=1600)) is True


def test_partial_refund_is_not_full():
    """Частичный возврат продажу не откатывает: абонемент мог быть наполовину отходен."""
    assert S._is_full_refund(SimpleNamespace(amount=1500, amount_refunded=500)) is False
    assert S._is_full_refund(SimpleNamespace(amount=1500, amount_refunded=0)) is False


def test_event_without_amounts_is_not_full_refund():
    """Событие без сумм не должно читаться как «вернули всё»: иначе 0 >= 0 молча
    погасил бы абонемент клиенту, у которого деньги на месте."""
    assert S._is_full_refund(SimpleNamespace(amount=0, amount_refunded=0)) is False
    assert S._is_full_refund(SimpleNamespace()) is False


class _RevertDB:
    """Отдаёт абонемент на select, копит добавленные объекты."""

    def __init__(self, sub):
        self._sub = sub
        self.added = []

    async def execute(self, _q):
        return _R(self._sub)

    def add(self, obj):
        self.added.append(obj)


def _run_revert(sub, amount=1500):
    account = SimpleNamespace(id=9, balance=10_000)
    reverted_loyalty = []

    async def _fake_resolve_account(_db, _studio_id, _account_id, *, default_type="cash"):
        reverted_loyalty.append(("account", default_type))
        return account

    async def _fake_revert_loyalty(_db, studio_id, client_id, amount):
        reverted_loyalty.append(("loyalty", studio_id, client_id, amount))

    checkout = _Checkout(status="paid", amount=amount)
    checkout.subscription_id = sub.id if sub is not None else None

    saved = (S.resolve_account, S._revert_loyalty)
    S.resolve_account, S._revert_loyalty = _fake_resolve_account, _fake_revert_loyalty
    try:
        db = _RevertDB(sub)
        asyncio.run(S._revert_sale(db, checkout))
    finally:
        S.resolve_account, S._revert_loyalty = saved
    return db, account, reverted_loyalty


def test_refund_cancels_the_subscription():
    """Проданный абонемент гасится: все выборки фильтруют status == "active",
    поэтому он исчезает и из кошелька, и из записи на занятия."""
    sub = SimpleNamespace(id=55, status="active")
    _db, _account, _calls = _run_revert(sub)
    assert sub.status == "cancelled"


def test_refund_books_a_compensating_operation():
    """Деньги снимаются со счёта расходной операцией, а не удалением доходной:
    проведённую запись задним числом не стирают."""
    sub = SimpleNamespace(id=55, status="active")
    db, account, _calls = _run_revert(sub, amount=1500)

    assert len(db.added) == 1
    op = db.added[0]
    assert (op.type, op.amount, op.category) == ("out", 1500, "Возвраты")
    assert op.account_id == 9
    assert account.balance == 10_000 - 1500


def test_refund_takes_money_from_the_online_account():
    """Возврат снимает деньги с того же счёта, куда легла онлайн-оплата, — не с кассы."""
    sub = SimpleNamespace(id=55, status="active")
    _db, _account, calls = _run_revert(sub)
    assert ("account", "online") in calls


def test_refund_reverts_loyalty():
    """Баллы и сумма покупок откатываются на реально возвращённую сумму."""
    sub = SimpleNamespace(id=55, status="active")
    _db, _account, calls = _run_revert(sub, amount=1500)
    assert ("loyalty", 7, 1, 1500) in calls


def test_refund_of_a_single_visit_touches_no_subscription():
    """Разовое посещение абонемента не создаёт — гасить нечего, деньги всё равно
    возвращаются."""
    db, account, _calls = _run_revert(None, amount=1500)
    assert len(db.added) == 1
    assert account.balance == 10_000 - 1500


if __name__ == "__main__":
    test_pending_checkout_is_paid_once()
    test_second_delivery_is_noop()
    test_unknown_session_is_ignored()
    test_amount_mismatch_is_not_recorded_silently()
    test_dead_promo_blocks_both_money_paths()
    test_event_from_foreign_account_is_ignored()
    test_business_rejection_marks_failed_and_raises()
    test_failure_after_commit_is_not_reported_as_lost()
    test_delayed_payment_event_is_handled()
    test_webhook_applies_real_signed_event()
    test_webhook_skips_unpaid_session()
    test_webhook_cancels_expired_session()
    test_webhook_rejects_bad_signature()
    test_full_refund_is_recognised()
    test_partial_refund_is_not_full()
    test_event_without_amounts_is_not_full_refund()
    test_refund_cancels_the_subscription()
    test_refund_books_a_compensating_operation()
    test_refund_takes_money_from_the_online_account()
    test_refund_reverts_loyalty()
    test_refund_of_a_single_visit_touches_no_subscription()
    print("ALL PASS")
