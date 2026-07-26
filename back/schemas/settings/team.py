from typing import Optional, Literal
from pydantic import EmailStr, Field

from schemas._base import BaseSchema
from schemas.staff.staff import StaffWorkingHoursItem


class StaffCreate(BaseSchema):
    name: str
    last_name: Optional[str] = None
    email: EmailStr
    phone: str = Field(min_length=1)  # телефон обязателен при создании сотрудника
    password: str  # временный пароль, сотрудник сменит через flow смены пароля
    role: Literal["admin", "trainer"]
    department: Optional[str] = None
    salary: Optional[float] = None
    rate: Optional[float] = None
    rate_type: Optional[str] = None  # "fixed" | "percent" | "hourly"
    service_ids: list[int] = []
    photo_url: Optional[str] = None
    schedule: list[StaffWorkingHoursItem] = []


class StaffUpdate(BaseSchema):
    name: str
    last_name: Optional[str] = None
    email: EmailStr
    phone: Optional[str] = None
    role: Literal["admin", "trainer"]
    department: Optional[str] = None
    salary: Optional[float] = None
    rate: Optional[float] = None
    rate_type: Optional[str] = None
    service_ids: list[int] = []
    photo_url: Optional[str] = None
    schedule: list[StaffWorkingHoursItem] = []


class StaffMessageRequest(BaseSchema):
    text: str
    channel: str  # "whatsapp" | "telegram" | "email"


class StaffCallRequest(BaseSchema):
    channel: str  # "phone" | "whatsapp"
