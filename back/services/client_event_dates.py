"""Client timeline: scheduled studio time and action timestamps are distinct.

Database connections pin infrastructure timestamps to UTC (database.py).
Lesson.start_time is the studio's wall clock and must never be treated as UTC.
"""
from datetime import datetime
from schemas.clients.responses import EventFundingOut, EventRecordOut
from services import studio_time
from services.client_visits import appointment_state, attendance_state, payment_state


def action_stamp(value, studio):
    if value is None:
        return None
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return studio_time.to_local(value, studio).isoformat()


def lesson_stamp(lesson):
    return lesson.start_time.isoformat() if lesson is not None else None


def reservation_funding(reservation, lesson, *, debt_status=None, debt_amount=None, subscription_name=None):
    """Цена визита и чем он закрыт — по тем же полям, что строка записанного
    в карточке занятия: платёж брони в ожидании — долг, проведён — оплачено."""
    amount = debt_amount or 0
    return EventFundingOut(
        price=getattr(lesson, "price", None) or 0,
        is_trial=bool(getattr(reservation, "is_trial", False)),
        trial_discount_percent=getattr(reservation, "trial_discount_percent", None),
        trial_discount_amount=getattr(reservation, "trial_discount_amount", None),
        manual_discount_percent=getattr(reservation, "manual_discount_percent", None),
        by_subscription=getattr(reservation, "subscription_id", None) is not None,
        subscription_name=subscription_name,
        debt=amount if debt_status == "pending" else 0,
        paid_amount=amount if debt_status == "success" else 0,
        payment=getattr(reservation, "payment_breakdown", None) or None,
    )


def reservation_event(reservation, kind, studio, *, debt_status=None, debt_amount=None, subscription_name=None):
    lesson = reservation.lesson
    scheduled = lesson_stamp(lesson)
    occurred = (scheduled if kind in ("visit", "completed") else
                action_stamp(reservation.cancelled_at if kind == "cancel" else reservation.created_at, studio))
    prefixes = {"booking": "Запись: ", "cancel": "Отмена: ", "visit": "", "completed": ""}
    return EventRecordOut(
        date=scheduled if kind in ("booking", "visit", "completed") else occurred,
        occurred_at=occurred, scheduled_at=scheduled,
        type=kind, title=prefixes[kind] + (lesson.name if lesson else "Занятие"),
        subject=lesson.name if lesson else None,
        trainer=lesson.teacher_name if lesson else None,
        lesson_id=getattr(lesson, 'id', None),
        service_id=getattr(lesson, 'service_id', None),
        teacher_id=getattr(lesson, 'teacher_id', None),
        notes=getattr(lesson, 'notes', None),
        photos=getattr(lesson, 'photos', None) or [],
        status=getattr(lesson, 'source_status', None),
        appointment_status=appointment_state(reservation, studio),
        attendance_status=attendance_state(reservation, studio),
        payment_status=payment_state(reservation, debt_status),
        funding=reservation_funding(reservation, lesson, debt_status=debt_status, debt_amount=debt_amount,
                                    subscription_name=subscription_name) if lesson is not None else None,
    )


def payment_event(payment, reservation, lesson, studio):
    recorded = action_stamp(payment.created_at, studio)
    snapshot = reservation.payment_breakdown if reservation is not None else None
    # The debt row is created at booking, then reused at payment. Only its
    # receipt knows settlement time; old receipts must not invent that date.
    occurred = action_stamp(snapshot.get("paid_at"), studio) if snapshot else None
    if reservation is None:
        occurred = recorded
    return EventRecordOut(
        date=occurred or recorded, occurred_at=occurred,
        recorded_at=recorded if occurred is None else None,
        scheduled_at=lesson_stamp(lesson), type="payment",
        title=payment.description, amount=str(payment.amount),
    )


def event_order(event, studio):
    value = event.occurred_at or event.recorded_at or event.date
    if not value:
        return float("-inf")
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=studio_time.clock(studio).zone)
    return parsed.timestamp()
