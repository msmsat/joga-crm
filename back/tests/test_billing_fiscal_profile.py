"""Legal parties, purchase snapshots and paid-only fiscal queue; no live I/O."""
import asyncio
import importlib.util
import io
from copy import deepcopy
from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace as NS
from pathlib import Path

import pytest
import stripe
from fastapi import HTTPException
from pydantic import ValidationError

from models import BillingInvoice, BillingTaxDocument
from routers.billing.checkout import billing_profile
from schemas.settings.billing import BillingProfileUpdate
from services import billing_document_snapshot as snapshots
from services.tax_policy import TaxDecision
from services.tax_rates import TaxApplication, automatic_application


@pytest.fixture
def seller(monkeypatch):
    for suffix, value in {
        "LEGAL_NAME": "Test Legal Seller", "REGISTRATION_ID": "12345678",
        "VAT_ID": "CZ12345678", "VAT_REGISTERED": "true", "COUNTRY": "CZ",
        "ADDRESS_LINE1": "Test Street 1", "ADDRESS_POSTAL_CODE": "11000", "ADDRESS_CITY": "Praha",
    }.items():
        monkeypatch.setenv(f"BILLING_SELLER_{suffix}", value)


def _user(**overrides):
    fields = dict(id=1, email="test@example.invalid", billing_legal_name="Test Buyer",
                  billing_registration_id="87654321", billing_country="CZ", billing_line1="Buyer 1",
                  billing_line2=None, billing_postal_code="11000", billing_city="Praha",
                  billing_vat_id="CZ87654321", billing_vat_verified=True)
    fields.update(overrides)
    return NS(**fields)


def _tax():
    return TaxApplication(False, ("txr_fake21",), "none", TaxDecision(
        outcome="taxable", rate_percent=Decimal("21"), jurisdiction="CZ",
        basis="domestic_standard_rate", evidence={"vat_state": "verified"},
    ))


def _snapshot(user=None):
    return snapshots.purchase_snapshot(billing_profile(user or _user()), _tax(), "s5", 1,
        4500, "eur", datetime(2026, 10, 2), datetime(2026, 11, 2))


def test_profile_exposes_explicit_legal_buyer_identity():
    profile = billing_profile(_user())
    assert profile.legal_name == "Test Buyer" and profile.registration_id == "87654321"
    assert profile.filled is True
    assert billing_profile(_user(billing_legal_name=None)).filled is False


def test_legacy_profile_never_invents_legal_name_from_studio():
    user = _user()
    del user.billing_legal_name
    del user.billing_registration_id
    assert billing_profile(user).legal_name is None
    assert billing_profile(user).filled is False


def test_form_trims_legal_fields_and_preserves_international_registration_ids():
    profile = BillingProfileUpdate(country="CZ", line1="Buyer 1", postal_code="11000", city="Praha",
                                   legal_name=" Test Buyer ", registration_id=" AB-123/456 ")
    assert profile.legal_name == "Test Buyer" and profile.registration_id == "AB-123/456"
    assert profile.vat_id is None
    assert BillingProfileUpdate(country="CZ", line1="Buyer 1", postal_code="11000", city="Praha",
                                legal_name="   ", registration_id=" ").legal_name is None


@pytest.mark.parametrize("field,length", [("legal_name", 201), ("registration_id", 41)])
def test_legal_fields_have_storage_bounds(field, length):
    with pytest.raises(ValidationError):
        BillingProfileUpdate(country="CZ", line1="Buyer 1", postal_code="11000", city="Praha",
                             **{field: "x" * length})


def test_save_profile_persists_legal_identity_without_stripe(monkeypatch):
    from routers.billing.router import save_billing_profile
    user, commits = _user(billing_vat_id=None), []
    async def commit(): commits.append(True)
    body = BillingProfileUpdate(country="CZ", line1="Buyer 2", postal_code="11000", city="Praha",
                                legal_name="Legal Buyer 2", registration_id="ID-2")
    profile = asyncio.run(save_billing_profile(body, user, NS(commit=commit)))
    assert user.billing_legal_name == profile.legal_name == "Legal Buyer 2"
    assert user.billing_registration_id == "ID-2" and commits == [True]


@pytest.mark.parametrize("ui_mode", ["hosted", "elements"])
def test_new_purchase_requires_legal_name_before_mutation(monkeypatch, ui_mode):
    from routers.billing import checkout as route
    from schemas.settings.billing import CheckoutRequest
    monkeypatch.setattr(route.stripe_billing, "configured", lambda: True)
    monkeypatch.setattr(route.stripe_billing, "elements_publishable_key", lambda: "pk_test_fake")
    async def forbidden(*args): pytest.fail("Cannot create a plan/customer/payment before legal buyer identity")
    monkeypatch.setattr(route, "_get_or_create_plan", forbidden)
    fn = getattr(route.create_checkout, "__wrapped__", route.create_checkout)
    with pytest.raises(HTTPException) as error:
        asyncio.run(fn(None, CheckoutRequest(plan="s5", period_months=1, ui_mode=ui_mode),
                       NS(user=_user(billing_legal_name=None), studio_id=7), None))
    assert error.value.detail["code"] == "billing.billing_profile_required"


