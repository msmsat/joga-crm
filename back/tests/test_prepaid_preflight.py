"""Readiness must reject a billing endpoint unable to activate prepaid access."""
import asyncio
from types import SimpleNamespace as NS

import pytest
import stripe

from scripts import preflight

PREPAID_EVENTS = {
    'checkout.session.completed',
    'checkout.session.async_payment_succeeded',
    'checkout.session.async_payment_failed',
    'checkout.session.expired',
}


@pytest.fixture
def check(monkeypatch):
    monkeypatch.setenv('STRIPE_SECRET_KEY', 'sk_test_not_real')
    monkeypatch.setenv('BACKEND_URL', 'https://api.velora.test')
    monkeypatch.setattr(preflight, '_ERRORS', [])
    monkeypatch.setattr(preflight, '_WARNINGS', [])

    def run(billing_events):
        endpoints = [
            NS(url='https://api.velora.test/billing/webhook/stripe', status='enabled',
               enabled_events=list(billing_events)),
            NS(url='https://api.velora.test/checkout/webhook/stripe', status='enabled',
               enabled_events=list(preflight._CONNECT_EVENTS)),
        ]
        monkeypatch.setattr(stripe.WebhookEndpoint, 'list', lambda **kw: NS(data=endpoints))
        asyncio.run(preflight.check_webhook_endpoints())
        return preflight._ERRORS
    return run


def test_old_subscription_only_webhook_cannot_pass_prepaid_readiness(check):
    errors = check(preflight._BILLING_EVENTS - PREPAID_EVENTS)
    assert errors, 'Subscription-only webhook cannot activate Checkout payments'
    combined = '\n'.join(errors)
    for event in PREPAID_EVENTS:
        assert event in combined
    assert 'биллинг платформы' in combined


@pytest.mark.parametrize('missing', sorted(PREPAID_EVENTS))
def test_every_missing_prepaid_event_is_a_deployment_blocker(check, missing):
    errors = check(preflight._BILLING_EVENTS - {missing})
    assert len(errors) == 1
    assert missing in errors[0]


def test_complete_billing_webhook_keeps_legacy_events_and_passes(check):
    assert PREPAID_EVENTS <= preflight._BILLING_EVENTS
    assert {'invoice.paid', 'customer.subscription.deleted', 'charge.refunded',
            'charge.dispute.closed', 'customer.tax_id.updated'} <= preflight._BILLING_EVENTS
    assert check(preflight._BILLING_EVENTS) == []


def test_wildcard_billing_webhook_covers_prepaid_events(check):
    assert check({'*'}) == []
