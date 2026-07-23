"""Обязательный service_id, денормализация name/color из Услуги (эпик V4-6, задача 4).
Образец фейковой сессии — tests/test_loyalty_points.py.

Запуск из back/:  python -m tests.test_lesson_service_required
"""
import asyncio
from datetime import datetime, timedelta

from fastapi import HTTPException
from pydantic import ValidationError

import routers.schedule.lessons as L
from dependencies import StudioContext
from schemas.schedule.lessons import LessonCreateRequest, LessonUpdateRequest


class _User:
    id = 1


class _Lesson:
    def __init__(self, start_time, status="confirmed", service_id=None):
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
        self.service_id = service_id
        self.cancel_reason = None
        self.clients_notified = False


class _Service:
    def __init__(self, id=1, studio_id=1, name="Пилатес", color="#F9A08B"):
        self.id = id
        self.studio_id = studio_id
        self.name = name
        self.color = color


class _Teacher:
    def __init__(self, name="Анна", last_name="Иванова"):
        self.name = name
        self.last_name = last_name


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

    async def refresh(self, obj):
        # Имитация server_default/PK, которые реальная БД проставила бы при commit.
        if getattr(obj, "id", None) is None:
            obj.id = 1
        if getattr(obj, "clients_notified", None) is None:
            obj.clients_notified = False

    async def execute(self, _q):
        return _R(self._seq.pop(0))


def _ctx(role="owner"):
    return StudioContext(user=_User(), studio_id=1, role=role)


# ─── LessonCreateRequest: service_id обязателен, name убран ─────────────────
def test_create_request_requires_service_id():
    try:
        LessonCreateRequest(teacher_id=1, start_time=datetime.now() + timedelta(hours=4))
        raise AssertionError("ожидали ValidationError без service_id")
    except ValidationError as e:
        assert any(err["loc"] == ("service_id",) for err in e.errors())


def test_create_request_has_no_name_field():
    assert "name" not in LessonCreateRequest.model_fields


# ─── create_lesson: денормализация name из услуги, 404 на чужую/несуществующую ──
def test_create_denormalizes_name_from_service():
    body = LessonCreateRequest(
        service_id=1, teacher_id=1, start_time=datetime.now() + timedelta(hours=4),
    )
    db = _DB([_Teacher(), _Service(id=1, name="Хатха-йога")])  # teacher, service
    result = asyncio.run(L.create_lesson(body, _ctx(), db))
    assert result.name == "Хатха-йога"
    assert db.committed is True


def test_create_service_not_in_studio_404():
    body = LessonCreateRequest(
        service_id=99, teacher_id=1, start_time=datetime.now() + timedelta(hours=4),
    )
    db = _DB([_Teacher(), None])  # teacher ok, service не найдена в студии
    try:
        asyncio.run(L.create_lesson(body, _ctx(), db))
        raise AssertionError("ожидали 404")
    except HTTPException as e:
        assert e.status_code == 404
        assert "Услуга" in e.detail
    assert db.committed is False


# ─── update_lesson: смена service_id пересчитывает name ─────────────────────
def test_update_service_id_recomputes_name():
    lesson = _Lesson(start_time=datetime.now() + timedelta(hours=10), service_id=1)
    db = _DB([
        lesson,                        # get_scoped_lesson
        _Service(id=2, name="Стретчинг"),  # _service_in_studio
        0,                              # финальный _booked_count
    ])
    body = LessonUpdateRequest(service_id=2)
    result = asyncio.run(L.update_lesson(1, body, _ctx(), db))
    assert lesson.name == "Стретчинг"
    assert result.name == "Стретчинг"
    assert db.committed is True


def test_update_service_not_in_studio_404():
    lesson = _Lesson(start_time=datetime.now() + timedelta(hours=10), service_id=1)
    db = _DB([lesson, None])  # get_scoped_lesson, service не найдена
    body = LessonUpdateRequest(service_id=99)
    try:
        asyncio.run(L.update_lesson(1, body, _ctx(), db))
        raise AssertionError("ожидали 404")
    except HTTPException as e:
        assert e.status_code == 404


if __name__ == "__main__":
    test_create_request_requires_service_id()
    test_create_request_has_no_name_field()
    test_create_denormalizes_name_from_service()
    test_create_service_not_in_studio_404()
    test_update_service_id_recomputes_name()
    test_update_service_not_in_studio_404()
    print("ALL PASS — обязательный service_id V4-6 задача 4 зелёные")
