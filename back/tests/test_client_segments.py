"""Категории клиентов: правила статуса и компиляция SQL-условий.

Тест намеренно без БД — проверяется чистая логика resolve_status и то, что
условия фильтров собираются в валидный SQL. Прогон: pytest back/tests/test_client_segments.py
"""

from datetime import date, datetime, timedelta
from types import SimpleNamespace

import pytest
from sqlalchemy.dialects import postgresql

from services.client_segments import (
    ACTIVE_WITHIN_DAYS,
    CATEGORY_KEYS,
    NEW_CLIENT_DAYS,
    STATUS_KEYS,
    VIP_MIN_SPENT,
    VIP_MIN_VISITS,
    SegmentRules,
    category_condition,
    resolve_status,
)

TODAY = date(2026, 8, 2)


def mk(*, status="new", registered_days_ago=100, last_visit_days_ago=None):
    """Клиент-заглушка: resolve_status читает только эти три поля."""
    return SimpleNamespace(
        status=status,
        registration_date=datetime.combine(TODAY - timedelta(days=registered_days_ago), datetime.min.time()),
        last_visit_date=None if last_visit_days_ago is None else TODAY - timedelta(days=last_visit_days_ago),
    )


def status_of(client, *, visits=0, spent=0):
    return resolve_status(client, visit_count=visits, total_spent=spent, today=TODAY)


# ─── «Новый» живёт ровно NEW_CLIENT_DAYS дней ─────────────────────────────────

def test_new_only_within_window():
    assert status_of(mk(registered_days_ago=0)) == "new"
    assert status_of(mk(registered_days_ago=NEW_CLIENT_DAYS)) == "new", "граница включительно"
    # На следующий день после окна — уже не новый; без визитов это «неактивный».
    assert status_of(mk(registered_days_ago=NEW_CLIENT_DAYS + 1)) == "inactive"


def test_new_client_who_visited_is_still_new():
    """Первые 15 дней «новый» важнее «активного» — иначе таб «Новые» пустеет."""
    assert status_of(mk(registered_days_ago=2, last_visit_days_ago=1)) == "new"


# ─── Активный / неактивный по последнему визиту ───────────────────────────────

def test_active_by_recent_visit():
    old = mk(registered_days_ago=200, last_visit_days_ago=ACTIVE_WITHIN_DAYS)
    assert status_of(old) == "active", "граница включительно"
    assert status_of(mk(registered_days_ago=200, last_visit_days_ago=ACTIVE_WITHIN_DAYS + 1)) == "inactive"


def test_never_visited_old_client_is_inactive():
    assert status_of(mk(registered_days_ago=365, last_visit_days_ago=None)) == "inactive"


# ─── VIP: порог по деньгам, по визитам и ручной пин ───────────────────────────

def test_vip_by_spend_and_visits():
    old = mk(registered_days_ago=200, last_visit_days_ago=1)
    assert status_of(old, spent=VIP_MIN_SPENT) == "vip"
    assert status_of(old, spent=VIP_MIN_SPENT - 1) == "active"
    assert status_of(old, visits=VIP_MIN_VISITS) == "vip"


def test_vip_pin_wins_over_thresholds():
    assert status_of(mk(status="vip", registered_days_ago=400)) == "vip"


def test_vip_outranks_new():
    assert status_of(mk(registered_days_ago=1), spent=VIP_MIN_SPENT) == "vip"


# ─── Заморозка — приоритет выше всего ─────────────────────────────────────────

def test_frozen_beats_everything():
    frozen = mk(status="frozen", registered_days_ago=1, last_visit_days_ago=0)
    assert status_of(frozen, spent=VIP_MIN_SPENT * 10) == "frozen"


def test_stale_column_values_do_not_pin():
    """'active'/'inactive'/'new' в колонке ничего не значат — правило считает заново."""
    assert status_of(mk(status="active", registered_days_ago=400)) == "inactive"
    assert status_of(mk(status="inactive", registered_days_ago=1)) == "new"


# ─── Правила студии переопределяют дефолты ────────────────────────────────────

def test_custom_rules_change_new_window():
    """Студия сузила «новизну» до 7 дней — клиент 10 дней от роду уже не новый."""
    rules = SegmentRules(new_client_days=7)
    c = mk(registered_days_ago=10)
    assert resolve_status(c, visit_count=0, total_spent=0, today=TODAY) == "new", "дефолт 15 дней"
    assert resolve_status(c, visit_count=0, total_spent=0, today=TODAY, rules=rules) == "inactive"


def test_custom_rules_change_active_window():
    rules = SegmentRules(active_within_days=7)
    c = mk(registered_days_ago=200, last_visit_days_ago=30)
    assert resolve_status(c, visit_count=0, total_spent=0, today=TODAY) == "active"
    assert resolve_status(c, visit_count=0, total_spent=0, today=TODAY, rules=rules) == "inactive"


def test_custom_rules_change_vip_thresholds():
    rules = SegmentRules(vip_min_spent=1_000, vip_min_visits=2)
    c = mk(registered_days_ago=200, last_visit_days_ago=1)
    assert resolve_status(c, visit_count=0, total_spent=1_000, today=TODAY) == "active"
    assert resolve_status(c, visit_count=0, total_spent=1_000, today=TODAY, rules=rules) == "vip"
    assert resolve_status(c, visit_count=2, total_spent=0, today=TODAY, rules=rules) == "vip"


def test_custom_rules_reach_sql():
    """Порог должен попасть в SQL, иначе счётчики табов разойдутся с бейджами."""
    sql = str(category_condition("new", TODAY, SegmentRules(new_client_days=3))
              .compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}))
    assert "2026-07-30" in sql, f"ожидали дату TODAY-3 в SQL: {sql[:200]}"


# ─── SQL-условия собираются ───────────────────────────────────────────────────

@pytest.mark.parametrize("key", CATEGORY_KEYS)
def test_category_condition_compiles(key):
    cond = category_condition(key, TODAY)
    if key == "all":
        assert cond is None
        return
    sql = str(cond.compile(dialect=postgresql.dialect()))
    assert sql


def test_status_keys_are_mutually_exclusive_by_construction():
    """Каждый статус исключает более приоритетные — иначе счётчики табов задвоятся.

    Заморозку SQLAlchemy схлопывает в `status != 'frozen'`, VIP остаётся `NOT (...)`.
    """
    for key in STATUS_KEYS:
        sql = str(category_condition(key, TODAY).compile(dialect=postgresql.dialect()))
        if key == "frozen":
            continue
        assert "clients.status !=" in sql, f"{key} не исключает frozen"
        if key != "vip":
            assert "NOT (" in sql, f"{key} не исключает vip"
