from typing import Optional
from pydantic import EmailStr

from schemas._base import BaseSchema


class StaffCreate(BaseSchema):
    name: str
    last_name: Optional[str] = None
    email: EmailStr
    phone: Optional[str] = None
    role: str
    department: Optional[str] = None
    salary: Optional[float] = None
    rate: Optional[float] = None
    rate_type: Optional[str] = None  # "fixed" | "percent" | "hourly"


class StaffUpdate(BaseSchema):
    name: str
    last_name: Optional[str] = None
    email: EmailStr
    phone: Optional[str] = None
    role: str
    department: Optional[str] = None
    salary: Optional[float] = None
    rate: Optional[float] = None
    rate_type: Optional[str] = None


class StaffMessageRequest(BaseSchema):
    text: str
    channel: str  # "whatsapp" | "telegram" | "email"


class StaffCallRequest(BaseSchema):
    channel: str  # "phone" | "whatsapp"
