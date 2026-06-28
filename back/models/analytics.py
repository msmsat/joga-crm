from datetime import date
from typing import Optional
from sqlalchemy import Integer, Float, Date, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class DailyMetricSnapshot(Base):
    __tablename__ = "daily_metric_snapshots"
    __table_args__ = (UniqueConstraint("studio_id", "date", name="uq_daily_snapshot_studio_date"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    date: Mapped[date] = mapped_column(Date, index=True)

    revenue: Mapped[int] = mapped_column(Integer, default=0)
    new_clients: Mapped[int] = mapped_column(Integer, default=0)
    total_bookings: Mapped[int] = mapped_column(Integer, default=0)
    cancelled_bookings: Mapped[int] = mapped_column(Integer, default=0)
    retention_rate: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    studio: Mapped["Studio"] = relationship()
