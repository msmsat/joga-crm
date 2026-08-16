"""Единый гейт доступа к записи по абонементу (CL-6, задача 6.1).
Образец фейковой сессии — tests/test_lesson_service_required.py.

Запуск из back/:  python -m tests.test_booking_access
"""
import asyncio
from datetime import date, datetime, timedelta

from fastapi import HTTPException

from services.booking_access import assert_can_book


class _Lesson:
    def __init__(self, service_id=1, status="confirmed", in_days=1):
        self.id = 1
        self.service_id = service_id
        self.status = status
        self.start_time = datetime.now() + timedelta(days=in_days)


class _Sub:
    def __init__(self, id, package_id=None, status="active", is_frozen=False,
                 used=0, total=10, expires_in=30):
        self.id = id
        self.package_id = package_id
        self.status = status
        self.is_frozen = is_frozen
        self.used_classes = used
        self.total_classes = total
        self.expires_at = date.today() + timedelta(days=expires_in)


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
    3) (только если п.1 не дал подходящей) select (expires_at, status) всех
       абонементов клиента с остатком — по ним выбирается текст ошибки
    """
    def __init__(self, seq):
        self._seq = list(seq)

    async def execute(self, _q):
        return _R(self._seq.pop(0))


def _run(db, lesson):
    return asyncio.run(assert_can_book(db, client_id=1, lesson=lesson))


# ─── Нет абонемента вовсе → 403 ──────────────────────────────────────────────
def test_no_subscription_403():
    db = _DB([[], []])  # subs=[] (пакетов не запросит), строк для текста ошибки тоже нет
    try:
        _run(db, _Lesson(service_id=1))
        raise AssertionError("ожидали 403")
    except HTTPException as e:
        assert e.status_code == 403


# ─── Абонемент есть, но пакет не подходит по service_id → 400 ───────────────
def test_wrong_service_400():
    sub = _Sub(id=1, package_id=10)
    pkg = _Package(id=10, service_ids=[2])  # подходит только под service_id=2
    db = _DB([[sub], [pkg], [(sub.expires_at, sub.status)]])
    try:
        _run(db, _Lesson(service_id=1))
        raise AssertionError("ожидали 400")
    except HTTPException as e:
        assert e.status_code == 400
        assert "не подходит" in e.detail


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
    db = _DB([[], []])
    try:
        _run(db, _Lesson(service_id=1))
        raise AssertionError("ожидали 403")
    except HTTPException as e:
        assert e.status_code == 403


# ─── Абонемент сгорает раньше занятия → записать нельзя ─────────────────────
def test_expires_before_lesson_400():
    sub = _Sub(id=1, expires_in=4)  # истекает 20-го
    db = _DB([[sub], [(sub.expires_at, sub.status)]])  # пакетов не запросит: package_id=None
    try:
        _run(db, _Lesson(service_id=1, in_days=9))  # занятие 25-го
        raise AssertionError("ожидали 400")
    except HTTPException as e:
        assert e.status_code == 400
        assert "истекает" in e.detail


# ─── В день истечения записать ещё можно (срок включительно) ────────────────
def test_expires_on_lesson_day_passes():
    sub = _Sub(id=1, expires_in=4)
    db = _DB([[sub]])
    assert _run(db, _Lesson(service_id=1, in_days=4)) is sub


# ─── Второй абонемент с более долгим сроком выручает ────────────────────────
def test_later_subscription_covers_lesson():
    short = _Sub(id=1, expires_in=4)   # до 20-го
    long_ = _Sub(id=2, expires_in=14)  # до 30-го
    db = _DB([[short, long_]])
    assert _run(db, _Lesson(service_id=1, in_days=9)) is long_


# ─── Очередь (pending) сроком не ограничена: он стартует с визита ───────────
def test_pending_ignores_expiry():
    pending = _Sub(id=1, status="pending", expires_in=4)
    db = _DB([[pending]])
    assert _run(db, _Lesson(service_id=1, in_days=9)) is pending


# ─── Отменённое занятие → 400, до похода за абонементом (эпик V4-7, задача 6) ──
def test_cancelled_lesson_400():
    db = _DB([])  # guard срабатывает раньше первого execute
    try:
        _run(db, _Lesson(service_id=1, status="cancelled"))
        raise AssertionError("ожидали 400")
    except HTTPException as e:
        assert e.status_code == 400
        assert "отменено" in e.detail


if __name__ == "__main__":
    test_no_subscription_403()
    test_wrong_service_400()
    test_universal_service_ids_passes()
    test_matching_service_ids_passes()
    test_legacy_no_package_id_passes()
    test_frozen_or_exhausted_excluded_403()
    test_expires_before_lesson_400()
    test_expires_on_lesson_day_passes()
    test_later_subscription_covers_lesson()
    test_pending_ignores_expiry()
    test_cancelled_lesson_400()
    print("ALL PASS — гейт доступа к записи CL-6.1 зелёные")
