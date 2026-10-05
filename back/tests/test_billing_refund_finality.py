"""Async refunds preserve prepaid access until successful refunds cover the charge."""
import asyncio
from copy import deepcopy
from datetime import datetime
from types import SimpleNamespace as NS

import pytest
import stripe
from fastapi import FastAPI
from fastapi.testclient import TestClient

from routers.billing import webhook
from routers.billing.prepaid_webhook import handle_session
from services import stripe_billing as SB
from test_billing_prepaid import _session
from test_billing_prepaid_refund_order import setup


def refund(amount=5445, status='succeeded', id='re_test'):
    return stripe.Refund.construct_from({
        'id': id, 'object': 'refund', 'charge': 'ch_test',
        'payment_intent': 'pi_test', 'amount': amount, 'status': status,
        'created': 1790942400,
    }, 'sk_test_fixture')


def arrange(monkeypatch, *pages):
    db, _session, ledger, _mails = setup(monkeypatch)
    db.invoice.status, db.invoice.amount = 'paid', 5445
    db.invoice.paid_at = datetime(2026, 10, 1)
    charge = stripe.Charge.construct_from({
        'id': 'ch_test', 'object': 'charge', 'payment_intent': 'pi_test',
        'amount': 5445, 'amount_refunded': 5445,
    }, 'sk_test_fixture')
    current = list(pages)
    requests = []
    monkeypatch.setattr(stripe.Charge, 'retrieve', lambda _id: charge)

    def list_refunds(**params):
        requests.append(params)
        page = current.pop(0)
        if isinstance(page, Exception):
            raise page
        return NS(data=page, has_more=bool(current))

    monkeypatch.setattr(stripe.Refund, 'list', list_refunds)
    return db, charge, ledger, requests


@pytest.mark.parametrize('status', ['pending', 'failed', 'canceled', 'requires_action'])
def test_full_requested_refund_without_success_keeps_paid_access(monkeypatch, status):
    db, charge, ledger, _requests = arrange(monkeypatch, [refund(status=status)])
    previous = deepcopy(vars(db.plan))
    asyncio.run(webhook._handle_refund(db, charge))
    assert db.invoice.status == 'paid' and vars(db.plan) == previous
    assert ledger == [] and db.document is None and db.commits == 0


def test_succeeded_partial_and_pending_remainder_keep_access(monkeypatch):
    db, charge, ledger, _requests = arrange(monkeypatch, [
        refund(2000), refund(3445, 'pending', 're_pending'),
    ])
    previous = deepcopy(vars(db.plan))
    asyncio.run(webhook._handle_refund(db, charge))
    assert db.invoice.status == 'paid' and vars(db.plan) == previous and ledger == []


def test_all_successful_refund_pages_revoke_once_even_with_stale_charge_total(monkeypatch):
    first, last = refund(2000, id='re_first'), refund(3445, id='re_last')
    db, charge, ledger, requests = arrange(monkeypatch, [first], [last])
    charge.amount_refunded = 0  # Event aggregates aren't completion evidence.
    asyncio.run(webhook._handle_refund(db, charge))
    assert db.invoice.status == 'refunded' and db.plan.status == 'expired'
    assert ledger == [(-5445, 'rev:cs:cs_test')]
    assert requests == [
        {'charge': 'ch_test', 'limit': 100},
        {'charge': 'ch_test', 'limit': 100, 'starting_after': 're_first'},
    ]


@pytest.mark.parametrize('event_type', ['refund.created', 'refund.updated', 'refund.failed'])
def test_refund_events_reconcile_current_success_and_duplicate_failure_cannot_restore(monkeypatch, event_type):
    db, charge, ledger, _requests = arrange(monkeypatch, [refund()])
    monkeypatch.setattr(stripe.Refund, 'list', lambda **kw: NS(data=[refund()], has_more=False))
    # The event is stale/failed; current Stripe refunds prove the full success.
    stale = refund(status='failed')
    event = stripe.Event.construct_from({
        'id': 'evt_test', 'type': event_type, 'created': 1790942400,
        'data': {'object': stale},
    }, 'sk_test_fixture')
    monkeypatch.setattr(SB, 'parse_webhook', lambda *args: event)

    class Context:
        async def __aenter__(self): return db
        async def __aexit__(self, *args): return False

    monkeypatch.setattr(webhook, 'async_session_maker', Context)
    async def body(): return b'{}'
    request = NS(body=body, headers={})
    asyncio.run(webhook.stripe_webhook(request))
    expires = db.plan.expires_at
    asyncio.run(webhook.stripe_webhook(request))
    assert db.invoice.status == 'refunded' and db.plan.expires_at == expires
    assert ledger == [(-5445, 'rev:cs:cs_test')]


def test_pending_then_successful_final_update_reverses_access_once(monkeypatch):
    db, charge, ledger, _requests = arrange(monkeypatch, [refund(status='pending')])
    asyncio.run(webhook._handle_refund(db, charge))
    assert db.invoice.status == 'paid' and ledger == []
    monkeypatch.setattr(stripe.Refund, 'list', lambda **kw: NS(data=[refund()], has_more=False))
    asyncio.run(webhook._handle_refund(db, refund()))
    asyncio.run(webhook._handle_refund(db, charge))
    assert db.invoice.status == 'refunded' and db.plan.status == 'expired'
    assert ledger == [(-5445, 'rev:cs:cs_test')]


