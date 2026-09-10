"""Resource uses the real booking payment and finance pipeline, including reversal."""
import asyncio

from sqlalchemy import delete, select

import test_resource_booking as resource
from database import async_session_maker
from models import BookingQuote, ClientPayment, Lesson, Operation, Reservation, StripeCheckout
from routers.checkout import stripe_pay
from services import booking, booking_payment, schedule_guard

# Keep the feature enabled only in the isolated test studio.
enabled = resource.enabled


def test_approval_card_payment_duplicate_and_refund_change_finances_once():
    async def run():
        ids = await resource.seed(price=100, approval=True)
        try:
            key = await resource.quote(ids, payment_method="card")
            created = await resource.confirm(ids, key)
            assert created["status"] == "pending"
            async with async_session_maker() as db:
                row = await db.get(Reservation, created["reservation_id"])
                assert row.debt_payment_id is None
                approved = await booking.approve(db, studio_id=ids["studio"], reservation_id=row.id, actor="test")
                assert approved.status == "hold"
                await db.commit()
                q = await db.get(BookingQuote, key)
                from dataclasses import replace
                terms = replace(booking.Terms.from_json(q.terms["domain"]), lesson_id=created["lesson_id"])
                started = await booking_payment.start(db, studio_id=ids["studio"], reservation_id=row.id,
                    client_id=ids["client"], lesson_id=created["lesson_id"], terms=terms, account_id="acct_resource_test")
                checkout = await db.get(StripeCheckout, started.checkout_id)
                checkout.session_id = f"cs_resource_{checkout.id}"
                session = checkout.session_id
                await db.commit()
                assert await stripe_pay.apply_paid(db, session, account_id="acct_resource_test") is True
                assert await stripe_pay.apply_paid(db, session, account_id="acct_resource_test") is False
                await db.refresh(row)
                assert row.status == "active" and row.debt_payment_id is None
                payments = (await db.execute(select(ClientPayment).where(ClientPayment.client_id == ids["client"]))).scalars().all()
                assert len(payments) == 1 and payments[0].amount == 100
                operations = (await db.execute(select(Operation).where(Operation.studio_id == ids["studio"]))).scalars().all()
                assert len(operations) == 1 and operations[0].amount == 100
                await schedule_guard.lock_studio(db, ids["studio"])
                await stripe_pay._revert_sale(db, checkout)
                checkout.status = "refunded"
                await db.commit()
                await db.refresh(row)
                assert row.status == "cancelled"
                assert (await db.get(Lesson, created["lesson_id"], populate_existing=True)).status == "cancelled"
                operations = (await db.execute(select(Operation).where(Operation.studio_id == ids["studio"]))).scalars().all()
                assert len(operations) == 2
                assert sorted(r.amount for r in operations) == [100, 100]
                assert {r.type for r in operations} == {"in", "out"}
        finally:
            async with async_session_maker() as db:
                await db.execute(delete(Operation).where(Operation.studio_id == ids["studio"]))
                await db.execute(delete(ClientPayment).where(ClientPayment.client_id == ids["client"]))
                await db.execute(delete(StripeCheckout).where(StripeCheckout.studio_id == ids["studio"]))
                await db.commit()
            await resource.cleanup(ids)
    asyncio.run(run())
