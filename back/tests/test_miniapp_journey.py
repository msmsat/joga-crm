"""Miniapp HTTP → PostgreSQL → socket SMTP journeys and browser fixture.

This test app uses the production routers and real JWT authentication. It never
imports main.py or starts workers. Existing TEST_DATABASE_URL, Stripe, LLM and
messaging guards stay active; the only email transport is a loopback socket.
"""
import asyncio
import os
import re
import uuid
from contextlib import asynccontextmanager
from contextvars import ContextVar
from datetime import datetime, timedelta, timezone
from email import policy
from email.parser import BytesParser

import pytest
import uvicorn
from aiosmtplib.smtp import SMTP
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event, insert, select

import database
from database import async_session_maker
from models import (BranchWorkingHours, Client, ClientEmailOtp, ClientLoyaltyCard, ClientPayment,
                    Lesson, OnlineChannel, Reservation, Service, StaffBranchAssignment,
                    StaffWorkingHours, Studio, StudioBookingSettings, StudioBranch,
                    StudioLoyaltyConfig, StudioMember, StudioSubscriptionProgramConfig,
                    StudioWorkingHours, SubscriptionPackage, User, StripeCheckout, Operation)
from models.base import user_services
from ratelimit import limiter
from routers.booking import miniapp_router
from routers.booking import miniapp_email_auth
from services import mailer


class SmtpCapture:
    def __init__(self):
        self.messages = []
        self.reject_next = False
        self.connections_during_otp = []
        self.total_connections_during_otp = []
        self.active_db_connections = 0
        self.active_db_by_request = {}

    async def accept(self, reader, writer):
        writer.write(b"220 fixture.local ESMTP ready\r\n")
        await writer.drain()
        try:
            while line := await reader.readline():
                command = line.decode().strip().split(" ", 1)[0].upper()
                if command in {"EHLO", "HELO"}:
                    writer.write(b"250-fixture.local\r\n250 8BITMIME\r\n")
                elif command == "DATA":
                    if self.reject_next:
                        self.reject_next = False
                        writer.write(b"550 rejected by local fixture\r\n")
                    else:
                        writer.write(b"354 end with dot\r\n")
                        await writer.drain()
                        data = []
                        while (part := await reader.readline()) not in {b".\r\n", b""}:
                            data.append(part[1:] if part.startswith(b"..") else part)
                        message = BytesParser(policy=policy.default).parsebytes(b"".join(data))
                        html = message.get_body(preferencelist=("html",)).get_content()
                        match = re.search(r"<b>(\d{6})</b>", html)
                        self.messages.append({"to": str(message["To"]), "subject": str(message["Subject"]),
                                              "code": match.group(1) if match else None, "html": html})
                        writer.write(b"250 captured\r\n")
                elif command == "QUIT":
                    writer.write(b"221 bye\r\n")
                    await writer.drain()
                    return
                else:
                    writer.write(b"250 ok\r\n")
                await writer.drain()
        finally:
            writer.close()
            await writer.wait_closed()

    def latest_code(self, email):
        return next(row["code"] for row in reversed(self.messages) if row["to"] == email and row["code"])


