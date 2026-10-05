"""Owner-confirmed historical cash receipts, atomic with their source event.

This is a migration of past facts, not a new sale: no current discounts,
platform fees, bonus awards, referral triggers or client notifications.
The journal link holds permanent receipt IDs, even if a receipt is deleted.
"""
from collections import Counter
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from zoneinfo import ZoneInfo
from sqlalchemy import select, update
from models import Account, ClientPayment, ClientLoyaltyCard, Lesson, Operation, Reservation
from models.bumpix import BumpixEvent, BumpixJournalLink
from .native_planning import appointment_values
from .validation import event_times
from .matching import native_field

ACCOUNT_NAME = 'Історична готівка'
BASIS = 'owner_confirmed_completed_cash'


def past_completed(source, timezone_name):
    _, end = event_times(source['view'])
    ended_at = end.replace(tzinfo=ZoneInfo(timezone_name)).astimezone(timezone.utc)
    return source['view']['status'] == 'completed' and ended_at <= datetime.now(timezone.utc), ended_at


async def receipt_state(db, source, options, link=None, lesson=None, reservation=None):
    eligible, ended_at = past_completed(source, options['timezone'])
    start, _ = event_times(source['view'])
    amount = appointment_values(source, source['view']['master_id'], options['timezone'])['price']
    result = {'action': 'ineligible', 'amount': amount, 'ended_at': ended_at}
    receipt = (link.managed_values or {}).get('historical_cash') if link else None
    if lesson:
        if not reservation or reservation.lesson_id != lesson.id or (link and reservation.id != link.reservation_id):
            raise ValueError('Historical receipt has an inconsistent reservation link')
        if receipt:
            payment = await db.get(ClientPayment, receipt.get('payment_id'))
            op = await db.get(Operation, receipt['operation_id']) if receipt.get('operation_id') else None
            account = await db.get(Account, receipt['account_id']) if receipt.get('account_id') else None
            expected_paid = ended_at.replace(tzinfo=None).isoformat()
            if (receipt.get('amount') != amount or receipt.get('currency') != options['currency']
                    or receipt.get('paid_at') != expected_paid or not payment
                    or payment.client_id != reservation.client_id or payment.amount != amount
                    or payment.item_key != str(lesson.id) or payment.action_type != 'lesson'
                    or payment.status != 'success' or reservation.debt_payment_id != payment.id
                    or (reservation.payment_breakdown or {}).get('total') != amount
                    or (reservation.payment_breakdown or {}).get('method') != 'cash'
                    or (reservation.payment_breakdown or {}).get('paid_at') != expected_paid
                    or (amount > 0 and (not op or not account or account.studio_id != lesson.studio_id
                        or account.type != 'cash' or op.studio_id != lesson.studio_id
                        or op.client_id != reservation.client_id or op.amount != amount
                        or op.type != 'in' or op.status != 'completed' or op.method != 'cash'
                        or op.account_id != account.id or op.op_date != start.date()
                        or op.trainer_id != lesson.teacher_id or op.service_id != lesson.service_id))):
                raise ValueError('Historical receipt was changed or deleted; resolve explicitly, never recreate it')
    if not eligible:
        return result
    if lesson:
        if lesson.status == 'cancelled' or reservation.status == 'cancelled' or reservation.no_show:
            result['action'] = 'preserve_manual'
            return result
        actual_end = (lesson.start_time + timedelta(minutes=lesson.duration_min)).replace(
            tzinfo=ZoneInfo(lesson.tz_iana or options['timezone'])).astimezone(timezone.utc)
        if actual_end > datetime.now(timezone.utc) or reservation.booking_channel not in ('import', 'bumpix'):
            result['action'] = 'preserve_manual'
            return result
        if reservation.status not in ('active', 'attended'):
            raise ValueError('Historical booking is unsettled; resolve its confirmation/payment first')
        if receipt:
            result['action'] = 'already_imported'
            return result
        payment = await db.get(ClientPayment, reservation.debt_payment_id) if reservation.debt_payment_id else None
        if payment and (payment.client_id != reservation.client_id or payment.item_key != str(lesson.id)):
            raise ValueError('Historical booking points to another payment')
        if payment and payment.status != 'success':
            raise ValueError('Historical booking has an unsettled payment; resolve explicitly')
        if payment or reservation.payment_breakdown is not None or reservation.subscription_id or reservation.auto_paid:
            result['action'] = 'preserve_existing_payment'
            return result
        if reservation.held_codes:
            raise ValueError('Historical booking has unsettled held payment codes')
        # A cashier receipt may exist even if its reservation link was removed.
        orphan = await db.scalar(select(ClientPayment.id).where(
            ClientPayment.client_id == reservation.client_id,
            ClientPayment.action_type == 'lesson', ClientPayment.item_key == str(lesson.id)).limit(1))
        if orphan:
            raise ValueError('Historical booking has an unlinked payment; resolve explicitly')
        if lesson.price != amount:
            raise ValueError('Historical booking price was manually changed; confirm the payment amount explicitly')
        if lesson.start_time != start:
            raise ValueError('Historical booking date was manually changed; confirm the payment date explicitly')
    result['action'] = 'create'
    return result


