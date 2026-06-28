from typing import List, Optional
from sqlalchemy import Integer, String, Float, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class Service(Base):
    __tablename__ = "services"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(150))
    description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    price: Mapped[int] = mapped_column(Integer)
    duration_min: Mapped[int] = mapped_column(Integer, default=60)
    category: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    service_type: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    color: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)
    max_clients: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    bookings_count: Mapped[int] = mapped_column(Integer, default=0)
    revenue_total: Mapped[int] = mapped_column(Integer, default=0)

    studio: Mapped["Studio"] = relationship(back_populates="services")
    users: Mapped[List["User"]] = relationship(secondary="user_services", back_populates="services")
    schedule_slots: Mapped[List["ServiceScheduleSlot"]] = relationship(back_populates="service", cascade="all, delete-orphan")


class ServiceScheduleSlot(Base):
    __tablename__ = "service_schedule_slots"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    service_id: Mapped[int] = mapped_column(ForeignKey("services.id", ondelete="CASCADE"), index=True)
    day_of_week: Mapped[int] = mapped_column(Integer)
    start_time: Mapped[str] = mapped_column(String(5))
    end_time: Mapped[str] = mapped_column(String(5))

    service: Mapped["Service"] = relationship(back_populates="schedule_slots")
