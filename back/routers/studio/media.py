import os
import uuid
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import oauth2_scheme, require_role, StudioContext
from models import Studio

router = APIRouter()

LOGOS_DIR = "static/logos"
BRANCH_PHOTOS_DIR = "static/branches"
STAFF_PHOTOS_DIR = "static/staff"
HALL_PHOTOS_DIR = "static/halls"
ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp", "gif"}
MIME_TO_EXT = {
    "image/jpeg": "jpg",
    "image/png":  "png",
    "image/webp": "webp",
    "image/gif":  "gif",
}
# Логотип студии (ROADMAP_SETTINGS эпик 2, задача 2) — строже общего загрузчика:
# только эти 3 типа, без gif.
STUDIO_LOGO_MIME_TYPES = {"image/png", "image/jpeg", "image/webp"}


def _resolve_ext(file: UploadFile) -> str:
    raw_name = file.filename or ""
    ext = raw_name.rsplit(".", 1)[-1].lower() if "." in raw_name else ""
    if ext in ALLOWED_EXTENSIONS:
        return ext
    content_type = (file.content_type or "").lower()
    if content_type in MIME_TO_EXT:
        return MIME_TO_EXT[content_type]
    raise HTTPException(
        status_code=400,
        detail=f"Недопустимый формат. filename={raw_name!r}, content_type={file.content_type!r}",
    )


async def _save_image(file: UploadFile, target_dir: str, max_size_mb: int) -> str:
    ext = _resolve_ext(file)

    content = await file.read()
    if len(content) > max_size_mb * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"Файл не должен превышать {max_size_mb} МБ")

    os.makedirs(target_dir, exist_ok=True)
    filename = f"{uuid.uuid4().hex}.{ext}"
    with open(os.path.join(target_dir, filename), "wb") as f:
        f.write(content)

    return f"/{target_dir}/{filename}"


@router.post("/upload-logo")
async def upload_logo(
    file: UploadFile = File(...),
    _token: str = Depends(oauth2_scheme),
):
    url = await _save_image(file, LOGOS_DIR, max_size_mb=5)
    return {"url": url}


@router.post("/logo")
async def upload_studio_logo(
    file: UploadFile = File(...),
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Логотип студии для вкладки «Основные» (ROADMAP_SETTINGS эпик 2, задача 2):
    в отличие от /upload-logo — пишет logo_url в Studio и подчищает старый файл.
    """
    if (file.content_type or "").lower() not in STUDIO_LOGO_MIME_TYPES:
        raise HTTPException(status_code=400, detail="Допустимы только PNG, JPEG и WEBP")

    studio = await db.get(Studio, ctx.studio_id)
    if studio is None:
        raise HTTPException(status_code=404, detail="Студия не найдена")

    old_url = studio.logo_url
    new_url = await _save_image(file, LOGOS_DIR, max_size_mb=2)
    studio.logo_url = new_url
    await db.commit()

    if old_url and old_url.startswith(f"/{LOGOS_DIR}/"):
        old_path = old_url.lstrip("/")
        if os.path.isfile(old_path):
            os.remove(old_path)

    return {"logo_url": new_url}


@router.post("/upload-branch-photo")
async def upload_branch_photo(
    file: UploadFile = File(...),
    _token: str = Depends(oauth2_scheme),
):
    url = await _save_image(file, BRANCH_PHOTOS_DIR, max_size_mb=10)
    return {"url": url}


@router.post("/upload-staff-photo")
async def upload_staff_photo(
    file: UploadFile = File(...),
    _token: str = Depends(oauth2_scheme),
):
    url = await _save_image(file, STAFF_PHOTOS_DIR, max_size_mb=5)
    return {"url": url}


@router.post("/upload-hall-photo")
async def upload_hall_photo(
    file: UploadFile = File(...),
    _token: str = Depends(oauth2_scheme),
):
    url = await _save_image(file, HALL_PHOTOS_DIR, max_size_mb=10)
    return {"url": url}
