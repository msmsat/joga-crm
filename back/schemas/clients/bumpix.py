from datetime import datetime
from typing import Literal
from pydantic import BaseModel


BumpixFilter = Literal['all', 'all_source', 'new', 'completed', 'canceled', 'history', 'online']


class BumpixPhoto(BaseModel):
    id: int
    kind: str
    source_owner_id: str
    image_id: str
    revision: str
    sha256: str
    bytes: int
    url: str


class BumpixProfile(BaseModel):
    source_client_id: str
    snapshot_id: str
    profile: dict
    raw_client: dict
    lookups: dict
    counts: dict[str, int]
    avatar: BumpixPhoto | None
    imported_at: datetime


class BumpixEventResponse(BaseModel):
    id: int
    source_event_id: str
    source_client_id: str
    master_source_id: str
    teacher_user_id: int | None
    start_time: datetime
    end_time: datetime
    status: str
    source_groups: list[str]
    details: dict
    raw_event: dict
    photos: list[BumpixPhoto]


class BumpixEventPage(BaseModel):
    total: int
    offset: int
    limit: int
    items: list[BumpixEventResponse]
