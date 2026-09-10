"""Resource moves preserve the Reservation and all financial links (HB-12)."""
from datetime import timedelta

from sqlalchemy import select

from models import BookingQuote, ClientSubscription, Lesson, Reservation, StripeCheckout, Studio, SubscriptionPackage
from services import (booking, booking_notifications, booking_quotes as quotes,
                      resource_booking, schedule_guard, studio_time)
from services.booking_rules import load_rules


async def _source(db, actor, reservation_id, *, now):
    await quotes.authorize(db, actor)
    found = (await db.execute(select(Reservation, Lesson).join(Lesson).where(
        Reservation.id == reservation_id, Reservation.client_id == actor.client_id,
        Lesson.studio_id == actor.studio_id).execution_options(populate_existing=True))).first()
    if found is None or found[1].booking_mode != "resource":
        quotes.reject("NOT_FOUND", 404)
    reservation, lesson = found
    if reservation.status == "hold":
        quotes.reject("PAYMENT_IN_PROGRESS")
    if reservation.status not in {"active", "pending"}:
        quotes.reject("WINDOW_CLOSED")
    attempts = (await db.execute(select(StripeCheckout.id).where(
        StripeCheckout.studio_id == actor.studio_id,
        StripeCheckout.payload["reservation_id"].as_integer() == reservation.id,
        StripeCheckout.status.in_(["pending", "disputed", "failed"])).limit(1))).first()
    if attempts is not None:
        quotes.reject("PAYMENT_IN_PROGRESS")
    studio = await db.get(Studio, actor.studio_id)
    if not lesson.tz_iana:
        quotes.reject("CONFIG_INCOMPLETE")
    from types import SimpleNamespace
    try:
        start = studio_time.to_utc(lesson.start_time, SimpleNamespace(tz_iana=lesson.tz_iana))
    except ValueError:
        quotes.reject("CONFIG_INCOMPLETE")
    rules = await load_rules(db, actor.studio_id)
    if start < now.replace(tzinfo=None) + timedelta(minutes=
            rules.cancellation_deadline_min if actor.domain is booking.Actor.CLIENT else 0):
        quotes.reject("WINDOW_CLOSED")
    originals = (await db.execute(select(BookingQuote).where(BookingQuote.studio_id == actor.studio_id,
        BookingQuote.reservation_id == reservation.id, BookingQuote.consumed_at.is_not(None))
        .order_by(BookingQuote.created_at))).scalars().all()
    original = next((q for q in originals if q.terms.get("intent", "create") == "create"), None)
    if original is None:
        quotes.reject("CONFIG_INCOMPLETE")
    return reservation, lesson, original


async def _calculate(db, actor, reservation_id, request, *, now, hall_id=None):
    reservation, lesson, original = await _source(db, actor, reservation_id, now=now)
    if request.booking_mode != "resource" or request.service_id != lesson.service_id:
        quotes.reject("TERMS_CHANGED")
    terms = booking.Terms.from_json(original.terms["domain"])
    if terms is None or request.payment_method != original.terms["payment_method"]:
        quotes.reject("TERMS_CHANGED")
    current = await quotes.calculate(db, actor, request, now=now, hall_id=hall_id,
        exclude_lesson_id=lesson.id, preserved_funding=terms.funding)
    for key in ("duration_min", "buffer_before_min", "buffer_after_min"):
        if current[key] != getattr(lesson, key):
            quotes.reject("TERMS_CHANGED")
    studio = await db.get(Studio, actor.studio_id)
    if current["domain"]["base_price"] != lesson.price or (studio.currency or "RUB") != terms.funding.currency:
        quotes.reject("TERMS_CHANGED")
    if reservation.subscription_id is not None:
        subscription = await db.get(ClientSubscription, reservation.subscription_id, populate_existing=True)
        day = request.starts_at.astimezone(studio_time.clock(studio).zone).date()
        if subscription is None or subscription.status not in {"active", "pending"} or subscription.is_frozen:
            quotes.reject("TERMS_CHANGED")
        if subscription.status == "active" and subscription.expires_at < day:
            quotes.reject("TERMS_CHANGED")
        if subscription.package_id is not None:
            package = await db.get(SubscriptionPackage, subscription.package_id)
            if package is not None and package.service_ids and lesson.service_id not in package.service_ids:
                quotes.reject("TERMS_CHANGED")
    current.update(intent="reschedule", source_reservation_id=reservation.id, source_version=lesson.version)
    return current, reservation, lesson


async def create_quote(db, actor, reservation_id, request, *, now=None, hall_id=None):
    moment = quotes.utcnow(now)
    current, _, _ = await _calculate(db, actor, reservation_id, request, now=moment, hall_id=hall_id)
    row = BookingQuote(studio_id=actor.studio_id, client_id=actor.client_id,
        actor_user_id=actor.actor_user_id, surface=actor.surface, booking_mode="resource",
        payload_version=1, terms=current, created_at=moment, expires_at=moment + timedelta(minutes=5))
    db.add(row)
    await db.flush()
    return row


async def confirm(db, actor, reservation_id, quote_id, expected_version, *, now=None):
    try:
        studio = await schedule_guard.lock_studio(db, actor.studio_id)
        row = await quotes.read(db, quote_id, actor, lock=True)
        if row.terms.get("intent") != "reschedule" or row.terms.get("source_reservation_id") != reservation_id:
            quotes.reject("NOT_FOUND", 404)
        if row.consumed_at is not None:
            return await resource_booking.existing(db, row)
        moment = quotes.utcnow(now)
        if row.expires_at <= moment:
            quotes.reject("QUOTE_EXPIRED")
        current, reservation, lesson = await _calculate(db, actor, reservation_id,
            quotes.request_for(row), now=moment, hall_id=row.terms["hall_id"])
        if lesson.version != expected_version or row.terms["source_version"] != lesson.version:
            quotes.reject("VERSION_CONFLICT")
        if current != row.terms:
            quotes.reject("TERMS_CHANGED")
        terms = booking.Terms.from_json(current["domain"])
        await schedule_guard.assert_interval_free(db, studio, teacher_id=current["teacher_id"],
            hall_id=current["hall_id"], start=terms.local_start,
            end=terms.local_start + timedelta(minutes=current["duration_min"]),
            buffer_before_min=current["buffer_before_min"], buffer_after_min=current["buffer_after_min"],
            tz_iana=current["tz_iana"], exclude_lesson_id=lesson.id)
        lesson.start_time, lesson.tz_iana = terms.local_start, current["tz_iana"]
        lesson.teacher_id, lesson.teacher_name = current["teacher_id"], terms.trainer_name
        lesson.branch_id, lesson.hall_id = current["branch_id"], current["hall_id"]
        lesson.version += 1
        row.reservation_id, row.consumed_at = reservation.id, moment
        # Новая версия занятия — новое доменное событие: перенос обязан
        # уведомить, даже если бронь до и после в статусе active (HB-25 п.5).
        await booking_notifications.record(db, studio_id=actor.studio_id,
            reservation_id=reservation.id, lesson_version=lesson.version,
            event_code="booking_rescheduled")
        await db.flush()
        return resource_booking.response(reservation, lesson)
    except Exception:
        await db.rollback()
        raise
