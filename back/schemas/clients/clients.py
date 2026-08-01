from datetime import date
from typing import List, Literal, Optional

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


class ClientFreezeUpdate(BaseSchema):
    frozen: bool


class SegmentRulesOut(BaseSchema):
    """Пороги, по которым считаются категории клиентов."""
    new_client_days: int
    active_within_days: int
    vip_min_spent: int
    vip_min_visits: int


class SegmentRulesUpdate(BaseSchema):
    # Границы, чтобы студия не выставила бессмысленное правило: 0 дней сделал бы
    # категорию всегда пустой, а 10 лет — всегда полной.
    new_client_days: int = Field(ge=1, le=365)
    active_within_days: int = Field(ge=1, le=365)
    vip_min_spent: int = Field(ge=0, le=100_000_000)
    vip_min_visits: int = Field(ge=1, le=10_000)


class ClientRegistrationDateUpdate(BaseSchema):
    registration_date: date


class ClientTagAction(BaseSchema):
    tag: str


class MessageSend(BaseSchema):
    text: str
    channel: str  # sms / telegram / whatsapp
