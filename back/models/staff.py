from datetime import date as date_type, datetime
from typing import Optional

from sqlalchemy import (
    CheckConstraint, DateTime, Index, Integer, String, Boolean, Date, ForeignKey,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class StaffWorkingHours(Base):
    """Рабочие часы сотрудника — по студиям, а не «вообще».

    `studio_id` обязателен: тренер в двух студиях имеет два независимых графика,
    и правка расписания одной студией не должна затирать другую
    (docs/ROADMAP_ACCOUNTS, решение 7).
    """

    __tablename__ = "staff_working_hours"
    __table_args__ = (
        UniqueConstraint("user_id", "studio_id", "day_of_week", name="uq_staff_studio_day"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    day_of_week: Mapped[int] = mapped_column(Integer)
    is_open: Mapped[bool] = mapped_column(Boolean, default=True)
    open_time: Mapped[str] = mapped_column(String(5))
    close_time: Mapped[str] = mapped_column(String(5))

    user: Mapped["User"] = relationship(back_populates="staff_working_hours")


class StaffDayOverride(Base):
    """Отметка «работает / выходной» на конкретную дату — поверх недельного графика.

    Строки нет = день считается по недельному графику (`StaffWorkingHours`).
    Поэтому снятие отметки — удаление строки, а не третий статус в колонке.
    """

    __tablename__ = "staff_day_overrides"
    __table_args__ = (
        UniqueConstraint("user_id", "studio_id", "day", name="uq_staff_studio_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    day: Mapped[date_type] = mapped_column(Date)
    is_working: Mapped[bool] = mapped_column(Boolean, default=True)


class StaffBranchAssignment(Base):
    """К каким филиалам привязан сотрудник для Resource-записи (HB-05+).

    Нет строки — нет Resource-доступности сотрудника в этом филиале.
    Принадлежность НЕ выводится из последней брони/занятия — только из
    явного назначения владельца (docs/EPIC_HYBRID_BOOKING_IMPLEMENTATION.md §4.3).
    """

    __tablename__ = "staff_branch_assignments"
    __table_args__ = (
        UniqueConstraint("studio_id", "user_id", "branch_id", name="uq_staff_branch_assignment"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    branch_id: Mapped[int] = mapped_column(ForeignKey("studio_branches.id", ondelete="CASCADE"), index=True)


class StaffBusyInterval(Base):
    """Перерыв/отсутствие сотрудника — интервал, который HB-05/08 вычитают
    из Resource-доступности. Клиентских данных не содержит (§6.1).
    """

    __tablename__ = "staff_busy_intervals"
    __table_args__ = (
        CheckConstraint("end_time > start_time", name="check_staff_busy_interval_positive"),
        Index("ix_staff_busy_interval_studio_user_start", "studio_id", "user_id", "start_time"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    # Местное время сотрудника/студии со снимком зоны — тот же контракт, что
    # у Lesson.start_time/tz_iana (services/lesson_time), не UTC.
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=False))
    end_time: Mapped[datetime] = mapped_column(DateTime(timezone=False))
    tz_iana: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    reason: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
