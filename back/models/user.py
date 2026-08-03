from datetime import date, datetime
from typing import List, Optional
from sqlalchemy import Integer, BigInteger, String, Float, Boolean, Date, DateTime, ForeignKey, Index, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class User(Base):
    """Аккаунт = личность, глобальная на весь продукт (модель Google/YouTube).

    Контакт — идентификатор этой личности, поэтому email, телефон и telegram
    уникальны глобально. Связь со студиями — только через `StudioMember`, их
    может быть сколько угодно. См. docs/ROADMAP_ACCOUNTS.
    """

    __tablename__ = "users"

    # Уникальность держит БД, а не код: проверки в роутерах пробиваются гонкой
    # двух параллельных запросов, и любой новый эндпоинт может их забыть.
    # Телефон и telegram есть не у каждого, поэтому partial — несколько NULL
    # конфликтовать не должны. Значения канонизируются на записи (contact_format).
    __table_args__ = (
        Index(
            "uq_users_phone", "phone", unique=True,
            postgresql_where=text("phone IS NOT NULL AND phone <> ''"),
        ),
        Index(
            "uq_users_tg_id", "tg_id", unique=True,
            postgresql_where=text("tg_id IS NOT NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    email: Mapped[str] = mapped_column(String(255), index=True, unique=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    name: Mapped[str] = mapped_column(String(100))
    last_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    tg_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    ig_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    photo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    # avg_rating остаётся на аккаунте осознанно: это оценка человека, а не
    # настройка студии. Ставка, должность и график — на StudioMember
    # (docs/ROADMAP_ACCOUNTS, решение 7).
    avg_rating: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    verification_code: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    is_onboarded: Mapped[bool] = mapped_column(Boolean, default=False)
    last_online_at: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    two_fa_enabled: Mapped[bool] = mapped_column(Boolean, default=False)

    # OTP с TTL и скоупом действия (EPIC 5, задача 3) — для действий внутри
    # аккаунта (смена пароля, danger zone, 2FA). User.verification_code
    # (регистрация/восстановление пароля) остаётся отдельно, не трогаем.
    otp_code_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    otp_action: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    otp_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=False), nullable=True)
    otp_attempts: Mapped[int] = mapped_column(Integer, default=0)

    theme: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    accent_color: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)
    # Язык интерфейса — личный, рядом с темой. NULL значит «как в студии»
    # (Studio.language): владелец задаёт язык студии, а сотрудник может выбрать
    # себе другой, не трогая настройки студии.
    language: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)

    # Студия, в которой человек работал в прошлый раз: при входе токен минтится
    # сразу на неё, и мультистудийного пользователя не встречает /select-crm.
    # SET NULL — студию могли удалить; тогда выбор снова спросят.
    last_studio_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("studios.id", ondelete="SET NULL"), nullable=True
    )

    account_label: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    avatar_gradient: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    primary_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    studio_memberships: Mapped[List["StudioMember"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    sessions: Mapped[List["UserSession"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    payment_cards: Mapped[List["PaymentCard"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    billing_invoices: Mapped[List["BillingInvoice"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    staff_working_hours: Mapped[List["StaffWorkingHours"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    salary_payments: Mapped[List["SalaryPayment"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    services: Mapped[List["Service"]] = relationship(secondary="user_services", back_populates="users")
    ai_chat_sessions: Mapped[List["AIChatSession"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    notification_preferences: Mapped[List["UserNotificationPreference"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    primary_account: Mapped[Optional["User"]] = relationship(
        "User", foreign_keys="[User.primary_user_id]", back_populates="linked_accounts", remote_side="[User.id]"
    )
    linked_accounts: Mapped[List["User"]] = relationship(
        "User", foreign_keys="[User.primary_user_id]", back_populates="primary_account"
    )
