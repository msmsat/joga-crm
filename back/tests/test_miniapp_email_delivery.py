"""A login-code request must finish and report whether delivery happened.

The database session, SMTP boundary and expensive password hash are replaced;
the real handler, schemas, message builder and delivery configuration remain.
"""
import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from starlette.requests import Request

import routers.booking.miniapp_email_auth as auth
from models import Client, ClientEmailOtp, Studio
from ratelimit import limiter
from services import mailer


class MemorySession:
    """Record SQLAlchemy's acquire-on-query/release-on-commit lifecycle."""

    def __init__(self):
        self.held = False
        self.added = []
        self.studio = Studio(id=71, name="Delivery test studio", language="en")

    async def execute(self, statement):
        self.held = True
        entity = statement.column_descriptions[0]["entity"]
        if entity is Studio:
            return SimpleNamespace(scalar_one_or_none=lambda: self.studio)
        if entity is ClientEmailOtp:
            return SimpleNamespace(scalar_one_or_none=lambda: None)
        assert entity is Client
        return SimpleNamespace(scalars=lambda: SimpleNamespace(first=lambda: None))

    def add(self, row):
        self.added.append(row)

    async def commit(self):
        self.held = False


@pytest.fixture
def request_code(monkeypatch):
    monkeypatch.setattr(limiter, "enabled", False)
    monkeypatch.setattr(auth, "get_password_hash", lambda _code: "unit-test-hash")

    async def studio_id(_db, _ref):
        return 71

    monkeypatch.setattr(auth, "require_studio_id", studio_id)
    db = MemorySession()
    request = Request({
        "type": "http", "method": "POST", "path": "/auth/email/request",
        "headers": [], "query_string": b"", "client": ("127.0.0.1", 0),
    })

    async def invoke():
        return await auth.request_email_code(
            request=request,
            body=auth.EmailCodeRequest(studio_id="test-studio", email="client@velora-test.com"),
            db=db,
        )

    return db, invoke


def test_success_commits_code_and_releases_database_before_smtp(request_code, monkeypatch):
    db, invoke = request_code

    async def deliver(_to, _subject, _html, **_kwargs):
        assert len(db.added) == 1
        assert db.added[0].code_hash
        assert not db.held, "SMTP must not occupy a database connection"
        return True

    monkeypatch.setattr(auth, "send_email", deliver)
    response = asyncio.run(invoke())
    assert response.is_new is True
    assert response.expires_in == 600


def test_false_delivery_result_does_not_claim_code_was_sent(request_code, monkeypatch):
    _db, invoke = request_code

    async def declined(*_args, **_kwargs):
        return False

    monkeypatch.setattr(auth, "send_email", declined)
    with pytest.raises(HTTPException) as failure:
        asyncio.run(invoke())
    assert failure.value.status_code == 503


def test_provider_error_returns_retryable_response_without_private_details(
    request_code, monkeypatch, caplog,
):
    _db, invoke = request_code

    async def unavailable(*_args, **_kwargs):
        raise RuntimeError("private provider details")

    monkeypatch.setattr(auth, "send_email", unavailable)
    with pytest.raises(HTTPException) as failure:
        asyncio.run(invoke())
    assert failure.value.status_code == 503
    assert "private provider details" not in failure.value.detail
    assert "private provider details" not in caplog.text


def test_smtp_has_total_deadline_and_cancels_stalled_delivery(request_code, monkeypatch):
    _db, invoke = request_code
    cancelled = []

    async def stalled(*_args, **_kwargs):
        try:
            await asyncio.Event().wait()
        finally:
            cancelled.append(True)

    monkeypatch.setattr(auth, "send_email", stalled)
    monkeypatch.setattr(auth, "EMAIL_SEND_TIMEOUT", 0.01, raising=False)

    async def bounded_request():
        with pytest.raises(HTTPException) as failure:
            # The outer limit detects a handler that never applies its deadline.
            await asyncio.wait_for(invoke(), timeout=1)
        assert failure.value.status_code == 503

    asyncio.run(bounded_request())
    assert cancelled == [True]