def test_customer_uses_legal_buyer_name_instead_of_studio_display_name(monkeypatch):
    from routers.billing import checkout as route
    captured = {}
    async def execute(_query): return NS(scalar_one=lambda: NS(name="Studio Display Name", email=None))
    async def commit(): pass
    async def ensure(_existing, **values): captured.update(values); return "cus_fake"
    monkeypatch.setattr(route.stripe_billing, "ensure_customer", ensure)
    plan = NS(stripe_customer_id=None)
    asyncio.run(route._ensure_customer(NS(execute=execute, commit=commit),
        NS(user=_user(billing_vat_id=None), studio_id=7), plan))
    assert captured["name"] == "Test Buyer" and captured["line1"] == "Buyer 1"


def test_purchase_freezes_seller_buyer_tax_and_period_before_payment(seller, monkeypatch):
    user = _user()
    snapshot = _snapshot(user)
    original = deepcopy(snapshot)
    user.billing_legal_name, user.billing_vat_verified = "Changed Buyer", False
    monkeypatch.setenv("BILLING_SELLER_LEGAL_NAME", "Changed Seller")
    assert snapshot == original
    assert snapshot["seller"]["name"] == "Test Legal Seller"
    assert snapshot["buyer"]["legal_name"] == "Test Buyer" and snapshot["buyer"]["vat_verified"] is True
    assert snapshot["item"]["period_months"] == 1
    assert snapshot["tax"]["net_minor"] == 4500 and snapshot["tax"]["tax_minor"] == 945
    assert snapshot["tax"]["total_minor"] == 5445 and snapshot["tax"]["rate_percent"] == 21


def test_automatic_tax_snapshot_does_not_invent_rate_or_amount(seller):
    snapshot = snapshots.purchase_snapshot(billing_profile(_user()), automatic_application(), "s5", 1,
        4500, "eur", datetime(2026, 10, 2), datetime(2026, 11, 2))
    assert snapshot["tax"]["rate_percent"] is None
    assert snapshot["tax"]["tax_minor"] is None and snapshot["tax"]["total_minor"] is None


@pytest.mark.parametrize("suffix", ["LEGAL_NAME", "REGISTRATION_ID", "VAT_ID", "ADDRESS_LINE1", "ADDRESS_POSTAL_CODE", "ADDRESS_CITY"])
def test_missing_seller_identity_blocks_payment_configuration(seller, monkeypatch, suffix):
    monkeypatch.delenv(f"BILLING_SELLER_{suffix}")
    with pytest.raises(HTTPException) as error: _snapshot()
    assert error.value.status_code == 409 and error.value.detail["code"] == "billing.seller_details_required"


def test_tax_document_model_has_paid_order_unique_identity_and_retention():
    columns = BillingTaxDocument.__table__.c
    assert columns.invoice_id.unique is True and columns.correction_snapshot.nullable is True
    assert next(iter(columns.invoice_id.foreign_keys)).ondelete == "RESTRICT"
    assert BillingInvoice.__table__.c.billing_details_snapshot.nullable is True


def test_migration_sql_extends_current_head_without_rewriting_history():
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    path = Path(__file__).resolve().parents[1] / "migrations/versions/2ad908ed7410_paid_local_tax_documents.py"
    spec = importlib.util.spec_from_file_location("fiscal_revision", path)
    revision = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(revision)
    assert revision.down_revision == "f6246f517716"
    output = io.StringIO()
    context = MigrationContext.configure(dialect_name="postgresql", opts={"as_sql": True, "output_buffer": output})
    with Operations.context(context): revision.upgrade()
    sql = output.getvalue()
    assert "billing_details_snapshot JSONB" in sql and "correction_snapshot JSONB" in sql
    assert "UNIQUE (invoice_id)" in sql and "ON DELETE RESTRICT" in sql
    assert not any(line.lstrip().startswith(("UPDATE ", "DELETE FROM ")) for line in sql.splitlines())


def test_paid_handler_queues_before_commit_with_actual_tax_date_and_access(seller, monkeypatch):
    from test_billing_prepaid import _invoice, _plan, _session, _DB
    from routers.billing import prepaid_webhook as route
    from services import billing_tax_documents as docs
    invoice, plan, session = _invoice(), _plan("free_trial", "trial"), _session()
    invoice.billing_details_snapshot = _snapshot()
    original = deepcopy(invoice.billing_details_snapshot)
    db, order, queued = _DB(invoice, plan), [], []
    async def fetch(_id): return session
    async def nothing(*args): pass
    async def commit(): order.append("commit")
    async def queue(_db, paid, *, payment_details):
        assert paid.status == "paid" and paid.amount == 5445
        order.append("queue"); queued.append(payment_details)
    monkeypatch.setattr(route.stripe_billing, "fetch_checkout_session", fetch)
    monkeypatch.setattr("services.platform_fee.record_revenue", nothing)
    monkeypatch.setattr("services.billing_mail.send_receipt", nothing)
    monkeypatch.setattr("services.billing_mail.send_platform_income", nothing)
    monkeypatch.setattr(docs, "queue_document", queue)
    db.commit = commit
    actual = int(datetime(2026, 10, 1, 23, 30, tzinfo=timezone.utc).timestamp())
    asyncio.run(route.handle_session(db, "checkout.session.completed", session,
                                    now=datetime(2026, 10, 2, 12), event_created=actual))
    assert order == ["queue", "commit"] and queued[0]["paid_at"] == "2026-10-01T23:30:00"
    assert queued[0]["total_minor"] == 5445 and queued[0]["net_minor"] == 4500
    assert invoice.billing_details_snapshot == original
    asyncio.run(route.handle_session(db, "checkout.session.completed", session, event_created=actual))
    assert len(queued) == 1


