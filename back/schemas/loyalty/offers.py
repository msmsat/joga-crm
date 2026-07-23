from datetime import date, datetime
from typing import Optional

from schemas._base import BaseSchema


class ClientOfferRead(BaseSchema):
    id: int
    client_id: int
    discount_type: str  # percent / amount
    value: int
    reason: str  # scenario / manual / campaign
    scope: str  # renewal / any
    valid_until: Optional[date] = None
    is_used: bool
    used_at: Optional[datetime] = None
    created_at: datetime


class ClientOfferCreate(BaseSchema):
    client_id: int
    discount_type: str = "percent"
    value: int
    scope: str = "renewal"
    valid_until: Optional[date] = None
