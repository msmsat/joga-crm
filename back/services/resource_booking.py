"""Atomic quote confirmation. Caller commits; failure rolls back the entire command."""
from dataclasses import replace
from datetime import timedelta

from sqlalchemy import select

from models import Client, Lesson, Reservation
from services import booking, booking_quotes as quotes, schedule_guard


def response(reservation, lesson):
    status = reservation.status
    return {"reservation_id": reservation.id, "lesson_id": lesson.id,
        "booking_mode": lesson.booking_mode, "status": status, "version": lesson.version,
        "next_action": "wait_approval" if status == "pending" else "pay" if status == "hold" else "none",
        "payment_url": None}


async def existing(db, row):
    result = (await db.execute(select(Reservation, Lesson).join(Lesson).where(
        Reservation.id == row.reservation_id, Reservation.client_id == row.client_id,
        Lesson.studio_id == row.studio_id).execution_options(populate_existing=True))).first()
    if result is None:
        quotes.reject("NOT_FOUND", 404)
    return response(*result)


async def confirm(db, quote_id: str, actor: quotes.Actor, *, now=None):
    try:
        studio = await schedule_guard.lock_studio(db, actor.studio_id)
        row = await quotes.read(db, quote_id, actor, lock=True)
        if row.terms.get("intent", "create") != "create":
            quotes.reject("WRONG_COMMAND", 422)
        if row.consumed_at is not None:
            return await existing(db, row)
        moment = quotes.utcnow(now)
        if row.expires_at <= moment:
            quotes.reject("QUOTE_EXPIRED")
        current = await quotes.calculate(db, actor, quotes.request_for(row), now=moment,
                                         hall_id=row.terms["hall_id"])
        if current != row.terms:
            quotes.reject("TERMS_CHANGED")
        terms = booking.Terms.from_json(current["domain"])
        if terms is None:
            quotes.reject("TERMS_CHANGED")
        if (actor.domain is booking.Actor.CLIENT and current["payment_method"] == "venue"
                and terms.funding.kind is booking.FundingKind.PAY and terms.funding.price > 0):
            client = await db.get(Client, actor.client_id, populate_existing=True)
            if not client.phone:
                quotes.reject("PHONE_REQUIRED", 428)
        if row.booking_mode == "resource":
            await schedule_guard.assert_interval_free(db, studio, teacher_id=current["teacher_id"],
                hall_id=current["hall_id"], start=terms.local_start,
                end=terms.local_start + timedelta(minutes=current["duration_min"]),
                buffer_before_min=current["buffer_before_min"], buffer_after_min=current["buffer_after_min"],
                tz_iana=current["tz_iana"])
            lesson = Lesson(studio_id=actor.studio_id, service_id=current["service_id"],
                teacher_id=current["teacher_id"], branch_id=current["branch_id"], hall_id=current["hall_id"],
                name=terms.service_name, teacher_name=terms.trainer_name, start_time=terms.local_start,
                tz_iana=current["tz_iana"], duration_min=current["duration_min"], price=terms.base_price,
                buffer_before_min=current["buffer_before_min"], buffer_after_min=current["buffer_after_min"],
                total_spots=1, booking_mode="resource", status="confirmed", level="", equipment="", version=1)
            db.add(lesson)
            await db.flush()
            terms = replace(terms, lesson_id=lesson.id)
        else:
            lesson = await db.get(Lesson, terms.lesson_id, populate_existing=True)
        card = current["payment_method"] == "card"
        result = await booking.create(db, studio_id=actor.studio_id, client_id=actor.client_id,
            lesson_id=lesson.id, source=actor.surface, actor=actor.domain, now=moment, shown=terms,
            spot_number=current["spot_number"], allow_payment=not card, hold_for_payment=card,
            require_funding=False if card else None, _resource=row.booking_mode == "resource")
        if result.outcome is not booking.Outcome.OK:
            quotes.reject(result.outcome.value.upper(), 402 if result.outcome is booking.Outcome.NO_FUNDING else 409)
        row.reservation_id, row.consumed_at = result.reservation_id, moment
        await db.flush()
        return await existing(db, row)
    except Exception:
        await db.rollback()
        raise
