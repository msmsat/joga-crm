from datetime import datetime, timedelta, timezone
from sqlalchemy import select, func
from stretch_support import StretchCase
import models as m

NOW = datetime(2026, 10, 6, 0, tzinfo=timezone.utc)


class RecurringTests(StretchCase):
    async def generate(self, now=NOW):
        from services.recurring_schedule import generate_for_studio
        async with self.sessions.begin() as db:
            return await generate_for_studio(db, 17, now=now)

    async def test_repeat_and_daily_replenishment(self):
        await self.timetable()
        first = await self.generate()
        self.assertEqual(first['created'], 4)
        self.assertEqual((await self.generate())['created'], 0)
        self.assertEqual((await self.generate(NOW + timedelta(days=7)))['created'], 1)

    async def test_moves_cancellations_and_deleted_occurrence_never_reappear(self):
        await self.timetable()
        await self.generate()
        async with self.sessions.begin() as db:
            rows = (await db.scalars(select(m.Lesson).order_by(m.Lesson.id))).all()
            rows[0].status = 'cancelled'
            rows[1].start_time += timedelta(days=1)
            # PostgreSQL SET NULL is represented explicitly in SQLite fixture.
            occurrence = await db.scalar(select(m.RecurringLessonOccurrence).where(
                                    m.RecurringLessonOccurrence.lesson_id == rows[2].id))
            occurrence.lesson_id = None
            await db.delete(rows[2])
        self.assertEqual((await self.generate())['created'], 0)
        async with self.sessions() as db:
            self.assertEqual(await db.scalar(select(func.count()).select_from(m.Lesson)), 3)

    async def test_prague_dst_preserves_nine_in_morning(self):
        await self.timetable()
        await self.generate()
        async with self.sessions() as db:
            from services import studio_time
            rows = (await db.scalars(select(m.Lesson).order_by(m.Lesson.start_time))).all()
            self.assertEqual({r.start_time.hour for r in rows}, {9})
            studio = await db.get(m.Studio, 17)
            hours = [studio_time.to_utc(r.start_time, studio).hour for r in rows]
            self.assertIn(7, hours)
            self.assertIn(8, hours)

    async def test_unknown_timezone_fails_closed(self):
        await self.timetable()
        async with self.sessions.begin() as db:
            (await db.get(m.Studio, 17)).tz_iana = None
        with self.assertRaises(ValueError):
            await self.generate()

    async def test_conflict_is_reported_and_retryable_without_moving_manual_lesson(self):
        await self.timetable()
        async with self.sessions.begin() as db:
            db.add(m.Lesson(studio_id=17, teacher_id=6, teacher_name='Валерия', name='Manual',
                start_time=datetime(2026, 10, 12, 9), tz_iana='Europe/Prague', duration_min=60,
                price=450, total_spots=10, level='', equipment=''))
        result = await self.generate()
        self.assertEqual(result['created'], 3)
        self.assertEqual(len(result['conflicts']), 1)
        async with self.sessions.begin() as db:
            (await db.scalar(select(m.Lesson).where(m.Lesson.name == 'Manual'))).status = 'cancelled'
        self.assertEqual((await self.generate())['created'], 1)

    async def test_inactive_teacher_does_not_receive_generated_lessons(self):
        await self.timetable()
        async with self.sessions.begin() as db:
            (await db.scalar(select(m.StudioMember).where(m.StudioMember.studio_id == 17))).status = 'pending'
        result = await self.generate()
        self.assertEqual(result['created'], 0)
        self.assertTrue(result['conflicts'])
