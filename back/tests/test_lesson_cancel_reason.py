"""Причина отмены и флаг clients_notified у занятия (эпик V4-6, задача 2).
Образец фейковой сессии — tests/test_loyalty_points.py.

Запуск из back/:  python -m tests.test_lesson_cancel_reason
"""
import asyncio
from datetime import datetime, timedelta

from fastapi import HTTPException

import routers.schedule.lessons as L
from dependencies import StudioContext
from schemas.schedule.lessons import LessonCancelRequest, LessonUpdateRequest


class _User:
    id = 1


class _Lesson:
    def __init__(self, start_time, status="confirmed"):
        self.id = 1
        self.studio_id = 1
        self.status = status
        self.start_time = start_time
        self.teacher_id = 1
        self.teacher_name = "Анна Иванова"
        self.name = "Йога"
        self.hall_id = None
        self.duration_min = 60
        self.price = 0
        self.level = ""
        self.equipment = ""
        self.total_spots = 8
        self.service_id = None
        self.cancel_reason = None
        self.clients_notified = False


class _R:
    def __init__(self, v):
        self._v = v

    def scalar_one_or_none(self):
        return self._v

    def scalars(self):
        return self

    def all(self):
        return self._v if isinstance(self._v, list) else [self._v]

    def scalar(self):
        return self._v


class _DB:
    def __init__(self, seq):
        self._seq = list(seq)
        self.added = []
        self.committed = False

    def add(self, x):
        self.added.append(x)

    async def flush(self):
        pass

    async def commit(self):
        self.committed = True

    async def refresh(self, _x):
        pass

    async def execute(self, _q):
        return _R(self._seq.pop(0))


def _ctx(role="owner"):
    return StudioContext(user=_User(), studio_id=1, role=role)


# ─── cancel_lesson сохраняет причину ─────────────────────────────────────────
def test_cancel_with_reason_persists_it():
    lesson = _Lesson(start_time=datetime.now() + timedelta(hours=5))
    db = _DB([lesson, [], None])  # get_scoped_lesson, client_id-ы, UPDATE Reservation
    body = LessonCancelRequest(reason="Клиент заболел")
    result = asyncio.run(L.cancel_lesson(1, body=body, ctx=_ctx(), db=db))
    assert lesson.cancel_reason == "Клиент заболел"
    assert result.cancel_reason == "Клиент заболел"
    assert db.committed is True


def test_cancel_without_reason_defaults_to_none():
    """Тело запроса по умолчанию пустое {} — reason остаётся None, ничего не падает."""
    lesson = _Lesson(start_time=datetime.now() + timedelta(hours=5))
    db = _DB([lesson, [], None])
    result = asyncio.run(L.cancel_lesson(1, ctx=_ctx(), db=db))
    assert lesson.cancel_reason is None
    assert db.committed is True


# ─── update_lesson: PATCH только cancel_reason обходит правило времени ──────
def test_update_cancel_reason_only_bypasses_time_rule():
    """Занятие уже в прошлом/отменено — обычный PATCH был бы заблокирован (задача 1),
    но правка только cancel_reason разрешена явно (задача 1, п.4 + задача 2, п.3)."""
    lesson = _Lesson(start_time=datetime.now() - timedelta(hours=5), status="cancelled")
    db = _DB([lesson, 0])  # get_scoped_lesson, затем _booked_count
    body = LessonUpdateRequest(cancel_reason="Причина уточнена постфактум")
    result = asyncio.run(L.update_lesson(1, body, _ctx(), db))
    assert lesson.cancel_reason == "Причина уточнена постфактум"
    assert result.cancel_reason == "Причина уточнена постфактум"
    assert db.committed is True


def test_update_cancel_reason_plus_other_field_still_blocked_when_soon():
    """Если среди присланных полей есть что-то, кроме cancel_reason, — правило
    времени применяется как обычно (guard не должен пропускать лишнее)."""
    lesson = _Lesson(start_time=datetime.now() + timedelta(minutes=30))
    db = _DB([lesson])
    body = LessonUpdateRequest(cancel_reason="x", price=100)
    try:
        asyncio.run(L.update_lesson(1, body, _ctx(), db))
        raise AssertionError("ожидали HTTPException(400)")
    except HTTPException as e:
        assert e.status_code == 400
        assert "2 часа" in e.detail


# ─── LessonRead несёт новые поля из list/get (через _LESSON_FIELDS) ─────────
def test_lesson_read_includes_new_fields():
    lesson = _Lesson(start_time=datetime.now() + timedelta(hours=10))
    lesson.cancel_reason = "уже была причина"
    lesson.clients_notified = True
    read = L._lesson_read(lesson, 0)
    assert read.cancel_reason == "уже была причина"
    assert read.clients_notified is True


if __name__ == "__main__":
    test_cancel_with_reason_persists_it()
    test_cancel_without_reason_defaults_to_none()
    test_update_cancel_reason_only_bypasses_time_rule()
    test_update_cancel_reason_plus_other_field_still_blocked_when_soon()
    test_lesson_read_includes_new_fields()
    print("ALL PASS — cancel_reason/clients_notified V4-6 задача 2 зелёные")
