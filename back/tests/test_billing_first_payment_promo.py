"""First tariff payment pricing, durable redemption and real transaction races."""
import asyncio
import importlib
from datetime import datetime
from types import SimpleNamespace as NS

import pytest
from sqlalchemy import delete, select
from fastapi import HTTPException

from database import async_session_maker
from models import BillingInvoice, BillingTaxDocument, Studio, StudioBillingPlan
from routers.billing import checkout, prepaid, prepaid_webhook
from services import stripe_billing
from services.tax_rates import automatic_application

router = importlib.import_module('routers.billing.router')


@pytest.fixture
def studio_id(monkeypatch):
    for suffix, value in {
        'LEGAL_NAME': 'Test Seller', 'REGISTRATION_ID': '12345678',
        'COUNTRY': 'CZ', 'ADDRESS_LINE1': 'Test 1',
        'ADDRESS_POSTAL_CODE': '11000', 'ADDRESS_CITY': 'Praha',
        'VAT_REGISTERED': 'false',
    }.items():
        monkeypatch.setenv(f'BILLING_SELLER_{suffix}', value)

    async def make():
        async with async_session_maker() as db:
            studio = Studio(name='TEST-WELCOME30', currency='CZK')
            db.add(studio)
            await db.flush()
            db.add(StudioBillingPlan(studio_id=studio.id, plan_name='free_trial',
                status='trial', stripe_customer_id=f'cus_promo_{studio.id}',
                billing_mode='subscription', auto_renewal=False))
            await db.commit()
            return studio.id
    sid = asyncio.run(make())
    yield sid

    async def clean():
        async with async_session_maker() as db:
            await db.execute(delete(BillingTaxDocument).where(BillingTaxDocument.studio_id == sid))
            await db.execute(delete(Studio).where(Studio.id == sid))
            await db.commit()
    asyncio.run(clean())


def _ctx(sid):
    return NS(studio_id=sid, user=NS(id=None))


def _profile():
    return NS(model_dump=lambda: {'legal_name': 'Test Buyer', 'country': 'CZ',
        'line1': 'Test 1', 'postal_code': '11000', 'city': 'Praha'})


async def _plan(db, sid):
    return (await db.execute(select(StudioBillingPlan).where(
        StudioBillingPlan.studio_id == sid))).scalar_one()


@pytest.mark.parametrize(('combo', 'months', 'before', 'net'), [
    (False, 1, 4500, 3150), (False, 3, 10800, 7560), (True, 3, 5400, 3780),
])
def test_preview_applies_promo_after_period_and_combo_before_tax(studio_id, monkeypatch, combo, months, before, net):
    from services.billing_tax import TaxPreview
    async def tax(db, sid, kind, amount, currency, *, payer):
        return TaxPreview('taxable', 21, amount, round(amount * .21),
                          amount + round(amount * .21), currency, 'domestic_standard_rate', None)
    monkeypatch.setattr(checkout.billing_tax, 'preview', tax)

    async def run():
        async with async_session_maker() as db:
            quote = await checkout._quote(db, _ctx(studio_id), await _plan(db, studio_id), 's5', months, combo)
            assert quote['total'] == net
            assert quote['net_amount'] == net
            assert quote['amount_before_promo'] == before
            assert quote['promo_code'] == 'WELCOME30'
            assert quote['promo_discount_percent'] == 30
            assert quote['promo_discount_amount'] == before - net
            assert quote['tax_amount'] == round(net * .21)
            assert quote['total_with_tax'] == net + round(net * .21)
    asyncio.run(run())


@pytest.mark.parametrize(('status', 'kind', 'amount', 'want'), [
    ('paid', 'subscription', 4500, 4500), ('refunded', 'subscription', 4500, 4500),
    ('pending', 'subscription', 4500, 3150), ('failed', 'subscription', 4500, 3150),
    ('paid', 'offline_fee', 4500, 3150), ('paid', 'subscription', 0, 3150),
])
def test_tariff_payment_history_consumes_promo_only_after_money_arrived(studio_id, monkeypatch, status, kind, amount, want):
    from services.billing_tax import TaxPreview
    async def tax(db, sid, kind, net, currency, *, payer):
        return TaxPreview('stripe_auto', 0, net, 0, net, currency, 'stripe_automatic_tax', None)
    monkeypatch.setattr(checkout.billing_tax, 'preview', tax)

    async def run():
        async with async_session_maker() as db:
            db.add(BillingInvoice(studio_id=studio_id, plan_name='s5', kind=kind,
                                  amount=amount, status=status))
            await db.commit()
            quote = await checkout._quote(db, _ctx(studio_id), await _plan(db, studio_id), 's5', 1, False)
            assert quote['total'] == want
            assert quote['promo_code'] == ('WELCOME30' if want == 3150 else None)
    asyncio.run(run())


