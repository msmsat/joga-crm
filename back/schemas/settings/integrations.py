from pydantic import BaseModel, EmailStr, Field

from schemas._base import BaseSchema


class TgConnect(BaseSchema):
    token: str = Field(pattern=r"^\d{6,12}:[A-Za-z0-9_-]{30,50}$")


class WaConnect(BaseSchema):
    token: str
    phone_number_id: str
    waba_id: str | None = None


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
    email: ChannelStatus


class WaPricing(BaseModel):
    price_per_message: float
    currency: str
    source: str
