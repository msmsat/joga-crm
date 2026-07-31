"""Границы произвольного периода отчётов. Чистая проверка без БД и сети."""
from datetime import date

import pytest
from fastapi import HTTPException

from routers.analytics._filters import MIN_REPORT_DATE, check_report_range


def test_valid_range_passes():
    check_report_range(date(2025, 1, 1), date(2026, 7, 31))


@pytest.mark.parametrize("d_from, d_to", [
    (date(2024, 12, 31), date(2026, 1, 1)),   # начало раньше запуска продукта
    (date(2025, 3, 1), date(2024, 3, 1)),     # конец раньше запуска продукта
    (date(2, 5, 1), date(2026, 1, 1)),        # недобранный год из <input type="date">
    (date(2026, 5, 1), date(2026, 4, 1)),     # конец раньше начала
])
def test_bad_range_rejected(d_from, d_to):
    with pytest.raises(HTTPException) as exc:
        check_report_range(d_from, d_to)
    assert exc.value.status_code == 400


def test_min_date_matches_frontend_constant():
    assert MIN_REPORT_DATE == date(2025, 1, 1)
