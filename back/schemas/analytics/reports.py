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
