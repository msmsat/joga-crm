from schemas._base import BaseSchema


class BookingCreate(BaseSchema):
    lesson_id: int


# ReservationRead, ReservationUpdate — to be added when endpoints are implemented
