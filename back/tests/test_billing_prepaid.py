import asyncio
from datetime import datetime
from types import SimpleNamespace as NS

import pytest
import stripe

from models import BillingInvoice, StudioBillingPlan
from services import stripe_billing as SB


def test_prepaid_elements_is_one_payment_without_recurring_or_invoice_creation(monkeypatch):
    monkeypatch.setenv('BILLING_TAX_MODE', 'stripe_auto')
    sent = {}
    monkeypatch.setattr(stripe.checkout.Session, 'create', lambda **kw: (sent.update(kw), NS(id='cs_test', client_secret='secret', url=None))[1])
    session = asyncio.run(SB.create_period_checkout('cus_test', 4500, '5 сотрудников · 1 месяц',
        {'invoice_id': '1'}, 'https://velora.test/return', 'cancel',
        ui_mode='elements', idempotency_key='prepaid:1'))
    assert session.id == 'cs_test'
    assert sent['mode'] == 'payment'
    assert sent['adaptive_pricing'] == {'enabled': False}
    assert sent['ui_mode'] == 'elements'
    assert sent['line_items'][0]['price_data']['unit_amount'] == 4500
    assert 'recurring' not in sent['line_items'][0]['price_data']
    assert 'subscription_data' not in sent and 'invoice_creation' not in sent
    assert sent['payment_intent_data']['metadata']['invoice_id'] == '1'
    assert 'setup_future_usage' not in sent['payment_intent_data']
    assert sent['idempotency_key'] == 'prepaid:1'


def test_manual_prepaid_applies_tax_rate_without_paid_tax(monkeypatch):
    from services.tax_rates import TaxApplication
    monkeypatch.setenv('BILLING_TAX_MODE', 'manual')
    sent = {}
    monkeypatch.setattr(stripe.checkout.Session, 'create', lambda **kw: (sent.update(kw), NS(id='cs_test'))[1])
    tax = TaxApplication(False, ('txr_cz21',), 'none', None)
    asyncio.run(SB.create_period_checkout('cus_test', 4500, 'Velora', {}, 'return', 'cancel', tax=tax, idempotency_key='1'))
    assert sent['automatic_tax'] == {'enabled': False}
    assert sent['line_items'][0]['tax_rates'] == ['txr_cz21']
    assert 'tax_code' not in sent['line_items'][0]['price_data']['product_data']


def _plan(name='s5', status='active', expires=datetime(2026, 12, 31)):
    return NS(studio_id=7, plan_name=name, status=status, expires_at=expires,
        stripe_customer_id='cus_test', stripe_subscription_id=None, billing_mode='subscription',
        auto_renewal=False, past_due_since=None, scheduled_plan=None, scheduled_at=None,
        billing_cycle='monthly', max_staff=5, fixed_base_amount=None, percent_rate=None)


def _invoice():
    return NS(id=1, studio_id=7, status='pending', plan_name='s5', period_months=1,
        kind='subscription', order_id='cs_test', stripe_invoice_id=None, amount=4500,
        tax_amount=945, tax_rate_percent=21, tax_outcome='taxable', paid_at=None,
        payment_method='card', pdf_url=None, hosted_invoice_url=None, period=None)


def _session(**kw):
    fields = dict(id='cs_test', customer='cus_test', mode='payment', status='complete',
        payment_status='paid', amount_subtotal=4500, amount_total=5445, currency='eur',
        total_details=NS(amount_tax=945, amount_discount=0), payment_intent='pi_test',
        metadata={'billing_kind': 'prepaid', 'invoice_id': '1', 'studio_id': '7',
                  'plan': 's5', 'period_months': '1', 'billing_mode': 'subscription'})
    fields.update(kw)
    return NS(**fields)


class _DB:
    def __init__(self, invoice, plan):
        self.invoice, self.plan, self.commits = invoice, plan, 0

    async def execute(self, query):
        entity = query.column_descriptions[0]['entity']
        value = self.invoice if entity is BillingInvoice else self.plan if entity is StudioBillingPlan else None
        return NS(scalar_one_or_none=lambda: value)

    async def commit(self):
        self.commits += 1


