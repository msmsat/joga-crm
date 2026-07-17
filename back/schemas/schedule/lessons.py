from datetime import datetime
from typing import Any, List, Optional

from pydantic import Field, model_validator

from schemas._base import BaseSchema


class LessonRead(BaseSchema):
    id: int
    name: str
    teacher_name: str
    teacher_id: Optional[int] = None
    hall_id: Optional[int] = None
    start_time: datetime
    duration_min: int
    price: int
    level: str
    equipment: str
    total_spots: int
    service_id: Optional[int] = None
    status: str
    booked_count: int = 0

    # Загружается из ORM-связи, но не сериализуется — резерв для подсчёта booked_count,
    # если эндпоинт не посчитал его сам (напр. через selectinload вместо GROUP BY).
    reservations: List[Any] = Field(default_factory=list, exclude=True, repr=False)

    @model_validator(mode="after")
    def _fill_booked_count(self) -> "LessonRead":
        # Единое правило подсчёта по всему проекту: занятое место — любая бронь,
        # кроме отменённой (active + attended). См. staff/schedule.py.
        # Если эндпоинт уже проставил booked_count (GROUP BY, без N+1) — уважаем его.
        if not self.booked_count and self.reservations:
            self.booked_count = sum(1 for r in self.reservations if r.status != "cancelled")
        return self


class BookedClient(BaseSchema):
    reservation_id: int
    client_id: int
    name: str
    last_name: Optional[str] = None
    phone: Optional[str] = None
    avatar_color: Optional[str] = None
    spot_number: Optional[int] = None
    status: str


class LessonDetail(LessonRead):
    booked_clients: List[BookedClient] = Field(default_factory=list)


class LessonCreate(BaseSchema):
    name: str
    teacher_name: str
    teacher_id: Optional[int] = None
    hall_id: Optional[int] = None
    start_time: datetime
    duration_min: int = 60
    price: int
    level: str
    equipment: str
    total_spots: int = 8
    service_id: Optional[int] = None
    status: str = "confirmed"


class LessonCreateRequest(BaseSchema):
    """Тело POST /schedule/lessons. teacher_name НЕ принимаем — денормализуем
    из teacher_id на сервере. Диапазоны (total_spots 1–50, конец позже начала)
    проверяет эндпоинт как 400 — по контракту."""
    name: str
    teacher_id: int
    hall_id: Optional[int] = None
    start_time: datetime
    duration_min: int = 60
    total_spots: int = 8
    price: int
    level: str
    equipment: str
    service_id: Optional[int] = None


class LessonUpdateRequest(BaseSchema):
    """Тело PATCH /schedule/lessons/{id}. Все поля опциональны — меняем только
    присланные (см. exclude_unset). teacher_name пересчитываем из teacher_id."""
    name: Optional[str] = None
    teacher_id: Optional[int] = None
    hall_id: Optional[int] = None
    start_time: Optional[datetime] = None
    duration_min: Optional[int] = None
    total_spots: Optional[int] = None
    price: Optional[int] = None


class LessonUpdate(BaseSchema):
    name: Optional[str] = None
    teacher_name: Optional[str] = None
    teacher_id: Optional[int] = None
    hall_id: Optional[int] = None
    start_time: Optional[datetime] = None
    duration_min: Optional[int] = None
    price: Optional[int] = None
    level: Optional[str] = None
    equipment: Optional[str] = None
    total_spots: Optional[int] = None
    service_id: Optional[int] = None
    status: Optional[str] = None
