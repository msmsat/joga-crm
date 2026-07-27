from datetime import datetime
from typing import List, Optional
from sqlalchemy import Integer, String, Float, Boolean, DateTime, ForeignKey, JSON, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class StudioWorkingHours(Base):
    __tablename__ = "studio_working_hours"
    __table_args__ = (UniqueConstraint("studio_id", "day_of_week", name="uq_studio_day"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    day_of_week: Mapped[int] = mapped_column(Integer)
    is_open: Mapped[bool] = mapped_column(Boolean, default=True)
    open_time: Mapped[str] = mapped_column(String(5))
    close_time: Mapped[str] = mapped_column(String(5))

    studio: Mapped["Studio"] = relationship(back_populates="working_hours")


class StudioNotificationSettings(Base):
    __tablename__ = "studio_notification_settings"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), unique=True, index=True)
    telegram_notifications: Mapped[bool] = mapped_column(Boolean, default=True)
    instagram_notifications: Mapped[bool] = mapped_column(Boolean, default=False)
    whatsapp_notifications: Mapped[bool] = mapped_column(Boolean, default=True)
    email_notifications: Mapped[bool] = mapped_column(Boolean, default=True)
    sms_notifications: Mapped[bool] = mapped_column(Boolean, default=False)
    push_notifications: Mapped[bool] = mapped_column(Boolean, default=False)
    marketing_emails: Mapped[bool] = mapped_column(Boolean, default=True)
    primary_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    backup_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    studio: Mapped["Studio"] = relationship(back_populates="notification_settings")


class NotificationEventToggle(Base):
    __tablename__ = "notification_event_toggles"
    __table_args__ = (
        UniqueConstraint("studio_id", "role", "event_id", "channel_key", name="uq_notif_toggle"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(20))
    event_id: Mapped[str] = mapped_column(String(10))
    channel_key: Mapped[str] = mapped_column(String(20))
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=False)

    studio: Mapped["Studio"] = relationship(back_populates="notification_event_toggles")


class UserNotificationPreference(Base):
    """Личный слой настроек уведомлений (EPIC 3): сотрудник может только
    сузить набор каналов, и только у optional-событий своей роли —
    operational/critical этот слой не затрагивает (см. notification_resolver)."""
    __tablename__ = "user_notification_preferences"
    __table_args__ = (
        UniqueConstraint("user_id", "event_id", "channel_key", name="uq_user_notif_pref"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    event_id: Mapped[str] = mapped_column(String(10))
    channel_key: Mapped[str] = mapped_column(String(20))
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)

    user: Mapped["User"] = relationship(back_populates="notification_preferences")


class StudioBookingSettings(Base):
    __tablename__ = "studio_booking_settings"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), unique=True, index=True)

    booking_active: Mapped[bool] = mapped_column(Boolean, default=True)
    prefill_on_booking: Mapped[bool] = mapped_column(Boolean, default=True)
    trainer_confirmation_required: Mapped[bool] = mapped_column(Boolean, default=False)
    client_reminder_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    repeat_booking_allowed: Mapped[bool] = mapped_column(Boolean, default=False)

    min_booking_advance_min: Mapped[int] = mapped_column(Integer, default=120)
    booking_window_days: Mapped[int] = mapped_column(Integer, default=7)
    cancellation_deadline_min: Mapped[int] = mapped_column(Integer, default=240)

    widget_accent_color: Mapped[str] = mapped_column(String(7), default="#FCAE91")
    widget_logo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    widget_dark_mode: Mapped[bool] = mapped_column(Boolean, default=False)
    widget_language: Mapped[str] = mapped_column(String(5), default="ru")

    sms_confirmation: Mapped[bool] = mapped_column(Boolean, default=True)
    reminder_24h: Mapped[bool] = mapped_column(Boolean, default=True)
    reminder_2h: Mapped[bool] = mapped_column(Boolean, default=True)
    review_request: Mapped[bool] = mapped_column(Boolean, default=True)

    miniapp_generated: Mapped[bool] = mapped_column(Boolean, default=False)
    widget_work_start: Mapped[str] = mapped_column(String(5), default="09:00")
    widget_work_end: Mapped[str] = mapped_column(String(5), default="21:00")
    slot_step_min: Mapped[int] = mapped_column(Integer, default=60)

    studio: Mapped["Studio"] = relationship(back_populates="booking_settings")


