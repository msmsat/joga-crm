"""Deployment checks must inspect the legal release and the current payment mode."""
import asyncio
import shutil
from pathlib import Path
from types import SimpleNamespace as NS

import pytest
import stripe
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.testclient import TestClient

import legal
from scripts import preflight
from services import legal_pages, stripe_connect


@pytest.fixture(autouse=True)
def diagnostics(monkeypatch):
    monkeypatch.setattr(preflight, "_ERRORS", [])
    monkeypatch.setattr(preflight, "_WARNINGS", [])
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_not_real")
    monkeypatch.setenv("STRIPE_PUBLISHABLE_KEY", "pk_test_not_real")
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://test:test@db.example/app")
    monkeypatch.setenv("TEST_DATABASE_URL", "postgresql+asyncpg://test:test@db.example/tests")
    monkeypatch.setenv("BACKEND_URL", "https://api.velora.test")


@pytest.fixture
def legal_release(tmp_path, monkeypatch):
    source_docs = Path(__file__).resolve().parents[1] / "static"
    source = tmp_path / "static"
    bundle = tmp_path / "assets/legal"
    source.mkdir()
    for filename in legal_pages.LEGAL_FILENAMES:
        shutil.copyfile(source_docs / filename, source / filename)
    monkeypatch.setattr(legal_pages, "_BASE", tmp_path)
    # Model /app/scripts/preflight.py plus its persistent /app/static mount.
    monkeypatch.setattr(preflight, "__file__", str(tmp_path / "scripts/preflight.py"))

    def publish_bundle():
        bundle.mkdir(parents=True)
        for filename in legal_pages.LEGAL_FILENAMES:
            shutil.copyfile(source_docs / filename, bundle / filename)

    def client():
        app = FastAPI()
        legal_pages.register_legal_pages(app)
        app.mount("/static", StaticFiles(directory=str(source)))
        return TestClient(app)

    return NS(source=source, bundle=bundle, publish_bundle=publish_bundle, client=client)


def test_current_bundle_ignores_stale_static_volume_in_http_and_preflight(legal_release):
    legal_release.publish_bundle()
    for filename in ("terms.html", "privacy.html", "cookies.html"):
        path = legal_release.source / filename
        path.write_text(path.read_text(encoding="utf-8").replace(legal.TERMS_VERSION, "stale-version"),
                        encoding="utf-8")
    preflight.check_legal_docs()
    assert preflight._ERRORS == []
    assert legal_pages.legal_document_root() == legal_release.bundle
    with legal_release.client() as client:
        for filename in ("terms.html", "privacy.html", "cookies.html"):
            response = client.get("/static/" + filename)
            assert response.status_code == 200
            assert legal.TERMS_VERSION in response.text
            assert "stale-version" not in response.text


def test_stale_bundle_is_a_blocker_even_if_static_volume_is_current(legal_release):
    legal_release.publish_bundle()
    path = legal_release.bundle / "privacy.html"
    path.write_text(path.read_text(encoding="utf-8").replace(legal.TERMS_VERSION, "stale-version"),
                    encoding="utf-8")
    preflight.check_legal_docs()
    assert len(preflight._ERRORS) == 1
    assert "privacy.html" in preflight._ERRORS[0]
    with legal_release.client() as client:
        response = client.get("/static/privacy.html")
        assert response.status_code == 200
        assert "stale-version" in response.text
        assert legal.TERMS_VERSION not in response.text


def test_missing_bundle_document_stays_a_blocker_and_http_404(legal_release):
    legal_release.publish_bundle()
    (legal_release.bundle / "cookies.html").unlink()
    preflight.check_legal_docs()
    assert len(preflight._ERRORS) == 1
    assert "cookies.html" in preflight._ERRORS[0]
    with legal_release.client() as client:
        assert client.get("/static/cookies.html").status_code == 404


def test_absent_bundle_uses_current_source_for_http_and_preflight(legal_release):
    preflight.check_legal_docs()
    assert preflight._ERRORS == []
    assert legal_pages.legal_document_root() == legal_release.source
    with legal_release.client() as client:
        assert legal.TERMS_VERSION in client.get("/static/terms.html").text


