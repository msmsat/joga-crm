"""Reordered refund delivery must retain payment facts without granting access."""
import asyncio
from copy import deepcopy
from datetime import datetime, timezone
from types import SimpleNamespace as NS

import pytest

from models import BillingInvoice, BillingTaxDocument, StudioBillingPlan
from routers.billing import prepaid_webhook as route, webhook
from test_billing_prepaid import _invoice, _plan, _session
from test_fiscal_documents import snapshot


class DB:
    def __init__(self, invoice, plan):
        self.invoice, self.plan, self.document = invoice, plan, None
        self.commits = 0
        self.queries = []

    async def execute(self, query):
        self.queries.append(query)
        entity = query.column_descriptions[0]['entity']
        value = (self.invoice if entity is BillingInvoice else self.plan
                 if entity is StudioBillingPlan else self.document)
        return NS(scalar_one_or_none=lambda: value,
                  scalars=lambda: NS(all=lambda: []))

    def add(self, document):
        self.document = document

    async def flush(self):
        self.document.id = 7

    async def commit(self):
        self.commits += 1


def setup(monkeypatch, **session_fields):
    invoice, plan, session = _invoice(), _plan(), _session(**session_fields)
    invoice.billing_details_snapshot = snapshot()
    invoice.access_granted_at = None
    db, ledger, mails = DB(invoice, plan), [], []
    async def fetch(_id): return session
    async def intent(*args):
        return NS(id='pi_test', metadata=session.metadata)
    async def received(*args, **kwargs): return datetime(2026, 10, 1, 12)
    async def revenue(*args): ledger.append((args[3], args[5]))
    async def mail(*args): mails.append(args)
    monkeypatch.setattr(route.stripe_billing, 'fetch_checkout_session', fetch)
    monkeypatch.setattr(route.stripe_billing, 'fetch_payment_intent', intent)
    monkeypatch.setattr('services.billing_payment_dates.received_at', received)
    monkeypatch.setattr('services.platform_fee.record_revenue', revenue)
    monkeypatch.setattr('services.billing_mail.send_receipt', mail)
    monkeypatch.setattr('services.billing_mail.send_platform_income', mail)
    return db, session, ledger, mails


def test_refund_before_paid_event_records_gross_original_and_correction_once(monkeypatch):
    db, session, ledger, mails = setup(monkeypatch)
    previous_plan = deepcopy(vars(db.plan))
    original = deepcopy(db.invoice.billing_details_snapshot)
    charge = NS(object='charge', id='ch_test', payment_intent='pi_test',
                amount=5445, amount_refunded=5445)
    refunded_at = int(datetime(2026, 10, 2, 12, tzinfo=timezone.utc).timestamp())
    asyncio.run(webhook._handle_refund(db, charge, event_created=refunded_at))
    assert db.invoice.status == 'refunded' and db.invoice.amount == 5445
    assert ledger == [(5445, 'cs:cs_test'), (-5445, 'rev:cs:cs_test')]
    assert db.document.snapshot['tax']['total_minor'] == 5445
    assert db.document.snapshot['paid_at'] == '2026-10-01T12:00:00+00:00'
    assert db.document.correction_snapshot['refund_minor'] == 5445
    assert db.document.correction_snapshot['refunded_at'] == '2026-10-02T12:00:00+00:00'
    assert vars(db.plan) == previous_plan and db.invoice.access_granted_at is None
    assert db.invoice.billing_details_snapshot == original and mails == []
    assert db.commits == 1
    asyncio.run(webhook._handle_refund(db, charge, event_created=refunded_at))
    asyncio.run(route.handle_session(db, 'checkout.session.completed', session,
                                    event_created=refunded_at - 86400))
    assert len(ledger) == 2 and vars(db.plan) == previous_plan and mails == []


@pytest.mark.parametrize('fields', [
    {'payment_status': 'unpaid'}, {'customer': 'cus_other'}, {'currency': 'usd'},
    {'amount_subtotal': 4400}, {'amount_total': 4500},
])
def test_refund_before_paid_event_requires_matching_paid_session(monkeypatch, fields):
    db, _session, ledger, mails = setup(monkeypatch, **fields)
    previous_plan = deepcopy(vars(db.plan))
    with pytest.raises(ValueError):
        asyncio.run(route.reverse_prepaid(db, db.invoice, fiscal_reason='full_refund'))
    assert db.invoice.status == 'pending' and db.invoice.amount == 4500
    assert vars(db.plan) == previous_plan
    assert ledger == [] and mails == [] and db.document is None and db.commits == 0


