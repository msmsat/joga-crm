from datetime import datetime
from typing import Literal, Optional

from schemas._base import BaseSchema


class BookingCreate(BaseSchema):
    lesson_id: int


class ReservationPayRequest(BaseSchema):
    """Оплата на месте: клиент отдал деньги на ресепшене.

    Карты здесь нет намеренно — «card» в кассе означает эквайринг Stripe, и
    проводится он вебхуком после реального списания, а не нажатием кнопки
    (routers/checkout/router.perform_pay). На ресепшене реальны наличные и
    перевод; терминал студии проводится через кассу, как и раньше.
    """
    payment_method: Literal["cash", "transfer"] = "cash"
    # Счёт студии, на который лечь доходу. Не выбран — дефолтный по способу
    # оплаты (наличные → касса, перевод → расчётный счёт).
    account_id: Optional[int] = None


class ReservationCreate(BaseSchema):
    client_id: int
    lesson_id: int


class ReservationRead(BaseSchema):
    id: int
    client_id: int
    lesson_id: int
    spot_number: Optional[int] = None
    status: str
    booking_channel: Optional[str] = None
    created_at: datetime