def test_explicit_legal_root_arguments_keep_the_same_precedence(legal_release):
    resolve = legal_pages.legal_document_root
    assert resolve(bundle_dir=legal_release.bundle, source_dir=legal_release.source) == legal_release.source
    legal_release.publish_bundle()
    assert resolve(bundle_dir=legal_release.bundle, source_dir=legal_release.source) == legal_release.bundle


@pytest.mark.parametrize("environment", ["production", "prod"])
def test_production_aliases_accept_live_keys_without_a_test_database(monkeypatch, environment):
    monkeypatch.setenv("APP_ENV", environment)
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_live_not_real")
    monkeypatch.delenv("TEST_DATABASE_URL", raising=False)
    preflight.check_environment_split()
    assert preflight._ERRORS == []
    assert preflight._WARNINGS == []


@pytest.mark.parametrize("environment", ["development", "dev"])
def test_development_aliases_still_block_live_keys(monkeypatch, environment):
    monkeypatch.setenv("APP_ENV", environment)
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_live_not_real")
    preflight.check_environment_split()
    assert preflight._ERRORS
    assert any("Stripe" in error for error in preflight._ERRORS)


def test_production_still_blocks_test_database_matching_the_app(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("TEST_DATABASE_URL", "postgresql://test:test@db.example:5432/APP")
    preflight.check_environment_split()
    assert any("одна и та же база" in error for error in preflight._ERRORS)


def test_manual_tax_does_not_read_stripe_tax_registrations_or_account(monkeypatch):
    monkeypatch.setenv("BILLING_TAX_MODE", "manual")
    monkeypatch.setattr(stripe_connect, "configured", lambda: True)

    def unexpected_call(*args, **kwargs):
        pytest.fail("Manual tax readiness must not depend on Stripe Tax registrations")

    monkeypatch.setattr(stripe.tax.Registration, "list", unexpected_call)
    monkeypatch.setattr(stripe.Account, "retrieve", unexpected_call)
    asyncio.run(preflight.check_tax_registrations())
    assert preflight._ERRORS == []
    assert preflight._WARNINGS == []


def test_automatic_tax_still_requires_a_stripe_tax_registration(monkeypatch):
    monkeypatch.setenv("BILLING_TAX_MODE", "stripe_auto")
    monkeypatch.setattr(stripe_connect, "configured", lambda: True)
    calls = []

    def registrations(**kwargs):
        calls.append("registrations")
        return NS(data=[])

    def account():
        calls.append("account")
        return NS(country="CZ")

    monkeypatch.setattr(stripe.tax.Registration, "list", registrations)
    monkeypatch.setattr(stripe.Account, "retrieve", account)
    asyncio.run(preflight.check_tax_registrations())
    assert calls == ["registrations", "account"]
    assert any("ни одной активной" in error for error in preflight._ERRORS)


def test_unavailable_paypal_warning_describes_one_time_payments(monkeypatch):
    monkeypatch.setenv("BILLING_PAYMENT_METHOD_CONFIGURATION", "pmc_fake")
    monkeypatch.setenv("BILLING_CHECKOUT_LOGO_FILE", "file_fake")
    monkeypatch.setenv("BILLING_PAYPAL_ENABLED", "false")
    monkeypatch.setattr(stripe_connect, "configured", lambda: True)
    methods = {
        method: NS(available=method not in ("paypal", "link"),
                   display_preference=NS(value="off" if method == "link" else "on"))
        for method in ("card", "paypal", "apple_pay", "google_pay", "link")
    }
    configuration = NS(livemode=False, active=True, **methods)
    monkeypatch.setattr(stripe.PaymentMethodConfiguration, "retrieve", lambda _: configuration)
    asyncio.run(preflight.check_billing_checkout())
    assert preflight._ERRORS == []
    paypal = next(message for message in preflight._WARNINGS if "PayPal" in message)
    assert "recurring" not in paypal
    assert "подписок" not in paypal
