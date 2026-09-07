"""Границу записи держит тест, а не обещание (P3).

Инвариант один:

    БИЗНЕС-СОСТОЯНИЕ БРОНИ МЕНЯЕТ ТОЛЬКО ДОМЕН (services/booking.py).

До консолидации бронь заводили четыре роутера, каждый со своим набором
проверок. Совпадали они по счастливому совпадению, и именно в расхождениях
жили боевые дефекты: подарок «первое занятие бесплатно» доставался или нет в
зависимости от того, какую кнопку нажал администратор; последнее занятие
абонемента списывалось дважды при двух одновременных запросах.

Собрать переходы в одном месте недостаточно — надо, чтобы пятый писатель не
появился незаметно. Поэтому здесь не «обзор кода», а проверка: новый прямой
`Reservation(...)` или `reservation.status = ...` вне домена роняет прогон.

СПИСОК ИСКЛЮЧЕНИЙ ЯВНЫЙ И КОРОТКИЙ. Это не «пока не дошли руки», а места, где
запись НЕ является бизнес-переходом: посещение (отдельный домен посещаемости),
демо-данные и сам домен. Каждое названо с причиной — молчаливого исключения
здесь быть не должно.

Запуск из back/:  python -m pytest tests/test_booking_boundary.py
"""
import ast
import os
import re

BACK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Где вообще ищем: боевой код. Тесты, миграции и сиды пишут строки напрямую по
# определению — они и есть подготовка данных, а не поведение продукта.
_ROOTS = ("routers", "services", "workers")

# Законные писатели — домен записи. Их два файла, и это не послабление:
# `subscription_charge` — денежная половина того же домена (списание и возврат
# занятия), и роутерам звать её напрямую запрещено отдельной проверкой ниже.
_DOMAIN = {
    os.path.join("services", "booking.py"),
    os.path.join("services", "subscription_charge.py"),
}

# Исключения — с причиной. Пустая причина не принимается: см. проверку ниже.
_ALLOWED: dict[str, str] = {
    os.path.join("services", "booking.py"):
        "сам домен — здесь переходы и живут",
    os.path.join("routers", "schedule", "reservations.py"):
        "отметка посещения (attended) — не запись и не отмена, а фиксация "
        "визита: она ничего не возвращает на абонемент и своих гонок не имеет",
    os.path.join("services", "scenario_runner.py"):
        "сценарии лояльности читают брони, а строки заводят только для "
        "сообщений — проверяется отсутствием мутаций ниже",
}

# Что считаем прямой записью в бизнес-состояние брони. Присваивание, а НЕ
# сравнение: `== "active"` — это чтение, и ловить его значит приучить всех
# обходить проверку исключениями вместо того, чтобы держать инвариант.
_STATUS = re.compile(r"\breservation\w*\.status\s*=(?!=)")
_SUBSCRIPTION = re.compile(r"\breservation\w*\.subscription_id\s*=(?!=)")
_CANCELLED_AT = re.compile(r"\breservation\w*\.cancelled_at\s*=(?!=)")


def _files() -> list[str]:
    found = []
    for root in _ROOTS:
        for base, _dirs, names in os.walk(os.path.join(BACK, root)):
            if "__pycache__" in base:
                continue
            found.extend(os.path.join(base, name) for name in names
                         if name.endswith(".py"))
    return found


def _relative(path: str) -> str:
    return os.path.relpath(path, BACK)


def test_only_the_domain_creates_reservations():
    """`Reservation(...)` — только в домене.

    Разбираем СИНТАКСИСОМ, а не поиском подстроки: `MiniappReservation(` и
    `ReservationCreate(` — это схемы ответа и запроса, они к таблице отношения
    не имеют, а наивный grep поймал бы их и приучил бы всех к исключениям.
    """
    offenders = []
    for path in _files():
        rel = _relative(path)
        if rel in _ALLOWED:
            continue
        with open(path, encoding="utf-8") as handle:
            tree = ast.parse(handle.read(), filename=path)
        for node in ast.walk(tree):
            if (isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
                    and node.func.id == "Reservation"):
                offenders.append(f"{rel}:{node.lineno}")
    assert not offenders, (
        "бронь заводят мимо домена (services/booking.create): " + ", ".join(offenders))


def test_only_the_domain_moves_reservation_state():
    """Статус, ссылка на абонемент и отметка отмены — только в домене."""
    offenders = []
    for path in _files():
        rel = _relative(path)
        with open(path, encoding="utf-8") as handle:
            lines = handle.read().splitlines()
        for number, line in enumerate(lines, start=1):
            if line.lstrip().startswith("#"):
                continue
            hit = (_STATUS.search(line) or _SUBSCRIPTION.search(line)
                   or _CANCELLED_AT.search(line))
            if not hit:
                continue
            if rel in _DOMAIN:
                continue
            # Единственное разрешённое исключение — отметка посещения.
            if rel in _ALLOWED and '"attended"' in line:
                continue
            offenders.append(f"{rel}:{number}: {line.strip()}")
    assert not offenders, (
        "бизнес-состояние брони меняют мимо домена:\n" + "\n".join(offenders))


def test_routers_do_not_charge_subscriptions_themselves():
    """Списание и возврат занятия абонемента зовёт домен, а не роутеры.

    Роутер, дёрнувший `charge_reservation` сам, обходит и замок на клиенте, и
    проверку покрытия — то есть ровно те две вещи, ради которых консолидация и
    делалась.
    """
    offenders = []
    for path in _files():
        rel = _relative(path)
        if not rel.startswith("routers"):
            continue
        with open(path, encoding="utf-8") as handle:
            source = handle.read()
        for name in ("charge_reservation", "refund_reservation", "open_debt",
                     "commit_reservation", "resolve_coverage"):
            if re.search(rf"\b{name}\s*\(", source):
                offenders.append(f"{rel}: {name}")
    assert not offenders, (
        "роутер сам двигает деньги и покрытие брони: " + ", ".join(offenders))


def test_every_exception_has_a_reason():
    """Исключение без объяснения — это забытый писатель, а не решение."""
    for path, reason in _ALLOWED.items():
        assert reason and len(reason) > 20, path
        assert os.path.exists(os.path.join(BACK, path)), path


if __name__ == "__main__":
    test_only_the_domain_creates_reservations()
    test_only_the_domain_moves_reservation_state()
    test_routers_do_not_charge_subscriptions_themselves()
    test_every_exception_has_a_reason()
    print("booking boundary ok")