@pytest.fixture
def stripe_sessions(monkeypatch):
    sessions = {}
    async def create(customer, amount, name, metadata, return_url, cancel_url, **kw):
        # Stripe's idempotency contract: a retry reuses exactly one Session.
        sid = f'cs_promo_{metadata["invoice_id"]}'
        if sid in sessions:
            assert sessions[sid].amount_subtotal == amount
            return sessions[sid]
        await asyncio.sleep(.02)
        from services import billing_tax
        tax = billing_tax.snapshot(kw['tax'], amount, 'eur')['tax_amount'] if kw['tax'].manual else 0
        sessions[sid] = NS(id=sid, customer=customer, mode='payment', status='open',
            payment_status='unpaid', currency='eur', amount_subtotal=amount, amount_total=amount + tax,
            total_details=NS(amount_tax=tax, amount_discount=0), metadata=metadata,
            payment_intent=f'pi_{sid}', client_secret=f'secret_{sid}', url=f'https://stripe.test/{sid}')
        return sessions[sid]
    async def fetch(sid):
        return sessions[sid]
    async def expire(sid):
        if sessions[sid].status != 'open':
            raise ValueError('A processing or paid Session cannot expire')
        sessions[sid].status = 'expired'
    async def ignore(*args, **kw):
        return None
    async def paid_at(*args, **kw):
        return datetime(2026, 10, 5)
    monkeypatch.setattr(stripe_billing, 'create_period_checkout', create)
    monkeypatch.setattr(stripe_billing, 'fetch_checkout_session', fetch)
    monkeypatch.setattr(stripe_billing, 'expire_checkout_session', expire)
    monkeypatch.setattr('services.billing_payment_dates.received_at', paid_at)
    monkeypatch.setattr('services.billing_mail.send_receipt', ignore)
    monkeypatch.setattr('services.billing_mail.send_platform_income', ignore)
    return sessions


async def _purchase(sid, plan_name='s5', months=1, combo=False, tax=None):
    async with async_session_maker() as db:
        return await prepaid.create_payment(db, _ctx(sid), await _plan(db, sid),
            f'cus_promo_{sid}', NS(plan=plan_name, period_months=months, combo=combo, ui_mode='elements'),
            tax or automatic_application(), _profile(), 'pk_test', 'https://velora.test/return', 'cancel')


def test_checkout_retries_share_discounted_order_and_snapshot(studio_id, stripe_sessions):
    async def run():
        first, second = await asyncio.gather(_purchase(studio_id), _purchase(studio_id))
        assert first.invoice_id == second.invoice_id
        assert first.amount_due == second.amount_due == 3150
        assert first.promo_code == second.promo_code == 'WELCOME30'
        assert first.net_amount == 3150
        async with async_session_maker() as db:
            row = await db.get(BillingInvoice, first.invoice_id)
            assert row.amount == 3150
            assert row.billing_details_snapshot['tax']['net_minor'] == 3150
            assert row.billing_details_snapshot['promo']['amount_before_promo'] == 4500
            assert row.billing_details_snapshot['promo']['promo_discount_amount'] == 1350
        session = next(iter(stripe_sessions.values()))
        assert session.metadata['promo_code'] == 'WELCOME30'
        assert session.metadata['net_amount'] == '3150'
        assert len(stripe_sessions) == 1
    asyncio.run(run())


def test_paid_session_reconciled_during_new_choice_removes_promo(studio_id, stripe_sessions):
    async def run():
        old = await _purchase(studio_id)
        session = next(iter(stripe_sessions.values()))
        session.status, session.payment_status = 'complete', 'paid'
        new = await _purchase(studio_id, 's7')
        assert new.invoice_id != old.invoice_id
        assert new.amount_due == 5500
        assert new.promo_code is None
        async with async_session_maker() as db:
            old_row = await db.get(BillingInvoice, old.invoice_id)
            assert old_row.status == 'paid'
            quote = await checkout._quote(db, _ctx(studio_id), await _plan(db, studio_id), 's7', 1, False)
            assert quote['total'] == 5500
    asyncio.run(run())


def test_two_different_choices_leave_only_one_payable_promo_session(studio_id, stripe_sessions):
    async def run():
        await _purchase(studio_id)
        outcomes = await asyncio.gather(_purchase(studio_id, 's7'), _purchase(studio_id, 's9'), return_exceptions=True)
        assert any(not isinstance(outcome, Exception) for outcome in outcomes)
        assert all(not isinstance(outcome, Exception) or
                   isinstance(outcome, HTTPException) and outcome.status_code == 409 for outcome in outcomes)
        opened = [s for s in stripe_sessions.values() if s.status == 'open']
        assert len(opened) == 1
        assert opened[0].amount_subtotal in (3850, 4550)
    asyncio.run(run())


