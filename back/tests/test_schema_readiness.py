"""Schema drift and the September 19 migration fork regressions."""
import asyncio
import importlib
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory
from sqlalchemy import Column, Integer, MetaData, Table, text

from database import engine
from services import schema_readiness as readiness


def test_actual_missing_columns_are_reported(monkeypatch):
    metadata = MetaData()
    Table("lessons", metadata, Column("id", Integer), Column("notes", Integer),
          Column("photos", Integer))
    Table("users", metadata, Column("created_at", Integer))
    Table("studios", metadata, Column("space_is_axis", Integer))
    monkeypatch.setattr(readiness, "Base", SimpleNamespace(metadata=metadata))
    monkeypatch.setattr(readiness, "inspect", lambda _: SimpleNamespace(
        get_multi_columns=lambda: {
            (None, "lessons"): [{"name": "id"}],
            (None, "users"): [],
            (None, "studios"): [],
        },
    ))
    assert readiness._missing_columns(None) == [
        "lessons.notes", "lessons.photos", "studios.space_is_axis", "users.created_at",
    ]


def test_guard_fails_with_migration_instructions():
    connection = AsyncMock()
    connection.run_sync.return_value = ["lessons.notes"]
    context = AsyncMock()
    context.__aenter__.return_value = connection
    fake_engine = SimpleNamespace(connect=lambda: context)
    with pytest.raises(RuntimeError, match="alembic upgrade head"):
        asyncio.run(readiness.ensure_database_schema(fake_engine))


def test_guard_accepts_complete_schema():
    connection = AsyncMock()
    connection.run_sync.return_value = []
    context = AsyncMock()
    context.__aenter__.return_value = connection
    asyncio.run(readiness.ensure_database_schema(SimpleNamespace(connect=lambda: context)))


def test_migration_history_has_one_head_and_contains_both_branches():
    config = Config()
    config.set_main_option("script_location", str(Path(__file__).resolve().parents[1] / "migrations"))
    scripts = ScriptDirectory.from_config(config)
    assert len(scripts.get_heads()) == 1, "API startup uses alembic upgrade head"
    ancestors = {revision.revision for revision in scripts.walk_revisions()}
    assert {"b2e4f81a7c35", "b3c1f07a9d84", "c4d2e9a71f06"} <= ancestors


@pytest.mark.parametrize("already_applied", [None, "notes", "instagram"])
def test_both_migration_branches_preserve_existing_rows(already_applied):
    notes = importlib.import_module("migrations.versions.b2e4f81a7c35_lesson_notes_and_photos")
    instagram = importlib.import_module("migrations.versions.b3c1f07a9d84_client_instagram")
    merge = importlib.import_module(
        "migrations.versions.c4d2e9a71f06_merge_lesson_notes_and_client_instagram")

    async def run():
        async with engine.connect() as connection:
            transaction = await connection.begin()
            try:
                def migrate(sync):
                    schema = "migration_check_" + uuid4().hex
                    sync.execute(text(f'CREATE SCHEMA "{schema}"'))
                    sync.execute(text(f'SET LOCAL search_path TO "{schema}"'))
                    sync.execute(text("CREATE TABLE lessons (id integer PRIMARY KEY)"))
                    sync.execute(text("CREATE TABLE clients (id integer PRIMARY KEY)"))
                    sync.execute(text("INSERT INTO lessons VALUES (1)"))
                    sync.execute(text("INSERT INTO clients VALUES (1)"))
                    with Operations.context(MigrationContext.configure(sync)):
                        if already_applied == "notes":
                            notes.upgrade()
                            sync.execute(text("UPDATE lessons SET notes = 'keep me'"))
                        elif already_applied == "instagram":
                            instagram.upgrade()
                            sync.execute(text("UPDATE clients SET instagram = 'keep_me'"))
                        if already_applied != "notes":
                            notes.upgrade()
                        if already_applied != "instagram":
                            instagram.upgrade()
                        merge.upgrade()
                    lesson = sync.execute(text("SELECT id, notes, photos FROM lessons")).one()
                    client = sync.execute(text("SELECT id, instagram FROM clients")).one()
                    assert tuple(lesson) == (1, "keep me" if already_applied == "notes" else "", [])
                    assert tuple(client) == (1, "keep_me" if already_applied == "instagram" else None)
                await connection.run_sync(migrate)
            finally:
                await transaction.rollback()
    asyncio.run(run())