def _handle(monkeypatch, session, invoice=None, plan=None, event='checkout.session.completed'):
    from routers.billing import prepaid_webhook as PW
    invoice, plan = invoice or _invoice(), plan or _plan()
    db = _DB(invoice, plan)
    async def fetch(_id):
        return session
    async def no_revenue(*args):
        return None
    async def no_mail(*args):
        return None
    monkeypatch.setattr(SB, 'fetch_checkout_session', fetch)
    monkeypatch.setattr('services.platform_fee.record_revenue', no_revenue)
    monkeypatch.setattr('services.billing_mail.send_receipt', no_mail)
    monkeypatch.setattr('services.billing_mail.send_platform_income', no_mail)
    asyncio.run(PW.handle_session(db, event, session, now=datetime(2026, 10, 2)))
    return invoice, plan, db


def test_paid_period_extends_same_paid_plan_once(monkeypatch):
    invoice, plan, _ = _handle(monkeypatch, _session())
    assert invoice.status == 'paid'
    assert invoice.amount == 5445
    assert plan.expires_at == datetime(2027, 1, 31)
    assert plan.auto_renewal is False and plan.stripe_subscription_id is None
    _handle(monkeypatch, _session(), invoice, plan)
    assert plan.expires_at == datetime(2027, 1, 31)


def test_trial_purchase_charges_now_and_starts_full_paid_month(monkeypatch):
    invoice, plan, _ = _handle(monkeypatch, _session(), plan=_plan('free_trial', 'trial'))
    assert invoice.amount == 5445 and invoice.status == 'paid'
    assert plan.plan_name == 's5'
    assert plan.expires_at == datetime(2026, 11, 2)


def test_changed_plan_starts_full_new_period_after_payment(monkeypatch):
    _, plan, _ = _handle(monkeypatch, _session(), plan=_plan('s2'))
    assert plan.expires_at == datetime(2026, 11, 2)
    assert plan.max_staff == 5


def test_async_payment_grants_only_when_paid(monkeypatch):
    invoice, plan, _ = _handle(monkeypatch, _session(payment_status='unpaid'))
    assert invoice.status == 'pending' and plan.expires_at == datetime(2026, 12, 31)
    _handle(monkeypatch, _session(), invoice, plan, 'checkout.session.async_payment_succeeded')
    assert plan.expires_at == datetime(2027, 1, 31)


@pytest.mark.parametrize('event', ['checkout.session.expired', 'checkout.session.async_payment_failed'])
def test_abandoned_or_failed_checkout_never_extends(monkeypatch, event):
    invoice, plan, _ = _handle(monkeypatch, _session(status='expired', payment_status='unpaid'), event=event)
    assert invoice.status == 'failed' and plan.expires_at == datetime(2026, 12, 31)


@pytest.mark.parametrize('fields', [
    {'customer': 'cus_other'}, {'currency': 'usd'}, {'amount_subtotal': 4400},
    {'amount_total': 4500, 'total_details': NS(amount_tax=0, amount_discount=0)},
    {'metadata': {'billing_kind': 'prepaid', 'invoice_id':'1', 'studio_id':'8', 'plan':'s5', 'period_months':'1'}},
])
def test_wrong_customer_currency_amount_or_studio_cannot_grant(monkeypatch, fields):
    with pytest.raises(ValueError):
        _handle(monkeypatch, _session(**fields))


def test_prepaid_plan_cannot_attach_a_late_old_subscription(monkeypatch):
    from routers.billing import webhook as WH
    plan = _plan()
    db = _DB(_invoice(), plan)
    # First lookup by sub should miss; the second resolves the customer.
    calls = 0
    async def execute(query):
        nonlocal calls
        calls += 1
        return NS(scalar_one_or_none=lambda: None if calls == 1 else plan,
                  scalars=lambda: NS(first=lambda: _invoice()))
    db.execute = execute
    assert asyncio.run(WH.find_plan_by_subscription(db, 'sub_old', 'cus_test')) is None
    assert plan.stripe_subscription_id is None


def test_reversing_older_purchase_keeps_later_paid_month():
    from routers.billing.prepaid_webhook import remaining_access
    later = NS(id=2, paid_at=datetime(2026, 10, 15), plan_name='s5', period_months=1)
    _, _, until = remaining_access([later], {2: 'subscription'})
    # Without the reversed Oct2 purchase, the later month still starts Oct15.
    assert until == datetime(2026, 11, 15)


