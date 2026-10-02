import asyncio
from copy import deepcopy
from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace as NS

import pytest
from fastapi import HTTPException
from services import billing_tax_documents as fiscal, billing_document_fx as fx, billing_receipts as receipts


def snapshot():
    return {'version':1,'seller':{'name':'Test Seller','registration_id':'12345678',
        'vat_id':'CZ12345678','country':'CZ','line1':'Seller 1','postal_code':'13000','city':'Praha'},
        'buyer':{'legal_name':'Test Buyer','registration_id':None,'vat_id':None,'vat_verified':False,
        'country':'CZ','line1':'Buyer 1','line2':None,'postal_code':'11000','city':'Praha'},
        'tax':{'outcome':'taxable','basis':'cz_domestic','rate_percent':21,'net_minor':4500,
        'tax_minor':945,'total_minor':5445,'currency':'EUR','ruleset':'eu-cz-2026.10'},
        'item':{'plan':'s5','period_months':1,'access_starts_at':'2026-10-01T23:30:00+00:00',
        'access_until':'2026-11-01T23:30:00+00:00'},'paid_at':'2026-10-01T23:30:00+00:00'}


class Result:
    def __init__(self,value): self.value=value
    def scalar_one_or_none(self): return self.value


class DB:
    def __init__(self,values=()):
        self.values=iter(values); self.added=[]; self.commits=0; self.statements=[]
    async def execute(self,statement):
        self.statements.append(statement); return Result(next(self.values))
    def add(self,item): self.added.append(item)
    async def flush(self):
        for item in self.added: item.id=7
    async def commit(self): self.commits+=1


def invoice(status='paid'):
    return NS(id=9,studio_id=1,status=status,amount=5445,tax_amount=945,
        paid_at=datetime(2026,10,1,23,30),billing_details_snapshot=snapshot())


def document():
    return NS(id=7,invoice_id=9,studio_id=1,status='pending',snapshot=snapshot(),
        correction_snapshot=None,created_at=datetime(2026,10,2),issued_at=None)


def test_opening_or_expiring_checkout_creates_no_fiscal_document():
    for status in ('pending','failed','expired'):
        db=DB()
        with pytest.raises(ValueError): asyncio.run(fiscal.queue_document(db,invoice(status)))
        assert db.added == [] and db.commits == 0


def test_paid_snapshot_is_independent_and_actual_utc_time_is_normalized():
    inv=invoice(); db=DB([None]); original=deepcopy(inv.billing_details_snapshot)
    queued=asyncio.run(fiscal.queue_document(db,inv,payment_details={'paid_at':'2026-10-01T23:30:00'}))
    assert queued.snapshot['paid_at']=='2026-10-01T23:30:00+00:00'
    inv.billing_details_snapshot['buyer']['legal_name']='Changed Later'
    assert queued.snapshot['buyer']['legal_name']=='Test Buyer'
    assert queued.snapshot['tax']==original['tax'] and queued.status=='pending'
    assert db.commits == 0


def test_payment_replay_keeps_the_same_document():
    existing=document(); db=DB([existing])
    assert asyncio.run(fiscal.queue_document(db,invoice())) is existing
    assert not db.added


def test_missing_confirmed_paid_date_is_not_replaced_with_processing_time():
    inv=invoice(); db=DB([None])
    queued=asyncio.run(fiscal.queue_document(db,inv,payment_details={'paid_at':None}))
    assert queued.snapshot['paid_at'] is None
    with pytest.raises(fiscal.TaxDocumentPending):
        asyncio.run(fiscal.ensure_issued(DB([queued]),queued))
    assert queued.status=='pending'


def test_legacy_purchase_is_not_reconstructed_from_todays_profile():
    inv=invoice(); inv.billing_details_snapshot=None
    assert asyncio.run(fiscal.queue_document(DB(),inv)) is None


def test_mismatched_paid_totals_cannot_become_a_document():
    with pytest.raises(ValueError):
        asyncio.run(fiscal.queue_document(DB([None]),invoice(),payment_details={'total_minor':100}))


def test_issuance_uses_prague_tax_date_and_cnb_rounding_then_freezes(monkeypatch):
    doc=document(); calls=[]
    async def rate(day):
        calls.append(day.isoformat())
        return {'rate':'24.465','date':'2026-10-02','source':'CNB','source_url':'https://www.cnb.cz/'}
    monkeypatch.setattr(fx,'fetch_cnb_rate',rate)
    now=datetime(2026,10,2,15,tzinfo=timezone.utc)
    db=DB([doc]); asyncio.run(fiscal.ensure_issued(db,doc,now=now))
    assert calls==['2026-10-02'] and doc.status=='issued'
    assert doc.snapshot['vat_czk_minor']==23119
    assert doc.snapshot['document_number']=='VL-2026-00000007'
    original=deepcopy(doc.snapshot)
    asyncio.run(fiscal.ensure_issued(DB([doc]),doc,now=datetime(2027,1,1,tzinfo=timezone.utc)))
    assert doc.snapshot==original and len(calls)==1


