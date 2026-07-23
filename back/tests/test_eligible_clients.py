"""GET /schedule/lessons/{id}/eligible-clients (CL-6, задача 6.4).
Образец фейковой сессии — tests/test_booking_access.py, tests/test_lesson_service_required.py.

Запуск из back/:  python -m tests.test_eligible_clients
"""
import asyncio
from datetime import date, timedelta

from fastapi import HTTPException

import routers.schedule.lessons as L
from dependencies import StudioContext


class _User:
    id = 1


class _Lesson:
    def __init__(self, service_id=1, teacher_id=1, studio_id=1):
        self.id = 1
        self.studio_id = studio_id
        self.service_id = service_id
        self.teacher_id = teacher_id


class _Client:
    def __init__(self, id, name="Анна", last_name="Иванова", phone="+70000000000",
                 avatar_color="#F9A08B"):
        self.id = id
        self.name = name
        self.last_name = last_name
        self.phone = phone
        self.avatar_color = avatar_color


class _Sub:
    def __init__(self, id, package_id=None, used=0, total=10):
        self.id = id
        self.package_id = package_id
        self.status = "active"
        self.is_frozen = False
        self.used_classes = used
        self.total_classes = total
        self.expires_at = date.today() + timedelta(days=30)


class _Package:
    def __init__(self, id, service_ids=None):
        self.id = id
        self.service_ids = service_ids


class _R:
    def __init__(self, v):
        self._v = v

    def scalar_one_or_none(self):
        return self._v

    def scalars(self):
        return self

    def all(self):
        return self._v if isinstance(self._v, list) else [self._v]


class _DB:
    def __init__(self, seq):
        self._seq = list(seq)

    async def execute(self, _q):
        return _R(self._seq.pop(0))


def _ctx(role="owner"):
    return StudioContext(user=_User(), studio_id=1, role=role)


def _run(db, ctx=None):
    return asyncio.run(L.get_eligible_clients(1, ctx or _ctx(), db))


# ─── Тренер на чужом занятии → 403 (через get_scoped_lesson) ────────────────
def test_trainer_foreign_lesson_403():
    lesson = _Lesson(teacher_id=99)
    db = _DB([lesson])
    try:
        _run(db, _ctx(role="trainer"))
        raise AssertionError("ожидали 403")
    except HTTPException as e:
        assert e.status_code == 403


# ─── Чужая студия → 404 ──────────────────────────────────────────────────────
def test_foreign_studio_404():
    db = _DB([None])  # get_scoped_lesson не находит занятие в студии
    try:
        _run(db)
        raise AssertionError("ожидали 404")
    except HTTPException as e:
        assert e.status_code == 404


# ─── Смешанный список: подходит только клиент с нужным типом абонемента ─────
def test_filters_by_eligibility():
    lesson = _Lesson(service_id=1)
    client_ok = _Client(id=1)      # универсальный абонемент → подходит
    client_bad = _Client(id=2)     # абонемент на другой service_id → не подходит
    client_none = _Client(id=3)    # абонемента нет вовсе → не подходит

    db = _DB([
        lesson,                     # get_scoped_lesson
        [],                         # already_booked
        [client_ok, client_bad, client_none],  # clients
        # can_book(client_ok): find_eligible_subscription
        [_Sub(id=1, package_id=None)],
        # can_book(client_bad): find_eligible_subscription (subs + packages)
        [_Sub(id=2, package_id=10)],
        [_Package(id=10, service_ids=[2])],
        # can_book(client_none): find_eligible_subscription
        [],
    ])
    result = _run(db)
    assert [c.id for c in result] == [1]


# ─── Уже записанные (не cancelled) исключаются из выдачи ────────────────────
def test_excludes_already_booked():
    lesson = _Lesson(service_id=1)
    client_ok = _Client(id=1)

    db = _DB([
        lesson,
        [1],              # client_id=1 уже забронирован
        [],                # clients: notin_([1]) не даёт client_ok — фейковая БД просто пуста
    ])
    result = _run(db)
    assert result == []


if __name__ == "__main__":
    test_trainer_foreign_lesson_403()
    test_foreign_studio_404()
    test_filters_by_eligibility()
    test_excludes_already_booked()
    print("ALL PASS — eligible-clients CL-6.4 зелёные")
