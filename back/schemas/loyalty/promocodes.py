from datetime import date, datetime
from typing import Optional

from schemas._base import BaseSchema


class PromoCodeRead(BaseSchema):
    id: int
    code: str
    discount_type: str  # percent / amount
    value: int
    valid_until: Optional[date] = None
    usage_limit: Optional[int] = None
    used_count: int
    is_active: bool
    created_at: datetime


class PromoCodeCreate(BaseSchema):
    code: str
    discount_type: str = "percent"
    value: int
    valid_until: Optional[date] = None
    usage_limit: Optional[int] = None


class PromoCodeCheck(BaseSchema):
    code: str
    amount: int


class PromoCodeCheckResult(BaseSchema):
    valid: bool
    discount: int = 0
    final_amount: int = 0
    detail: Optional[str] = None