async def seed():
    tag = uuid.uuid4().hex[:12]
    today = datetime.now(timezone.utc).date()
    tomorrow = today + timedelta(days=1)
    async with async_session_maker() as db:
        studio = Studio(name="Journey Studio", currency="CZK", language="en", tz_iana="UTC",
                        booking_mode="hybrid", strict_schedule_enabled=True, space_is_axis=False)
        db.add(studio)
        await db.flush()
        branches = [StudioBranch(studio_id=studio.id, name=name, address=f"{name} street")
                    for name in ("Central", "Riverside")]
        teachers = [User(email=f"{tag}-{name.lower()}@miniapp-fixture.net", hashed_password="x", name=name)
                    for name in ("Anna", "Boris")]
        haircut = Service(studio_id=studio.id, name="Haircut", price=0, duration_min=45,
                          booking_mode="resource", service_type="individual")
        massage = Service(studio_id=studio.id, name="Massage", price=0, duration_min=30,
                          booking_mode="resource", service_type="individual")
        yoga = Service(studio_id=studio.id, name="Yoga", price=0, duration_min=60,
                       booking_mode="event", service_type="group")
        client = Client(studio_id=studio.id, name="Existing Client", email=f"{tag}@miniapp-fixture.net",
                        phone="+420777123456", is_active=True)
        subscription_config = StudioSubscriptionProgramConfig(studio_id=studio.id, is_enabled=True)
        db.add(subscription_config)
        await db.flush()
        package = SubscriptionPackage(studio_id=studio.id, config_id=subscription_config.id,
                                      name="Fixture Pass", class_count=8, price=0, per_visit_price=0, duration_days=30)
        db.add_all([*branches, *teachers, haircut, massage, yoga, client, package])
        await db.flush()
        db.add_all([
            StudioBookingSettings(studio_id=studio.id, min_booking_advance_min=0, booking_window_days=14,
                                  cancellation_deadline_min=0, prefill_on_booking=False,
                                  widget_work_start="00:00", widget_work_end="00:00", widget_language="en"),
            StudioLoyaltyConfig(studio_id=studio.id, is_enabled=True, program_name="Journey Club"),
            ClientLoyaltyCard(studio_id=studio.id, client_id=client.id, points_balance=25),
            OnlineChannel(studio_id=studio.id, channel_type="stripe", is_active=True,
                          account_id="acct_socket_fixture_never_external"),
        ])
        for teacher in teachers:
            db.add(StudioMember(studio_id=studio.id, user_id=teacher.id, name=teacher.name,
                                role="trainer", status="active"))
            for branch in branches:
                db.add(StaffBranchAssignment(studio_id=studio.id, user_id=teacher.id, branch_id=branch.id))
            for dow in range(7):
                db.add(StaffWorkingHours(studio_id=studio.id, user_id=teacher.id, day_of_week=dow,
                                         is_open=True, open_time="09:00", close_time="18:00"))
        for dow in range(7):
            db.add(StudioWorkingHours(studio_id=studio.id, day_of_week=dow, is_open=True,
                                      open_time="00:00", close_time="00:00"))
            for branch in branches:
                db.add(BranchWorkingHours(branch_id=branch.id, day_of_week=dow, is_open=True,
                                          open_time="00:00", close_time="00:00"))
        for teacher, services in [(teachers[0], [haircut, massage, yoga]), (teachers[1], [haircut, yoga])]:
            for service in services:
                await db.execute(insert(user_services).values(user_id=teacher.id, service_id=service.id))
        lesson = Lesson(studio_id=studio.id, name="Yoga", teacher_id=teachers[0].id,
                        teacher_name="Anna", service_id=yoga.id, branch_id=branches[0].id,
                        tz_iana="UTC", start_time=datetime.combine(tomorrow, datetime.min.time()).replace(hour=13),
                        duration_min=60, price=0, level="all", equipment="mat", total_spots=8,
                        status="confirmed", booking_mode="event")
        db.add(lesson)
        await db.commit()
        return {"studio": studio.id, "code": studio.public_code, "today": today.isoformat(),
                "day": tomorrow.isoformat(), "email": client.email, "client": client.id,
                "anna": teachers[0].id, "boris": teachers[1].id,
                "central": branches[0].id, "riverside": branches[1].id,
                "haircut": haircut.id, "massage": massage.id, "yoga": yoga.id,
                "lesson": lesson.id, "package": package.id}


