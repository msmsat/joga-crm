"""_seed_working_days — график сотрудника проставляется отметками сам.

Рабочие дни месяца получают отметку «работает» при первом открытии месяца;
уже проставленные дни (в том числе выходные, поставленные владельцем) не
трогаются, прошлое не засевается.
Запуск из back/:  python -m tests.test_staff_month_seed
"""
import asyncio
from calendar import monthrange
from datetime import date, timedelta

import routers.staff.schedule as S
from models import StaffDayOverride, StaffWorkingHours


class _R:
    def __init__(self, v):
        self._v = v

    def scalars(self):
        return self

    def all(self):
        return self._v


class _DB:
    def __init__(self, working_hours):
        self._wh = working_hours
        self.added, self.commits = [], 0

    async def execute(self, _q):
        return _R(self._wh)

    def add(self, obj):
        self.added.append(obj)

    async def commit(self):
        self.commits += 1


# Следующий месяц: он весь в будущем, поэтому засевается целиком независимо от
# того, какое сегодня число.
_NEXT = (date.today().replace(day=1) + timedelta(days=32)).replace(day=1)
YEAR, MONTH = _NEXT.year, _NEXT.month
DAYS = monthrange(YEAR, MONTH)[1]


def _week(*open_dows):
    return [
        StaffWorkingHours(user_id=7, studio_id=1, day_of_week=d, is_open=d in open_dows,
                          open_time="09:00", close_time="18:00")
        for d in range(7)
    ]


def _seed(db, existing=()):
    return asyncio.run(S._seed_working_days(7, 1, YEAR, MONTH, list(existing), db))


def test_seeds_only_days_open_in_week_schedule():
    db = _DB(_week(0, 2))                      # рабочие только Пн и Ср
    _seed(db)
    assert db.added and db.commits == 1
    assert {d.day.weekday() for d in db.added} == {0, 2}
    assert all(d.is_working is True for d in db.added)


def test_no_week_schedule_falls_back_to_mon_fri():
    db = _DB([])                               # личного графика нет
    _seed(db)
    assert {d.day.weekday() for d in db.added} == {0, 1, 2, 3, 4}


def test_existing_marks_are_never_overwritten():
    workday = next(date(YEAR, MONTH, d) for d in range(1, DAYS + 1)
                   if date(YEAR, MONTH, d).weekday() == 0)
    # Владелец сделал этот понедельник выходным — засев не должен его вернуть.
    existing = [StaffDayOverride(user_id=7, studio_id=1, day=workday, is_working=False)]
    db = _DB(_week(0, 1, 2, 3, 4))
    result = _seed(db, existing)
    assert workday not in {d.day for d in db.added}
    assert existing[0] in result and existing[0].is_working is False


def test_past_month_is_not_seeded():
    db = _DB(_week(0, 1, 2, 3, 4))
    last_month = (date.today().replace(day=1) - timedelta(days=1))
    result = asyncio.run(S._seed_working_days(7, 1, last_month.year, last_month.month, [], db))
    assert result == [] and not db.added and db.commits == 0


if __name__ == "__main__":
    test_seeds_only_days_open_in_week_schedule()
    test_no_week_schedule_falls_back_to_mon_fri()
    test_existing_marks_are_never_overwritten()
    test_past_month_is_not_seeded()
    print("ok")
