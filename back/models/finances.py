from datetime import datetime, date
from typing import List, Optional
from sqlalchemy import Integer, String, Float, Boolean, DateTime, Date, ForeignKey, JSON, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(150))
    type: Mapped[str] = mapped_column(String(20))
    balance: Mapped[int] = mapped_column(Integer, default=0)
    daily_change: Mapped[int] = mapped_column(Integer, default=0)
    color: Mapped[str] = mapped_column(String(7))
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)

    studio: Mapped["Studio"] = relationship(back_populates="accounts")
    operations: Mapped[List["Operation"]] = relationship(back_populates="account", cascade="all, delete-orphan")


class Operation(Base):
    __tablename__ = "operations"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    client_id: Mapped[Optional[int]] = mapped_column(ForeignKey("clients.id", ondelete="SET NULL"), nullable=True)
    account_id: Mapped[Optional[int]] = mapped_column(ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True)
    counterparty_id: Mapped[Optional[int]] = mapped_column(ForeignKey("counterparties.id", ondelete="SET NULL"), nullable=True, index=True)
    trainer_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    product_id: Mapped[Optional[int]] = mapped_column(ForeignKey("products.id", ondelete="SET NULL"), nullable=True, index=True)
    # Услуга Каталога, за которую пришли деньги (разовое посещение из кассы).
    # Абонемент/сертификат/пополнение депозита к одной услуге не сводятся — там null.
    # До этой колонки фильтр Отчётов «Услуга» сравнивался с product_id, то есть с
    # id из ДРУГОЙ таблицы (products) — выручка под фильтром была неверной.
    service_id: Mapped[Optional[int]] = mapped_column(ForeignKey("services.id", ondelete="SET NULL"), nullable=True, index=True)
    type: Mapped[str] = mapped_column(String(10))
    title: Mapped[str] = mapped_column(String(200))
    amount: Mapped[int] = mapped_column(Integer)
    op_date: Mapped[date] = mapped_column(Date)
    category: Mapped[str] = mapped_column(String(100))
    method: Mapped[str] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(20), default="completed")

    studio: Mapped["Studio"] = relationship(back_populates="operations")
    client: Mapped[Optional["Client"]] = relationship(back_populates="operations")
    account: Mapped[Optional["Account"]] = relationship(back_populates="operations")
    counterparty: Mapped[Optional["Counterparty"]] = relationship(back_populates="operations")
    trainer: Mapped[Optional["User"]] = relationship(foreign_keys=[trainer_id])
    product: Mapped[Optional["Product"]] = relationship(foreign_keys=[product_id])
    service: Mapped[Optional["Service"]] = relationship(foreign_keys=[service_id])


class Counterparty(Base):
    __tablename__ = "counterparties"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    counterparty_type: Mapped[str] = mapped_column(String(30))
    inn: Mapped[Optional[str]] = mapped_column(String(12), nullable=True)
    category: Mapped[str] = mapped_column(String(100))
    balance: Mapped[int] = mapped_column(Integer, default=0)
    deals_count: Mapped[int] = mapped_column(Integer, default=0)
    color: Mapped[str] = mapped_column(String(7))

    studio: Mapped["Studio"] = relationship(back_populates="counterparties")
    fin_documents: Mapped[List["FinDocument"]] = relationship(back_populates="counterparty", cascade="all, delete-orphan")
    operations: Mapped[List["Operation"]] = relationship(back_populates="counterparty")


class FinDocument(Base):
    __tablename__ = "fin_documents"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    counterparty_id: Mapped[Optional[int]] = mapped_column(ForeignKey("counterparties.id", ondelete="SET NULL"), nullable=True)
    title: Mapped[str] = mapped_column(String(300))
    doc_type: Mapped[str] = mapped_column(String(50))
    upload_date: Mapped[datetime] = mapped_column(DateTime(timezone=False), server_default=func.now())
    amount: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")
    file_ext: Mapped[str] = mapped_column(String(10))
    file_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    requires_signature: Mapped[bool] = mapped_column(Boolean, default=False)

    studio: Mapped["Studio"] = relationship(back_populates="fin_documents")
    counterparty: Mapped[Optional["Counterparty"]] = relationship(back_populates="fin_documents")


