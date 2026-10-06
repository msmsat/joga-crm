"""Weekly plans generate ordinary journal lessons with durable occurrence identities."""
from datetime import date
from typing import Optional
from sqlalchemy import Boolean, CheckConstraint, Date, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from .base import Base


class RecurringLessonTemplate(Base):
    __tablename__ = 'recurring_lesson_templates'
    __table_args__ = (
        UniqueConstraint('studio_id', 'key', name='uq_recurring_template_key'),
        CheckConstraint('weekday BETWEEN 0 AND 6 AND start_minute BETWEEN 0 AND 1439', name='check_recurring_slot'),
        CheckConstraint('duration_min > 0 AND total_spots BETWEEN 1 AND 50 AND price >= 0', name='check_recurring_values'),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey('studios.id', ondelete='CASCADE'), index=True)
    key: Mapped[str] = mapped_column(String(100))
    service_id: Mapped[int] = mapped_column(ForeignKey('services.id', ondelete='CASCADE'))
    teacher_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'))
    hall_id: Mapped[int] = mapped_column(ForeignKey('halls.id', ondelete='CASCADE'))
    weekday: Mapped[int] = mapped_column(Integer)
    start_minute: Mapped[int] = mapped_column(Integer)
    duration_min: Mapped[int] = mapped_column(Integer)
    total_spots: Mapped[int] = mapped_column(Integer)
    price: Mapped[int] = mapped_column(Integer)
    starts_on: Mapped[date] = mapped_column(Date)
    ends_on: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default='true')


class RecurringLessonOccurrence(Base):
    __tablename__ = 'recurring_lesson_occurrences'
    __table_args__ = (UniqueConstraint('template_id', 'local_date', name='uq_recurring_occurrence'),)
    id: Mapped[int] = mapped_column(primary_key=True)
    template_id: Mapped[int] = mapped_column(ForeignKey('recurring_lesson_templates.id', ondelete='CASCADE'), index=True)
    local_date: Mapped[date] = mapped_column(Date)
    # SET NULL retains a tombstone when the owner deletes the generated lesson.
    lesson_id: Mapped[Optional[int]] = mapped_column(ForeignKey('lessons.id', ondelete='SET NULL'), nullable=True, unique=True)

