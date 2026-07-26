"""Обязательное правило Журнала: записать на занятие и снять клиента с занятия
менее чем за 2 часа до начала — нельзя (400). Отмена самого занятия (cancel_lesson)
покрыта в test_lesson_time_rules.py. Запуск из back/:  python -m tests.test_journal_time_rules
"""
import asyncio
from datetime import datetime, timedelta

from fastapi import HTTPException

import routers.schedule.reservations as RES
from dependencies import StudioContext
from schemas.schedule.reservations import ReservationCreate


class _Lesson:
    def __init__(self, start_time, status="confirmed"):
        self.id = 1
        self.studio_id = 1
        self.status = status
        self.start_time = start_time
        self.name = "Йога"
        self.teacher_id = 1
        self.total_spots = 8


class _Reservation:
    def __init__(self, status="active"):
        self.id = 1
        self.client_id = 7
        self.lesson_id = 1
        self.status = status
        self.cancelled_at = None


class _R:
    def __init__(self, v):
        self._v = v

    def scalar_one_or_none(self):
        return self._v


class _DB:
    def __init__(self, seq):
        self._seq = list(seq)

    async def execute(self, _q):
        return _R(self._seq.pop(0))


def _ctx(role="owner"):
    return StudioContext(user=type("U", (), {"id": 1})(), studio_id=1, role=role)


def _expect_400(coro, needle):
    try:
        asyncio.run(coro)
    except HTTPException as e:
        assert e.status_code == 400, e.status_code
        assert needle in str(e.detail), e.detail
        return
    raise AssertionError("ожидали HTTPException 400")


def _with_scoped_lesson(lesson, fn):
    orig = RES.get_scoped_lesson

    async def fake(lesson_id, ctx, db):
        return lesson

    RES.get_scoped_lesson = fake
    try:
        fn()
    finally:
        RES.get_scoped_lesson = orig


def test_booking_within_2h_blocked():
    lesson = _Lesson(start_time=datetime.now() + timedelta(hours=1))  # <2ч
    body = ReservationCreate(client_id=7, lesson_id=1)
    _with_scoped_lesson(lesson, lambda: _expect_400(
        RES.create_reservation(body, _ctx(), _DB([])), "2 часа"))


def test_remove_client_within_2h_blocked():
    lesson = _Lesson(start_time=datetime.now() + timedelta(hours=1))  # <2ч
    res = _Reservation()
    _with_scoped_lesson(lesson, lambda: _expect_400(
        RES.cancel_reservation(1, _ctx(), _DB([res])), "2 часа"))


def test_booking_beyond_2h_passes_time_guard():
    # >2ч — гейт времени пройден; дальше упрётся в 404 «клиент не найден» (fake БД),
    # но это НЕ ошибка «2 часа» — значит временной гейт пропустил.
    lesson = _Lesson(start_time=datetime.now() + timedelta(hours=5))
    body = ReservationCreate(client_id=7, lesson_id=1)

    def run():
        try:
            asyncio.run(RES.create_reservation(body, _ctx(), _DB([None])))
        except HTTPException as e:
            assert "2 часа" not in str(e.detail), "временной гейт не должен срабатывать при >2ч"

    _with_scoped_lesson(lesson, run)


if __name__ == "__main__":
    test_booking_within_2h_blocked()
    test_remove_client_within_2h_blocked()
    test_booking_beyond_2h_passes_time_guard()
    print("ALL PASS")