class OnlineChannel(Base):
    __tablename__ = "online_channels"
    __table_args__ = (UniqueConstraint("studio_id", "channel_type", name="uq_studio_channel"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    channel_type: Mapped[str] = mapped_column(String(30))
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    monthly_amount: Mapped[int] = mapped_column(Integer, default=0)
    monthly_sessions: Mapped[int] = mapped_column(Integer, default=0)
    public_key: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    secret_key: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    # Stripe Connect: id подключённого аккаунта студии (acct_…). Не секрет — все
    # запросы уходят под ключом платформы с заголовком Stripe-Account: этим id,
    # поэтому secret_key студии нам не нужен и не хранится (для stripe он всегда null).
    account_id: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)

    studio: Mapped["Studio"] = relationship(back_populates="online_channels")
    metrics: Mapped[List["OnlineChannelMetric"]] = relationship(back_populates="channel", cascade="all, delete-orphan")


class PaymentMethodConfig(Base):
    __tablename__ = "payment_method_configs"
    __table_args__ = (UniqueConstraint("studio_id", "method_type", name="uq_studio_pay_method"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    method_type: Mapped[str] = mapped_column(String(30))
    method_name: Mapped[str] = mapped_column(String(100))
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    commission_rate: Mapped[float] = mapped_column(Float, default=0.0)
    monthly_transactions: Mapped[int] = mapped_column(Integer, default=0)

    studio: Mapped["Studio"] = relationship(back_populates="payment_method_configs")


class FinancialGoal(Base):
    __tablename__ = "financial_goals"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    target_amount: Mapped[int] = mapped_column(Integer)
    current_amount: Mapped[int] = mapped_column(Integer, default=0)
    deadline: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    category: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    color: Mapped[str] = mapped_column(String(7))
    priority: Mapped[str] = mapped_column(String(10), default="medium")
    tracking_mode: Mapped[str] = mapped_column(String(10), default="manual")
    op_type: Mapped[str] = mapped_column(String(3), default="in")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), server_default=func.now())

    studio: Mapped["Studio"] = relationship(back_populates="financial_goals")


class SalaryPayment(Base):
    __tablename__ = "salary_payments"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    period_start: Mapped[date] = mapped_column(Date)
    period_end: Mapped[date] = mapped_column(Date)
    sessions_count: Mapped[int] = mapped_column(Integer, default=0)
    hours_worked: Mapped[float] = mapped_column(Float, default=0.0)
    rate_snapshot: Mapped[float] = mapped_column(Float)
    rate_type_snapshot: Mapped[str] = mapped_column(String(10))
    amount: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=False), nullable=True)
    note: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)

    studio: Mapped["Studio"] = relationship(back_populates="salary_payments")
    user: Mapped["User"] = relationship(back_populates="salary_payments")


class OnlineChannelMetric(Base):
    __tablename__ = "online_channel_metrics"
    __table_args__ = (
        UniqueConstraint("channel_id", "period_type", "period_date", name="uq_channel_metric"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    channel_id: Mapped[int] = mapped_column(ForeignKey("online_channels.id", ondelete="CASCADE"), index=True)
    period_type: Mapped[str] = mapped_column(String(10))
    period_date: Mapped[date] = mapped_column(Date)
    amount: Mapped[int] = mapped_column(Integer, default=0)
    transactions_count: Mapped[int] = mapped_column(Integer, default=0)

    channel: Mapped["OnlineChannel"] = relationship(back_populates="metrics")


class StripeCheckout(Base):
    """Заявка на оплату картой в кассе: создана при уходе в Stripe, помечается
    paid ровно один раз.

    Тот же смысл, что у BillingInvoice для подписки на саму CRM: пока клиент не
    заплатил, деньги в CRM не двигаются — ни дохода, ни абонемента, ни списания
    бонусов. `payload` хранит тело CheckoutPayRequest, чтобы провести оплату
    ровно теми же условиями (промокод, бонусы, сертификат), какие видел кассир.

    Идемпотентность держится на `session_id` + `status`: и вебхук, и возврат на
    success_url зовут одну функцию, второй пришедший — no-op.
    """
    __tablename__ = "stripe_checkouts"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    # Кассир, начавший продажу — от его имени пойдёт запись в ленту событий.
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    session_id: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    account_id: Mapped[str] = mapped_column(String(60))
    payload: Mapped[dict] = mapped_column(JSON)
    amount: Mapped[int] = mapped_column(Integer)
    # pending — ждём Stripe; paid — деньги списаны и продажа проведена;
    # cancelled — сессия протухла/банк отказал, списания не было;
    # failed — деньги СПИСАНЫ, а провести не удалось (нужен разбор и возврат).
    status: Mapped[str] = mapped_column(String(20), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), server_default=func.now())
