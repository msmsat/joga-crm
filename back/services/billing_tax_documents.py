"""Paid-only fiscal documents from frozen purchase facts, independent of Stripe Invoicing."""
from copy import deepcopy
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import logging
from zoneinfo import ZoneInfo

from sqlalchemy import select

logger = logging.getLogger(__name__)
PRAGUE = ZoneInfo('Europe/Prague')

class TaxDocumentPending(RuntimeError):
    pass

def _utc(value):
    parsed = value if isinstance(value, datetime) else datetime.fromisoformat(str(value))
    return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed.astimezone(timezone.utc)

def _validate(snapshot):
    if snapshot.get('version') != 1:
        raise TaxDocumentPending('Unsupported document snapshot')
    for party, name in (('seller','name'),('buyer','legal_name')):
        data = snapshot.get(party) or {}
        if not all(str(data.get(key) or '').strip() for key in (name,'country','line1','postal_code','city')):
            raise TaxDocumentPending('Legal billing identity is incomplete')
    seller, tax = snapshot['seller'], snapshot.get('tax') or {}
    if seller['country'] != 'CZ' or not seller.get('vat_id') or not seller.get('registration_id'):
        raise TaxDocumentPending('Czech seller details are incomplete')
    if tax.get('currency','').upper() != 'EUR':
        raise TaxDocumentPending('Only EUR fiscal documents are supported')
    if tax.get('outcome') not in ('taxable','reverse_charge','exempt','out_of_scope'):
        raise TaxDocumentPending('Tax decision is not confirmed')
    net, vat, total = tax.get('net_minor'), tax.get('tax_minor'), tax.get('total_minor')
    if any(type(value) is not int for value in (net,vat,total)) or net <= 0 or vat < 0 or total != net+vat:
        raise TaxDocumentPending('Confirmed payment totals do not match')
    if tax['outcome'] == 'taxable':
        try:
            rate = Decimal(str(tax.get('rate_percent')))
        except InvalidOperation as exc:
            raise TaxDocumentPending('Confirmed statutory VAT rate is missing') from exc
        if not rate.is_finite() or rate <= 0 or int((Decimal(net)*rate/100).quantize(Decimal('1'), rounding=ROUND_HALF_UP)) != vat:
            raise TaxDocumentPending('Confirmed statutory VAT rate does not match')
    elif vat != 0:
        raise TaxDocumentPending('Non-taxable decision unexpectedly includes VAT')
    if tax['outcome'] == 'reverse_charge' and not (snapshot['buyer'].get('vat_id') and snapshot['buyer'].get('vat_verified')):
        raise TaxDocumentPending('Reverse charge has no verified buyer VAT ID')

async def queue_document(db, invoice, *, payment_details=None):
    from models import BillingTaxDocument
    original = getattr(invoice,'billing_details_snapshot',None)
    if original is None:
        return None  # Legacy history cannot be reconstructed from today's profile.
    if invoice.status != 'paid':
        raise ValueError('An unpaid order cannot create a fiscal document')
    existing = (await db.execute(select(BillingTaxDocument).where(
        BillingTaxDocument.invoice_id == invoice.id))).scalar_one_or_none()
    if existing is not None:
        return existing
    snapshot = deepcopy(original)
    actual = payment_details or {}
    tax = snapshot['tax']
    for key in ('net_minor','tax_minor','total_minor','currency'):
        if key in actual:
            tax[key] = actual[key]
    paid_at = actual['paid_at'] if 'paid_at' in actual else invoice.paid_at
    snapshot['paid_at'] = _utc(paid_at).isoformat() if paid_at is not None else None
    for key in ('access_starts_at','access_until'):
        if key in actual:
            snapshot['item'][key] = actual[key]
    if tax.get('total_minor') != invoice.amount or (invoice.tax_amount is not None and tax.get('tax_minor') != invoice.tax_amount):
        raise ValueError('Fiscal payment facts do not match the paid order')
    document = BillingTaxDocument(invoice_id=invoice.id, studio_id=invoice.studio_id,
                                  status='pending', snapshot=snapshot)
    db.add(document)
    await db.flush()
    return document

async def repair_pending_date(db, invoice, *, paid_at):
    """Fill only an unissued document's previously unknown proved payment date.

    The caller validates the exact paid Stripe Session and original success
    event. This helper performs no network I/O, access grant, ledger or commit.
    """
    from models import BillingTaxDocument
    if paid_at is None or invoice.status not in ('paid', 'refunded'):
        return False
    document = (await db.execute(select(BillingTaxDocument).where(
        BillingTaxDocument.invoice_id == invoice.id,
        BillingTaxDocument.studio_id == invoice.studio_id,
    ).with_for_update().execution_options(populate_existing=True))).scalar_one_or_none()
    if document is None or document.status != 'pending' or document.snapshot.get('paid_at'):
        return False
    tax = document.snapshot.get('tax') or {}
    if tax.get('total_minor') != invoice.amount or tax.get('tax_minor') != invoice.tax_amount:
        raise ValueError('Fiscal recovery facts do not match the paid order')
    snapshot = deepcopy(document.snapshot)
    confirmed = _utc(paid_at)
    snapshot['paid_at'] = confirmed.isoformat()
    document.snapshot = snapshot
    invoice.paid_at = confirmed.replace(tzinfo=None)
    return True


