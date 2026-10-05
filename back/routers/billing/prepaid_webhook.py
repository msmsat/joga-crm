"""Paid Checkout Sessions grant finite Velora access, without any renewal mandate."""
from datetime import datetime
import logging

from sqlalchemy.future import select

from models import BillingInvoice, StudioBillingPlan
from services import billing_pricing, stripe_billing
from .plans import PLANS, PERIOD_DISCOUNTS, COMBO_FIXED, COMBO_PERCENT_RATE

logger = logging.getLogger(__name__)


def _metadata(obj):
    return stripe_billing.metadata_dict(obj)


def is_prepaid(invoice):
    return (invoice.kind == 'subscription' and not invoice.stripe_invoice_id
            and str(getattr(invoice, 'order_id', '') or '').startswith('cs_'))


def validate_identity(session, invoice, plan):
    """Even an unpaid/expired event must belong to the persisted local order."""
    meta = _metadata(session)
    customer = getattr(session, 'customer', None)
    customer = customer if isinstance(customer, str) else getattr(customer, 'id', None)
    valid = (session.mode == 'payment' and meta.get('billing_kind') == 'prepaid'
             and customer == plan.stripe_customer_id
             and meta.get('invoice_id') == str(invoice.id)
             and meta.get('studio_id') == str(invoice.studio_id)
             and invoice.studio_id == plan.studio_id
             and meta.get('plan') == invoice.plan_name
             and meta.get('period_months') == str(invoice.period_months)
             and invoice.plan_name in PLANS and invoice.period_months in PERIOD_DISCOUNTS
             and meta.get('billing_mode') in ('subscription', 'combo')
             and str(getattr(session, 'currency', '')).lower() == stripe_billing.CURRENCY)
    order = invoice.order_id or ''
    valid = valid and (order == session.id or order.startswith('prepaid:'))
    if not valid:
        raise ValueError('Prepaid Checkout does not match the local order')
    original = getattr(invoice, 'billing_details_snapshot', None) or {}
    promo = original.get('promo')
    if promo and any(meta.get(key) != (str(value) if value is not None else '')
                    for key, value in promo.items()):
        raise ValueError('Prepaid promotion does not match the order snapshot')
    return meta


def validate_session(session, invoice, plan):
    """Match an authenticated Stripe payment to the persisted seller's order."""
    meta = validate_identity(session, invoice, plan)
    if getattr(session, 'amount_subtotal', None) != invoice.amount:
        raise ValueError('Prepaid subtotal does not match the order')
    details = getattr(session, 'total_details', None)
    tax = getattr(details, 'amount_tax', None)
    total = getattr(session, 'amount_total', None)
    discount = getattr(details, 'amount_discount', 0) or 0
    if tax is None or total != invoice.amount + tax or discount:
        raise ValueError('Prepaid total/tax does not match the order')
    if invoice.tax_amount is not None and tax != invoice.tax_amount:
        raise ValueError('Prepaid tax does not match the tax snapshot')
    return tax, meta['billing_mode']


async def validate_promo_redemption(db, invoice, plan):
    original = getattr(invoice, 'billing_details_snapshot', None) or {}
    if original.get('promo', {}).get('promo_code') == billing_pricing.PROMO_CODE:
        if not await billing_pricing.first_payment_available(db, plan, excluding_invoice_id=invoice.id):
            raise ValueError('First payment promotion was already used')


async def _record_paid_payment(db, invoice, session, tax, *, paid_at, now,
                               access_starts_at=None, access_until=None):
    """Record proved gross income and its fiscal original without granting access."""
    invoice.order_id = session.id
    invoice.status, invoice.paid_at = 'paid', paid_at or now
    # Pending orders hold the catalog net; paid history stores collected gross.
    invoice.amount = session.amount_total
    if invoice.tax_amount is None:
        invoice.tax_amount, invoice.tax_currency = tax, stripe_billing.CURRENCY
        invoice.tax_outcome, invoice.tax_basis = 'stripe_auto', 'stripe_automatic_tax'
    from services.platform_fee import record_revenue
    await record_revenue(db, invoice.studio_id, 'subscription', invoice.amount,
                         stripe_billing.CURRENCY, f'cs:{session.id}')
    if getattr(invoice, 'billing_details_snapshot', None):
        from services.billing_tax_documents import queue_document
        details = {
            'net_minor': session.amount_subtotal, 'tax_minor': tax,
            'total_minor': session.amount_total, 'currency': stripe_billing.CURRENCY.upper(),
            'paid_at': paid_at.isoformat() if paid_at is not None else None,
        }
        if access_starts_at is not None:
            details['access_starts_at'] = access_starts_at.isoformat()
            details['access_until'] = access_until.isoformat()
        await queue_document(db, invoice, payment_details=details)


