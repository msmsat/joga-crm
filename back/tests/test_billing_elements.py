import asyncio
from types import SimpleNamespace as NS

import pytest
import stripe

from services import stripe_billing as billing


def test_elements_session_returns_secret_and_never_hosted_urls(monkeypatch):
    monkeypatch.setenv('BILLING_TAX_MODE', 'stripe_auto')
    monkeypatch.setenv('BILLING_PAYMENT_METHOD_CONFIGURATION', 'pmc_velora')
    captured = {}

    def create(**kwargs):
        captured.update(kwargs)
        return NS(id='cs_test', url=None, client_secret='cs_test_secret')

    monkeypatch.setattr(stripe.checkout.Session, 'create', create)
    result = asyncio.run(billing.create_subscription_checkout(
        'cus_test', 'price_test', {}, 'https://velora.test/return', 'cancel',
        ui_mode='elements',
    ))
    assert result == ('cs_test', 'cs_test_secret')
    assert captured['ui_mode'] == 'elements'
    assert captured['return_url'] == 'https://velora.test/return'
    assert 'success_url' not in captured and 'cancel_url' not in captured
    assert 'branding_settings' not in captured
    assert captured['payment_method_configuration'] == 'pmc_velora'


def test_elements_does_not_enable_paid_tax_in_manual_mode(monkeypatch):
    monkeypatch.setenv('BILLING_TAX_MODE', 'manual')
    calls = []
    monkeypatch.setattr(stripe.checkout.Session, 'create', lambda **kwargs: calls.append(kwargs))
    with pytest.raises(billing.TaxDecisionMissing):
        asyncio.run(billing.create_subscription_checkout(
            'cus_test', 'price_test', {}, 'return', 'cancel', ui_mode='elements',
        ))
    assert calls == []


def test_invoice_elements_pays_existing_invoice_without_creating_another(monkeypatch):
    invoice = NS(id='in_test', customer='cus_test', status='open', currency='eur',
                 amount_remaining=2420, confirmation_secret=NS(client_secret='pi_test_secret'))
    monkeypatch.setattr(stripe.Invoice, 'retrieve', lambda *a, **kw: invoice)
    monkeypatch.setattr(stripe.Invoice, 'create', lambda **kw: pytest.fail('Duplicate invoice'))
    result = asyncio.run(billing.invoice_elements_data('in_test', 'cus_test'))
    assert result == ('pi_test_secret', 2420, 'EUR')


def test_invoice_elements_never_exposes_another_customers_secret(monkeypatch):
    invoice = NS(id='in_test', customer='cus_other', status='open', currency='eur',
                 amount_remaining=2420, confirmation_secret=NS(client_secret='pi_other_secret'))
    monkeypatch.setattr(stripe.Invoice, 'retrieve', lambda *a, **kw: invoice)
    with pytest.raises(ValueError, match='customer'):
        asyncio.run(billing.invoice_elements_data('in_test', 'cus_test'))


def test_paid_invoice_does_not_offer_a_second_payment(monkeypatch):
    invoice = NS(id='in_test', customer='cus_test', status='paid', currency='eur',
                 amount_remaining=0, confirmation_secret=None)
    monkeypatch.setattr(stripe.Invoice, 'retrieve', lambda *a, **kw: invoice)
    assert asyncio.run(billing.invoice_elements_data('in_test', 'cus_test')) == (None, 0, 'EUR')


def test_reopening_an_unpaid_switch_reuses_its_invoice(monkeypatch):
    from routers.billing import checkout as route
    row = NS(stripe_invoice_id='in_existing')
    db = NS(execute=None)

    async def execute(query):
        return NS(scalars=lambda: NS(all=lambda: [row]))

    db.execute = execute
    invoice = NS(id='in_existing', customer='cus_test', status='open',
                 metadata={'plan':'s7', 'period_months':'3', 'billing_mode':'combo'})

    async def fetch(invoice_id):
        assert invoice_id == 'in_existing'
        return invoice

    monkeypatch.setattr(route.stripe_billing, 'fetch_invoice', fetch)
    result = asyncio.run(route._reusable_elements_invoice(db, 1, 'cus_test', 's7', 3, True))
    assert result is invoice


@pytest.mark.parametrize('customer,mode,status', [
    ('cus_other','combo','open'), ('cus_test','subscription','open'), ('cus_test','combo','void'),
])
def test_pending_invoice_reuse_checks_customer_model_and_state(monkeypatch, customer, mode, status):
    from routers.billing import checkout as route

    async def execute(query):
        return NS(scalars=lambda: NS(all=lambda: [NS(stripe_invoice_id='in_existing')]))

    async def fetch(invoice_id):
        return NS(customer=customer, status=status,
                  metadata={'plan':'s7','period_months':'3','billing_mode':mode})

    monkeypatch.setattr(route.stripe_billing, 'fetch_invoice', fetch)
    assert asyncio.run(route._reusable_elements_invoice(NS(execute=execute), 1, 'cus_test', 's7', 3, True)) is None



def test_invoice_without_tax_details_can_still_be_paid(monkeypatch):
    from routers.billing import checkout as route
    async def data(invoice_id, customer_id):
        return 'pi_test_secret', 2000, 'EUR'
    monkeypatch.setattr(route.stripe_billing, 'invoice_elements_data', data)
    invoice = NS(id='in_test', total_taxes=None, customer_name='Demo', customer_email='demo@example.com')
    result = asyncio.run(route._elements_invoice_response(invoice, 'cus_test', 'pk_test'))
    assert result.tax_amount == 0
    assert result.amount_due == 2000
    assert result.payer_email == 'demo@example.com'
