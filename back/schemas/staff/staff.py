from datetime import datetime
from typing import Optional, List, Dict
from pydantic import Field, model_validator
from schemas._base import BaseSchema
from schemas.common import Page


class StaffHall(BaseSchema):
    id: int
    name: str
    color: Optional[str] = None


class StaffBranchItem(BaseSchema):
    """Назначение сотрудника на филиал (HB-05) — Resource-доступность вне
    этого списка не считается: нет строки, нет доступности (§4.3)."""
    id: int
    name: str


class StaffBusyIntervalItem(BaseSchema):
    id: int
    start_time: datetime
    end_time: datetime
    reason: Optional[str] = None


class StaffBusyIntervalCreate(BaseSchema):
    start_time: datetime
    end_time: datetime
    reason: Optional[str] = None

    @model_validator(mode="after")
    def _end_after_start(self) -> "StaffBusyIntervalCreate":
        if self.end_time <= self.start_time:
            raise ValueError("Конец перерыва должен быть позже начала")
        return self


class StaffServiceItem(BaseSchema):
    id: int
    name: str
    # Цена услуги В КАТАЛОГЕ — отправная точка, от которой владелец назначает
    # индивидуальную.
    base_price: int = 0
    # Что реально заплатит клиент ЭТОМУ мастеру.
    price: int = 0
    # Цену выставили руками. Интерфейс обязан отличать её от унаследованной:
    # унаследованная поедет за правкой Каталога, своя — нет.
    price_custom: bool = False
    # Длительность — по тем же трём полям, что и цена.
    base_duration_min: int = 0
    duration_min: int = 0
    duration_custom: bool = False


class StaffBreakItem(BaseSchema):
    open_time: str = Field(pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    close_time: str = Field(pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    label: Optional[str] = Field(default=None, max_length=200)


class StaffWorkingHoursItem(BaseSchema):
    day_of_week: int   # 0=Пн … 6=Вс
    is_open: bool
    open_time: str     # "HH:MM"
    close_time: str    # "HH:MM"
    breaks: List[StaffBreakItem] = Field(default_factory=list)
    off_label: Optional[str] = Field(default=None, max_length=200)

    @model_validator(mode="after")
    def valid_shift(self):
        import re
        from services.staff_hours import break_bounds, shift_bounds
        from datetime import date
        if not 0 <= self.day_of_week <= 6:
            raise ValueError("Некорректный день недели")
        if any(not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", value) for value in (self.open_time,self.close_time)):
            raise ValueError("Время должно быть в формате ЧЧ:ММ")
        if not self.is_open:
            self.breaks = []
            return self
        anchor = date(2026,1,5)
        start,end = shift_bounds(self,anchor)
        cursor=start
        for bs,be,_ in break_bounds(self,anchor):
            if bs < cursor or bs < start or be > end or bs == be:
                raise ValueError("Перерывы должны быть внутри смены и не пересекаться")
            cursor=be
        if sum(int((be-bs).total_seconds()) for bs,be,_ in break_bounds(self,anchor)) >= int((end-start).total_seconds()):
            raise ValueError("Укажите хотя бы один рабочий период")
        return self


class StaffTodayLesson(BaseSchema):
    id: int
    name: str
    start_time: str    # "HH:MM"
    duration_min: int
    booked_count: int
    total_spots: int
    hall: Optional[StaffHall] = None


class StaffMonthLesson(BaseSchema):
    id: int
    name: str
    start_time: str    # ISO datetime
    duration_min: int
    status: str
    total_spots: int
    booked_count: int
    hall: Optional[StaffHall] = None


class StaffStats(BaseSchema):
    total_bookings: int
    total_attended: int
    load_percent: int
    total_revenue: float


class StaffListItem(BaseSchema):
    id: int
    name: str
    last_name: Optional[str] = None
    email: str
    phone: Optional[str] = None
    role: str
    department: Optional[str] = None
    is_online: bool
    # False — приглашение отправлено, но сотрудник ещё не задал пароль и не вошёл.
    is_active: bool = True
    # Мастер: роль «Тренер» либо владелец с назначенными услугами
    # (services/members.is_specialist_clause). По одной роли этого не видно,
    # поэтому флаг считает сервер — журнал по нему рисует колонки.
    is_specialist: bool = False
    photo_url: Optional[str] = None
    avatar_gradient: Optional[str] = None
    # Цвет в журнале (StudioMember.color). NULL — у строк из сидов; интерфейс
    # тогда берёт цвет палитры по id.
    color: Optional[str] = None


class StaffSummary(BaseSchema):
    total: int
    online: int
    by_role: Dict[str, int]


class StaffListResponse(BaseSchema):
    summary: StaffSummary
    staff: Page[StaffListItem]


class StaffProfileResponse(BaseSchema):
    id: int
    name: str
    last_name: Optional[str] = None
    email: str
    phone: Optional[str] = None
    role: str
    department: Optional[str] = None
    # «О себе» — текст для клиентов мини-приложения.
    bio: Optional[str] = None
    is_online: bool
    is_active: bool
    # То же, что в StaffListItem, и по той же причине: по одной роли не видно,
    # мастер ли человек. Карточка смотрит сюда, решая, есть ли смысл в QR-коде
    # записи к нему.
    is_specialist: bool = False
    photo_url: Optional[str] = None
    avatar_gradient: Optional[str] = None
    color: Optional[str] = None
    salary: Optional[float] = None
    rate: Optional[float] = None
    rate_type: Optional[str] = None
    avg_rating: Optional[float] = None
    stats: StaffStats
    halls: List[StaffHall]
    services: List[StaffServiceItem]
    today_schedule: List[StaffTodayLesson]
    week_working_hours: List[StaffWorkingHoursItem]
    # HB-05: филиалы, где сотрудник доступен для Resource-записи.
    branches: List[StaffBranchItem] = []


class StaffMutateResponse(BaseSchema):
    ok: bool
    staff: StaffListItem
    # Заполнен только при создании и повторной отправке: ссылка из письма, чтобы
    # владелец мог передать её сотруднику руками, если почта не дошла.
    invite_url: Optional[str] = None


class StaffWeekScheduleResponse(BaseSchema):
    staff_id: int
    working_hours: List[StaffWorkingHoursItem]


class StaffDayOverrideItem(BaseSchema):
    date: str          # "YYYY-MM-DD"
    is_working: bool


class StaffDayOverrideRequest(BaseSchema):
    date: str
    # None — снять отметку: день снова считается по недельному графику.
    is_working: Optional[bool] = None


class StaffMonthScheduleResponse(BaseSchema):
    staff_id: int
    year: int
    month: int
    lessons: List[StaffMonthLesson]
    day_overrides: List[StaffDayOverrideItem] = []


class StaffTodayScheduleResponse(BaseSchema):
    staff_id: int
    date: str
    lessons: List[StaffTodayLesson]


class StaffCancelLessonResponse(BaseSchema):
    ok: bool
    lesson_id: int
    cancelled_reservations: int


class StaffMessageResponse(BaseSchema):
    ok: bool
    channel: str
    recipient: Optional[str] = None
    staff_id: int


class StaffCallResponse(BaseSchema):
    ok: bool
    channel: str
    phone: str
    staff_id: int


class StaffScheduleEditorRequest(BaseSchema):
    week_start: str
    repeat_weekly: bool = False
    days: List[StaffWorkingHoursItem] = Field(min_length=1,max_length=7)

    @model_validator(mode="after")
    def unique_days(self):
        if len({d.day_of_week for d in self.days}) != len(self.days):
            raise ValueError("Дни недели не должны повторяться")
        return self
