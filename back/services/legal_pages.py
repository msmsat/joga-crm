"""Release-owned legal pages live outside the persistent upload volume."""
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse

LEGAL_FILENAMES = (
    "terms.html", "privacy.html", "cookies.html", "terms-2026-09-14.2.html",
)
_BASE = Path(__file__).resolve().parents[1]


def register_legal_pages(
    app: FastAPI, *, bundle_dir: Path | None = None, source_dir: Path | None = None,
) -> None:
    """Register these exact public URLs before the generic /static mount."""
    bundle = Path(bundle_dir) if bundle_dir is not None else _BASE / "assets/legal"
    source = Path(source_dir) if source_dir is not None else _BASE / "static"

    def endpoint(filename):
        async def legal_page():
            # Local source checkouts have no image bundle. A deployed bundle
            # never falls back to an outdated legal page in the upload volume.
            root = bundle if bundle.is_dir() else source
            path = root / filename
            if not path.is_file():
                raise HTTPException(status_code=404, detail="Legal document not found")
            return FileResponse(path, media_type="text/html", headers={"Cache-Control": "no-cache"})
        return legal_page

    for filename in LEGAL_FILENAMES:
        app.add_api_route(
            "/static/" + filename, endpoint(filename), methods=["GET", "HEAD"],
            include_in_schema=False, name="legal-" + filename,
        )
