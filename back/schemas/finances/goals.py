from datetime import date
from typing import Literal, Optional

from schemas._base import BaseSchema


class GoalRead(BaseSchema):
    id: int
    title: str
    target_amount: int
    current_amount: int
    tracking_mode: str
    deadline: Optional[date] = None
    category: Optional[str] = None
    priority: str
    op_type: Literal["in", "out"] = "in"


class GoalCreate(BaseSchema):
    title: str
    target_amount: int
    tracking_mode: Literal["auto", "manual"] = "manual"
    deadline: Optional[date] = None
    category: Optional[str] = None
    priority: str = "medium"
    op_type: Literal["in", "out"] = "in"


class GoalUpdate(BaseSchema):
    title: Optional[str] = None
    target_amount: Optional[int] = None
    current_amount: Optional[int] = None
    tracking_mode: Optional[Literal["auto", "manual"]] = None
    deadline: Optional[date] = None
    category: Optional[str] = None
    priority: Optional[str] = None
    op_type: Optional[Literal["in", "out"]] = None
