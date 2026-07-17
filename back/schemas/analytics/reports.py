from datetime import date, datetime
from typing import Optional

from schemas._base import BaseSchema


class SeriesPoint(BaseSchema):
    period: str
    value: int


class SummaryTrends(BaseSchema):
    revenue_pct: Optional[float] = None
    expenses_pct: Optional[float] = None
    active_clients_pct: Optional[float] = None
    bookings_pct: Optional[float] = None
    retention_pct: Optional[float] = None


class PeriodSummaryRead(BaseSchema):
    revenue: int
    expenses: int
    profit: int
    avg_check: int
    active_clients: int
    bookings: int
    retention: float
    attendance: int
    trends: SummaryTrends


class TrainerReportRow(BaseSchema):
    trainer_id: int
    name: str
    lessons_count: int
    revenue: int


class ServiceReportRow(BaseSchema):
    service: str
    revenue: int
    share_pct: float


class DailyMetricRead(BaseSchema):
    date: date
    revenue: int
    new_clients: int
    total_bookings: int
    cancelled_bookings: int
    retention_rate: float


class StudioReviewRead(BaseSchema):
    id: int
    client_id: Optional[int] = None
    author_name: str
    rating: int
    nps_score: Optional[int] = None
    text: Optional[str] = None
    source: str
    created_at: datetime


class StudioReviewCreate(BaseSchema):
    rating: int
    author_name: Optional[str] = None
    nps_score: Optional[int] = None
    text: Optional[str] = None
    source: str = "internal"
    client_id: Optional[int] = None


class ActivityLogRead(BaseSchema):
    id: int
    event_type: str
    title: str
    actor_name: str
    entity_type: Optional[str] = None
    color: str
    created_at: datetime
