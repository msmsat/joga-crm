"""Freeze the parties and tax decision before a one-time Stripe payment."""
import os
from fastapi import HTTPException

from services import billing_tax


_SELLER_FIELDS = {
    "name": "LEGAL_NAME", "registration_id": "REGISTRATION_ID",
    "vat_id": "VAT_ID", "country": "COUNTRY", "line1": "ADDRESS_LINE1",
    "postal_code": "ADDRESS_POSTAL_CODE", "city": "ADDRESS_CITY",
}
_BUYER_FIELDS = (
    "legal_name", "registration_id", "vat_id", "vat_verified", "country",
    "line1", "line2", "postal_code", "city",
)


def seller_details():
    """Read deployment configuration; never invent a seller's legal identity."""
    return {key: (os.getenv(f"BILLING_SELLER_{suffix}") or "").strip() or None
            for key, suffix in _SELLER_FIELDS.items()}


def require_seller_details():
    seller = seller_details()
    required = ("name", "registration_id", "country", "line1", "postal_code", "city")
    registered = (os.getenv("BILLING_SELLER_VAT_REGISTERED") or "").lower() in ("1", "true", "yes")
    if not all(seller[key] for key in required) or registered and not seller["vat_id"]:
        raise HTTPException(status_code=409, detail={
            "code": "billing.seller_details_required",
            "message": "Приём оплаты недоступен: реквизиты продавца ещё не настроены.",
        })
    return seller


def purchase_snapshot(profile, tax, plan_name, months, net, currency, starts, until):
    """A separate dict, independent of the mutable account/profile and plan."""
    seller = require_seller_details()
    values = profile.model_dump()
    buyer = {key: values.get(key) for key in _BUYER_FIELDS}
    buyer["vat_verified"] = bool(buyer["vat_verified"])
    if not all(buyer[key] for key in ("legal_name", "country", "line1", "postal_code", "city")):
        raise HTTPException(status_code=422, detail={
            "code": "billing.billing_profile_required",
            "message": "Заполните имя или юридическое название и реквизиты плательщика",
        })
    if tax.manual:
        decision = billing_tax.snapshot(tax, net, currency)
        tax_minor = decision["tax_amount"]
        tax_summary = {
            "outcome": decision["tax_outcome"], "basis": decision["tax_basis"],
            "rate_percent": decision["tax_rate_percent"], "tax_minor": tax_minor,
            "net_minor": net, "total_minor": net + tax_minor, "currency": currency.upper(),
            "ruleset": decision["tax_ruleset_version"],
        }
    else:
        tax_summary = {
            "outcome": "stripe_auto", "basis": "stripe_automatic_tax", "rate_percent": None,
            "tax_minor": None, "net_minor": net, "total_minor": None,
            "currency": currency.upper(), "ruleset": None,
        }
    return {
        "version": 1, "seller": seller, "buyer": buyer,
        "item": {"plan": plan_name, "period_months": months,
                 "access_starts_at": starts.isoformat(), "access_until": until.isoformat()},
        "tax": tax_summary,
    }
