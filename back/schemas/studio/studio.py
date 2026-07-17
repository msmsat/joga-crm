from typing import Optional
from pydantic import EmailStr, model_validator
from schemas._base import BaseSchema


class StudioRead(BaseSchema):
    id: int
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    address: Optional[str] = None
    logo_url: Optional[str] = None
    business_type: Optional[str] = None
    business_subtype: Optional[str] = None
    description: Optional[str] = None
    timezone: Optional[str] = None
    language: Optional[str] = None
    currency: Optional[str] = None
    date_format: Optional[str] = None
    first_day_of_week: Optional[str] = None


class BranchCreate(BaseSchema):
    name: str
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    country: Optional[str] = None
    city: Optional[str] = None
    address: Optional[str] = None
    photo_url: Optional[str] = None

    @model_validator(mode="after")
    def _require_contact(self) -> "BranchCreate":
        if not self.phone and not self.email:
            raise ValueError("Укажите телефон или email")
        return self


class WorkingHoursWrite(BaseSchema):
    day_of_week: int   # 0=Пн … 6=Вс
    is_open: bool
    open_time: str     # "HH:MM"
    close_time: str    # "HH:MM"


class BranchUpdate(BaseSchema):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    country: Optional[str] = None
    city: Optional[str] = None
    address: Optional[str] = None
    photo_url: Optional[str] = None
    working_hours: Optional[list[WorkingHoursWrite]] = None

    @model_validator(mode="after")
    def _validate_working_hours(self) -> "BranchUpdate":
        if self.working_hours is None:
            return self
        days = [wh.day_of_week for wh in self.working_hours]
        if sorted(days) != list(range(7)):
            raise ValueError("working_hours должен содержать все 7 дней (0–6) без повторов")
        for wh in self.working_hours:
            if wh.is_open and wh.open_time >= wh.close_time:
                raise ValueError("Время открытия должно быть раньше времени закрытия")
        return self


class BranchListItem(BaseSchema):
    id: int
    name: str
    address: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    hall_count: int = 0


class HallBrief(BaseSchema):
    id: int
    name: str
    capacity: int
    color: Optional[str] = None
    area: Optional[float] = None
    hourly_rate: Optional[float] = None
    equipment: Optional[list] = None
    is_online: bool = False
    photo_url: Optional[str] = None


class WorkingHoursRead(BaseSchema):
    day_of_week: int
    is_open: bool
    open_time: str
    close_time: str


class ServiceRead(BaseSchema):
    id: int
    name: str
    description: Optional[str] = None
    price: int
    duration_min: int
    category: Optional[str] = None
    service_type: Optional[str] = None
    color: Optional[str] = None
    max_clients: Optional[int] = None
    bookings_count: int
    revenue_total: int
    bookings_last_30d: int = 0


class ServiceCreate(BaseSchema):
    name: str
    price: int
    duration_min: int = 60
    description: Optional[str] = None
    category: Optional[str] = None
    service_type: Optional[str] = None
    color: Optional[str] = None
    max_clients: Optional[int] = None


class ServiceUpdate(BaseSchema):
    name: Optional[str] = None
    price: Optional[int] = None
    duration_min: Optional[int] = None
    description: Optional[str] = None
    category: Optional[str] = None
    service_type: Optional[str] = None
    color: Optional[str] = None
    max_clients: Optional[int] = None


class ServiceWeekSlot(BaseSchema):
    day_of_week: int   # 0=Пн … 6=Вс (текущая неделя)
    hour: int          # час начала занятия (0-23)


class BranchDetail(BaseSchema):
    id: int
    name: str
    country: Optional[str] = None
    city: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    photo_url: Optional[str] = None
    halls: list[HallBrief] = []
    working_hours: list[WorkingHoursRead] = []
