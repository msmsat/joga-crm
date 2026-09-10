"""Намерение уведомить о доменном переходе брони (HB-25, §6.5).

ЧТО ЭТО НЕ ЕСТЬ. Это не второй транспорт и не копия `OutboundMessage`. Доставку
по-прежнему выполняет `services/notifier` через журнал `NotificationLog`
(услуги, каналы, дедуп по получателю), а сообщения внутри разговора — очередь
`outbound`. Здесь хранится ОДИН факт: «бронь перешла в такое-то состояние, и об
этом ещё не сообщили».

ЗАЧЕМ ОТДЕЛЬНАЯ СТРОКА. Уведомление отправлялось внутри запроса: падение
процесса между commit'ом брони и вызовом провайдера теряло его молча, а сеть
под замком студии тормозила чужие операции. Строка пишется В ТОЙ ЖЕ транзакции,
что и сам переход, — откат перехода уносит и её, а успешный переход гарантирует,
что воркер попытается.

ГРАНИЦА ГАРАНТИЙ. Сохранение намерения — durable. Доставка — best-effort:
ограниченное число попыток и явный terminal `failed` с диагностикой. Ни
exactly-once, ни безусловный at-least-once внешним провайдером не обещаются
(та же формулировка, что в `services/outbound`).

КЛЮЧ `(reservation_id, lesson_version, event_code)`. Версия занятия отличает
уведомление о переносе от уведомления о первоначальной записи. `event_code`
нужен отдельно, потому что переход `pending → hold → active` версию НЕ меняет
(HB-25 п.4), а сообщений там три разных.
"""
from datetime import datetime
from typing import Optional

from sqlalchemy import (CheckConstraint, DateTime, ForeignKey, Index, Integer, String,
                        UniqueConstraint, func, text)
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base

PENDING, SENT, FAILED = "pending", "sent", "failed"

# HB-25 п.3. Пять попыток — столько же, сколько у `outbound`, и по той же
# причине: провайдер, отказавший пятый раз, вряд ли примет с шестого, а
# сообщение о брони к тому времени уже неактуально.
MAX_ATTEMPTS = 5
BACKOFF_SECONDS = (10, 30, 60, 300, 300)


class BookingNotificationIntent(Base):
    __tablename__ = "booking_notification_intents"
    __table_args__ = (
        UniqueConstraint("reservation_id", "lesson_version", "event_code",
                         name="uq_booking_notification_intent"),
        CheckConstraint("state IN ('pending', 'sent', 'failed')",
                        name="check_booking_notification_state"),
        # Частичный индекс: воркер выбирает только незавершённые строки, и
        # история отправленных не должна раздувать его выборку.
        Index("ix_booking_notification_due", "next_attempt_at",
              postgresql_where=text("state = 'pending'")),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    reservation_id: Mapped[int] = mapped_column(
        ForeignKey("reservations.id", ondelete="CASCADE"), index=True)
    lesson_version: Mapped[int] = mapped_column(Integer, default=1)
    event_code: Mapped[str] = mapped_column(String(40))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), server_default=func.now())
    state: Mapped[str] = mapped_column(String(16), default=PENDING, server_default=PENDING)
    attempt_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    next_attempt_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), server_default=func.now())
    last_error: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
