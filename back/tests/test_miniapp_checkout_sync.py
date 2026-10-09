"""A paid Stripe session repairs the client's booking through real fulfillment."""
import asyncio
from datetime import datetime, timedelta
from types import SimpleNamespace

import httpx
import pytest
from fastapi import FastAPI
from sqlalchemy import delete, select

import test_booking_payment as bookings
from database import async_session_maker
from models import Client, ClientPayment, Lesson, Operation, Reservation, StripeCheckout
from routers.booking import miniapp_router
from routers.booking.miniapp import get_current_client
from routers.checkout import stripe_pay
from services import stripe_connect
from ratelimit import limiter


@pytest.fixture(autouse=True)
def no_request_throttling(monkeypatch):
    monkeypatch.setattr(limiter, "enabled", False)


async def seed(*, orphan=False):
    ids = await bookings._seed()
    booked, started = await bookings._hold(ids)
    ids.update(reservation=booked.reservation_id, checkout=started.checkout_id)
    async with async_session_maker() as db:
        row = await db.get(StripeCheckout, started.checkout_id)
        row.session_id = None if orphan else f"cs_sync_{row.id}"
        ids.update(session=f"cs_sync_{row.id}", attempt=row.attempt_id)
        await db.commit()
    return ids


async def cleanup(ids):
    async with async_session_maker() as db:
        await db.execute(delete(Operation).where(Operation.studio_id == ids["studio"]))
        await db.execute(delete(ClientPayment).where(ClientPayment.client_id == ids["katya"]))
        await db.commit()
    await bookings._cleanup(ids)


def api(ids, *, authenticated=True):
    app = FastAPI()
    app.include_router(miniapp_router, prefix="/global")
    if authenticated:
        app.dependency_overrides[get_current_client] = lambda: SimpleNamespace(
            id=ids["katya"], studio_id=ids["studio"])
    return app


async def sync(app, body=None):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        return await client.post("/global/checkout/sync", **({"json": body} if body is not None else {}))


def stripe_session(ids, **changes):
    fields = dict(id=ids["session"], client_reference_id=ids["attempt"],
        metadata={}, payment_status="paid", status="complete", mode="payment",
        amount_total=50000, currency="czk", livemode=False)
    return SimpleNamespace(**(fields | changes))


def stub_session(monkeypatch, ids, **changes):
    async def fetch(session_id, account_id):
        assert session_id == ids["session"] and account_id == bookings.ACCOUNT
        return stripe_session(ids, **changes)
    monkeypatch.setattr(stripe_connect, "fetch_session", fetch)


def test_paid_session_repairs_hold_and_repeated_sync_never_duplicates_income(monkeypatch):
    async def run():
        ids = await seed()
        try:
            stub_session(monkeypatch, ids)
            app = api(ids)
            response = await sync(app, {"reservation_id": ids["reservation"]})
            assert response.status_code == 200, response.text
            result = response.json()
            assert result["verification_unavailable"] is False
            payment, = result["payments"]
            assert payment["id"] == ids["checkout"]
            assert payment["status"] == "paid" and payment["newly_paid"] is True
            assert payment["kind"] == "booking" and payment["reservation_id"] == ids["reservation"]
            assert payment["amount_str"] == "500 Kč" and payment["title"] == "Стретчинг"
            assert payment["starts_at"] and payment["created_at"]
            assert await bookings._status(ids["reservation"]) == "active"
            again = (await sync(app)).json()
            assert again["payments"][0]["status"] == "paid"
            assert again["payments"][0]["newly_paid"] is False
            async with async_session_maker() as db:
                payments = (await db.execute(select(ClientPayment).where(ClientPayment.client_id == ids["katya"]))).scalars().all()
                operations = (await db.execute(select(Operation).where(Operation.studio_id == ids["studio"]))).scalars().all()
                assert len(payments) == len(operations) == 1
                assert payments[0].amount == operations[0].amount == 500
        finally:
            await cleanup(ids)
    asyncio.run(run())


def test_two_concurrent_syncs_fulfill_once(monkeypatch):
    async def run():
        ids = await seed()
        try:
            stub_session(monkeypatch, ids)
            app = api(ids)
            responses = await asyncio.wait_for(asyncio.gather(sync(app), sync(app)), 20)
            assert [r.status_code for r in responses] == [200, 200]
            payments = [r.json()["payments"][0] for r in responses]
            assert all(p["status"] == "paid" for p in payments)
            assert sum(p["newly_paid"] for p in payments) == 1
            assert await bookings._status(ids["reservation"]) == "active"
            async with async_session_maker() as db:
                assert len((await db.execute(select(Operation.id).where(Operation.studio_id == ids["studio"]))).all()) == 1
        finally:
            await cleanup(ids)
    asyncio.run(run())


