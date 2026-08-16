from datetime import date, datetime
from typing import List, Optional
from sqlalchemy import Integer, BigInteger, String, Float, Boolean, Date, DateTime, ForeignKey, Index, func, text
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
    # ЛЕГАСИ, больше не пишется и не читается. Здесь лежал код подтверждения почты
    # открытым текстом, без срока и без счётчика попыток; регистрация переведена на
    # общий OTP (`otp_*` ниже) вслед за восстановлением пароля. Колонку оставляем до
    # отдельной миграции — удалять её вместе с правкой денежного и входного пути
    # значит смешивать в одном релизе поведение и схему.
    verification_code: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    is_onboarded: Mapped[bool] = mapped_column(Boolean, default=False)
    last_online_at: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    two_fa_enabled: Mapped[bool] = mapped_column(Boolean, default=False)

    # OTP с TTL и скоупом действия (EPIC 5, задача 3). Теперь ЕДИНСТВЕННЫЙ механизм
    # одноразовых кодов в продукте: смена пароля, danger zone, 2FA, восстановление
    # пароля и подтверждение почты при регистрации.
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

    # Реквизиты плательщика — на АККАУНТЕ, а не на студии: платит человек своей
    # картой со своего адреса, и у второй его студии адрес тот же. Спрашивать их
    # заново на каждой новой студии значило бы спрашивать одно и то же дважды.
    # Заполняются один раз перед первой оплатой (модалка биллинга) и правятся во
    # вкладке «Способ оплаты»; отсюда уезжают в Stripe Customer при оформлении.
    billing_country: Mapped[Optional[str]] = mapped_column(String(2), nullable=True)
    billing_line1: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    billing_line2: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    billing_postal_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    billing_city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    # Номер НДС необязателен: у физлица его нет. Наличие номера = «я бизнес», и
    # Stripe Tax по нему применяет reverse charge. Сверку с VIES делает Stripe уже
    # после оплаты; не прошедший её номер снимается И у Stripe, И отсюда
    # (routers/billing/webhook._handle_tax_id) — иначе следующее оформление
    # заливало бы обратно ровно тот номер, который только что отклонили.
    billing_vat_id: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    # Прошёл ли этот номер сверку с реестром ЕС (services/vies). False — формат
    # верный, но реестр в момент ввода не ответил: номер мы сохранили, чтобы
    # человек не вводил его заново, но в Stripe НЕ отправляем — иначе он обнулит
    # НДС по неподтверждённому номеру, а недобор налога снимут с платформы.
    # Такому плательщику выставляется полный НДС; сверку повторяет фоновый проход
    # (services/offline_fee_billing), и по её успеху номер начинает работать.
    billing_vat_verified: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")

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
    consents: Mapped[List["UserConsent"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class UserConsent(Base):
    """Доказательство clickwrap-согласия с Условиями и Политикой (EU SaaS).

    Одна строка = одно нажатие галочки. Документы версионируются бандлом
    (`legal.TERMS_VERSION`), поэтому строка одна на все документы, а не по
    строке на каждый.

    Таблица append-only: прошлые согласия не затираются и не обновляются.
    Доказывать нужно согласие с той редакцией, что действовала на момент
    сделки, а редакция со временем меняется — «последняя принятая версия»
    полем в users стёрла бы историю ровно тогда, когда она понадобится.
    """

    __tablename__ = "user_consents"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    # Редакция документов, с которой человек согласился (legal.TERMS_VERSION).
    version: Mapped[str] = mapped_column(String(20))
    # register | google | invite — каким путём человек попал в продукт.
    source: Mapped[str] = mapped_column(String(20))
    # 45 символов — предельная длина текстового IPv6 с IPv4-хвостом.
    ip: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(String(400), nullable=True)
    accepted_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="consents")
