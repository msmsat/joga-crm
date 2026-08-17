"""Статусы брони, которые пишет код, обязаны проходить CHECK в БД.

Настройка «Подтверждение тренером» писала status='pending', которого не было в
check_reservation_status с самой инициализации базы: и запись из мини-приложения,
и публичный виджет падали IntegrityError, как только студия включала тумблер.
Обычные тесты этого не видят — они ходят в фейковую сессию, где CHECK не живёт,
поэтому проверяем не поведение, а согласованность модели с кодом записи.

Запуск из back/:  python -m tests.test_reservation_status_constraint
"""
import ast
import re
from pathlib import Path

from models.schedule import Reservation

_BACK = Path(__file__).resolve().parent.parent

# Все места, которые создают бронь или меняют её статус.
_SITES = (
    "routers/booking/miniapp_lessons.py",
    "routers/booking/public.py",
    "routers/schedule/reservations.py",
)


def _allowed() -> set[str]:
    """Статусы из CheckConstraint модели — источник правды для миграции."""
    for arg in Reservation.__table_args__:
        text = str(getattr(arg, "sqltext", ""))
        if "status" in text:
            return set(re.findall(r"'(\w+)'", text))
    raise AssertionError("check_reservation_status пропал из модели")


def _written() -> set[str]:
    """Строковые литералы, которые код кладёт в Reservation.status.

    Через ast, а не регуляркой: `status="pending" if ... else "active"` — обе
    ветки, и никаких ложных срабатываний на статусы клиента и платежа рядом.
    """
    found: set[str] = set()
    for rel in _SITES:
        tree = ast.parse((_BACK / rel).read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            expr = None
            if isinstance(node, ast.Call) and getattr(node.func, "id", "") == "Reservation":
                expr = next((kw.value for kw in node.keywords if kw.arg == "status"), None)
            elif isinstance(node, ast.Assign) and any(
                isinstance(t, ast.Attribute) and t.attr == "status"
                and getattr(t.value, "id", "") == "reservation"
                for t in node.targets
            ):
                expr = node.value
            if expr is not None:
                found |= {
                    n.value for n in ast.walk(expr)
                    if isinstance(n, ast.Constant) and isinstance(n.value, str)
                }
    return found


def test_every_written_status_passes_db_check():
    written, allowed = _written(), _allowed()
    assert written, "не нашли ни одной записи статуса — сломался разбор"
    assert written <= allowed, f"БД отвергнет: {written - allowed}"


def test_pending_is_allowed():
    # Отдельно и явно: именно его не хватало, и именно на нём стоит вся
    # настройка «Подтверждение тренером».
    assert "pending" in _allowed()


if __name__ == "__main__":
    test_every_written_status_passes_db_check()
    test_pending_is_allowed()
    print("ALL PASS — статусы брони согласованы с CHECK в БД")
