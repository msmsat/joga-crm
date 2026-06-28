from datetime import datetime, date
from typing import List, Optional
from sqlalchemy import Integer, String, Boolean, DateTime, Date, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class StudioReview(Base):
    __tablename__ = "studio_reviews"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    client_id: Mapped[Optional[int]] = mapped_column(ForeignKey("clients.id", ondelete="SET NULL"), nullable=True, index=True)
    author_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    rating: Mapped[int] = mapped_column(Integer)
    nps_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    text: Mapped[Optional[str]] = mapped_column(String(2000), nullable=True)
    source: Mapped[str] = mapped_column(String(20), default="internal")
    lesson_id: Mapped[Optional[int]] = mapped_column(ForeignKey("lessons.id", ondelete="SET NULL"), nullable=True, index=True)
    event_id: Mapped[Optional[int]] = mapped_column(ForeignKey("studio_events.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), server_default=func.now())

    studio: Mapped["Studio"] = relationship(back_populates="reviews")
    client: Mapped[Optional["Client"]] = relationship()
    lesson: Mapped[Optional["Lesson"]] = relationship(foreign_keys=[lesson_id])
    event: Mapped[Optional["StudioEvent"]] = relationship(back_populates="reviews", foreign_keys=[event_id])


class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    event_type: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(200))
    actor_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    entity_type: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    entity_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    color: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), server_default=func.now(), index=True)

    studio: Mapped["Studio"] = relationship(back_populates="activity_logs")


class TrainerSalesGoal(Base):
    __tablename__ = "trainer_sales_goals"
    __table_args__ = (UniqueConstraint("user_id", "period_start", "period_end", name="uq_trainer_goal_period"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    period_start: Mapped[date] = mapped_column(Date)
    period_end: Mapped[date] = mapped_column(Date)
    target_revenue: Mapped[int] = mapped_column(Integer)
    target_sessions: Mapped[int] = mapped_column(Integer)
    actual_revenue: Mapped[int] = mapped_column(Integer, default=0)
    actual_sessions: Mapped[int] = mapped_column(Integer, default=0)

    studio: Mapped["Studio"] = relationship(back_populates="trainer_goals")
    user: Mapped["User"] = relationship(foreign_keys=[user_id])


class StudioTask(Base):
    __tablename__ = "studio_tasks"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    author_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    text: Mapped[str] = mapped_column(String(500))
    priority: Mapped[str] = mapped_column(String(10), default="medium")
    tag: Mapped[str] = mapped_column(String(50), default="Клиент")
    is_done: Mapped[bool] = mapped_column(Boolean, default=False)
    done_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=False), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), server_default=func.now())

    studio: Mapped["Studio"] = relationship()
    author: Mapped[Optional["User"]] = relationship()
