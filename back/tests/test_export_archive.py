"""export-archive (EPIC 5, задача 6): защита от path traversal через
file_id и round-trip формата (файл пишется как uuid4().hex — без дефисов,
чтение обязано искать тот же формат, иначе свежий архив никогда не найдётся).
Запуск из back/:  python -m tests.test_export_archive
"""
import asyncio
import os
import tempfile
import time
import uuid
from pathlib import Path

from fastapi import HTTPException
from fastapi.responses import FileResponse

import routers.settings.security as security_module
import services.daily_notify as daily_notify
from dependencies import StudioContext


class _FakeUser:
    email = "owner@x.com"


def _run(coro):
    return asyncio.run(coro)


def _ctx(studio_id: int) -> StudioContext:
    return StudioContext(user=_FakeUser(), studio_id=studio_id, role="owner")


def test_traversal_file_id_is_rejected():
    try:
        _run(security_module.download_export_archive("../../../etc/passwd", _ctx(1)))
        assert False, "должно было упасть"
    except HTTPException as e:
        assert e.status_code == 404


def test_missing_file_is_404():
    try:
        _run(security_module.download_export_archive(uuid.uuid4().hex, _ctx(1)))
        assert False, "должно было упасть"
    except HTTPException as e:
        assert e.status_code == 404


def test_generated_file_id_round_trips_to_same_path():
    with tempfile.TemporaryDirectory() as tmp:
        original_dir = security_module.EXPORT_DIR
        security_module.EXPORT_DIR = Path(tmp)
        try:
            file_id = uuid.uuid4().hex
            studio_dir = security_module.EXPORT_DIR / "1"
            studio_dir.mkdir(parents=True)
            expected_path = studio_dir / f"{file_id}.zip"
            expected_path.write_bytes(b"fake-zip-content")

            response = _run(security_module.download_export_archive(file_id, _ctx(1)))
            assert isinstance(response, FileResponse)
            assert Path(response.path) == expected_path
        finally:
            security_module.EXPORT_DIR = original_dir


def test_other_studio_cannot_read_the_file():
    """Скоуп по студии — путь строится из ctx.studio_id, не из тела запроса."""
    with tempfile.TemporaryDirectory() as tmp:
        original_dir = security_module.EXPORT_DIR
        security_module.EXPORT_DIR = Path(tmp)
        try:
            file_id = uuid.uuid4().hex
            studio_dir = security_module.EXPORT_DIR / "1"
            studio_dir.mkdir(parents=True)
            (studio_dir / f"{file_id}.zip").write_bytes(b"fake-zip-content")

            try:
                _run(security_module.download_export_archive(file_id, _ctx(2)))
                assert False, "должно было упасть"
            except HTTPException as e:
                assert e.status_code == 404
        finally:
            security_module.EXPORT_DIR = original_dir


def test_cleanup_deletes_only_files_older_than_ttl():
    with tempfile.TemporaryDirectory() as tmp:
        original_dir = daily_notify._EXPORT_DIR
        daily_notify._EXPORT_DIR = Path(tmp)
        try:
            studio_dir = daily_notify._EXPORT_DIR / "1"
            studio_dir.mkdir(parents=True)
            old_file = studio_dir / "old.zip"
            new_file = studio_dir / "new.zip"
            old_file.write_bytes(b"old")
            new_file.write_bytes(b"new")

            old_mtime = time.time() - (daily_notify._EXPORT_RETENTION_DAYS + 1) * 86400
            os.utime(old_file, (old_mtime, old_mtime))

            daily_notify._cleanup_expired_exports()

            assert not old_file.exists()
            assert new_file.exists()
        finally:
            daily_notify._EXPORT_DIR = original_dir


def test_run_export_archive():
    test_traversal_file_id_is_rejected()
    test_missing_file_is_404()
    test_generated_file_id_round_trips_to_same_path()
    test_other_studio_cannot_read_the_file()
    test_cleanup_deletes_only_files_older_than_ttl()


if __name__ == "__main__":
    test_run_export_archive()
    print("ALL PASS")
