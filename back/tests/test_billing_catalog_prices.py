"""The advertised price ladder and every derived prepaid purchase amount."""
from types import SimpleNamespace

import pytest

from routers.billing.plans import (PLANS, PERIOD_DISCOUNTS, COMBO_FIXED,
    MIN_MONTHLY_FEE, PERCENT_ONLY_RATE, COMBO_PERCENT_RATE, amount_for, combo_amount_for)
from services.billing_pricing import period_price, invoice_price_fields


EXPECTED = list(zip(
    [f's{n}' for n in range(1, 21)] + ['unlimited'],
    [2000, 2500, 3000, 3500, 4000, 4500, 5000, 6000, 7000, 8000,
     9000, 10000, 11000, 12000, 13000, 14000, 15000, 16000, 17000, 18000, 23000],
))


@pytest.mark.parametrize(('plan_id', 'monthly'), EXPECTED)
def test_monthly_prices_match_the_requested_catalog(plan_id, monthly):
    assert PLANS[plan_id]['price'] == monthly
    assert COMBO_FIXED[plan_id] == monthly // 2


@pytest.mark.parametrize(('plan_id', 'monthly'), EXPECTED)
def test_all_periods_and_models_apply_welcome_once_to_discounted_net(plan_id, monthly):
    for months, percent in [(1, 0), (3, 20), (6, 25), (12, 30)]:
        regular = monthly * months * (100 - percent) // 100
        assert amount_for(plan_id, months) == regular
        assert combo_amount_for(plan_id, months) == regular // 2
        for combo in (False, True):
            before = regular // 2 if combo else regular
            first = period_price(plan_id, months, combo, True)
            later = period_price(plan_id, months, combo, False)
            assert first.amount_before_promo == later.amount_before_promo == before
            assert first.promo_discount_amount == before * 30 // 100
            assert first.net_amount == before - before * 30 // 100
            assert first.promo_code == 'WELCOME30'
            assert later.net_amount == before
            assert later.promo_discount_amount == 0
            assert later.promo_code is None


def test_catalog_order_limits_and_commission_rules_still_agree():
    assert list(PLANS) == [pid for pid, _ in EXPECTED]
    assert PERIOD_DISCOUNTS == {1: 0, 3: .2, 6: .25, 12: .3}
    assert MIN_MONTHLY_FEE == 2000
    assert (PERCENT_ONLY_RATE, COMBO_PERCENT_RATE) == (3, 1.5)
    for n in range(1, 21):
        assert PLANS[f's{n}']['limits']['staff'] == n
    assert PLANS['unlimited']['limits']['staff'] is None
    assert all(plan['limits']['clients'] is None for plan in PLANS.values())


def test_existing_purchase_breakdown_does_not_follow_new_catalog_prices():
    original = {'amount_before_promo': 100800, 'net_amount': 70560,
        'promo_code': 'WELCOME30', 'promo_discount_percent': 30,
        'promo_discount_amount': 30240}
    invoice = SimpleNamespace(plan_name='s20', amount=85378,
        billing_details_snapshot={'promo': original, 'tax': {'net_minor': 70560}})
    assert invoice_price_fields(invoice) == original
