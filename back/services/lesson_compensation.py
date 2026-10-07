"""Read-only lesson earnings estimate using this studio's current staff terms.

This is not a SalaryPayment. A percentage is taken from what the client PAID
for this lesson, not from the price list: after a 50 % discount the master gets
a share of the half. Every live booking lands in exactly one bucket:

  paid       money went through: the cashier receipt (total plus deposit and
             certificate — those are payment methods, while loyalty points lower
             the amount) or a settled debt; for a membership visit, its share of
             what the membership sold for;
  due        an open debt — already net of this booking's discounts;
  estimated  nothing about payment is recorded (a past system import, a booking
             older than debts, a membership without a found sale): the booking
             price minus the discount promised to this booking;
  —          a no-show without payment or a 100 % gift adds nothing.

A membership visit whose value cannot be determined at all is counted in
`unknown_count` instead of pretending to be zero.
"""
from dataclasses import dataclass
from datetime import timedelta
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import select

from models import ClientPayment, ClientSubscription, Reservation, SubscriptionPackage

_CENT = Decimal("0.01")

# A membership and its sale row are written by one transaction
# (routers/clients/subscriptions.attach_subscription), so their timestamps
# coincide; the window only absorbs clock rounding.
_SALE_WINDOW = timedelta(minutes=10)


@dataclass(frozen=True)
class VisitValue:
    """What one membership visit is worth and whether that money was received."""
    amount: Decimal
    paid: bool


def _money(value) -> Decimal:
    return Decimal(str(value or 0))


def _cents(value: Decimal) -> float:
    return float(value.quantize(_CENT, rounding=ROUND_HALF_UP))


