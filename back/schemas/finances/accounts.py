from typing import Optional

from schemas._base import BaseSchema


class AccountRead(BaseSchema):
    id: int
    name: str
    type: str
    balance: int
    daily_change: int
    color: str
    is_system: bool


class AccountCreate(BaseSchema):
    name: str
    type: str
    color: Optional[str] = None
    balance: int = 0


class AccountUpdate(BaseSchema):
    name: Optional[str] = None
    type: Optional[str] = None
    color: Optional[str] = None
    balance: Optional[int] = None
