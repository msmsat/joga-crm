from datetime import date, datetime
from typing import Any, Optional

from schemas._base import BaseSchema


class SeriesPoint(BaseSchema):
    period: str
    value: float


class Kpi(BaseSchema):
    value: float
    prev_pct: Optional[float] = None


class RevenueStructureRow(BaseSchema):
    category: str
    amount: int
    share_pct: float


class ClientDynamics(BaseSchema):
    new: Kpi
    returned: Kpi
    lost: Kpi


class Insight(BaseSchema):
    key: str
    severity: str
    params: dict[str, Any]
    action: str
    action_params: dict[str, Any]


class OverviewKpiSet(BaseSchema):
    revenue: Kpi
    profit: Kpi
    attendance: Kpi
    active_clients: Kpi
    fill_rate: Kpi


class OverviewRead(BaseSchema):
    kpi: OverviewKpiSet
    revenue_structure: list[RevenueStructureRow]
    client_dynamics: ClientDynamics
    insights: list[Insight]


class SalesKpi(BaseSchema):
    revenue: Kpi
    sales_count: Kpi
    avg_check: Kpi
    repeat_share_pct: Kpi
    renewals_pct: Kpi


class CategorySlice(BaseSchema):
    category: str
    amount: int
    count: int
    share_pct: float


class MethodSlice(BaseSchema):
    method: str
    amount: int
    count: int
    share_pct: float


class BuyerTypeGroup(BaseSchema):
    amount: int
    count: int


class BuyerTypeSlice(BaseSchema):
    new: BuyerTypeGroup
    returning: BuyerTypeGroup
    no_client: BuyerTypeGroup


class ProductRow(BaseSchema):
    product_id: Optional[int] = None
    name: Optional[str] = None
    sold: int
    revenue: int
    avg_check: int
    repeat_share_pct: float
    trend_pct: Optional[float] = None


class SalesRead(BaseSchema):
    kpi: SalesKpi
    by_category: list[CategorySlice]
    by_method: list[MethodSlice]
    by_buyer_type: BuyerTypeSlice
    products: list[ProductRow]
    insights: list[Insight]


class SalesSeriesPoint(BaseSchema):
    period: str
    revenue: int
    sales_count: int


class ClientsKpi(BaseSchema):
    new: Kpi
    returned: Kpi
    lost: Kpi
    retention_pct: Kpi
    avg_value: Kpi


class WeeklyPoint(BaseSchema):
    period: str
    new: int
    returned: int


class SegmentCount(BaseSchema):
    key: str
    count: int


class SegmentClientRow(BaseSchema):
    id: int
    name: str
    last_name: Optional[str] = None
    phone: Optional[str] = None
    last_visit_date: Optional[date] = None
    value: Optional[float] = None


class ClientsReportRead(BaseSchema):
    kpi: ClientsKpi
    weekly: list[WeeklyPoint]
    risk_segments: list[SegmentCount]
    loyal_segments: list[SegmentCount]
    insights: list[Insight]


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


class TeamKpi(BaseSchema):
    lessons_count: Kpi
    revenue_per_hour: Kpi
    avg_fill_pct: Kpi
    cancel_noshow_pct: Kpi
    avg_rating: Kpi


class TrainerRow(BaseSchema):
    trainer_id: int
    name: str
    lessons: int
    fill_pct: float
    attendance: int
    revenue: int
    return_rate_pct: float
    cancels: int
    noshows: int
    rating: Optional[float] = None
    load_pct: float


class TeamRead(BaseSchema):
    kpi: TeamKpi
    trainers: list[TrainerRow]
    insights: list[Insight]


class TrainerLoadPoint(BaseSchema):
    weekday: int
    lessons: int
    fill_pct: float


class TrainerTopLesson(BaseSchema):
    name: str
    held: int
    attendance: int
    fill_pct: float


class TrainerDetailRead(BaseSchema):
    revenue_series: list[SeriesPoint]
    load_by_weekday: list[TrainerLoadPoint]
    top_lessons: list[TrainerTopLesson]
    return_rate_pct: float
    returned_clients: int
    total_clients: int


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


class UtilizationKpi(BaseSchema):
    avg_fill_pct: Kpi
    free_spots: Kpi
    cancels: Kpi
    noshows: Kpi
    lost_revenue: Kpi


class HeatmapCell(BaseSchema):
    weekday: int
    hour: int
    fill_pct: float
    lessons: int
    attendance: int


class LessonSliceRow(BaseSchema):
    name: str
    revenue: int
    held: int
    fill_pct: float


class ChronicLowRow(BaseSchema):
    name: str
    weekday: int
    hour: int
    fill_pct: float
    weeks: int
    lesson_ids: list[int]


class HallUtilRow(BaseSchema):
    hall_id: int
    name: str
    fill_pct: float
    evening_idle_pct: float


class UtilizationRead(BaseSchema):
    kpi: UtilizationKpi
    heatmap: list[HeatmapCell]
    top_profitable: list[LessonSliceRow]
    top_filled: list[LessonSliceRow]
    chronic_low: list[ChronicLowRow]
    halls: list[HallUtilRow]
    insights: list[Insight]


class SlotLessonRow(BaseSchema):
    id: int
    date: date
    name: str
    teacher_name: str
    hall: Optional[str] = None
    occupied: int
    total_spots: int
    status: str


class ActivityLogRead(BaseSchema):
    id: int
    event_type: str
    title: str
    actor_name: str
    entity_type: Optional[str] = None
    color: str
    created_at: datetime
