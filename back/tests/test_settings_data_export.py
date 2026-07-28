"""Экспорт вкладки «Данные» (EPIC 7, задача 1): корректность CSV-строк для
каждого kind (агрегация визитов/суммы, статус-лейблы, is_frozen поверх status),
фильтр дат и потолок в 100 000 строк. Раздача через csv_stream и локализация
заголовков уже покрыты образцом (routers/billing/router.py) — здесь только то,
что специфично для этого модуля.

Запуск из back/:  python -m tests.test_settings_data_export
"""
import asyncio
from datetime import date, datetime, timedelta

from fastapi import HTTPException

import routers.settings.data as D
from dependencies import StudioContext
from models import Client


def _run(coro):
    return asyncio.run(coro)


# ─── fakes ────────────────────────────────────────────────────────────────

class _Reservation:
    def __init__(self, status):
        self.status = status


class _Payment:
    def __init__(self, amount, status="success"):
        self.amount = amount
        self.status = status


class _Client:
    def __init__(self, **kw):
        self.id = kw.get("id", 1)
        self.name = kw.get("name", "Анна")
        self.last_name = kw.get("last_name", "Иванова")
        self.phone = kw.get("phone")
        self.email = kw.get("email")
        self.birth_date = kw.get("birth_date")
        self.status = kw.get("status", "active")
        self.tags = kw.get("tags")
        self.registration_date = kw.get("registration_date")
        self.reservations = kw.get("reservations", [])
        self.payments = kw.get("payments", [])


class _Hall:
    def __init__(self, name):
        self.name = name


class _Lesson:
    def __init__(self, **kw):
        self.start_time = kw.get("start_time", datetime(2026, 1, 1, 10, 0))
        self.name = kw.get("name", "Йога")
        self.teacher_name = kw.get("teacher_name", "Мария")
        self.hall = kw.get("hall")
        self.total_spots = kw.get("total_spots", 8)
        self.status = kw.get("status", "confirmed")
        self.reservations = kw.get("reservations", [])


class _Account:
    def __init__(self, name):
        self.name = name


class _Operation:
    def __init__(self, **kw):
        self.op_date = kw.get("op_date", date(2026, 1, 1))
        self.type = kw.get("type", "in")
        self.category = kw.get("category", "Абонементы")
        self.amount = kw.get("amount", 500000)
        self.method = kw.get("method", "card")
        self.account = kw.get("account")
        self.client = kw.get("client")
        self.status = kw.get("status", "completed")


class _Subscription:
    def __init__(self, **kw):
        self.client = kw["client"]
        self.type = kw.get("type", "8 занятий")
        self.total_classes = kw.get("total_classes", 8)
        self.used_classes = kw.get("used_classes", 3)
        self.expires_at = kw.get("expires_at", date(2026, 6, 1))
        self.status = kw.get("status", "active")
        self.is_frozen = kw.get("is_frozen", False)


class _R:
    def __init__(self, v):
        self._v = v

    def scalar_one(self):
        return self._v

    def scalars(self):
        return self

    def all(self):
        return self._v


class _User:
    id = 1
    name = "Владелец"


class _DB:
    def __init__(self, seq):
        self._seq = list(seq)
        self.added = []
        self.committed = False

    def add(self, x):
        self.added.append(x)

    async def commit(self):
        self.committed = True

    async def execute(self, _q):
        return _R(self._seq.pop(0))


def _ctx():
    return StudioContext(user=_User(), studio_id=1, role="owner")


# ─── _date_range ──────────────────────────────────────────────────────────

def test_date_range_no_bounds_means_no_filter():
    assert D._date_range(Client.registration_date, None, None) == []


def test_date_range_upper_bound_is_exclusive_next_day():
    filters = D._date_range(Client.registration_date, None, date(2026, 1, 10))
    assert len(filters) == 1
    # right-hand literal должен быть date_to + 1 день, не date_to
    assert filters[0].right.value == date(2026, 1, 11)


def test_date_range_both_bounds_give_two_filters():
    assert len(D._date_range(Client.registration_date, date(2026, 1, 1), date(2026, 1, 10))) == 2


# ─── clients ──────────────────────────────────────────────────────────────

