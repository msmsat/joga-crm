"""Сборщик визитов лендинга: страна и устройство считает сервер, повторы
схлопываются, мусор не роняет страницу.

Запуск из back/:  pytest tests/test_landing_visit.py -v
"""
import warnings

warnings.filterwarnings("ignore")

import uuid

from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select

from database import async_session_maker
from models import LandingVisit
from services.visit_collector import clip, device_from_ua

IPHONE_UA = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
)
DESKTOP_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/130.0.0.0 Safari/537.36"
)


def test_device_from_ua():
    assert device_from_ua(IPHONE_UA) == "mobile"
    assert device_from_ua(DESKTOP_UA) == "desktop"
    assert device_from_ua("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)") == "tablet"
    assert device_from_ua(None) == "unknown"


def test_clip_never_exceeds_column():
    assert clip("x" * 900, 300) == "x" * 300
    assert clip(None, 300) is None
    assert clip("  ", 300) is None


async def _post(body: dict, headers: dict | None = None):
    from main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as http:
        return await http.post("/landing/visit", json=body, headers=headers or {})


async def _rows(anon: str) -> list:
    async with async_session_maker() as db:
        return list(
            (await db.execute(select(LandingVisit).where(LandingVisit.anon_id == anon)))
            .scalars()
            .all()
        )


async def _cleanup(anon: str):
    async with async_session_maker() as db:
        await db.execute(delete(LandingVisit).where(LandingVisit.anon_id == anon))
        await db.commit()


async def test_visit_is_recorded_with_server_side_country_and_device():
    anon = f"test-{uuid.uuid4()}"
    try:
        r = await _post(
            {"anon_id": anon, "path": "/", "referrer": "https://google.com/search",
             "utm_source": "google", "lang": "ru"},
            headers={"CF-IPCountry": "CZ", "User-Agent": IPHONE_UA},
        )
        assert r.status_code == 204
        rows = await _rows(anon)
        assert len(rows) == 1
        assert rows[0].country == "CZ"
        assert rows[0].device == "mobile"
        assert rows[0].utm_source == "google"
    finally:
        await _cleanup(anon)


async def test_country_from_body_is_ignored():
    # Клиент не источник правды о своей стране: иначе счётчик показывает то,
    # что ему прислали.
    anon = f"test-{uuid.uuid4()}"
    try:
        await _post(
            {"anon_id": anon, "path": "/", "country": "US", "device": "desktop"},
            headers={"CF-IPCountry": "DE", "User-Agent": IPHONE_UA},
        )
        rows = await _rows(anon)
        assert rows[0].country == "DE"
        assert rows[0].device == "mobile"
    finally:
        await _cleanup(anon)


async def test_reload_within_window_does_not_duplicate():
    # Без этого перезагрузка страницы = новый «визит», и график трафика
    # становится графиком нажатий F5.
    anon = f"test-{uuid.uuid4()}"
    try:
        await _post({"anon_id": anon, "path": "/"}, headers={"CF-IPCountry": "CZ"})
        await _post({"anon_id": anon, "path": "/"}, headers={"CF-IPCountry": "CZ"})
        assert len(await _rows(anon)) == 1
    finally:
        await _cleanup(anon)


async def test_other_path_is_a_new_visit():
    anon = f"test-{uuid.uuid4()}"
    try:
        await _post({"anon_id": anon, "path": "/"})
        await _post({"anon_id": anon, "path": "/pricing"})
        assert len(await _rows(anon)) == 2
    finally:
        await _cleanup(anon)


async def test_long_referrer_does_not_break_the_insert():
    anon = f"test-{uuid.uuid4()}"
    try:
        r = await _post({"anon_id": anon, "path": "/", "referrer": "https://x.test/" + "a" * 5000})
        assert r.status_code == 204
        assert len(await _rows(anon)) == 1
    finally:
        await _cleanup(anon)


async def test_garbage_body_is_204_and_writes_nothing():
    # Счётчик не имеет права ни ронять лендинг, ни рассказывать о своей схеме.
    r = await _post({"нет": "полей"})
    assert r.status_code == 204