def booking_price(client, price) -> Decimal:
    """Price agreed for this booking when no money record exists: the lesson
    price minus the first-lesson or manual discount kept on the booking. The
    best discount wins, as at the cashier (no stacking)."""
    price = max(0, int(price or 0))
    off = 0
    if client.get("is_trial"):
        amount = client.get("trial_discount_amount")
        off = (min(int(amount), price) if amount is not None
               else price * int(client.get("trial_discount_percent") or 100) // 100)
    manual = int(client.get("manual_discount_percent") or 0)
    off = max(off, price * manual // 100)
    return Decimal(price - min(off, price))


def portions(client, price, visit_values=None) -> dict[str, Decimal]:
    """Where this booking's money stands, {bucket: amount} — see the module
    docstring. An empty dict adds nothing; "unknown" marks a membership visit
    of unknown value."""
    payment = client.get("payment")
    if payment is not None:
        value = sum(_money(payment.get(key)) for key in ("total", "deposit_applied", "certificate_applied"))
        return {"paid": max(Decimal(0), value)}
    paid, debt = _money(client.get("paid_amount")), _money(client.get("debt"))
    if client.get("no_show"):
        # No visit: only money already received counts, an open debt does not.
        return {"paid": paid} if paid > 0 else {}
    if paid > 0 or debt > 0:
        return {"paid": paid, "due": debt}
    if client.get("by_subscription") or client.get("subscription_name"):
        visit = (visit_values or {}).get(client.get("reservation_id"))
        if visit is None:
            return {"unknown": Decimal(0)}
        return {"paid" if visit.paid else "estimated": visit.amount}
    return {"estimated": booking_price(client, price)}


def calculate_compensation(member, lesson, clients, visit_values=None) -> dict:
    result = {"kind": "unconfigured", "amount": None, "base_amount": None,
              "rate": None, "duration_min": lesson.duration_min,
              "paid_base": None, "due_base": None, "estimated_base": None,
              "paid_amount": None, "unknown_count": 0}
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
        return {**result, "amount": 0, "base_amount": 0, "paid_base": 0, "due_base": 0,
                "estimated_base": 0, "paid_amount": 0}
    rate_value = _money(rate)
    if kind == "hourly":
        amount = rate_value * Decimal(str(lesson.duration_min)) / 60
        return {**result, "amount": _cents(max(Decimal(0), amount))}

    def share(value: Decimal) -> float:
        return _cents(max(Decimal(0), value * rate_value / 100))

    buckets = {"paid": Decimal(0), "due": Decimal(0), "estimated": Decimal(0), "unknown": Decimal(0)}
    unknown = 0
    for client in clients:
        parts = portions(client, getattr(lesson, "price", 0), visit_values)
        unknown += "unknown" in parts
        for bucket, value in parts.items():
            buckets[bucket] += max(Decimal(0), value)
    result["unknown_count"] = unknown
    if unknown and unknown == len(clients):
        # Only memberships of unknown value: no number beats a made-up zero.
        return result
    base = buckets["paid"] + buckets["due"] + buckets["estimated"]
    return {**result, "base_amount": _cents(base), "paid_base": _cents(buckets["paid"]),
            "due_base": _cents(buckets["due"]), "estimated_base": _cents(buckets["estimated"]),
            "amount": share(base), "paid_amount": share(buckets["paid"])}


def visit_value(total_classes, created_at, client_id, package_id, list_price, sales) -> VisitValue | None:
    """One visit of a membership: its sale price over its classes. The sale is
    the membership payment of the same client and package written with it; a
    membership given without a recorded sale is valued at its package price,
    which is an estimate, not money received."""
    if not total_classes or total_classes <= 0:
        return None
    sale = None
    if package_id is not None and created_at is not None:
        matches = [s for s in sales if s.client_id == client_id and s.item_key == str(package_id)
                   and s.created_at is not None and abs(s.created_at - created_at) <= _SALE_WINDOW]
        sale = min(matches, key=lambda s: abs(s.created_at - created_at), default=None)
    if sale is not None:
        return VisitValue(_money(sale.amount) / total_classes, True)
    if list_price is not None:
        return VisitValue(_money(list_price) / total_classes, False)
    return None


async def membership_visit_values(db, reservation_ids) -> dict[int, VisitValue]:
    """Visit values for the membership bookings among `reservation_ids` —
    two queries for the whole lesson, not one per client."""
    if not reservation_ids:
        return {}
    rows = (await db.execute(
        select(Reservation.id, ClientSubscription.client_id, ClientSubscription.package_id,
               ClientSubscription.total_classes, ClientSubscription.created_at,
               SubscriptionPackage.price.label("list_price"))
        .join(ClientSubscription, ClientSubscription.id == Reservation.subscription_id)
        .outerjoin(SubscriptionPackage, SubscriptionPackage.id == ClientSubscription.package_id)
        .where(Reservation.id.in_(reservation_ids))
    )).all()
    keyed = [r for r in rows if r.package_id is not None]
    sales = []
    if keyed:
        sales = (await db.execute(
            select(ClientPayment.client_id, ClientPayment.item_key, ClientPayment.amount, ClientPayment.created_at)
            .where(ClientPayment.action_type == "subscription", ClientPayment.status == "success",
                   ClientPayment.client_id.in_({r.client_id for r in keyed}),
                   ClientPayment.item_key.in_({str(r.package_id) for r in keyed}))
        )).all()
    values = {}
    for r in rows:
        value = visit_value(r.total_classes, r.created_at, r.client_id, r.package_id, r.list_price, sales)
        if value is not None:
            values[r.id] = value
    return values


def paid_value(client: dict) -> Decimal | None:
    """Money a booking brings: the payment receipt (deposit and certificate are
    payment methods, not discounts) or the debt plus what was paid on it.
    None means no money is recorded for the booking."""
    payment = client.get("payment")
    if payment is not None:
        return sum(_money(payment.get(key)) for key in
                   ("total", "deposit_applied", "certificate_applied"))
    owed = _money(client.get("debt")) + _money(client.get("paid_amount"))
    return owed if owed else None


def by_subscription(client: dict) -> bool:
    return bool(client.get("by_subscription") or client.get("subscription_name"))


def is_individual(lesson) -> bool:
    """One-client lesson: a resource booking or an event with one spot."""
    return lesson.booking_mode == "resource" or lesson.total_spots == 1


def lesson_revenue(price: int, clients: list[dict]) -> Decimal:
    """Revenue of an individual lesson for the master's salary, after discounts.
    A free first lesson brings 0; if any booking has no money recorded
    (membership or untracked), the lesson price is used as before."""
    total = Decimal(0)
    for client in clients:
        value = paid_value(client)
        if value is None:
            if by_subscription(client) or not client.get("is_trial"):
                return Decimal(price or 0)
            value = Decimal(0)
        total += max(Decimal(0), value)
    return total if clients else Decimal(price or 0)
