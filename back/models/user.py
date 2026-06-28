from typing import List, Optional
from sqlalchemy import Integer, String, Float, Boolean, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    email: Mapped[str] = mapped_column(String(255), index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    name: Mapped[str] = mapped_column(String(100))
    last_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    photo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    salary: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    rate: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    rate_type: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    avg_rating: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    role_id: Mapped[Optional[int]] = mapped_column(ForeignKey("roles.id", ondelete="SET NULL"), nullable=True, index=True)

    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    verification_code: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    is_onboarded: Mapped[bool] = mapped_column(Boolean, default=False)
    is_online: Mapped[bool] = mapped_column(Boolean, default=False)

    two_fa_enabled: Mapped[bool] = mapped_column(Boolean, default=False)

    theme: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    accent_color: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)

    account_label: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    department: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    avatar_gradient: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    primary_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    studio_memberships: Mapped[List["StudioMember"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    role_obj: Mapped[Optional["Role"]] = relationship(foreign_keys=[role_id])
    sessions: Mapped[List["UserSession"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    api_tokens: Mapped[List["ApiToken"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    payment_cards: Mapped[List["PaymentCard"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    billing_invoices: Mapped[List["BillingInvoice"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    staff_working_hours: Mapped[List["StaffWorkingHours"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    salary_payments: Mapped[List["SalaryPayment"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    services: Mapped[List["Service"]] = relationship(secondary="user_services", back_populates="users")
    ai_chat_sessions: Mapped[List["AIChatSession"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    primary_account: Mapped[Optional["User"]] = relationship(
        "User", foreign_keys="[User.primary_user_id]", back_populates="linked_accounts", remote_side="[User.id]"
    )
    linked_accounts: Mapped[List["User"]] = relationship(
        "User", foreign_keys="[User.primary_user_id]", back_populates="primary_account"
    )