@pytest.mark.parametrize("changes, unavailable", [
    ({"payment_status": "unpaid", "status": "open"}, False),
    ({"payment_status": None}, True),
    ({"client_reference_id": "another_attempt"}, True),
    ({"metadata": {"checkout_attempt": "another_attempt"}}, True),
    ({"amount_total": 100}, True),
    ({"currency": "eur"}, True),
    ({"livemode": True}, True),
    ({"id": "cs_foreign"}, True),
])
def test_unpaid_or_unverified_session_never_activates_booking(monkeypatch, changes, unavailable):
    async def run():
        ids = await seed()
        try:
            stub_session(monkeypatch, ids, **changes)
            response = await sync(api(ids))
            assert response.status_code == 200, response.text
            assert response.json()["verification_unavailable"] is unavailable
            assert response.json()["payments"][0]["status"] == "pending"
            assert response.json()["payments"][0]["newly_paid"] is False
            assert await bookings._status(ids["reservation"]) == "hold"
        finally:
            await cleanup(ids)
    asyncio.run(run())


def test_network_failure_keeps_pending_for_retry(monkeypatch):
    async def run():
        ids = await seed()
        try:
            async def failed(*args):
                raise OSError("Stripe temporarily unavailable")
            monkeypatch.setattr(stripe_connect, "fetch_session", failed)
            response = await sync(api(ids))
            assert response.status_code == 200, response.text
            assert response.json()["verification_unavailable"] is True
            assert response.json()["payments"][0]["status"] == "pending"
            assert await bookings._status(ids["reservation"]) == "hold"
        finally:
            await cleanup(ids)
    asyncio.run(run())


@pytest.mark.parametrize("scope", ["client", "studio"])
def test_foreign_identifiers_do_not_override_token_ownership(monkeypatch, scope):
    async def run():
        ids = await seed()
        try:
            other = dict(ids)
            if scope == "studio":
                other["studio"] = ids["other"]
            else:
                async with async_session_maker() as db:
                    person = Client(studio_id=ids["studio"], name="Another client")
                    db.add(person)
                    await db.commit()
                    other["katya"] = person.id
            async def forbidden(*args):
                pytest.fail("Foreign payment must never be requested from Stripe")
            monkeypatch.setattr(stripe_connect, "fetch_session", forbidden)
            app = api(other)
            response = await sync(app)
            assert response.status_code == 200 and response.json()["payments"] == []
            for target in ({"checkout_id": ids["checkout"]}, {"reservation_id": ids["reservation"]}):
                assert (await sync(app, target)).status_code == 404
            assert await bookings._status(ids["reservation"]) == "hold"
        finally:
            await cleanup(ids)
    asyncio.run(run())


@pytest.mark.parametrize("status", ["paid", "failed", "refunded"])
def test_terminal_attempt_returns_database_status_without_stripe(monkeypatch, status):
    async def run():
        ids = await seed()
        try:
            async with async_session_maker() as db:
                if status == "paid":
                    assert await stripe_pay.apply_paid(db, ids["session"], account_id=bookings.ACCOUNT)
                else:
                    (await db.get(StripeCheckout, ids["checkout"])).status = status
                    await db.commit()
            async def forbidden(*args):
                pytest.fail("A terminal attempt needs no Stripe lookup")
            monkeypatch.setattr(stripe_connect, "fetch_session", forbidden)
            response = await sync(api(ids), {})
            assert response.status_code == 200, response.text
            assert response.json()["payments"][0]["status"] == status
            assert response.json()["payments"][0]["newly_paid"] is False
        finally:
            await cleanup(ids)
    asyncio.run(run())


def test_orphan_recovery_uses_bounded_reference_search(monkeypatch):
    async def run():
        ids = await seed(orphan=True)
        try:
            async def find(account, reference, created_after, *, max_sessions):
                assert account == bookings.ACCOUNT and reference == ids["attempt"]
                assert 0 < max_sessions <= 100
                return ids["session"]
            monkeypatch.setattr(stripe_connect, "find_session_by_reference", find)
            stub_session(monkeypatch, ids)
            response = await sync(api(ids))
            assert response.status_code == 200, response.text
            assert response.json()["payments"][0]["status"] == "paid"
            assert (await bookings._checkout(ids["checkout"])).session_id == ids["session"]
        finally:
            await cleanup(ids)
    asyncio.run(run())


