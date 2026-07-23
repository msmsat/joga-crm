import os
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
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

DOCS_DIR = "uploads/docs"
ALLOWED_EXTENSIONS = {"pdf", "docx", "xlsx"}
MAX_SIZE_MB = 15


def _to_read(doc: FinDocument) -> FinDocumentRead:
    return FinDocumentRead(
        id=doc.id,
        title=doc.title,
        doc_type=doc.doc_type,
        amount=doc.amount,
        status=doc.status,
        file_ext=doc.file_ext,
        has_file=bool(doc.file_url),
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
    if doc.file_url:
        path = os.path.join(DOCS_DIR, str(ctx.studio_id), f"{doc.id}.{doc.file_ext}")
        if os.path.isfile(path):
            os.remove(path)
    await db.delete(doc)
    await db.commit()


@router.post("/documents/{doc_id}/file", response_model=FinDocumentRead)
async def upload_document_file(
    doc_id: int,
    file: UploadFile = File(...),
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    doc = await _get_or_404(doc_id, ctx.studio_id, db)

    raw_name = file.filename or ""
    ext = raw_name.rsplit(".", 1)[-1].lower() if "." in raw_name else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Допустимые форматы: PDF, DOCX, XLSX")

    content = await file.read()
    if len(content) > MAX_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"Файл не должен превышать {MAX_SIZE_MB} МБ")

    studio_dir = os.path.join(DOCS_DIR, str(ctx.studio_id))
    os.makedirs(studio_dir, exist_ok=True)
    # Старый файл документа мог быть другого расширения — не оставляем сироту на диске.
    if doc.file_url and doc.file_ext and doc.file_ext != ext:
        old_path = os.path.join(studio_dir, f"{doc.id}.{doc.file_ext}")
        if os.path.isfile(old_path):
            os.remove(old_path)

    with open(os.path.join(studio_dir, f"{doc.id}.{ext}"), "wb") as f:
        f.write(content)

    doc.file_ext = ext
    doc.file_url = f"/finances/documents/{doc.id}/file"
    await db.commit()
    await db.refresh(doc)
    return _to_read(doc)


@router.get("/documents/{doc_id}/file")
async def download_document_file(
    doc_id: int,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    doc = await _get_or_404(doc_id, ctx.studio_id, db)
    if not doc.file_url:
        raise HTTPException(status_code=404, detail="Файл не загружен")

    path = os.path.join(DOCS_DIR, str(ctx.studio_id), f"{doc.id}.{doc.file_ext}")
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Файл не найден")

    return FileResponse(path, filename=f"{doc.title}.{doc.file_ext}")
