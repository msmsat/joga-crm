"""Единый гейт доступа к записи по абонементу (CL-6, задача 6.1).
Образец фейковой сессии — tests/test_lesson_service_required.py.

Запуск из back/:  python -m tests.test_booking_access
"""
import asyncio
from datetime import date, timedelta

from fastapi import HTTPException

from services.booking_access import assert_can_book


class _Lesson:
    def __init__(self, service_id=1):
        self.id = 1
        self.service_id = service_id


class _Sub:
    def __init__(self, id, package_id=None, status="active", is_frozen=False,
                 used=0, total=10):
        self.id = id
        self.package_id = package_id
        self.status = status
        self.is_frozen = is_frozen
        self.used_classes = used
        self.total_classes = total
        self.expires_at = date.today() + timedelta(days=30)


class _Package:
    def __init__(self, id, service_ids=None):
        self.id = id
        self.service_ids = service_ids


class _R:
    def __init__(self, v):
        self._v = v

    def scalar_one_or_none(self):
        return self._v

    def scalars(self):
        return self

    def all(self):
        return self._v if isinstance(self._v, list) else [self._v]


class _DB:
    """Заготовка отвечает на execute() в порядке вызовов внутри booking_access:
    1) select активных подходящих-по-остатку подписок клиента
    2) select пакетов по package_id (если есть непустые package_id)
    3) (только если п.1 не дал подходящей) select "есть ли вообще активный абонемент"
    """
    def __init__(self, seq):
        self._seq = list(seq)

    async def execute(self, _q):
        return _R(self._seq.pop(0))


def _run(db, lesson):
    return asyncio.run(assert_can_book(db, client_id=1, lesson=lesson))


# ─── Нет абонемента вовсе → 403 ──────────────────────────────────────────────
def test_no_subscription_403():
    db = _DB([[], None])  # subs=[] (пакетов не запросит), has_any=None
    try:
        _run(db, _Lesson(service_id=1))
        raise AssertionError("ожидали 403")
    except HTTPException as e:
        assert e.status_code == 403


# ─── Абонемент есть, но пакет не подходит по service_id → 400 ───────────────
def test_wrong_service_400():
    sub = _Sub(id=1, package_id=10)
    pkg = _Package(id=10, service_ids=[2])  # подходит только под service_id=2
    db = _DB([[sub], [pkg], sub.id])  # subs, packages, has_any(=sub.id, не None)
    try:
        _run(db, _Lesson(service_id=1))
        raise AssertionError("ожидали 400")
    except HTTPException as e:
        assert e.status_code == 400


# ─── Универсальный абонемент (service_ids=null) → проходит на любое занятие ──
def test_universal_service_ids_passes():
    sub = _Sub(id=1, package_id=10)
    pkg = _Package(id=10, service_ids=None)
    db = _DB([[sub], [pkg]])
    result = _run(db, _Lesson(service_id=1))
    assert result is sub


# ─── Подходящий service_ids → проходит ───────────────────────────────────────
def test_matching_service_ids_passes():
    sub = _Sub(id=1, package_id=10)
    pkg = _Package(id=10, service_ids=[1, 2])
    db = _DB([[sub], [pkg]])
    result = _run(db, _Lesson(service_id=1))
    assert result is sub


# ─── Старый абонемент без package_id (до V5-4) → считается универсальным ────
def test_legacy_no_package_id_passes():
    sub = _Sub(id=1, package_id=None)
    db = _DB([[sub]])  # package_ids пуст → запроса пакетов не будет
    result = _run(db, _Lesson(service_id=1))
    assert result is sub


# ─── Замороженный/исчерпанный абонемент не попадает в выборку → 403 ─────────
def test_frozen_or_exhausted_excluded_403():
    # Модель фильтрует is_frozen/used<total на уровне SQL — фейковая БД
    # просто не вернёт такую подписку в первом запросе.
    db = _DB([[], None])
    try:
        _run(db, _Lesson(service_id=1))
        raise AssertionError("ожидали 403")
    except HTTPException as e:
        assert e.status_code == 403


if __name__ == "__main__":
    test_no_subscription_403()
    test_wrong_service_400()
    test_universal_service_ids_passes()
    test_matching_service_ids_passes()
    test_legacy_no_package_id_passes()
    test_frozen_or_exhausted_excluded_403()
    print("ALL PASS — гейт доступа к записи CL-6.1 зелёные")
