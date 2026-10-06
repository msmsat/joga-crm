"""Current checkout payer tax facts and separate webhook trust; no network or DB."""
import asyncio
import hashlib
import hmac
import importlib.util
import json
import time
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace as NS

import pytest
from fastapi import HTTPException

from routers.billing import checkout, prepaid
from schemas.settings.billing import CheckoutRequest, CheckoutResponse
from services import billing_pricing, billing_tax, billing_document_snapshot, tax_policy, tax_rates
from test_billing_fiscal_profile import _user


@pytest.fixture
def confirmed_seller(monkeypatch):
    values = {
        "BILLING_TAX_MODE": "manual", "BILLING_TAX_POLICY_CONFIRMED": tax_policy.RULESET_VERSION,
        "BILLING_SELLER_COUNTRY": "CZ", "BILLING_SELLER_VAT_REGISTERED": "true",
        "BILLING_SELLER_VAT_ID": "CZ12345678", "BILLING_EU_B2C_SCHEME": "review",
        "BILLING_NON_EU_SUPPLY_CONFIRMED": "false", "BILLING_SELLER_LEGAL_NAME": "Test Seller",
        "BILLING_SELLER_REGISTRATION_ID": "12345678", "BILLING_SELLER_ADDRESS_LINE1": "Seller 1",
        "BILLING_SELLER_ADDRESS_POSTAL_CODE": "11000", "BILLING_SELLER_ADDRESS_CITY": "Praha",
    }
    for key, value in values.items():
        monkeypatch.setenv(key, value)
    async def catalogue():
        return {"CZ:21:vat:exclusive": "txr_fake_cz21"}
    monkeypatch.setattr(tax_rates, "_catalogue", catalogue)


def _checkout_setup(monkeypatch, first_owner, payer):
    observed = {}
    plan = NS(studio_id=7, stripe_subscription_id=None, billing_mode="subscription", status="none",
              plan_name="none", expires_at=None)
    async def execute(_query):
        return NS(scalar_one_or_none=lambda: None, scalars=lambda: NS(first=lambda: first_owner))
    db = NS(execute=execute)
    async def get_plan(*_args):
        return plan
    async def ensure_customer(_db, ctx, _plan):
        observed["customer_buyer"] = checkout.billing_profile(ctx.user).model_dump()
        return "cus_fake"
    async def noop(*_args):
        pass
    async def create_payment(_db, _ctx, _plan, _customer, _body, tax, profile, *_args):
        observed["tax"] = tax
        price = billing_pricing.period_price("s5", 1, False, True)
        observed["snapshot"] = billing_document_snapshot.purchase_snapshot(
            profile, tax, "s5", 1, price.net_amount, "eur", datetime(2026, 10, 2), datetime(2026, 11, 2))
        return CheckoutResponse(amount_due=observed["snapshot"]["tax"]["total_minor"], currency="EUR")
    monkeypatch.setattr(checkout.stripe_billing, "configured", lambda: True)
    monkeypatch.setattr(checkout, "_get_or_create_plan", get_plan)
    monkeypatch.setattr(checkout, "_ensure_customer", ensure_customer)
    monkeypatch.setattr(checkout, "_forget_dead_subscription", noop)
    monkeypatch.setattr(billing_tax, "sync_customer_exempt", noop)
    monkeypatch.setattr(prepaid, "create_payment", create_payment)
    return db, NS(studio_id=7, user=payer), observed


def _purchase(db, ctx):
    fn = getattr(checkout.create_checkout, "__wrapped__", checkout.create_checkout)
    return asyncio.run(fn(None, CheckoutRequest(plan="s5", period_months=1), ctx, db))


def test_foreign_b2c_payer_cannot_inherit_first_owners_domestic_tax(confirmed_seller, monkeypatch):
    first = _user(id=1, billing_country="CZ")
    payer = _user(id=2, billing_country="DE", billing_vat_id=None, billing_vat_verified=False)
    db, ctx, observed = _checkout_setup(monkeypatch, first, payer)
    with pytest.raises(HTTPException) as error:
        _purchase(db, ctx)
    assert error.value.status_code == 409
    assert "snapshot" not in observed


