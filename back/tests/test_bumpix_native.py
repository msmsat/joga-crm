import unittest
from datetime import datetime
from sqlalchemy import select, func
import test_bumpix_import as fixtures


class NativeImportTests(unittest.IsolatedAsyncioTestCase):
    asyncTearDown = fixtures.ImportTests.asyncTearDown
    def export(self, data=None, cid='1.100'):
        if data:
            data['counts'] = {k: len(v) for k, v in data['groups'].items()}
        return fixtures.ImportTests.export(self, data, cid)
    apply = fixtures.ImportTests.apply

    async def asyncSetUp(self):
        await fixtures.ImportTests.asyncSetUp(self)
        from models import Base, Studio, Service, StaffBusyInterval, user_services
        tables = [Service.__table__, StaffBusyInterval.__table__, user_services]
        if 'bumpix_service_links' in Base.metadata.tables:
            tables.append(Base.metadata.tables['bumpix_service_links'])
        async with self.engine.begin() as conn:
            await conn.run_sync(lambda c: Base.metadata.create_all(c, tables=tables))
        async with self.sessions.begin() as db:
            studio = await db.get(Studio, 1)
            studio.tz_iana = 'Europe/Prague'
            studio.currency = 'CZK'
        self.importer.native = True
        self.importer.native_options = {'timezone': 'Europe/Prague', 'currency': 'CZK'}

    def data(self):
        from bumpix_fixtures import snapshot
        data = snapshot()
        data['profile']['birthday'] = 633916800000
        for event in data['events']:
            event['view']['income'] = '1200'
            event['raw']['e'] = '1.22'
        data['events'][0]['view']['date_millis'] = 1894233600000  # 2030-01-10
        return data

    async def test_all_records_have_native_lessons_and_photos_in_both_note_places(self):
        from models import Client, ClientNote, Lesson, Reservation
        with self.export(self.data()) as export:
            first = await self.apply(export, {'masters': {'1.1': 1}})
            self.assertTrue(first['complete'])
        async with self.sessions() as db:
            lessons = (await db.scalars(select(Lesson))).all()
            self.assertEqual(len(lessons), 3)
            self.assertEqual({l.source_status for l in lessons}, {'new', 'completed', 'canceled'})
            photographed = next(l for l in lessons if l.photos)
            self.assertEqual(photographed.notes, 'Event note')
            note = await db.scalar(select(ClientNote).where(ClientNote.lesson_id == photographed.id))
            self.assertEqual(note.photos, photographed.photos)
            self.assertIn('Event note', note.text)
            self.assertIn('2030-01-10', note.text)
            client = await db.scalar(select(Client))
            self.assertEqual(client.birth_date.isoformat(), '1990-02-02')
            self.assertTrue(client.avatar_url.startswith(f'/clients/{client.id}/media/'))
            self.assertTrue(client.avatar_color)
            for r in (await db.scalars(select(Reservation))).all():
                self.assertIsNone(r.debt_payment_id)
                self.assertIsNone(r.subscription_id)

    async def test_repeat_preserves_manual_lesson_note_and_does_not_duplicate(self):
        from models import Lesson, ClientNote
        with self.export(self.data()) as export:
            await self.apply(export, {'masters': {'1.1': 1}})
            async with self.sessions.begin() as db:
                lesson = await db.scalar(select(Lesson))
                self.assertIsNotNone(lesson)
                lesson.notes = 'Manual lesson note'
                note = await db.scalar(select(ClientNote).where(ClientNote.lesson_id == lesson.id))
                note.text = 'Manual client note'
            again = await self.apply(export, {'masters': {'1.1': 1}})
            self.assertTrue(again['complete'])
        async with self.sessions() as db:
            self.assertEqual(await db.scalar(select(func.count()).select_from(Lesson)), 3)
            self.assertEqual(await db.scalar(select(func.count()).select_from(ClientNote)), 4)
            self.assertEqual((await db.scalar(select(Lesson))).notes, 'Manual lesson note')

    async def test_native_preview_requires_master_mapping(self):
        with self.export(self.data()) as export:
            preview = await self.importer.preview(export, 1, 'owner@example.test')
        self.assertFalse(preview['ready'])
        self.assertIn('master', ' '.join(preview['items'][0]['errors']).lower())

    async def test_cancel_and_completion_refresh_reservation(self):
        from models import Lesson, Reservation
        with self.export(self.data()) as export:
            await self.apply(export, {'masters': {'1.1': 1}})
        for status in ('canceled', 'new', 'completed'):
            data = self.data()
            data['events'][0]['view']['status'] = status
            # The fixture groups also record the exact source status.
            eid = data['events'][0]['view']['id']
            for ids in data['groups'].values():
                if eid in ids:
                    ids.remove(eid)
            data['groups'][{'new': 't2', 'completed': 't3', 'canceled': 't4'}[status]].append(eid)
            data['groups']['t1'].append(eid)
            if status == 'completed':
                data['events'][0]['view']['date_millis'] = 1736467200000
            with self.export(data) as export:
                result = await self.apply(export, {'masters': {'1.1': 1}})
                self.assertTrue(result['complete'], result)
            async with self.sessions() as db:
                reservation = await db.scalar(select(Reservation).join(Lesson).where(Lesson.source_status == status).order_by(Lesson.id))
                self.assertEqual(reservation.status, 'cancelled' if status == 'canceled' else 'active')
                self.assertEqual(reservation.closed_at is not None, status != 'new')

    async def test_avatar_manual_deletion_and_source_removal_are_preserved(self):
        from models import Client
        with self.export(self.data()) as export:
            await self.apply(export, {'masters': {'1.1': 1}})
            async with self.sessions.begin() as db:
                client = await db.scalar(select(Client))
                client.avatar_url = None
            self.assertTrue((await self.apply(export, {'masters': {'1.1': 1}}))['complete'])
        async with self.sessions() as db:
            self.assertIsNone((await db.scalar(select(Client))).avatar_url)

    async def test_removed_future_event_is_retired(self):
        from models import Lesson, Reservation
        with self.export(self.data()) as export:
            await self.apply(export, {'masters': {'1.1': 1}})
        data = self.data()
        eid = data['events'].pop(0)['view']['id']
        data['media'] = [p for p in data['media'] if p['owner_id'] != eid]
        for ids in data['groups'].values():
            if eid in ids:
                ids.remove(eid)
        data['counts'] = {k: len(v) for k, v in data['groups'].items()}
        data['history_ids'].remove(eid)
        data['history_count'] = len(data['history_ids'])
        # Keep an avatar; export() supplies fixture media otherwise.
        from bumpix_fixtures import add_photo
        photos = dict([add_photo(data, 'avatar', color='blue')])
        from bumpix_fixtures import write_package
        from services.bumpix_import.archive import open_export
        path, _ = write_package(self.root, data, photos)
        with open_export(path) as export:
            self.assertTrue((await self.apply(export, {'masters': {'1.1': 1}}))['complete'])
        async with self.sessions() as db:
            lesson = await db.scalar(select(Lesson).where(Lesson.start_time == datetime(2030, 1, 10, 10)))
            self.assertEqual(lesson.status, 'cancelled')
            reservation = await db.scalar(select(Reservation).where(Reservation.lesson_id == lesson.id))
            self.assertEqual(reservation.status, 'cancelled')

    async def test_refresh_into_existing_future_booking_is_rejected(self):
        from models import Lesson
        with self.export(self.data()) as export:
            await self.apply(export, {'masters': {'1.1': 1}})
        async with self.sessions.begin() as db:
            db.add(Lesson(studio_id=1, name='Manual', teacher_name='Owner', teacher_id=1,
                start_time=datetime(2030, 1, 10, 12), tz_iana='Europe/Prague', duration_min=60,
                price=0, total_spots=1, level='', equipment='', status='confirmed'))
        data = self.data()
        data['events'][0]['view'].update(start_minutes=720, stop_minutes=780)
        with self.export(data) as export:
            preview = await self.importer.preview(export, 1, 'owner@example.test', {'masters': {'1.1': 1}})
            self.assertFalse(preview['ready'])

    async def test_booking_created_after_preview_is_rechecked(self):
        from models import Lesson
        preview = self.importer.preview
        async def racing_preview(*args, **kwargs):
            result = await preview(*args, **kwargs)
            async with self.sessions.begin() as db:
                db.add(Lesson(studio_id=1, name='Race booking', teacher_name='Owner', teacher_id=1,
                    start_time=datetime(2030, 1, 10, 10), tz_iana='Europe/Prague', duration_min=60,
                    price=0, total_spots=1, level='', equipment='', status='confirmed'))
            return result
        self.importer.preview = racing_preview
        with self.export(self.data()) as export:
            result = await self.apply(export, {'masters': {'1.1': 1}})
            self.assertFalse(result['complete'])
            self.assertIn('overlap', result['error'])
        async with self.sessions() as db:
            self.assertEqual(await db.scalar(select(func.count()).select_from(Lesson)), 1)

    async def test_busy_interval_prevents_future_import(self):
        from models import StaffBusyInterval
        async with self.sessions.begin() as db:
            db.add(StaffBusyInterval(studio_id=1, user_id=1, start_time=datetime(2030, 1, 10, 9),
                end_time=datetime(2030, 1, 10, 11), tz_iana='Europe/Prague'))
        with self.export(self.data()) as export:
            result = await self.apply(export, {'masters': {'1.1': 1}})
            self.assertFalse(result['ready'])
            self.assertIn('staff block', ' '.join(result['items'][0]['errors']))

    async def test_deleted_notes_are_not_recreated(self):
        from models import ClientNote
        from models.bumpix import BumpixClient, BumpixJournalLink
        with self.export(self.data()) as export:
            await self.apply(export, {'masters': {'1.1': 1}})
            async with self.sessions.begin() as db:
                binding = await db.scalar(select(BumpixClient))
                profile = await db.get(ClientNote, binding.note_id)
                await db.delete(profile)
                binding.note_id = None  # Same effect as PostgreSQL ON DELETE SET NULL.
                link = await db.scalar(select(BumpixJournalLink))
                event_note = await db.get(ClientNote, link.note_id)
                await db.delete(event_note)
                link.note_id = None
            result = await self.apply(export, {'masters': {'1.1': 1}})
            self.assertTrue(result['complete'], result)
        async with self.sessions() as db:
            self.assertEqual(await db.scalar(select(func.count()).select_from(ClientNote)), 2)

    async def test_master_refresh_updates_native_name_and_assignment(self):
        from models import Lesson, user_services
        with self.export(self.data()) as export:
            await self.apply(export, {'masters': {'1.1': 1}})
            result = await self.apply(export, {'masters': {'1.1': 2}})
            self.assertTrue(result['complete'], result)
        async with self.sessions() as db:
            lessons = (await db.scalars(select(Lesson))).all()
            self.assertEqual({l.teacher_id for l in lessons}, {2})
            self.assertEqual({l.teacher_name for l in lessons}, {'Trainer'})
            self.assertTrue(await db.scalar(select(user_services.c.user_id).where(user_services.c.user_id == 2)))

    async def test_all_client_fields_and_long_service_titles_are_native(self):
        from models import Client, Lesson, ClientNote
        data = self.data()
        data['profile'].update(phone2='+420777000002', address='Prague test address', email='invalid email', categories=['1.2'])
        data['lookups']['categories'] = [{'0': '1.2', '2': 'VIP test'}]
        data['events'][0]['view']['services'] = 'S' * 118
        with self.export(data) as export:
            result = await self.apply(export, {'masters': {'1.1': 1}})
            self.assertTrue(result['complete'], result)
        async with self.sessions() as db:
            client = await db.scalar(select(Client))
            self.assertEqual(client.phone2, '+420777000002')
            self.assertEqual(client.address, 'Prague test address')
            self.assertEqual(client.tags, ['VIP test'])
            self.assertEqual(client.balance, '17.50')
            self.assertIsNone(client.email)
            note = await db.scalar(select(ClientNote).where(ClientNote.lesson_id.is_(None)))
            self.assertIn('Email: invalid email', note.text)
            self.assertEqual(len((await db.scalar(select(Lesson).order_by(Lesson.id))).name), 118)

    async def test_native_notes_follow_current_master_and_hide_original_snapshots(self):
        from types import SimpleNamespace
        from models import Lesson, ClientNote
        from schemas.schedule.lessons import LessonRead
        from schemas.schedule.lessons import BookedClient
        from services.bumpix_import.note_access import visible_notes
        with self.export(self.data()) as export:
            await self.apply(export, {'masters': {'1.1': 1}})
        async with self.sessions.begin() as db:
            lesson = await db.scalar(select(Lesson).order_by(Lesson.id))
            lesson.teacher_id = 2
            await db.flush()
            await db.refresh(lesson, ['reservations'])
            public = LessonRead.model_validate(lesson).model_dump()
            self.assertNotIn('source_details', public)
            self.assertNotIn('original', public)
            booked = BookedClient.model_validate({'reservation_id': 1, 'client_id': 1, 'name': 'Test',
                'status': 'active', 'attendance_known': False})
            self.assertFalse(booked.model_dump()['attendance_known'])
            ctx = SimpleNamespace(studio_id=1, role='trainer', user=SimpleNamespace(id=2))
            notes = (await db.scalars(select(ClientNote).where(*visible_notes(ctx)))).all()
            self.assertEqual(len(notes), 2)  # General profile + this master's appointment.
            self.assertEqual({n.lesson_id for n in notes if n.lesson_id}, {lesson.id})

    def changed_event(self, status):
        data = self.data()
        eid = data['events'][0]['view']['id']
        for ids in data['groups'].values():
            if eid in ids:
                ids.remove(eid)
        if status == 'removed':
            data['events'].pop(0)
            data['history_ids'].remove(eid)
            data['history_count'] = len(data['history_ids'])
        else:
            data['events'][0]['view']['status'] = status
            data['groups']['t1'].append(eid)
            data['groups'][{'new': 't2', 'completed': 't3', 'canceled': 't4'}[status]].append(eid)
        return data

    async def financially_changed_booking(self, kind):
        from datetime import date
        from models import Base, ClientPayment, ClientSubscription, Lesson, Reservation
        async with self.engine.begin() as conn:
            await conn.run_sync(lambda c: Base.metadata.create_all(c, tables=[ClientPayment.__table__, ClientSubscription.__table__]))
        with self.export(self.data()) as export:
            self.assertTrue((await self.apply(export, {'masters': {'1.1': 1}}))['complete'])
        async with self.sessions.begin() as db:
            r = await db.scalar(select(Reservation).join(Lesson).where(Lesson.source_status == 'new'))
            if kind == 'debt':
                item = ClientPayment(client_id=r.client_id, amount=1200, description='Manual payment',
                    status='pending', action_type='lesson', item_key=str(r.lesson_id))
                db.add(item)
                await db.flush()
                r.debt_payment_id = item.id
            else:
                item = ClientSubscription(client_id=r.client_id, type='Manual package', total_classes=10,
                    used_classes=1, expires_at=date(2031, 1, 1))
                db.add(item)
                await db.flush()
                r.subscription_id = item.id
            rid, lid = r.id, r.lesson_id
        for status in ('canceled', 'removed'):
            with self.export(self.changed_event(status)) as export:
                preview = await self.importer.preview(export, 1, 'owner@example.test', {'masters': {'1.1': 1}})
                self.assertFalse(preview['ready'], preview)
                self.assertIn('financial', ' '.join(preview['items'][0]['errors']).lower())
                result = await self.apply(export, {'masters': {'1.1': 1}})
                self.assertFalse(result['complete'])
            async with self.sessions() as db:
                r, lesson = await db.get(Reservation, rid), await db.get(Lesson, lid)
                self.assertEqual(lesson.status, 'confirmed')
                self.assertEqual(r.status, 'active')
                self.assertIsNone(r.closed_at)
                self.assertIsNotNone(r.debt_payment_id if kind == 'debt' else r.subscription_id)
                if kind == 'subscription':
                    self.assertEqual((await db.get(ClientSubscription, r.subscription_id)).used_classes, 1)

    async def test_debt_prevents_source_cancellation_and_removal(self):
        await self.financially_changed_booking('debt')

    async def test_charged_subscription_prevents_source_cancellation_and_removal(self):
        await self.financially_changed_booking('subscription')

    async def test_removed_event_can_reappear_without_duplicates(self):
        from models import Lesson, Reservation
        with self.export(self.data()) as export:
            await self.apply(export, {'masters': {'1.1': 1}})
        with self.export(self.changed_event('removed')) as export:
            self.assertTrue((await self.apply(export, {'masters': {'1.1': 1}}))['complete'])
        with self.export(self.data()) as export:
            self.assertTrue((await self.apply(export, {'masters': {'1.1': 1}}))['complete'])
        async with self.sessions() as db:
            self.assertEqual(await db.scalar(select(func.count()).select_from(Lesson)), 3)
            r = await db.scalar(select(Reservation).join(Lesson).where(Lesson.source_status == 'new'))
            self.assertEqual(r.status, 'active')
            self.assertIsNone(r.closed_at)

    async def test_changed_service_preserves_manual_service_choice(self):
        from models import Lesson, Service
        with self.export(self.data()) as export:
            await self.apply(export, {'masters': {'1.1': 1}})
        async with self.sessions.begin() as db:
            manual = Service(studio_id=1, name='Manual', price=1200, duration_min=60)
            db.add(manual)
            await db.flush()
            lesson = await db.scalar(select(Lesson).where(Lesson.source_status == 'new'))
            lesson.service_id = manual.id
        data = self.data()
        data['events'][0]['raw']['e'] = '1.999'
        with self.export(data) as export:
            preview = await self.importer.preview(export, 1, 'owner@example.test', {'masters': {'1.1': 1}})
            self.assertFalse(preview['ready'])
            self.assertIn('service', ' '.join(preview['items'][0]['errors']).lower())

    async def test_link_existing_card_fills_empty_fields_and_preserves_manual_values(self):
        from models import Client
        async with self.sessions.begin() as db:
            client = Client(studio_id=1, name='Manual name', address='Manual address', tags=[])
            db.add(client)
            await db.flush()
            cid = client.id
        data = self.data()
        data['profile'].update(phone2='+420777000002', address='Source address')
        with self.export(data) as export:
            result = await self.apply(export, {'clients': {'1.100': cid}, 'masters': {'1.1': 1}})
            self.assertTrue(result['complete'], result)
        async with self.sessions() as db:
            client = await db.get(Client, cid)
            self.assertEqual(client.name, 'Manual name')
            self.assertEqual(client.address, 'Manual address')
            self.assertEqual(client.birth_date.isoformat(), '1990-02-02')
            self.assertEqual(client.phone2, '+420777000002')
            self.assertEqual(await db.scalar(select(func.count()).select_from(Client)), 1)

    async def test_long_source_name_can_link_and_remains_visible_in_normal_note(self):
        from models import Client, ClientNote
        async with self.sessions.begin() as db:
            client = Client(studio_id=1, name='Manual short name')
            db.add(client)
            await db.flush()
            cid = client.id
        data = self.data()
        data['profile']['name'] = 'N' * 101
        with self.export(data) as export:
            result = await self.apply(export, {'clients': {'1.100': cid}, 'masters': {'1.1': 1}})
            self.assertTrue(result['complete'], result)
        async with self.sessions() as db:
            self.assertEqual((await db.get(Client, cid)).name, 'Manual short name')
            self.assertIn('N' * 101, (await db.scalar(select(ClientNote).where(ClientNote.lesson_id.is_(None)))).text)

    async def test_legacy_profile_note_gets_invalid_contact_visible_on_upgrade(self):
        from models import ClientNote
        from models.bumpix import BumpixClient
        data = self.data()
        data['profile']['email'] = 'invalid email'
        with self.export(data) as export:
            await self.apply(export, {'masters': {'1.1': 1}})
            async with self.sessions.begin() as db:
                binding = await db.scalar(select(BumpixClient))
                note = await db.get(ClientNote, binding.note_id)
                note.text = data['profile']['comment']
                values = dict(binding.managed_values)
                values.pop('_profile_note_format', None)
                binding.managed_values = values
            result = await self.apply(export, {'masters': {'1.1': 1}})
            self.assertTrue(result['complete'], result)
        async with self.sessions() as db:
            self.assertIn('Email: invalid email', (await db.scalar(select(ClientNote).where(ClientNote.lesson_id.is_(None)))).text)


if __name__ == '__main__':
    unittest.main()
