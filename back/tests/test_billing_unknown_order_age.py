"""Unresolved orders cannot rely on a Stripe key past its retention window."""
import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace as NS

import pytest
from fastapi import HTTPException

from routers.billing import prepaid
from services import stripe_billing


def _order(start):
    return NS(id=73, studio_id=4, user_id=8, plan_name='s2', period_months=1,
        order_id='prepaid:original-fingerprint:order', amount=1750,
        billing_details_snapshot={
            'item': {'billing_mode': 'subscription'},
            'promo': {'amount_before_promo': 2500, 'net_amount': 1750,
                'promo_code': 'WELCOME30', 'promo_discount_percent': 30,
                'promo_discount_amount': 750},
            'checkout': {'request_started_at': start}})


@pytest.mark.parametrize('start', [None, 'invalid-date',
    (datetime.now(timezone.utc)-timedelta(hours=23, minutes=1)).isoformat(),
    (datetime.now(timezone.utc)-timedelta(days=2)).isoformat(),
    (datetime.now(timezone.utc)+timedelta(hours=1)).isoformat()])
def test_old_or_unverifiable_unknown_attempt_never_calls_stripe_create(monkeypatch, start):
    calls = []
    async def create(*args, **kwargs):
        calls.append((args,kwargs))
        return NS(id='unexpected-session')
    monkeypatch.setattr(stripe_billing, 'create_period_checkout', create)
    async def run():
        with pytest.raises(HTTPException) as err:
            await prepaid._create_stripe_session(_order(start), 'customer', NS(ui_mode='elements'),
                NS(), 'original-fingerprint', 'return', 'cancel')
        assert err.value.status_code == 409
        assert err.value.detail['code'] == 'billing.payment_processing'
    asyncio.run(run())
    assert calls == []


def test_recent_unknown_attempt_can_recover_the_same_frozen_request(monkeypatch):
    calls = []
    async def create(*args, **kwargs):
        calls.append((args,kwargs))
        return NS(id='recovered-session')
    monkeypatch.setattr(stripe_billing, 'create_period_checkout', create)
    async def run():
        session = await prepaid._create_stripe_session(
            _order((datetime.now(timezone.utc)-timedelta(minutes=2)).isoformat()),
            'customer', NS(ui_mode='elements'), NS(), 'original-fingerprint', 'return', 'cancel')
        assert session.id == 'recovered-session'
    asyncio.run(run())
    assert len(calls) == 1
    assert calls[0][0][1] == 1750
    assert calls[0][0][3]['profile_hash'] == 'original-fingerprint'
    assert calls[0][1]['idempotency_key'] == 'prepaid:73'