def test_remaining_access_preserves_renewals_and_changed_plan():
    from routers.billing.prepaid_webhook import remaining_access
    first = NS(id=1, paid_at=datetime(2026, 10, 2), plan_name='s5', period_months=1)
    renewal = NS(id=2, paid_at=datetime(2026, 10, 15), plan_name='s5', period_months=1)
    upgrade = NS(id=3, paid_at=datetime(2026, 10, 20), plan_name='s7', period_months=3)
    _, _, until = remaining_access([first, renewal], {1:'subscription', 2:'subscription'})
    assert until == datetime(2026, 12, 2)
    last, _, until = remaining_access([first, renewal, upgrade], {1:'subscription', 2:'subscription', 3:'subscription'})
    assert last is upgrade and until == datetime(2027, 1, 20)


def test_profile_fingerprint_changes_for_model_or_tax_rule():
    from routers.billing.prepaid import _fingerprint
    from services.tax_rates import TaxApplication
    from services.tax_policy import TaxDecision
    profile = NS(model_dump=lambda: {'country':'CZ'})
    body = NS(ui_mode='elements', plan='s5', period_months=1)
    tax = TaxApplication(False, (), 'none', TaxDecision(outcome='taxable', basis='domestic_standard_rate'))
    exempt = TaxApplication(False, (), 'exempt', TaxDecision(outcome='exempt', basis='seller_not_vat_registered'))
    original = _fingerprint(profile, tax, body, False, 4500)
    assert _fingerprint(profile, exempt, body, False, 4500) != original
    assert _fingerprint(profile, tax, body, True, 2250) != original


@pytest.mark.parametrize('fields', [{'mode':'subscription'}, {'metadata': {'billing_kind':'prepaid', 'invoice_id':'1', 'studio_id':'7', 'plan':'s5', 'period_months':'12', 'billing_mode':'subscription'}}])
def test_recurring_mode_or_period_cannot_grant(monkeypatch, fields):
    with pytest.raises(ValueError):
        _handle(monkeypatch, _session(**fields))


def test_wrong_customer_expired_checkout_cannot_change_local_order(monkeypatch):
    with pytest.raises(ValueError):
        _handle(monkeypatch, _session(customer='cus_other', status='expired', payment_status='unpaid'), event='checkout.session.expired')


def test_paid_quote_has_no_future_automatic_debit(monkeypatch):
    from routers.billing import checkout as CO
    from services.billing_tax import TaxPreview
    plan = _plan('free_trial', 'trial')
    async def tax_preview(*args):
        return TaxPreview('taxable', 21, 4500, 945, 5445, 'EUR', 'domestic_standard_rate', None)
    monkeypatch.setattr(CO.billing_tax, 'preview', tax_preview)
    fn = getattr(CO.preview_checkout, '__wrapped__', CO.preview_checkout)
    preview = asyncio.run(fn(None, 's5', 1, False, NS(studio_id=7), _DB(_invoice(), plan)))
    assert preview.total == 4500 and preview.total_with_tax == 5445
    assert preview.free_until is None and preview.free_days == 0
    assert preview.access_starts_at and preview.access_until


class _CreateDB:
    def __init__(self, plan):
        self.plan, self.rows = plan, []
    async def execute(self, query):
        entity = query.column_descriptions[0]['entity']
        value = self.plan if entity is StudioBillingPlan else self.rows[-1] if self.rows else None
        return NS(scalar_one_or_none=lambda: value,
                  scalars=lambda: NS(all=lambda: [row for row in self.rows if row.status == 'pending']))
    async def commit(self):
        return None
    def add(self, row):
        row.id = len(self.rows) + 1
        self.rows.append(row)
    async def flush(self):
        return None