def test_duplicate_webhooks_consume_promo_once_and_refund_does_not_restore_it(studio_id, stripe_sessions):
    from services import billing_pricing
    async def run():
        result = await _purchase(studio_id)
        session = next(iter(stripe_sessions.values()))
        session.status, session.payment_status = 'complete', 'paid'
        async def handle():
            async with async_session_maker() as db:
                return await prepaid_webhook.handle_session(db, 'checkout.session.completed', session)
        assert sorted(await asyncio.gather(handle(), handle())) == [False, True]
        async with async_session_maker() as db:
            row = await db.get(BillingInvoice, result.invoice_id)
            row.status = 'refunded'
            await db.commit()
            assert not await billing_pricing.first_payment_available(db, await _plan(db, studio_id))
    asyncio.run(run())


def test_stale_second_discounted_payment_cannot_grant_another_promo(studio_id, stripe_sessions):
    async def run():
        first = await _purchase(studio_id)
        one = next(iter(stripe_sessions.values()))
        second = await _purchase(studio_id, 's7')
        two = stripe_sessions[f'cs_promo_{second.invoice_id}']
        # A malformed legacy/racing event must not bypass durable redemption.
        for session in (one, two):
            session.status, session.payment_status = 'complete', 'paid'
        async with async_session_maker() as db:
            await prepaid_webhook.handle_session(db, 'checkout.session.completed', one)
        async with async_session_maker() as db:
            with pytest.raises(ValueError, match='already used'):
                await prepaid_webhook.handle_session(db, 'checkout.session.completed', two)
        async with async_session_maker() as db:
            assert (await db.get(BillingInvoice, first.invoice_id)).status == 'paid'
            assert (await db.get(BillingInvoice, second.invoice_id)).status == 'pending'
    asyncio.run(run())


def test_public_catalog_and_current_plan_expose_same_promo(studio_id):
    async def run():
        catalog = await router.get_public_plans_catalog()
        assert catalog.first_payment_promo.code == 'WELCOME30'
        assert catalog.first_payment_promo.percent == 30
        async with async_session_maker() as db:
            plan = await router._plan_response(db, await _plan(db, studio_id))
            assert plan.first_payment_promo_available is True
    asyncio.run(run())


@pytest.mark.parametrize(('combo', 'want_saved', 'want_spent'), [(False, 5940, 7560), (True, 2970, 3780)])
def test_saved_stats_use_frozen_promo_and_correct_fixed_model(studio_id, stripe_sessions, combo, want_saved, want_spent):
    async def run():
        await _purchase(studio_id, months=3, combo=combo)
        session = next(iter(stripe_sessions.values()))
        session.status, session.payment_status = 'complete', 'paid'
        async with async_session_maker() as db:
            await prepaid_webhook.handle_session(db, 'checkout.session.completed', session)
            stats = await router.get_billing_stats(_ctx(studio_id), db)
            assert stats.saved == want_saved
            assert stats.total_spent == want_spent
    asyncio.run(run())


def test_promo_tax_snapshot_and_fiscal_document_share_discounted_net(studio_id, stripe_sessions):
    from services.tax_rates import TaxApplication
    from services.tax_policy import TaxDecision
    tax = TaxApplication(False, ('txr_test',), 'none', TaxDecision(
        outcome='taxable', basis='domestic_standard_rate', rate_percent=21))
    async def run():
        result = await _purchase(studio_id, tax=tax)
        assert result.amount_due == 3812 and result.tax_amount == 662
        session = next(iter(stripe_sessions.values()))
        session.status, session.payment_status = 'complete', 'paid'
        async with async_session_maker() as db:
            await prepaid_webhook.handle_session(db, 'checkout.session.completed', session)
            document = (await db.execute(select(BillingTaxDocument).where(
                BillingTaxDocument.invoice_id == result.invoice_id))).scalar_one()
            assert document.snapshot['tax']['net_minor'] == 3150
            assert document.snapshot['tax']['tax_minor'] == 662
            assert document.snapshot['tax']['total_minor'] == 3812
    asyncio.run(run())


def test_promo_metadata_mismatch_cannot_activate_paid_tariff(studio_id, stripe_sessions):
    async def run():
        result = await _purchase(studio_id)
        session = next(iter(stripe_sessions.values()))
        session.metadata['promo_discount_amount'] = '9999'
        session.status, session.payment_status = 'complete', 'paid'
        async with async_session_maker() as db:
            with pytest.raises(ValueError, match='promotion does not match'):
                await prepaid_webhook.handle_session(db, 'checkout.session.completed', session)
        async with async_session_maker() as db:
            assert (await db.get(BillingInvoice, result.invoice_id)).status == 'pending'
    asyncio.run(run())
