"""_find_schedule_conflict — детектор пересечений расписания (N-9, задача 7/10).
Пара пересекающихся занятий по тому же тренеру/залу → конфликт найден;
непересекающихся или без общего ресурса → None.
Запуск из back/:  python -m tests.test_schedule_conflict
"""
import asyncio
from datetime import datetime, timedelta

import routers.schedule.lessons as L


class _FakeLesson:
    def __init__(self, id, name, teacher_id, hall_id, start_time, duration_min):
        self.id, self.name = id, name
        self.teacher_id, self.hall_id = teacher_id, hall_id
        self.start_time, self.duration_min = start_time, duration_min


class _R:
    def __init__(self, v):
        self._v = v

    def scalars(self):
        return self

    def all(self):
        return self._v


class _DB:
    def __init__(self, rows):
        self._rows = rows

    async def execute(self, _q):
        return _R(self._rows)


BASE = datetime(2026, 8, 1, 18, 0)


def test_same_trainer_overlap_detected():
    other = _FakeLesson(2, "Пилатес", teacher_id=5, hall_id=9, start_time=BASE + timedelta(minutes=30), duration_min=60)
    db = _DB([other])
    res = asyncio.run(L._find_schedule_conflict(
        db, 1, exclude_lesson_id=1, teacher_id=5, hall_id=None, start_time=BASE, duration_min=60,
    ))
    assert res is not None and res[1] == "trainer", res


def test_same_hall_different_trainer_overlap_detected():
    other = _FakeLesson(2, "Пилатес", teacher_id=6, hall_id=9, start_time=BASE + timedelta(minutes=30), duration_min=60)
    db = _DB([other])
    res = asyncio.run(L._find_schedule_conflict(
        db, 1, exclude_lesson_id=1, teacher_id=5, hall_id=9, start_time=BASE, duration_min=60,
    ))
    assert res is not None and res[1] == "hall", res


def test_both_match_prioritizes_trainer():
    other = _FakeLesson(2, "Пилатес", teacher_id=5, hall_id=9, start_time=BASE, duration_min=60)
    db = _DB([other])
    res = asyncio.run(L._find_schedule_conflict(
        db, 1, exclude_lesson_id=1, teacher_id=5, hall_id=9, start_time=BASE, duration_min=60,
    ))
    assert res is not None and res[1] == "trainer", res


def test_adjacent_non_overlapping_returns_none():
    # Другое занятие заканчивается ровно в момент начала нового — не пересекается.
    other = _FakeLesson(2, "Пилатес", teacher_id=5, hall_id=9, start_time=BASE - timedelta(minutes=60), duration_min=60)
    db = _DB([other])
    res = asyncio.run(L._find_schedule_conflict(
        db, 1, exclude_lesson_id=1, teacher_id=5, hall_id=None, start_time=BASE, duration_min=60,
    ))
    assert res is None


def test_no_teacher_or_hall_returns_none_without_query():
    db = _DB([_FakeLesson(2, "x", 5, 9, BASE, 60)])
    res = asyncio.run(L._find_schedule_conflict(
        db, 1, exclude_lesson_id=1, teacher_id=None, hall_id=None, start_time=BASE, duration_min=60,
    ))
    assert res is None


def test_no_candidates_returns_none():
    db = _DB([])
    res = asyncio.run(L._find_schedule_conflict(
        db, 1, exclude_lesson_id=1, teacher_id=5, hall_id=9, start_time=BASE, duration_min=60,
    ))
    assert res is None


def test_schedule_conflict():
    test_same_trainer_overlap_detected()
    test_same_hall_different_trainer_overlap_detected()
    test_both_match_prioritizes_trainer()
    test_adjacent_non_overlapping_returns_none()
    test_no_teacher_or_hall_returns_none_without_query()
    test_no_candidates_returns_none()


if __name__ == "__main__":
    test_schedule_conflict()
    print("ALL PASS")