@asynccontextmanager
async def fixture_app(monkeypatch):
    assert database.db_key(database.DATABASE_URL) == database.db_key(os.getenv("TEST_DATABASE_URL"))
    assert database.db_key(database.DATABASE_URL) != database.db_key(os.getenv("DATABASE_URL"))
    capture = SmtpCapture()
    from test_booking_saga import FakeStripe
    from services import stripe_connect, stripe_env
    fake_stripe = FakeStripe()
    # Browser fixture runs may share the isolated DB with earlier regressions.
    # Stripe IDs are globally unique; retain that property across server runs.
    fake_stripe.session_prefix = f'cs_journey_{uuid.uuid4().hex}'
    for name in ('create_hosted_checkout_session', 'fetch_session', 'expire_session'):
        monkeypatch.setattr(stripe_connect, name, getattr(fake_stripe, name))
    return_urls = {}
    async def create_checkout(**kwargs):
        result = await fake_stripe.create_hosted_checkout_session(**kwargs)
        return_urls[result[0]] = {name: kwargs[name] for name in ('success_url', 'cancel_url')}
        return result
    monkeypatch.setattr(stripe_connect, 'create_hosted_checkout_session', create_checkout)
    # Own the return origin, including HTTP tests without an Origin header.
    # A developer's .env must not hide missing CI configuration or receive returns.
    preview_url = f"http://127.0.0.1:{os.getenv('MINIAPP_E2E_PREVIEW_PORT', '4174')}"
    monkeypatch.setenv('MINIAPP_URL', preview_url)
    monkeypatch.setenv('CORS_ORIGINS', preview_url)
    monkeypatch.setattr(stripe_connect, 'configured', lambda: True)
    monkeypatch.setattr(stripe_env, 'expects_livemode', lambda: False)
    request_scope = ContextVar("journey_request_scope", default=None)
    smtp = await asyncio.start_server(capture.accept, "127.0.0.1", 0)
    smtp_port = smtp.sockets[0].getsockname()[1]
    for key, value in {"SMTP_HOST": "127.0.0.1", "SMTP_PORT": str(smtp_port),
                       "SMTP_USER": "fixture", "SMTP_PASS": "fixture", "SMTP_FROM": "sender@miniapp-fixture.net"}.items():
        monkeypatch.setenv(key, value)
    monkeypatch.setattr(limiter, "enabled", False)

    async def socket_send(message, **kwargs):
        # Retain actual SMTP protocol traffic while replacing pytest's swallow.
        assert kwargs["hostname"] == "127.0.0.1" and kwargs["port"] == smtp_port
        if "Login code" in str(message["Subject"]):
            capture.connections_during_otp.append(capture.active_db_by_request.get(request_scope.get(), 0))
            capture.total_connections_during_otp.append(capture.active_db_connections)
        async with SMTP(hostname="127.0.0.1", port=smtp_port, start_tls=False, timeout=2) as client:
            return await client.send_message(message)

    monkeypatch.setattr(mailer.aiosmtplib, "send", socket_send)
    monkeypatch.setattr(miniapp_email_auth, "send_email", mailer.send_email)

    class CapturedSmtp(SMTP):
        def __init__(self, **kwargs):
            assert kwargs["hostname"] == "127.0.0.1" and kwargs["port"] == smtp_port
            capture.connections_during_otp.append(capture.active_db_by_request.get(request_scope.get(), 0))
            capture.total_connections_during_otp.append(capture.active_db_connections)
            super().__init__(hostname="127.0.0.1", port=smtp_port, start_tls=False, timeout=2)

        async def login(self, *_args, **_kwargs):
            # The fixture accepts mail through actual TCP SMTP without provider
            # credentials or TLS; production connection ownership stays tested.
            return None

    monkeypatch.setattr(mailer.aiosmtplib, "SMTP", CapturedSmtp)

    def checkout(_connection, record, _proxy):
        capture.active_db_connections += 1
        owner = request_scope.get()
        record.info["journey_request_scope"] = owner
        if owner is not None:
            capture.active_db_by_request[owner] = capture.active_db_by_request.get(owner, 0) + 1

    def checkin(_connection, record):
        capture.active_db_connections -= 1
        owner = record.info.pop("journey_request_scope", None)
        if owner is not None:
            left = capture.active_db_by_request[owner] - 1
            if left:
                capture.active_db_by_request[owner] = left
            else:
                del capture.active_db_by_request[owner]

    event.listen(database.engine.sync_engine, "checkout", checkout)
    event.listen(database.engine.sync_engine, "checkin", checkin)
    app = FastAPI()
    app.state.limiter = limiter
    app.include_router(miniapp_router, prefix="/global")
    app.add_middleware(CORSMiddleware, allow_origins=[preview_url],
                       allow_methods=["*"], allow_headers=["*"])

    class ConnectionScope:
        def __init__(self, app):
            self.app = app

        async def __call__(self, scope, receive, send):
            if scope["type"] != "http":
                return await self.app(scope, receive, send)
            # asyncio.wait_for's sender task inherits this context. Measuring
            # the login request distinguishes its session from simultaneous
            # guest catalogue requests without mocking database ownership.
            token = request_scope.set(object())
            try:
                await self.app(scope, receive, send)
            finally:
                request_scope.reset(token)

    app.add_middleware(ConnectionScope)
    state = {"ids": None, "stripe": fake_stripe}

    @app.get("/__test/health")
    async def health():
        return {"ready": True, "fixture": "isolated-postgres-smtp"}

    @app.post("/__test/shutdown")
    async def shutdown():
        # Playwright's Windows process-tree termination does not reliably stop
        # pytest grandchildren. Exit the isolated fixture through uvicorn.
        server = getattr(app.state, "fixture_server", None)
        if server is not None:
            server.should_exit = True
        return {"ok": True}

    @app.post("/presence/beat")
    async def presence():
        return {"ok": True}

    @app.post("/__test/reset")
    async def reset():
        state["ids"] = await seed()
        capture.messages.clear()
        capture.connections_during_otp.clear()
        capture.total_connections_during_otp.clear()
        return state["ids"]

    @app.get("/__test/mail")
    async def mail(email: str):
        rows = [row for row in capture.messages if row["to"] == email and row["code"]]
        if not rows:
            raise HTTPException(404, "No captured login email")
        return {**rows[-1], "count": len(rows), "db_connections_at_send": capture.connections_during_otp[-1]}

    @app.post("/__test/mail/reject")
    async def reject():
        capture.reject_next = True
        return {"ok": True}

    @app.get("/__test/bookings")
    async def bookings():
        async with async_session_maker() as db:
            rows = (await db.execute(select(Reservation, Lesson).join(Lesson).where(
                Lesson.studio_id == state["ids"]["studio"]))).all()
            return [{"id": row.id, "status": row.status, "client_id": row.client_id,
                     "spot": row.spot_number, "lesson": lesson.id, "service": lesson.service_id,
                     "teacher": lesson.teacher_id, "branch": lesson.branch_id,
                     "time": lesson.start_time.isoformat()} for row, lesson in rows]

    @app.post("/__test/booking-settings")
    async def booking_settings(body: dict):
        async with async_session_maker() as db:
            sid = state['ids']['studio']
            settings = (await db.execute(select(StudioBookingSettings).where(
                StudioBookingSettings.studio_id == sid))).scalar_one()
            settings.prefill_on_booking = body['prepay_required']
            if 'service_price' in body:
                service = await db.get(Service, state['ids']['haircut'])
                service.price = body['service_price']
            if 'can_pay_online' in body:
                channel = (await db.execute(select(OnlineChannel).where(
                    OnlineChannel.studio_id == sid, OnlineChannel.channel_type == 'stripe'))).scalar_one()
                channel.is_active = body['can_pay_online']
            await db.commit()
        return {'ok': True}

    @app.post("/__test/venue-booking")
    async def venue_booking():
        from services import booking
        ids = state['ids']
        async with async_session_maker() as db:
            lesson = await db.get(Lesson, ids['lesson'])
            lesson.price = 500
            result = await booking.create(db, studio_id=ids['studio'], client_id=ids['client'],
                lesson_id=ids['lesson'], source='miniapp', allow_payment=True)
            assert result.status == 'active'
            await db.commit()
        return {'reservation_id': result.reservation_id}

    @app.post("/__test/confirm-stripe-payment")
    async def confirm_stripe_payment(body: dict):
        async with async_session_maker() as db:
            checkout = (await db.execute(select(StripeCheckout).where(
                StripeCheckout.studio_id == state['ids']['studio'],
                StripeCheckout.payload['reservation_id'].as_integer() == body['reservation_id'],
            ).order_by(StripeCheckout.id.desc()))).scalars().first()
            assert checkout is not None
            fake_stripe.pay(checkout.session_id)
            return {'checkout_id': checkout.id}

    @app.get("/__test/payment-ledger")
    async def payment_ledger():
        async with async_session_maker() as db:
            payments = (await db.execute(select(ClientPayment).where(
                ClientPayment.client_id == state['ids']['client']))).scalars().all()
            income = (await db.execute(select(Operation).where(
                Operation.studio_id == state['ids']['studio'], Operation.type == 'in'))).scalars().all()
            return {'payments': [{'id': p.id, 'status': p.status, 'amount': p.amount} for p in payments],
                    'income': [o.amount for o in income]}

    @app.get('/__test/checkout-urls/{session_id}')
    async def checkout_urls(session_id: str):
        return return_urls[session_id]

    @app.post("/__test/otp/expire")
    async def expire(body: dict):
        async with async_session_maker() as db:
            otp = (await db.execute(select(ClientEmailOtp).where(
                ClientEmailOtp.studio_id == state["ids"]["studio"], ClientEmailOtp.email == body["email"]))).scalar_one()
            otp.expires_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(seconds=1)
            await db.commit()
        return {"ok": True}

    try:
        yield app, capture, state
    finally:
        smtp.close()
        await smtp.wait_closed()
        event.remove(database.engine.sync_engine, "checkout", checkout)
        event.remove(database.engine.sync_engine, "checkin", checkin)


