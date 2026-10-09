"""Client-owned payment recovery; Stripe identifiers are never client input."""
from datetime import datetime
from typing import Literal

from pydantic import Field

from schemas._base import BaseSchema


class CheckoutSyncRequest(BaseSchema):
    reservation_id: int | None = Field(default=None, gt=0)
    checkout_id: int | None = Field(default=None, gt=0)


class CheckoutSyncPayment(BaseSchema):
    id: int
    kind: Literal["booking", "subscription"]
    status: str
    amount_str: str
    title: str
    starts_at: datetime | None = None
    reservation_id: int | None = None
    package_id: int | None = None
    created_at: datetime
    newly_paid: bool = False


class CheckoutSyncResponse(BaseSchema):
    payments: list[CheckoutSyncPayment]
    verification_unavailable: bool = False
