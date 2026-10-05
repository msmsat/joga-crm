"""An explicitly accepted source pair never exempts unrelated live bookings."""
import unittest
from datetime import datetime
from sqlalchemy import select, func
import test_bumpix_native as fixtures


class ScheduleExceptionTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = fixtures.NativeImportTests.asyncSetUp
    asyncTearDown = fixtures.NativeImportTests.asyncTearDown
    apply = fixtures.NativeImportTests.apply
    def pair_export(self):
        from bumpix_fixtures import snapshot, add_photo, write_package, write_index
        from services.bumpix_import.archive import open_export
        entries = []
        for cid, name, start in (('1.100', 'First client', 600), ('1.101', 'Second client', 630)):
            data = snapshot(cid, name)
            for event in data['events']:
                event['view']['income'] = '1200'
                event['raw']['e'] = '1.22'
            data['events'][0]['view'].update(date_millis=1894233600000,
                                           start_minutes=start, stop_minutes=start + 60)
            photos = dict([add_photo(data), add_photo(data, 'avatar', color='blue')])
            path, sid = write_package(self.root, data, photos)
            entries.append((cid, path, sid))
        write_index(self.root, entries)
        return open_export(self.root)

    def accepted(self, export):
        from services.bumpix_import.schedule_exceptions import acceptance_for
        return {'masters': {'1.1': 2}, 'accepted_overlaps': [
            acceptance_for(export, ('3.1000', '3.1010'), {'1.1': 2}, {}, 'Europe/Prague')]}

    async def test_unaccepted_future_pair_still_blocks(self):
        with self.pair_export() as export:
            report = await self.importer.preview(export, 1, 'owner@example.test', {'masters': {'1.1': 2}})
        self.assertFalse(report['ready'])
        self.assertIn('overlap', ' '.join(report['items'][1]['errors']))

    async def test_accepted_pair_imports_both_without_shifting_or_duplicates(self):
        from models import Lesson, Reservation
        with self.pair_export() as export:
            mapping = self.accepted(export)
            for _ in range(2):
                result = await self.apply(export, mapping)
                self.assertTrue(result['complete'], result)
        async with self.sessions() as db:
            lessons = (await db.scalars(select(Lesson).where(Lesson.source_status == 'new')
                                       .order_by(Lesson.start_time))).all()
            self.assertEqual([l.start_time for l in lessons],
                             [datetime(2030, 1, 10, 10), datetime(2030, 1, 10, 10, 30)])
            for lesson in lessons:
                self.assertEqual((lesson.teacher_id, lesson.duration_min, lesson.price), (2, 60, 1200))
                self.assertTrue(lesson.photos)
                reservation = await db.scalar(select(Reservation).where(Reservation.lesson_id == lesson.id))
                self.assertEqual(reservation.status, 'active')
                self.assertIsNone(reservation.payment_breakdown)
            self.assertEqual(await db.scalar(select(func.count()).select_from(Lesson)), 6)

    async def test_resume_accepts_only_the_already_committed_source_partner(self):
        from unittest.mock import patch
        with self.pair_export() as export:
            mapping = self.accepted(export)
            original = self.importer._save
            async def fail_second(db, package, *args, **kwargs):
                if package.client_id == '1.101':
                    raise ValueError('Injected interruption')
                return await original(db, package, *args, **kwargs)
            with patch.object(self.importer, '_save', side_effect=fail_second):
                first = await self.apply(export, mapping)
            self.assertFalse(first['complete'])
            self.assertEqual(first['failed_source_client_id'], '1.101')
            resumed = await self.apply(export, mapping)
            self.assertTrue(resumed['complete'], resumed)

    async def test_exception_never_exempts_an_unrelated_crm_booking(self):
        from models import Lesson
        with self.pair_export() as export:
            mapping = self.accepted(export)
            async with self.sessions.begin() as db:
                db.add(Lesson(studio_id=1, teacher_id=2, teacher_name='Trainer', name='Manual booking',
                    start_time=datetime(2030, 1, 10, 10, 45), duration_min=15,
                    tz_iana='Europe/Prague', price=1200, status='confirmed', level='', equipment=''))
            result = await self.apply(export, mapping)
            self.assertFalse(result['ready'])
            self.assertIn('overlaps native lesson', ' '.join(result['items'][0]['errors']))

    async def test_changed_buffer_does_not_broaden_the_accepted_intervals(self):
        from models import Lesson
        with self.pair_export() as export:
            mapping = self.accepted(export)
            self.assertTrue((await self.apply(export, mapping))['complete'])
            async with self.sessions.begin() as db:
                lesson = await db.scalar(select(Lesson).where(Lesson.source_status == 'new'))
                lesson.buffer_before_min = 5
            result = await self.apply(export, mapping)
            self.assertFalse(result['ready'])

    async def test_changed_source_interval_or_unknown_event_is_rejected(self):
        with self.pair_export() as export:
            for mutation in ('interval', 'unknown', 'account', 'teacher'):
                mapping = self.accepted(export)
                accepted = mapping['accepted_overlaps'][0]
                if mutation == 'interval':
                    accepted['events']['3.1000']['start'] = '2030-01-10T09:00:00'
                elif mutation == 'unknown':
                    accepted['events']['3.9999'] = accepted['events'].pop('3.1000')
                elif mutation == 'account':
                    accepted['account_key'] = 'b' * 64
                else:
                    accepted['events']['3.1000']['teacher_user_id'] = 1
                with self.assertRaises(ValueError):
                    await self.importer.preview(export, 1, 'owner@example.test', mapping)