def summary(items, currency):
    return {'enabled': True, 'basis': BASIS, 'currency': currency,
            'account_name': ACCOUNT_NAME, 'counts': dict(Counter(i['action'] for i in items)),
            'create_amount': sum(i['amount'] for i in items if i['action'] == 'create')}


def historical_account_ids(studio_id):
    account_id = BumpixJournalLink.managed_values['historical_cash']['account_id'].as_integer()
    return select(account_id).join(BumpixEvent, BumpixEvent.id == BumpixJournalLink.event_id).where(
        BumpixEvent.studio_id == studio_id, account_id.is_not(None))


async def linked_receipt_operation(db, studio_id, operation_id):
    stored_id = BumpixJournalLink.managed_values['historical_cash']['operation_id'].as_integer()
    return await db.scalar(select(BumpixJournalLink.id).join(BumpixEvent,
        BumpixEvent.id == BumpixJournalLink.event_id).where(
        BumpixEvent.studio_id == studio_id, stored_id == operation_id).limit(1))


async def validate_saved_receipts(db, export, studio_id, options):
    ids = [e['view']['id'] for p in export.packages for e in p.snapshot['events']]
    if not ids:
        return {}
    payment_id = BumpixJournalLink.managed_values['historical_cash']['payment_id'].as_integer()
    rows = (await db.execute(select(BumpixEvent, BumpixJournalLink, Lesson, Reservation)
        .join(BumpixJournalLink, BumpixJournalLink.event_id == BumpixEvent.id)
        .outerjoin(Lesson, Lesson.id == BumpixJournalLink.lesson_id)
        .outerjoin(Reservation, Reservation.id == BumpixJournalLink.reservation_id)
        .where(BumpixEvent.studio_id == studio_id, BumpixEvent.account_key == export.account_key,
               BumpixEvent.source_event_id.in_(ids), payment_id.is_not(None)))).all()
    linked = {e.source_event_id: (link, lesson, r) for e, link, lesson, r in rows}
    errors = {}
    for package in export.packages:
        for source in package.snapshot['events']:
            eid = source['view']['id']
            if eid not in linked:
                continue
            try:
                link, lesson, reservation = linked[eid]
                if not lesson:
                    raise ValueError('Historical receipt has a deleted native booking; resolve explicitly')
                await receipt_state(db, source, options, link, lesson, reservation)
            except ValueError as exc:
                errors.setdefault(package.client_id, []).append(f'Appointment {eid}: {exc}')
    return errors


