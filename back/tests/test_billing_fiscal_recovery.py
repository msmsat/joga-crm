"""A late proved success repairs only a pending document, never paid access."""
import asyncio
import importlib.util
import io
from copy import deepcopy
from datetime import datetime, timezone
from types import SimpleNamespace as NS
from pathlib import Path

import pytest

from models import BillingInvoice, BillingTaxDocument, StudioBillingPlan
from routers.billing import prepaid_webhook as route
from services import billing_tax_documents as fiscal, billing_document_fx as fx
from test_billing_prepaid import _invoice, _plan, _session
from test_fiscal_documents import snapshot


class DB:
    def __init__(self, invoice, plan, document=None):
        self.invoice, self.plan, self.document = invoice, plan, document
        self.commits, self.queries = 0, []
    async def execute(self, query):
        self.queries.append(query)
        entity = query.column_descriptions[0]['entity']
        value = (self.invoice if entity is BillingInvoice else self.plan
                 if entity is StudioBillingPlan else self.document)
        return NS(scalar_one_or_none=lambda: value)
    def add(self, document): self.document = document
    async def flush(self): self.document.id = 7
    async def commit(self): self.commits += 1


def _setup(monkeypatch, *, unknown=True, grant_at=datetime(2026, 10, 2), event_created=None):
    invoice, plan, session = _invoice(), _plan('free_trial', 'trial'), _session()
    invoice.billing_details_snapshot = snapshot()
    db, revenue = DB(invoice, plan), []
    async def fetch(_id): return session
    async def record(*args): revenue.append(args)
    async def no_mail(*args): pass
    monkeypatch.setattr(route.stripe_billing, 'fetch_checkout_session', fetch)
    monkeypatch.setattr('services.platform_fee.record_revenue', record)
    monkeypatch.setattr('services.billing_mail.send_receipt', no_mail)
    monkeypatch.setattr('services.billing_mail.send_platform_income', no_mail)
    if unknown:
        from services import billing_payment_dates as dates
        async def unavailable(*args, **kwargs): return None
        monkeypatch.setattr(dates, 'received_at', unavailable)
    asyncio.run(route.handle_session(db, 'checkout.session.completed', session,
                                    now=grant_at, event_created=event_created))
    return db, session, revenue


def test_unknown_date_late_paid_event_then_issue_once_preserves_access(monkeypatch):
    db, session, revenue = _setup(monkeypatch)
    assert db.invoice.status == 'paid' and db.document.snapshot['paid_at'] is None
    granted = db.plan.expires_at
    original = deepcopy(db.invoice.billing_details_snapshot)
    doc_facts = deepcopy(db.document.snapshot)
    proof = int(datetime(2026, 10, 1, 23, 30, tzinfo=timezone.utc).timestamp())
    assert asyncio.run(route.handle_session(db, 'checkout.session.async_payment_succeeded', session,
                                           event_created=proof)) is False
    assert db.document.snapshot['paid_at'] == '2026-10-01T23:30:00+00:00'
    assert db.invoice.paid_at == datetime(2026, 10, 1, 23, 30)
    assert db.invoice.access_granted_at == datetime(2026, 10, 2)
    assert db.plan.expires_at == granted and len(revenue) == 1
    assert db.invoice.billing_details_snapshot == original
    doc_facts['paid_at'] = db.document.snapshot['paid_at']
    assert db.document.snapshot == doc_facts
    assert any('FOR UPDATE' in str(query) for query in db.queries if query.column_descriptions[0]['entity'] is BillingTaxDocument)
    calls = []
    async def rate(day):
        calls.append(day)
        return {'rate':'24.465', 'date':day.isoformat(), 'currency':'EUR', 'source':'CNB'}
    monkeypatch.setattr(fx, 'fetch_cnb_rate', rate)
    asyncio.run(fiscal.ensure_issued(db, db.document, now=datetime(2026, 10, 3, 15)))
    issued = deepcopy(db.document.snapshot)
    asyncio.run(route.handle_session(db, 'checkout.session.completed', session, event_created=proof + 3600))
    asyncio.run(fiscal.ensure_issued(db, db.document, now=datetime(2026, 10, 5, 15)))
    assert db.document.status == 'issued' and db.document.snapshot == issued
    assert len(calls) == 1 and len(revenue) == 1 and db.plan.expires_at == granted


def test_stale_completed_unpaid_and_unproved_reconciliation_never_repair(monkeypatch):
    db, session, revenue = _setup(monkeypatch)
    before = deepcopy(db.document.snapshot)
    stale = _session(payment_status='unpaid')
    asyncio.run(route.handle_session(db, 'checkout.session.completed', stale, event_created=1790897400))
    asyncio.run(route.handle_session(db, 'checkout.session.completed', session))
    assert db.document.snapshot == before and len(revenue) == 1


@pytest.mark.parametrize('fields', [{'amount_total':999999}, {'amount_subtotal':4400},
                                     {'total_details':NS(amount_tax=1000, amount_discount=0)},
                                     {'customer':'cus_other'}])
