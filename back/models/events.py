from datetime import datetime, date
from typing import List, Optional
from sqlalchemy import Integer, String, Boolean, DateTime, Date, ForeignKey, CheckConstraint, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class StudioEvent(Base):
    __tablename__ = "studio_events"
    __table_args__ = (CheckConstraint("status IN ('upcoming', 'completed', 'cancelled')", name="check_event_status"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    event_type: Mapped[str] = mapped_column(String(30))
    status: Mapped[str] = mapped_column(String(20), default="upcoming")
    event_date: Mapped[date] = mapped_column(Date)
    start_time: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
    duration_min: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    max_attendees: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    revenue: Mapped[int] = mapped_column(Integer, default=0)
    trainer_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    color: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), server_default=func.now())

    studio: Mapped["Studio"] = relationship(back_populates="events")
    trainer: Mapped[Optional["User"]] = relationship(foreign_keys=[trainer_id])
    attendees: Mapped[List["EventAttendee"]] = relationship(back_populates="event", cascade="all, delete-orphan")
    reviews: Mapped[List["StudioReview"]] = relationship(back_populates="event", cascade="all, delete-orphan")


class EventAttendee(Base):
    __tablename__ = "event_attendees"
    __table_args__ = (UniqueConstraint("event_id", "client_id", name="uq_event_client"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("studio_events.id", ondelete="CASCADE"), index=True)
    client_id: Mapped[Optional[int]] = mapped_column(ForeignKey("clients.id", ondelete="SET NULL"), nullable=True, index=True)
    guest_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    paid_amount: Mapped[int] = mapped_column(Integer, default=0)
    attended: Mapped[bool] = mapped_column(Boolean, default=False)

    event: Mapped["StudioEvent"] = relationship(back_populates="attendees")
    client: Mapped[Optional["Client"]] = relationship()
