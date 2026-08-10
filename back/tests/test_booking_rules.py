"""Правила онлайн-записи (services/booking_rules.py) — чистые проверки без БД.

Единственная нетривиальная логика модуля: интервал часов работы виджета (в том
числе через полночь) и порядок отказов в assert_bookable. БД тут не нужна —
`load_rules` только достаёт строку, а решают уже эти функции, поэтому файл
безопасно гонять вместе с остальными (в отличие от тестов, которые пишут в
dev-БД и шлют почту).

    pytest back/tests/test_booking_rules.py
"""
from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException

from services.booking_rules import BookingRules, assert_bookable, booking_window, within_widget_hours


class _Lesson:
    """Хватает одного поля — assert_bookable читает только start_time."""

    def __init__(self, start_time: datetime):
        self.start_time = start_time


NOW = datetime(2026, 8, 8, 12, 0)


def test_widget_hours_plain_interval():
    rules = BookingRules(widget_work_start="09:00", widget_work_end="21:00")
    assert within_widget_hours(rules, datetime(2026, 8, 8, 9, 0))
    assert within_widget_hours(rules, datetime(2026, 8, 8, 20, 59))
    assert not within_widget_hours(rules, datetime(2026, 8, 8, 8, 59))
    assert not within_widget_hours(rules, datetime(2026, 8, 8, 21, 0))


def test_widget_hours_across_midnight():
    rules = BookingRules(widget_work_start="22:00", widget_work_end="06:00")
    assert within_widget_hours(rules, datetime(2026, 8, 8, 23, 30))
    assert within_widget_hours(rules, datetime(2026, 8, 8, 5, 59))
    assert not within_widget_hours(rules, datetime(2026, 8, 8, 12, 0))


def test_widget_hours_empty_interval_allows_everything():
    rules = BookingRules(widget_work_start="00:00", widget_work_end="00:00")
    assert within_widget_hours(rules, datetime(2026, 8, 8, 3, 0))


def test_booking_window_edges():
    rules = BookingRules(min_booking_advance_min=120, booking_window_days=7)
    lower, upper = booking_window(rules, NOW)
    assert lower == NOW + timedelta(minutes=120)
    assert upper == NOW + timedelta(days=7)


def _fails(rules: BookingRules, lesson: _Lesson) -> str:
    with pytest.raises(HTTPException) as exc:
        assert_bookable(rules, lesson, NOW)
    return exc.value.detail


def test_assert_bookable_passes_inside_all_rules():
    rules = BookingRules()
    assert_bookable(rules, _Lesson(datetime(2026, 8, 9, 18, 0)), NOW)  # не бросает


def test_assert_bookable_rejects_closed_booking():
    assert _fails(BookingRules(booking_active=False), _Lesson(datetime(2026, 8, 9, 18, 0)))


def test_assert_bookable_rejects_too_late_and_too_early():
    rules = BookingRules(min_booking_advance_min=120, booking_window_days=7)
    # через час — позже минимума в 2 часа
    assert _fails(rules, _Lesson(NOW + timedelta(hours=1)))
    # через месяц — дальше окна в 7 дней
    assert _fails(rules, _Lesson(NOW + timedelta(days=30)))


def test_assert_bookable_rejects_outside_widget_hours():
    rules = BookingRules(widget_work_start="09:00", widget_work_end="21:00")
    assert _fails(rules, _Lesson(datetime(2026, 8, 9, 7, 0)))
