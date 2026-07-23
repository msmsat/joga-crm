"""Касса клиента (CL-6, Блок 4). Калькулятор (6.7) не двигает деньги — только
считает итог; оплата (6.9) пересчитывает всё заново на сервере (Zero Trust)."""
from typing import Literal

from schemas._base import BaseSchema

ProductType = Literal["subscription", "single"]


class CheckoutCalculateRequest(BaseSchema):
    client_id: int
    product_id: int
    product_type: ProductType
    promo_code: str | None = None
    use_bonuses: bool = False
    use_deposit: bool = False
    certificate_code: str | None = None


class CheckoutCalculateResult(BaseSchema):
    base_price: int
    discount: int
    promo_valid: bool
    bonuses_available: int
    bonuses_applied: int
    deposit_available: int = 0
    deposit_applied: int = 0
    certificate_applied: int = 0
    total_price: int


class CheckoutPayRequest(BaseSchema):
    client_id: int
    product_id: int
    product_type: ProductType
    account_id: int | None = None
    promo_code: str | None = None
    use_bonuses: bool = False
    use_deposit: bool = False
    certificate_code: str | None = None
    payment_method: Literal["cash", "card"] = "cash"


class CheckoutPayResult(BaseSchema):
    total_price: int
    bonuses_applied: int
    deposit_applied: int = 0
    certificate_applied: int = 0
    subscription_id: int | None = None


class CheckoutServiceOut(BaseSchema):
    """Услуга Каталога в кассе клиента — вкладка «Разовые визиты»."""
    id: int
    name: str
    price: int
    duration_min: int
