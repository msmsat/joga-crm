"""Legacy recurring purchases keep their real Stripe price after catalog repricing."""
import asyncio
from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest

from models import StudioBillingPlan
from routers.billing.webhook import _apply_paid_mode


def _subscription(plan, months, amount):
    price = SimpleNamespace(
        lookup_key=f'velora_combo_{plan}_{months}m', unit_amount=amount,
        recurring=SimpleNamespace(
            interval='year' if months == 12 else 'month',
            interval_count=1 if months == 12 else months),
    )
    return SimpleNamespace(items=SimpleNamespace(data=[SimpleNamespace(price=price)]))


@pytest.mark.parametrize('plan,months,amount,monthly', [
    ('s15', 12, 39900, 3325),
    ('s2', 3, 3600, 1200),
    ('unlimited', 6, 33750, 5625),
    ('s8', 1, 3000, 3000),
])
def test_paid_legacy_combo_uses_purchased_price_for_monthly_fixed_base(plan, months, amount, monthly):
    row = StudioBillingPlan(studio_id=1, billing_mode='subscription', fixed_base_amount=None)

    _apply_paid_mode(row, _subscription(plan, months, amount), 'subscription')

    assert row.billing_mode == 'combo'
    assert row.percent_rate == 1.5
    assert row.fixed_base_amount == monthly


@pytest.mark.parametrize('missing_amount', [None, '39900', True, -1])
def test_incomplete_legacy_price_retains_known_fixed_base(missing_amount):
    row = StudioBillingPlan(studio_id=1, billing_mode='combo', fixed_base_amount=3325)

    _apply_paid_mode(row, _subscription('s15', 12, missing_amount), 'subscription')

    assert row.fixed_base_amount == 3325


def test_zero_unit_price_is_preserved_as_actual_legacy_fixed_base():
    row = StudioBillingPlan(studio_id=1, billing_mode='combo', fixed_base_amount=3325)

    _apply_paid_mode(row, _subscription('s15', 12, 0), 'subscription')

    assert row.fixed_base_amount == 0


def test_fixed_subscription_clears_obsolete_combo_base():
    row = StudioBillingPlan(studio_id=1, billing_mode='combo', fixed_base_amount=3325)
    subscription = _subscription('s15', 12, 79800)
    subscription.items.data[0].price.lookup_key = 'velora_s15_12m'

    _apply_paid_mode(row, subscription, 'subscription')

    assert row.billing_mode == 'subscription'
    assert row.fixed_base_amount is None
    assert row.percent_rate is None


class _StatsResult:
    def __init__(self, value):
        self.value = value
    def scalars(self):
        return self
    def all(self):
        return self.value
    def scalar_one_or_none(self):
        return self.value


class _StatsDB:
    def __init__(self, plan):
        self.results = iter([[], plan])
    async def execute(self, statement):
        return _StatsResult(next(self.results))


def _recurring_plan(mode='subscription', **changes):
    return SimpleNamespace(
        studio_id=1, stripe_subscription_id=changes.get('subscription_id', 'sub_old'),
        status='active', auto_renewal=True, billing_mode=mode, plan_name='s2',
        expires_at=datetime.utcnow() + timedelta(days=30), fixed_base_amount=1200,
    )


def _stats(plan):
    from routers.billing.router import get_billing_stats
    return asyncio.run(get_billing_stats(SimpleNamespace(studio_id=1), _StatsDB(plan)))


@pytest.mark.parametrize('mode,plan_name,months,amount,quantity,expected', [
    ('subscription', 's2', 1, 3000, 1, 3000),
    ('subscription', 'unlimited', 12, 126000, 1, 126000),
    ('combo', 's2', 3, 3600, 1, 3600),
    ('combo', 's15', 12, 39900, 1, 39900),
    ('subscription', 's2', 1, 3000, 2, 6000),
])
def test_legacy_next_charge_uses_actual_period_price(monkeypatch, mode, plan_name, months, amount, quantity, expected):
    from services import stripe_billing
    subscription = _subscription(plan_name, months, amount)
    subscription.status = 'active'
    subscription.cancel_at_period_end = False
    subscription.items.data[0].quantity = quantity
    # Historical Prices may lose their lookup key when a new price takes it.
    subscription.items.data[0].price.lookup_key = None
    async def fetch(subscription_id):
        assert subscription_id == 'sub_old'
        return subscription
    monkeypatch.setattr(stripe_billing, 'fetch_subscription', fetch)
    plan = _recurring_plan(mode)
    plan.plan_name = plan_name

    result = _stats(plan)

    assert result.next_charge == expected
    assert result.next_charge_at == plan.expires_at.isoformat()
    assert result.months_with_us == 0


@pytest.mark.parametrize('amount', [None, '3000', True, -1])
def test_missing_live_price_does_not_invent_current_catalog_charge(monkeypatch, amount):
    from services import stripe_billing
    subscription = _subscription('s2', 1, amount)
    subscription.status = 'active'
    subscription.cancel_at_period_end = False
    subscription.items.data[0].quantity = 1
    async def fetch(subscription_id):
        return subscription
    monkeypatch.setattr(stripe_billing, 'fetch_subscription', fetch)

    result = _stats(_recurring_plan())

    assert result.next_charge == 0
    assert result.next_charge_at is None


def test_unavailable_stripe_does_not_invent_current_catalog_charge(monkeypatch):
    from services import stripe_billing
    async def fetch(subscription_id):
        raise RuntimeError('Stripe unavailable')
    monkeypatch.setattr(stripe_billing, 'fetch_subscription', fetch)

    assert _stats(_recurring_plan()).next_charge == 0


def test_remote_cancelled_subscription_has_no_next_charge(monkeypatch):
    from services import stripe_billing
    subscription = _subscription('s2', 1, 3000)
    subscription.status = 'active'
    subscription.cancel_at_period_end = True
    subscription.items.data[0].quantity = 1
    async def fetch(subscription_id):
        return subscription
    monkeypatch.setattr(stripe_billing, 'fetch_subscription', fetch)

    assert _stats(_recurring_plan()).next_charge == 0


def test_prepaid_stats_do_not_fetch_stripe_or_announce_renewal(monkeypatch):
    from services import stripe_billing
    async def fetch(subscription_id):
        raise AssertionError('Prepaid access has no recurring subscription')
    monkeypatch.setattr(stripe_billing, 'fetch_subscription', fetch)

    result = _stats(_recurring_plan(subscription_id=None))

    assert result.next_charge == 0
    assert result.next_charge_at is None
