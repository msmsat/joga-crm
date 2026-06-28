from datetime import date
from typing import List, Optional

from schemas._base import BaseSchema


class ClientCreate(BaseSchema):
    name: str
    last_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    birth_date: Optional[date] = None
    city: Optional[str] = None
    tags: Optional[List[str]] = []
    note: Optional[str] = None
    source: Optional[str] = None


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
