"""Run the real migration against disposable SQLite; never load database.py."""
import importlib.util
import unittest
from pathlib import Path
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError
from alembic.migration import MigrationContext
from alembic.operations import Operations


class JournalMigrationTests(unittest.TestCase):
    def test_links_keep_source_identity_after_native_deletion_and_are_unique(self):
        path = Path(__file__).parents[1] / 'migrations/versions/d7318c02f4a6_bumpix_journal.py'
        spec = importlib.util.spec_from_file_location('journal_test_migration', path)
        migration = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(migration)
        engine = create_engine('sqlite://')
        self.addCleanup(engine.dispose)
        with engine.begin() as conn:
            conn.execute(text('PRAGMA foreign_keys=ON'))
            conn.execute(text('CREATE TABLE bumpix_events (id INTEGER PRIMARY KEY, studio_id INTEGER, is_current BOOLEAN, start_time DATETIME)'))
            conn.execute(text('CREATE TABLE lessons (id INTEGER PRIMARY KEY)'))
            conn.execute(text('CREATE TABLE reservations (id INTEGER PRIMARY KEY)'))
            with Operations.context(MigrationContext.configure(conn)):
                migration.upgrade()
                self.assertIn('ix_bumpix_journal_range', {i['name'] for i in inspect(conn).get_indexes('bumpix_events')})
                conn.execute(text('INSERT INTO bumpix_events (id) VALUES (1)'))
                conn.execute(text('INSERT INTO lessons (id) VALUES (2)'))
                conn.execute(text('INSERT INTO reservations (id) VALUES (3)'))
                conn.execute(text('INSERT INTO bumpix_journal_links (event_id, lesson_id, reservation_id) VALUES (1,2,3)'))
                with self.assertRaises(IntegrityError), conn.begin_nested():
                    conn.execute(text('INSERT INTO bumpix_journal_links (event_id) VALUES (1)'))
                conn.execute(text('DELETE FROM lessons WHERE id=2'))
                conn.execute(text('DELETE FROM reservations WHERE id=3'))
                self.assertEqual(conn.execute(text('SELECT event_id, lesson_id, reservation_id FROM bumpix_journal_links')).one(), (1,None,None))
                migration.downgrade()
                self.assertEqual(set(inspect(conn).get_table_names()), {'bumpix_events','lessons','reservations'})
                self.assertEqual(conn.execute(text('SELECT COUNT(*) FROM bumpix_events')).scalar(), 1)


if __name__ == '__main__':
    unittest.main()
