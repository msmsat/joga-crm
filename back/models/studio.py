from typing import List, Optional
from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


def _public_code() -> str:
    """Код для ссылки мини-приложения. Генератор лежит в services/studio_link,
    здесь только импорт по месту: модели не должны тянуть за собой сервисы на
    уровне модуля (services импортируют models)."""
    from services.studio_link import generate_public_code
    return generate_public_code()


class Studio(Base):
    __tablename__ = "studios"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    # Как студия называется в публичной ссылке (`/s/<public_code>`) — случайные
    # буквы и цифры вместо порядкового id. Подробности и разрешение ссылки —
    # services/studio_link.py.
    public_code: Mapped[Optional[str]] = mapped_column(
        String(16), unique=True, index=True, nullable=True, default=_public_code,
    )

    name: Mapped[str] = mapped_column(String(150))
    phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    business_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    business_subtype: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    website: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    address: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    # Адрес студии по частям — ЗАПАСНОЙ источник местоположения для Stripe Tax:
    # свободного `address` налогу мало, без страны Customer роняет счёт с
    # automatic_tax целиком. Основной источник — профиль плательщика на АККАУНТЕ
    # владельца (User.billing_*): его собирает форма перед оплатой и требует
    # включение постоплаты, а онбординг эти поля не спрашивает вовсе, так что у
    # большинства студий они пустые. Порядок задан в
    # services/offline_fee_billing._ensure_studio_customer.
    country: Mapped[Optional[str]] = mapped_column(String(2), nullable=True)   # ISO-3166-1 alpha-2
    postal_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    # Город отдельным полем, хотя улица лежит в свободном `address`: Stripe печатает
    # адрес плательщика по частям (line1 / city / postal_code / country), и без city
    # на фактуре выходит «улица, индекс, страна» — адрес без города бухгалтерия
    # заворачивает.
    city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    # Номер плательщика НДС и регистрационный номер компании (DIČ и IČO в CZ/SK,
    # USt-IdNr и HRB в DE…) — СПРАВОЧНЫЕ поля карточки студии.
    #
    # В налоговом пути они НЕ участвуют, и это осознанно. Reverse charge включает
    # только номер, прошедший сверку с реестром ЕС, а сверять здесь нечем: форма
    # настроек принимает любую строку. Единственный проверяемый номер живёт на
    # аккаунте владельца (User.billing_vat_id + billing_vat_verified, сверка в
    # services/vies), и в Stripe уезжает только он. Отправлять отсюда значило бы
    # обнулять НДС по неподтверждённому номеру, а недобор снимают с ПЛАТФОРМЫ.
    vat_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)   # например CZ12345678
    company_id: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    logo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # УСТАРЕВШЕЕ: фиксированный сдвиг «UTC+2». Место им не описывается — у Праги
    # зимой +1, летом +2, — поэтому считать по нему «сегодня» и «в 19:00» можно
    # лишь приблизительно. Остаётся ради обратной совместимости: по нему до сих
    # пор работают студии, не заполнившие tz_iana (services/studio_time).
    timezone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    # Зона IANA — «Europe/Prague». Единственный источник правды о локальном
    # времени: правила перехода на летнее время приходят вместе с ней. Заполняет
    # владелец в настройках; вывести её из сдвига нельзя, поэтому поле
    # nullable и НИКОГДА не заполняется догадкой (см. scripts/timezones.py).
    tz_iana: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
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

    # Settings
    working_hours: Mapped[List["StudioWorkingHours"]] = relationship(back_populates="studio", cascade="all, delete-orphan")
    notification_settings: Mapped[Optional["StudioNotificationSettings"]] = relationship(back_populates="studio", uselist=False, cascade="all, delete-orphan")
    notification_event_toggles: Mapped[List["NotificationEventToggle"]] = relationship(back_populates="studio", cascade="all, delete-orphan")
    feature_flags: Mapped[List["StudioFeatureFlag"]] = relationship(back_populates="studio", cascade="all, delete-orphan")
    booking_settings: Mapped[Optional["StudioBookingSettings"]] = relationship(back_populates="studio", uselist=False, cascade="all, delete-orphan")
    booking_channel_configs: Mapped[List["BookingChannelConfig"]] = relationship(back_populates="studio", cascade="all, delete-orphan")
    billing_plan: Mapped[Optional["StudioBillingPlan"]] = relationship(back_populates="studio", uselist=False, cascade="all, delete-orphan")
    billing_invoices: Mapped[List["BillingInvoice"]] = relationship(back_populates="studio", cascade="all, delete-orphan")
    offline_fees: Mapped[List["OfflineTransactionFee"]] = relationship(back_populates="studio", cascade="all, delete-orphan")
    revenue_entries: Mapped[List["PlatformRevenueLedger"]] = relationship(back_populates="studio", cascade="all, delete-orphan")
    integrations: Mapped[List["StudioIntegration"]] = relationship(back_populates="studio", cascade="all, delete-orphan")

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
