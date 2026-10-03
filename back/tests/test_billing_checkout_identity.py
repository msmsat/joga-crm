import asyncio
from types import SimpleNamespace as NS
from urllib.parse import parse_qs, urlsplit

from routers.billing import prepaid
from schemas.settings.billing import CheckoutResponse


def test_response_preserves_exact_invoice_for_unpaid_and_already_paid(monkeypatch):
    async def handle(*args):
        return None
    monkeypatch.setattr('routers.billing.prepaid_webhook.handle_session', handle)
    row=NS(id=734, tax_outcome='taxable',tax_rate_percent=21)
    for status in ('paid','unpaid'):
        session=NS(payment_status=status,client_secret='test-secret',amount_total=5445,
                   total_details=NS(amount_tax=945))
        result=asyncio.run(prepaid._response(None,session,row,NS(ui_mode='elements'),'pk_test'))
        assert result.invoice_id == 734


def test_response_contract_exposes_optional_invoice_id():
    assert CheckoutResponse(invoice_id=734).model_dump()['invoice_id'] == 734
    assert CheckoutResponse().invoice_id is None


def test_return_url_carries_invoice_and_preserves_query_and_fragment():
    url=prepaid._invoice_return_url('https://velora.test/dashboard/billing?payment=return&invoice_id=old#status',734)
    parts=urlsplit(url)
    assert parts.path == '/dashboard/billing'
    assert parts.fragment == 'status'
    assert parse_qs(parts.query) == {'payment':['return'],'invoice_id':['734']}


def test_real_stripe_sdk_metadata_reopens_and_validates_a_prepaid_order():
    import stripe
    from routers.billing import prepaid_webhook
    from test_billing_prepaid import _invoice, _plan, _session
    session=stripe.checkout.Session.construct_from(vars(_session()),'sk_test_fixture')
    assert prepaid._meta(session)['invoice_id'] == '1'
    assert prepaid_webhook._metadata(session)['invoice_id'] == '1'
    prepaid_webhook.validate_session(session,_invoice(),_plan())


def test_access_dates_have_explicit_utc_for_local_midnight_display(monkeypatch):
    from datetime import datetime, timezone
    from routers.billing import checkout
    from services.billing_tax import TaxPreview
    from test_billing_prepaid import _DB, _invoice, _plan
    start=datetime(2026,10,2,23,30)
    async def tax(*args,**kwargs):
        return TaxPreview('taxable',21,4500,945,5445,'EUR','domestic_standard_rate',None)
    monkeypatch.setattr(checkout.billing_tax,'preview',tax)
    monkeypatch.setattr(prepaid,'period_window',lambda *args: ('new',start,datetime(2026,11,2,23,30)))
    fn=getattr(checkout.preview_checkout,'__wrapped__',checkout.preview_checkout)
    result=asyncio.run(fn(None,'s5',1,False,NS(studio_id=7,user=NS(id=2)),_DB(_invoice(),_plan('free_trial','trial'))))
    assert datetime.fromisoformat(result.access_starts_at).tzinfo == timezone.utc
    assert datetime.fromisoformat(result.access_until).tzinfo == timezone.utc
