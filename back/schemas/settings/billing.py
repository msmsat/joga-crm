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
    billing_mode: str = "subscription"
    percent_rate: Optional[float] = None
    fixed_base_amount: Optional[int] = None
    notify_before_days: int = 3
    notify_before_autocharge: bool = True
    email_receipt_enabled: bool = True
    sms_notification_enabled: bool = False


class AutopaySettingsUpdate(BaseModel):
    auto_renewal: Optional[bool] = None
    email_receipt_enabled: Optional[bool] = None
    notify_before_autocharge: Optional[bool] = None
    sms_notification_enabled: Optional[bool] = None


class ActivateModelRequest(BaseModel):
    mode: Literal["subscription", "percent", "combo"]
    plan: Optional[Literal["start", "pro", "business"]] = None
    period_months: Optional[Literal[1, 6, 12, 24]] = None


class IbanCheckoutRequest(BaseModel):
    plan: Literal["start", "pro", "business"]
    period_months: Literal[1, 6, 12, 24]


class IbanCheckoutResponse(BaseModel):
    invoice_id: int
    invoice_number: str      # "INV-2026-000123"
    iban: str                # тестовый, детерминированный
    amount: int               # копейки
    reference: str            # назначение платежа = order_id
    beneficiary: str = "Velora CRM LLC"


class BillingStatsRead(BaseSchema):
    """Плашки шапки биллинга — считаются из оплаченных счетов студии, не из констант."""
    total_spent: int                      # копейки, сумма paid-счетов
    months_with_us: int                   # полных месяцев с первой оплаты (0 — оплат не было)
    saved: int                            # копейки, экономия от скидок за период
    next_charge: int                      # копейки, следующее списание (0 — списывать нечего)
    next_charge_at: Optional[str] = None


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
    method_type: str = "card"


class CheckoutRequest(BaseModel):
    plan: Literal["start", "pro", "business"]
    period_months: Literal[1, 6, 12, 24]


class CheckoutResponse(BaseModel):
    checkout_url: str


class RenewResponse(BaseModel):
    invoice_id: int
