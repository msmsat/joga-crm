from datetime import datetime
from typing import Optional

from schemas._base import BaseSchema


class BookingCreate(BaseSchema):
    lesson_id: int


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