def test_lost_dispute_before_paid_event_retains_original_and_no_access(monkeypatch):
    db, _session, ledger, mails = setup(monkeypatch)
    previous_plan = deepcopy(vars(db.plan))
    dispute = NS(id='dp_test', status='lost', payment_intent='pi_test', charge='ch_test')
    asyncio.run(webhook._handle_dispute(db, dispute))
    assert db.invoice.status == 'refunded' and db.invoice.amount == 5445
    assert ledger == [(5445, 'cs:cs_test'), (-5445, 'rev:cs:cs_test')]
    assert db.document.snapshot['tax']['total_minor'] == 5445
    assert db.document.correction_snapshot is None
    assert vars(db.plan) == previous_plan and db.invoice.access_granted_at is None and mails == []


@pytest.mark.parametrize('status', ['paid', 'refunded'])
def test_paid_or_refunded_prepaid_purchase_blocks_late_legacy_subscription(status):
    invoice, plan = _invoice(), _plan()
    invoice.status = status
    async def execute(query):
        entity = query.column_descriptions[0]['entity']
        params = query.compile().params
        if entity is StudioBillingPlan:
            value = None if 'stripe_subscription_id_1' in params else plan
        else:
            statuses = params['status_1']
            statuses = [statuses] if isinstance(statuses, str) else statuses
            value = invoice if invoice.status in statuses else None
        return NS(scalar_one_or_none=lambda: value,
                  scalars=lambda: NS(first=lambda: value))
    db = NS(execute=execute)
    assert asyncio.run(webhook.find_plan_by_subscription(db, 'sub_old', 'cus_test')) is None
    assert plan.stripe_subscription_id is None and plan.auto_renewal is False


def test_commission_invoice_event_still_uses_customer_lookup_after_prepaid_refund():
    plan = _plan()
    async def execute(query):
        assert query.column_descriptions[0]['entity'] is StudioBillingPlan
        return NS(scalar_one_or_none=lambda: plan)
    assert asyncio.run(webhook.find_plan_by_subscription(NS(execute=execute), None, 'cus_test')) is plan
    assert plan.stripe_subscription_id is None


def test_sdk_payment_objects_activate_and_reverse_the_exact_order_once(monkeypatch):
    import stripe

    db, session_fields, ledger, mails = setup(monkeypatch)
    db.plan.plan_name, db.plan.status = 'free_trial', 'trial'
    values = vars(session_fields).copy()
    values['total_details'] = vars(session_fields.total_details)
    session = stripe.checkout.Session.construct_from(values, 'sk_test_fixture')
    intent = stripe.PaymentIntent.construct_from({
        'id': 'pi_test', 'status': 'succeeded', 'metadata': values['metadata'],
    }, 'sk_test_fixture')
    charge = stripe.Charge.construct_from({
        'id': 'ch_test', 'object': 'charge', 'payment_intent': 'pi_test',
        'amount': 5445, 'amount_refunded': 5445,
    }, 'sk_test_fixture')
    async def fetch(_id): return session
    async def payment(*args): return intent
    monkeypatch.setattr(route.stripe_billing, 'fetch_checkout_session', fetch)
    monkeypatch.setattr(route.stripe_billing, 'fetch_payment_intent', payment)

    assert asyncio.run(route.handle_session(db, 'checkout.session.completed', session,
                                           now=datetime(2026, 10, 2))) is True
    assert db.invoice.status == 'paid' and db.invoice.amount == 5445
    assert db.plan.expires_at == datetime(2026, 11, 2)
    assert ledger == [(5445, 'cs:cs_test')] and len(mails) == 2
    refund_proof = int(datetime(2026, 10, 2, 12, tzinfo=timezone.utc).timestamp())
    asyncio.run(webhook._handle_refund(db, charge, event_created=refund_proof))
    assert db.invoice.status == 'refunded' and db.plan.status == 'expired'
    assert ledger == [(5445, 'cs:cs_test'), (-5445, 'rev:cs:cs_test')]
    assert db.document.correction_snapshot['refund_minor'] == 5445
    expires = db.plan.expires_at
    asyncio.run(route.handle_session(db, 'checkout.session.completed', session))
    asyncio.run(webhook._handle_refund(db, charge, event_created=refund_proof))
    assert db.plan.expires_at == expires and len(ledger) == 2 and len(mails) == 2
