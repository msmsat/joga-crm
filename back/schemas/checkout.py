"""Касса клиента (CL-6, Блок 4). Калькулятор (6.7) не двигает деньги — только
считает итог; оплата (6.9) пересчитывает всё заново на сервере (Zero Trust)."""
from typing import Literal

from schemas._base import BaseSchema

# "lesson" — конкретное занятие Журнала, за которое клиент платит на месте
# (долг «оплата на месте», routers/schedule/reservations.py::pay_reservation).
# Отдельно от "single": там продаётся услуга из Каталога и права на конкретное
# занятие не даёт, здесь оплачивается уже существующая бронь.
ProductType = Literal["subscription", "single", "lesson"]


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
    # applied — баллы, value — деньги, которые они сняли: на уровне с
    # point_value=2 это разные числа (см. services/points.py).
    bonuses_applied: int
    bonuses_value: int = 0
    point_value: int = 1
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
    # "transfer" — клиент перевёл деньги студии (оплата на месте, погашение долга
    # за занятие). Офлайн-метод, как и наличные: комиссию платформы за него
    # считает record_offline_fee. "card" по-прежнему означает эквайринг Stripe и
    # проводится вебхуком, а не этой ручкой.
    payment_method: Literal["cash", "card", "transfer"] = "cash"


class CheckoutPayResult(BaseSchema):
    total_price: int
    bonuses_applied: int
    bonuses_value: int = 0
    deposit_applied: int = 0
    certificate_applied: int = 0
    subscription_id: int | None = None


class CheckoutSessionResult(BaseSchema):
    """Всё, что нужно фронту, чтобы отрисовать форму оплаты в своей модалке.

    `account_id` обязателен: Stripe.js должен инициализироваться с тем же
    подключённым аккаунтом, на котором создана сессия, иначе форма не найдёт её.
    """
    client_secret: str
    session_id: str
    publishable_key: str
    account_id: str


class CheckoutConfirmRequest(BaseSchema):
    session_id: str


class CheckoutConfirmResult(BaseSchema):
    """paid=true — оплата проведена в CRM (этим вызовом или ранее вебхуком)."""
    paid: bool


class CheckoutServiceOut(BaseSchema):
    """Услуга Каталога в кассе клиента — вкладка «Разовые визиты»."""
    id: int
    name: str
    price: int
    duration_min: int
