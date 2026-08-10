"""Гейт рабочих часов расписания (services/working_hours.py): занятие нельзя
поставить в выходной или за пределы часов студии / филиала / тренера.

Образец фейковой сессии — tests/test_lesson_time_rules.py.
Запуск из back/:  python -m tests.test_working_hours_gate
"""
import asyncio
from datetime import datetime

from fastapi import HTTPException

from services.working_hours import assert_within_working_hours, fits_hours

MON_10 = datetime(2026, 8, 10, 10, 0)   # понедельник, 10:00


class _Hours:
    def __init__(self, is_open=True, open_time="09:00", close_time="21:00"):
        self.is_open = is_open
        self.open_time = open_time
        self.close_time = close_time


class _R:
    def __init__(self, v):
        self._v = v

    def scalar_one_or_none(self):
        return self._v


class _DB:
    """execute() отдаёт значения из seq по порядку вызовов; лишний запрос —
    IndexError, значит проверка сходила туда, куда была не должна."""
    def __init__(self, *seq):
        self._seq = list(seq)

    async def execute(self, _q):
        return _R(self._seq.pop(0))


def _run(db, *, teacher_id=1, hall_id=None, start=MON_10, duration_min=60):
    return asyncio.run(assert_within_working_hours(
        db, 1, start_time=start, duration_min=duration_min,
        teacher_id=teacher_id, hall_id=hall_id,
    ))


def _expect_400(db, message_part, **kwargs):
    try:
        _run(db, **kwargs)
    except HTTPException as e:
        assert e.status_code == 400, e.status_code
        assert message_part in e.detail, f"{message_part!r} не найдено в {e.detail!r}"
        return
    raise AssertionError(f"ожидали 400 с {message_part!r}, исключения не было")


# ─── fits_hours: границы окна ────────────────────────────────────────────────
def test_fits_hours_inside_window():
    assert fits_hours("09:00", "21:00", MON_10, 60)


def test_fits_hours_ends_exactly_at_close():
    assert fits_hours("09:00", "11:00", MON_10, 60)


def test_fits_hours_rejects_tail_past_close():
    assert not fits_hours("09:00", "10:30", MON_10, 60)


def test_fits_hours_rejects_before_open():
    assert not fits_hours("11:00", "21:00", MON_10, 60)


def test_fits_hours_overnight_window():
    """Смена 22:00–06:00: и вечерний, и ночной хвост внутри, а полдень — нет."""
    assert fits_hours("22:00", "06:00", datetime(2026, 8, 10, 23, 0), 60)
    assert fits_hours("22:00", "06:00", datetime(2026, 8, 10, 2, 0), 60)
    assert not fits_hours("22:00", "06:00", MON_10, 60)


# ─── студия ──────────────────────────────────────────────────────────────────
def test_studio_closed_day_rejected():
    _expect_400(_DB(_Hours(is_open=False)), "Студия в этот день не работает")


def test_studio_hours_exceeded_rejected():
    _expect_400(_DB(_Hours(open_time="12:00", close_time="21:00")), "рабочие часы студии")


def test_no_studio_row_does_not_restrict():
    """Часы не заполнены — не «закрыто всегда»: студия, тренер (нет отметки, нет
    недельной строки) молчат, занятие проходит."""
    _run(_DB(None, None, None))


# ─── филиал через зал ────────────────────────────────────────────────────────
def test_branch_closed_day_rejected():
    _expect_400(_DB(None, _Hours(is_open=False)), "Филиал в этот день не работает", hall_id=5)


def test_hall_without_branch_hours_does_not_restrict():
    _run(_DB(None, None, None, None), hall_id=5)


# ─── тренер ──────────────────────────────────────────────────────────────────
def test_staff_weekly_day_off_rejected():
    _expect_400(_DB(None, None, _Hours(is_open=False)), "Сотрудник в этот день не работает")


def test_staff_hours_exceeded_rejected():
    _expect_400(_DB(None, None, _Hours(open_time="14:00", close_time="20:00")),
                "рабочие часы сотрудника")


def test_staff_date_override_day_off_rejected():
    """Отметка «выходной» на дату бьёт даже открытый недельный график."""
    _expect_400(_DB(None, False), "выходной")


def test_staff_date_override_opens_day_closed_in_week():
    """Отметка «работает» открывает день, помеченный в неделе нерабочим."""
    _run(_DB(None, True, _Hours(is_open=False)))


def test_staff_date_override_working_still_respects_hours():
    """Но открывает день, а не сутки: часы из недельной строки продолжают
    действовать. Иначе автоматические отметки на каждый рабочий день
    (routers/staff/schedule.py) сняли бы гейт часов тренера вовсе."""
    _expect_400(_DB(None, True, _Hours(open_time="14:00", close_time="20:00")),
                "рабочие часы сотрудника")


def test_no_teacher_skips_staff_queries():
    _run(_DB(None), teacher_id=None)


def test_working_hours_gate():
    test_fits_hours_inside_window()
    test_fits_hours_ends_exactly_at_close()
    test_fits_hours_rejects_tail_past_close()
    test_fits_hours_rejects_before_open()
    test_fits_hours_overnight_window()
    test_studio_closed_day_rejected()
    test_studio_hours_exceeded_rejected()
    test_no_studio_row_does_not_restrict()
    test_branch_closed_day_rejected()
    test_hall_without_branch_hours_does_not_restrict()
    test_staff_weekly_day_off_rejected()
    test_staff_hours_exceeded_rejected()
    test_staff_date_override_day_off_rejected()
    test_staff_date_override_opens_day_closed_in_week()
    test_staff_date_override_working_still_respects_hours()
    test_no_teacher_skips_staff_queries()


if __name__ == "__main__":
    test_working_hours_gate()
    print("ALL PASS — гейт рабочих часов зелёный")
