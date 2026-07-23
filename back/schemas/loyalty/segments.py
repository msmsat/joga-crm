"""Схемы сегментов (V5-4, задача 5). Сегменты не хранятся — считаются на лету,
поэтому это только Read-схемы ответа GET /loyalty/segments и body кампании."""
from typing import Literal, Optional

from pydantic import Field

from schemas._base import BaseSchema

SegmentKey = Literal["at_risk", "vip_idle", "expiring_subscription", "lost_newcomers", "upsell_candidates"]


class SegmentClientPreview(BaseSchema):
    client_id: int
    name: str
    days_inactive: Optional[int] = None


class SegmentRead(BaseSchema):
    key: str
    count: int
    preview: list[SegmentClientPreview]


class CampaignCreate(BaseSchema):
    """Кампания по сегменту (задача 6): начислить баллы и/или разослать письмо."""
    action: Literal["points", "email"]
    points: Optional[int] = Field(default=None, ge=1)
    message: Optional[str] = None


class CampaignResult(BaseSchema):
    processed: int
    emails_sent: int


class RetentionMonth(BaseSchema):
    month: str       # "YYYY-MM"
    sold: int        # абонементов продано в этот месяц
    renewed: int     # из них — продлений (клиент уже покупал раньше)


class RetentionRead(BaseSchema):
    renewal_rate: int             # % продливших (0–100)
    avg_packages_per_client: float
    has_data: bool                # есть ли вообще продажи с датой (для empty-state)
    months: list[RetentionMonth]  # 6 месяцев
