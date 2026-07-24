"""EPIC N-8 задача 1-2: bulk-upsert матрицы уведомлений — один INSERT ... ON CONFLICT
на всю пачку тумблеров (вместо N отдельных PATCH), + Literal-валидация role/channel_key.
Реальная БД, ручная чистка. Запуск из back/:  python -m tests.test_notification_event_toggles
"""
import asyncio
import warnings

warnings.filterwarnings("ignore")

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import delete, select

from database import async_session_maker
from dependencies import require_role, StudioContext
from models import NotificationEventToggle, Studio
from routers.settings.notifications import bulk_upsert_event_toggles, get_event_toggles
from schemas.settings.notifications import EventToggle, EventToggleBulkUpdate


async def _seed() -> int:
    async with async_session_maker() as db:
        s = Studio(name="TEST-NOTIF-TOGGLES-BULK")
        db.add(s)
        await db.commit()
        return s.id


async def _cleanup(sid: int) -> None:
    async with async_session_maker() as db:
        await db.execute(delete(NotificationEventToggle).where(NotificationEventToggle.studio_id == sid))
        await db.execute(delete(Studio).where(Studio.id == sid))
        await db.commit()


async def _run():
    sid = await _seed()
    try:
        owner = StudioContext(user=None, studio_id=sid, role="owner")
        body = EventToggleBulkUpdate(toggles=[
            EventToggle(role="client", event_id="c1", channel_key="telegram", is_enabled=True),
            EventToggle(role="owner", event_id="o2", channel_key="email", is_enabled=True),
        ])

        # Первый вызов — INSERT: обе строки новые. Проверяем сами возвращённые
        # RETURNING-объекты (не только последующий GET) — это то, что FastAPI
        # сериализует через response_model=list[EventToggle].
        async with async_session_maker() as db:
            result = await bulk_upsert_event_toggles(body=body, ctx=owner, db=db)
        assert len(result) == 2, result
        by_key = {(r.role, r.event_id, r.channel_key): r.is_enabled for r in result}
        assert by_key[("client", "c1", "telegram")] is True, by_key
        assert by_key[("owner", "o2", "email")] is True, by_key
        assert all(r.studio_id == sid for r in result), result

        # Второй вызов с тем же ключом (role, event_id, channel_key) и другим
        # значением — UPDATE через ON CONFLICT, не дубль строки.
        body2 = EventToggleBulkUpdate(toggles=[
            EventToggle(role="client", event_id="c1", channel_key="telegram", is_enabled=False),
        ])
        async with async_session_maker() as db:
            await bulk_upsert_event_toggles(body=body2, ctx=owner, db=db)

        async with async_session_maker() as db:
            rows = await get_event_toggles(ctx=owner, db=db)
        c1 = [r for r in rows if r.event_id == "c1" and r.channel_key == "telegram"]
        assert len(c1) == 1, c1  # без дублей
        assert c1[0].is_enabled is False, c1[0].is_enabled  # второй вызов победил

        async with async_session_maker() as db:
            count = (await db.execute(
                select(NotificationEventToggle).where(NotificationEventToggle.studio_id == sid)
            )).scalars().all()
        assert len(count) == 2, count  # два уникальных ключа, не три

        print("OK: test_bulk_upsert_inserts_then_updates")
    finally:
        await _cleanup(sid)


def test_bulk_upsert_inserts_then_updates():
    asyncio.run(_run())


# ─── Literal-валидация: мусорная роль/канал отклоняется до похода в БД ───────
def test_bulk_rejects_unknown_role():
    try:
        EventToggle(role="hacker", event_id="c1", channel_key="telegram", is_enabled=True)
        raise AssertionError("ожидали ValidationError")
    except ValidationError:
        pass


def test_bulk_rejects_malformed_event_id():
    try:
        EventToggle(role="client", event_id="hack", channel_key="telegram", is_enabled=True)
        raise AssertionError("ожидали ValidationError")
    except ValidationError:
        pass


def test_bulk_rejects_unknown_channel():
    try:
        EventToggle(role="client", event_id="c1", channel_key="discord", is_enabled=True)
        raise AssertionError("ожидали ValidationError")
    except ValidationError:
        pass


# ─── Ролевой гейт: только owner (require_role — прямой вызов, без HTTP-слоя,
# образец — test_no_subscription_403 в test_booking_access.py) ───────────────
def test_bulk_requires_owner():
    guard = require_role("owner")
    admin_ctx = StudioContext(user=None, studio_id=1, role="admin")
    try:
        asyncio.run(guard(ctx=admin_ctx))
        raise AssertionError("ожидали 403")
    except HTTPException as e:
        assert e.status_code == 403


if __name__ == "__main__":
    test_bulk_upsert_inserts_then_updates()
    test_bulk_rejects_unknown_role()
    test_bulk_rejects_malformed_event_id()
    test_bulk_rejects_unknown_channel()
    test_bulk_requires_owner()
    print("ALL PASS")
