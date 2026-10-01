"""Configure hosted Velora checkout. Read-only by default; --apply saves branding.

Run from back/: python -m scripts.configure_billing_checkout [--apply]
Secrets stay in .env. The output contains only file/configuration IDs and readiness.
This script creates no payments, sessions, subscriptions, invoices or Tax objects.
"""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path

import stripe
from dotenv import load_dotenv

from services import stripe_env, stripe_checkout_branding as branding

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")
stripe.api_key = os.getenv("STRIPE_SECRET_KEY", "")


def upload_asset(filename: str, purpose: str) -> str:
    content = (ROOT / "assets" / "billing" / filename).read_bytes()
    digest = hashlib.sha256(content).hexdigest()[:16]
    upload_name = f"{Path(filename).stem}-{digest}.png"
    for file in stripe.File.list(purpose=purpose, limit=100).data:
        if file.filename == upload_name:
            return file.id
    stream = io.BytesIO(content)
    stream.name = upload_name
    return stripe.File.create(
        purpose=purpose, file=stream,
        idempotency_key=f"velora-brand:{purpose}:{digest}",
    ).id


def configure(apply: bool) -> dict:
    configurations = stripe.PaymentMethodConfiguration.list(limit=100).data
    current = next((item for item in configurations if item.name == branding.CONFIG_NAME), None)
    result = {
        "mode": stripe_env.key_mode(stripe.api_key), "apply": apply,
        "configuration": current.id if current else None,
        "branding": branding.branding_settings(),
        "requested_methods": {"card": "on", "paypal": "on", "apple_pay": "on", "google_pay": "on", "link": "off"},
    }
    if not apply:
        return result

    stripe_env.guard_write("брендинг и способы оплаты Velora Checkout")
    settings = {
        method: {"display_preference": {"preference": preference}}
        for method, preference in result["requested_methods"].items()
    }
    if current:
        current = stripe.PaymentMethodConfiguration.modify(current.id, active=True, **settings)
    else:
        current = stripe.PaymentMethodConfiguration.create(
            name=branding.CONFIG_NAME, **settings, idempotency_key="velora-billing-payment-methods-v1",
        )

    light = upload_asset("velora-wordmark-light.png", "business_logo")
    dark = upload_asset("velora-wordmark-dark.png", "business_logo")
    icon = upload_asset("velora-icon.png", "business_icon")
    # Invoices use account branding, not Checkout Session branding. Their logo
    # has dark text; the Checkout logo is white against the graphite background.
    account_branding = {
        "logo": dark, "icon": icon,
        "primary_color": branding.BACKGROUND, "secondary_color": branding.BUTTON,
    }
    try:
        stripe.Account.modify(stripe.Account.retrieve().id, settings={"branding": account_branding})
        result["invoice_branding"] = {"status": "configured"}
    except stripe.PermissionError:
        # Standard platform accounts update global branding through Dashboard.
        # Checkout Session branding still works with the uploaded file below.
        result["invoice_branding"] = {
            "status": "dashboard_required", "settings": account_branding,
            "url": "https://dashboard.stripe.com/settings/branding",
        }
    methods = {
        name: {"available": getattr(current, name).available,
               "preference": getattr(current, name).display_preference.value}
        for name in result["requested_methods"]
    }
    result.update({"configuration": current.id, "methods": methods, "environment": {
        "BILLING_PAYMENT_METHOD_CONFIGURATION": current.id,
        "BILLING_CHECKOUT_LOGO_FILE": light,
        "BILLING_PAYPAL_ENABLED": "true" if methods["paypal"]["available"] else "false",
    }})
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    try:
        print(json.dumps(configure(args.apply), ensure_ascii=False, indent=2))
    except stripe.StripeError as exc:
        # Stripe exceptions can include request data; don't print their bodies.
        print(json.dumps({"error": type(exc).__name__, "code": exc.code}))
        raise SystemExit(1)
