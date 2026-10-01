"""Hosted Stripe checkout for Velora subscriptions, separate from studio Connect."""
import os

BACKGROUND = "#121212"
BUTTON = "#FCAE91"
CONFIG_NAME = "Velora Billing"


def branding_settings() -> dict:
    settings = {
        "display_name": "Velora",
        "background_color": BACKGROUND,
        "button_color": BUTTON,
        "font_family": "inter",
        "border_style": "rounded",
    }
    logo = (os.getenv("BILLING_CHECKOUT_LOGO_FILE") or "").strip()
    if logo:
        settings["logo"] = {"type": "file", "file": logo}
    return settings


def payment_method_params() -> dict:
    # The dedicated configuration enables card, Apple Pay, Google Pay and PayPal,
    # with Link off. Stripe checks eligibility, including recurring PayPal approval.
    configuration = (os.getenv("BILLING_PAYMENT_METHOD_CONFIGURATION") or "").strip()
    if configuration:
        return {"payment_method_configuration": configuration}
    # Existing installations remain payable until the configuration is prepared.
    return {"payment_method_types": ["card"]}


def paypal_invoices_enabled() -> bool:
    # Set only after the account's PayPal integration is approved. Explicitly
    # adding an unavailable payment method would prevent invoice finalization.
    return (os.getenv("BILLING_PAYPAL_ENABLED") or "").strip().lower() in ("1", "true", "yes")
