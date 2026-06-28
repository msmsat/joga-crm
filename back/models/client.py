from datetime import datetime, date
from typing import List, Optional
from sqlalchemy import BigInteger, Integer, String, DateTime, Date, Boolean, ForeignKey, CheckConstraint, Text, JSON, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class Client(Base):
    __tablename__ = "clients"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    tg_id: Mapped[Optional[int]] = mapped_column(BigInteger, unique=True, index=True, nullable=True)
    name: Mapped[str] = mapped_column(String(100))
    last_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    birth_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    avatar_color: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="new")
    tags: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    last_visit_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    registration_date: Mapped[datetime] = mapped_column(DateTime(timezone=False), server_default=func.now())
    notifs_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    reminders_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    source: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)

    studio: Mapped["Studio"] = relationship(back_populates="clients")
    subscriptions: Mapped[List["ClientSubscription"]] = relationship(back_populates="client", cascade="all, delete-orphan")
    reservations: Mapped[List["Reservation"]] = relationship(back_populates="client", cascade="all, delete-orphan")
    payments: Mapped[List["ClientPayment"]] = relationship(back_populates="client", cascade="all, delete-orphan")
    operations: Mapped[List["Operation"]] = relationship(back_populates="client", cascade="all, delete-orphan")
    loyalty_card: Mapped[Optional["ClientLoyaltyCard"]] = relationship(back_populates="client", uselist=False, cascade="all, delete-orphan")
    loyalty_transactions: Mapped[List["LoyaltyPointTransaction"]] = relationship(back_populates="client", cascade="all, delete-orphan")
    certificates: Mapped[List["GiftCertificate"]] = relationship(back_populates="client", foreign_keys="[GiftCertificate.client_id]")
    referral_records: Mapped[List["ReferralRecord"]] = relationship(back_populates="referrer", foreign_keys="[ReferralRecord.referrer_client_id]")
    notes: Mapped[List["ClientNote"]] = relationship(back_populates="client", cascade="all, delete-orphan")


class ClientSubscription(Base):
    __tablename__ = "client_subscriptions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"))
    type: Mapped[str] = mapped_column(String(100))
    total_classes: Mapped[int] = mapped_column(Integer)
    used_classes: Mapped[int] = mapped_column(Integer, default=0)
    expires_at: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), default="active")
    is_frozen: Mapped[bool] = mapped_column(Boolean, default=False)
    frozen_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=False), nullable=True)
    freeze_until: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=False), nullable=True)

    client: Mapped["Client"] = relationship(back_populates="subscriptions")


class ClientPayment(Base):
    __tablename__ = "client_payments"
    __table_args__ = (CheckConstraint("status IN ('success', 'pending', 'failed')", name="check_payment_status"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"))
    amount: Mapped[int] = mapped_column(Integer)
    description: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(20), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), server_default=func.now())
    action_type: Mapped[str] = mapped_column(String(50))
    item_key: Mapped[str] = mapped_column(String(50))

    client: Mapped["Client"] = relationship(back_populates="payments")


class ClientNote(Base):
    __tablename__ = "client_notes"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"), index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    author_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=False), nullable=True)

    client: Mapped["Client"] = relationship(back_populates="notes")
    author: Mapped[Optional["User"]] = relationship()