class BookingChannelConfig(Base):
    __tablename__ = "booking_channel_configs"
    __table_args__ = (
        UniqueConstraint("studio_id", "channel_type", name="uq_booking_channel"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    channel_type: Mapped[str] = mapped_column(String(20))
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    connected_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=False), nullable=True)
    config: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    studio: Mapped["Studio"] = relationship(back_populates="booking_channel_configs")


class StudioBillingPlan(Base):
    __tablename__ = "studio_billing_plans"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), unique=True, index=True)
    plan_name: Mapped[str] = mapped_column(String(100))
    billing_cycle: Mapped[str] = mapped_column(String(20), default="monthly")
    status: Mapped[str] = mapped_column(String(20), default="active")
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=False), nullable=True)
    max_staff: Mapped[int] = mapped_column(Integer, default=5)

    billing_mode: Mapped[str] = mapped_column(String(20), default="subscription")
    percent_rate: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    fixed_base_amount: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    auto_renewal: Mapped[bool] = mapped_column(Boolean, default=True)
    email_receipt_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    notify_before_days: Mapped[int] = mapped_column(Integer, default=3)
    sms_notification_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    notify_before_autocharge: Mapped[bool] = mapped_column(Boolean, default=True)

    studio: Mapped["Studio"] = relationship(back_populates="billing_plan")


class PaymentCard(Base):
    __tablename__ = "payment_cards"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    card_last4: Mapped[str] = mapped_column(String(4))
    card_brand: Mapped[str] = mapped_column(String(20))
    card_expiry: Mapped[str] = mapped_column(String(5))
    cardholder_name: Mapped[str] = mapped_column(String(100))
    is_primary: Mapped[bool] = mapped_column(Boolean, default=True)
    rectoken: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    method_type: Mapped[str] = mapped_column(String(10), default="card")  # card | iban

    user: Mapped["User"] = relationship(back_populates="payment_cards")


class BillingInvoice(Base):
    __tablename__ = "billing_invoices"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    order_id: Mapped[Optional[str]] = mapped_column(String(100), unique=True, index=True, nullable=True)
    plan_name: Mapped[str] = mapped_column(String(100))
    period_months: Mapped[int] = mapped_column(Integer, default=1)
    amount: Mapped[int] = mapped_column(Integer)
    payment_method: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    paid_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), server_default=func.now())
    status: Mapped[str] = mapped_column(String(20), default="pending")
    pdf_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    studio: Mapped["Studio"] = relationship(back_populates="billing_invoices")
    user: Mapped[Optional["User"]] = relationship(back_populates="billing_invoices")


class UserSession(Base):
    __tablename__ = "user_sessions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    device: Mapped[str] = mapped_column(String(100))
    platform: Mapped[str] = mapped_column(String(20))
    browser: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    location_city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    location_country: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    last_active: Mapped[datetime] = mapped_column(DateTime(timezone=False), server_default=func.now())
    is_current: Mapped[bool] = mapped_column(Boolean, default=False)
    token_hash: Mapped[str] = mapped_column(String(255))

    user: Mapped["User"] = relationship(back_populates="sessions")


class StudioIntegration(Base):
    __tablename__ = "studio_integrations"
    __table_args__ = (UniqueConstraint("studio_id", "integration_type", name="uq_studio_integration"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    integration_type: Mapped[str] = mapped_column(String(30))
    is_connected: Mapped[bool] = mapped_column(Boolean, default=False)
    config: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), server_default=func.now(), onupdate=func.now())

    studio: Mapped["Studio"] = relationship(back_populates="integrations")
