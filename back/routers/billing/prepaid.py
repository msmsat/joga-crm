"""A prepaid access period: one Checkout payment, no recurring Stripe product."""
import hashlib
import json
import uuid
from datetime import datetime
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.future import select

from models import BillingInvoice, StudioBillingPlan
from schemas.settings.billing import CheckoutResponse
from services import billing_pricing, billing_tax, stripe_billing
from .plans import PLANS, canon

MIGRATION_REQUIRED = {
    'code': 'billing.prepaid_migration_required',
    'message': 'У студии осталась прежняя подписка Stripe. Перед разовой оплатой '
               'поддержка должна перенести оплаченный срок и отключить её продление, '
               'чтобы избежать повторного списания.',
}


def period_window(plan, requested: str, months: int, combo: bool, now=None):
    """Only a previously paid identical plan extends; a trial converts now."""
    now = now or datetime.utcnow()
    active_paid = (plan.status == 'active' and plan.plan_name != 'free_trial'
                   and plan.expires_at is not None and plan.expires_at > now)
    same = (active_paid and canon(plan.plan_name) == requested
            and (plan.billing_mode == 'combo') == combo)
    starts = plan.expires_at if same else now
    # The calendar arithmetic is shared with legacy renewals (Jan31 -> Feb28).
    from .webhook import _add_months
    return ('renewal' if same else 'switch' if active_paid else 'new',
            starts, _add_months(starts, months))


def _fingerprint(profile, tax, body, combo, net):
    values = dict(profile=profile.model_dump(), automatic=tax.automatic,
                  rates=tax.rate_ids, ui_mode=body.ui_mode, plan=body.plan,
                  period_months=body.period_months, combo=combo, net=net,
                  exempt=tax.customer_tax_exempt, outcome=tax.decision.outcome,
                  ruleset=tax.decision.ruleset_version, basis=tax.decision.basis,
                  rate=str(tax.decision.rate_percent))
    return hashlib.sha256(json.dumps(values, sort_keys=True).encode()).hexdigest()[:24]


def _meta(session):
    return stripe_billing.metadata_dict(session)


def _invoice_return_url(url: str, invoice_id: int) -> str:
    parts = urlsplit(url)
    query = [(key, value) for key, value in parse_qsl(parts.query, keep_blank_values=True)
             if key != 'invoice_id']
    query.append(('invoice_id', str(invoice_id)))
    return urlunsplit(parts._replace(query=urlencode(query)))


async def _response(db, session, row, body, public_key):
    if getattr(session, 'payment_status', None) == 'paid':
        from .prepaid_webhook import handle_session
        await handle_session(db, 'checkout.session.completed', session)
        return CheckoutResponse(invoice_id=row.id, amount_due=0, currency=stripe_billing.CURRENCY.upper(),
                                **billing_pricing.invoice_price_fields(row))
    secret = getattr(session, 'client_secret', None) if body.ui_mode == 'elements' else None
    total = getattr(session, 'amount_total', None)
    details = getattr(session, 'total_details', None)
    tax = getattr(details, 'amount_tax', None)
    return CheckoutResponse(
        invoice_id=row.id,
        **billing_pricing.invoice_price_fields(row),
        checkout_url=getattr(session, 'url', None) if body.ui_mode == 'hosted' else None,
        client_secret=secret, publishable_key=public_key, payment_kind='checkout',
        amount_due=total, currency=stripe_billing.CURRENCY.upper(), tax_amount=tax,
        tax_rate_percent=row.tax_rate_percent if row.tax_outcome != 'stripe_auto' else None,
    )