def preview_lesson(source, options, link, lesson):
    if not lesson:
        return None
    # Apply the same source-vs-manual baseline rule as native_projection. A
    # source-only price/date correction is valid before the first receipt.
    fields = ('id', 'studio_id', 'price', 'start_time', 'duration_min', 'teacher_id',
              'tz_iana', 'status', 'service_id')
    projected = SimpleNamespace(**{field: getattr(lesson, field) for field in fields})
    proposed = appointment_values(source, lesson.teacher_id, options['timezone'])
    baseline = (link.managed_values or {}).get('lesson', {})
    for field in ('price', 'start_time', 'duration_min', 'tz_iana', 'status'):
        if field in baseline and native_field(getattr(lesson, field)) == baseline[field]:
            value = proposed[field]
            setattr(projected, field, datetime.fromisoformat(value) if field == 'start_time' else value)
    return projected


async def plan_historical_cash(db, export, studio_id, options):
    await existing_cash_account(db, studio_id)
    rows = (await db.execute(select(BumpixEvent, BumpixJournalLink, Lesson, Reservation)
        .join(BumpixJournalLink, BumpixJournalLink.event_id == BumpixEvent.id)
        .outerjoin(Lesson, Lesson.id == BumpixJournalLink.lesson_id)
        .outerjoin(Reservation, Reservation.id == BumpixJournalLink.reservation_id)
        .where(BumpixEvent.studio_id == studio_id, BumpixEvent.account_key == export.account_key))).all()
    linked = {event.source_event_id: (link, lesson, reservation) for event, link, lesson, reservation in rows}
    errors, plans = {}, {}
    for package in export.packages:
        errors[package.client_id], plans[package.client_id] = [], []
        for source in package.snapshot['events']:
            eid = source['view']['id']
            try:
                link, lesson, reservation = linked.get(eid, (None, None, None))
                if link and not lesson:
                    state = {'action': 'skip_deleted', 'amount': 0}
                else:
                    state = await receipt_state(db, source, options, link,
                        preview_lesson(source, options, link, lesson), reservation)
                plans[package.client_id].append({k: state[k] for k in ('action', 'amount')})
            except ValueError as exc:
                errors[package.client_id].append(f'Appointment {eid}: {exc}')
    return errors, plans


async def existing_cash_account(db, studio_id):
    # A separate historical account avoids presenting years of gross receipts
    # as today's physical till balance. The existing studio lock serializes creation.
    linked_ids = set((await db.scalars(historical_account_ids(studio_id))).all())
    if len(linked_ids) > 1:
        raise ValueError('Historical cash account is ambiguous; resolve explicitly')
    if linked_ids:
        account = await db.get(Account, next(iter(linked_ids)))
        if not account or account.studio_id != studio_id or account.type != 'cash':
            raise ValueError('Historical cash account was changed or deleted; resolve explicitly')
        return account
    accounts = (await db.scalars(select(Account).where(Account.studio_id == studio_id,
        Account.name == ACCOUNT_NAME))).all()
    if len(accounts) > 1 or accounts and accounts[0].type != 'cash':
        raise ValueError('Historical cash account is ambiguous; resolve explicitly')
    if accounts:
        return accounts[0]
    return None


async def cash_account(db, studio_id):
    account = await existing_cash_account(db, studio_id)
    if account:
        return account
    account = Account(studio_id=studio_id, name=ACCOUNT_NAME, type='cash', balance=0,
                      daily_change=0, color='#FCAE91', is_system=False)
    db.add(account)
    await db.flush()
    return account


async def record_historical_spending(db, studio_id, client_id, amount):
    if amount <= 0:
        return
    from routers.loyalty.cards import _get_or_create_levels, _level_for
    card = await db.scalar(select(ClientLoyaltyCard).where(
        ClientLoyaltyCard.client_id == client_id).with_for_update())
    if card and card.studio_id != studio_id:
        raise ValueError('Historical spending card belongs to another studio')
    if not card:
        card = ClientLoyaltyCard(studio_id=studio_id, client_id=client_id, total_spent=0)
        db.add(card)
        await db.flush()
    total = await db.scalar(update(ClientLoyaltyCard).where(ClientLoyaltyCard.id == card.id)
        .values(total_spent=ClientLoyaltyCard.total_spent + amount).returning(ClientLoyaltyCard.total_spent))
    card.level_id = _level_for(total, await _get_or_create_levels(studio_id, db))


