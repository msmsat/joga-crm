from typing import Literal

from pydantic import BaseModel

from schemas._base import BaseSchema


class GoogleAuthorizeUrl(BaseModel):
    url: str


class GoogleCalendarInfo(BaseModel):
    id: str
    name: str
    primary: bool = False


class GoogleCalendarUpdate(BaseSchema):
    calendar_id: str | None = None
    sync_mode: Literal["push", "two_way"] | None = None


class GoogleSyncResult(BaseModel):
    pushed: int = 0
    pulled: int = 0
    errors: list[str] = []