async def create_payment(db, ctx, plan, customer_id, body, tax, profile,
                         public_key, return_url, cancel_url):
    """Commit the local order before Stripe can send an event; retry by its id."""
    if plan.stripe_subscription_id:
        raise HTTPException(status_code=409, detail=MIGRATION_REQUIRED)
    locked = (await db.execute(select(StudioBillingPlan).where(
        StudioBillingPlan.studio_id == ctx.studio_id,
    ).with_for_update().execution_options(populate_existing=True))).scalar_one_or_none()
    if locked is not None:
        plan = locked
        if plan.stripe_subscription_id:
            raise HTTPException(status_code=409, detail=MIGRATION_REQUIRED)

    combo = bool(body.combo) if body.combo is not None else plan.billing_mode == 'combo'
    price = billing_pricing.period_price(body.plan, body.period_months, combo,
        await billing_pricing.first_payment_available(db, plan))
    net = price.net_amount
    fingerprint = _fingerprint(profile, tax, body, combo, net)
    pending = (await db.execute(select(BillingInvoice).where(
        BillingInvoice.studio_id == ctx.studio_id,
        BillingInvoice.kind == 'subscription', BillingInvoice.status == 'pending',
        BillingInvoice.stripe_invoice_id.is_(None),
        or_(BillingInvoice.order_id.like('cs_%'), BillingInvoice.order_id.like('prepaid:%')),
    ).order_by(BillingInvoice.id.desc()).limit(20))).scalars().all()
    row = None
    for candidate in pending:
        if candidate.order_id.startswith('cs_'):
            session = await stripe_billing.fetch_checkout_session(candidate.order_id)
            meta = _meta(session)
            same = (meta.get('profile_hash') == fingerprint
                    and candidate.plan_name == body.plan
                    and candidate.period_months == body.period_months
                    and meta.get('billing_mode') == ('combo' if combo else 'subscription'))
            if getattr(session, 'payment_status', None) == 'paid':
                response = await _response(db, session, candidate, body, public_key)
                if same:
                    return response
                # Reconciliation just consumed the first payment. Re-lock and
                # recalculate, otherwise a different choice keeps stale promo
                # eligibility after its predecessor has already been paid.
                return await create_payment(db, ctx, plan, customer_id, body, tax,
                                            profile, public_key, return_url, cancel_url)
            elif getattr(session, 'status', None) == 'open':
                if same:
                    await db.commit()
                    return await _response(db, session, candidate, body, public_key)
                await stripe_billing.expire_checkout_session(session.id)
                candidate.status = 'failed'
            elif getattr(session, 'status', None) == 'complete':
                # A delayed method is still processing. Never offer a second charge.
                raise HTTPException(status_code=409, detail={
                    'code': 'billing.payment_processing',
                    'message': 'Предыдущая оплата ещё обрабатывается. Дождитесь результата.',
                })
            else:
                candidate.status = 'failed'
        elif (candidate.order_id.split(':')[1] == fingerprint
              and candidate.plan_name == body.plan and candidate.period_months == body.period_months):
            row = candidate
            break
        else:
            # A timed-out Stripe request may have created a Session already.
            # Its known local id lets a retry recover it without another purchase.
            raise HTTPException(status_code=409, detail={
                'code': 'billing.payment_processing',
                'message': 'Предыдущая попытка оплаты требует сверки. Повторите её '
                           'с прежними реквизитами или обратитесь в поддержку.',
            })

    if row is None:
        snapshot = billing_tax.snapshot(tax, net, stripe_billing.CURRENCY) if tax.manual else {}
        from services.billing_document_snapshot import purchase_snapshot
        _kind, starts, until = period_window(plan, body.plan, body.period_months, combo)
        details = purchase_snapshot(profile, tax, body.plan, body.period_months,
                                    net, stripe_billing.CURRENCY, starts, until)
        details["promo"] = price.fields()
        details["item"]["billing_mode"] = "combo" if combo else "subscription"
        row = BillingInvoice(
            studio_id=ctx.studio_id, user_id=ctx.user.id, kind='subscription',
            status='pending', plan_name=body.plan, period_months=body.period_months,
            amount=net, payment_method='card',
            order_id=f'prepaid:{fingerprint}:{uuid.uuid4().hex}',
            billing_details_snapshot=details, **snapshot,
        )
        db.add(row)
        await db.flush()
    await db.commit()
    # Serialize creation/retry of this order across two tabs. Commit above makes
    # invoice_id resolvable even if the paid webhook arrives before this response.
    await db.execute(select(BillingInvoice).where(BillingInvoice.id == row.id)
                     .with_for_update().execution_options(populate_existing=True))
    # Another retry may already have attached or paid this Session while this
    # request waited for the invoice lock. Reuse its immutable purchase facts.
    if row.order_id.startswith('cs_'):
        session = await stripe_billing.fetch_checkout_session(row.order_id)
        await db.commit()
        return await _response(db, session, row, body, public_key)
    frozen = billing_pricing.invoice_price_fields(row)
    net = frozen['net_amount']
    metadata = {
        'billing_kind': 'prepaid', 'invoice_id': str(row.id),
        'studio_id': str(ctx.studio_id), 'user_id': str(ctx.user.id),
        'plan': body.plan, 'period_months': str(body.period_months),
        'billing_mode': 'combo' if combo else 'subscription', 'profile_hash': fingerprint,
        **{key: str(value) if value is not None else '' for key, value in frozen.items()},
    }
    session = await stripe_billing.create_period_checkout(
        customer_id, net, f'Velora {PLANS[body.plan]["name"]} · {body.period_months} мес.',
        metadata, _invoice_return_url(return_url, row.id), cancel_url, tax=tax, ui_mode=body.ui_mode,
        idempotency_key=f'prepaid:{row.id}',
    )
    row.order_id = session.id
    await db.commit()
    return await _response(db, session, row, body, public_key)
