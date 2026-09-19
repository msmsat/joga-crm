"""Занятие ставится только МАСТЕРУ студии.

Мастер — роль доступа «Тренер» либо владелец, которому назначены услуги
(services/members.is_specialist_clause). Администратор и владелец без услуг
расписание составляют, но в сетке журнала не стоят — раньше бэк принимал
любого участника студии, и ассистент ставил занятия на владельца.
Образец фейковой сессии — tests/test_lesson_service_required.py.

Запуск из back/:  python -m tests.test_lesson_teacher_role
"""
import asyncio
from datetime import datetime, timedelta

from fastapi import HTTPException

import routers.schedule.lessons as L
from dependencies import StudioContext
from schemas.schedule.lessons import LessonCreateRequest, LessonUpdateRequest


class _User:
    id = 1


class _Studio:
    """HB-06: `schedule_guard.lock_studio` — первый SELECT в create/update_lesson."""
    strict_schedule_enabled = False


class _Member:
    def __init__(self, role, name="Sad", last_name="Mat"):
        self.role = role
        self.name = name
        self.last_name = last_name


class _Lesson:
    def __init__(self):
        self.id = 1
        self.studio_id = 1
        self.status = "confirmed"
        self.start_time = datetime.now() + timedelta(hours=10)
        self.teacher_id = 1
        self.teacher_name = "Кирилл"
        self.name = "Хатха"
        self.hall_id = None
        self.duration_min = 60
        self.total_spots = 8
        self.service_id = 1


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

    def first(self):
        return self._v


class _DB:
    def __init__(self, seq):
        self._seq = list(seq)
        self.committed = False

    def add(self, x):
        pass

    async def commit(self):
        self.committed = True

    async def refresh(self, _x):
        pass

    async def execute(self, _q):
        return _R(self._seq.pop(0))


def _ctx():
    return StudioContext(user=_User(), studio_id=1, role="owner")


def _expect_400(coro, part):
    try:
        asyncio.run(coro)
    except HTTPException as e:
        assert e.status_code == 400, f"ожидали 400, получили {e.status_code}"
        assert part in e.detail, f"{part!r} не найдено в {e.detail!r}"
        return
    raise AssertionError("ожидали HTTPException(400), исключения не было")


def _create_body(teacher_id=2):
    return LessonCreateRequest(
        service_id=1, teacher_id=teacher_id,
        start_time=datetime.now() + timedelta(hours=4),
    )


def _row(role, specialist):
    """Строка запроса «членство + мастер ли он» — одна на обе проверки."""
    return (_Member(role=role), specialist)


def _passes_role_check(db):
    """Проверка пропустила дальше — падаем уже на услуге (её в фейке нет)."""
    try:
        asyncio.run(L.create_lesson(_create_body(), _ctx(), db))
        raise AssertionError("ожидали 404 (услуга не найдена)")
    except HTTPException as e:
        assert e.status_code == 404, f"ожидали 404, получили {e.status_code}"


def test_create_on_owner_without_services_rejected():
    db = _DB([_Studio(), _row("owner", False)])  # lock_studio, затем мастер?
    _expect_400(L.create_lesson(_create_body(), _ctx(), db), "не мастер")
    assert db.committed is False


def test_create_on_owner_with_services_passes_role_check():
    """Владелец, которому назначены услуги, — мастер: занятие ему ставится."""
    db = _DB([_Studio(), _row("owner", True), None])
    _passes_role_check(db)


def test_create_on_admin_rejected():
    db = _DB([_Studio(), _row("admin", False)])  # lock_studio, затем мастер?
    _expect_400(L.create_lesson(_create_body(), _ctx(), db), "не мастер")
    assert db.committed is False


def test_create_on_trainer_passes_role_check():
    db = _DB([_Studio(), _row("trainer", True), None])
    _passes_role_check(db)


def test_update_teacher_to_owner_without_services_rejected():
    db = _DB([_Studio(), _Lesson(), _row("owner", False)])  # lock_studio, get_scoped_lesson, проверка
    _expect_400(L.update_lesson(1, LessonUpdateRequest(teacher_id=2), _ctx(), db), "не мастер")
    assert db.committed is False


if __name__ == "__main__":
    test_create_on_owner_without_services_rejected()
    test_create_on_owner_with_services_passes_role_check()
    test_create_on_admin_rejected()
    test_create_on_trainer_passes_role_check()
    test_update_teacher_to_owner_without_services_rejected()
    print("ALL PASS — занятие только мастеру (тренер или владелец с услугами)")
