"""Repricing cannot invent savings or change an old purchase's net amount."""
import importlib
from types import SimpleNamespace as NS

import pytest

router = importlib.import_module('routers.billing.router')


@pytest.mark.parametrize(('combo', 'before', 'welcome', 'saved'), [
    (False, 100800, 30240, 73440), (True, 50400, 15120, 36720),
])
def test_old_welcome_purchase_uses_original_period_price(combo, before, welcome, saved):
    invoice = NS(plan_name='s20', period_months=12, amount=before-welcome,
        billing_details_snapshot={'item': {'billing_mode': 'combo' if combo else 'subscription'},
            'promo': {'amount_before_promo': before, 'promo_discount_amount': welcome}})
    assert router._invoice_saving(invoice) == saved


def test_old_prepaid_purchase_without_promo_uses_frozen_tax_net():
    invoice = NS(plan_name='s20', period_months=12, amount=121968,
        billing_details_snapshot={'tax': {'net_minor': 100800}, 'item': {}})
    assert router._invoice_saving(invoice) == 43200


def test_legacy_invoice_with_known_tax_does_not_use_new_catalog():
    invoice = NS(plan_name='unlimited', period_months=6, amount=81675,
        billing_details_snapshot=None, tax_amount=14175, tax_outcome='taxable')
    assert router._invoice_saving(invoice) == 22500


def test_unknown_legacy_tax_never_promises_invented_savings():
    invoice = NS(plan_name='unlimited', period_months=6, amount=81675,
        billing_details_snapshot=None, tax_amount=None, tax_outcome='stripe_auto')
    assert router._invoice_saving(invoice) == 0


def test_frozen_period_saving_survives_future_catalog_and_discount_changes(monkeypatch):
    invoice = NS(plan_name='s20', period_months=12, amount=70560,
        billing_details_snapshot={'item': {'period_discount_amount': 43200},
            'promo': {'amount_before_promo': 100800, 'promo_discount_amount': 30240}})
    monkeypatch.setitem(router.PERIOD_DISCOUNTS, 12, .5)
    assert router._invoice_saving(invoice) == 73440