async def handle_session(db, event_type, obj, *, now=None, event_created=None):
    """The same locked transition serves signed events and manual reconciliation."""
    meta = _metadata(obj)
    if meta.get('billing_kind') != 'prepaid':
        return False
    session = await stripe_billing.fetch_checkout_session(obj.id)
    meta = _metadata(session)
    try:
        invoice_id = int(meta['invoice_id'])
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError('Prepaid Session has no valid local order') from exc
    try:
        studio_id = int(meta['studio_id'])
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError('Prepaid Session has no valid studio') from exc
    # All first-payment transitions take plan -> invoice locks. Checkout holds
    # the plan lock while reconciling an earlier Session; reverse order here
    # would deadlock with its paid webhook.
    plan = (await db.execute(select(StudioBillingPlan).where(
        StudioBillingPlan.studio_id == studio_id,
    ).with_for_update().execution_options(populate_existing=True))).scalar_one_or_none()
    invoice = (await db.execute(select(BillingInvoice).where(
        BillingInvoice.id == invoice_id,
    ).with_for_update().execution_options(populate_existing=True))).scalar_one_or_none()
    if invoice is None:
        raise ValueError('Prepaid local order was not persisted')
    if plan is None:
        raise ValueError('Prepaid order has no studio plan')
    validate_identity(session, invoice, plan)
    success_event = (event_type == 'checkout.session.async_payment_succeeded'
                     or event_type == 'checkout.session.completed'
                     and getattr(obj, 'payment_status', None) == 'paid')
    # Repair fiscal evidence after reconciliation learned about a payment before
    # its success event. Paid/refunded remain terminal for access and revenue.
    if invoice.status in ('paid', 'refunded'):
        original = getattr(invoice, 'billing_details_snapshot', None)
        if (original and success_event and type(event_created) in (int, float)
                and event_created > 0 and getattr(session, 'payment_status', None) == 'paid'):
            details = getattr(session, 'total_details', None)
            if (getattr(session, 'amount_subtotal', None) != original['tax']['net_minor']
                    or getattr(session, 'amount_total', None) != invoice.amount
                    or getattr(details, 'amount_tax', None) != invoice.tax_amount
                    or getattr(details, 'amount_discount', 0)):
                raise ValueError('Late prepaid payment facts do not match the paid order')
            from services.billing_tax_documents import repair_pending_date
            if await repair_pending_date(db, invoice, paid_at=datetime.utcfromtimestamp(event_created)):
                await db.commit()
        return False
    if getattr(session, 'payment_status', None) != 'paid':
        if (event_type in ('checkout.session.expired', 'checkout.session.async_payment_failed')
                or getattr(session, 'status', None) == 'expired'):
            invoice.status = 'failed'
            await db.commit()
        return False
    tax, mode = validate_session(session, invoice, plan)
    await validate_promo_redemption(db, invoice, plan)
    if plan.stripe_subscription_id:
        raise ValueError('Recurring subscription must be migrated before prepaid activation')
    from .prepaid import period_window
    now_given = now is not None
    now = now or datetime.utcnow()
    _kind, _starts, until = period_window(plan, invoice.plan_name, invoice.period_months, mode == 'combo', now)
    paid_at = now
    if getattr(invoice, 'billing_details_snapshot', None):
        from services.billing_payment_dates import received_at
        paid_at = await received_at(session, event_created=event_created if success_event else None,
                                    test_now=now if now_given else None)
    await _record_paid_payment(db, invoice, session, tax, paid_at=paid_at, now=now,
                               access_starts_at=_starts, access_until=until)
    invoice.access_granted_at = now
    plan.plan_name, plan.status, plan.expires_at = invoice.plan_name, 'active', until
    plan.max_staff = PLANS[invoice.plan_name]['limits']['staff'] or 9999
    plan.billing_cycle = 'monthly' if invoice.period_months == 1 else f'{invoice.period_months}months'
    plan.billing_mode, plan.auto_renewal, plan.past_due_since = mode, False, None
    plan.scheduled_plan, plan.scheduled_at = None, None
    plan.percent_rate = COMBO_PERCENT_RATE if mode == 'combo' else None
    plan.fixed_base_amount = COMBO_FIXED[invoice.plan_name] if mode == 'combo' else None
    await db.commit()
    from services.billing_mail import send_platform_income, send_receipt
    await send_receipt(db, invoice)
    await send_platform_income(db, invoice)
    return True


async def order_for_payment(db, intent_id, charge_id):
    """Refund/dispute events resolve the same order through PaymentIntent metadata."""
    intent = await stripe_billing.fetch_payment_intent(intent_id, charge_id)
    meta = _metadata(intent) if intent else {}
    if meta.get('billing_kind') != 'prepaid':
        return None
    try:
        invoice_id = int(meta['invoice_id'])
    except (KeyError, ValueError, TypeError) as exc:
        raise ValueError('Prepaid payment has no valid local order') from exc
    invoice = (await db.execute(select(BillingInvoice).where(
        BillingInvoice.id == invoice_id,
    ))).scalar_one_or_none()
    if invoice is None or not is_prepaid(invoice):
        raise ValueError('Prepaid payment has no matching order')
    session = await stripe_billing.fetch_checkout_session(invoice.order_id)
    session_intent = getattr(session, 'payment_intent', None)
    session_intent = session_intent if isinstance(session_intent, str) else getattr(session_intent, 'id', None)
    if session_intent != intent.id or meta.get('studio_id') != str(invoice.studio_id):
        raise ValueError('Prepaid payment belongs to another order')
    return invoice


