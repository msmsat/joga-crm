from datetime import datetime
from typing import List, Optional
from sqlalchemy import Integer, String, Float, Boolean, DateTime, Text, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class StudioAISettings(Base):
    __tablename__ = "studio_ai_settings"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), unique=True, index=True)

    model: Mapped[str] = mapped_column(String(30), default="gpt-4o")
    language: Mapped[str] = mapped_column(String(10), default="auto")
    system_prompt: Mapped[Optional[str]] = mapped_column(String(2000), nullable=True)

    tg_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    tg_token: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    tg_username: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    tg_tone: Mapped[str] = mapped_column(String(20), default="friendly")
    tg_max_length: Mapped[int] = mapped_column(Integer, default=500)
    tg_handled_count: Mapped[int] = mapped_column(Integer, default=0)
    tg_avg_rating: Mapped[float] = mapped_column(Float, default=0.0)

    ig_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    ig_token: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    ig_username: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    ig_tone: Mapped[str] = mapped_column(String(20), default="friendly")
    ig_max_length: Mapped[int] = mapped_column(Integer, default=300)
    ig_off_hours_only: Mapped[bool] = mapped_column(Boolean, default=True)
    ig_handled_count: Mapped[int] = mapped_column(Integer, default=0)
    ig_avg_rating: Mapped[float] = mapped_column(Float, default=0.0)

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

    session: Mapped["AIChatSession"] = relationship(back_populates="messages")
