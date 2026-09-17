"""HTTP-контур админки: вход, отказ и защита чтения.

Запуск из back/:  pytest tests/test_admin_api.py -v
"""
import os
import warnings

warnings.filterwarnings("ignore")

import pytest
from httpx import ASGITransport, AsyncClient

from security import pwd_context

PASSWORD = "koala-7-Dunes!"
LOGIN = "owner@velora.test"


@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setenv("ADMIN_LOGIN", LOGIN)
    monkeypatch.setenv("ADMIN_NAME", "Марат")
    monkeypatch.setenv("ADMIN_PASSWORD_HASH", pwd_context.hash(PASSWORD))
    monkeypatch.setenv("ADMIN_JWT_SECRET", "a" * 64)


async def _call(method: str, path: str, **kw):
    from main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as http:
        return await getattr(http, method)(path, **kw)


async def test_login_returns_token(configured):
    r = await _call("post", "/adm/api/login", json={"login": LOGIN, "password": PASSWORD})
    assert r.status_code == 200, r.text
    assert r.json()["token"]
    assert r.json()["name"] == "Марат"


async def test_wrong_password_is_401(configured):
    r = await _call("post", "/adm/api/login", json={"login": LOGIN, "password": "нет"})
    assert r.status_code == 401


async def test_me_needs_token(configured):
    assert (await _call("get", "/adm/api/me")).status_code == 401


async def test_me_with_token(configured):
    login = await _call("post", "/adm/api/login", json={"login": LOGIN, "password": PASSWORD})
    token = login.json()["token"]
    r = await _call("get", "/adm/api/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json() == {"login": LOGIN, "name": "Марат"}


async def test_disabled_admin_is_503(monkeypatch):
    monkeypatch.setenv("ADMIN_LOGIN", "")
    monkeypatch.setenv("ADMIN_PASSWORD_HASH", "")
    monkeypatch.setenv("ADMIN_JWT_SECRET", "")
    r = await _call("post", "/adm/api/login", json={"login": "x", "password": "y"})
    assert r.status_code == 503


async def test_admin_spa_is_served_when_built():
    # Смысл задачи о раздаче: /adm отдаёт саму страницу, а ассеты лежат под
    # /adm/assets и не спорят с /assets мини-приложения.
    import main

    if not os.path.isfile(main._ADMIN_INDEX):
        pytest.skip("admin/dist не собран — нечего раздавать")

    page = await _call("get", "/adm")
    assert page.status_code == 200
    assert "text/html" in page.headers["content-type"]
    assert "/adm/assets/" in page.text


async def test_admin_assets_do_not_shadow_miniapp_assets():
    import main

    if not os.path.isfile(main._ADMIN_INDEX):
        pytest.skip("admin/dist не собран")
    mounted = {route.path for route in main.app.routes if hasattr(route, "path")}
    assert "/adm/assets" in mounted
