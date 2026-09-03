"""Полномочия студии за стойкой: что администратор может сделать в Журнале с
записью клиента и когда сервер обязан отказать.

Раньше здесь жило фикс-окно в 2 часа: записать и снять клиента менее чем за два
часа до начала запрещалось. Правило было заимствовано у САМОСТОЯТЕЛЬНОЙ записи
клиента и администратору только мешало — человека, пришедшего за 20 минут на
свободное место, штатно записать было нельзя. Теперь у стойки один предел:
занятие, которое уже закончилось (services/booking_rules — «Полномочия студии
за стойкой»). Плюс два исключения на снятии: pending отклоняется всегда,
attended не снимается никогда.

Правила самого занятия (создание за 3 часа, перенос и отмена за 2) — другое
дело и лежат в test_lesson_time_rules.py.

Запуск из back/:  python -m tests.test_journal_time_rules
"""
import asyncio
from datetime import datetime, timedelta

from fastapi import HTTPException

import routers.schedule.reservations as RES
from dependencies import StudioContext
from schemas.schedule.reservations import ReservationCreate


class _Lesson:
    def __init__(self, start_time, status="confirmed", duration_min=60):
        self.id = 1
        self.studio_id = 1
        self.status = status
        self.start_time = start_time
        self.duration_min = duration_min
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
        self.subscription_id = None
        self.debt_payment_id = None


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

    async def get(self, _model, _pk):
        # Студии у фейковой БД нет — правила считаются по стенному времени,
        # ровно как у занятия без снимка зоны (services/lesson_time).
        return None


def _ctx(role="owner"):
    return StudioContext(user=type("U", (), {"id": 1})(), studio_id=1, role=role)


def _expect(coro, status, needle):
    try:
        asyncio.run(coro)
    except HTTPException as e:
        assert e.status_code == status, e.status_code
        assert needle in str(e.detail), e.detail
        return
    raise AssertionError(f"ожидали HTTPException {status}")


def _passes_time_guard(coro, needle="закончилось"):
    """Гейт времени пропустил: отказа про время нет.

    Дальше по коду фейковая БД кончается (404 «клиент не найден», пустая
    очередь) — это уже не про время, и такие исключения тест не проверяет.
    """
    try:
        asyncio.run(coro)
    except HTTPException as e:
        assert needle not in str(e.detail), f"временной гейт не должен срабатывать: {e.detail}"
    except Exception:
        pass


def _with_scoped_lesson(lesson, fn):
    orig = RES.get_scoped_lesson

    async def fake(lesson_id, ctx, db):
        return lesson

    RES.get_scoped_lesson = fake
    try:
        fn()
    finally:
        RES.get_scoped_lesson = orig


# ─── Запись клиента ──────────────────────────────────────────────────────────

def test_booking_20_minutes_before_start_allowed():
    """Клиент пришёл за 20 минут, место свободно — запись обязана пройти."""
    lesson = _Lesson(start_time=datetime.now() + timedelta(minutes=20))
    body = ReservationCreate(client_id=7, lesson_id=1)
    _with_scoped_lesson(lesson, lambda: _passes_time_guard(
        RES.create_reservation(body, _ctx(), _DB([None]))))


def test_booking_during_lesson_allowed():
    """Занятие идёт — опоздавшего записывают: он в зале."""
    lesson = _Lesson(start_time=datetime.now() - timedelta(minutes=10), duration_min=60)
    body = ReservationCreate(client_id=7, lesson_id=1)
    _with_scoped_lesson(lesson, lambda: _passes_time_guard(
        RES.create_reservation(body, _ctx(), _DB([None]))))


def test_booking_after_lesson_ended_rejected():
    lesson = _Lesson(start_time=datetime.now() - timedelta(hours=3), duration_min=60)
    body = ReservationCreate(client_id=7, lesson_id=1)
    _with_scoped_lesson(lesson, lambda: _expect(
        RES.create_reservation(body, _ctx(), _DB([])), 400, "закончилось"))


# ─── Снятие клиента ──────────────────────────────────────────────────────────

def test_remove_client_20_minutes_before_start_allowed():
    """Клиент позвонил за 20 минут — место обязано освободиться."""
    lesson = _Lesson(start_time=datetime.now() + timedelta(minutes=20))
    res = _Reservation()
    _with_scoped_lesson(lesson, lambda: _passes_time_guard(
        RES.cancel_reservation(1, _ctx(), _DB([res]))))


def test_remove_after_lesson_ended_rejected():
    lesson = _Lesson(start_time=datetime.now() - timedelta(hours=3), duration_min=60)
    res = _Reservation()
    _with_scoped_lesson(lesson, lambda: _expect(
        RES.cancel_reservation(1, _ctx(), _DB([res])), 400, "закончилось"))


def test_remove_attended_rejected():
    """Визит состоялся: снятие вернуло бы занятие на абонемент и стёрло его из
    посещаемости."""
    lesson = _Lesson(start_time=datetime.now() - timedelta(minutes=30), duration_min=60)
    res = _Reservation(status="attended")
    _with_scoped_lesson(lesson, lambda: _expect(
        RES.cancel_reservation(1, _ctx(), _DB([res])), 409, "пришедший"))


def test_reject_pending_after_lesson_ended_allowed():
    """Неподтверждённую заявку студия отклоняет когда угодно — иначе она
    зависает навсегда."""
    lesson = _Lesson(start_time=datetime.now() - timedelta(hours=3), duration_min=60)
    res = _Reservation(status="pending")
    _with_scoped_lesson(lesson, lambda: _passes_time_guard(
        RES.cancel_reservation(1, _ctx(), _DB([res]))))


if __name__ == "__main__":
    test_booking_20_minutes_before_start_allowed()
    test_booking_during_lesson_allowed()
    test_booking_after_lesson_ended_rejected()
    test_remove_client_20_minutes_before_start_allowed()
    test_remove_after_lesson_ended_rejected()
    test_remove_attended_rejected()
    test_reject_pending_after_lesson_ended_allowed()
    print("ALL PASS")
