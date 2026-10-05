"""One-time first tariff payment promotion, shared by quotes and paid orders.

The durable redemption scope is a studio. A returned payment still consumed its
first purchase; abandoned attempts and zero-value legacy trial invoices did not.
Commission rates are independent of the fixed tariff purchase price.
"""
from dataclasses import asdict, dataclass

from sqlalchemy import select

from models import BillingInvoice

PROMO_CODE = 'WELCOME30'
PROMO_PERCENT = 30


@dataclass(frozen=True)
class BillingPrice:
    amount_before_promo: int
    net_amount: int
    promo_code: str | None = None
    promo_discount_percent: float = 0
    promo_discount_amount: int = 0

    def fields(self):
        return asdict(self)


async def first_payment_available(db, plan, *, excluding_invoice_id=None):
    """Read monetary history; callers taking money serialize on the plan row."""
    if plan.stripe_subscription_id:
        return False
    query = select(BillingInvoice.id).where(
        BillingInvoice.studio_id == plan.studio_id,
        BillingInvoice.kind == 'subscription',
        BillingInvoice.status.in_(('paid', 'refunded')),
        BillingInvoice.amount > 0,
    )
    if excluding_invoice_id is not None:
        query = query.where(BillingInvoice.id != excluding_invoice_id)
    return (await db.execute(query.limit(1))).scalar_one_or_none() is None


def period_price(plan_name, months, combo, available):
    from routers.billing.plans import amount_for, combo_amount_for
    before = (combo_amount_for if combo else amount_for)(plan_name, months)
    discount = before * PROMO_PERCENT // 100 if available else 0
    return BillingPrice(before, before - discount,
                        PROMO_CODE if available else None,
                        PROMO_PERCENT if available else 0, discount)


def invoice_price_fields(invoice):
    """Return the purchase's frozen breakdown, including after net becomes gross."""
    original = getattr(invoice, 'billing_details_snapshot', None) or {}
    promo = original.get('promo')
    if promo:
        return dict(promo)
    net = original.get('tax', {}).get('net_minor', getattr(invoice, 'amount', None))
    return BillingPrice(net, net).fields()
