"""Пороги категорий настраиваются студией: PATCH меняет счётчики табов.
Реальная БД, откат.

Запуск из back/:  python -m pytest tests/test_segment_rules_api.py
"""
import asyncio
import warnings
from datetime import datetime, timedelta

warnings.filterwarnings("ignore")

import pytest
from sqlalchemy import delete

from database import async_session_maker
from dependencies import StudioContext
from models import Client, Studio, User
from routers.clients.profiles import (
    get_categories,
    get_client_segment_rules,
    update_client_segment_rules,
)
from schemas import SegmentRulesUpdate


def _ctx(studio_id, role="owner"):
    user = User(email="owner@test.local", hashed_password="x", name="Owner", last_name="Test")
    return StudioContext(user=user, studio_id=studio_id, role=role)


def _count(rows, key):
    return next(r.count for r in rows if r.key == key)


STUDIO_NAME = "TEST-SEGMENT-RULES"


async def _cleanup(db):
    """update_client_segment_rules коммитит, поэтому rollback данные не уберёт —
    сносим тестовую студию явно.

    Именно bulk-DELETE, а не db.delete(obj): ORM-каскад пытался бы занулить
    clients.studio_id (NOT NULL), тогда как на уровне БД стоит ON DELETE CASCADE.
    """
    await db.execute(delete(Studio).where(Studio.name == STUDIO_NAME))
    await db.commit()


async def _run():
    async with async_session_maker() as db:
        await _cleanup(db)  # хвосты от упавшего прошлого прогона

    async with async_session_maker() as db:
        try:
            await _body(db)
        finally:
            await _cleanup(db)


async def _body(db):
    s = Studio(name=STUDIO_NAME)
    db.add(s); await db.flush()
    sid = s.id
    user = User(name="U")
    now = datetime.now()

    # Три клиента возрастом 3 / 10 / 40 дней, без визитов и оплат.
    for days in (3, 10, 40):
        db.add(Client(studio_id=sid, name=f"C{days}", is_active=True, status="new",
                      registration_date=now - timedelta(days=days)))
    await db.flush()

    # ─── Дефолт: новыми считаются те, кому ≤15 дней → двое ──
    rules = await get_client_segment_rules(_ctx(sid), user, db)
    assert rules.new_client_days == 15, rules
    rows = await get_categories(_ctx(sid), user, db)
    assert _count(rows, "new") == 2, f"дефолт: {_count(rows, 'new')}"
    assert _count(rows, "inactive") == 1
    assert _count(rows, "all") == 3

    # ─── Сузили окно до 7 дней → новым остаётся только трёхдневный ──
    saved = await update_client_segment_rules(
        SegmentRulesUpdate(new_client_days=7, active_within_days=60,
                           vip_min_spent=50000, vip_min_visits=30),
        _ctx(sid), user, db,
    )
    assert saved.new_client_days == 7

    rows = await get_categories(_ctx(sid), user, db)
    assert _count(rows, "new") == 1, f"после сужения: {_count(rows, 'new')}"
    assert _count(rows, "inactive") == 2
    assert _count(rows, "all") == 3, "общее число клиентов меняться не должно"

    # ─── Повторный PATCH правит ту же строку, а не плодит новые ──
    await update_client_segment_rules(
        SegmentRulesUpdate(new_client_days=45, active_within_days=60,
                           vip_min_spent=50000, vip_min_visits=30),
        _ctx(sid), user, db,
    )
    again = await get_client_segment_rules(_ctx(sid), user, db)
    assert again.new_client_days == 45, "второй PATCH должен править ту же строку"
    rows = await get_categories(_ctx(sid), user, db)
    assert _count(rows, "new") == 3, "окно расширили — новыми стали все трое"
    assert _count(rows, "inactive") == 0


def test_segment_rules_api():
    asyncio.run(_run())


def test_rules_are_validated():
    """Границы схемы: 0 дней и отрицательные значения не должны проходить."""
    for bad in ({"new_client_days": 0}, {"active_within_days": 400}, {"vip_min_visits": 0}):
        payload = {"new_client_days": 15, "active_within_days": 60,
                   "vip_min_spent": 50000, "vip_min_visits": 30, **bad}
        with pytest.raises(Exception):
            SegmentRulesUpdate(**payload)


if __name__ == "__main__":
    test_segment_rules_api()
    test_rules_are_validated()
    print("ALL PASS")
