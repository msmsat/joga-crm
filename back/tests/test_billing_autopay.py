"""Самопроверка PATCH /billing/autopay (B2): тумблер «Автоматическое продление» —
это ОТМЕНА ПОДПИСКИ, и он обязан доезжать до Stripe.

Пока флаг жил только в нашей БД, тумблер был враньём: владелец выключал
автопродление, получал зелёный тост — и очередное списание. Здесь проверяется, что
переключение уходит в `cancel_at_period_end`, что студия без карты (оплата по IBAN)
из выключенного состояния может вернуться, и что сбой Stripe не оставляет БД и
подписку разошедшимися.

Гоняем настоящий обработчик с фейковой сессией (паттерн tests/test_billing_webhook.py);
Stripe подменяем — тесты денег не двигают и в сеть не ходят.

Запуск из back/:  python -m tests.test_billing_autopay
"""
import asyncio
from types import SimpleNamespace

from routers.billing.router import update_autopay
from dependencies import StudioContext
from schemas.settings.billing import AutopaySettingsUpdate
from services import stripe_billing


class _Plan:
    def __init__(self, auto_renewal=False, subscription_id="sub_1", status="active"):
        self.studio_id = 1
        self.plan_name = "pro"
        self.billing_cycle = "monthly"
        self.status = status
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
        # Живая подписка Stripe. По ней ветвится и гейт карты, и вызов Stripe:
        # у живой подписки способ оплаты уже выбран, и требовать карту незачем.
        self.stripe_subscription_id = subscription_id
        # Брали ли пробный период — по нему _to_plan_read считает trial_available.
        self.trial_started_at = None
        self.studio_id = 7


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


class _Stripe:
    """Подмена stripe_billing.set_cancel_at_period_end. `fail=True` — сбой сервиса."""
    def __init__(self, fail=False):
        self.calls = []
        self.fail = fail
        self._saved = stripe_billing.set_cancel_at_period_end

    def __enter__(self):
        async def fake(subscription_id, cancel):
            self.calls.append((subscription_id, cancel))
            if self.fail:
                raise RuntimeError("Stripe недоступен")
        stripe_billing.set_cancel_at_period_end = fake
        return self

    def __exit__(self, *_a):
        stripe_billing.set_cancel_at_period_end = self._saved
        return False


def test_turning_off_cancels_at_period_end():
    """Выключили автопродление → Stripe получает cancel_at_period_end=True.

    Это и есть отмена подписки, обещанная Условиями (§7): доступ доигрывает
    оплаченный период, деньги за него не возвращаются.
    """
    plan = _Plan(auto_renewal=True)
    db = _DB([plan])
    with _Stripe() as stripe_calls:
        res = asyncio.run(update_autopay(AutopaySettingsUpdate(auto_renewal=False), _ctx(), db))
    assert stripe_calls.calls == [("sub_1", True)], stripe_calls.calls
    assert plan.auto_renewal is False
    assert db.committed is True
    assert res.auto_renewal is False


def test_turning_on_uncancels_without_card():
    """Включили обратно → cancel_at_period_end=False, и КАРТА НЕ ТРЕБУЕТСЯ.

    Студия на IBAN карты не имеет никогда. Старый гейт «автосписание только по карте»
    запер бы её в выключенном автопродлении навсегда — отменить смогла бы, вернуться нет.
    """
    plan = _Plan(auto_renewal=False)
    db = _DB([plan])   # единственный execute — поиск подписки; карта не читается
    with _Stripe() as stripe_calls:
        asyncio.run(update_autopay(AutopaySettingsUpdate(auto_renewal=True), _ctx(), db))
    assert stripe_calls.calls == [("sub_1", False)], stripe_calls.calls
    assert plan.auto_renewal is True
    assert db.committed is True


def test_stripe_failure_leaves_db_untouched():
    """Stripe упал → 502 и БД НЕ коммитится: тумблер остаётся в прежнем положении.

    Рассинхрон опаснее отказа — иначе интерфейс снова показывал бы «отменено» по
    подписке, которая продолжает списывать.
    """
    plan = _Plan(auto_renewal=True)
    db = _DB([plan])
    with _Stripe(fail=True):
        try:
            asyncio.run(update_autopay(AutopaySettingsUpdate(auto_renewal=False), _ctx(), db))
            assert False, "должен был бросить 502"
        except Exception as e:
            assert getattr(e, "status_code", None) == 502, e
    assert db.committed is False


def test_autopay_blocked_without_card_when_no_subscription():
    """Живой подписки нет, включают автосписание без карты → 400, как и раньше.

    Отменять тут нечего, флаг остаётся обычной настройкой, и старое правило
    «автосписание доступно только при оплате картой» продолжает действовать.
    """
    plan = _Plan(subscription_id=None)
    db = _DB([plan, None])  # 1) подписка найдена, 2) карты нет
    with _Stripe() as stripe_calls:
        try:
            asyncio.run(update_autopay(AutopaySettingsUpdate(auto_renewal=True), _ctx(), db))
            assert False, "должен был бросить 400"
        except Exception as e:
            assert getattr(e, "status_code", None) == 400
    assert not stripe_calls.calls, "без подписки в Stripe ходить незачем"
    assert plan.auto_renewal is False
    assert db.committed is False


def test_autopay_saved_with_card():
    """Без подписки, но с картой → сохраняется; непереданные поля не трогаются."""
    plan = _Plan(subscription_id=None)
    # Третий ответ — поиск оплаченного счёта: без живой подписки ответ читает
    # его, чтобы посчитать trial_available (router._trial_available).
    db = _DB([plan, _Card("card"), None])
    body = AutopaySettingsUpdate(auto_renewal=True, notify_before_autocharge=False)
    with _Stripe() as stripe_calls:
        res = asyncio.run(update_autopay(body, _ctx(), db))
    assert not stripe_calls.calls
    assert plan.auto_renewal is True
    assert plan.notify_before_autocharge is False
    assert plan.sms_notification_enabled is False   # не передано в body — не тронуто
    assert db.committed is True
    assert res.auto_renewal is True


def test_autopay_partial_update_skips_stripe_and_card_check():
    """auto_renewal не передан — ни карта не читается, ни Stripe не трогается."""
    plan = _Plan(auto_renewal=True)
    db = _DB([plan])
    with _Stripe() as stripe_calls:
        asyncio.run(update_autopay(AutopaySettingsUpdate(sms_notification_enabled=True), _ctx(), db))
    assert not stripe_calls.calls, "подписку не трогаем, раз автопродление не меняли"
    assert plan.sms_notification_enabled is True
    assert plan.auto_renewal is True


if __name__ == "__main__":
    test_turning_off_cancels_at_period_end()
    test_turning_on_uncancels_without_card()
    test_stripe_failure_leaves_db_untouched()
    test_autopay_blocked_without_card_when_no_subscription()
    test_autopay_saved_with_card()
    test_autopay_partial_update_skips_stripe_and_card_check()
    print("ALL PASS — B2 autopay = отмена подписки")
