"""_replace_schedule — смена недельного графика пересобирает будущие отметки дней.

Проверяем сам DELETE: он обязан быть с тремя ограничителями (сотрудник+студия,
только будущее, кроме дней с активными записями). Без любого из них смена
графика снесла бы историю или дни, куда уже записались клиенты.
Запуск из back/:  python -m tests.test_staff_schedule_resync
"""
import asyncio

import routers.staff.profiles as P
from schemas.staff.staff import StaffWorkingHoursItem


class _DB:
    def __init__(self):
        self.statements, self.added = [], []

    async def execute(self, stmt):
        self.statements.append(str(stmt.compile(compile_kwargs={"literal_binds": True})))
        return None

    def add(self, obj):
        self.added.append(obj)


def _run():
    db = _DB()
    schedule = [
        StaffWorkingHoursItem(day_of_week=d, is_open=d < 5, open_time="09:00", close_time="18:00")
        for d in range(7)
    ]
    asyncio.run(P._replace_schedule(7, 1, schedule, db))
    return db


def test_weekly_rows_replaced():
    db = _run()
    assert any("DELETE FROM staff_working_hours" in s for s in db.statements)
    assert len(db.added) == 7


def test_future_day_marks_dropped_with_all_guards():
    db = _run()
    sql = next(s for s in db.statements if "DELETE FROM staff_day_overrides" in s)
    assert "user_id = 7" in sql and "studio_id = 1" in sql   # чужие графики не трогаем
    assert "day >=" in sql                                   # прошлое остаётся как было
    assert "NOT IN" in sql and "reservations" in sql         # дни с записями остаются


if __name__ == "__main__":
    test_weekly_rows_replaced()
    test_future_day_marks_dropped_with_all_guards()
    print("ok")
