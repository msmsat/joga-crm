"""Account closure retains fiscal history and published legal pages survive static volumes."""
import asyncio
from pathlib import Path
from types import SimpleNamespace as NS

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError

from models import BillingTaxDocument, Studio, StudioBillingPlan, StudioMember
from routers.settings import security
from schemas.settings.security import ConfirmNameRequest


class _ClosureDB:
    def __init__(self, retained, language="en"):
        self.retained = retained
        self.studio = NS(id=7, name="Test Studio", language=language)
        self.queries, self.deleted, self.commits = [], [], 0
    async def get(self, model, identifier):
        assert model is Studio and identifier == 7
        return self.studio
    async def execute(self, query):
        self.queries.append(query)
        if getattr(query, "is_delete", False):
            self.deleted.append(query)
            if self.retained:
                raise IntegrityError("DELETE studios", {}, Exception("retained fiscal record"))
            return NS()
        entity = query.column_descriptions[0]["entity"]
        value = (None if entity is StudioMember else NS(status="expired")
                 if entity is StudioBillingPlan else 123 if entity is BillingTaxDocument and self.retained else None)
        return NS(scalars=lambda: NS(first=lambda: value), scalar_one_or_none=lambda: value)
    async def commit(self):
        self.commits += 1


@pytest.mark.parametrize("language,word", [("en", "accounting"), ("ru", "налог"),
                                          ("uk", "податков"), ("cs", "daňov"), ("de", "Steuer")])
def test_retained_tax_records_block_closure_before_sessions_or_delete(monkeypatch, language, word):
    db, revoked = _ClosureDB(True, language), []
    async def lock(*args): pass
    async def revoke(*args, **kwargs): revoked.append(True)
    monkeypatch.setattr(security, "lock_studio", lock)
    monkeypatch.setattr(security, "revoke_sessions", revoke)
    ctx = NS(studio_id=7, user=NS(id=2))
    with pytest.raises(HTTPException) as error:
        asyncio.run(security.delete_account(ConfirmNameRequest(confirm_name="Test Studio"), ctx, db, None))
    assert error.value.status_code == 409
    assert error.value.detail["code"] == "settings.accounting_records_retained"
    assert word in error.value.detail["message"]
    assert not db.deleted and not revoked and db.commits == 0
    query = next(query for query in db.queries if query.column_descriptions[0]["entity"] is BillingTaxDocument)
    assert query.compile().params["studio_id_1"] == 7


def test_account_without_tax_history_still_closes(monkeypatch):
    db, revoked = _ClosureDB(False), []
    async def lock(*args): pass
    async def revoke(*args, **kwargs): revoked.append(True)
    monkeypatch.setattr(security, "lock_studio", lock)
    monkeypatch.setattr(security, "revoke_sessions", revoke)
    result = asyncio.run(security.delete_account(ConfirmNameRequest(confirm_name="Test Studio"),
                                               NS(studio_id=7, user=NS(id=2)), db, None))
    assert result.redirect == "/select-crm"
    assert len(db.deleted) == len(revoked) == db.commits == 1


def _legal_app(bundle, source):
    from services.legal_pages import register_legal_pages
    app = FastAPI()
    register_legal_pages(app, bundle_dir=bundle, source_dir=source)
    app.mount("/static", StaticFiles(directory=str(source)))
    return app


@pytest.mark.parametrize("filename", ["terms.html", "privacy.html", "cookies.html", "terms-2026-09-14.2.html"])
def test_updated_bundled_legal_page_overrides_stale_static_volume(tmp_path, filename):
    bundle, volume = tmp_path / "assets/legal", tmp_path / "static"
    bundle.mkdir(parents=True); volume.mkdir()
    (bundle / filename).write_text("current legal release", encoding="utf-8")
    (volume / filename).write_text("stale static volume", encoding="utf-8")
    (volume / "logo.txt").write_text("existing uploaded logo", encoding="utf-8")
    client = TestClient(_legal_app(bundle, volume))
    response = client.get("/static/" + filename)
    assert response.status_code == 200 and response.text == "current legal release"
    assert response.headers["content-type"].startswith("text/html")
    assert client.get("/static/logo.txt").text == "existing uploaded logo"
    assert client.get("/static/not-legal.html").status_code == 404


def test_local_legal_source_fallback_when_no_image_bundle_exists(tmp_path):
    source = tmp_path / "static"; source.mkdir()
    (source / "terms.html").write_text("local legal source", encoding="utf-8")
    client = TestClient(_legal_app(tmp_path / "missing-bundle", source))
    assert client.get("/static/terms.html").text == "local legal source"


def test_missing_bundled_page_does_not_fall_back_to_stale_volume(tmp_path):
    bundle, source = tmp_path / "assets/legal", tmp_path / "static"
    bundle.mkdir(parents=True); source.mkdir()
    (source / "privacy.html").write_text("stale policy", encoding="utf-8")
    assert TestClient(_legal_app(bundle, source)).get("/static/privacy.html").status_code == 404


def test_docker_includes_cookies_and_archive_and_bundles_outside_static_volume():
    base = Path(__file__).resolve().parents[1]
    ignore = (base / ".dockerignore").read_text(encoding="utf-8")
    assert "!static/cookies.html" in ignore
    assert "!static/terms-2026-09-14.2.html" in ignore
    dockerfile = (base / "Dockerfile").read_text(encoding="utf-8")
    assert "COPY static/terms.html static/privacy.html static/cookies.html static/terms-2026-09-14.2.html /app/assets/legal/" in dockerfile
    main = (base / "main.py").read_text(encoding="utf-8")
    assert main.index("register_legal_pages(app)") < main.index('app.mount("/static"')
    privacy = (base / "static/privacy.html").read_text(encoding="utf-8")
    assert "10 years for accounting and VAT records under Czech law" in privacy
