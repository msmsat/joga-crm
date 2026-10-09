"""Miniapp booking transitions reach real PostgreSQL and loopback SMTP.

The HTTP/JWT login and SMTP fixture are shared with the miniapp journeys.
Booking intents, worker, notification resolver, mail rendering, and outbox
deduplication all use the application implementations; no worker is started.
"""
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from database import async_session_maker
from models import (BookingNotificationIntent, NotificationLog, Reservation,
                    StudioNotificationSettings)
from models.booking_notification import PENDING, SENT
from services import booking_notifications, mailer, notifier
from test_miniapp_journey import login, run


@pytest.fixture
def booking_mail_transport(monkeypatch):
    # Some older test modules replace this imported binding during collection.
    # Restore the real mailer for this test only; fixture_app directs its SMTP
    # transport to a checked 127.0.0.1 socket and restores it after the journey.
    monkeypatch.setattr(notifier, "send_email", mailer.send_email)
    return monkeypatch


async def intents_for(reservation_id):
    # Read in a fresh session: the API and worker must have committed their work.
    async with async_session_maker() as db:
        rows = (await db.execute(select(BookingNotificationIntent).where(
            BookingNotificationIntent.reservation_id == reservation_id
        ).order_by(BookingNotificationIntent.id))).scalars().all()
        return [{"id": row.id, "event": row.event_code, "state": row.state,
                 "attempts": row.attempt_count, "error": row.last_error,
                 "version": row.lesson_version} for row in rows]


@pytest.mark.parametrize("mode", ["resource", "event"])
def test_booking_and_cancel_deliver_once_through_durable_intents(
    booking_mail_transport, mode,
):
    async def scenario(http, ids, capture):
        def client_mail():
            # Group-booking post-response hooks can also send staff messages.
            # The durable c1/c3 journey concerns this authenticated client.
            return [row for row in capture.messages if row["to"] == ids["email"]]

        # Exercise the actual database notification settings rather than
        # replacing channel resolution. No messaging integration is connected.
        async with async_session_maker() as db:
            db.add(StudioNotificationSettings(
                studio_id=ids["studio"], email_notifications=True,
                telegram_notifications=False, whatsapp_notifications=False,
            ))
            await db.commit()
        await login(http, ids, capture)
        assert len(capture.messages) == 1 and capture.messages[0]["code"]
        capture.messages.clear()

        if mode == "resource":
            available = await http.get("/global/availability", params={
                "service_id": ids["haircut"], "branch_id": ids["central"],
                "teacher_id": ids["anna"], "date_from": ids["day"],
                "date_to": ids["day"],
            })
            assert available.status_code == 200, available.text
            slot = available.json()["slots"][0]
            quote = await http.post("/global/booking-quotes", json={
                "booking_mode": "resource", "service_id": ids["haircut"],
                "branch_id": ids["central"], "teacher_id": ids["anna"],
                "starts_at": slot["starts_at"], "payment_method": "venue",
            })
            assert quote.status_code == 201, quote.text
            body = {"quote_id": quote.json()["quote_id"]}
            booked = await http.post("/global/bookings", json=body)
            assert booked.status_code == 200, booked.text
            reservation_id = booked.json()["reservation_id"]
            duplicate = await http.post("/global/bookings", json=body)
            assert duplicate.status_code in {200, 201}, duplicate.text
            assert duplicate.json()["reservation_id"] == reservation_id
            lesson_name = "Haircut"
        else:
            booked = await http.post("/global/reservations", json={
                "lesson_id": ids["lesson"], "spot_number": 3,
            })
            assert booked.status_code == 201, booked.text
            reservation_id = booked.json()["id"]
            lesson_name = "Yoga"

        async with async_session_maker() as db:
            reservation = await db.get(Reservation, reservation_id)
            assert reservation.status == "active" and reservation.client_id == ids["client"]
            if mode == "event":
                assert reservation.spot_number == 3
        confirmed = await intents_for(reservation_id)
        assert len(confirmed) == 1
        assert confirmed[0]["event"] == "booking_confirmed"
        assert confirmed[0]["state"] == PENDING and confirmed[0]["attempts"] == 0
        assert client_mail() == [], "The request sent client mail before the durable worker"

        moment = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(seconds=1)
        assert await booking_notifications.run_due(now=moment) == {
            "sent": 1, "retry": 0, "failed": 0,
        }
        confirmed = await intents_for(reservation_id)
        assert confirmed[0]["state"] == SENT and confirmed[0]["attempts"] == 1
        assert confirmed[0]["error"] is None
        assert [row["subject"] for row in client_mail()] == ["Booking confirmed"]
        assert lesson_name in client_mail()[0]["html"]
        assert "Journey Studio" in client_mail()[0]["html"]

        # Even well after the original outbox's calendar-hour boundary, a new
        # worker pass must leave the successful intent and SMTP count alone.
        assert await booking_notifications.run_due(now=moment + timedelta(hours=2)) == {
            "sent": 0, "retry": 0, "failed": 0,
        }
        assert len(client_mail()) == 1

        cancelled = await http.post(f"/global/bookings/{reservation_id}/cancel")
        assert cancelled.status_code == 200, cancelled.text
        async with async_session_maker() as db:
            reservation = await db.get(Reservation, reservation_id)
            assert reservation.status == "cancelled"
        rows = await intents_for(reservation_id)
        assert [row["event"] for row in rows] == ["booking_confirmed", "booking_cancelled"]
        assert [row["state"] for row in rows] == [SENT, PENDING]
        assert len(client_mail()) == 1, "Cancellation bypassed its durable intent"

        assert await booking_notifications.run_due(now=moment + timedelta(hours=3)) == {
            "sent": 1, "retry": 0, "failed": 0,
        }
        rows = await intents_for(reservation_id)
        assert all(row["state"] == SENT and row["attempts"] == 1 and row["error"] is None
                   for row in rows)
        assert [row["subject"] for row in client_mail()] == [
            "Booking confirmed", "Class cancelled",
        ]
        assert all(row["to"] == ids["email"] and lesson_name in row["html"]
                   for row in client_mail())
        assert await booking_notifications.run_due(now=moment + timedelta(days=1)) == {
            "sent": 0, "retry": 0, "failed": 0,
        }
        assert len(client_mail()) == 2
        assert await intents_for(reservation_id) == rows

        async with async_session_maker() as db:
            logs = (await db.execute(select(NotificationLog).where(
                NotificationLog.studio_id == ids["studio"],
                NotificationLog.event_id.in_(["c1", "c3"]),
            ).order_by(NotificationLog.id))).scalars().all()
            assert [row.event_id for row in logs] == ["c1", "c3"]
            assert all(row.channel == "email" and row.status == SENT
                       and row.recipient_id == ids["client"]
                       and row.recipient_address == ids["email"]
                       and row.finished_at is not None and row.error is None for row in logs)
            assert len({row.dedup_key for row in logs}) == 2

    run(booking_mail_transport, scenario)
