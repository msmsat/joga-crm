"""Списание/возврат занятия абонемента при записи и отмене.
Фейковая сессия — образец tests/test_booking_access.py, БД не трогаем.

Запуск из back/:  python -m tests.test_subscription_charge
"""
import asyncio

from services.subscription_charge import charge_reservation, refund_reservation


class _Sub:
    def __init__(self, id=1, used=0, total=8, status="active", package_id=None):
        self.id = id
        self.used_classes = used
        self.total_classes = total
        self.status = status
        self.package_id = package_id


class _Res:
    def __init__(self, subscription_id=None):
        self.client_id = 1
        self.subscription_id = subscription_id


class _DB:
    """get() отдаёт абонемент по id — больше charge/refund от сессии ничего не
    нужно, пока абонемент не кончился (тогда включается _try_auto_renew, у него
    свой тест)."""
    def __init__(self, subs=()):
        self._subs = {s.id: s for s in subs}

    async def get(self, _model, pk):
        return self._subs.get(pk)


def _run(coro):
    return asyncio.run(coro)


# ─── Запись → −1 занятие и привязка к абонементу ─────────────────────────────
sub = _Sub(used=3, total=8)
res = _Res()
remaining = _run(charge_reservation(_DB([sub]), 1, res, sub))
assert sub.used_classes == 4, sub.used_classes
assert remaining == 4, remaining
assert res.subscription_id == sub.id

# ─── Повторное списание той же записи не проходит ────────────────────────────
assert _run(charge_reservation(_DB([sub]), 1, res, sub)) is None
assert sub.used_classes == 4

# ─── Отмена → +1 назад ровно на тот же абонемент, ссылка снята ───────────────
_run(refund_reservation(_DB([sub]), res))
assert sub.used_classes == 3, sub.used_classes
assert res.subscription_id is None

# ─── Повторный возврат — no-op (двойного +1 нет) ─────────────────────────────
_run(refund_reservation(_DB([sub]), res))
assert sub.used_classes == 3

# ─── Записи без абонемента (разовая) списывать нечего, возвращать тоже ───────
res_paid = _Res()
assert _run(charge_reservation(_DB(), 1, res_paid, None)) is None
_run(refund_reservation(_DB(), res_paid))
assert res_paid.subscription_id is None

# ─── Возврат оживляет закончившийся абонемент ────────────────────────────────
finished = _Sub(id=2, used=8, total=8, status="finished")
res_last = _Res(subscription_id=2)
_run(refund_reservation(_DB([finished]), res_last))
assert finished.used_classes == 7 and finished.status == "active"

# ─── Абонемент удалили, пока запись жила → возврат не падает ─────────────────
res_orphan = _Res(subscription_id=99)
_run(refund_reservation(_DB(), res_orphan))
assert res_orphan.subscription_id is None


def test_subscription_charge():
    """Проверки выполняются на импорте модуля — pytest собирает их этим кейсом."""
    assert True


if __name__ == "__main__":
    print("ALL PASS - subscription charge/refund")
