"""Read-only lesson earnings estimate using this studio's current staff terms.

This is not a SalaryPayment. Unpaid balances are included in the agreed price;
loyalty points reduce it, while deposits and certificates are payment methods.
Membership visits have no allocated sale value, so percentage earnings are unknown.

Сколько принесла бронь (`paid_value`) — одно правило на три места: оценку в
карточке занятия, итог мастера записи («Анастасия получит») и расчёт зарплаты
(routers/finances/salary.py). Процент мастера считается от того, что клиент
заплатил или должен, — то есть уже СО скидкой, а не от цены в прайсе.
"""
from decimal import Decimal, ROUND_HALF_UP


def paid_value(client: dict) -> Decimal | None:
    """Сколько денег приносит бронь: чек оплаты (с депозитом и сертификатом —
    это способы оплаты, а не скидки) либо долг и уже заплаченное по нему.
    None — денег за бронь не числится (абонемент, подарок, запись без учёта
    оплаты): что это значит, решает вызывающий."""
    payment = client.get("payment")
    if payment is not None:
        return sum(Decimal(str(payment.get(key) or 0)) for key in
                   ("total", "deposit_applied", "certificate_applied"))
    owed = Decimal(str(client.get("debt") or 0)) + Decimal(str(client.get("paid_amount") or 0))
    return owed if owed else None


def by_subscription(client: dict) -> bool:
    return bool(client.get("by_subscription") or client.get("subscription_name"))


def calculate_compensation(member, lesson, clients) -> dict:
    result = {"kind": "unconfigured", "amount": None, "base_amount": None,
              "rate": None, "duration_min": lesson.duration_min}
    if member is None:
        return result
    # The staff creation form stores its number in salary; the editor uses rate.
    configured_rate = member.rate if member.rate is not None else member.salary
    if member.role == "owner":
        kind, rate = "owner", 100
    elif member.rate_type == "fixed" and (member.rate is not None or member.salary is not None):
        return {**result, "kind": "salary"}
    elif member.rate_type in ("percent", "hourly") and configured_rate is not None:
        kind, rate = member.rate_type, configured_rate
    elif member.rate_type is None and member.salary is not None:
        return {**result, "kind": "salary"}
    else:
        return result
    result.update(kind=kind, rate=rate)
    if lesson.status == "cancelled":
        return {**result, "amount": 0, "base_amount": 0}
    if kind == "hourly":
        amount = Decimal(str(rate)) * Decimal(str(lesson.duration_min)) / 60
    else:
        base = Decimal(0)
        for client in clients:
            if by_subscription(client):
                return result
            base += max(Decimal(0), paid_value(client) or Decimal(0))
        result["base_amount"] = float(base)
        amount = base * Decimal(str(rate)) / 100
    result["amount"] = float(max(Decimal(0), amount).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
    return result


def is_individual(lesson) -> bool:
    """Занятие одного клиента: индивидуальная запись (resource) или событие на
    одно место. Его выручка — то, что заплатил этот клиент; у группового
    расчёт зарплаты по-прежнему берёт цену занятия."""
    return lesson.booking_mode == "resource" or lesson.total_spots == 1


def lesson_revenue(price: int, clients: list[dict]) -> Decimal:
    """Выручка индивидуального занятия для зарплаты мастера.

    Сумма того, что принесли брони, — со скидками. Подарок (бесплатное первое
    занятие) не принёс ничего. Если хоть у одной брони денег не числится —
    абонемент (его цена на визит не разнесена) или запись без учёта оплаты, —
    берётся цена занятия, как считалась зарплата до этого правила.
    """
    total = Decimal(0)
    for client in clients:
        value = paid_value(client)
        if value is None:
            if by_subscription(client) or not client.get("is_trial"):
                return Decimal(price or 0)
            value = Decimal(0)
        total += max(Decimal(0), value)
    return total if clients else Decimal(price or 0)
