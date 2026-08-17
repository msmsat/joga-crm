from datetime import datetime
from typing import List, Optional
from sqlalchemy import Integer, String, Boolean, DateTime, Float, JSON, ForeignKey, CheckConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class Hall(Base):
    __tablename__ = "halls"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    branch_id: Mapped[Optional[int]] = mapped_column(ForeignKey("studio_branches.id", ondelete="SET NULL"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(100))
    color: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)
    capacity: Mapped[int] = mapped_column(Integer, default=20)
    area: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    equipment: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    hourly_rate: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    is_online: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    photo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    studio: Mapped["Studio"] = relationship(back_populates="halls")
    branch: Mapped[Optional["StudioBranch"]] = relationship(back_populates="halls")
    lessons: Mapped[List["Lesson"]] = relationship(back_populates="hall")


class Lesson(Base):
    __tablename__ = "lessons"
    __table_args__ = (CheckConstraint("status IN ('confirmed', 'pending', 'cancelled')", name="check_lesson_status"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    teacher_name: Mapped[str] = mapped_column(String(100))
    teacher_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    hall_id: Mapped[Optional[int]] = mapped_column(ForeignKey("halls.id", ondelete="SET NULL"), nullable=True, index=True)
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=False))
    duration_min: Mapped[int] = mapped_column(Integer, default=60)
    price: Mapped[int] = mapped_column(Integer)
    level: Mapped[str] = mapped_column(String(50))
    equipment: Mapped[str] = mapped_column(String(50))
    total_spots: Mapped[int] = mapped_column(Integer, default=8)
    service_id: Mapped[Optional[int]] = mapped_column(ForeignKey("services.id", ondelete="SET NULL"), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(20), default="confirmed")
    cancel_reason: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    clients_notified: Mapped[bool] = mapped_column(Boolean, default=False)
    gcal_event_id: Mapped[Optional[str]] = mapped_column(String(120), nullable=True, index=True)

    studio: Mapped["Studio"] = relationship(back_populates="lessons")
    hall: Mapped[Optional["Hall"]] = relationship(back_populates="lessons")
    teacher: Mapped[Optional["User"]] = relationship(foreign_keys=[teacher_id])
    service: Mapped[Optional["Service"]] = relationship(foreign_keys=[service_id])
    reservations: Mapped[List["Reservation"]] = relationship(back_populates="lesson", cascade="all, delete-orphan")


class Reservation(Base):
    __tablename__ = "reservations"
    # pending — «Подтверждение тренером» в правилах записи: место уже держится,
    # решение студии ещё нет (routers/booking/miniapp_lessons.create_reservation).
    __table_args__ = (CheckConstraint("status IN ('active', 'pending', 'cancelled', 'attended')", name="check_reservation_status"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"))
    lesson_id: Mapped[int] = mapped_column(ForeignKey("lessons.id", ondelete="CASCADE"))
    spot_number: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="active")
    rating: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    review_text: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), server_default=func.now())
    booking_channel: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    # Абонемент, с которого списано занятие при записи. Отмена возвращает занятие
    # ровно на него и обнуляет ссылку (services/subscription_charge.py). Null —
    # запись без абонемента (разовая) или уже возвращённая.
    subscription_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("client_subscriptions.id", ondelete="SET NULL"), nullable=True, index=True
    )
    cancelled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=False), nullable=True)
    cancellation_reason: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    # «Кофе после занятия»: клиент согласился остаться на 15 минут с группой.
    # Отдельной таблицы участников нет намеренно — согласие имеет смысл только
    # вместе с бронью, и отмена записи (status != 'active') убирает человека из
    # списка сама, без второго кода отмены.
    coffee: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    # Подаренное первое занятие («Первое занятие бесплатно» в правилах записи).
    # Флаг нужен именно на брони, а не выводится из «это первая бронь клиента»:
    # ко второй записи первая уже существует, и задним числом отличить подарок от
    # обычного визита было бы нечем — ни в Журнале, ни в отчётах.
    is_trial: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    # Долг за эту бронь: ClientPayment в статусе pending (оплата на месте).
    # Ссылка на брони, а не reservation_id на платеже: при включённой «Повторной
    # записи» у клиента бывает две брони на одно занятие, и по паре
    # client+lesson долги не различить. NULL — платить нечего (абонемент,
    # пробное) либо долг уже погашен и отвязан.
    debt_payment_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("client_payments.id", ondelete="SET NULL"), nullable=True, index=True
    )

    client: Mapped["Client"] = relationship(back_populates="reservations")
    lesson: Mapped["Lesson"] = relationship(back_populates="reservations")
