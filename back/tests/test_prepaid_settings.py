"""Prepaid access must never announce or enable a scheduled fixed charge."""
import asyncio
from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from routers.billing.router import get_billing_stats, update_autopay
from schemas.settings.billing import AutopaySettingsUpdate
from tests.test_billing_autopay import _Plan, _Card, _DB, _Stripe, _ctx
import importlib
billing_router = importlib.import_module('routers.billing.router')


class Result:
    def __init__(self, value):
        self.value = value
    def scalars(self):
        return self
    def all(self):
        return self.value
    def scalar_one_or_none(self):
        return self.value


class StatsDB:
    def __init__(self, paid, plan):
        self.results = iter([paid, plan])
    async def execute(self, statement):
        return Result(next(self.results))


@pytest.mark.parametrize("saved_card", [False, True])
def test_prepaid_cannot_enable_automatic_renewal(saved_card):
    plan = _Plan(subscription_id=None)
    db = _DB([plan, _Card() if saved_card else None, None])
    with _Stripe() as remote:
        with pytest.raises(HTTPException) as error:
            asyncio.run(update_autopay(AutopaySettingsUpdate(auto_renewal=True), _ctx(), db))
    assert error.value.status_code == 409
    assert error.value.detail["code"] == "billing.prepaid_no_autorenewal"
    assert not remote.calls
    assert not db.committed
    assert plan.auto_renewal is False


@pytest.mark.parametrize("subscription_id,auto_renewal", [(None, False), (None, True), ("sub_1", False)])
def test_prepaid_and_canceled_renewal_have_no_scheduled_charge(subscription_id, auto_renewal):
    plan = _Plan(subscription_id=subscription_id, auto_renewal=auto_renewal)
    plan.plan_name = "s5"
    plan.expires_at = datetime.utcnow() + timedelta(days=30)
    stats = asyncio.run(get_billing_stats(_ctx(), StatsDB([], plan)))
    assert stats.next_charge == 0
    assert stats.next_charge_at is None


def test_legacy_recurring_stats_do_not_overwrite_months_with_us():
    plan = _Plan(subscription_id="sub_1", auto_renewal=True)
    plan.plan_name = "s5"
    plan.expires_at = datetime.utcnow() + timedelta(days=365)
    invoice = SimpleNamespace(kind="subscription", amount=37800, plan_name="s5", period_months=12,
                              paid_at=datetime.utcnow() - timedelta(days=1))
    stats = asyncio.run(get_billing_stats(_ctx(), StatsDB([invoice], plan)))
    assert stats.next_charge > 0
    assert stats.next_charge_at == plan.expires_at.isoformat()
    assert stats.months_with_us == 0


def test_prepaid_export_separates_net_vat_and_paid_gross(monkeypatch):
    async def preferences(*args):
        return 'en', 'EUR'
    monkeypatch.setattr(billing_router, '_studio_prefs', preferences)
    invoice = SimpleNamespace(id=1, studio_id=1, kind='subscription', order_id='cs_1',
        stripe_invoice_id=None, status='paid', amount=5445, tax_amount=945,
        tax_rate_percent=21, tax_outcome='taxable', tax_jurisdiction='CZ',
        plan_name='s5', period_months=1, paid_at=datetime.utcnow(), payment_method='card')
    async def export():
        response = await billing_router.export_invoices_csv(None, None, _ctx(), StatsDB([invoice], None))
        chunks = [chunk async for chunk in response.body_iterator]
        return ''.join(chunk.decode('utf-8') if isinstance(chunk, bytes) else chunk for chunk in chunks)
    csv = asyncio.run(export())
    assert '45.00' in csv
    assert '9.45' in csv
    assert '54.45' in csv
    assert '63.90' not in csv


def test_legacy_prepaid_without_frozen_parties_requires_fiscal_review():
    invoice = SimpleNamespace(kind='subscription', order_id='cs_1', stripe_invoice_id=None,
                              status='paid', pdf_url=None, hosted_invoice_url=None)
    with pytest.raises(HTTPException) as error:
        asyncio.run(billing_router.get_receipt(1, _ctx(), _DB([invoice])))
    assert error.value.status_code == 409
    assert error.value.detail['code'] == 'billing.tax_document_review'
