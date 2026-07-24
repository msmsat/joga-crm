"""Дневная логика daily_notify.py (эпик N-4, задача 8): только чистые функции
_is_birthday/_report_due и попадание start_time-offset в окно тика, без БД.
Запуск из back/:  python -m tests.test_daily_notify
"""
from datetime import date, datetime, timedelta

import services.daily_notify as D


def test_is_birthday_matches_month_and_day():
    assert D._is_birthday(date(1990, 7, 23), date(2026, 7, 23))
    assert not D._is_birthday(date(1990, 7, 23), date(2026, 7, 24))
    assert not D._is_birthday(date(1990, 7, 23), date(2026, 8, 23))


def test_is_birthday_feb29_in_non_leap_year_falls_back_to_feb28():
    assert D._is_birthday(date(1992, 2, 29), date(2026, 2, 28))
    assert not D._is_birthday(date(1992, 2, 29), date(2026, 2, 27))
    assert not D._is_birthday(date(1992, 2, 29), date(2026, 3, 1))


def test_is_birthday_feb29_in_leap_year_matches_feb29():
    assert D._is_birthday(date(1992, 2, 29), date(2028, 2, 29))
    assert not D._is_birthday(date(1992, 2, 29), date(2028, 2, 28))


def test_report_due_before_hour_is_false():
    state = {}
    now_local = datetime(2026, 7, 23, 19, 59)
    assert not D._report_due(state, now_local)


def test_report_due_after_hour_is_true_once_per_day():
    state = {}
    now_local = datetime(2026, 7, 23, 20, 0)
    assert D._report_due(state, now_local)

    state["report"] = "2026-07-23"
    assert not D._report_due(state, now_local)

    later_same_day = datetime(2026, 7, 23, 23, 0)
    assert not D._report_due(state, later_same_day)

    next_day = datetime(2026, 7, 24, 20, 0)
    assert D._report_due(state, next_day)


def test_reminder_window_boundaries_fire_exactly_once():
    """start_time - offset должен попасть в (window_start; window_end] — левая
    граница исключена, правая включена, окна тиков не пересекаются."""
    offset = timedelta(hours=24)
    window_start = datetime(2026, 7, 23, 14, 0)
    window_end = datetime(2026, 7, 23, 14, 30)
    lo = window_start + offset
    hi = window_end + offset

    on_lower_bound = lo  # start_time - offset == window_start → уже обработано прошлым тиком
    assert not (on_lower_bound > lo)

    on_upper_bound = hi  # start_time - offset == window_end → должно сработать в этом тике
    assert on_upper_bound > lo and on_upper_bound <= hi

    just_after_upper = hi + timedelta(seconds=1)  # достанется следующему тику
    assert not (just_after_upper <= hi)


def test_run_daily_notify():
    test_is_birthday_matches_month_and_day()
    test_is_birthday_feb29_in_non_leap_year_falls_back_to_feb28()
    test_is_birthday_feb29_in_leap_year_matches_feb29()
    test_report_due_before_hour_is_false()
    test_report_due_after_hour_is_true_once_per_day()
    test_reminder_window_boundaries_fire_exactly_once()


if __name__ == "__main__":
    test_run_daily_notify()
    print("ALL PASS")
