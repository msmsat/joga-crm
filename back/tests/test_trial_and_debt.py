"""Пробное занятие и долг «оплата на месте».

Фейковая сессия — образец tests/test_subscription_charge.py, БД не трогаем:
проверяем ровно решения (кому положен подарок) и применение (когда заводится и
когда снимается долг), а не SQL.

Запуск из back/:  python -m tests.test_trial_and_debt
"""
import asyncio
from datetime import datetime

from services.booking_access import trial_applies
from services.booking_rules import BookingRules
from services.subscription_charge import clear_debt, open_debt


class _Lesson:
    def __init__(self, price=500, lesson_id=3):
        self.id = lesson_id
        self.name = "Хатха"
        self.price = price
        self.start_time = datetime(2026, 8, 20, 18, 0)


class _Res:
    def __init__(self, subscription_id=None, is_trial=False, debt_payment_id=None):
        self.client_id = 1
        self.subscription_id = subscription_id
        self.is_trial = is_trial
        self.debt_payment_id = debt_payment_id


class _R:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class _DB:
    """execute() отдаёт заготовленный ответ, flush() раздаёт id (как настоящая
    сессия — без него open_debt нечего было бы записать в бронь)."""
    def __init__(self, first_booking_id=None, stored=None):
        self._first_booking_id = first_booking_id
        self.added = []
        self.deleted = []
        self._stored = stored or {}
        self._next_id = 100

    async def execute(self, _query):
        return _R(self._first_booking_id)

    def add(self, obj):
        self.added.append(obj)

    async def flush(self):
        for obj in self.added:
            if getattr(obj, "id", None) is None:
                obj.id = self._next_id
                self._next_id += 1
                self._stored[obj.id] = obj

    async def get(self, _model, pk):
        return self._stored.get(pk)

    async def delete(self, obj):
        self.deleted.append(obj)


def _run(coro):
    return asyncio.run(coro)


ON = BookingRules(trial_lesson_free=True)
OFF = BookingRules(trial_lesson_free=False)


# ─── Пробное: положено только на первой броне и только при включённом тумблере ─
assert _run(trial_applies(_DB(first_booking_id=None), 1, ON)) is True
assert _run(trial_applies(_DB(first_booking_id=None), 1, OFF)) is False, "тумблер выключен — подарка нет"
assert _run(trial_applies(_DB(first_booking_id=42), 1, ON)) is False, "у клиента уже есть бронь"


# ─── Долг заводится, когда платить нечем ─────────────────────────────────────
db = _DB()
res = _Res()
debt = _run(open_debt(db, res, _Lesson(price=500)))
assert debt is not None and debt.amount == 500, debt
assert debt.status == "pending" and debt.action_type == "lesson"
assert debt.item_key == "3", debt.item_key
assert res.debt_payment_id == debt.id, "бронь обязана ссылаться на свой долг"

# ─── …и не заводится, когда платить не за что ────────────────────────────────
assert _run(open_debt(_DB(), _Res(subscription_id=7), _Lesson())) is None, "покрыто абонементом"
assert _run(open_debt(_DB(), _Res(is_trial=True), _Lesson())) is None, "подарено как пробное"
assert _run(open_debt(_DB(), _Res(), _Lesson(price=0))) is None, "занятие бесплатное по прайсу"

# ─── Повторный вызов не плодит второй долг (идемпотентность) ─────────────────
db_twice = _DB()
res_twice = _Res()
first = _run(open_debt(db_twice, res_twice, _Lesson()))
assert _run(open_debt(db_twice, res_twice, _Lesson())) is None
assert len(db_twice.added) == 1, db_twice.added
assert res_twice.debt_payment_id == first.id


# ─── Отмена брони снимает НЕоплаченный долг ──────────────────────────────────
db_cancel = _DB()
res_cancel = _Res()
pending = _run(open_debt(db_cancel, res_cancel, _Lesson()))
_run(clear_debt(db_cancel, res_cancel))
assert db_cancel.deleted == [pending], db_cancel.deleted
assert res_cancel.debt_payment_id is None

# ─── …и НИКОГДА не трогает оплаченный: это уже проведённые деньги ────────────
db_paid = _DB()
res_paid = _Res()
paid = _run(open_debt(db_paid, res_paid, _Lesson()))
paid.status = "success"
_run(clear_debt(db_paid, res_paid))
assert db_paid.deleted == [], "погашенный платёж удалять нельзя — доход уже проведён"
assert res_paid.debt_payment_id is None

# ─── Повторная отмена — no-op ────────────────────────────────────────────────
_run(clear_debt(db_cancel, res_cancel))
assert len(db_cancel.deleted) == 1


def test_trial_and_debt():
    """Проверки выполняются на импорте модуля — pytest собирает их этим кейсом."""
    assert True


if __name__ == "__main__":
    print("ALL PASS - trial lesson & pay-at-venue debt")
