from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

from schemas._base import BaseSchema

IntegrationType = Literal["telegram", "whatsapp", "instagram", "google_calendar"]


class TgConnect(BaseSchema):
    token: str = Field(pattern=r"^\d{6,12}:[A-Za-z0-9_-]{30,50}$")


class WaConnect(BaseSchema):
    token: str
    phone_number_id: str
    waba_id: str | None = None


class IgConnect(BaseSchema):
    token: str
    ig_user_id: str


class EmailCodeRequest(BaseSchema):
    email: EmailStr


class EmailCodeVerify(BaseSchema):
    code: str = Field(min_length=6, max_length=6)


class ChannelStatus(BaseModel):
    connected: bool = False
    details: dict = {}


class NotifyChannelsStatus(BaseModel):
    telegram: ChannelStatus
    whatsapp: ChannelStatus
    instagram: ChannelStatus
    email: ChannelStatus


class WaPricing(BaseModel):
    price_per_message: float
    currency: str
    source: str


class IntegrationStatus(BaseModel):
    type: IntegrationType
    connected: bool = False
    connected_at: datetime | None = None
    details: dict | None = None
    capabilities: list[str] = []
