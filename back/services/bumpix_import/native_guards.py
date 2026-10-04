"""Preserve native booking decisions; imports never perform refunds or charges."""
from .matching import native_field

BOOKING_FIELDS = ('start_time', 'duration_min', 'teacher_id', 'tz_iana', 'status', 'service_id', 'price')


def has_financial_state(reservation):
    return (reservation.debt_payment_id is not None or reservation.subscription_id is not None
            or reservation.payment_breakdown is not None or reservation.auto_paid
            or reservation.held_codes is not None)


def check_booking_change(lesson, reservation, proposed):
    changed = any(field in proposed and native_field(getattr(lesson, field)) != proposed[field] for field in BOOKING_FIELDS)
    if reservation and proposed.get('status') == 'cancelled' and reservation.status != 'cancelled':
        changed = True
    if not reservation or not changed:
        return
    if has_financial_state(reservation):
        raise ValueError('Source change affects a financial CRM booking; resolve through normal CRM booking/payment actions')
    if reservation.status == 'attended' or reservation.no_show or reservation.booking_channel not in ('import', 'bumpix'):
        raise ValueError('Source change affects a manually managed CRM booking; resolve explicitly')


def check_retirement(lesson, reservation, managed):
    check_booking_change(lesson, reservation, {'status': 'cancelled'})
    for field in ('start_time', 'duration_min', 'teacher_id', 'tz_iana', 'status'):
        if field in managed and native_field(getattr(lesson, field)) != managed[field]:
            raise ValueError('Source removed an appointment edited in CRM; resolve explicitly')
