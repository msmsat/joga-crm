"""«Время студии» — блок в журнале без занятия (services/time_blocks.py)."""
from datetime import datetime
from typing import Annotated, Optional

from pydantic import AfterValidator, BeforeValidator, Field, StringConstraints

from schemas._base import BaseSchema


def _squash(value: object) -> object:
    # Название пишут руками: двойной пробел и перевод строки в карточке
    # сетки выглядели бы дырой, а «   » — пустым блоком без подписи.
    return " ".join(value.split()) if isinstance(value, str) else value


def _local(value: datetime) -> datetime:
    # Местное время студии, как у занятий: момент с зоной здесь означал бы
    # второй часовой пояс, который сервер молча отбросил бы.
    if value.tzinfo is not None:
        raise ValueError("Время передаётся местным, без часового пояса")
    return value


Label = Annotated[str, BeforeValidator(_squash), StringConstraints(min_length=1, max_length=80)]
LocalTime = Annotated[datetime, AfterValidator(_local)]
Duration = Annotated[int, Field(ge=5, le=12 * 60)]


class StudioTimeCreate(BaseSchema):
    staff_id: int
    start_time: LocalTime
    duration_min: Duration
    label: Label


class StudioTimeUpdate(BaseSchema):
    """Меняются только присланные поля — перенос не трогает название."""
    staff_id: Optional[int] = None
    start_time: Optional[LocalTime] = None
    duration_min: Optional[Duration] = None
    label: Optional[Label] = None


class StudioTimeRead(BaseSchema):
    id: int
    staff_id: int
    start_time: datetime
    end_time: datetime
    duration_min: int
    label: Optional[str] = None
