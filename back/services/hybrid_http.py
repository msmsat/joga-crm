"""Small shared HTTP adapters; booking transitions remain in domain services."""
from sqlalchemy import select

from models import Lesson, Reservation
from services import booking, booking_payment, booking_quotes as quotes, resource_booking


def quote_response(row):
    domain = row.terms["domain"]
    action = "none"
    if domain["approval_required"]:
        action = "wait_approval"
    elif domain["funding"]["kind"] == "pay" and row.terms["payment_method"] == "card":
        action = "pay"
    return dict(quote_id=row.id, expires_at=row.expires_at, booking_mode=row.booking_mode,
                terms=row.terms, next_action=action, reservation_id=row.reservation_id)


async def after_commit(db, actor, result, background=None):
    """Единственное место, где новые команды выходят в сеть, — и только ПОСЛЕ
    commit: замок студии к этому моменту уже отпущен (§6.2)."""
    await db.commit()
    # HB-25 п.6: календарь получает ФАКТИЧЕСКИЙ интервал после коммита, тем же
    # экспортом, что и журнал. Недоступность Google не отменяет сохранённую
    # бронь — push_lesson глотает свои ошибки сам.
    if background is not None and result.get("lesson_id"):
        from routers.schedule.lessons import _gcal_push_task
        background.add_task(_gcal_push_task, actor.studio_id, result["lesson_id"])
    if result["status"] == "hold":
        payable = await booking_payment.pay_link(db, studio_id=actor.studio_id,
            reservation_id=result["reservation_id"], client_id=actor.client_id, channel="web")
        result["payment_url"] = payable.url
    return result


async def cancel(db, actor, reservation_id, background=None):
    result = await booking.cancel(db, studio_id=actor.studio_id, client_id=actor.client_id,
        reservation_id=reservation_id, actor=actor.surface, by=actor.domain)
    if result.outcome not in {booking.Outcome.OK, booking.Outcome.ALREADY_CANCELLED}:
        quotes.reject(result.outcome.value.upper(), 404 if result.outcome is booking.Outcome.NOT_FOUND else 409)
    found = (await db.execute(select(Reservation, Lesson).join(Lesson).where(
        Reservation.id == reservation_id, Reservation.client_id == actor.client_id,
        Lesson.studio_id == actor.studio_id))).first()
    if found is None:
        quotes.reject("NOT_FOUND", 404)
    return await after_commit(db, actor, resource_booking.response(*found), background)
