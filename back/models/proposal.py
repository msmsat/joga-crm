"""Предложение действия: то, на что человек ещё только соглашается (P3).

ПРЕДЛОЖЕНИЕ НИЧЕГО НЕ ДЕЛАЕТ. Его создание не занимает место, не списывает
занятие абонемента, не заводит платёж и ничего не отменяет. Это запись о том,
что СЕРВЕР предложил, и о том, на каких условиях, — чтобы потом сверить их с
действительностью. Пока человек не подтвердил, в бизнесе не изменилось ничего.

ЗАЧЕМ ХРАНИТЬ УСЛОВИЯ. Между «вот занятие в 18:30 у Валерии по вашему
абонементу» и словом «да» проходит время. За это время занятие переносят,
тренера меняют, абонемент кончается. Исполнить старое согласие в новых
условиях — значит записать человека не туда, куда он соглашался. Поэтому
условия лежат ФАКТАМИ (services/booking.Terms), а не текстом ответа: текст
пересобирается, факты сравнимы.

ССЫЛКА НЕПРОЗРАЧНА. Наружу уходит случайный токен, привязанный к студии и
разговору: ни `lesson_id`, ни `reservation_id`, ни `client_id` в теле нажатия
нет. Тот же принцип, что у показанных вариантов поиска (P1.5), и по той же
причине — идентификаторы в руках у клиента это идентификаторы в руках у
кого угодно.
"""
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    DateTime, ForeignKey, Index, Integer, String, func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class ActionProposal(Base):
    __tablename__ = "action_proposals"
    __table_args__ = (
        # «Что сейчас предложено в этом разговоре» — для подтверждения словом и
        # для отмены прежних предложений новым поиском.
        Index("ix_proposal_live", "studio_id", "thread_id", "status"),
        Index("ix_proposal_expires", "expires_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(
        ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    thread_id: Mapped[int] = mapped_column(
        ForeignKey("channel_threads.id", ondelete="CASCADE"), index=True)
    # Кто соглашается. Право проверяется ЗАНОВО в момент подтверждения — эта
    # ссылка нужна, чтобы знать, у кого именно его спрашивать, а не чтобы
    # заменить проверку.
    identity_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("customer_identities.id", ondelete="CASCADE"), nullable=True)
    client_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"), nullable=True)

    # 32 символа из secrets.token_urlsafe(24).
    token: Mapped[str] = mapped_column(String(64), unique=True)
    # book · cancel · reschedule (services/proposals.Kind).
    kind: Mapped[str] = mapped_column(String(20))
    lesson_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("lessons.id", ondelete="CASCADE"), nullable=True)
    reservation_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("reservations.id", ondelete="CASCADE"), nullable=True)
    # Условия НА МОМЕНТ ПОКАЗА (services/booking.Terms.to_json).
    terms: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    # pending · completed · failed · expired · superseded.
    # `processing` здесь нет намеренно: внутри перехода нет ни одного сетевого
    # вызова, и промежуточное состояние описывало бы окно, которого не бывает.
    status: Mapped[str] = mapped_column(String(16), default="pending",
                                        server_default="pending")
    # Почему не вышло — исход домена (services/booking.Outcome), не текст.
    outcome: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    # Что получилось, если получилось.
    created_reservation_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("reservations.id", ondelete="SET NULL"), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=False))
    resolved_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=False), nullable=True)
