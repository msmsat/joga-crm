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


def test_paypal_invoice_is_opt_in_after_account_activation(monkeypatch):
    monkeypatch.delenv("BILLING_PAYPAL_ENABLED", raising=False)
    assert billing.invoice_payment_settings()["payment_method_types"] == ["card", "customer_balance"]
    monkeypatch.setenv("BILLING_PAYPAL_ENABLED", "true")
    assert billing.invoice_payment_settings()["payment_method_types"] == ["card", "paypal", "customer_balance"]
    assert "link" not in billing.invoice_payment_settings()["payment_method_types"]


@pytest.mark.parametrize("paypal_available", [True, False])
def test_configuration_survives_dashboard_only_account_branding(monkeypatch, paypal_available):
    from scripts import configure_billing_checkout as setup

    methods = {
        name: SimpleNamespace(available=paypal_available if name == "paypal" else name != "link",
                              display_preference=SimpleNamespace(value="off" if name == "link" else "on"))
        for name in ("card", "paypal", "apple_pay", "google_pay", "link")
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
    assert result["environment"]["BILLING_PAYPAL_ENABLED"] == str(paypal_available).lower()
    assert updates["link"]["display_preference"]["preference"] == "off"
    assert all(updates[name]["display_preference"]["preference"] == "on"
               for name in ("card", "paypal", "apple_pay", "google_pay"))