async def reverse_prepaid(db, invoice, *, refunded_at=None, fiscal_reason=None):
    """A full refund/lost dispute reverses the ledger and paid access once."""
    plan = (await db.execute(select(StudioBillingPlan).where(
        StudioBillingPlan.studio_id == invoice.studio_id,
    ).with_for_update().execution_options(populate_existing=True))).scalar_one_or_none()
    invoice = (await db.execute(select(BillingInvoice).where(
        BillingInvoice.id == invoice.id,
    ).with_for_update().execution_options(populate_existing=True))).scalar_one_or_none()
    if invoice is None:
        return False
    if invoice.status == 'refunded':
        if fiscal_reason == 'full_refund' and getattr(invoice, 'billing_details_snapshot', None):
            from services.billing_tax_documents import queue_correction
            await queue_correction(db, invoice, refunded_at=refunded_at, reason=fiscal_reason)
            await db.commit()
        return False
    access_was_granted = invoice.status == 'paid'
    if not access_was_granted:
        # Stripe can deliver a full refund/lost dispute before the paid event.
        # Recover its proved monetary facts atomically, without issuing access.
        if plan is None:
            raise ValueError('Prepaid order has no studio plan')
        session = await stripe_billing.fetch_checkout_session(invoice.order_id)
        if getattr(session, 'payment_status', None) != 'paid':
            raise ValueError('Prepaid reversal has no confirmed paid Session')
        tax, _mode = validate_session(session, invoice, plan)
        await validate_promo_redemption(db, invoice, plan)
        from services.billing_payment_dates import received_at
        paid_at = await received_at(session)
        await _record_paid_payment(db, invoice, session, tax, paid_at=paid_at,
                                   now=datetime.utcnow())
    history = (await db.execute(select(BillingInvoice).where(
        BillingInvoice.studio_id == invoice.studio_id,
        BillingInvoice.kind == 'subscription', BillingInvoice.status == 'paid',
        BillingInvoice.stripe_invoice_id.is_(None), BillingInvoice.order_id.like('cs_%'),
        BillingInvoice.id != invoice.id,
    ).order_by(BillingInvoice.paid_at, BillingInvoice.id))).scalars().all()
    modes = {}
    for paid in history:
        session = await stripe_billing.fetch_checkout_session(paid.order_id)
        metadata = _metadata(session)
        if metadata.get('billing_kind') != 'prepaid':
            # Historical legacy orders lack the paid-period contract; do not
            # manufacture their baseline or revoke a newer unrelated purchase.
            logger.error('Возврат %s: смешанная история тарифов студии %s требует сверки', invoice.id, invoice.studio_id)
            history = None
            break
        modes[paid.id] = metadata['billing_mode']
    invoice.status = 'refunded'
    if plan is not None and access_was_granted:
        plan.auto_renewal = False
        if history:
            last, mode, until = remaining_access(history, modes)
            plan.plan_name, plan.expires_at = last.plan_name, until
            plan.status = 'active' if until > datetime.utcnow() else 'expired'
            plan.max_staff = PLANS[last.plan_name]['limits']['staff'] or 9999
            plan.billing_mode = mode
            plan.billing_cycle = 'monthly' if last.period_months == 1 else f'{last.period_months}months'
            plan.percent_rate = COMBO_PERCENT_RATE if mode == 'combo' else None
            plan.fixed_base_amount = COMBO_FIXED[last.plan_name] if mode == 'combo' else None
        elif history == []:
            plan.status, plan.expires_at = 'expired', datetime.utcnow()
    from services.platform_fee import record_revenue
    await record_revenue(db, invoice.studio_id, 'subscription', -invoice.amount,
                         stripe_billing.CURRENCY, f'rev:cs:{invoice.order_id}')
    if fiscal_reason == 'full_refund' and getattr(invoice, 'billing_details_snapshot', None):
        from services.billing_tax_documents import queue_correction
        await queue_correction(db, invoice, refunded_at=refunded_at, reason=fiscal_reason)
    elif getattr(invoice, 'billing_details_snapshot', None):
        logger.warning('Фискальная коррекция чарджбэка по покупке %s требует проверки факта отмены услуги', invoice.id)
    await db.commit()
    return True


def remaining_access(history, modes):
    """Replay paid grants, excluding a reversed order, so newer access survives."""
    from .webhook import _add_months
    until, previous, previous_mode = None, None, None
    last = None
    def grant_time(row):
        return getattr(row, 'access_granted_at', None) or row.paid_at
    for paid in sorted(history, key=lambda row: (grant_time(row), row.id)):
        mode = modes[paid.id]
        granted = grant_time(paid)
        starts = (max(granted, until) if until is not None
                  and previous == paid.plan_name and previous_mode == mode else granted)
        until = _add_months(starts, paid.period_months)
        previous, previous_mode, last = paid.plan_name, mode, paid
    return last, previous_mode, until
