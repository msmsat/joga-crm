"""PATCH /clients/{id}/freeze — гейт allow_freeze (Каталог → Абонементы).
Реальная БД, откат.

Запуск из back/:  python -m tests.test_client_freeze_gate
"""
import asyncio
import warnings

warnings.filterwarnings("ignore")

from fastapi import HTTPException

from database import async_session_maker
from dependencies import StudioContext
from models import Client, Studio, StudioSubscriptionProgramConfig, User
from routers.clients.profiles import freeze_client
from schemas import ClientFreezeUpdate


def _ctx(studio_id, role="owner"):
    user = User(email="owner@test.local", hashed_password="x", name="Owner", last_name="Test")
    return StudioContext(user=user, studio_id=studio_id, role=role)


async def _setup(db, *, allow_freeze=None):
    s = Studio(name="TEST-CLIENT-FREEZE")
    db.add(s); await db.flush()
    sid = s.id

    if allow_freeze is not None:
        db.add(StudioSubscriptionProgramConfig(studio_id=sid, is_enabled=True, allow_freeze=allow_freeze))

    client = Client(studio_id=sid, name="Alice", is_active=True, status="active")
    db.add(client); await db.flush()

    return sid, client


async def _run():
    # ─── allow_freeze выключен → 400 loyalty.freeze_disabled, клиент не тронут ──
    async with async_session_maker() as db:
        sid, client = await _setup(db, allow_freeze=False)

        try:
            await freeze_client(client.id, ClientFreezeUpdate(frozen=True), _ctx(sid), User(name="U"), db)
            raise AssertionError("ожидали 400")
        except HTTPException as e:
            assert e.status_code == 400
            assert e.detail["code"] == "loyalty.freeze_disabled"

        await db.refresh(client)
        assert client.status == "active"
        assert client.is_active is True

        await db.rollback()

    # ─── allow_freeze включен → заморозка проходит ──
    async with async_session_maker() as db:
        sid, client = await _setup(db, allow_freeze=True)

        result = await freeze_client(client.id, ClientFreezeUpdate(frozen=True), _ctx(sid), User(name="U"), db)
        assert result.frozen is True

        await db.refresh(client)
        assert client.status == "frozen"
        assert client.is_active is False

        await db.rollback()

    # ─── Конфига нет вообще (владелец не трогал настройки) → дефолт «разрешено» ──
    async with async_session_maker() as db:
        sid, client = await _setup(db, allow_freeze=None)

        result = await freeze_client(client.id, ClientFreezeUpdate(frozen=True), _ctx(sid), User(name="U"), db)
        assert result.frozen is True

        await db.rollback()

    # ─── Разморозка не блокируется, даже если allow_freeze выключен ──
    async with async_session_maker() as db:
        sid, client = await _setup(db, allow_freeze=False)
        client.status = "frozen"
        client.is_active = False
        await db.flush()

        result = await freeze_client(client.id, ClientFreezeUpdate(frozen=False), _ctx(sid), User(name="U"), db)
        assert result.frozen is False

        await db.refresh(client)
        assert client.status == "active"

        await db.rollback()


def test_client_freeze_gate():
    asyncio.run(_run())


if __name__ == "__main__":
    test_client_freeze_gate()
    print("ALL PASS — client freeze gate (allow_freeze)")
