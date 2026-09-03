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

from services.booking_rules import (
    BookingRules, assert_bookable, assert_staff_bookable, assert_staff_cancellable,
    booking_window, lesson_finished, within_widget_hours,
)


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


# ─── Полномочия студии за стойкой ────────────────────────────────────────────

class _StaffLesson:
    """Занятие со снимком зоны: момент известен, «уже кончилось» считается
    настоящими часами, а не стенными."""

    def __init__(self, start_time: datetime, duration_min: int = 60, tz_iana=None):
        self.start_time, self.duration_min, self.tz_iana = start_time, duration_min, tz_iana


class _Res:
    def __init__(self, status: str = "active"):
        self.status = status


class _Studio:
    tz_iana = "Europe/Prague"
    timezone = None


PRAGUE = _Studio()
# 19:00 в Праге 15 июля — это 17:00 UTC; момент «сейчас» ниже задаётся в UTC.
LESSON = _StaffLesson(datetime(2026, 7, 15, 19, 0), 60, "Europe/Prague")


def test_staff_may_book_twenty_minutes_before_start():
    """Ровно тот случай, ради которого правило разделено: клиент у стойки за
    20 минут до начала."""
    assert_staff_bookable(LESSON, PRAGUE, now_instant=datetime(2026, 7, 15, 16, 40))


def test_staff_may_book_while_lesson_runs():
    assert_staff_bookable(LESSON, PRAGUE, now_instant=datetime(2026, 7, 15, 17, 30))


def test_staff_cannot_book_after_lesson_ended():
    with pytest.raises(HTTPException) as exc:
        assert_staff_bookable(LESSON, PRAGUE, now_instant=datetime(2026, 7, 15, 18, 1))
    assert exc.value.status_code == 400


def test_lesson_finished_counts_real_hours_not_wall_clock():
    """Момент считается по снимку зоны занятия: часы процесса ни при чём."""
    assert not lesson_finished(LESSON, PRAGUE, now_instant=datetime(2026, 7, 15, 17, 59))
    assert lesson_finished(LESSON, PRAGUE, now_instant=datetime(2026, 7, 15, 18, 0))


def test_lesson_without_zone_snapshot_falls_back_to_wall_clock():
    legacy = _StaffLesson(datetime(2026, 7, 15, 19, 0), 60)  # снимка нет
    assert not lesson_finished(legacy, PRAGUE, now=datetime(2026, 7, 15, 19, 30))
    assert lesson_finished(legacy, PRAGUE, now=datetime(2026, 7, 15, 20, 30))


def test_staff_may_remove_client_twenty_minutes_before_start():
    assert_staff_cancellable(_Res(), LESSON, PRAGUE, now_instant=datetime(2026, 7, 15, 16, 40))


def test_staff_cannot_remove_after_lesson_ended():
    with pytest.raises(HTTPException) as exc:
        assert_staff_cancellable(_Res(), LESSON, PRAGUE, now_instant=datetime(2026, 7, 15, 20, 0))
    assert exc.value.status_code == 400


def test_staff_cannot_remove_attended_client():
    with pytest.raises(HTTPException) as exc:
        assert_staff_cancellable(_Res("attended"), LESSON, PRAGUE,
                                 now_instant=datetime(2026, 7, 15, 17, 30))
    assert exc.value.status_code == 409


def test_pending_request_can_be_rejected_at_any_time():
    assert_staff_cancellable(_Res("pending"), LESSON, PRAGUE,
                             now_instant=datetime(2026, 7, 16, 12, 0))
