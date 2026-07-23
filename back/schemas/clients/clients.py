from datetime import date
from typing import List, Optional

from pydantic import Field

from schemas._base import BaseSchema


class ClientCreate(BaseSchema):
    name: str = Field(min_length=1)
    last_name: Optional[str] = None
    phone: str = Field(min_length=1)
    email: str = Field(min_length=1)
    birth_date: Optional[date] = None
    city: str = Field(min_length=1)
    tags: Optional[List[str]] = []
    note: Optional[str] = None
    source: Optional[str] = None
    membership_id: Optional[int] = None
    is_membership_paid: bool = False
    invite_code: Optional[str] = None


class ClientUpdate(BaseSchema):
    name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    birth_date: Optional[date] = None
    city: Optional[str] = None
    source: Optional[str] = None


class ClientStatusUpdate(BaseSchema):
    status: str  # new / active / vip / inactive / frozen


class ClientFreezeUpdate(BaseSchema):
    frozen: bool


class ClientRegistrationDateUpdate(BaseSchema):
    registration_date: date


class ClientTagAction(BaseSchema):
    tag: str


class MessageSend(BaseSchema):
    text: str
    channel: str  # sms / telegram / whatsapp
