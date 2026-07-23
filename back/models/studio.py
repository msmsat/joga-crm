from typing import List, Optional
from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class Studio(Base):
    __tablename__ = "studios"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    name: Mapped[str] = mapped_column(String(150))
    phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    business_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    business_subtype: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    website: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    address: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    logo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    timezone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    language: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    currency: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    date_format: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    first_day_of_week: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)

    journal_time_step: Mapped[int] = mapped_column(Integer, default=15)

    # Core
    branches: Mapped[List["StudioBranch"]] = relationship(back_populates="studio", cascade="all, delete-orphan")
    members: Mapped[List["StudioMember"]] = relationship(back_populates="studio", cascade="all, delete-orphan")
    clients: Mapped[List["Client"]] = relationship(back_populates="studio")
    lessons: Mapped[List["Lesson"]] = relationship(back_populates="studio")
    halls: Mapped[List["Hall"]] = relationship(back_populates="studio", cascade="all, delete-orphan")
    services: Mapped[List["Service"]] = relationship(back_populates="studio", cascade="all, delete-orphan")
    roles: Mapped[List["Role"]] = relationship(back_populates="studio", cascade="all, delete-orphan")

    # Settings
    working_hours: Mapped[List["StudioWorkingHours"]] = relationship(back_populates="studio", cascade="all, delete-orphan")
    notification_settings: Mapped[Optional["StudioNotificationSettings"]] = relationship(back_populates="studio", uselist=False, cascade="all, delete-orphan")
    notification_event_toggles: Mapped[List["NotificationEventToggle"]] = relationship(back_populates="studio", cascade="all, delete-orphan")
    booking_settings: Mapped[Optional["StudioBookingSettings"]] = relationship(back_populates="studio", uselist=False, cascade="all, delete-orphan")
    booking_channel_configs: Mapped[List["BookingChannelConfig"]] = relationship(back_populates="studio", cascade="all, delete-orphan")
    billing_plan: Mapped[Optional["StudioBillingPlan"]] = relationship(back_populates="studio", uselist=False, cascade="all, delete-orphan")
    billing_invoices: Mapped[List["BillingInvoice"]] = relationship(back_populates="studio", cascade="all, delete-orphan")
    integrations: Mapped[List["StudioIntegration"]] = relationship(back_populates="studio", cascade="all, delete-orphan")
    backup_settings: Mapped[Optional["StudioBackupSettings"]] = relationship(back_populates="studio", uselist=False, cascade="all, delete-orphan")

    # Finances
    accounts: Mapped[List["Account"]] = relationship(back_populates="studio", cascade="all, delete-orphan")
    operations: Mapped[List["Operation"]] = relationship(back_populates="studio", cascade="all, delete-orphan")
    counterparties: Mapped[List["Counterparty"]] = relationship(back_populates="studio", cascade="all, delete-orphan")
    fin_documents: Mapped[List["FinDocument"]] = relationship(back_populates="studio", cascade="all, delete-orphan")
    online_channels: Mapped[List["OnlineChannel"]] = relationship(back_populates="studio", cascade="all, delete-orphan")
    payment_method_configs: Mapped[List["PaymentMethodConfig"]] = relationship(back_populates="studio", cascade="all, delete-orphan")
    financial_goals: Mapped[List["FinancialGoal"]] = relationship(back_populates="studio", cascade="all, delete-orphan")
    salary_payments: Mapped[List["SalaryPayment"]] = relationship(back_populates="studio", cascade="all, delete-orphan")

    # AI
    ai_settings: Mapped[Optional["StudioAISettings"]] = relationship(back_populates="studio", uselist=False, cascade="all, delete-orphan")
    ai_chat_sessions: Mapped[List["AIChatSession"]] = relationship(back_populates="studio", cascade="all, delete-orphan")

    # Reports
    products: Mapped[List["Product"]] = relationship(back_populates="studio", cascade="all, delete-orphan")
    events: Mapped[List["StudioEvent"]] = relationship(back_populates="studio", cascade="all, delete-orphan")
    reviews: Mapped[List["StudioReview"]] = relationship(back_populates="studio", cascade="all, delete-orphan")
    activity_logs: Mapped[List["ActivityLog"]] = relationship(back_populates="studio", cascade="all, delete-orphan")
    trainer_goals: Mapped[List["TrainerSalesGoal"]] = relationship(back_populates="studio", cascade="all, delete-orphan")

    # Loyalty
    loyalty_config: Mapped[Optional["StudioLoyaltyConfig"]] = relationship(back_populates="studio", uselist=False, cascade="all, delete-orphan")
    loyalty_levels: Mapped[List["LoyaltyLevel"]] = relationship(back_populates="studio", cascade="all, delete-orphan")
    discount_config: Mapped[Optional["StudioDiscountConfig"]] = relationship(back_populates="studio", uselist=False, cascade="all, delete-orphan")
    certificate_config: Mapped[Optional["StudioCertificateConfig"]] = relationship(back_populates="studio", uselist=False, cascade="all, delete-orphan")
    gift_certificates: Mapped[List["GiftCertificate"]] = relationship(back_populates="studio", cascade="all, delete-orphan")
    subscription_program_config: Mapped[Optional["StudioSubscriptionProgramConfig"]] = relationship(back_populates="studio", uselist=False, cascade="all, delete-orphan")
    referral_config: Mapped[Optional["StudioReferralConfig"]] = relationship(back_populates="studio", uselist=False, cascade="all, delete-orphan")
    referral_records: Mapped[List["ReferralRecord"]] = relationship(back_populates="studio", cascade="all, delete-orphan")
    promo_codes: Mapped[List["StudioPromoCode"]] = relationship(back_populates="studio", cascade="all, delete-orphan")
    loyalty_scenarios: Mapped[List["LoyaltyScenario"]] = relationship(back_populates="studio", cascade="all, delete-orphan")
    client_offers: Mapped[List["ClientOffer"]] = relationship(back_populates="studio", cascade="all, delete-orphan")
