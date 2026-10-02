"""Owner-authorized document retrieval, with an honest pending/review response."""
from fastapi import HTTPException, Response
from fastapi.responses import RedirectResponse
from sqlalchemy import select

from models import BillingTaxDocument
from services.billing_tax_documents import ensure_issued, TaxDocumentPending
from services.billing_tax_pdf import render_tax_pdf


async def fiscal_receipt(db, invoice):
    if getattr(invoice, 'billing_details_snapshot', None):
        document = (await db.execute(select(BillingTaxDocument).where(
            BillingTaxDocument.invoice_id == invoice.id,
            BillingTaxDocument.studio_id == invoice.studio_id,
        ))).scalar_one_or_none()
        if document is None:
            raise HTTPException(status_code=409, detail={
                'code':'billing.invoice_not_ready',
                'message':'Налоговый документ ещё формируется — повторите запрос позже',
            })
        try:
            document = await ensure_issued(db, document)
        except TaxDocumentPending as exc:
            raise HTTPException(status_code=409, detail={
                'code':'billing.invoice_not_ready',
                'message':'Документ ожидает подтверждённых налоговых данных или публикации курса ČNB',
            }) from exc
        if invoice.status == 'refunded' and (
            not document.correction_snapshot or document.correction_snapshot.get('status') != 'issued'
        ):
            raise HTTPException(status_code=409, detail={
                'code':'billing.tax_document_review',
                'message':'Корректирующий налоговый документ требует проверки возврата',
            })
        data = render_tax_pdf(document)
        number = document.snapshot['document_number']
        return Response(data, media_type='application/pdf', headers={
            'Content-Disposition':f'attachment; filename="{number}.pdf"',
            'Cache-Control':'private, no-store',
        })
    url = invoice.pdf_url or invoice.hosted_invoice_url
    if invoice.status == 'paid' and url:
        return RedirectResponse(url, status_code=307)
    raise HTTPException(status_code=409, detail={
        'code':'billing.tax_document_review',
        'message':'Для этой покупки отсутствуют подтверждённые реквизиты налогового документа',
    })
