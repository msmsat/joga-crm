"""Leave an online booking only after Stripe proves its form cannot charge."""
import asyncio
import logging

from fastapi import HTTPException
from sqlalchemy import select

from models import Lesson, Reservation, StripeCheckout
from services import booking_payment, client_checkout_sync, resource_booking, schedule_guard, stripe_connect

logger = logging.getLogger(__name__)


async def _current(db, studio_id, client_id, reservation_id):
    found = (await db.execute(select(Reservation, Lesson).join(Lesson).where(
        Reservation.id == reservation_id, Reservation.client_id == client_id,
        Lesson.studio_id == studio_id).execution_options(populate_existing=True))).first()
    if found is None:
        raise HTTPException(404, detail={'code': 'NOT_FOUND'})
    result = resource_booking.response(*found)
    await db.commit()
    return result


async def leave(db, *, studio_id, client_id, reservation_id):
    """Idempotent, owned checkout return. A URL parameter never proves nonpayment.

    Keep confirmed/venue bookings intact. Stripe I/O holds no DB locks. An
    uncertain or processing payment keeps its hold; paid uses webhook fulfillment.
    """
    from routers.checkout.stripe_pay import apply_paid, fetch_pending_session

    current = await _current(db, studio_id, client_id, reservation_id)
    if current['status'] != 'hold':
        return current
    row = (await db.execute(client_checkout_sync._rows(studio_id, client_id).where(
        StripeCheckout.payload['reservation_id'].as_integer() == reservation_id,
    ).order_by(StripeCheckout.id.desc()).limit(1))).first()
    await db.rollback()
    if row is None or row.status not in {'pending', 'cancelled'}:
        raise HTTPException(409 if row and row.status == 'failed' else 503,
            detail={'code': 'PAYMENT_REVIEW' if row and row.status == 'failed' else 'PAYMENT_UNAVAILABLE'})
    if row.status == 'pending':
        try:
            session_id, session = await asyncio.wait_for(fetch_pending_session(row, max_sessions=100), timeout=8)
            if session is None or not client_checkout_sync._verified(session, row):
                raise ValueError('Unverified checkout')
            if session.payment_status != 'paid' and session.status == 'open':
                try:
                    session = await asyncio.wait_for(stripe_connect.expire_session(session_id, row.account_id), timeout=8)
                except Exception:
                    # Payment can win between fetch and expire. Re-read and use
                    # the same paid fulfillment instead of deleting the booking.
                    session = await asyncio.wait_for(stripe_connect.fetch_session(session_id, row.account_id), timeout=8)
                if not client_checkout_sync._verified(session, row):
                    raise ValueError('Unverified expired checkout')
            if session.payment_status == 'paid':
                await apply_paid(db, session_id, account_id=row.account_id, attempt_id=row.attempt_id)
                return await _current(db, studio_id, client_id, reservation_id)
            if session.status != 'expired' or session.payment_status != 'unpaid':
                # `complete` can still be processing: do not offer a second pay.
                return await _current(db, studio_id, client_id, reservation_id)
        except HTTPException:
            await db.rollback()
            raise
        except Exception:
            await db.rollback()
            logger.warning('Checkout return could not verify payment: checkout=%s', row.id)
            raise HTTPException(503, detail={'code': 'PAYMENT_UNAVAILABLE'}) from None
    else:
        session_id = row.session_id

    await schedule_guard.lock_studio(db, studio_id)
    checkout = await db.get(StripeCheckout, row.id, populate_existing=True, with_for_update=True)
    if checkout.status == 'pending':
        checkout.session_id = session_id
        checkout.status = 'cancelled'
    if checkout.status == 'cancelled':
        await booking_payment._release(db, studio_id=studio_id,
            reservation_id=reservation_id, reason='checkout_return')
    return await _current(db, studio_id, client_id, reservation_id)