def test_clients_csv_counts_only_attended_and_successful_payments():
    c = _Client(
        reservations=[_Reservation("attended"), _Reservation("attended"), _Reservation("cancelled")],
        payments=[_Payment(100000, "success"), _Payment(50000, "failed")],
        tags=["vip", "утро"],
        birth_date=date(1990, 5, 20),
        registration_date=datetime(2025, 1, 1),
    )
    row = next(D._clients_csv_rows([c], "ru"))
    assert row[6] == "Активный"           # статус на русском
    assert row[7] == "vip, утро"          # tags
    assert row[8] == 2                    # visits — только attended
    assert row[9] == "1000.00"            # total_spent — только success, в валюте (копейки/100)


def test_clients_csv_status_label_falls_back_to_raw_when_unknown():
    c = _Client(status="weird", tags=None, reservations=[], payments=[])
    row = next(D._clients_csv_rows([c], "en"))
    assert row[6] == "weird"
    assert row[7] == ""                   # tags=None не должно падать на join


# ─── schedule ─────────────────────────────────────────────────────────────

def test_schedule_csv_booked_includes_active_and_attended_not_cancelled():
    l = _Lesson(
        hall=_Hall("Зал А"),
        reservations=[_Reservation("active"), _Reservation("attended"), _Reservation("cancelled")],
    )
    row = next(D._schedule_csv_rows([l], "ru"))
    assert row[3] == "Зал А"
    assert row[5] == 2   # booked: active + attended
    assert row[6] == 1   # attended: только attended
    assert row[7] == "Подтверждено"


def test_schedule_csv_missing_hall_is_blank_not_crash():
    l = _Lesson(hall=None, reservations=[])
    row = next(D._schedule_csv_rows([l], "en"))
    assert row[3] == ""


# ─── finances ─────────────────────────────────────────────────────────────

def test_finances_csv_client_and_account_optional():
    op_with = _Operation(account=_Account("Касса"), client=_Client(name="Пётр", last_name="Сидоров"))
    op_without = _Operation(account=None, client=None, type="out")

    row_with = next(D._finances_csv_rows([op_with], "ru"))
    assert row_with[5] == "Касса"
    assert row_with[6] == "Пётр Сидоров"
    assert row_with[1] == "Приход"

    row_without = next(D._finances_csv_rows([op_without], "en"))
    assert row_without[5] == ""
    assert row_without[6] == ""
    assert row_without[1] == "Expense"


# ─── subscriptions ────────────────────────────────────────────────────────

def test_subscriptions_csv_frozen_overrides_status_label():
    s = _Subscription(client=_Client(), is_frozen=True, status="active", total_classes=10, used_classes=4)
    row = next(D._subscriptions_csv_rows([s], "ru"))
    assert row[2] == 6              # остаток
    assert row[4] == "Заморожен"    # is_frozen побеждает status="active"


def test_subscriptions_csv_active_not_frozen():
    s = _Subscription(client=_Client(), is_frozen=False, status="active")
    row = next(D._subscriptions_csv_rows([s], "en"))
    assert row[4] == "Active"


# ─── лимит на выгрузку ────────────────────────────────────────────────────

def test_export_over_limit_raises_413_before_touching_rows():
    original_limit = D.MAX_EXPORT_ROWS
    D.MAX_EXPORT_ROWS = 5
    try:
        db = _DB([6])  # count > лимита — единственный execute нужен до отказа
        try:
            _run(D.export_data(kind="clients", date_from=None, date_to=None, ctx=_ctx(), db=db))
            assert False, "должно было упасть"
        except HTTPException as e:
            assert e.status_code == 413
        assert db.committed is False
    finally:
        D.MAX_EXPORT_ROWS = original_limit


def test_export_estimate_returns_raw_count():
    db = _DB([412])
    out = _run(D.export_estimate(kind="finances", date_from=None, date_to=None, ctx=_ctx(), db=db))
    assert out.rows == 412


def test_run_settings_data_export():
    test_date_range_no_bounds_means_no_filter()
    test_date_range_upper_bound_is_exclusive_next_day()
    test_date_range_both_bounds_give_two_filters()
    test_clients_csv_counts_only_attended_and_successful_payments()
    test_clients_csv_status_label_falls_back_to_raw_when_unknown()
    test_schedule_csv_booked_includes_active_and_attended_not_cancelled()
    test_schedule_csv_missing_hall_is_blank_not_crash()
    test_finances_csv_client_and_account_optional()
    test_subscriptions_csv_frozen_overrides_status_label()
    test_subscriptions_csv_active_not_frozen()
    test_export_over_limit_raises_413_before_touching_rows()
    test_export_estimate_returns_raw_count()


if __name__ == "__main__":
    test_run_settings_data_export()
    print("ALL PASS")
