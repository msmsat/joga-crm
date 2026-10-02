"""Real PostgreSQL transaction: paid facts, issued PDF, refund and retention."""
import asyncio
from copy import deepcopy
from datetime import datetime, timezone

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

import database
from models import BillingInvoice, BillingTaxDocument, Studio
from services import billing_document_fx as fx
from services.billing_receipts import fiscal_receipt
from services.billing_tax_documents import queue_document, queue_correction, ensure_issued
from tests.test_fiscal_documents import snapshot


def test_postgres_persists_frozen_pdf_and_separate_refund_with_unique_retention(monkeypatch):
    assert database.db_key(database.DATABASE_URL) != database.db_key(__import__('os').environ['DATABASE_URL'])
    calls=[]
    async def rate(day):
        calls.append(day.isoformat())
        return {'rate':'24.465','date':'2026-10-02','currency':'EUR','source':'CNB',
                'source_url':'https://www.cnb.cz/en/financial_markets/foreign_exchange_market/exchange_rate_fixing/daily.txt?date=02.10.2026'}
    monkeypatch.setattr(fx,'fetch_cnb_rate',rate)

    async def scenario():
        async with database.engine.connect() as connection:
            outer=await connection.begin()
            try:
                async with AsyncSession(bind=connection,expire_on_commit=False,
                                        join_transaction_mode='create_savepoint') as db:
                    studio=Studio(name='Fiscal persistence test')
                    db.add(studio); await db.flush()
                    inv=BillingInvoice(studio_id=studio.id,order_id='cs_fiscal_persistence_test',
                        plan_name='s5',period_months=1,amount=5445,tax_amount=945,status='paid',
                        paid_at=datetime(2026,10,1,23,30),billing_details_snapshot=snapshot())
                    db.add(inv); await db.flush()
                    doc=await queue_document(db,inv); await db.commit()
                    first=await ensure_issued(db,doc,now=datetime(2026,10,2,15,tzinfo=timezone.utc))
                    original=deepcopy(first.snapshot)
                    doc_id, invoice_id = doc.id, inv.id
                    db.expire_all()
                    persisted=await db.get(BillingTaxDocument,doc_id)
                    assert persisted.status=='issued' and persisted.snapshot==original
                    replay=await queue_document(db,await db.get(BillingInvoice,invoice_id))
                    assert replay.id==persisted.id and calls==['2026-10-02']
                    pdf=await fiscal_receipt(db,await db.get(BillingInvoice,invoice_id))
                    assert pdf.body.startswith(b'%PDF-') and len(pdf.body)>20000
                    inv=await db.get(BillingInvoice,invoice_id); inv.status='refunded'
                    await queue_correction(db,inv,refunded_at=datetime(2026,11,5,12))
                    await db.commit(); await ensure_issued(db,persisted)
                    assert persisted.snapshot==original
                    assert persisted.correction_snapshot['snapshot']['tax']['total_minor']==-5445
                    assert calls==['2026-10-02']
                    credit_pdf=await fiscal_receipt(db,inv)
                    assert len(credit_pdf.body)>len(pdf.body)
                    try:
                        async with db.begin_nested():
                            await db.execute(delete(BillingInvoice).where(BillingInvoice.id==invoice_id))
                    except IntegrityError:
                        pass
                    else:
                        raise AssertionError('Issued accounting history must retain its purchase')
                    assert (await db.execute(select(BillingTaxDocument).where(
                        BillingTaxDocument.invoice_id==invoice_id))).scalar_one().snapshot==original
            finally:
                await outer.rollback()
    asyncio.run(scenario())