def test_unpublished_fixing_never_issues_a_fake_zero_vat_document(monkeypatch):
    doc=document()
    async def missing(day): raise fx.FXUnavailable('Todays fixing not published')
    monkeypatch.setattr(fx,'fetch_cnb_rate',missing)
    db=DB([doc])
    with pytest.raises(fiscal.TaxDocumentPending): asyncio.run(fiscal.ensure_issued(db,doc))
    assert doc.status=='pending' and doc.issued_at is None and db.commits==0


@pytest.mark.parametrize('field,value', [('rate_percent',None),('rate_percent','NaN'),
    ('tax_minor',946),('outcome','requires_review')])
def test_unconfirmed_or_inconsistent_tax_requires_review(field,value):
    facts=snapshot(); facts['tax'][field]=value
    with pytest.raises(fiscal.TaxDocumentPending): fiscal._validate(facts)


def test_reverse_charge_requires_verified_vat_and_zero_tax():
    facts=snapshot(); facts['tax'].update(outcome='reverse_charge',tax_minor=0,total_minor=4500,rate_percent=None)
    with pytest.raises(fiscal.TaxDocumentPending): fiscal._validate(facts)
    facts['buyer'].update(vat_id='DE123456789',vat_verified=True,country='DE')
    fiscal._validate(facts)


def test_full_refund_is_a_separate_negative_note_using_original_fx():
    doc=document(); doc.status='issued'; doc.snapshot.update(document_number='VL-2026-00000007',
        tax_date='2026-10-02',issued_at='2026-10-02T15:00:00+00:00',
        fx={'rate':'24.465','date':'2026-10-02'},vat_czk_minor=23119,net_czk_minor=110093)
    original=deepcopy(doc.snapshot)
    inv=invoice('refunded'); db=DB([doc])
    asyncio.run(fiscal.queue_correction(db,inv,refunded_at=datetime(2026,11,5,12)))
    fiscal._issue_correction(doc,datetime(2026,11,5,14,tzinfo=timezone.utc))
    credit=doc.correction_snapshot['snapshot']
    assert doc.snapshot==original and credit['fx']==original['fx']
    assert credit['tax']['total_minor']==-5445 and credit['tax']['tax_minor']==-945
    assert credit['vat_czk_minor']==-23119 and credit['original_document_number']==original['document_number']


def test_unknown_refund_date_requires_review_not_current_time():
    doc=document(); db=DB([doc]); inv=invoice('refunded')
    asyncio.run(fiscal.queue_correction(db,inv,refunded_at=None))
    with pytest.raises(fiscal.TaxDocumentPending): fiscal._issue_correction(doc,datetime.now(timezone.utc))
    assert doc.correction_snapshot['status']=='pending'


def test_refunded_pdf_requires_an_issued_credit_and_owner_studio_filter(monkeypatch):
    doc=document(); doc.status='issued'; inv=invoice('refunded')
    async def issued(*args): return doc
    monkeypatch.setattr(receipts,'ensure_issued',issued)
    db=DB([doc])
    with pytest.raises(HTTPException) as error: asyncio.run(receipts.fiscal_receipt(db,inv))
    assert error.value.detail['code']=='billing.tax_document_review'
    sql=str(db.statements[0]); assert 'studio_id' in sql and 'invoice_id' in sql


def test_paid_receipt_uses_own_document_not_stripe_url(monkeypatch):
    doc=document(); doc.status='issued'; doc.snapshot['document_number']='VL-2026-00000007'
    async def issued(*args): return doc
    monkeypatch.setattr(receipts,'ensure_issued',issued)
    monkeypatch.setattr(receipts,'render_tax_pdf',lambda doc:b'%PDF-frozen')
    inv=invoice(); inv.pdf_url='https://example.com/stale'
    response=asyncio.run(receipts.fiscal_receipt(DB([doc]),inv))
    assert response.body==b'%PDF-frozen' and response.headers['cache-control']=='private, no-store'


def test_pending_cannot_render_a_pdf():
    from services.billing_tax_pdf import render_tax_pdf
    with pytest.raises(ValueError): render_tax_pdf(document())


def test_pdf_period_dates_use_prague_even_when_database_times_are_naive_utc():
    from services.billing_tax_pdf import _date
    assert _date('2026-10-01T23:30:00')=='02.10.2026'
    assert _date('2026-10-02')=='02.10.2026'
