"""Standalone rate CLI configures Stripe itself; dry-run never creates a rate."""
import asyncio
from decimal import Decimal
from types import SimpleNamespace as NS

import pytest
import stripe

from scripts import sync_tax_rates
from services import tax_policy, tax_rates


def test_standalone_cli_uses_configured_key_for_rate_listing(monkeypatch, capsys):
    fake_key = 'sk_test_configured_for_isolated_cli'
    monkeypatch.setenv('STRIPE_SECRET_KEY', fake_key)
    monkeypatch.setattr(stripe, 'api_key', None)
    monkeypatch.setattr(tax_policy, 'readiness', lambda: [])
    decision = tax_policy.TaxDecision(outcome=tax_policy.TAXABLE,
        rate_percent=Decimal('21'), jurisdiction='CZ', tax_type='vat', inclusive=False)
    monkeypatch.setattr(sync_tax_rates, '_needed', lambda: [decision])
    seen = []
    def list_rates(**kwargs):
        seen.append(stripe.api_key)
        assert kwargs == {'active':True, 'limit':100}
        return NS(auto_paging_iter=lambda: iter([]))
    monkeypatch.setattr(stripe.TaxRate, 'list', list_rates)
    monkeypatch.setattr(stripe.TaxRate, 'create', lambda **kw: pytest.fail('Dry-run cannot create rates'))
    tax_rates.reset_cache()
    try:
        assert asyncio.run(sync_tax_rates.main(False)) == 0
    finally:
        tax_rates.reset_cache()
    assert seen == [fake_key]
    assert fake_key not in capsys.readouterr().out


def test_cli_missing_key_exits_before_any_stripe_request(monkeypatch, capsys):
    monkeypatch.delenv('STRIPE_SECRET_KEY', raising=False)
    monkeypatch.setattr(stripe, 'api_key', None)
    monkeypatch.setattr(tax_policy, 'readiness', lambda: [])
    monkeypatch.setattr(sync_tax_rates, '_needed', lambda: [object()])
    monkeypatch.setattr(stripe.TaxRate, 'list', lambda **kw: pytest.fail('No key: no network request'))
    assert asyncio.run(sync_tax_rates.main(False)) == 1
    assert 'STRIPE_SECRET_KEY' in capsys.readouterr().out
