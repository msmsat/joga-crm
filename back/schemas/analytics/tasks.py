from datetime import datetime
from typing import Literal, Optional

from pydantic import Field

from schemas._base import BaseSchema


class StudioTaskRead(BaseSchema):
    id: int
    text: str
    priority: str
    tag: Optional[str] = None
    is_done: bool
    done_at: Optional[datetime] = None
    created_at: datetime
    assignee_id: Optional[int] = None
    assignee_name: Optional[str] = None


class StudioTaskCreate(BaseSchema):
    text: str = Field(min_length=1, max_length=500)
    priority: Literal["low", "medium", "high"] = "medium"
    tag: Optional[str] = None
    assignee_id: Optional[int] = None


class StudioTaskUpdate(BaseSchema):
    text: Optional[str] = Field(default=None, min_length=1, max_length=500)
    priority: Optional[Literal["low", "medium", "high"]] = None
    tag: Optional[str] = None
    is_done: Optional[bool] = None
    assignee_id: Optional[int] = None


class AssigneeOption(BaseSchema):
    user_id: int
    name: str
    role: Literal["admin", "trainer"]
