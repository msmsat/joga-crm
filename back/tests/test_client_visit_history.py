"""Offline regression checks; a private in-memory SQLite database only."""
import sqlite3
import unittest
from datetime import date, datetime, timedelta
from types import SimpleNamespace as NS
from sqlalchemy import select
from sqlalchemy.dialects import sqlite
from models import Client
from services.client_segments import category_condition, SegmentRules, resolve_status

NOW = datetime(2026, 10, 5, 12)

def reservation(id=1, **patch):
    lesson = NS(id=id, studio_id=14, status="confirmed", source_status="completed",
                start_time=NOW-timedelta(days=1), duration_min=60, tz_iana="Europe/Prague")
    return NS(**(dict(id=id, lesson_id=id, lesson=lesson, status="active", no_show=False) | patch))

class VisitHistoryTests(unittest.TestCase):
    def test_history_counts_once_and_rejects_cancellation_future_and_no_show(self):
        from services.client_visits import visit_summary
        good = reservation()
        cancelled = reservation(2, status="cancelled")
        absent = reservation(3, no_show=True)
        future = reservation(4)
        future.lesson.start_time=NOW+timedelta(days=1)
        cancelled_lesson=reservation(5)
        cancelled_lesson.lesson.status="cancelled"
        native=reservation(6, status="attended")
        native.lesson.source_status=None
        count, last = visit_summary([good, good, cancelled, absent, future, cancelled_lesson, native], now=NOW)
        self.assertEqual(count, 2)
        self.assertEqual(last, (NOW-timedelta(days=1)).date())

    def test_source_completion_does_not_mark_payment_or_attendance_as_confirmed(self):
        from services.client_visits import appointment_state, attendance_state, payment_state
        r=reservation()
        self.assertEqual(appointment_state(r, now=NOW), "completed")
        self.assertEqual(attendance_state(r, now=NOW), "unknown")
        self.assertEqual(payment_state(r), "unknown")
        r.payment_breakdown={"paid_at":"2026-10-04T10:00:00"}
        self.assertEqual(payment_state(r), "paid")
        r.no_show=True
        self.assertEqual(attendance_state(r, now=NOW), "missed")

    def test_sql_and_python_agree_on_visit_states_and_boundaries(self):
        from sqlalchemy import select
        from models import Lesson, Reservation
        from services.client_visits import is_visit, visit_condition
        cases = [
            ("active", "completed", False, "confirmed", -120, True),
            ("active", "completed", False, "confirmed", -60, True),
            ("active", "completed", False, "confirmed", -30, False),
            ("active", "completed", False, "confirmed", 60, False),
            ("attended", None, False, "confirmed", -30, True),
            ("attended", None, False, "confirmed", 60, False),
            ("attended", None, True, "confirmed", -120, False),
            ("cancelled", "completed", False, "confirmed", -120, False),
            ("active", "completed", False, "cancelled", -120, False),
            ("attended", "canceled", False, "confirmed", -120, False),
            ("pending", "completed", False, "confirmed", -120, False),
            ("hold", "completed", False, "confirmed", -120, False),
        ]
        db=sqlite3.connect(":memory:"); self.addCleanup(db.close)
        db.executescript("CREATE TABLE reservations(id INT,status TEXT,no_show BOOLEAN); CREATE TABLE lessons(id INT,status TEXT,source_status TEXT,start_time TEXT,duration_min INT);")
        for status, source, no_show, lesson_status, offset, expected in cases:
            with self.subTest(status=status,source=source,offset=offset,no_show=no_show):
                r=reservation(status=status,no_show=no_show)
                r.lesson.status=lesson_status; r.lesson.source_status=source
                r.lesson.start_time=NOW+timedelta(minutes=offset)
                self.assertEqual(is_visit(r,now=NOW),expected)
                db.execute("DELETE FROM reservations"); db.execute("DELETE FROM lessons")
                db.execute("INSERT INTO reservations VALUES(1,?,?)",(status,no_show))
                db.execute("INSERT INTO lessons VALUES(1,?,?,?,60)",(lesson_status,source,r.lesson.start_time.isoformat(sep=" ")))
                query=select(Reservation.id).join(Lesson,Lesson.id==Reservation.id).where(visit_condition(NOW))
                sql=str(query.compile(dialect=sqlite.dialect(),compile_kwargs={"literal_binds":True}))
                self.assertEqual(bool(db.execute(sql).fetchall()),expected)

    def test_vip_and_active_sql_use_history_in_same_studio_only(self):
        db=sqlite3.connect(":memory:")
        self.addCleanup(db.close)
        db.executescript("""
        CREATE TABLE clients(id INTEGER, studio_id INTEGER, status TEXT, registration_date TEXT, last_visit_date TEXT);
        CREATE TABLE reservations(id INTEGER, client_id INTEGER, lesson_id INTEGER, status TEXT, no_show BOOLEAN);
        CREATE TABLE lessons(id INTEGER, studio_id INTEGER, status TEXT, source_status TEXT, start_time TEXT, duration_min INTEGER);
        CREATE TABLE client_payments(client_id INTEGER, amount INTEGER, status TEXT);
        INSERT INTO clients VALUES(1,14,'inactive','2020-01-01',NULL),(2,14,'inactive','2020-01-01',NULL);
        INSERT INTO lessons VALUES(1,14,'confirmed','completed','2026-10-04 10:00:00',60),
          (2,15,'confirmed','completed','2026-10-04 10:00:00',60),
          (3,14,'confirmed','completed','2099-10-06 10:00:00',60);
        INSERT INTO reservations VALUES(1,1,1,'active',0),(2,2,2,'active',0),(3,2,3,'active',0);
        """)
        # Занятие 3 — запись ВПЕРЕДИ: визиты для VIP считаются по настоящему
        # «сейчас», и дата «на завтра» (06.10.2026) истекла вместе с днём.
        rules=SegmentRules(vip_min_visits=1)
        cond=category_condition("vip", date(2026,10,5), rules)
        sql=str(select(Client.id).where(cond).compile(dialect=sqlite.dialect(), compile_kwargs={"literal_binds":True}))
        self.assertEqual([r[0] for r in db.execute(sql)], [1])
        cond=category_condition("active", date(2026,10,5), SegmentRules())
        sql=str(select(Client.id).where(cond).compile(dialect=sqlite.dialect(), compile_kwargs={"literal_binds":True}))
        self.assertEqual([r[0] for r in db.execute(sql)], [1])

if __name__ == "__main__": unittest.main()
