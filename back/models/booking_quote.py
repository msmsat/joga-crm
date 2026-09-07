"""Quote — условия записи НА МОМЕНТ ПОКАЗА, до подтверждения (HB-09/10).

Сохраняет то, что показали человеку, и саму идентичность операции: quote БЕЗ
`reservation_id` не занимает ресурс и не является доходом
(docs/EPIC_HYBRID_BOOKING_IMPLEMENTATION.md §6.1). `terms` хранит канонические
факты (тот же контракт, что `services/booking.Terms.to_json`), а не готовый
текст — подтверждение перепроверяет каждое условие заново, снимок используется
только для сравнения "изменилось / не изменилось" (TERMS_CHANGED).

UTC для `created_at`/`expires_at`/`consumed_at` — это служебные метки самой
квоты (живёт 5 минут), а не изменение временного контракта Lesson: занятие
по-прежнему хранит местное стенное время + `tz_iana` (см. models/schedule.py).
"""
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Index, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


def _new_quote_id() -> str:
    return str(uuid.uuid4())


class BookingQuote(Base):
    __tablename__ = "booking_quotes"
    __table_args__ = (
        Index("ix_booking_quote_studio_client_created", "studio_id", "client_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_quote_id)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"), index=True)
    # Сотрудник, составивший quote от имени клиента (Журнал/карточка клиента,
    # POST /schedule/booking-quotes). NULL — клиент сам, из Mini-app/публичного
    # виджета (POST /global/booking-quotes).
    actor_user_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
    )
    # Откуда пришёл запрос — miniapp/crm/public/agent. Влияет только на то,
    # чьи права и чей client_id использовать при подтверждении (§6.3), сам
    # расчёт условий от поверхности не зависит.
    surface: Mapped[str] = mapped_column(String(20))
    booking_mode: Mapped[str] = mapped_column(String(16))
    payload_version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    # Канонические факты показанных условий — см. services/booking.Terms.
    terms: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    # Заполняется тем же переходом, что создаёт/переносит Reservation
    # (HB-10/12). NULL — quote ещё не исполнен (или не будет исполнен вовсе).
    reservation_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("reservations.id", ondelete="SET NULL"), nullable=True, index=True,
    )
    consumed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