@pytest.mark.parametrize("first,payer,outcome,tax_minor", [
    (_user(id=1, billing_country="DE", billing_vat_id="DE123456789"),
     _user(id=2, billing_country="CZ", billing_vat_id=None, billing_vat_verified=False), "taxable", 588),
    (_user(id=1, billing_country="CZ"),
     _user(id=2, billing_country="DE", billing_vat_id="DE123456789"), "reverse_charge", 0),
])
def test_checkout_tax_and_fiscal_buyer_match_current_payer(confirmed_seller, monkeypatch, first, payer, outcome, tax_minor):
    db, ctx, observed = _checkout_setup(monkeypatch, first, payer)
    _purchase(db, ctx)
    assert observed["tax"].decision.outcome == outcome
    assert observed["snapshot"]["tax"]["tax_minor"] == tax_minor
    assert observed["snapshot"]["buyer"]["country"] == observed["customer_buyer"]["country"] == payer.billing_country
    assert observed["snapshot"]["buyer"]["vat_id"] == payer.billing_vat_id


@pytest.mark.parametrize("first,payer,outcome,tax_minor", [
    (_user(id=1, billing_country="CZ"), _user(id=2, billing_country="DE", billing_vat_id=None, billing_vat_verified=False), "requires_review", 0),
    (_user(id=1, billing_country="DE", billing_vat_id="DE123456789"), _user(id=2, billing_country="CZ"), "taxable", 588),
])
def test_preview_uses_same_current_payer_as_payment(confirmed_seller, monkeypatch, first, payer, outcome, tax_minor):
    db, ctx, _ = _checkout_setup(monkeypatch, first, payer)
    fn = getattr(checkout.preview_checkout, "__wrapped__", checkout.preview_checkout)
    quote = asyncio.run(fn(None, "s5", 1, False, ctx, db))
    assert quote.net_amount == 2800 and quote.promo_code == "WELCOME30"
    assert quote.tax_outcome == outcome and quote.tax_amount == tax_minor


def test_unattended_billing_keeps_existing_owner_profile_fallback(confirmed_seller, monkeypatch):
    first = _user(billing_country="DE", billing_vat_id="DE123456789")
    db, _, _ = _checkout_setup(monkeypatch, first, _user(id=2, billing_country="CZ"))
    result = asyncio.run(billing_tax.application(db, 7, "subscription"))
    assert result.decision.outcome == "reverse_charge"


def _secret_module(monkeypatch, billing_secret):
    monkeypatch.setattr("dotenv.load_dotenv", lambda *args, **kwargs: False)
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", "whsec_checkout_only_test")
    if billing_secret is None:
        monkeypatch.delenv("STRIPE_BILLING_WEBHOOK_SECRET", raising=False)
    else:
        monkeypatch.setenv("STRIPE_BILLING_WEBHOOK_SECRET", billing_secret)
    path = Path(__file__).resolve().parents[1] / "services/stripe_billing.py"
    spec = importlib.util.spec_from_file_location("billing_secret_regression", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _signed(secret):
    stamp = str(int(time.time()))
    body = json.dumps({"id": "evt_test", "object": "event", "type": "ignored.event",
                       "data": {"object": {"id": "obj_test"}}}).encode()
    digest = hmac.new(secret.encode(), stamp.encode() + b"." + body, hashlib.sha256).hexdigest()
    return body, "t=" + stamp + ",v1=" + digest


def test_absent_billing_secret_rejects_valid_checkout_signature(monkeypatch):
    module = _secret_module(monkeypatch, None)
    body, signature = _signed("whsec_checkout_only_test")
    assert module.parse_webhook(body, signature) is None


def test_billing_secret_accepts_only_its_own_signature(monkeypatch):
    module = _secret_module(monkeypatch, "whsec_billing_only_test")
    assert module.parse_webhook(*_signed("whsec_checkout_only_test")) is None
    assert module.parse_webhook(*_signed("whsec_billing_only_test")).id == "evt_test"
