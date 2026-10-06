"""New purchases resolve current catalog Prices without altering historical ones."""
import asyncio
from types import SimpleNamespace

import pytest
import stripe

from routers.billing.plans import PLANS
from services import stripe_catalog


@pytest.fixture
def stripe_prices(monkeypatch):
    """Keep real price resolution, replacing only the Stripe network boundary."""
    monkeypatch.setenv('STRIPE_SECRET_KEY', 'sk_test_catalog_repricing')
    monkeypatch.setenv('STRIPE_PUBLISHABLE_KEY', 'pk_test_catalog_repricing')
    state = {'existing': None, 'created': [], 'products': []}

    def find(**kwargs):
        assert kwargs['active'] is True
        return SimpleNamespace(data=[state['existing']] if state['existing'] else [])

    def product(product_id):
        state['products'].append(product_id)
        return SimpleNamespace(id=product_id)

    def create(**kwargs):
        state['created'].append(kwargs)
        return SimpleNamespace(id='price_current')

    monkeypatch.setattr(stripe.Price, 'list', find)
    monkeypatch.setattr(stripe.Product, 'retrieve', product)
    monkeypatch.setattr(stripe.Price, 'create', create)
    return state


def _price(amount, *, months=1):
    interval, count = ('year', 1) if months == 12 else ('month', months)
    return SimpleNamespace(
        id='price_historical', unit_amount=amount,
        currency=stripe_catalog.CURRENCY,
        recurring=SimpleNamespace(interval=interval, interval_count=count),
        tax_behavior=stripe_catalog.TAX_BEHAVIOR,
    )


@pytest.mark.parametrize('plan,months,combo,monthly,old_amount,expected', [
    ('s2', 1, False, 2500, 3000, 2500),
    ('s15', 6, True, 13000, 21375, 29250),
    ('unlimited', 12, False, 23000, 126000, 193200),
])
def test_purchase_replaces_stale_price_with_current_amount(
        monkeypatch, stripe_prices, plan, months, combo, monthly, old_amount, expected):
    # Independent expected amounts: 25; 130 * 6 * .75 / 2; 230 * 12 * .70 EUR.
    monkeypatch.setitem(PLANS[plan], 'price', monthly)
    historical = _price(old_amount, months=months)
    stripe_prices['existing'] = historical

    selected = asyncio.run(stripe_catalog.price_id(plan, months, combo))

    assert selected == 'price_current'
    assert stripe_prices['created'][0]['unit_amount'] == expected
    assert stripe_prices['created'][0]['lookup_key'] == stripe_catalog.lookup_key(plan, months, combo)
    assert stripe_prices['created'][0]['transfer_lookup_key'] is True
    # Old subscriptions and invoices retain their immutable purchased amount.
    assert historical.unit_amount == old_amount


def test_matching_price_is_reused_without_product_or_price_write(monkeypatch, stripe_prices):
    monkeypatch.setitem(PLANS['s2'], 'price', 2500)
    stripe_prices['existing'] = _price(2500)

    assert asyncio.run(stripe_catalog.price_id('s2', 1)) == 'price_historical'
    assert stripe_prices['created'] == []
    assert stripe_prices['products'] == []


@pytest.mark.parametrize('field,value', [
    ('currency', 'usd'),
    ('recurring', None),
    ('recurring', SimpleNamespace(interval='month', interval_count=3)),
    ('tax_behavior', 'unspecified'),
])
def test_lookup_key_does_not_accept_incompatible_price(monkeypatch, stripe_prices, field, value):
    monkeypatch.setitem(PLANS['s2'], 'price', 2500)
    invalid = _price(2500)
    setattr(invalid, field, value)
    stripe_prices['existing'] = invalid

    assert asyncio.run(stripe_catalog.price_id('s2', 1)) == 'price_current'
    assert stripe_prices['created'][0]['unit_amount'] == 2500
    assert stripe_prices['created'][0]['recurring'] == {'interval': 'month', 'interval_count': 1}
    assert stripe_prices['created'][0]['tax_behavior'] == stripe_catalog.TAX_BEHAVIOR


def test_missing_price_is_created_from_current_catalog(monkeypatch, stripe_prices):
    monkeypatch.setitem(PLANS['s2'], 'price', 2500)

    assert asyncio.run(stripe_catalog.price_id('s2', 1)) == 'price_current'
    assert stripe_prices['created'][0]['unit_amount'] == 2500
