from typing import Optional

from schemas._base import BaseSchema


class HallCreate(BaseSchema):
    name: str
    capacity: int = 20
    area: Optional[float] = None
    color: Optional[str] = None
    equipment: Optional[list] = None
    hourly_rate: Optional[float] = None
    is_online: bool = False


class HallUpdate(BaseSchema):
    name: Optional[str] = None
    capacity: Optional[int] = None
    area: Optional[float] = None
    color: Optional[str] = None
    equipment: Optional[list] = None
    hourly_rate: Optional[float] = None
    is_online: Optional[bool] = None


class HallRead(BaseSchema):
    id: int
    name: str
    color: Optional[str] = None
    capacity: int
    is_online: bool
    is_active: bool
