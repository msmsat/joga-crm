"""Read-only lesson earnings estimate using this studio's current staff terms.

This is not a SalaryPayment. Unpaid balances are included in the agreed price;
loyalty points reduce it, while deposits and certificates are payment methods.
Membership visits have no allocated sale value, so percentage earnings are unknown.
"""
from decimal import Decimal, ROUND_HALF_UP


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
            payment = client.get("payment")
            if client.get("by_subscription") or client.get("subscription_name"):
                return result
            if payment is not None:
                value = sum(Decimal(str(payment.get(key) or 0)) for key in
                            ("total", "deposit_applied", "certificate_applied"))
            else:
                value = Decimal(str(client.get("debt") or 0)) + Decimal(str(client.get("paid_amount") or 0))
            base += max(Decimal(0), value)
        result["base_amount"] = float(base)
        amount = base * Decimal(str(rate)) / 100
    result["amount"] = float(max(Decimal(0), amount).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
    return result