def test_later_refund_page_failure_propagates_without_revoking_access(monkeypatch):
    db, charge, ledger, _requests = arrange(monkeypatch, [refund(2000)], RuntimeError('Stripe unavailable'))
    previous = deepcopy(vars(db.plan))
    with pytest.raises(RuntimeError, match='Stripe unavailable'):
        asyncio.run(webhook._handle_refund(db, charge))
    assert db.invoice.status == 'paid' and vars(db.plan) == previous and ledger == []


def test_refund_read_failure_returns_webhook_500_for_retry(monkeypatch):
    db, _charge, ledger, _requests = arrange(monkeypatch, RuntimeError('Stripe unavailable'))
    event = stripe.Event.construct_from({
        'id': 'evt_test', 'type': 'refund.updated', 'data': {'object': refund()},
    }, 'sk_test_fixture')
    monkeypatch.setattr(SB, 'parse_webhook', lambda *args: event)

    class Context:
        async def __aenter__(self): return db
        async def __aexit__(self, *args): return False

    monkeypatch.setattr(webhook, 'async_session_maker', Context)
    app = FastAPI()
    app.include_router(webhook.router)
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post('/webhook/stripe', content=b'{}')
    assert response.status_code == 500
    assert db.invoice.status == 'paid' and ledger == []


def test_failed_refund_date_does_not_change_successful_correction_date(monkeypatch):
    failed = refund(status='failed', id='re_failed')
    failed.created = 1791028800
    db, charge, ledger, _requests = arrange(monkeypatch, [refund(), failed])
    # Generate the original paid document before checking its correction date.
    db.invoice.status, db.invoice.amount = 'pending', 4500
    asyncio.run(handle_session(db, 'checkout.session.completed', _session(),
                               now=datetime(2026, 10, 1)))
    ledger.clear()
    asyncio.run(webhook._handle_refund(db, refund(), event_created=1790942400))
    assert db.invoice.status == 'refunded' and ledger == [(-5445, 'rev:cs:cs_test')]
    assert db.document.correction_snapshot['refunded_at'] == '2026-10-02T12:00:00+00:00'


@pytest.mark.parametrize('event_status', ['pending', 'failed', 'charge'])
def test_replayed_unfinished_event_cannot_supply_a_completed_refund_date(monkeypatch, event_status):
    current = refund()
    current.created = 1790856000  # Request time, before asynchronous completion.
    db, charge, ledger, _requests = arrange(monkeypatch, [current])
    db.invoice.status, db.invoice.amount = 'pending', 4500
    asyncio.run(handle_session(db, 'checkout.session.completed', _session(),
                               now=datetime(2026, 10, 1)))
    ledger.clear()
    obj = charge if event_status == 'charge' else refund(status=event_status)
    asyncio.run(webhook._handle_refund(db, obj, event_created=1790856000))
    assert db.invoice.status == 'refunded' and ledger == [(-5445, 'rev:cs:cs_test')]
    assert db.document.correction_snapshot['refunded_at'] is None


def test_later_final_event_fills_missing_pending_correction_date_once(monkeypatch):
    db, _charge, ledger, _requests = arrange(monkeypatch, [refund()])
    monkeypatch.setattr(stripe.Refund, 'list', lambda **kw: NS(data=[refund()], has_more=False))
    db.invoice.status, db.invoice.amount = 'pending', 4500
    asyncio.run(handle_session(db, 'checkout.session.completed', _session(),
                               now=datetime(2026, 10, 1)))
    ledger.clear()
    asyncio.run(webhook._handle_refund(db, refund(status='pending'), event_created=1790856000))
    expires = db.plan.expires_at
    assert db.document.correction_snapshot['refunded_at'] is None
    asyncio.run(webhook._handle_refund(db, refund(), event_created=1790942400))
    assert db.document.correction_snapshot['refunded_at'] == '2026-10-02T12:00:00+00:00'
    asyncio.run(webhook._handle_refund(db, refund(), event_created=1791028800))
    assert db.document.correction_snapshot['refunded_at'] == '2026-10-02T12:00:00+00:00'
    assert db.invoice.status == 'refunded' and db.plan.expires_at == expires
    assert ledger == [(-5445, 'rev:cs:cs_test')]


@pytest.mark.parametrize('correction', [
    {'status': 'issued', 'snapshot': {'refunded_at': '2026-10-02T12:00:00+00:00'}},
    {'status': 'pending', 'reason': 'full_refund', 'refund_minor': 5000, 'refunded_at': None},
    {'status': 'pending', 'reason': 'manual_review', 'refund_minor': 5445, 'refunded_at': None},
])
def test_final_proof_does_not_rewrite_issued_or_unmatched_corrections(monkeypatch, correction):
    from services.billing_tax_documents import queue_correction
    db, _charge, _ledger, _requests = arrange(monkeypatch, [refund()])
    db.invoice.status = 'refunded'
    db.document = NS(correction_snapshot=deepcopy(correction))
    asyncio.run(queue_correction(db, db.invoice, refunded_at=datetime(2026, 10, 3, 12)))
    assert db.document.correction_snapshot == correction
