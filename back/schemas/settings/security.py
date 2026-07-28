from datetime import datetime
from typing import Optional

from schemas._base import BaseSchema


class SessionRead(BaseSchema):
    id: int
    device: str
    platform: str
    browser: Optional[str] = None
    ip_address: Optional[str] = None
    location_city: Optional[str] = None
    location_country: Optional[str] = None
    last_active: datetime
    is_current: bool


class TwoFaUpdate(BaseSchema):
    enabled: bool


class TwoFaStatus(BaseSchema):
    enabled: bool
