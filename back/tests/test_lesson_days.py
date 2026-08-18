"""Точки мини-календаря Журнала (эпик V4-5, задача 5): GET /schedule/lessons/days
возвращает даты месяца с неотменёнными занятиями. Образец фейковой сессии —
tests/test_lesson_service_required.py.

Запуск из back/:  python -m tests.test_lesson_days
"""
import asyncio
from datetime import date

import routers.schedule.lessons as L
from dependencies import StudioContext


class _User:
    id = 1


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
        self.sql = ""

    async def execute(self, q):
        self.sql = str(q)  # фильтр проверяем по тексту запроса — живой БД тут нет
        return _R(self._rows)


def _ctx(role="owner"):
    return StudioContext(user=_User(), studio_id=1, role=role)


def test_returns_sorted_unique_days():
    db = _DB([date(2026, 7, 12), date(2026, 7, 3), date(2026, 7, 12)])
    result = asyncio.run(L.list_lesson_days(month="2026-07", exclude_teacher_id=None, ctx=_ctx(), db=db))
    assert result.days == ["2026-07-03", "2026-07-12"]


def test_empty_month_returns_empty_list():
    db = _DB([])
    result = asyncio.run(L.list_lesson_days(month="2026-08", exclude_teacher_id=None, ctx=_ctx(), db=db))
    assert result.days == []


def test_hidden_trainers_excluded_but_lessons_without_trainer_stay():
    """Скрытый фильтром тренер гасит свои точки; занятие без тренера сетка
    показывает при любом фильтре, значит его точка обязана остаться."""
    db = _DB([])
    asyncio.run(L.list_lesson_days(month="2026-07", exclude_teacher_id=[7], ctx=_ctx(), db=db))
    assert "teacher_id NOT IN" in db.sql
    assert "teacher_id IS NULL" in db.sql


def test_without_filter_no_teacher_condition():
    db = _DB([])
    asyncio.run(L.list_lesson_days(month="2026-07", exclude_teacher_id=None, ctx=_ctx(), db=db))
    assert "teacher_id" not in db.sql


if __name__ == "__main__":
    test_returns_sorted_unique_days()
    test_empty_month_returns_empty_list()
    test_hidden_trainers_excluded_but_lessons_without_trainer_stay()
    test_without_filter_no_teacher_condition()
    print("ALL PASS — точки мини-календаря V4-5 задача 5 зелёные")
