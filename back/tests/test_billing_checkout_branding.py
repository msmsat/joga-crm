import asyncio
from types import SimpleNamespace

import pytest
import stripe

from services import stripe_billing as billing
from services import stripe_checkout_branding as branding


def test_subscription_checkout_uses_velora_configuration_and_branding(monkeypatch):
    monkeypatch.setenv("BILLING_TAX_MODE", "stripe_auto")
    monkeypatch.setenv("BILLING_PAYMENT_METHOD_CONFIGURATION", "pmc_velora")
    monkeypatch.setenv("BILLING_CHECKOUT_LOGO_FILE", "file_velora")
    seen = {}

    def create(**kwargs):
        seen.update(kwargs)
        return SimpleNamespace(id="cs_test", url="https://checkout.stripe.com/test")

    monkeypatch.setattr(stripe.checkout.Session, "create", create)
    asyncio.run(billing.create_subscription_checkout("cus_test", "price_test", {}, "success", "cancel"))
    assert seen["payment_method_configuration"] == "pmc_velora"
    assert "payment_method_types" not in seen
    assert seen["branding_settings"] == {
        "display_name": "Velora", "background_color": "#121212", "button_color": "#FCAE91",
        "font_family": "inter", "border_style": "rounded",
        "logo": {"type": "file", "file": "file_velora"},
    }
    assert seen["mode"] == "subscription"
    assert seen["customer_update"] == {"address": "auto", "name": "auto"}


def test_unconfigured_installation_can_still_pay_by_card(monkeypatch):
    monkeypatch.delenv("BILLING_PAYMENT_METHOD_CONFIGURATION", raising=False)
    monkeypatch.delenv("BILLING_CHECKOUT_LOGO_FILE", raising=False)
    assert branding.payment_method_params() == {"payment_method_types": ["card"]}
    assert "logo" not in branding.branding_settings()


def test_manual_checkout_without_tax_decision_never_calls_stripe(monkeypatch):
    monkeypatch.setenv("BILLING_TAX_MODE", "manual")
    called = []
    monkeypatch.setattr(stripe.checkout.Session, "create", lambda **kwargs: called.append(kwargs))
    with pytest.raises(billing.TaxDecisionMissing):
        asyncio.run(billing.create_subscription_checkout("cus_test", "price_test", {}, "success", "cancel"))
    assert called == []


@pytest.mark.parametrize("legacy_flag", [None, "false", "true", "1", "yes"])
def test_invoice_payment_settings_exclude_paypal_even_with_stale_opt_in(monkeypatch, legacy_flag):
    if legacy_flag is None:
        monkeypatch.delenv("BILLING_PAYPAL_ENABLED", raising=False)
    else:
        monkeypatch.setenv("BILLING_PAYPAL_ENABLED", legacy_flag)
    settings = billing.invoice_payment_settings()
    assert settings["payment_method_types"] == ["card", "customer_balance"]
    assert settings["payment_method_options"]["customer_balance"]["funding_type"] == "bank_transfer"
    assert branding.paypal_invoices_enabled() is False


def test_configuration_dry_run_plans_revolut_without_writing_stripe(monkeypatch):
    from scripts import configure_billing_checkout as setup

    monkeypatch.setattr(stripe.PaymentMethodConfiguration, "list", lambda **kwargs: SimpleNamespace(data=[]))

    def unexpected_write(*args, **kwargs):
        pytest.fail("Dry run must not change Stripe objects or upload branding")

    monkeypatch.setattr(stripe.PaymentMethodConfiguration, "create", unexpected_write)
    monkeypatch.setattr(stripe.PaymentMethodConfiguration, "modify", unexpected_write)
    monkeypatch.setattr(stripe.Account, "modify", unexpected_write)
    monkeypatch.setattr(setup, "upload_asset", unexpected_write)
    result = setup.configure(False)
    assert result["configuration"] is None
    assert result["requested_methods"] == {
        "card": "on", "paypal": "off", "apple_pay": "on", "google_pay": "on",
        "revolut_pay": "on", "link": "off",
    }


@pytest.mark.parametrize("paypal_available", [True, False])
@pytest.mark.parametrize("revolut_available", [True, False])
def test_configuration_survives_dashboard_only_account_branding(monkeypatch, paypal_available, revolut_available):
    from scripts import configure_billing_checkout as setup

    methods = {
        name: SimpleNamespace(
            available=(paypal_available if name == "paypal" else
                       revolut_available if name == "revolut_pay" else name != "link"),
            display_preference=SimpleNamespace(value="off" if name in ("link", "paypal") else "on"),
        )
        for name in ("card", "paypal", "apple_pay", "google_pay", "revolut_pay", "link")
    }
    configuration = SimpleNamespace(id="pmc_velora", name="Velora Billing", **methods)
    monkeypatch.setattr(stripe.PaymentMethodConfiguration, "list", lambda **kwargs: SimpleNamespace(data=[configuration]))
    updates = {}

    def modify(configuration_id, **kwargs):
        assert configuration_id == "pmc_velora"
        updates.update(kwargs)
        return configuration

    monkeypatch.setattr(stripe.PaymentMethodConfiguration, "modify", modify)
    monkeypatch.setattr(setup, "upload_asset", lambda name, purpose: "file_" + name)
    monkeypatch.setattr(setup.stripe_env, "guard_write", lambda operation: None)
    monkeypatch.setattr(stripe.Account, "retrieve", lambda: SimpleNamespace(id="acct_platform"))

    def deny_account_update(*args, **kwargs):
        raise stripe.PermissionError("Platform branding requires Dashboard")

    monkeypatch.setattr(stripe.Account, "modify", deny_account_update)
    result = setup.configure(True)
    assert result["invoice_branding"]["status"] == "dashboard_required"
    assert result["environment"]["BILLING_PAYMENT_METHOD_CONFIGURATION"] == "pmc_velora"
    assert result["environment"]["BILLING_CHECKOUT_LOGO_FILE"] == "file_velora-wordmark-light.png"
    assert result["environment"]["BILLING_PAYPAL_ENABLED"] == "false"
    assert updates == {
        "active": True,
        "card": {"display_preference": {"preference": "on"}},
        "paypal": {"display_preference": {"preference": "off"}},
        "apple_pay": {"display_preference": {"preference": "on"}},
        "google_pay": {"display_preference": {"preference": "on"}},
        "revolut_pay": {"display_preference": {"preference": "on"}},
        "link": {"display_preference": {"preference": "off"}},
    }
    assert result["methods"]["revolut_pay"] == {"available": revolut_available, "preference": "on"}
