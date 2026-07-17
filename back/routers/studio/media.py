import os
import uuid
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends

from dependencies import oauth2_scheme

router = APIRouter()

LOGOS_DIR = "static/logos"
BRANCH_PHOTOS_DIR = "static/branches"
STAFF_PHOTOS_DIR = "static/staff"
ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp", "gif"}
MIME_TO_EXT = {
    "image/jpeg": "jpg",
    "image/png":  "png",
    "image/webp": "webp",
    "image/gif":  "gif",
}


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
async def upload_logo(file: UploadFile = File(...)):
    print(f"[upload-logo] filename={file.filename!r}  content_type={file.content_type!r}")
    url = await _save_image(file, LOGOS_DIR, max_size_mb=5)
    return {"url": url}


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
    print(f"[upload-staff-photo] filename={file.filename!r}  content_type={file.content_type!r}")
    url = await _save_image(file, STAFF_PHOTOS_DIR, max_size_mb=5)
    return {"url": url}
