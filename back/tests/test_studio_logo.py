"""ROADMAP_SETTINGS эпик 2, задача 2: POST /studio/logo — в отличие от общего
/upload-logo пишет logo_url в Studio и подчищает старый файл с диска.
Реальная БД и реальная файловая система (static/logos), ручная чистка.

Все шаги, трогающие БД, идут в одном asyncio.run() — SQLAlchemy async engine
держит asyncpg-соединения, привязанные к своему event loop; несколько
независимых asyncio.run() поверх одного и того же движка ломают пул
(см. test_bulk_requires_owner в test_notification_event_toggles.py — тот же
приём: ролевой гейт без обращения к БД вынесен в отдельный asyncio.run()).

Запуск из back/:  python -m tests.test_studio_logo
"""
import asyncio
import io
import os
import warnings

warnings.filterwarnings("ignore")

from fastapi import HTTPException
from starlette.datastructures import Headers, UploadFile
from sqlalchemy import delete

from database import async_session_maker
from dependencies import require_role, StudioContext
from models import Studio
from routers.studio.media import upload_studio_logo, LOGOS_DIR


def _upload(content: bytes, filename: str, content_type: str) -> UploadFile:
    return UploadFile(io.BytesIO(content), filename=filename, headers=Headers({"content-type": content_type}))


async def _seed() -> int:
    async with async_session_maker() as db:
        s = Studio(name="TEST-STUDIO-LOGO")
        db.add(s)
        await db.commit()
        return s.id


async def _cleanup(sid: int, paths: list[str]) -> None:
    async with async_session_maker() as db:
        await db.execute(delete(Studio).where(Studio.id == sid))
        await db.commit()
    for p in paths:
        rel = p.lstrip("/")
        if os.path.isfile(rel):
            os.remove(rel)


async def _run():
    sid = await _seed()
    owner = StudioContext(user=None, studio_id=sid, role="owner")
    created_paths: list[str] = []
    try:
        # Первая загрузка: logo_url пишется в Studio, файл реально лежит на диске.
        async with async_session_maker() as db:
            result = await upload_studio_logo(
                file=_upload(b"\x89PNG-fake-bytes", "logo.png", "image/png"),
                ctx=owner, db=db,
            )
        first_url = result["logo_url"]
        created_paths.append(first_url)
        assert first_url.startswith(f"/{LOGOS_DIR}/"), first_url
        assert os.path.isfile(first_url.lstrip("/")), first_url

        async with async_session_maker() as db:
            studio = await db.get(Studio, sid)
            assert studio.logo_url == first_url, studio.logo_url

        # Вторая загрузка: старый файл удаляется, новый — на месте, оба URL разные.
        async with async_session_maker() as db:
            result2 = await upload_studio_logo(
                file=_upload(b"\xff\xd8-fake-jpeg", "logo2.jpg", "image/jpeg"),
                ctx=owner, db=db,
            )
        second_url = result2["logo_url"]
        created_paths.append(second_url)
        assert second_url != first_url, second_url
        assert not os.path.isfile(first_url.lstrip("/")), "старый файл логотипа должен быть удалён"
        assert os.path.isfile(second_url.lstrip("/")), second_url

        async with async_session_maker() as db:
            studio = await db.get(Studio, sid)
            assert studio.logo_url == second_url, studio.logo_url
        print("OK: test_logo_upload_replaces_old_file")

        # Запрещённый MIME (gif) — 400, БД и диск не тронуты, текущий логотип на месте.
        async with async_session_maker() as db:
            try:
                await upload_studio_logo(
                    file=_upload(b"GIF89a-fake", "logo.gif", "image/gif"),
                    ctx=owner, db=db,
                )
                raise AssertionError("ожидали 400")
            except HTTPException as e:
                assert e.status_code == 400, e.status_code
        async with async_session_maker() as db:
            studio = await db.get(Studio, sid)
            assert studio.logo_url == second_url, studio.logo_url  # не затёрто мусором
        print("OK: test_rejects_disallowed_mime_type")

        # Файл больше 2 МБ — 400.
        big = b"0" * (2 * 1024 * 1024 + 1)
        async with async_session_maker() as db:
            try:
                await upload_studio_logo(
                    file=_upload(big, "big.png", "image/png"),
                    ctx=owner, db=db,
                )
                raise AssertionError("ожидали 400")
            except HTTPException as e:
                assert e.status_code == 400, e.status_code
        print("OK: test_rejects_oversized_file")
    finally:
        await _cleanup(sid, created_paths)


def test_studio_logo_endpoint():
    asyncio.run(_run())


# ─── Ролевой гейт: только owner (без обращения к БД — отдельный event loop
# безопасен; образец — test_bulk_requires_owner в test_notification_event_toggles.py) ──
def test_upload_requires_owner():
    guard = require_role("owner")
    admin_ctx = StudioContext(user=None, studio_id=1, role="admin")
    try:
        asyncio.run(guard(ctx=admin_ctx))
        raise AssertionError("ожидали 403")
    except HTTPException as e:
        assert e.status_code == 403


if __name__ == "__main__":
    test_studio_logo_endpoint()
    test_upload_requires_owner()
    print("ALL PASS")
