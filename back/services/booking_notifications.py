"""Постановка и доставка намерений уведомить о переходе брони (HB-25).

ДВА ШАГА, РАЗНЫЕ ТРАНЗАКЦИИ.

  `record()`  — в сессии вызывающего, вместе с самим переходом. Не коммитит:
                откат перехода обязан унести намерение с собой.
  `run_due()` — воркер, своя сессия, ПОСЛЕ commit. Здесь и только здесь
                выполняется сеть; под замком студии её нет вовсе.

ПОВТОР ВОРКЕРА НЕ ЗАДВАИВАЕТ. Само намерение уникально по
`(reservation_id, lesson_version, event_code)`, а внутри него дедупликация по
получателю и каналу остаётся за журналом отправок (`services/outbox`): ему
передаётся ПРИЧИННЫЙ ключ намерения вместо календарного часа, поэтому повтор
через десять минут не пошлёт второе сообщение тому, кому уже отправили.

СБОЙ ОДНОГО КАНАЛА НЕ ПОВТОРЯЕТ ПРИНЯТЫЕ ОСТАЛЬНЫМИ. Это свойство журнала
отправок, а не этого модуля: строка `NotificationLog` заводится на каждую пару
(получатель, канал), и повторная попытка намерения занимает только те строки,
которые не закрыты успехом.
"""
import logging
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from database import async_session_maker
from models import (BookingNotificationIntent, Client, Lesson, Reservation, Studio)
from models.booking_notification import BACKOFF_SECONDS, FAILED, MAX_ATTEMPTS, PENDING, SENT

logger = logging.getLogger(__name__)

# Доменный переход → событие каталога уведомлений. Коды перечислены явно:
# «любая строка сойдёт» означало бы, что опечатка навсегда останется молчащим
# уведомлением. pending/hold собственного клиентского шаблона пока не имеют —
# человеку в этот момент показывается следующее действие в самой форме, а
# письмо «мы ещё думаем» только путает; намерение всё равно записывается,
# чтобы переход был виден в диагностике.
EVENT_TEMPLATES: dict[str, str | None] = {
    "booking_confirmed": "c1",
    "booking_activated": "c1",
    "booking_rescheduled": "c11",
    "booking_cancelled": "c3",
    "booking_pending": None,
    "booking_hold": None,
}

# Статус брони после перехода → код события. Одна таблица вместо разбросанных
# по вызывающим строк: перепутать их местами здесь заметно, а в пяти файлах нет.
STATUS_EVENTS = {"active": "booking_confirmed", "pending": "booking_pending",
                 "hold": "booking_hold", "cancelled": "booking_cancelled"}


async def record(db, *, studio_id: int, reservation_id: int, lesson_version: int,
                 event_code: str) -> None:
    """Записать намерение в ТЕКУЩЕЙ транзакции. Идемпотентно по ключу."""
    if event_code not in EVENT_TEMPLATES:
        raise ValueError(f"неизвестный код события брони: {event_code!r}")
    await db.execute(pg_insert(BookingNotificationIntent).values(
        studio_id=studio_id, reservation_id=reservation_id,
        lesson_version=lesson_version, event_code=event_code,
    ).on_conflict_do_nothing(constraint="uq_booking_notification_intent"))


async def record_result(db, *, studio_id: int, result, lesson) -> None:
    """Намерение по исходу доменного перехода — общий хвост для booking.py.

    Молча выходит, если переход не состоялся или статус не имеет собственного
    уведомления: наличие строки должно означать реальный переход.
    """
    status = getattr(result, "status", None)
    if getattr(result, "reservation_id", None) is None or status not in STATUS_EVENTS:
        return
    await record(db, studio_id=studio_id, reservation_id=result.reservation_id,
                 lesson_version=getattr(lesson, "version", 1) or 1,
                 event_code=STATUS_EVENTS[status])


async def _claim(db, limit: int, now: datetime):
    rows = (await db.execute(select(BookingNotificationIntent).where(
        BookingNotificationIntent.state == PENDING,
        BookingNotificationIntent.next_attempt_at <= now,
    ).order_by(BookingNotificationIntent.id).limit(limit)
     .with_for_update(skip_locked=True))).scalars().all()
    for row in rows:
        row.attempt_count += 1
        # Срок следующей попытки ставится ДО отправки: процесс, умерший в сети,
        # не должен вернуть строку в очередь мгновенно и зациклить сам себя.
        row.next_attempt_at = now + timedelta(
            seconds=BACKOFF_SECONDS[min(row.attempt_count - 1, len(BACKOFF_SECONDS) - 1)])
    await db.commit()
    return rows


async def _send(intent) -> bool:
    """Одна попытка доставки. Исключения не пробрасывает — их разбирает вызывающий."""
    from services.notifier import lesson_context, notify

    template = EVENT_TEMPLATES[intent.event_code]
    if template is None:
        return True  # Переход без клиентского шаблона: намерение закрыто фактом.
    async with async_session_maker() as db:
        found = (await db.execute(select(Reservation, Lesson).join(Lesson).where(
            Reservation.id == intent.reservation_id))).first()
        if found is None:
            return True  # Бронь удалена вместе с занятием — слать нечего.
        reservation, lesson = found
        client = await db.get(Client, reservation.client_id)
        if client is None or await db.get(Studio, intent.studio_id) is None:
            return True
        context = {**await lesson_context(db, lesson), "client_id": client.id,
                   # Причинный ключ вместо календарного часа: повтор воркера
                   # через десять минут обязан попасть в ту же строку журнала.
                   "_causal": f"intent:{intent.id}"}
        return await notify(db, intent.studio_id, "client", template, context)


async def run_due(limit: int = 20, *, now: datetime | None = None) -> dict[str, int]:
    """Проход воркера. Возвращает счётчики для лога, не бросает наружу."""
    moment = now or datetime.utcnow()
    async with async_session_maker() as db:
        claimed = await _claim(db, limit, moment)
        pairs = [(row.id, row) for row in claimed]
    counts = {"sent": 0, "retry": 0, "failed": 0}
    for intent_id, intent in pairs:
        error = None
        try:
            ok = await _send(intent)
        except Exception as exc:  # noqa: BLE001 — исход попытки, а не крах прохода
            logger.exception("booking_notification_failed intent_id=%s", intent_id)
            ok, error = False, f"{type(exc).__name__}: {exc}"
        async with async_session_maker() as db:
            row = await db.get(BookingNotificationIntent, intent_id)
            if row is None:
                continue
            if ok:
                row.state, row.last_error = SENT, None
                counts["sent"] += 1
            elif row.attempt_count >= MAX_ATTEMPTS:
                row.state = FAILED
                row.last_error = (error or "провайдер не принял сообщение")[:500]
                counts["failed"] += 1
                logger.warning("booking_notification_terminal intent_id=%s event=%s",
                               intent_id, row.event_code)
            else:
                row.last_error = (error or "попытка не удалась")[:500]
                counts["retry"] += 1
            await db.commit()
    return counts
