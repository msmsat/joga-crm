"""«Время студии» — блок в журнале без занятия (services/time_blocks.py)."""
from datetime import datetime
from typing import Annotated, List, Literal, Optional

from pydantic import AfterValidator, BeforeValidator, Field, StringConstraints, model_validator

from schemas._base import BaseSchema
from schemas.photos import NotePhotos


def _squash(value: object) -> object:
    # Название пишут руками: двойной пробел и перевод строки в карточке
    # сетки выглядели бы дырой, а «   » — пустым блоком без подписи.
    return " ".join(value.split()) if isinstance(value, str) else value


def _trim(value: object) -> object:
    # Заметка из одних пробелов — это «заметки нет», а не пустая карточка.
    return value.strip() if isinstance(value, str) else value


def _local(value: datetime) -> datetime:
    # Местное время студии, как у занятий: момент с зоной здесь означал бы
    # второй часовой пояс, который сервер молча отбросил бы.
    if value.tzinfo is not None:
        raise ValueError("Время передаётся местным, без часового пояса")
    return value


Label = Annotated[str, BeforeValidator(_squash), StringConstraints(min_length=1, max_length=80)]
LocalTime = Annotated[datetime, AfterValidator(_local)]
Duration = Annotated[int, Field(ge=5, le=12 * 60)]
# Заметка — что сделать или подготовить; пустая строка значит «заметки нет».
# Перевод строки законен: это список дел, а не подпись в карточке сетки.
Notes = Annotated[str, BeforeValidator(_trim), Field(max_length=2000)]
# Снимки — только пути из загрузки (POST /studio/upload-note-photo), как у
# заметки занятия. Больше десятка к одной уборке не прикладывают.
Photos = Annotated[NotePhotos, Field(max_length=10)]
# Кого касается блок: один сотрудник или вся команда (планёрка).
StaffIds = Annotated[List[int], Field(min_length=1, max_length=200)]


class StudioTimeCreate(BaseSchema):
    """staff_ids — кого касается блок. staff_id — прежняя форма для одного
    сотрудника (ассистент, старые клиенты); оба вместе складываются."""
    staff_ids: Optional[StaffIds] = None
    staff_id: Optional[int] = None
    start_time: LocalTime
    duration_min: Duration
    label: Label
    notes: Notes = ""
    photos: Photos = []

    @model_validator(mode="after")
    def _who(self):
        ids = list(dict.fromkeys([*([self.staff_id] if self.staff_id is not None else []), *(self.staff_ids or [])]))
        if not ids:
            raise ValueError("Укажите, кого касается время студии")
        self.staff_ids = ids
        return self


class StudioTimeUpdate(BaseSchema):
    """Меняются только присланные поля — перенос не трогает название.
    staff_ids — новый состав блока целиком; staff_id — прежняя форма «передать
    другому сотруднику» для блока на одного."""
    staff_ids: Optional[StaffIds] = None
    staff_id: Optional[int] = None
    start_time: Optional[LocalTime] = None
    duration_min: Optional[Duration] = None
    label: Optional[Label] = None
    # "" и [] — «убрать заметку/снимки»; None — не трогать.
    notes: Optional[Notes] = None
    photos: Optional[Photos] = None

    @model_validator(mode="after")
    def _who(self):
        if self.staff_ids is None and self.staff_id is not None:
            self.staff_ids = [self.staff_id]
        return self


class OutsideHours(BaseSchema):
    """Кого блок застаёт вне рабочих часов — ставится, но об этом предупреждают."""
    staff_id: int
    kind: Literal["day_off", "off_hours", "break"]


class StudioTimeRead(BaseSchema):
    id: int
    staff_id: int
    start_time: datetime
    end_time: datetime
    duration_min: int
    label: Optional[str] = None
    notes: str = ""
    photos: List[str] = []
    # Кого касается и интервалы по сотрудникам (id — первого из них).
    staff_ids: List[int] = []
    ids: List[int] = []
    outside_hours: List[OutsideHours] = []
