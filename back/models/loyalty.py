from datetime import datetime, date
from typing import List, Optional
from sqlalchemy import Integer, String, Boolean, DateTime, Date, ForeignKey, JSON, CheckConstraint, UniqueConstraint, func
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
    # Депозит / клубный баланс (V5-3, задача 4) — живёт на карте клиента, без новой таблицы.
    deposit_balance: Mapped[int] = mapped_column(Integer, default=0)
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


class DepositTransaction(Base):
    """История депозита (V5-3, задача 4) — деньги, история обязательна."""
    __tablename__ = "deposit_transactions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"), index=True)
    amount: Mapped[int] = mapped_column(Integer)  # + пополнение, - списание
    description: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), server_default=func.now())

    client: Mapped["Client"] = relationship(back_populates="deposit_transactions")


class StudioPromoCode(Base):
    """Промокод и акция (V5-3, задача 3). Конфиг-программы нет: карточка
    «включена», если у студии есть хотя бы один активный код."""
    __tablename__ = "studio_promo_codes"
    __table_args__ = (
        CheckConstraint("discount_type IN ('percent', 'amount')", name="check_promo_discount_type"),
        UniqueConstraint("studio_id", "code", name="uq_promo_code_per_studio"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    code: Mapped[str] = mapped_column(String(30))
    discount_type: Mapped[str] = mapped_column(String(10), default="percent")
    value: Mapped[int] = mapped_column(Integer)
    valid_until: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    usage_limit: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    used_count: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), server_default=func.now())

    studio: Mapped["Studio"] = relationship(back_populates="promo_codes")


class ClientOffer(Base):
    """Персональная скидка клиента (V5-5, задача 2) — реальный объект в БД,
    а не текст в письме. Источник — сценарий (`renewal_offer`), ручная выдача
    владельцем или будущая кампания. `scope='renewal'` на MVP (единственный
    товар — продление абонемента); `apply_discount` (services/discounts.py) —
    тот же расчёт, что и у промокода, чтобы не разъезжались."""
    __tablename__ = "client_offers"
    __table_args__ = (
        CheckConstraint("discount_type IN ('percent', 'amount')", name="check_offer_discount_type"),
        CheckConstraint("reason IN ('scenario', 'manual', 'campaign')", name="check_offer_reason"),
        CheckConstraint("scope IN ('renewal', 'any')", name="check_offer_scope"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"), index=True)
    discount_type: Mapped[str] = mapped_column(String(10), default="percent")
    value: Mapped[int] = mapped_column(Integer)
    reason: Mapped[str] = mapped_column(String(20), default="manual")
    scope: Mapped[str] = mapped_column(String(20), default="renewal")
    valid_until: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    is_used: Mapped[bool] = mapped_column(Boolean, default=False)
    used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=False), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), server_default=func.now())

    studio: Mapped["Studio"] = relationship(back_populates="client_offers")
    client: Mapped["Client"] = relationship(back_populates="offers")


class StudioDiscountConfig(Base):
    """discount_type — ключи ('percentage'/'fixed'/'cashback'), отображение
    через locales (V5-5, задача 5: раньше фронт писал сюда русские строки,
    сравнение в resolve_price молча не совпадало — CheckConstraint не даст
    багу повториться)."""
    __tablename__ = "studio_discount_configs"
    __table_args__ = (
        CheckConstraint("discount_type IN ('percentage', 'fixed', 'cashback')", name="check_studio_discount_type"),
    )

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
    service_id: Mapped[Optional[int]] = mapped_column(ForeignKey("services.id", ondelete="SET NULL"), nullable=True)

    studio: Mapped["Studio"] = relationship(back_populates="certificate_config")
    service: Mapped[Optional["Service"]] = relationship()


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
    # Изоляция «Разовые»/«Абонементы» в кассе (V5-6, Блок 3, Вариант A): один
    # каталог пакетов, владелец решает, в каком табе кассы показывать каждый.
    sold_as_single: Mapped[bool] = mapped_column(Boolean, default=True)
    sold_as_subscription: Mapped[bool] = mapped_column(Boolean, default=True)

    config: Mapped["StudioSubscriptionProgramConfig"] = relationship(back_populates="packages")


class StudioReferralConfig(Base):
    __tablename__ = "studio_referral_configs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), unique=True, index=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    referrer_bonus: Mapped[int] = mapped_column(Integer, default=500)
    new_client_discount: Mapped[int] = mapped_column(Integer, default=15)
    trigger_condition: Mapped[str] = mapped_column(String(30), default="first_visit")
    bonus_type: Mapped[str] = mapped_column(String(20), default="points")

    studio: Mapped["Studio"] = relationship(back_populates="referral_config")


class LoyaltyScenario(Base):
    """Умный сценарий удержания (V5-4). Читается как предложение:
    «Если [не был 21 день] → [подарить 200 баллов] → [Email]». Пороги живут
    в trigger_params / action_params (JSON), чтобы не плодить колонки под
    каждый тип. Канал: email и telegram — реально шлют (deliver(),
    services/notifier.py, V5-5 задача 6), whatsapp — заглушка до интеграции."""
    __tablename__ = "loyalty_scenarios"
    __table_args__ = (
        CheckConstraint(
            "trigger_type IN ('inactive_days', 'low_subscription', 'birthday', 'nth_visit', 'referral')",
            name="check_scenario_trigger_type",
        ),
        CheckConstraint(
            "action_type IN ('points', 'gift_classes', 'certificate', 'renewal_offer')",
            name="check_scenario_action_type",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    trigger_type: Mapped[str] = mapped_column(String(20))
    trigger_params: Mapped[dict] = mapped_column(JSON, default=dict)
    action_type: Mapped[str] = mapped_column(String(20))
    action_params: Mapped[dict] = mapped_column(JSON, default=dict)
    channel: Mapped[str] = mapped_column(String(20), default="email")
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    fired_count: Mapped[int] = mapped_column(Integer, default=0)
    last_run_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=False), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), server_default=func.now())

    studio: Mapped["Studio"] = relationship(back_populates="loyalty_scenarios")


class ScenarioFire(Base):
    """Лог срабатываний сценария (V5-4, задача 2) — сердце идемпотентности.
    Один клиент не попадает под тот же сценарий повторно, пока не выполнит
    «выход из условия». Хитрость: сам `dedup_key` кодирует выход, поэтому
    достаточно UNIQUE-констрейнта — при выходе ключ меняется и клиент снова
    может сработать, без отдельного запроса «а вышел ли он»:
      - inactive_days: 'lv:<дата последнего визита>' — новый визит меняет
        дату → новый ключ → снова можно;
      - low_subscription: 'sub:<id абонемента>' — новый абонемент = новый id;
      - birthday: '<год>' — раз в год;
      - nth_visit: '<номер визита>' — по конкретному номеру;
      - referral: 'ref:<id реферала>' — по конкретной реферальной записи.
    UNIQUE(scenario_id, client_id, dedup_key) — повторный insert падает и
    пропускается, гонок нет."""
    __tablename__ = "scenario_fires"
    __table_args__ = (
        UniqueConstraint("scenario_id", "client_id", "dedup_key", name="uq_scenario_fire"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    scenario_id: Mapped[int] = mapped_column(ForeignKey("loyalty_scenarios.id", ondelete="CASCADE"), index=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"), index=True)
    dedup_key: Mapped[str] = mapped_column(String(40))
    fired_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), server_default=func.now())


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