def test_payment_date_reconciliation_uses_capture_event_not_charge_creation(monkeypatch):
    from services.billing_payment_dates import received_at
    event = NS(id="evt_fake", type="payment_intent.succeeded", created=1790897400,
               data={"object": NS(id="pi_fake", status="succeeded")})
    monkeypatch.setattr(stripe.Event, "list", lambda **kwargs: NS(data=[event], has_more=False))
    monkeypatch.setattr(stripe.PaymentIntent, "retrieve", lambda *args, **kwargs: pytest.fail("Charge.created is not capture"))
    assert asyncio.run(received_at(NS(payment_intent="pi_fake"))) == datetime.utcfromtimestamp(1790897400)


def test_missing_success_event_leaves_tax_date_unknown(monkeypatch):
    from services.billing_payment_dates import received_at
    event = NS(id="evt_other", type="payment_intent.succeeded", created=1790897400,
               data={"object": NS(id="pi_other", status="succeeded")})
    monkeypatch.setattr(stripe.Event, "list", lambda **kwargs: NS(data=[event], has_more=False))
    assert asyncio.run(received_at(NS(payment_intent="pi_fake"))) is None


def test_delayed_unpaid_completed_event_never_sets_payment_tax_date(seller, monkeypatch):
    from test_billing_prepaid import _invoice, _plan, _session, _DB
    from routers.billing import prepaid_webhook as route
    from services import billing_tax_documents as docs
    from services import billing_payment_dates as dates
    invoice, plan, current = _invoice(), _plan("free_trial", "trial"), _session()
    invoice.billing_details_snapshot = _snapshot()
    original = _session(payment_status="unpaid")
    seen, queued = [], []
    async def fetch(_id): return current
    async def actual(_session, **values): seen.append(values); return None
    async def nothing(*args): pass
    async def queue(_db, _invoice, *, payment_details): queued.append(payment_details)
    monkeypatch.setattr(route.stripe_billing, "fetch_checkout_session", fetch)
    monkeypatch.setattr(dates, "received_at", actual)
    monkeypatch.setattr("services.platform_fee.record_revenue", nothing)
    monkeypatch.setattr("services.billing_mail.send_receipt", nothing)
    monkeypatch.setattr("services.billing_mail.send_platform_income", nothing)
    monkeypatch.setattr(docs, "queue_document", queue)
    asyncio.run(route.handle_session(_DB(invoice, plan), "checkout.session.completed", original, event_created=1790800000))
    assert invoice.status == "paid" and plan.status == "active"
    assert seen[0]["event_created"] is None and queued[0]["paid_at"] is None


def test_refund_date_is_refund_event_or_refund_creation_never_charge_creation():
    from services.billing_payment_dates import reversal_at
    charge = NS(created=100, refunds=NS(data=[NS(created=200, status="succeeded"), NS(created=300, status="pending")]))
    assert reversal_at(charge) == datetime.utcfromtimestamp(200)
    assert reversal_at(charge, event_created=400) == datetime.utcfromtimestamp(400)
    assert reversal_at(NS(created=100)) is None


@pytest.mark.parametrize("reason,expected", [("full_refund", 1), (None, 0)])
def test_only_full_refund_queues_fiscal_correction(seller, monkeypatch, reason, expected):
    from test_billing_prepaid import _invoice, _plan, _DB
    from routers.billing import prepaid_webhook as route
    from services import billing_tax_documents as docs
    invoice, plan, queued = _invoice(), _plan(), []
    invoice.status, invoice.amount, invoice.billing_details_snapshot = "paid", 5445, _snapshot()
    db = _DB(invoice, plan)
    async def execute(query):
        entity = query.column_descriptions[0]["entity"]
        return NS(scalar_one_or_none=lambda: invoice if entity is BillingInvoice else plan,
                  scalars=lambda: NS(all=lambda: []))
    async def nothing(*args): pass
    async def queue(_db, paid, **values): queued.append(values)
    db.execute = execute
    monkeypatch.setattr("services.platform_fee.record_revenue", nothing)
    monkeypatch.setattr(docs, "queue_correction", queue)
    at = datetime(2026, 10, 3)
    asyncio.run(route.reverse_prepaid(db, invoice, refunded_at=at, fiscal_reason=reason))
    assert len(queued) == expected
    if expected: assert queued[0] == {"refunded_at": at, "reason": "full_refund"}
