from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from dependencies import require_role, StudioContext
from models import Counterparty, FinDocument
from schemas.finances.operations import (
    FinDocumentCreate,
    FinDocumentRead,
    FinDocumentUpdate,
)

router = APIRouter()


def _to_read(doc: FinDocument) -> FinDocumentRead:
    return FinDocumentRead(
        id=doc.id,
        title=doc.title,
        doc_type=doc.doc_type,
        amount=doc.amount,
        status=doc.status,
        file_ext=doc.file_ext,
        counterparty_id=doc.counterparty_id,
        created_at=doc.upload_date,
    )


async def _get_or_404(doc_id: int, studio_id: int, db: AsyncSession) -> FinDocument:
    doc = (await db.execute(
        select(FinDocument).where(FinDocument.id == doc_id, FinDocument.studio_id == studio_id)
    )).scalar_one_or_none()
    if doc is None:
        raise HTTPException(status_code=404, detail="Документ не найден")
    return doc


async def _check_counterparty(cp_id: int, studio_id: int, db: AsyncSession):
    exists = (await db.execute(
        select(Counterparty.id).where(Counterparty.id == cp_id, Counterparty.studio_id == studio_id)
    )).scalar_one_or_none()
    if exists is None:
        raise HTTPException(status_code=404, detail="Контрагент не найден")


@router.get("/documents", response_model=list[FinDocumentRead])
async def list_documents(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(FinDocument)
        .where(FinDocument.studio_id == ctx.studio_id)
        .order_by(FinDocument.upload_date.desc(), FinDocument.id.desc())
    )).scalars().all()
    return [_to_read(d) for d in rows]


@router.post("/documents", status_code=201, response_model=FinDocumentRead)
async def create_document(
    body: FinDocumentCreate,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    if body.counterparty_id is not None:
        await _check_counterparty(body.counterparty_id, ctx.studio_id, db)
    doc = FinDocument(
        studio_id=ctx.studio_id,
        title=body.title,
        doc_type=body.doc_type,
        amount=body.amount,
        status=body.status or "draft",
        file_ext=body.file_ext or "",
        counterparty_id=body.counterparty_id,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return _to_read(doc)


@router.patch("/documents/{doc_id}", response_model=FinDocumentRead)
async def update_document(
    doc_id: int,
    body: FinDocumentUpdate,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    doc = await _get_or_404(doc_id, ctx.studio_id, db)
    data = body.model_dump(exclude_unset=True)
    if data.get("counterparty_id") is not None:
        await _check_counterparty(data["counterparty_id"], ctx.studio_id, db)
    for field, value in data.items():
        setattr(doc, field, value)
    await db.commit()
    await db.refresh(doc)
    return _to_read(doc)


@router.delete("/documents/{doc_id}", status_code=204)
async def delete_document(
    doc_id: int,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    doc = await _get_or_404(doc_id, ctx.studio_id, db)
    await db.delete(doc)
    await db.commit()