def test_late_event_with_wrong_order_payment_facts_cannot_repair(monkeypatch, fields):
    db, session, revenue = _setup(monkeypatch)
    before = deepcopy(db.document.snapshot)
    for key, value in fields.items(): setattr(session, key, value)
    with pytest.raises(ValueError):
        asyncio.run(route.handle_session(db, 'checkout.session.completed', session, event_created=1790897400))
    assert db.document.snapshot == before and len(revenue) == 1


def test_already_known_pending_date_and_issued_documents_never_change(monkeypatch):
    db, _session, _ = _setup(monkeypatch)
    db.document.snapshot['paid_at'] = '2026-10-01T23:30:00+00:00'
    known = deepcopy(db.document.snapshot)
    assert asyncio.run(fiscal.repair_pending_date(db, db.invoice, paid_at=datetime(2026, 10, 7))) is False
    assert db.document.snapshot == known
    db.document.status = 'issued'
    db.document.snapshot['paid_at'] = None  # Even an invalid issued row is immutable.
    issued = deepcopy(db.document.snapshot)
    assert asyncio.run(fiscal.repair_pending_date(db, db.invoice, paid_at=datetime(2026, 10, 7))) is False
    assert db.document.snapshot == issued


def test_refunded_order_repairs_date_without_reactivating_access(monkeypatch):
    db, session, revenue = _setup(monkeypatch)
    db.invoice.status, db.plan.status = 'refunded', 'expired'
    ends = db.plan.expires_at
    asyncio.run(route.handle_session(db, 'checkout.session.completed', session, event_created=1790897400))
    assert db.document.snapshot['paid_at'] is not None
    assert db.plan.status == 'expired' and db.plan.expires_at == ends
    assert db.invoice.status == 'refunded' and len(revenue) == 1


def test_payment_tax_date_and_actual_access_grant_date_are_independent(monkeypatch):
    paid = int(datetime(2026, 10, 1, 12, tzinfo=timezone.utc).timestamp())
    db, _session, _revenue = _setup(monkeypatch, unknown=False,
        grant_at=datetime(2026, 10, 3, 12), event_created=paid)
    assert db.invoice.paid_at == datetime(2026, 10, 1, 12)
    assert db.invoice.access_granted_at == datetime(2026, 10, 3, 12)
    assert db.plan.expires_at == datetime(2026, 11, 3, 12)


def test_refunding_another_purchase_keeps_late_delivered_purchase_full_period(monkeypatch):
    invoice, plan = _invoice(), _plan()
    invoice.status, invoice.amount = 'paid', 5445
    remaining = NS(id=2, paid_at=datetime(2026, 10, 1), access_granted_at=datetime(2026, 10, 3),
                   plan_name='s5', period_months=1, order_id='cs_remaining')
    db, revenue = DB(invoice, plan), []
    async def execute(query):
        entity = query.column_descriptions[0]['entity']
        return NS(scalar_one_or_none=lambda: invoice if entity is BillingInvoice else plan,
                  scalars=lambda: NS(all=lambda: [remaining]))
    async def fetch(_id): return NS(metadata={'billing_kind':'prepaid', 'billing_mode':'subscription'})
    async def record(*args): revenue.append(args)
    db.execute = execute
    monkeypatch.setattr(route.stripe_billing, 'fetch_checkout_session', fetch)
    monkeypatch.setattr('services.platform_fee.record_revenue', record)
    asyncio.run(route.reverse_prepaid(db, invoice))
    assert plan.expires_at == datetime(2026, 11, 3) and len(revenue) == 1


def test_remaining_access_replays_grants_in_application_order_and_legacy_fallback():
    first = NS(id=1, paid_at=datetime(2026, 10, 3), access_granted_at=datetime(2026, 10, 3),
               plan_name='s2', period_months=1)
    late = NS(id=2, paid_at=datetime(2026, 10, 1), access_granted_at=datetime(2026, 10, 5),
              plan_name='s5', period_months=1)
    last, _mode, until = route.remaining_access([first, late], {1:'subscription', 2:'subscription'})
    assert last is late and until == datetime(2026, 11, 5)
    legacy = NS(id=3, paid_at=datetime(2026, 10, 7), plan_name='s5', period_months=1)
    assert route.remaining_access([legacy], {3:'subscription'})[2] == datetime(2026, 11, 7)


def test_followup_migration_keeps_historical_grant_dates_unknown():
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    path = Path(__file__).resolve().parents[1] / 'migrations/versions/c8b73b25dbaf_prepaid_access_grant_time.py'
    spec = importlib.util.spec_from_file_location('grant_date_revision', path)
    revision = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(revision)
    assert revision.down_revision == '2ad908ed7410'
    assert BillingInvoice.__table__.c.access_granted_at.nullable is True
    output = io.StringIO()
    context = MigrationContext.configure(dialect_name='postgresql', opts={'as_sql':True, 'output_buffer':output})
    with Operations.context(context): revision.upgrade()
    assert 'ADD COLUMN access_granted_at TIMESTAMP WITHOUT TIME ZONE' in output.getvalue()
    assert 'NOT NULL' not in output.getvalue() and 'UPDATE ' not in output.getvalue()
