from datetime import datetime
from typing import Optional

from schemas._base import BaseSchema


# --- Cards program: config, levels, cards, point transactions ---


class LoyaltyConfigRead(BaseSchema):
    is_enabled: bool
    program_name: str
    points_exchange_rate: int
    expiry_period: str


class LoyaltyConfigUpdate(BaseSchema):
    is_enabled: Optional[bool] = None
    program_name: Optional[str] = None
    points_exchange_rate: Optional[int] = None
    expiry_period: Optional[str] = None


class LoyaltyLevelRead(BaseSchema):
    id: int
    name: str
    color: str
    min_threshold: int
    max_threshold: Optional[int] = None
    sort_order: int


class LoyaltyCardRead(BaseSchema):
    id: int
    client_id: int
    client_name: str
    points_balance: int
    total_spent: int
    level_id: Optional[int] = None
    created_at: datetime


class LoyaltyStatsRead(BaseSchema):
    members: int
    points_in_circulation: int
    revenue_from_members: int
    avg_check: int


class PointTransactionRead(BaseSchema):
    id: int
    client_id: int
    points: int
    description: str
    created_at: datetime


class BonusCreate(BaseSchema):
    amount: int  # может быть отрицательным — списание
    description: str = "Ручной бонус"


class PointsBalanceRead(BaseSchema):
    points_balance: int


# --- Discount program ---


class DiscountConfigRead(BaseSchema):
    is_enabled: bool
    discount_type: str
    discount_value: int
    min_purchase_amount: Optional[int] = None
    applies_to_all_services: bool
    stackable: bool
    visible_in_cabinet: bool


class DiscountConfigUpdate(BaseSchema):
    is_enabled: Optional[bool] = None
    discount_type: Optional[str] = None
    discount_value: Optional[int] = None
    min_purchase_amount: Optional[int] = None
    applies_to_all_services: Optional[bool] = None
    stackable: Optional[bool] = None
    visible_in_cabinet: Optional[bool] = None


# --- Subscription (packages) program ---


class SubscriptionProgramConfigRead(BaseSchema):
    is_enabled: bool
    allow_freeze: bool
    allow_transfer: bool
    auto_renewal: bool


class SubscriptionProgramConfigUpdate(BaseSchema):
    is_enabled: Optional[bool] = None
    allow_freeze: Optional[bool] = None
    allow_transfer: Optional[bool] = None
    auto_renewal: Optional[bool] = None


class SubscriptionPackageRead(BaseSchema):
    id: int
    name: str
    class_count: int
    price: int
    per_visit_price: int
    is_active: bool
    sort_order: int


class SubscriptionPackageCreate(BaseSchema):
    name: str
    class_count: int
    price: int
    per_visit_price: int
    is_active: bool = True
    sort_order: int = 0


class SubscriptionPackageUpdate(BaseSchema):
    name: Optional[str] = None
    class_count: Optional[int] = None
    price: Optional[int] = None
    per_visit_price: Optional[int] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None


# --- Referral program ---


class ReferralConfigRead(BaseSchema):
    is_enabled: bool
    referrer_bonus: int
    new_client_discount: int
    trigger_condition: str
    bonus_type: str


class ReferralConfigUpdate(BaseSchema):
    is_enabled: Optional[bool] = None
    referrer_bonus: Optional[int] = None
    new_client_discount: Optional[int] = None
    trigger_condition: Optional[str] = None
    bonus_type: Optional[str] = None
