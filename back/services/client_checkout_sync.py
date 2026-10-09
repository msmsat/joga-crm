"""Read Stripe, then use the webhook's atomic fulfillment for owned attempts."""
import asyncio
import logging
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Lesson, StripeCheckout, Studio, SubscriptionPackage
from schemas.miniapp_checkout import CheckoutSyncPayment, CheckoutSyncRequest, CheckoutSyncResponse
from services import booking_payment, stripe_connect, stripe_env
from services import lesson_time
from services.notifier import _fmt_amount

logger = logging.getLogger(__name__)


def _owned(studio_id: int, client_id: int):
    return and_(
        StripeCheckout.studio_id == studio_id,
        StripeCheckout.payload["client_id"].as_string() == str(client_id),
        StripeCheckout.user_id.is_(None),
        or_(StripeCheckout.payload["kind"].as_string() == booking_payment.PAYLOAD_KIND,
            StripeCheckout.payload["package_id"].as_integer().is_not(None)),
    )


def _rows(studio_id: int, client_id: int):
    # Select values: rollback after a failed verification must not expire objects
    # queued for the next check. Joins also keep display information tenant scoped.
    return select(
        StripeCheckout.id, StripeCheckout.status, StripeCheckout.session_id,
        StripeCheckout.attempt_id, StripeCheckout.account_id, StripeCheckout.payload,
        StripeCheckout.amount, StripeCheckout.created_at, Studio.currency,
        Lesson.name.label("lesson_name"), Lesson.start_time, Lesson.tz_iana,
        SubscriptionPackage.name.label("package_name"),
    ).join(Studio, Studio.id == StripeCheckout.studio_id).outerjoin(Lesson, and_(
        Lesson.id == StripeCheckout.payload["lesson_id"].as_integer(),
        Lesson.studio_id == studio_id,
    )).outerjoin(SubscriptionPackage, and_(
        SubscriptionPackage.id == StripeCheckout.payload["package_id"].as_integer(),
        SubscriptionPackage.studio_id == studio_id,
    )).where(_owned(studio_id, client_id))


def _verified(session, row) -> bool:
    """A fetched payment must agree with the server's saved checkout terms."""
    currency = (row.payload.get("currency") or row.currency or "CZK").lower()
    expected_mode = stripe_env.expects_livemode()
    reference = getattr(session, "client_reference_id", None)
    metadata = getattr(session, "metadata", None) or {}
    from routers.checkout.stripe_pay import ATTEMPT_KEY
    metadata_reference = metadata.get(ATTEMPT_KEY)
    references = [value for value in (reference, metadata_reference) if value]
    # A saved session ID supports older sessions with no reference. An orphan
    # must have an exact reference before apply_paid may adopt it.
    if row.attempt_id and any(value != row.attempt_id for value in references):
        return False
    if not row.session_id and (not row.attempt_id or row.attempt_id not in references):
        return False
    return (
        bool(getattr(session, "id", None))
        and (not row.session_id or session.id == row.session_id)
        and expected_mode is not None
        and getattr(session, "livemode", None) is expected_mode
        and getattr(session, "mode", None) == "payment"
        and getattr(session, "amount_total", None) == stripe_connect.to_minor_units(row.amount, currency)
        and getattr(session, "currency", None) == currency
    )


def _payment(row, newly_paid: set[int]) -> CheckoutSyncPayment:
    booking = row.payload.get("kind") == booking_payment.PAYLOAD_KIND
    currency = row.payload.get("currency") or row.currency or "CZK"
    when = lesson_time.resolve(row).instant if row.start_time else None
    return CheckoutSyncPayment(
        id=row.id, kind="booking" if booking else "subscription", status=row.status,
        amount_str=_fmt_amount(row.amount, currency.upper()),
        title=(row.lesson_name if booking else row.package_name) or "",
        starts_at=when.replace(tzinfo=timezone.utc) if when is not None else None,
        reservation_id=row.payload.get("reservation_id") if booking else None,
        package_id=row.payload.get("package_id") if not booking else None,
        created_at=row.created_at.replace(tzinfo=timezone.utc),
        newly_paid=row.id in newly_paid and row.status == "paid",
    )


async def sync_checkouts(
    db: AsyncSession, *, studio_id: int, client_id: int, target: CheckoutSyncRequest,
) -> CheckoutSyncResponse:
    from routers.checkout.stripe_pay import apply_paid, fetch_pending_session

    query = _rows(studio_id, client_id)
    targeted = target.checkout_id is not None or target.reservation_id is not None
    if target.checkout_id is not None:
        query = query.where(StripeCheckout.id == target.checkout_id)
    if target.reservation_id is not None:
        query = query.where(StripeCheckout.payload["reservation_id"].as_integer() == target.reservation_id)
    if not targeted:
        query = query.where(or_(StripeCheckout.status == "pending",
            StripeCheckout.created_at >= datetime.utcnow() - timedelta(hours=24)))
    rows = (await db.execute(query.order_by(
        (StripeCheckout.status == "pending").desc(), StripeCheckout.created_at.desc(),
        StripeCheckout.id.desc(),
    ).limit(10))).all()
    # Release the authentication/read transaction before any Stripe call. A
    # shared apply_paid lock is acquired only after verification, never over I/O.
    await db.rollback()
    if targeted and not rows:
        raise HTTPException(status_code=404, detail="Payment not found")

    newly_paid: set[int] = set()
    unavailable = False
    pending = [row for row in rows if row.status == "pending"]
    for row in pending[:3]:
        try:
            # Orphans cost one list page and one fetch; ordinary attempts one
            # fetch. A request can make at most six Stripe API calls.
            session_id, session = await asyncio.wait_for(fetch_pending_session(row, max_sessions=100), timeout=8)
            if session is None or getattr(session, "id", None) != session_id or not _verified(session, row):
                unavailable = True
                continue
            payment_status = getattr(session, "payment_status", None)
            if payment_status == "paid":
                if await apply_paid(db, session.id, account_id=row.account_id, attempt_id=row.attempt_id):
                    newly_paid.add(row.id)
            elif payment_status != "unpaid":
                unavailable = True
        except HTTPException:
            # The shared fulfillment path has already recorded a business
            # rejection as failed; only the final DB read determines UI status.
            await db.rollback()
        except Exception:
            await db.rollback()
            unavailable = True
            logger.warning("Client checkout verification unavailable: checkout=%s", row.id, exc_info=True)
        finally:
            # apply_paid can return without committing when the webhook won.
            await db.rollback()

    ids = [row.id for row in rows]
    fresh = (await db.execute(_rows(studio_id, client_id).where(StripeCheckout.id.in_(ids)))).all() if ids else []
    by_id = {row.id: row for row in fresh}
    return CheckoutSyncResponse(
        payments=[_payment(by_id[key], newly_paid) for key in ids if key in by_id],
        verification_unavailable=unavailable,
    )
