"""set_day_override — отметка «работает / выходной» на конкретную дату.

Три ветки: создать отметку, перекрасить существующую, снять (is_working=null).
Запуск из back/:  python -m tests.test_staff_day_override
"""
import asyncio
from datetime import date
from types import SimpleNamespace

import pytest

import routers.staff.schedule as S
from models import StaffDayOverride
from schemas import StaffDayOverrideRequest


class _R:
    def __init__(self, v):
        self._v = v

    def scalar_one_or_none(self):
        return self._v


class _DB:
    """Отдаёт заготовленные ответы по порядку: членство в студии, потом отметку."""

    def __init__(self, *results):
        self._results = list(results)
        self.added, self.deleted, self.commits = [], [], 0

    async def execute(self, _q):
        return _R(self._results.pop(0))

    def add(self, obj):
        self.added.append(obj)

    async def delete(self, obj):
        self.deleted.append(obj)

    async def commit(self):
        self.commits += 1


CTX = SimpleNamespace(user=None, studio_id=1, role="owner")
MEMBER = object()


def _call(db, is_working, day="2026-08-14"):
    return asyncio.run(S.set_day_override(
        7, StaffDayOverrideRequest(date=day, is_working=is_working), ctx=CTX, db=db,
    ))


def test_creates_override():
    db = _DB(MEMBER, None)
    res = _call(db, False)
    assert len(db.added) == 1 and db.added[0].is_working is False
    assert db.added[0].day == date(2026, 8, 14)
    assert db.commits == 1 and res == {"date": "2026-08-14", "is_working": False}


def test_updates_existing_override():
    existing = StaffDayOverride(user_id=7, studio_id=1, day=date(2026, 8, 14), is_working=False)
    db = _DB(MEMBER, existing)
    _call(db, True)
    assert existing.is_working is True
    assert not db.added and not db.deleted and db.commits == 1


def test_null_clears_override():
    existing = StaffDayOverride(user_id=7, studio_id=1, day=date(2026, 8, 14), is_working=True)
    db = _DB(MEMBER, existing)
    _call(db, None)
    assert db.deleted == [existing] and not db.added and db.commits == 1


def test_bad_date_rejected():
    db = _DB(MEMBER)
    with pytest.raises(Exception) as e:
        _call(db, True, day="14.08.2026")
    assert getattr(e.value, "status_code", None) == 422


if __name__ == "__main__":
    test_creates_override()
    test_updates_existing_override()
    test_null_clears_override()
    test_bad_date_rejected()
    print("ok")