async def login(http, ids, capture, email=None, name=None):
    email = email or ids["email"]
    response = await http.post("/global/auth/email/request", json={"studio_id": ids["code"], "email": email})
    assert response.status_code == 202, response.text
    assert capture.connections_during_otp[-1] == 0, "OTP SMTP held a database connection"
    response = await http.post("/global/auth/email/verify", json={
        "studio_id": ids["code"], "email": email, "code": capture.latest_code(email), "name": name,
    })
    assert response.status_code == 200, response.text
    http.headers["Authorization"] = f"Bearer {response.json()['token']}"
    return response.json()


def run(monkeypatch, scenario):
    async def execute():
        async with fixture_app(monkeypatch) as (app, capture, state):
            state["ids"] = await seed()
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://fixture.local") as http:
                await scenario(http, state["ids"], capture)
    asyncio.run(execute())


def test_email_socket_login_booking_persistence_idempotency_and_cancel(monkeypatch):
    async def scenario(http, ids, capture):
        auth = await login(http, ids, capture, f"new-{uuid.uuid4().hex}@miniapp-fixture.net", "New Client")
        assert auth["user"]["name"] == "New Client"
        async with async_session_maker() as db:
            client = await db.get(Client, auth["user"]["id"])
            assert client.name == "New Client" and client.studio_id == ids["studio"]
        response = await http.get("/global/availability", params={"service_id": ids["haircut"],
            "branch_id": ids["central"], "teacher_id": ids["anna"], "date_from": ids["day"], "date_to": ids["day"]})
        assert response.status_code == 200, response.text
        slot = response.json()["slots"][0]
        body = {"booking_mode": "resource", "service_id": ids["haircut"], "branch_id": ids["central"],
                "teacher_id": ids["anna"], "starts_at": slot["starts_at"], "payment_method": "venue"}
        response = await http.post("/global/booking-quotes", json=body)
        assert response.status_code == 201, response.text
        quote = response.json()["quote_id"]
        response = await http.post("/global/bookings", json={"quote_id": quote})
        assert response.status_code == 200, response.text
        booking = response.json()
        duplicate = await http.post("/global/bookings", json={"quote_id": quote})
        assert duplicate.status_code in {200, 201}, duplicate.text
        assert duplicate.json()["reservation_id"] == booking["reservation_id"]
        rows = (await http.get("/__test/bookings")).json()
        assert len(rows) == 1 and rows[0]["status"] == "active"
        assert rows[0]["service"] == ids["haircut"] and rows[0]["teacher"] == ids["anna"]
        mine = (await http.get("/global/lessons/my")).json()
        assert mine["upcoming"][0]["reservation_id"] == booking["reservation_id"]
        response = await http.post(f"/global/bookings/{booking['reservation_id']}/cancel")
        assert response.status_code == 200, response.text
        assert (await http.get("/__test/bookings")).json()[0]["status"] == "cancelled"
        assert (await http.get("/global/lessons/my")).json()["upcoming"] == []
    run(monkeypatch, scenario)