def test_unconfigured_smtp_does_not_fake_login_delivery_or_print_code(
    request_code, monkeypatch, capsys,
):
    _db, invoke = request_code
    for key in ("SMTP_HOST", "SMTP_USER", "SMTP_PASS"):
        monkeypatch.setenv(key, "")
    monkeypatch.setattr(auth, "send_email", mailer.send_email)
    with pytest.raises(HTTPException) as failure:
        asyncio.run(invoke())
    assert failure.value.status_code == 503
    assert capsys.readouterr().out == ""


def test_other_mail_keeps_development_preview(monkeypatch, capsys):
    for key in ("SMTP_HOST", "SMTP_USER", "SMTP_PASS"):
        monkeypatch.setenv(key, "")
    assert asyncio.run(mailer.send_email("client@velora-test.com", "Preview", "<p>preview</p>")) is True
    assert "[MAILER dev]" in capsys.readouterr().out


@pytest.mark.parametrize("stall_at", ["DATA", "QUIT"])
def test_required_delivery_deadline_closes_socket_without_waiting_for_quit(
    monkeypatch, stall_at,
):
    """Use real SMTP: aiosmtplib's context manager waits for QUIT on cancellation."""
    from aiosmtplib.smtp import SMTP

    async def scenario():
        commands = []
        writers = []
        disconnected = asyncio.Event()

        async def accept(reader, writer):
            writers.append(writer)
            writer.write(b"220 loopback ESMTP ready\r\n")
            await writer.drain()
            try:
                while line := await reader.readline():
                    command = line.split(b" ", 1)[0].strip().decode().upper()
                    commands.append(command)
                    if command == "EHLO":
                        writer.write(b"250-loopback\r\n250 8BITMIME\r\n")
                    elif command == "DATA":
                        if stall_at == "DATA":
                            continue
                        writer.write(b"354 end with dot\r\n")
                        await writer.drain()
                        while (part := await reader.readline()) not in {b".\r\n", b""}:
                            pass
                        writer.write(b"250 received\r\n")
                    elif command == "QUIT":
                        continue  # Even cleanup must not add a second SMTP timeout.
                    else:
                        writer.write(b"250 OK\r\n")
                    await writer.drain()
            finally:
                writer.close()
                await writer.wait_closed()
                disconnected.set()

        server = await asyncio.start_server(accept, "127.0.0.1", 0)
        port = server.sockets[0].getsockname()[1]
        for key, value in {"SMTP_HOST": "127.0.0.1", "SMTP_PORT": str(port),
                           "SMTP_USER": "fixture", "SMTP_PASS": "fixture"}.items():
            monkeypatch.setenv(key, value)

        def local_client(**kwargs):
            assert kwargs["hostname"] == "127.0.0.1" and kwargs["port"] == port
            return SMTP(hostname="127.0.0.1", port=port, start_tls=False, timeout=1)

        # Also exercise the old send API when checking the pre-fix failure.
        async def local_send(message, **kwargs):
            async with local_client(**kwargs) as client:
                return await client.send_message(message)

        monkeypatch.setattr(mailer.aiosmtplib, "SMTP", local_client)
        monkeypatch.setattr(mailer.aiosmtplib, "send", local_send)
        try:
            started = asyncio.get_running_loop().time()
            delivery = mailer.send_email(
                "client@velora-test.com", "Deadline", "<p>code</p>",
                require_delivery=True,
            )
            if stall_at == "DATA":
                with pytest.raises(TimeoutError):
                    await asyncio.wait_for(delivery, timeout=0.1)
            else:
                # DATA was accepted. A stalled QUIT must not report failed mail.
                assert await asyncio.wait_for(delivery, timeout=0.5) is True
            elapsed = asyncio.get_running_loop().time() - started
            assert elapsed < 0.5, f"Cancellation waited for SMTP cleanup: {elapsed:.3f}s"
            await asyncio.wait_for(disconnected.wait(), timeout=0.5)
            assert "DATA" in commands and "QUIT" not in commands
        finally:
            for writer in writers:
                writer.close()
            server.close()
            await server.wait_closed()

    asyncio.run(scenario())
