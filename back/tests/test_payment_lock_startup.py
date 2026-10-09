"""API and worker must reject an unsafe payment lock before doing any work."""
import asyncio

import pytest
from sqlalchemy import select

from models import Studio
from services import schedule_guard


def test_current_studio_lock_passes_startup_check():
    schedule_guard.check_payment_lock_safety()


@pytest.mark.parametrize("mode", ["update", "share", "key_share", "unlocked"])
def test_startup_check_rejects_incompatible_or_non_serializing_lock(monkeypatch, mode):
    statement = select(Studio)
    if mode != "unlocked":
        statement = statement.with_for_update(read=mode != "update", key_share=mode == "key_share")
    monkeypatch.setattr(schedule_guard, "_STUDIO_LOCK", statement)
    with pytest.raises(RuntimeError, match="Payment lock safety check failed"):
        schedule_guard.check_payment_lock_safety()


@pytest.mark.parametrize("entrypoint", ["api", "worker"])
def test_payment_lock_failure_prevents_startup(monkeypatch, entrypoint):
    def reject():
        raise RuntimeError("Payment lock safety check failed")

    monkeypatch.setattr(schedule_guard, "check_payment_lock_safety", reject, raising=False)

    async def run():
        if entrypoint == "api":
            import main

            async def must_not_touch_database(*args):
                raise AssertionError("API reached database before payment safety check")

            monkeypatch.setattr(main, "ensure_database_schema", must_not_touch_database)
            async with main.lifespan(main.app):
                raise AssertionError("Unsafe API started")
        else:
            from workers import main as worker_main

            def must_not_create_worker(*args):
                raise AssertionError("Worker started before payment safety check")

            monkeypatch.setattr(worker_main, "Worker", must_not_create_worker)
            await worker_main._main()

    with pytest.raises(RuntimeError, match="Payment lock safety check failed"):
        asyncio.run(run())
