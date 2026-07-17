from datetime import datetime, date
from typing import List, Optional
from sqlalchemy import Integer, String, Boolean, DateTime, Date, ForeignKey, JSON, CheckConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class StudioLoyaltyConfig(Base):
    __tablename__ = "studio_loyalty_configs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), unique=True, index=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    program_name: Mapped[str] = mapped_column(String(100), default="Velora Club")
    points_exchange_rate: Mapped[int] = mapped_column(Integer, default=100)
    expiry_period: Mapped[str] = mapped_column(String(20), default="never")

    studio: Mapped["Studio"] = relationship(back_populates="loyalty_config")


class LoyaltyLevel(Base):
    __tablename__ = "loyalty_levels"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(50))
    color: Mapped[str] = mapped_column(String(7))
    min_threshold: Mapped[int] = mapped_column(Integer)
    max_threshold: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    studio: Mapped["Studio"] = relationship(back_populates="loyalty_levels")
    client_cards: Mapped[List["ClientLoyaltyCard"]] = relationship(back_populates="level")


class ClientLoyaltyCard(Base):
    __tablename__ = "client_loyalty_cards"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"), unique=True, index=True)
    level_id: Mapped[Optional[int]] = mapped_column(ForeignKey("loyalty_levels.id", ondelete="SET NULL"), nullable=True)
    points_balance: Mapped[int] = mapped_column(Integer, default=0)
    total_spent: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), server_default=func.now())

    client: Mapped["Client"] = relationship(back_populates="loyalty_card")
    level: Mapped[Optional["LoyaltyLevel"]] = relationship(back_populates="client_cards")


class LoyaltyPointTransaction(Base):
    __tablename__ = "loyalty_point_transactions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"), index=True)
    points: Mapped[int] = mapped_column(Integer)
    description: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), server_default=func.now())

    client: Mapped["Client"] = relationship(back_populates="loyalty_transactions")


class StudioDiscountConfig(Base):
    __tablename__ = "studio_discount_configs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), unique=True, index=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    discount_type: Mapped[str] = mapped_column(String(20), default="percentage")
    discount_value: Mapped[int] = mapped_column(Integer, default=10)
    min_purchase_amount: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    applies_to_all_services: Mapped[bool] = mapped_column(Boolean, default=True)
    stackable: Mapped[bool] = mapped_column(Boolean, default=False)
    visible_in_cabinet: Mapped[bool] = mapped_column(Boolean, default=True)

    studio: Mapped["Studio"] = relationship(back_populates="discount_config")


class StudioCertificateConfig(Base):
    __tablename__ = "studio_certificate_configs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), unique=True, index=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    cert_type: Mapped[str] = mapped_column(String(20), default="gift")
    expiry_days: Mapped[int] = mapped_column(Integer, default=365)
    denominations: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    service_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    studio: Mapped["Studio"] = relationship(back_populates="certificate_config")


class GiftCertificate(Base):
    __tablename__ = "gift_certificates"
    __table_args__ = (CheckConstraint("status IN ('active', 'used', 'expired')", name="check_cert_status"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    client_id: Mapped[Optional[int]] = mapped_column(ForeignKey("clients.id", ondelete="SET NULL"), nullable=True, index=True)
    recipient_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    code: Mapped[str] = mapped_column(String(50), unique=True)
    amount: Mapped[int] = mapped_column(Integer)
    cert_type: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20), default="active")
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), server_default=func.now())
    expires_at: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=False), nullable=True)

    studio: Mapped["Studio"] = relationship(back_populates="gift_certificates")
    client: Mapped[Optional["Client"]] = relationship(back_populates="certificates", foreign_keys=[client_id])


class StudioSubscriptionProgramConfig(Base):
    __tablename__ = "studio_subscription_program_configs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), unique=True, index=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    allow_freeze: Mapped[bool] = mapped_column(Boolean, default=True)
    allow_transfer: Mapped[bool] = mapped_column(Boolean, default=False)
    auto_renewal: Mapped[bool] = mapped_column(Boolean, default=False)

    studio: Mapped["Studio"] = relationship(back_populates="subscription_program_config")
    packages: Mapped[List["SubscriptionPackage"]] = relationship(back_populates="config", cascade="all, delete-orphan")


class SubscriptionPackage(Base):
    __tablename__ = "subscription_packages"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    config_id: Mapped[int] = mapped_column(ForeignKey("studio_subscription_program_configs.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    class_count: Mapped[int] = mapped_column(Integer)
    price: Mapped[int] = mapped_column(Integer)
    per_visit_price: Mapped[int] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    duration_days: Mapped[int] = mapped_column(Integer, default=90)
    service_ids: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)  # null = все занятия

    config: Mapped["StudioSubscriptionProgramConfig"] = relationship(back_populates="packages")


class StudioReferralConfig(Base):
    __tablename__ = "studio_referral_configs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), unique=True, index=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    referrer_bonus: Mapped[int] = mapped_column(Integer, default=50000)
    new_client_discount: Mapped[int] = mapped_column(Integer, default=15)
    trigger_condition: Mapped[str] = mapped_column(String(30), default="first_visit")
    bonus_type: Mapped[str] = mapped_column(String(20), default="points")

    studio: Mapped["Studio"] = relationship(back_populates="referral_config")


class ReferralRecord(Base):
    __tablename__ = "referral_records"
    __table_args__ = (CheckConstraint("status IN ('pending', 'completed', 'cancelled')", name="check_referral_status"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    referrer_client_id: Mapped[Optional[int]] = mapped_column(ForeignKey("clients.id", ondelete="SET NULL"), nullable=True, index=True)
    referred_client_id: Mapped[Optional[int]] = mapped_column(ForeignKey("clients.id", ondelete="SET NULL"), nullable=True, unique=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    bonus_paid: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), server_default=func.now())

    studio: Mapped["Studio"] = relationship(back_populates="referral_records")
    referrer: Mapped[Optional["Client"]] = relationship(back_populates="referral_records", foreign_keys=[referrer_client_id])
