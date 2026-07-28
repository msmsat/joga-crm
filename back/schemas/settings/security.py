from datetime import datetime
from typing import Literal, Optional

from pydantic import Field

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


class ExportArchiveRequest(BaseSchema):
    include: list[Literal["clients", "finances", "schedule"]] = Field(min_length=1)


class ConfirmNameRequest(BaseSchema):
    confirm_name: str


class WipeDataResult(BaseSchema):
    deleted: dict[str, int]


class DeleteAccountResult(BaseSchema):
    redirect: str
