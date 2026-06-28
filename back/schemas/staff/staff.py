from typing import Optional, List, Dict
from schemas._base import BaseSchema


class StaffHall(BaseSchema):
    id: int
    name: str
    color: Optional[str] = None


class StaffWorkingHoursItem(BaseSchema):
    day_of_week: int   # 0=Пн … 6=Вс
    is_open: bool
    open_time: str     # "HH:MM"
    close_time: str    # "HH:MM"


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
    photo_url: Optional[str] = None
    avatar_gradient: Optional[str] = None


class StaffSummary(BaseSchema):
    total: int
    online: int
    by_role: Dict[str, int]


class StaffListResponse(BaseSchema):
    summary: StaffSummary
    staff: List[StaffListItem]


class StaffProfileResponse(BaseSchema):
    id: int
    name: str
    last_name: Optional[str] = None
    email: str
    phone: Optional[str] = None
    role: str
    department: Optional[str] = None
    is_online: bool
    is_active: bool
    photo_url: Optional[str] = None
    avatar_gradient: Optional[str] = None
    salary: Optional[float] = None
    rate: Optional[float] = None
    rate_type: Optional[str] = None
    avg_rating: Optional[float] = None
    stats: StaffStats
    halls: List[StaffHall]
    today_schedule: List[StaffTodayLesson]
    week_working_hours: List[StaffWorkingHoursItem]


class StaffMutateResponse(BaseSchema):
    ok: bool
    staff: StaffListItem


class StaffWeekScheduleResponse(BaseSchema):
    staff_id: int
    working_hours: List[StaffWorkingHoursItem]


class StaffMonthScheduleResponse(BaseSchema):
    staff_id: int
    year: int
    month: int
    lessons: List[StaffMonthLesson]


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