def test_socket_delivery_failure_is_retryable_and_never_reports_code_sent(monkeypatch):
    async def scenario(http, ids, capture):
        capture.reject_next = True
        response = await http.post("/global/auth/email/request", json={"studio_id": ids["code"], "email": ids["email"]})
        assert response.status_code == 503, response.text
        assert not capture.messages
        auth = await login(http, ids, capture)
        assert auth["user"]["id"] == ids["client"]
    run(monkeypatch, scenario)


def test_otp_resend_expiry_attempt_limit_and_single_use(monkeypatch):
    async def scenario(http, ids, capture):
        request = {"studio_id": ids["code"], "email": ids["email"]}
        assert (await http.post("/global/auth/email/request", json=request)).status_code == 202
        code = capture.latest_code(ids["email"])
        await http.post("/__test/otp/expire", json={"email": ids["email"]})
        assert (await http.post("/global/auth/email/verify", json={**request, "code": code})).status_code == 400
        assert (await http.post("/global/auth/email/request", json=request)).status_code == 202
        code = capture.latest_code(ids["email"])
        wrong = "000000" if code != "000000" else "111111"
        for _ in range(5):
            assert (await http.post("/global/auth/email/verify", json={**request, "code": wrong})).status_code == 400
        assert (await http.post("/global/auth/email/verify", json={**request, "code": code})).status_code == 400
        auth = await login(http, ids, capture)
        assert auth["user"]["id"] == ids["client"]
        http.headers.pop("Authorization")
        assert (await http.post("/global/auth/email/verify", json={**request, "code": capture.latest_code(ids["email"])})).status_code == 400
        async with async_session_maker() as db:
            rows = (await db.execute(select(Client).where(Client.studio_id == ids["studio"], Client.email == ids["email"]))).scalars().all()
            assert len(rows) == 1
    run(monkeypatch, scenario)


