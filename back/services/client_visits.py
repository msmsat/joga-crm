"""One visit rule for client cards, segments and monthly activity.

Imported completion counts as history; it never confirms attendance or payment.
SQL uses the lesson's pinned timezone, with the studio as legacy fallback.
"""
from datetime import datetime, timedelta
from types import SimpleNamespace
from sqlalchemy import DateTime, and_, or_
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.sql.functions import FunctionElement
from models import Lesson, Reservation
from services import studio_time

class LessonEnd(FunctionElement):
    type = DateTime()
    inherit_cache = True

@compiles(LessonEnd, "postgresql")
def _pg_end(element, compiler, **kw):
    start, minutes = (compiler.process(c, **kw) for c in element.clauses)
    return f"({start} + {minutes} * INTERVAL '1 minute')"

@compiles(LessonEnd, "sqlite")
def _sqlite_end(element, compiler, **kw):
    start, minutes = (compiler.process(c, **kw) for c in element.clauses)
    return f"datetime({start}, '+' || {minutes} || ' minutes')"

class LessonNow(FunctionElement):
    type = DateTime()
    inherit_cache = True

@compiles(LessonNow, "postgresql")
def _pg_now(element, compiler, **kw):
    zone, studio_id = (compiler.process(c, **kw) for c in element.clauses)
    return (f"timezone(COALESCE({zone}, (SELECT s.tz_iana FROM studios s WHERE s.id = {studio_id}), "
            f"(SELECT CASE WHEN s.timezone ~ '^UTC[+-]?[0-9]+$' THEN 'Etc/GMT' || "
            f"CASE WHEN substring(s.timezone FROM 4)::int > 0 THEN '-' ELSE '+' END || "
            f"abs(substring(s.timezone FROM 4)::int)::text ELSE 'UTC' END FROM studios s WHERE s.id = {studio_id}), 'UTC'), now())")

@compiles(LessonNow, "sqlite")
def _sqlite_now(element, compiler, **kw):
    return "datetime('now')"

def visit_condition(now=None):
    wall_now = now if now is not None else LessonNow(Lesson.tz_iana, Lesson.studio_id)
    return and_(
        Lesson.status != "cancelled",
        or_(Lesson.source_status.is_(None), Lesson.source_status.not_in(("cancelled", "canceled"))),
        Reservation.no_show.is_(False),
        or_(
            and_(Reservation.status == "attended", Lesson.start_time <= wall_now),
            and_(Reservation.status == "active", Lesson.source_status == "completed",
                 LessonEnd(Lesson.start_time, Lesson.duration_min) <= wall_now),
        ),
    )

def wall_now(lesson, studio=None, now=None):
    if now is not None:
        return now.replace(tzinfo=None)
    pinned = SimpleNamespace(tz_iana=lesson.tz_iana, timezone=None) if getattr(lesson, "tz_iana", None) else studio
    return studio_time.now(pinned).replace(tzinfo=None)

def appointment_state(reservation, studio=None, now=None):
    lesson = reservation.lesson
    if reservation.status == "cancelled" or getattr(lesson, "status", None) == "cancelled" or getattr(lesson, "source_status", None) in ("cancelled", "canceled"):
        return "cancelled"
    current = wall_now(lesson, studio, now)
    if lesson.start_time > current:
        return "upcoming"
    if lesson.start_time + timedelta(minutes=getattr(lesson, "duration_min", 60)) > current:
        return "ongoing"
    return "completed"

def attendance_state(reservation, studio=None, now=None):
    state = appointment_state(reservation, studio, now)
    if state == "cancelled":
        return "cancelled"
    if state == "upcoming":
        return "expected"
    if getattr(reservation, "no_show", False):
        return "missed"
    if reservation.status == "attended":
        return "attended"
    return "unknown"

def is_visit(reservation, studio=None, now=None):
    if getattr(reservation, "no_show", False):
        return False
    state = appointment_state(reservation, studio, now)
    if state in ("cancelled", "upcoming"):
        return False
    return reservation.status == "attended" or (reservation.status == "active" and
        getattr(reservation.lesson, "source_status", None) == "completed" and state == "completed")

def visit_summary(reservations, studio=None, now=None):
    visits = {r.lesson_id: r.lesson.start_time.date() for r in reservations if is_visit(r, studio, now)}
    return len(visits), max(visits.values(), default=None)

def payment_state(reservation, debt_status=None):
    receipt = getattr(reservation, "payment_breakdown", None) or {}
    if debt_status == "pending":
        return "unpaid"
    if debt_status == "success" or receipt.get("paid_at") or getattr(reservation, "auto_paid", False):
        return "paid"
    if getattr(reservation, "subscription_id", None):
        return "subscription"
    if getattr(reservation.lesson, "source_status", None):
        return "unknown"
    if getattr(reservation.lesson, "price", None) == 0:
        return "free"
    return "unknown"