def test_authentication_and_positive_target_validation():
    async def run():
        ids = {"studio": 1, "katya": 1}
        assert (await sync(api(ids, authenticated=False))).status_code == 401
        for body in ({"checkout_id": 0}, {"reservation_id": -1}):
            assert (await sync(api(ids), body)).status_code == 422
    asyncio.run(run())


@pytest.mark.parametrize("section, checkout_status, want", [
    ("upcoming", "paid", True), ("past", "paid", True),
    ("cancelled", "paid", True), ("cancelled", "refunded", False),
    ("upcoming", "pending", False), ("upcoming", "failed", False),
])
def test_my_lessons_paid_online_uses_linked_payment_not_booking_status(section, checkout_status, want):
    async def run():
        ids = await seed()
        try:
            async with async_session_maker() as db:
                checkout = await db.get(StripeCheckout, ids["checkout"])
                checkout.status = checkout_status
                reservation = await db.get(Reservation, ids["reservation"])
                # All variants have no debt: active/free must not imply paid.
                reservation.status = "cancelled" if section == "cancelled" else "active"
                if section == "past":
                    (await db.get(Lesson, ids["paid"])).start_time = datetime.utcnow() - timedelta(days=1)
                await db.commit()
            app = api(ids)
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
                response = await client.get("/global/lessons/my")
            assert response.status_code == 200, response.text
            lesson, = response.json()[section]
            assert lesson["reservation_id"] == ids["reservation"]
            assert lesson["paid_online"] is want
        finally:
            await cleanup(ids)
    asyncio.run(run())


def test_default_sync_limits_stripe_reads_and_releases_read_transaction(monkeypatch):
    async def run():
        ids = await seed()
        try:
            async with async_session_maker() as db:
                original = await db.get(StripeCheckout, ids["checkout"])
                for index in range(5):
                    db.add(StripeCheckout(studio_id=ids["studio"], user_id=None,
                        account_id=bookings.ACCOUNT, attempt_id=f"bounded_{index}",
                        session_id=f"cs_bounded_{index}", payload=original.payload,
                        amount=500, status="pending"))
                await db.commit()
            from database import get_db
            sessions, reads = [], []
            async def provide_db():
                async with async_session_maker() as db:
                    sessions.append(db)
                    yield db
            async def fetch(session_id, account_id):
                assert all(not db.in_transaction() for db in sessions)
                reads.append(session_id)
                return SimpleNamespace(id=session_id, client_reference_id=None, metadata={},
                    payment_status="unpaid", status="open", mode="payment", amount_total=50000,
                    currency="czk", livemode=False)
            monkeypatch.setattr(stripe_connect, "fetch_session", fetch)
            app = api(ids)
            app.dependency_overrides[get_db] = provide_db
            response = await sync(app)
            assert response.status_code == 200, response.text
            assert len(reads) == 3
            assert len(response.json()["payments"]) == 6
            assert all(p["status"] == "pending" for p in response.json()["payments"])
        finally:
            await cleanup(ids)
    asyncio.run(run())


@pytest.mark.parametrize("base, expected", [
    ("https://example.test/s/studio?pay=", "https://example.test/s/studio?pay=paysuccess&checkout_id=42"),
    ("https://t.me/studio_bot?startapp=", "https://t.me/studio_bot?startapp=paysuccess"),
])
def test_return_links_identify_web_checkout_and_preserve_telegram_startapp(base, expected):
    assert stripe_connect.checkout_return_url(base, "paysuccess", 42) == expected


@pytest.mark.parametrize("changes, expected", [
    ({}, True), ({"amount_total": 100}, False), ({"currency": "eur"}, False),
    ({"livemode": True}, False), ({"livemode": None}, False),
    ({"mode": "subscription"}, False), ({"id": "cs_other"}, False),
    ({"client_reference_id": "other"}, False),
    ({"metadata": {"checkout_attempt": "other"}}, False),
    ({"client_reference_id": None, "metadata": {"checkout_attempt": "attempt"}}, True),
])
def test_stripe_verification_rejects_wrong_payment_identity_and_terms(changes, expected):
    from services.client_checkout_sync import _verified
    row = SimpleNamespace(amount=500, currency="CZK", payload={},
        session_id="cs_sync", attempt_id="attempt")
    session = stripe_session({"session": "cs_sync", "attempt": "attempt"}, **changes)
    assert _verified(session, row) is expected
