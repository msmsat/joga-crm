from datetime import datetime
from typing import Literal, Optional

from schemas._base import BaseSchema


class StudioTaskRead(BaseSchema):
    id: int
    text: str
    priority: str
    tag: Optional[str] = None
    is_done: bool
    done_at: Optional[datetime] = None
    created_at: datetime


class StudioTaskCreate(BaseSchema):
    text: str
    priority: Literal["low", "medium", "high"] = "medium"
    tag: Optional[str] = None


class StudioTaskUpdate(BaseSchema):
    text: Optional[str] = None
    priority: Optional[Literal["low", "medium", "high"]] = None
    tag: Optional[str] = None
    is_done: Optional[bool] = None
