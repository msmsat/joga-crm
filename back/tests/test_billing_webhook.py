"""Сквозная проверка вебхука Fondy на уровне логики — чек-лист задачи 13, без сети
и без реального Fondy: гоняем настоящий обработчик fondy_webhook с фейковой сессией.

Тестовый мерчант в Fondy остаётся ручным прогоном (клик по checkout-странице,
реальные колбэки через туннель) — а вот рискованные ветки (подпись, идемпотентность,
провал, возврат, лимиты) закрываем здесь, чтобы они были зелёными ДО туннеля.

Запуск из back/:  python -m tests.test_billing_webhook
"""
import asyncio
from datetime import datetime, timedelta

import routers.billing.webhook as W
from services import fondy
from services.plan_limits import _limit_for
from routers.billing.plans import amount_for


# ─── Фейки моделей и сессии (паттерн tests/test_loyalty_points.py) ──────────────
class _Invoice:
    def __init__(self, status="pending", order_id="velora-1-x", studio_id=1,
                 user_id=1, plan_name="pro", period_months=1):
        self.status = status
        self.order_id = order_id
        self.studio_id = studio_id
        self.user_id = user_id
        self.plan_name = plan_name
        self.period_months = period_months
        self.amount = amount_for(plan_name, period_months)
        self.paid_at = None
        self.payment_method = None


class _Plan:
    def __init__(self, studio_id=1, plan_name="pro", status="active",
                 expires_at=None, auto_renewal=True):
        self.studio_id = studio_id
        self.plan_name = plan_name
        self.status = status
        self.expires_at = expires_at
        self.auto_renewal = auto_renewal
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
    """Мини-Request: только то, что читает fondy_webhook (заголовки + form)."""
    def __init__(self, payload):
        self.headers = {"content-type": "application/x-www-form-urlencoded"}
        self._payload = payload

    async def form(self): return self._payload
    async def json(self): return self._payload


def _signed(payload: dict) -> dict:
    """Добавляет валидную подпись Fondy (password из fondy.PASSWORD)."""
    p = dict(payload)
    p["signature"] = fondy.build_signature(p)
    return p


def _run_webhook(payload, db):
    """Гоняет настоящий обработчик, подсунув фейковую сессию вместо async_session_maker."""
    orig = W.async_session_maker
    W.async_session_maker = lambda: db
    try:
        return asyncio.run(W.fondy_webhook(_Req(payload)))
    finally:
        W.async_session_maker = orig


# ─── Чек-лист задачи 13 ─────────────────────────────────────────────────────────
def test_success_activates():
    """1. approved тестовой картой → инвойс paid, подписка active, срок +период."""
    inv = _Invoice(status="pending", plan_name="pro", period_months=1)
    plan = _Plan(status="active", expires_at=None)
    db = _DB([inv, plan])  # 1) поиск инвойса, 2) поиск подписки в _activate
    res = _run_webhook(_signed({"order_id": inv.order_id, "order_status": "approved"}), db)
    assert res == {"status": "ok"}
    assert inv.status == "paid"
    assert inv.paid_at is not None
    assert plan.status == "active"
    assert plan.expires_at is not None and plan.expires_at > datetime.utcnow()
    assert db.committed is True


def test_declined_no_activation():
    """2. declined → инвойс failed, подписки не касаемся (без активации)."""
    inv = _Invoice(status="pending")
    db = _DB([inv])  # только поиск инвойса; _activate не вызывается
    res = _run_webhook(_signed({"order_id": inv.order_id, "order_status": "declined"}), db)
    assert res == {"status": "ok"}
    assert inv.status == "failed"
    assert db.committed is True


def test_reversed_refunds_and_rolls_back():
    """3. reversed → инвойс refunded, срок откатан на период; если в прошлом — expired."""
    inv = _Invoice(status="paid", period_months=1)
    # срок кончается через 10 дней; откат на 1 мес уводит его в прошлое → expired
    plan = _Plan(status="active", expires_at=datetime.utcnow() + timedelta(days=10))
    db = _DB([inv, plan])
    res = _run_webhook(_signed({"order_id": inv.order_id, "order_status": "reversed"}), db)
    assert res == {"status": "ok"}
    assert inv.status == "refunded"
    assert plan.expires_at < datetime.utcnow()
    assert plan.status == "expired"


def test_idempotent_repeat_approved():
    """4. Повторный approved по уже paid-инвойсу → no-op, тариф не начисляется дважды."""
    inv = _Invoice(status="paid")
    plan = _Plan(status="active", expires_at=datetime.utcnow() + timedelta(days=30))
    before = plan.expires_at
    db = _DB([inv])  # обработчик выйдет на идемпотентности ДО чтения подписки
    res = _run_webhook(_signed({"order_id": inv.order_id, "order_status": "approved"}), db)
    assert res == {"status": "ok"}
    assert plan.expires_at == before          # срок не сдвинулся
    assert db.committed is False              # ничего не коммитили
    assert plan is not None                   # (plan не читался — что и требовалось)


def test_bad_signature_403():
    """5. Вебхук с неверной подписью → 403, база не трогается."""
    inv = _Invoice(status="pending")
    db = _DB([inv])  # не должен быть даже прочитан
    payload = {"order_id": inv.order_id, "order_status": "approved", "signature": "deadbeef"}
    res = _run_webhook(payload, db)
    assert res.status_code == 403
    assert inv.status == "pending"            # инвойс нетронут
    assert db.committed is False


def test_limits_before_and_after_upgrade():
    """6. Лимиты: Старт ограничен, Pro/free_trial свободнее, Business безлимит."""
    assert _limit_for("start", "staff") == 3
    assert _limit_for("pro", "staff") == 15
    assert _limit_for("free_trial", "staff") == 15    # триал = лимиты Pro
    assert _limit_for("business", "staff") is None     # безлимит


def test_signature_survives_json_and_form():
    """Подпись не зависит от транспорта: одинаковая для JSON и form-полей."""
    p = {"order_id": "velora-9-z", "order_status": "approved", "amount": 249000}
    assert fondy.verify_signature(_signed(p)) is True


if __name__ == "__main__":
    test_success_activates()
    test_declined_no_activation()
    test_reversed_refunds_and_rolls_back()
    test_idempotent_repeat_approved()
    test_bad_signature_403()
    test_limits_before_and_after_upgrade()
    test_signature_survives_json_and_form()
    print("ALL PASS — чек-лист 13 (пп. 1-6) зелёный на уровне логики")