async def queue_correction(db, invoice, *, refunded_at, reason='full_refund'):
    from models import BillingTaxDocument
    document = (await db.execute(select(BillingTaxDocument).where(
        BillingTaxDocument.invoice_id == invoice.id).with_for_update()
        .execution_options(populate_existing=True))).scalar_one_or_none()
    if document is None:
        return None
    correction = document.correction_snapshot
    if correction is not None:
        if (invoice.status == 'refunded' and reason == 'full_refund'
                and correction.get('status') == 'pending' and not correction.get('refunded_at')
                and correction.get('reason') == 'full_refund'
                and correction.get('refund_minor') == invoice.amount and refunded_at is not None):
            # A later verified final event can complete pending fiscal evidence;
            # known dates and issued credit notes remain immutable.
            document.correction_snapshot = {**correction, 'refunded_at': _utc(refunded_at).isoformat()}
        return document
    if invoice.status != 'refunded' or reason != 'full_refund':
        raise ValueError('Only a confirmed full refund creates an automatic credit note')
    document.correction_snapshot = {'status':'pending', 'refunded_at':_utc(refunded_at).isoformat() if refunded_at is not None else None,
                                    'reason':reason, 'refund_minor':invoice.amount}
    return document

def _issue_correction(document, now):
    correction = document.correction_snapshot
    if correction is None or correction.get('status') == 'issued':
        return
    original = document.snapshot
    if not correction.get('refunded_at'):
        raise TaxDocumentPending('Confirmed refund date requires fiscal review')
    if correction.get('refund_minor') != original['tax']['total_minor']:
        raise TaxDocumentPending('Refund amount needs manual fiscal review')
    snapshot = deepcopy(original)
    snapshot.update(document_number=original['document_number']+'-R1',
                    original_document_number=original['document_number'],
                    issued_at=now.isoformat(), refunded_at=correction['refunded_at'],
                    correction_reason='Vrácení celé přijaté platby / Full payment refund')
    for key in ('net_minor','tax_minor','total_minor'):
        snapshot['tax'][key] = -original['tax'][key]
    for key in ('vat_czk_minor','net_czk_minor'):
        snapshot[key] = -original[key]
    document.correction_snapshot = {'status':'issued','snapshot':snapshot}

async def ensure_issued(db, document, *, now=None):
    from models import BillingTaxDocument
    from services.billing_document_fx import fetch_cnb_rate, FXUnavailable
    locked = (await db.execute(select(BillingTaxDocument).where(
        BillingTaxDocument.id == document.id).with_for_update().execution_options(
            populate_existing=True))).scalar_one_or_none()
    if locked is None:
        raise TaxDocumentPending('Document no longer exists')
    now = _utc(now or datetime.now(timezone.utc))
    if locked.status != 'issued':
        snapshot = deepcopy(locked.snapshot)
        _validate(snapshot)
        if not snapshot.get('paid_at'):
            raise TaxDocumentPending('Confirmed payment date requires fiscal review')
        tax_date = _utc(snapshot['paid_at']).astimezone(PRAGUE).date()
        try:
            fx = await fetch_cnb_rate(tax_date)
        except FXUnavailable as exc:
            raise TaxDocumentPending(str(exc)) from exc
        snapshot.update(fx=fx, tax_date=tax_date.isoformat(), issued_at=now.isoformat(),
            document_number=f'VL-{now.astimezone(PRAGUE).year}-{locked.id:08d}')
        rate = Decimal(fx['rate'])
        snapshot['vat_czk_minor'] = int((Decimal(snapshot['tax']['tax_minor'])*rate).quantize(Decimal('1'),rounding=ROUND_HALF_UP))
        snapshot['net_czk_minor'] = int((Decimal(snapshot['tax']['net_minor'])*rate).quantize(Decimal('1'),rounding=ROUND_HALF_UP))
        locked.snapshot, locked.status = snapshot, 'issued'
        locked.issued_at = now.replace(tzinfo=None)
    try:
        _issue_correction(locked,now)
    except TaxDocumentPending:
        logger.info('Corrective document %s remains pending for fiscal review',locked.id)
    await db.commit()
    return locked

async def issue_pending(session_maker):
    from models import BillingTaxDocument
    from sqlalchemy import or_, and_
    count = 0
    cursor = 0
    while True:
        async with session_maker() as db:
            ids = (await db.execute(select(BillingTaxDocument.id).where(
                BillingTaxDocument.id > cursor, or_(
                    BillingTaxDocument.status == 'pending',
                    and_(BillingTaxDocument.correction_snapshot.is_not(None),
                         BillingTaxDocument.correction_snapshot['status'].astext == 'pending'),
                )).order_by(BillingTaxDocument.id).limit(100))).scalars().all()
        if not ids:
            break
        cursor = ids[-1]  # Review rows must never starve newer valid payments.
        for identifier in ids:
            async with session_maker() as db:
                doc = (await db.execute(select(BillingTaxDocument).where(
                    BillingTaxDocument.id == identifier))).scalar_one_or_none()
                if doc is None:
                    continue
                created = _utc(doc.created_at)
                try:
                    await ensure_issued(db,doc)
                    count += 1
                except TaxDocumentPending:
                    await db.rollback()
                    logger.info('Tax document %s remains pending; will retry',identifier)
                    if (datetime.now(timezone.utc) - created).days >= 14:
                        logger.warning('Tax document %s approaches/exceeds the issuance deadline; fiscal review required',identifier)
                except Exception:
                    await db.rollback()
                    logger.exception('Tax document %s issuance failed',identifier)
    return count

def start_tax_document_loop(session_maker):
    import asyncio
    async def loop():
        while True:
            try:
                await issue_pending(session_maker)
            except Exception:
                logger.exception('Fiscal document retry pass failed')
            await asyncio.sleep(900)
    return asyncio.create_task(loop())