async def synchronize_historical_cash(db, events, options):
    states = []
    for event in events:
        if not event.is_current:
            continue
        link = await db.scalar(select(BumpixJournalLink).where(
            BumpixJournalLink.event_id == event.id).with_for_update())
        if not link or not link.lesson_id:
            continue
        lesson = await db.get(Lesson, link.lesson_id, with_for_update=True)
        reservation = await db.get(Reservation, link.reservation_id, with_for_update=True) if link.reservation_id else None
        if not lesson or not reservation or lesson.studio_id != event.studio_id or reservation.client_id != event.client_id:
            raise ValueError('Historical receipt has an inconsistent native booking')
        metadata = (link.managed_values or {}).get('historical_cash')
        if options.get('historical_cash') or metadata:
            state = await receipt_state(db, event.payload, options, link, lesson, reservation)
            states.append({k: state[k] for k in ('action', 'amount')})
            if options.get('historical_cash') and state['action'] in ('create', 'preserve_existing_payment'):
                # Explicit no-show/cancellation was excluded above; an unmarked
                # completed booking can now be marked without replaying live attendance.
                reservation.status = 'attended'
                reservation.closed_at = state['ended_at'].replace(tzinfo=None)
                link.managed_values = dict(link.managed_values or {}, reservation_status='attended',
                    reservation_closed_at=reservation.closed_at.isoformat())
            if options.get('historical_cash') and state['action'] == 'create':
                amount, ended_at = state['amount'], state['ended_at']
                paid_at = ended_at.replace(tzinfo=None)
                account = await cash_account(db, event.studio_id) if amount > 0 else None
                op = None
                if amount > 0:
                    op = Operation(studio_id=event.studio_id, client_id=event.client_id,
                        account_id=account.id, trainer_id=lesson.teacher_id, service_id=lesson.service_id,
                        type='in', title=('Заняття «' + lesson.name + '»')[:200], amount=amount,
                        op_date=event.start_time.date(),
                        category='Услуги', method='cash', status='completed')
                    db.add(op)
                    await db.execute(update(Account).where(Account.id == account.id)
                        .values(balance=Account.balance + amount))
                payment = ClientPayment(client_id=event.client_id, amount=amount,
                    description=('Заняття «' + lesson.name + '»')[:255], status='success',
                    action_type='lesson', item_key=str(lesson.id), created_at=paid_at)
                db.add(payment)
                await db.flush()
                reservation.debt_payment_id = payment.id
                reservation.payment_breakdown = {'base_price': amount, 'discounts': [],
                    'promo_code': None, 'bonuses_applied': 0, 'bonuses_value': 0,
                    'deposit_applied': 0, 'certificate_applied': 0, 'certificate_code': None,
                    'total': amount, 'method': 'cash', 'paid_at': paid_at.isoformat(),
                    'migration_basis': BASIS}
                # This is a confirmed historical receipt, not an autopilot guess
                # that a later no-show toggle should reverse as a new payment.
                reservation.auto_paid = False
                metadata = {'payment_id': payment.id, 'operation_id': op.id if op else None,
                    'account_id': account.id if account else None, 'amount': amount,
                    'currency': options['currency'], 'paid_at': paid_at.isoformat(), 'basis': BASIS}
                link.managed_values = dict(link.managed_values or {}, historical_cash=metadata)
                await record_historical_spending(db, event.studio_id, event.client_id, amount)
        details = dict(lesson.source_details or {})
        if metadata:
            details['settlement_basis'] = BASIS
        details['attendance_known'] = reservation.status == 'attended' or reservation.no_show
        details['payment_known'] = bool(reservation.payment_breakdown or reservation.subscription_id)
        lesson.source_details = details
    await db.flush()
    return summary(states, options.get('currency'))
