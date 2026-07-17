from typing import Literal, Optional

from pydantic import BaseModel

from schemas._base import BaseSchema


class PlanLimits(BaseSchema):
    staff: Optional[int] = None   # None = безлимит (business)
    clients: Optional[int] = None


class PlanRead(BaseSchema):
    id: str            # start | pro | business
    name: str
    price: int         # месячная цена в копейках
    limits: PlanLimits


class PlansCatalogRead(BaseSchema):
    """Каталог тарифов — единственный источник истины о ценах и лимитах."""
    plans: list[PlanRead]
    period_discounts: dict[int, float]   # {1: 0, 6: 0.20, 12: 0.30, 24: 0.40}


class BillingPlanRead(BaseSchema):
    plan_name: str
    billing_cycle: str
    status: str
    expires_at: Optional[str] = None
    max_staff: int
    auto_renewal: bool


class InvoiceRead(BaseSchema):
    id: int
    plan_name: str
    amount: int
    payment_method: Optional[str] = None
    paid_at: Optional[str] = None
    status: str
    pdf_url: Optional[str] = None


class PaymentCardRead(BaseSchema):
    id: int
    card_last4: str
    card_brand: str
    card_expiry: str
    cardholder_name: Optional[str] = None
    is_primary: bool


class CheckoutRequest(BaseModel):
    plan: Literal["start", "pro", "business"]
    period_months: Literal[1, 6, 12, 24]


class CheckoutResponse(BaseModel):
    checkout_url: str


class RenewResponse(BaseModel):
    invoice_id: int
