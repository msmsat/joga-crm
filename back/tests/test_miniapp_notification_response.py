"""Saved miniapp mutations must reach the client before notification I/O.

Use the real router, JWT and PostgreSQL transaction. A raw ASGI sender observes
the actual response boundary: httpx's ASGI transport waits for BackgroundTasks
and cannot distinguish a delayed response from post-response work.
"""
import asyncio
import json
from contextlib import suppress
from datetime import datetime, timedelta, timezone

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from database import async_session_maker, get_db
from models import BookingNotificationIntent, ClientSubscription, Lesson, Reservation
from routers.booking import miniapp_lessons as routes
from security import create_access_token
from services import subscription_charge
from test_miniapp_journey import fixture_app, seed


@pytest.mark.parametrize("action", ["create", "create_with_pass", "cancel", "rate_lesson", "rate_booking"])
def test_saved_mutation_responds_before_stalled_notification(monkeypatch, action):
    async def scenario():
        async with fixture_app(monkeypatch) as (app, capture, state):
            ids = state["ids"] = await seed()
            create = action.startswith("create")
            pass_id = None
            if action == "create_with_pass":
                async with async_session_maker() as db:
                    subscription = ClientSubscription(client_id=ids["client"], type="Fixture Pass",
                        total_classes=2, used_classes=0, status="active",
                        expires_at=datetime.now(timezone.utc).date() + timedelta(days=30))
                    db.add(subscription)
                    await db.commit()
                    pass_id = subscription.id
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://fixture.local") as http:
                token = create_access_token({"sub": str(ids["client"]), "typ": "client", "studio_id": ids["studio"]})
                http.headers["Authorization"] = f"Bearer {token}"
                if not create:
                    created = await http.post("/global/reservations", json={"lesson_id": ids["lesson"], "spot_number": 3})
                    assert created.status_code == 201, created.text
                    reservation_id = created.json()["id"]
                    async with async_session_maker() as db:
                        lesson = await db.get(Lesson, ids["lesson"])
                        now = datetime.now(timezone.utc).replace(tzinfo=None)
                        lesson.start_time = now + timedelta(minutes=30) if action == "cancel" else now - timedelta(hours=2)
                        await db.commit()

            entered, release, delivered = asyncio.Event(), asyncio.Event(), asyncio.Event()
            response = {}
            calls = []
            request_sessions = []

            async def request_db():
                async with async_session_maker() as db:
                    request_sessions.append(db)
                    yield db

            async def stalled(db, studio_id, role, event, context, **_kwargs):
                calls.append((role, event, context))
                if len(calls) == 1:
                    response["notification_db"] = db
                    entered.set()
                    await release.wait()
                return True

            app.dependency_overrides[get_db] = request_db
            monkeypatch.setattr(routes, "notify", stalled)
            if action == "create_with_pass":
                monkeypatch.setattr(subscription_charge, "notify", stalled)
            if create:
                path, body = "/global/reservations", {"lesson_id": ids["lesson"], "spot_number": 3}
            elif action == "cancel":
                path, body = f"/global/reservations/{ids['lesson']}/cancel", {}
            elif action == "rate_lesson":
                path, body = f"/global/reservations/{ids['lesson']}/rate", {"rating": 5}
            else:
                path, body = f"/global/bookings/{reservation_id}/rate", {"rating": 5}
            payload = json.dumps(body).encode()
            received = False

            async def receive():
                nonlocal received
                if not received:
                    received = True
                    return {"type": "http.request", "body": payload, "more_body": False}
                await asyncio.Event().wait()

            async def send(message):
                if message["type"] == "http.response.start":
                    response["status"] = message["status"]
                elif message["type"] == "http.response.body":
                    response["body"] = response.get("body", b"") + message.get("body", b"")
                    if not message.get("more_body", False):
                        delivered.set()

            scope = {"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
                     "method": "POST", "scheme": "http", "path": path, "raw_path": path.encode(),
                     "query_string": b"", "root_path": "", "server": ("fixture.local", 80),
                     "client": ("127.0.0.1", 50000), "headers": [
                         (b"content-type", b"application/json"),
                         (b"authorization", f"Bearer {token}".encode()),
                     ]}
            task = asyncio.create_task(app(scope, receive, send))
            try:
                await asyncio.wait_for(entered.wait(), 3)
                try:
                    await asyncio.wait_for(delivered.wait(), 0.2)
                except TimeoutError:
                    pytest.fail("Saved mutation did not send its HTTP response before stalled notification I/O")
                assert response["status"] == (201 if create else 200)
                result = json.loads(response["body"])
                assert result["status"] == ("cancelled" if action == "cancel" else "active")
                assert response["notification_db"] is not request_sessions[0]
                assert not request_sessions[0].in_transaction(), "response session retained a database connection during delivery"
                async with async_session_maker() as db:
                    saved = await db.get(Reservation, result["id"])
                    assert saved.status == result["status"]
                    assert saved.spot_number == 3
                    if pass_id is not None:
                        assert (await db.get(ClientSubscription, pass_id)).used_classes == 1
                    if action.startswith("rate"):
                        assert saved.rating == 5
                    intents = (await db.execute(select(BookingNotificationIntent.event_code).where(
                        BookingNotificationIntent.reservation_id == saved.id))).scalars().all()
                    assert sorted(intents) == (["booking_cancelled", "booking_confirmed"] if action == "cancel" else ["booking_confirmed"])
                release.set()
                await asyncio.wait_for(task, 3)
                expected = {"create": [("admin", "a1"), ("trainer", "t1")],
                            "create_with_pass": [("admin", "a1"), ("trainer", "t1"), ("client", "c5"), ("admin", "a6")],
                            "cancel": [("trainer", "t2"), ("admin", "a2")],
                            "rate_lesson": [("trainer", "t7")], "rate_booking": [("trainer", "t7")]}[action]
                assert [(role, event) for role, event, _ in calls] == expected
                assert calls[0][2]["client_name"] == "Existing Client"
                if create:
                    assert calls[0][2]["trainer_id"] == ids["anna"]
                    assert calls[1][2]["trainer_id"] == ids["anna"]
                    if pass_id is not None:
                        assert calls[2][2] == {"client_id": ids["client"], "remaining": 1}
                        assert calls[3][2] == {"client_name": "Existing Client", "remaining": 1}
                elif action.startswith("rate"):
                    assert calls[0][2]["rating"] == 5
            finally:
                release.set()
                task.cancel()
                with suppress(asyncio.CancelledError):
                    await task

    asyncio.run(scenario())
