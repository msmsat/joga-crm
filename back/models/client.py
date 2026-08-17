from datetime import datetime, date
from typing import List, Optional
from sqlalchemy import BigInteger, Integer, String, DateTime, Date, Boolean, ForeignKey, CheckConstraint, Text, JSON, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class Client(Base):
    __tablename__ = "clients"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    tg_id: Mapped[Optional[int]] = mapped_column(BigInteger, unique=True, index=True, nullable=True)
    # IGSID клиента. Каналом уведомлений Instagram быть перестал (24-часовое окно
    # Meta делало проактивную рассылку недоставляемой — см. services/notifier.py),
    # колонка оставлена недеструктивно: ничего не пишет и ничего не читает.
    # ponytail: заполнялась только вручную/импортом — Instagram отдаёт IGSID лишь
    # во входящем сообщении директа и не даёт сопоставить его с телефоном/почтой.
    ig_id: Mapped[Optional[str]] = mapped_column(String(50), index=True, nullable=True)
    name: Mapped[str] = mapped_column(String(100))
    last_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    # Номер пришёл подписанным от Telegram (`requestContact` → тот же HMAC, что и
    # у initData), а не набран руками в браузере или админом в CRM. Разница
    # практическая: по подтверждённому номеру студия гарантированно дозвонится,
    # и именно на нём держится оплата на месте — фейковую бронь с чужим номером
    # так не оставить.
    phone_verified: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
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
    # Реферальный код (V5-6, 1.4) — генерируется лениво при первом GET /invite-code.
    invite_code: Mapped[Optional[str]] = mapped_column(String(12), unique=True, index=True, nullable=True)

    studio: Mapped["Studio"] = relationship(back_populates="clients")
    subscriptions: Mapped[List["ClientSubscription"]] = relationship(back_populates="client", cascade="all, delete-orphan")
    reservations: Mapped[List["Reservation"]] = relationship(back_populates="client", cascade="all, delete-orphan")
    payments: Mapped[List["ClientPayment"]] = relationship(back_populates="client", cascade="all, delete-orphan")
    operations: Mapped[List["Operation"]] = relationship(back_populates="client", cascade="all, delete-orphan")
    loyalty_card: Mapped[Optional["ClientLoyaltyCard"]] = relationship(back_populates="client", uselist=False, cascade="all, delete-orphan")
    loyalty_transactions: Mapped[List["LoyaltyPointTransaction"]] = relationship(back_populates="client", cascade="all, delete-orphan")
    deposit_transactions: Mapped[List["DepositTransaction"]] = relationship(back_populates="client", cascade="all, delete-orphan")
    certificates: Mapped[List["GiftCertificate"]] = relationship(back_populates="client", foreign_keys="[GiftCertificate.client_id]")
    referral_records: Mapped[List["ReferralRecord"]] = relationship(back_populates="referrer", foreign_keys="[ReferralRecord.referrer_client_id]")
    notes: Mapped[List["ClientNote"]] = relationship(back_populates="client", cascade="all, delete-orphan")
    offers: Mapped[List["ClientOffer"]] = relationship(back_populates="client", cascade="all, delete-orphan")


class ClientSubscription(Base):
    __tablename__ = "client_subscriptions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"))
    type: Mapped[str] = mapped_column(String(100))
    total_classes: Mapped[int] = mapped_column(Integer)
    used_classes: Mapped[int] = mapped_column(Integer, default=0)
    expires_at: Mapped[date] = mapped_column(Date)
    # active — срок идёт; pending — куплен поверх незаконченного и ждёт своей
    # очереди (срок ещё не начался); finished — занятия кончились.
    status: Mapped[str] = mapped_column(String(20), default="active")
    # Отложенный старт очереди: пока status == "pending", starts_at is null, а
    # expires_at держит провизорную дату и НИГДЕ не читается для решений (все
    # запросы фильтруют по status == "active"). Обе даты выставляются в момент
    # активации — когда клиент отходил первое занятие по этому абонементу.
    starts_at: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    # Нужен, чтобы посчитать expires_at при активации: пакет к тому времени могли
    # удалить или поменять ему длительность.
    duration_days: Mapped[int] = mapped_column(Integer, default=90, server_default="90")
    is_frozen: Mapped[bool] = mapped_column(Boolean, default=False)
    frozen_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=False), nullable=True)
    freeze_until: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=False), nullable=True)
    # V5-4 задача 7: без пакета и даты покупки продления честно не посчитать.
    # Старые строки — null (аналитика считает с момента миграции). Продажа
    # (clients/subscriptions.py) начинает их заполнять.
    package_id: Mapped[Optional[int]] = mapped_column(ForeignKey("subscription_packages.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=False), server_default=func.now(), nullable=True)

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


class StudioClientSegmentConfig(Base):
    """Пороги, по которым считаются категории клиентов (services/client_segments).

    Одна строка на студию, создаётся лениво с дефолтами при первом чтении —
    поэтому у студий, которые настройку не открывали, строки нет вовсе.
    """
    __tablename__ = "studio_client_segment_configs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), unique=True, index=True)
    new_client_days: Mapped[int] = mapped_column(Integer, default=15, server_default="15")
    active_within_days: Mapped[int] = mapped_column(Integer, default=60, server_default="60")
    vip_min_spent: Mapped[int] = mapped_column(Integer, default=50000, server_default="50000")
    vip_min_visits: Mapped[int] = mapped_column(Integer, default=30, server_default="30")


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


class ClientEmailOtp(Base):
    """Код подтверждения email — вход клиента в мини-приложение вне Telegram.

    Своя таблица, а не колонки на clients: код запрашивают ДО того, как клиент
    существует (первый заход по ссылке `/s/<studio_id>` — карточки ещё нет), а
    заводить Client на каждый введённый в форму адрес значило бы набивать
    студии базу мусором с любого случайного захода.

    Механика повторяет services/otp.py (там она привязана к User и потому
    напрямую не переиспользуется): код лежит хэшем — дамп БД не даёт войти,
    живёт CODE_TTL и умирает после MAX_ATTEMPTS промахов, чтобы шесть цифр
    нельзя было перебрать. Строка одна на пару (студия, email): повторный
    запрос кода затирает предыдущий, а не копит параллельно валидные.
    """
    __tablename__ = "client_email_otp"
    __table_args__ = (
        UniqueConstraint("studio_id", "email", name="uq_client_email_otp_studio_email"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    email: Mapped[str] = mapped_column(String(255))
    code_hash: Mapped[str] = mapped_column(String(255))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=False))
    attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