def test_reopening_same_purchase_reuses_checkout_and_profile_change_expires_old(monkeypatch):
    from routers.billing.prepaid import create_payment
    from services.tax_rates import automatic_application
    db, created, expired = _CreateDB(_plan('free_trial', 'trial')), [], []
    sessions = {}
    async def create(customer, amount, name, metadata, return_url, cancel_url, **kw):
        session = _session(id=f'cs_{len(created)+1}', status='open', payment_status='unpaid',
                           metadata=metadata, client_secret='secret', url=None)
        sessions[session.id] = session
        created.append(kw)
        return session
    async def fetch(session_id):
        return sessions[session_id]
    async def expire(session_id):
        expired.append(session_id)
        sessions[session_id].status = 'expired'
    monkeypatch.setattr(SB, 'create_period_checkout', create)
    monkeypatch.setattr(SB, 'fetch_checkout_session', fetch)
    monkeypatch.setattr(SB, 'expire_checkout_session', expire)
    for suffix, value in {'LEGAL_NAME':'Test Seller', 'REGISTRATION_ID':'12345678',
                          'COUNTRY':'CZ', 'ADDRESS_LINE1':'Test 1',
                          'ADDRESS_POSTAL_CODE':'11000', 'ADDRESS_CITY':'Praha',
                          'VAT_REGISTERED':'false'}.items():
        monkeypatch.setenv(f'BILLING_SELLER_{suffix}', value)
    profile = NS(model_dump=lambda: {'legal_name':'Test Buyer', 'country':'CZ',
        'line1':'Test1', 'postal_code':'11000', 'city':'Praha'})
    ctx, body = NS(studio_id=7, user=NS(id=1)), NS(plan='s5', period_months=1, combo=False, ui_mode='elements')
    args = (db, ctx, db.plan, 'cus_test', body, automatic_application(), profile, 'pk_test', 'return', 'cancel')
    first = asyncio.run(create_payment(*args))
    second = asyncio.run(create_payment(*args))
    assert first.client_secret == second.client_secret == 'secret'
    assert len(created) == 1 and len(db.rows) == 1
    assert first.tax_rate_percent is None  # Automatic Tax's percentage isn't fabricated.
    changed = (*args[:6], NS(model_dump=lambda: {'legal_name':'Test Buyer', 'country':'DE',
        'line1':'New', 'postal_code':'11000', 'city':'Berlin'}), *args[7:])
    asyncio.run(create_payment(*changed))
    assert len(created) == 2 and expired == ['cs_1'] and db.rows[0].status == 'failed'


def test_legacy_recurring_account_is_blocked_before_another_payment(monkeypatch):
    from fastapi import HTTPException
    from routers.billing.prepaid import create_payment
    plan = _plan()
    plan.stripe_subscription_id = 'sub_legacy'
    monkeypatch.setattr(SB, 'create_period_checkout', lambda *a, **kw: pytest.fail('No new charge allowed'))
    with pytest.raises(HTTPException) as error:
        asyncio.run(create_payment(None, None, plan, None, None, None, None, None, None, None))
    assert error.value.status_code == 409
    assert error.value.detail['code'] == 'billing.prepaid_migration_required'


def test_refund_payment_metadata_resolves_exact_same_session(monkeypatch):
    from routers.billing.prepaid_webhook import order_for_payment
    invoice = _invoice()
    async def fetch_intent(*args):
        return NS(id='pi_test', metadata={'billing_kind':'prepaid','invoice_id':'1','studio_id':'7'})
    async def fetch_session(*args):
        return _session(payment_intent='pi_test')
    monkeypatch.setattr(SB, 'fetch_payment_intent', fetch_intent)
    monkeypatch.setattr(SB, 'fetch_checkout_session', fetch_session)
    assert asyncio.run(order_for_payment(_DB(invoice, _plan()), 'pi_test', None)) is invoice
    async def wrong(*args):
        return _session(payment_intent='pi_other')
    monkeypatch.setattr(SB, 'fetch_checkout_session', wrong)
    with pytest.raises(ValueError):
        asyncio.run(order_for_payment(_DB(invoice, _plan()), 'pi_test', None))


def test_refund_reverses_collected_gross_and_preserves_later_paid_access(monkeypatch):
    from routers.billing.prepaid_webhook import reverse_prepaid
    invoice, plan = _invoice(), _plan()
    invoice.status, invoice.amount, invoice.paid_at = 'paid', 5445, datetime(2026, 10, 2)
    later = NS(id=2, paid_at=datetime(2026, 10, 15), plan_name='s5', period_months=1, order_id='cs_later')
    db, ledger = _DB(invoice, plan), []
    async def execute(query):
        entity = query.column_descriptions[0]['entity']
        value = invoice if entity is BillingInvoice else plan
        return NS(scalar_one_or_none=lambda: value,
                  scalars=lambda: NS(all=lambda: [later]))
    async def fetch(*args):
        return NS(metadata={'billing_kind':'prepaid', 'billing_mode':'subscription'})
    async def revenue(*args):
        ledger.append(args)
    db.execute = execute
    monkeypatch.setattr(SB, 'fetch_checkout_session', fetch)
    monkeypatch.setattr('services.platform_fee.record_revenue', revenue)
    assert asyncio.run(reverse_prepaid(db, invoice)) is True
    assert plan.expires_at == datetime(2026, 11, 15)
    assert ledger[0][3] == -5445
    assert asyncio.run(reverse_prepaid(db, invoice)) is False
    assert len(ledger) == 1
