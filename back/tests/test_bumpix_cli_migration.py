import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from sqlalchemy import create_engine, inspect
from alembic.migration import MigrationContext
from alembic.operations import Operations
from bumpix_fixtures import snapshot, write_package


class CliMigrationTests(unittest.TestCase):
    def test_offline_cli_does_not_load_database_and_can_generate_report(self):
        from scripts.import_bumpix import main
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            path, _ = write_package(root, snapshot())
            report = root / 'report.json'
            import builtins
            original = builtins.__import__
            def guarded(name, *args, **kwargs):
                if name == 'database':
                    raise AssertionError('Offline verification loaded database')
                return original(name, *args, **kwargs)
            with patch('builtins.__import__', guarded):
                self.assertEqual(main(['--input', str(path), '--verify-only', '--report', str(report)]), 0)
            self.assertTrue(report.is_file())

    def test_migration_creates_model_equivalent_schema_and_downgrades_only_source_tables(self):
        from models import Base, Studio, User, Client, ClientNote
        from models.bumpix import BumpixClient, BumpixSnapshot, BumpixEvent, BumpixMedia
        path = Path(__file__).parents[1] / 'migrations/versions/b96d3210e4a7_bumpix_import_history.py'
        spec = importlib.util.spec_from_file_location('bumpix_test_migration', path)
        migration = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(migration)
        engine = create_engine('sqlite://')
        self.addCleanup(engine.dispose)
        with engine.begin() as conn:
            Base.metadata.create_all(conn, tables=[m.__table__ for m in (Studio, User, Client, ClientNote)])
            with Operations.context(MigrationContext.configure(conn)):
                migration.upgrade()
                inspector = inspect(conn)
                for model in (BumpixClient, BumpixSnapshot, BumpixEvent, BumpixMedia):
                    self.assertEqual({c['name'] for c in inspector.get_columns(model.__tablename__)}, set(model.__table__.columns.keys()))
                    self.assertEqual({tuple(c['column_names']) for c in inspector.get_unique_constraints(model.__tablename__)},
                                     {tuple(c.columns.keys()) for c in model.__table__.constraints if c.__class__.__name__ == 'UniqueConstraint'})
                migration.downgrade()
                self.assertEqual(set(inspect(conn).get_table_names()), {'studios', 'users', 'clients', 'client_notes'})


if __name__ == '__main__':
    unittest.main()
