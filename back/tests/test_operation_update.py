"""PATCH /finances/operations/{id} пересчитывает баланс затронутых счетов (задача FN-2.3).

Запуск из back/:  python -m tests.test_operation_update
"""
import asyncio
from dataclasses import dataclass
from datetime import date

import routers.finances.operations as O


@dataclass
class _Ctx:
    studio_id: int = 7


class _Account:
    def __init__(self, id, balance):
        self.id = id
        self.balance = balance


class _Operation:
    def __init__(self, id=1, type="in", amount=100, account_id=1):
        self.id = id
        self.studio_id = 7
        self.type = type
        self.amount = amount
        self.account_id = account_id
        self.title = "т"
        self.op_date = date(2026, 1, 1)
        self.category = ""
        self.method = ""
        self.client_id = None
        self.counterparty_id = None
        self.trainer_id = None
        self.status = "completed"


class _R:
    def __init__(self, v):
        self._v = v

    def scalar_one_or_none(self):
        return self._v


class _DB:
    """execute() отдаёт значения из seq по порядку вызовов; commit/refresh — no-op."""
    def __init__(self, seq):
        self._seq = list(seq)

    async def commit(self):
        pass

    async def refresh(self, _x):
        pass

    async def execute(self, _q):
        return _R(self._seq.pop(0))


def test_amount_change_moves_balance_by_delta():
    op = _Operation(amount=100, account_id=1)
    account = _Account(id=1, balance=1000)
    # execute(): op lookup -> old_account lookup -> target_account lookup (account_id не менялся)
    db = _DB([op, account, account])
    body = O.OperationUpdate(amount=300)
    asyncio.run(O.update_operation(1, body, _Ctx(), db))

    assert account.balance == 1200  # -100 +300 = +200 к исходным 1000
    assert op.amount == 300


def test_transfer_between_accounts_moves_both():
    op = _Operation(amount=100, account_id=1)
    acc_old = _Account(id=1, balance=1000)
    acc_new = _Account(id=2, balance=500)
    # execute(): op lookup -> new_account lookup (account_id меняется) -> old_account lookup
    db = _DB([op, acc_new, acc_old])
    body = O.OperationUpdate(account_id=2)
    asyncio.run(O.update_operation(1, body, _Ctx(), db))

    assert acc_old.balance == 900   # −100 снято
    assert acc_new.balance == 600   # +100 добавлено
    assert op.account_id == 2


def test_no_account_no_balance_touch():
    op = _Operation(amount=100, account_id=None)
    db = _DB([op])  # только op lookup, счета не запрашиваются
    body = O.OperationUpdate(title="новое имя")
    result = asyncio.run(O.update_operation(1, body, _Ctx(), db))

    assert op.title == "новое имя"
    assert result.amount == 100


if __name__ == "__main__":
    test_amount_change_moves_balance_by_delta()
    test_transfer_between_accounts_moves_both()
    test_no_account_no_balance_touch()
    print("ALL PASS")
