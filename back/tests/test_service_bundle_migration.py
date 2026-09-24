"""Exercise the actual Alembic upgrade/downgrade in an isolated test schema."""
import importlib.util
from pathlib import Path
from uuid import uuid4

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from database import engine


async def test_bundle_migration_upgrade_constraints_and_downgrade():
    path = Path(__file__).parents[1] / 'migrations/versions/a261cf96dd5a_service_bundles.py'
    spec = importlib.util.spec_from_file_location('bundle_migration', path)
    revision = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(revision)
    followup_path = path.with_name('b48e71d920af_defer_bundle_part_foreign_key.py')
    followup_spec = importlib.util.spec_from_file_location('bundle_fk_migration', followup_path)
    followup = importlib.util.module_from_spec(followup_spec)
    followup_spec.loader.exec_module(followup)
    async with engine.connect() as conn:
        tx = await conn.begin()
        try:
            schema = 'bundle_migration_' + uuid4().hex
            await conn.execute(text(f'CREATE SCHEMA {schema}'))
            await conn.execute(text(f'SET LOCAL search_path TO {schema}'))
            await conn.execute(text('CREATE TABLE services (id INTEGER PRIMARY KEY)'))
            await conn.execute(text('INSERT INTO services VALUES (1), (2), (3)'))
            def migrate(connection, action):
                with Operations.context(MigrationContext.configure(connection)):
                    action()
            await conn.run_sync(migrate, revision.upgrade)
            await conn.run_sync(migrate, followup.upgrade)
            await conn.execute(text('INSERT INTO service_bundle_items (bundle_id, service_id, position) VALUES (1, 2, 0), (1, 3, 1)'))
            # A part is protected even if a caller bypasses the service endpoint.
            savepoint = await conn.begin_nested()
            try:
                await conn.execute(text('DELETE FROM services WHERE id=2'))
                await conn.execute(text('SET CONSTRAINTS ALL IMMEDIATE'))
                raise AssertionError('Deleting a referenced part must fail')
            except IntegrityError:
                await savepoint.rollback()
            await conn.execute(text('DELETE FROM services WHERE id=1'))
            assert await conn.scalar(text('SELECT count(*) FROM service_bundle_items')) == 0
            assert await conn.scalar(text('SELECT count(*) FROM services')) == 2
            await conn.execute(text('INSERT INTO services VALUES (1)'))
            await conn.execute(text('INSERT INTO service_bundle_items (bundle_id, service_id, position) VALUES (1, 2, 0), (1, 3, 1)'))
            await conn.execute(text('DELETE FROM services'))
            await conn.execute(text('SET CONSTRAINTS ALL IMMEDIATE'))
            assert await conn.scalar(text('SELECT count(*) FROM service_bundle_items')) == 0
            await conn.execute(text('INSERT INTO services VALUES (2), (3)'))
            await conn.run_sync(migrate, followup.downgrade)
            await conn.run_sync(migrate, revision.downgrade)
            assert await conn.scalar(text("SELECT to_regclass('service_bundle_items')")) is None
            assert await conn.scalar(text('SELECT count(*) FROM services')) == 2
        finally:
            await tx.rollback()
