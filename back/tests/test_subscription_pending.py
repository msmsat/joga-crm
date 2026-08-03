"""Отложенный старт абонемента из очереди: срок начинается с реального визита.

Фейковая сессия — образец tests/test_subscription_charge.py, БД не трогаем.
Запуск из back/:  python -m pytest tests/test_subscription_pending.py
"""
import asyncio
from datetime import date, timedelta

from services.subscription_charge import (
    activate_pending_after_visit, charge_reservation, refund_reservation,
)

TODAY = date.today()


class _Sub:
    def __init__(self, id=1, used=0, total=8, status="active", duration=30):
        self.id = id
        self.used_classes = used
        self.total_classes = total
        self.status = status
        self.package_id = None
        self.duration_days = duration
        self.starts_at = None
        # Провизорная дата, выставленная при покупке: активация её пересчитает.
        self.expires_at = TODAY + timedelta(days=duration)


class _Res:
    def __init__(self, subscription_id=None):
        self.client_id = 1
        self.subscription_id = subscription_id


class _DB:
    def __init__(self, subs=()):
        self._subs = {s.id: s for s in subs}

    async def get(self, _model, pk):
        return self._subs.get(pk)


def _run(coro):
    return asyncio.run(coro)


# ─── Списание с очереди не закрывает её и не двигает срок ─────────────────────

def test_charging_pending_does_not_finish_it():
    """Иначе возврат при отмене поднял бы ждущий абонемент в active с чужим сроком."""
    pending = _Sub(status="pending", used=7, total=8)
    res = _Res()
    _run(charge_reservation(_DB([pending]), 1, res, pending))

    assert pending.used_classes == 8
    assert pending.status == "pending", "очередь не закрываем до визита"
    assert pending.starts_at is None


def test_charging_pending_keeps_provisional_expiry():
    pending = _Sub(status="pending", duration=30)
    before = pending.expires_at
    _run(charge_reservation(_DB([pending]), 1, _Res(), pending))
    assert pending.expires_at == before, "запись срок не двигает"
    assert pending.starts_at is None


# ─── Визит запускает срок ─────────────────────────────────────────────────────

def test_visit_activates_pending():
    pending = _Sub(status="pending", used=0, total=8, duration=30)
    res = _Res()
    db = _DB([pending])
    _run(charge_reservation(db, 1, res, pending))

    assert _run(activate_pending_after_visit(db, res)) is True
    assert pending.status == "active"
    assert pending.starts_at == TODAY
    assert pending.expires_at == TODAY + timedelta(days=30), "срок отсчитывается от визита"


def test_visit_on_single_class_closes_it():
    """«Разовое» — это абонемент на одно занятие: визит его сразу и закрывает."""
    single = _Sub(status="pending", used=0, total=1, duration=30)
    res = _Res()
    db = _DB([single])
    _run(charge_reservation(db, 1, res, single))

    assert _run(activate_pending_after_visit(db, res)) is True
    assert single.status == "finished"
    assert single.starts_at == TODAY


def test_activation_is_idempotent():
    pending = _Sub(status="pending", total=8, duration=30)
    res = _Res()
    db = _DB([pending])
    _run(charge_reservation(db, 1, res, pending))
    _run(activate_pending_after_visit(db, res))
    started = pending.expires_at

    assert _run(activate_pending_after_visit(db, res)) is False, "повторная отметка ничего не двигает"
    assert pending.expires_at == started


def test_visit_does_not_touch_already_active():
    active = _Sub(status="active", total=8, duration=30)
    active.starts_at = TODAY - timedelta(days=10)
    active.expires_at = TODAY + timedelta(days=20)
    res = _Res()
    db = _DB([active])
    _run(charge_reservation(db, 1, res, active))
    before = active.expires_at

    assert _run(activate_pending_after_visit(db, res)) is False
    assert active.expires_at == before, "идущему абонементу визит срок не продлевает"


def test_visit_without_subscription_is_noop():
    """Разовая оплата мимо абонемента — активировать нечего."""
    assert _run(activate_pending_after_visit(_DB(), _Res())) is False


# ─── Записался и не пришёл: отмена возвращает занятие, срок так и не начался ──

def test_cancel_before_visit_keeps_pending_untouched():
    pending = _Sub(status="pending", used=0, total=8, duration=30)
    res = _Res()
    db = _DB([pending])
    _run(charge_reservation(db, 1, res, pending))
    _run(refund_reservation(db, res))

    assert pending.used_classes == 0
    assert pending.status == "pending", "не пришёл — абонемент всё ещё ждёт"
    assert pending.starts_at is None
    assert res.subscription_id is None


def test_cancel_last_class_of_pending_does_not_activate():
    pending = _Sub(status="pending", used=7, total=8, duration=30)
    res = _Res()
    db = _DB([pending])
    _run(charge_reservation(db, 1, res, pending))
    _run(refund_reservation(db, res))

    assert pending.used_classes == 7
    assert pending.status == "pending"


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_"):
            fn()
    print("ALL PASS")
