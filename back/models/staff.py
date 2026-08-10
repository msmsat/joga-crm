from datetime import date as date_type

from sqlalchemy import Integer, String, Boolean, Date, ForeignKey, UniqueConstraint
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
