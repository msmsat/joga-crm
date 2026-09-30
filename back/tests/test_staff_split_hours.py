from datetime import date, datetime
from types import SimpleNamespace
from services.staff_hours import shift_intervals, blocked_day, schedule_contains
DAY = date(2026, 10, 5)
def hours():
    return SimpleNamespace(is_open=True, open_time="11:00", close_time="22:00", breaks=[{"open_time":"15:00","close_time":"17:00","label":"Обед"}], off_label=None)
def test_split_shift():
    assert shift_intervals(hours(), DAY) == [(datetime(2026,10,5,11),datetime(2026,10,5,15)),(datetime(2026,10,5,17),datetime(2026,10,5,22))]
def test_break_boundaries_and_duration():
    assert schedule_contains(hours(),datetime(2026,10,5,14),datetime(2026,10,5,15))
    assert not schedule_contains(hours(),datetime(2026,10,5,14,30),datetime(2026,10,5,15,30))
    assert not schedule_contains(hours(),datetime(2026,10,5,15),datetime(2026,10,5,16))
    assert schedule_contains(hours(),datetime(2026,10,5,17),datetime(2026,10,5,18))
def test_custom_break_title():
    lunch = next(b for b in blocked_day(hours(), DAY) if b["kind"] == "break")
    assert lunch["label"] == "Обед" and lunch["start_time"] == datetime(2026,10,5,15)
def test_full_day_off():
    row = SimpleNamespace(is_open=False,open_time="11:00",close_time="22:00",breaks=[],off_label="Відпустка")
    blocks = blocked_day(row, DAY)
    assert len(blocks)==1 and blocks[0]["kind"]=="day_off" and blocks[0]["label"]=="Відпустка"
    assert not schedule_contains(row,datetime(2026,10,5,14),datetime(2026,10,5,15))
def test_overnight_break():
    row = SimpleNamespace(is_open=True,open_time="22:00",close_time="06:00",breaks=[{"open_time":"01:00","close_time":"02:00","label":"Перерва"}],off_label=None)
    assert shift_intervals(row,DAY)==[(datetime(2026,10,5,22),datetime(2026,10,6,1)),(datetime(2026,10,6,2),datetime(2026,10,6,6))]