def test_group_booking_selected_mat_and_another_clients_cancel(monkeypatch):
    async def scenario(http, ids, capture):
        await login(http, ids, capture)
        response = await http.post("/global/reservations", json={"lesson_id": ids["lesson"], "spot_number": 3})
        assert response.status_code == 201, response.text
        booking = response.json()
        rows = (await http.get("/__test/bookings")).json()
        assert len(rows) == 1 and rows[0]["spot"] == 3 and rows[0]["status"] == "active"
        http.headers.pop("Authorization")
        await login(http, ids, capture, f"other-{uuid.uuid4().hex}@miniapp-fixture.net", "Other Client")
        response = await http.post(f"/global/bookings/{booking['id']}/cancel")
        assert response.status_code in {403, 404}, response.text
        assert (await http.get("/__test/bookings")).json()[0]["status"] == "active"
    run(monkeypatch, scenario)


def test_smtp_connection_probe_detects_retained_request_and_ignores_other_request(monkeypatch):
    async def scenario():
        async with fixture_app(monkeypatch) as (app, capture, state):
            ids = state["ids"] = await seed()
            acquired, release = asyncio.Event(), asyncio.Event()

            @app.post("/__test/probe/retained-email")
            async def retained_email():
                async with async_session_maker() as db:
                    await db.execute(select(Client.id).where(Client.id == ids["client"]))
                    # Match the production deadline's child-task boundary while
                    # deliberately retaining this request's checked-out session.
                    sent = await asyncio.wait_for(mailer.send_email(
                        ids["email"], "Login code · Journey Studio", "<b>654321</b>",
                        require_delivery=True), timeout=5)
                    assert sent is True
                return {"sent": True}

            @app.get("/__test/probe/hold-connection")
            async def hold_connection():
                async with async_session_maker() as db:
                    await db.execute(select(Client.id).where(Client.id == ids["client"]))
                    acquired.set()
                    await release.wait()
                return {"released": True}

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://fixture.local") as http:
                response = await http.post("/__test/probe/retained-email")
                assert response.status_code == 200, response.text
                assert capture.latest_code(ids["email"]) == "654321"
                assert capture.connections_during_otp[-1] == 1, "Probe missed its request's retained connection"
                assert capture.total_connections_during_otp[-1] == 1
                assert capture.active_db_connections == 0

                unrelated = asyncio.create_task(http.get("/__test/probe/hold-connection"))
                try:
                    await asyncio.wait_for(acquired.wait(), timeout=5)
                    response = await http.post("/global/auth/email/request", json={
                        "studio_id": ids["code"], "email": ids["email"],
                    })
                    assert response.status_code == 202, response.text
                    assert len(capture.messages) == 2 and capture.latest_code(ids["email"])
                    assert capture.connections_during_otp[-1] == 0, "OTP kept its own connection during SMTP"
                    assert capture.total_connections_during_otp[-1] == 1, "Unrelated request was not held during SMTP"
                    assert capture.active_db_connections == 1
                finally:
                    release.set()
                    await asyncio.wait_for(unrelated, timeout=5)
                assert capture.active_db_connections == 0
                assert not capture.active_db_by_request
    asyncio.run(scenario())


@pytest.mark.skipif(os.getenv("MINIAPP_BROWSER_SERVER") != "1", reason="browser fixture server only")
def test_browser_server(monkeypatch):
    async def serve():
        async with fixture_app(monkeypatch) as (app, _, _):
            server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1",
                port=int(os.getenv("MINIAPP_E2E_API_PORT", "8017")), log_level="warning"))
            app.state.fixture_server = server
            await server.serve()
    asyncio.run(serve())
