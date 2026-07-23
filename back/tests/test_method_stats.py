"""GET /finances/operations/method-stats группирует суммы по методу, только type='in' (задача FN-3.3).

Запуск из back/:  python -m tests.test_method_stats
"""
import asyncio
from dataclasses import dataclass

import routers.finances.operations as O


@dataclass
class _Ctx:
    studio_id: int = 7


class _R:
    def __init__(self, v):
        self._v = v

    def all(self):
        return self._v


class _DB:
    def __init__(self, rows):
        self._rows = rows

    async def execute(self, _q):
        return _R(self._rows)


def test_groups_by_method_and_keeps_empty_as_unspecified():
    rows = [("card", 15000, 3), ("", 4000, 2), ("cash", 9000, 1)]
    db = _DB(rows)
    result = asyncio.run(O.get_method_stats(None, None, _Ctx(), db))

    by_method = {r.method: (r.amount, r.count) for r in result}
    assert by_method["card"] == (15000, 3)
    assert by_method[""] == (4000, 2)
    assert by_method["cash"] == (9000, 1)


def test_none_method_from_db_becomes_empty_string():
    db = _DB([(None, 500, 1)])
    result = asyncio.run(O.get_method_stats(None, None, _Ctx(), db))

    assert result[0].method == ""
    assert result[0].amount == 500


if __name__ == "__main__":
    test_groups_by_method_and_keeps_empty_as_unspecified()
    test_none_method_from_db_becomes_empty_string()
    print("ALL PASS")
