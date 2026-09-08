from typing import List, Optional
from sqlalchemy import Boolean, CheckConstraint, Integer, String, Float, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class Service(Base):
    __tablename__ = "services"
    __table_args__ = (
        CheckConstraint("booking_mode IN ('event', 'resource')", name="check_service_booking_mode"),
        CheckConstraint("buffer_before_min BETWEEN 0 AND 240", name="check_service_buffer_before_range"),
        CheckConstraint("buffer_after_min BETWEEN 0 AND 240", name="check_service_buffer_after_range"),
        # Длительность resource-услуги ограничена явно: 24 часа — потолок
        # первой версии Resource-доступности (HB-08 п.4). У event-услуг
        # ограничения нет — она не участвует в расчёте свободных интервалов.
        CheckConstraint(
            "booking_mode <> 'resource' OR (duration_min BETWEEN 1 AND 1440)",
            name="check_service_resource_duration_range",
        ),
    )

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

    # HB-02: механика записи этой услуги. event — на заранее созданное
    # занятие (в т.ч. старое "individual", заведённое как разовый occasion);
    # resource — клиент сам выбирает мастера и время (HB-08…10). Старые
    # услуги мигрируют в event и остаются им, пока owner не переключит явно
    # (AC-02) — `service_type` на это НЕ влияет, это отдельная ось (формат
    # обслуживания group/individual), не механика алгоритма.
    booking_mode: Mapped[str] = mapped_column(String(16), default="event", server_default="event")
    buffer_before_min: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    buffer_after_min: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    # Разрешена ли новая запись на эту услугу. False — история и уже
    # существующие resource-интервалы обслуживаются как прежде (AC-05),
    # каталог для НОВОЙ записи её не предлагает.
    is_bookable: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    # Пресет терминов конкретной услуги — переопределяет пресет студии в
    # смешанном бизнесе (HB-14). NULL — наследовать пресет студии.
    terminology_profile: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)

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
