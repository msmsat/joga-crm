import os
import uuid
from fastapi import APIRouter, UploadFile, File, HTTPException

router = APIRouter()

LOGOS_DIR = "static/logos"
ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp", "gif"}
MIME_TO_EXT = {
    "image/jpeg": "jpg",
    "image/png":  "png",
    "image/webp": "webp",
    "image/gif":  "gif",
}


@router.post("/upload-logo")
async def upload_logo(file: UploadFile = File(...)):
    raw_name = file.filename or ""
    ext = raw_name.rsplit(".", 1)[-1].lower() if "." in raw_name else ""

    print(f"[upload-logo] filename={raw_name!r}  content_type={file.content_type!r}  ext={ext!r}")

    if ext not in ALLOWED_EXTENSIONS:
        content_type = (file.content_type or "").lower()
        if content_type in MIME_TO_EXT:
            ext = MIME_TO_EXT[content_type]
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Недопустимый формат. filename={raw_name!r}, content_type={file.content_type!r}",
            )

    os.makedirs(LOGOS_DIR, exist_ok=True)
    filename = f"{uuid.uuid4().hex}.{ext}"
    path = os.path.join(LOGOS_DIR, filename)

    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Файл не должен превышать 5 МБ")

    with open(path, "wb") as f:
        f.write(content)

    return {"url": f"/static/logos/{filename}"}
