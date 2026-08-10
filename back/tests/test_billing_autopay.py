"""Самопроверка PATCH /billing/autopay (B2): гейт «автосписание только по карте»
+ частичный апдейт тумблеров, гоняем настоящий обработчик с фейковой сессией
(паттерн tests/test_billing_webhook.py).

Запуск из back/:  python -m tests.test_billing_autopay
"""
import asyncio
from types import SimpleNamespace

from routers.billing.router import update_autopay
from dependencies import StudioContext
from schemas.settings.billing import AutopaySettingsUpdate


class _Plan:
    def __init__(self, auto_renewal=False):
        self.studio_id = 1
        self.plan_name = "pro"
        self.billing_cycle = "monthly"
        self.status = "active"
        self.expires_at = None
        self.max_staff = 15
        self.auto_renewal = auto_renewal
        self.billing_mode = "subscription"
        self.percent_rate = None
        self.fixed_base_amount = None
        self.notify_before_days = 3
        self.notify_before_autocharge = True
        self.email_receipt_enabled = True
        self.sms_notification_enabled = False
        # Запланированная смена тарифа: апгрейд по умолчанию начинается с конца
        # оплаченного периода, и _to_plan_read отдаёт её фронту.
        self.scheduled_plan = None
        self.scheduled_at = None


class _Card:
    def __init__(self, method_type="card"):
        self.method_type = method_type


class _R:
    def __init__(self, v): self._v = v
    def scalar_one_or_none(self): return self._v


class _DB:
    """execute() отдаёт значения из seq по порядку запросов обработчика."""
    def __init__(self, seq):
        self._seq = list(seq)
        self.committed = False

    async def execute(self, _q): return _R(self._seq.pop(0))
    async def commit(self): self.committed = True
    async def refresh(self, _row): pass


def _ctx():
    return StudioContext(user=SimpleNamespace(id=1), studio_id=1, role="owner")


def test_autopay_blocked_without_card():
    """auto_renewal=True без сохранённой карты (method_type=card) → 400, ничего не меняется."""
    plan = _Plan()
    db = _DB([plan, None])  # 1) подписка найдена, 2) карты нет
    body = AutopaySettingsUpdate(auto_renewal=True)
    try:
        asyncio.run(update_autopay(body, _ctx(), db))
        assert False, "должен был бросить 400"
    except Exception as e:
        assert getattr(e, "status_code", None) == 400
    assert plan.auto_renewal is False
    assert db.committed is False


def test_autopay_saved_with_card():
    """auto_renewal=True с картой → сохраняется; непереданные поля не трогаются."""
    plan = _Plan()
    db = _DB([plan, _Card("card")])
    body = AutopaySettingsUpdate(auto_renewal=True, notify_before_autocharge=False)
    res = asyncio.run(update_autopay(body, _ctx(), db))
    assert plan.auto_renewal is True
    assert plan.notify_before_autocharge is False
    assert plan.sms_notification_enabled is False   # не передано в body — не тронуто
    assert db.committed is True
    assert res.auto_renewal is True


def test_autopay_partial_update_skips_card_check_when_not_enabling():
    """Если auto_renewal не запрашивается (None/уже включён) — карта не проверяется."""
    plan = _Plan(auto_renewal=True)
    db = _DB([plan])  # единственный execute — поиск подписки; карта не читается
    body = AutopaySettingsUpdate(sms_notification_enabled=True)
    asyncio.run(update_autopay(body, _ctx(), db))
    assert plan.sms_notification_enabled is True
    assert plan.auto_renewal is True


if __name__ == "__main__":
    test_autopay_blocked_without_card()
    test_autopay_saved_with_card()
    test_autopay_partial_update_skips_card_check_when_not_enabling()
    print("ALL PASS — B2 autopay gate")
