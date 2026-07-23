"""Правила времени жизненного цикла занятия (эпик V4-6, задача 1): создание не
позднее чем за 3 часа, изменение/отмена — не позднее чем за 2 часа до начала.
Образец фейковой сессии — tests/test_loyalty_points.py.

Запуск из back/:  python -m tests.test_lesson_time_rules
"""
import asyncio
from datetime import datetime, timedelta

from fastapi import HTTPException

import routers.schedule.lessons as L
from dependencies import StudioContext
from schemas.schedule.lessons import LessonCreateRequest, LessonUpdateRequest


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
    """execute() отдаёт значения из seq по порядку вызовов (паттерн test_loyalty_points)."""
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


def _expect_400(coro, message_part):
    try:
        asyncio.run(coro)
    except HTTPException as e:
        assert e.status_code == 400, f"ожидали 400, получили {e.status_code}"
        assert message_part in e.detail, f"{message_part!r} не найдено в {e.detail!r}"
        return
    raise AssertionError("ожидали HTTPException(400), исключения не было")


# ─── 1. Создание раньше чем за 3 часа ────────────────────────────────────────
def test_create_less_than_3h_rejected():
    body = LessonCreateRequest(
        service_id=1, teacher_id=1, start_time=datetime.now() + timedelta(hours=2, minutes=59),
    )
    db = _DB([])  # не должен дойти до единого execute
    _expect_400(L.create_lesson(body, _ctx(), db), "3 часа")
    assert db.committed is False


def test_create_more_than_3h_ok_passes_time_check():
    """За 3 часа с запасом — правило времени не блокирует (падает дальше на поиске
    тренера, которого в фейковой БД нет, но это уже не про время)."""
    body = LessonCreateRequest(
        service_id=1, teacher_id=1, start_time=datetime.now() + timedelta(hours=4),
    )
    db = _DB([None])  # _teacher_name_in_studio: тренер не найден → 404, не 400
    try:
        asyncio.run(L.create_lesson(body, _ctx(), db))
        raise AssertionError("ожидали 404 (тренер не найден)")
    except HTTPException as e:
        assert e.status_code == 404


# ─── 2. Изменение занятия, начинающегося раньше чем через 2 часа ────────────
def test_update_lesson_starting_soon_rejected():
    lesson = _Lesson(start_time=datetime.now() + timedelta(minutes=90))
    db = _DB([lesson])  # get_scoped_lesson
    body = LessonUpdateRequest(price=100)
    _expect_400(L.update_lesson(1, body, _ctx(), db), "2 часа")
    assert db.committed is False


def test_update_new_start_time_within_2h_rejected():
    """Занятие ещё далеко, но новое время переноса попадает в окно <2ч."""
    lesson = _Lesson(start_time=datetime.now() + timedelta(hours=10))
    db = _DB([lesson])
    body = LessonUpdateRequest(start_time=datetime.now() + timedelta(minutes=30))
    _expect_400(L.update_lesson(1, body, _ctx(), db), "2 часа")


def test_update_far_lesson_ok_passes_time_check():
    lesson = _Lesson(start_time=datetime.now() + timedelta(hours=10))
    db = _DB([lesson, 0])  # get_scoped_lesson, затем _booked_count после правок
    body = LessonUpdateRequest(price=500)
    result = asyncio.run(L.update_lesson(1, body, _ctx(), db))
    assert result.price == 500
    assert db.committed is True


# Кейс «PATCH только cancel_reason пропускает правило времени» (задача 1, п.4)
# тестируется в задаче 2, когда поле cancel_reason появится в LessonUpdateRequest —
# сам guard `set(fields.keys()) != {"cancel_reason"}` уже в коде update_lesson.


# ─── 3. Отмена занятия, начинающегося раньше чем через 2 часа ───────────────
def test_cancel_lesson_starting_soon_rejected():
    lesson = _Lesson(start_time=datetime.now() + timedelta(minutes=119))
    db = _DB([lesson])  # get_scoped_lesson
    _expect_400(L.cancel_lesson(1, ctx=_ctx(), db=db), "2 часа")
    assert db.committed is False


def test_cancel_far_lesson_ok_passes_time_check():
    lesson = _Lesson(start_time=datetime.now() + timedelta(hours=5))
    # get_scoped_lesson, select client_id (уведомления), UPDATE Reservation (каскад)
    db = _DB([lesson, [], None])
    result = asyncio.run(L.cancel_lesson(1, ctx=_ctx(), db=db))
    assert lesson.status == "cancelled"
    assert db.committed is True


if __name__ == "__main__":
    test_create_less_than_3h_rejected()
    test_create_more_than_3h_ok_passes_time_check()
    test_update_lesson_starting_soon_rejected()
    test_update_new_start_time_within_2h_rejected()
    test_update_far_lesson_ok_passes_time_check()
    test_cancel_lesson_starting_soon_rejected()
    test_cancel_far_lesson_ok_passes_time_check()
    print("ALL PASS — правила времени V4-6 задача 1 зелёные")
