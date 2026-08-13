from datetime import datetime
from typing import List, Optional
from sqlalchemy import Integer, String, Float, Boolean, DateTime, Text, ForeignKey, Index, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from services.crypto import EncryptedStr, SECRET_COLUMN_LEN

from .base import Base


class StudioAISettings(Base):
    __tablename__ = "studio_ai_settings"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), unique=True, index=True)

    model: Mapped[str] = mapped_column(String(30), default="velora-3.5")
    language: Mapped[str] = mapped_column(String(10), default="auto")
    system_prompt: Mapped[Optional[str]] = mapped_column(String(2000), nullable=True)

    tg_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    # Токен бота — боевые учётные данные, в базе лежит зашифрованным (services/crypto).
    tg_token: Mapped[Optional[str]] = mapped_column(EncryptedStr(SECRET_COLUMN_LEN), nullable=True)
    tg_username: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    tg_tone: Mapped[str] = mapped_column(String(20), default="friendly")
    tg_max_length: Mapped[int] = mapped_column(Integer, default=500)
    tg_handled_count: Mapped[int] = mapped_column(Integer, default=0)
    tg_avg_rating: Mapped[float] = mapped_column(Float, default=0.0)

    ig_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    # Токен Instagram — то же самое: даёт чтение и отправку директа студии.
    ig_token: Mapped[Optional[str]] = mapped_column(EncryptedStr(SECRET_COLUMN_LEN), nullable=True)
    ig_user_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    ig_token_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=False), nullable=True)
    ig_username: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    ig_tone: Mapped[str] = mapped_column(String(20), default="friendly")
    ig_max_length: Mapped[int] = mapped_column(Integer, default=300)
    ig_off_hours_only: Mapped[bool] = mapped_column(Boolean, default=True)
    ig_handled_count: Mapped[int] = mapped_column(Integer, default=0)
    ig_avg_rating: Mapped[float] = mapped_column(Float, default=0.0)

    # WhatsApp-агент: подключение (токен + phone_number_id) живёт не здесь, а в
    # StudioIntegration("wa_notify") — одно на Уведомления, Настройки и агента.
    wa_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    wa_tone: Mapped[str] = mapped_column(String(20), default="friendly")
    wa_max_length: Mapped[int] = mapped_column(Integer, default=300)
    wa_off_hours_only: Mapped[bool] = mapped_column(Boolean, default=False)
    wa_handled_count: Mapped[int] = mapped_column(Integer, default=0)
    wa_avg_rating: Mapped[float] = mapped_column(Float, default=0.0)

    studio: Mapped["Studio"] = relationship(back_populates="ai_settings")


class AIChatSession(Base):
    __tablename__ = "ai_chat_sessions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(200))
    preview: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), server_default=func.now(), onupdate=func.now())

    studio: Mapped["Studio"] = relationship(back_populates="ai_chat_sessions")
    user: Mapped[Optional["User"]] = relationship(back_populates="ai_chat_sessions")
    messages: Mapped[List["AIChatMessage"]] = relationship(back_populates="session", cascade="all, delete-orphan")


class AIChatMessage(Base):
    __tablename__ = "ai_chat_messages"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("ai_chat_sessions.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(10))
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), server_default=func.now())
    # jti исполненного предложения действия (эпик AI-5, задача 6). Однократность —
    # колонкой с unique-индексом, а не служебным сообщением: в этой таблице живут
    # только роли user/assistant, а БД сама закрывает гонку двойного клика.
    action_jti: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, unique=True)

    session: Mapped["AIChatSession"] = relationship(back_populates="messages")


class AIUsage(Base):
    """Строка на каждый вызов модели: сколько токенов и во сколько это обошлось.

    Текста промптов и ответов здесь нет и быть не должно: через ассистента идут
    телефоны и даты рождения клиентов чужого бизнеса, и таблица метрик мгновенно
    стала бы хранилищем ПДн со своим сроком хранения и экспортом. Диалоги лежат
    в AIChatMessage, здесь только цифры.
    """
    __tablename__ = "ai_usage"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), server_default=func.now(), index=True)
    # crm | telegram | instagram | whatsapp — откуда пришёл запрос
    surface: Mapped[str] = mapped_column(String(20))
    model: Mapped[str] = mapped_column(String(60))
    prompt_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cached_tokens: Mapped[int] = mapped_column(Integer, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cost_micro: Mapped[int] = mapped_column(Integer, default=0)
    # Один пользовательский вопрос = 2-4 вызова модели. Квота считает вопросы,
    # поэтому первый вызов цикла помечается billable, остальные — нет.
    billable: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    # Кто спрашивал в мессенджере — для антиспама задачи 13 (tg_id/IGSID/телефон).
    # Только для surface != "crm"; в CRM отправитель — это user_id.
    sender_ref: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    # Оба запроса квоты (задача 3) и антиспама (задача 13) — это «строки одной
    # студии за период». Двух раздельных индексов по studio_id и created_at для
    # такого запроса мало: планировщик возьмёт один из них и отфильтрует остаток
    # перебором. Составной нужен явно — autogenerate его сам не придумает.
    __table_args__ = (
        Index("ix_ai_usage_studio_created", "studio_id", "created_at"),
    )
