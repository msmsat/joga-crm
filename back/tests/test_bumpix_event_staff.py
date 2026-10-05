"""One Bumpix account can describe several performers in service names."""
import unittest
from sqlalchemy import select, func
import test_bumpix_native as native_fixtures
from types import SimpleNamespace
from services.bumpix_import.staff_mapping import staff_by_service_category


class CategoryStaffTests(unittest.TestCase):
    def test_limited_scope_keeps_index_order_and_only_selected_event_overrides(self):
        from scripts.prepare_bumpix_staff import select_staff_scope
        from services.bumpix_import.archive import ExportSet
        packages = [SimpleNamespace(client_id=cid, snapshot_id='snapshot-' + cid,
            snapshot={'events': [{'view': {'id': eid}}]})
            for cid, eid in [('1.10', '3.1'), ('1.100', '3.2'), ('1.2', '3.3')]]
        source = ExportSet('account', 'full-fingerprint', packages)
        selected, overrides = select_staff_scope(source, {'3.1': 7, '3.3': 7}, 2)
        self.assertEqual([p.client_id for p in selected.packages], ['1.10', '1.100'])
        self.assertEqual(overrides, {'3.1': 7})
        self.assertNotEqual(selected.fingerprint, source.fingerprint)
        self.assertEqual(len(source.packages), 3)
        for limit in (0, -1, 4):
            with self.subTest(limit=limit), self.assertRaises(ValueError):
                select_staff_scope(source, {}, limit)

    def test_reviewed_archive_without_category_labels_is_supported(self):
        from scripts.prepare_bumpix_staff import ACCOUNT, REVIEWED_FINGERPRINT, validate_reviewed_source
        export = SimpleNamespace(account_key=ACCOUNT, fingerprint=REVIEWED_FINGERPRINT,
                                 packages=[SimpleNamespace(snapshot={'lookups': {'categories': []}})])
        validate_reviewed_source(export)

    def test_unreviewed_snapshot_is_rejected_even_with_same_account_and_counts(self):
        from scripts.prepare_bumpix_staff import ACCOUNT, validate_reviewed_source
        with self.assertRaisesRegex(ValueError, 'fingerprint'):
            validate_reviewed_source(SimpleNamespace(account_key=ACCOUNT, fingerprint='0' * 64))

    def test_conflicting_category_label_is_rejected(self):
        from scripts.prepare_bumpix_staff import ACCOUNT, REVIEWED_FINGERPRINT, validate_reviewed_source
        export = SimpleNamespace(account_key=ACCOUNT, fingerprint=REVIEWED_FINGERPRINT,
            packages=[SimpleNamespace(snapshot={'lookups': {'categories': [{'0': '2.4', '2': 'Other'}]}})])
        with self.assertRaisesRegex(ValueError, 'category'):
            validate_reviewed_source(export)

    def export(self, categories):
        services = [{'0': str(i), 'a': category, '2': 'Same name for every service'}
                    for i, category in enumerate(categories)]
        event = {'raw': {'e': ','.join(s['0'] for s in services)},
                 'view': {'id': '5.3599', 'master_id': '1.1'}}
        return SimpleNamespace(packages=[SimpleNamespace(snapshot={
            'events': [event], 'lookups': {'services': services}})])

    def test_exact_category_and_uncategorized_add_on_select_anastasia(self):
        for categories in (['2.4'], ['2.4', '']):
            self.assertEqual(staff_by_service_category(self.export(categories), {'1.1': 1}, {'2.4': 2}),
                             {'5.3599': 2})

    def test_unmapped_categories_keep_the_confirmed_source_account_staff(self):
        self.assertEqual(staff_by_service_category(self.export(['1.1', '1.2', '']), {'1.1': 1}, {'2.4': 2}), {})

    def test_two_named_categories_with_different_staff_stop(self):
        with self.assertRaisesRegex(ValueError, 'different staff'):
            staff_by_service_category(self.export(['1.1', '2.4']), {'1.1': 1}, {'2.4': 2})

    def test_missing_service_stops_instead_of_assigning_default(self):
        export = self.export(['2.4'])
        export.packages[0].snapshot['lookups']['services'] = []
        with self.assertRaisesRegex(ValueError, 'Missing source service'):
            staff_by_service_category(export, {'1.1': 1}, {'2.4': 2})


class EventStaffTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = native_fixtures.NativeImportTests.asyncSetUp
    asyncTearDown = native_fixtures.NativeImportTests.asyncTearDown
    export = native_fixtures.NativeImportTests.export
    apply = native_fixtures.NativeImportTests.apply
    data = native_fixtures.NativeImportTests.data

    async def test_expanding_batch_updates_old_appointments_adds_missing_clients_and_repeats(self):
        from contextlib import ExitStack
        from models import Client, Lesson, ClientNote
        from models.bumpix import BumpixClient, BumpixEvent
        from bumpix_fixtures import snapshot, write_package
        from services.bumpix_import.archive import ExportSet, open_export
        from scripts.prepare_bumpix_staff import select_staff_scope
        with ExitStack() as contexts:
            first = contexts.enter_context(self.export(self.data()))
            self.assertTrue((await self.apply(first, {'masters': {'1.1': 1}}))['complete'])
            async with self.sessions() as db:
                old_id = await db.scalar(select(Client.id))
            packages = list(first.packages)
            for cid in ('1.101', '1.102'):
                path, _ = write_package(self.root, snapshot(cid, name='New ' + cid, with_events=False))
                packages.extend(contexts.enter_context(open_export(path)).packages)
            eid = first.packages[0].snapshot['events'][1]['view']['id']
            selected, overrides = select_staff_scope(ExportSet(first.account_key, 'full', packages), {eid: 2}, 2)
            mapping = {'masters': {'1.1': 1}, 'event_masters': overrides,
                       'clients': {'1.100': old_id, '1.101': 'create'}}
            preview = await self.importer.preview(selected, 1, 'owner@example.test', mapping)
            self.assertTrue(preview['ready'], preview)
            self.assertEqual(preview['counts'], {'skip': 1, 'create': 1})
            self.assertEqual(preview['items'][0]['native_events'], {'update': 3})
            result = await self.apply(selected, mapping)
            self.assertTrue(result['complete'], result)
            async with self.sessions() as db:
                note_count = await db.scalar(select(func.count()).select_from(ClientNote))
            again = await self.apply(selected, mapping)
            self.assertTrue(again['complete'], again)
        async with self.sessions() as db:
            self.assertEqual(await db.scalar(select(func.count()).select_from(Client)), 2)
            self.assertEqual(await db.scalar(select(func.count()).select_from(Lesson)), 3)
            self.assertEqual(await db.scalar(select(func.count()).select_from(ClientNote)), note_count)
            self.assertEqual(await db.scalar(select(BumpixClient.client_id).where(BumpixClient.source_client_id == '1.100')), old_id)
            self.assertIsNone(await db.scalar(select(BumpixClient.id).where(BumpixClient.source_client_id == '1.102')))
            self.assertEqual(await db.scalar(select(BumpixEvent.teacher_user_id).where(BumpixEvent.source_event_id == eid)), 2)

    async def test_explicit_event_staff_keeps_original_master_and_native_media(self):
        from models import ClientNote, Lesson
        from models.bumpix import BumpixEvent, BumpixJournalLink
        data = self.data()
        eid = data['events'][0]['view']['id']
        mapping = {'masters': {'1.1': 1}, 'event_masters': {eid: 2}}
        with self.export(data) as export:
            result = await self.apply(export, mapping)
            self.assertTrue(result['complete'], result)
        async with self.sessions() as db:
            event = await db.scalar(select(BumpixEvent).where(BumpixEvent.source_event_id == eid))
            self.assertEqual(event.master_source_id, '1.1')
            self.assertEqual(event.payload['raw']['b'], '1.1')
            self.assertEqual(event.teacher_user_id, 2)
            link = await db.scalar(select(BumpixJournalLink).where(BumpixJournalLink.event_id == event.id))
            lesson = await db.get(Lesson, link.lesson_id)
            self.assertEqual(lesson.teacher_id, 2)
            self.assertEqual(lesson.teacher_name, 'Trainer')
            self.assertTrue(lesson.photos)
            note = await db.get(ClientNote, link.note_id)
            self.assertEqual(note.author_id, 2)
            self.assertEqual(note.photos, lesson.photos)

    async def test_repeat_without_override_preserves_persisted_event_staff(self):
        from models import Lesson
        from models.bumpix import BumpixEvent
        data = self.data()
        eid = data['events'][0]['view']['id']
        with self.export(data) as export:
            first = await self.apply(export, {'masters': {'1.1': 1}, 'event_masters': {eid: 2}})
            self.assertTrue(first['complete'], first)
            again = await self.apply(export, {'masters': {'1.1': 1}})
            self.assertTrue(again['complete'], again)
            # Default inference must ignore the deliberate per-event exception.
            inferred = await self.apply(export)
            self.assertTrue(inferred['complete'], inferred)
        async with self.sessions() as db:
            self.assertEqual(await db.scalar(select(func.count()).select_from(Lesson)), 3)
            event = await db.scalar(select(BumpixEvent).where(BumpixEvent.source_event_id == eid))
            self.assertEqual(event.teacher_user_id, 2)
            self.assertEqual(await db.scalar(select(func.count()).select_from(Lesson).where(Lesson.teacher_id == 2)), 1)

    async def test_override_reassigns_existing_import_without_duplicates(self):
        from models import Lesson, Reservation
        data = self.data()
        eid = data['events'][1]['view']['id']
        with self.export(data) as export:
            first = await self.apply(export, {'masters': {'1.1': 1}})
            self.assertTrue(first['complete'], first)
            fixed = await self.apply(export, {'masters': {'1.1': 1}, 'event_masters': {eid: 2}})
            self.assertTrue(fixed['complete'], fixed)
        async with self.sessions() as db:
            self.assertEqual(await db.scalar(select(func.count()).select_from(Lesson)), 3)
            self.assertEqual(await db.scalar(select(func.count()).select_from(Reservation)), 3)
            self.assertEqual(await db.scalar(select(func.count()).select_from(Lesson).where(Lesson.teacher_id == 2)), 1)

    async def test_unknown_event_and_foreign_staff_are_rejected_before_writes(self):
        from models import User, StudioMember, Lesson
        async with self.sessions.begin() as db:
            db.add(User(id=3, email='foreign@example.test', name='Foreign', hashed_password='dummy'))
            await db.flush()
            db.add(StudioMember(studio_id=2, user_id=3, name='Foreign', role='trainer', status='active'))
        data = self.data()
        eid = data['events'][0]['view']['id']
        for overrides in ({'9.999': 2}, {eid: 3}, {eid: True}, {eid: '2'}):
            with self.subTest(overrides=overrides), self.export(self.data()) as export:
                with self.assertRaises(ValueError):
                    await self.apply(export, {'masters': {'1.1': 1}, 'event_masters': overrides})
        async with self.sessions() as db:
            self.assertEqual(await db.scalar(select(func.count()).select_from(Lesson)), 0)

    async def test_future_overlap_checks_use_the_actual_event_staff(self):
        from models import Lesson
        data = self.data()
        eid = data['events'][0]['view']['id']
        async with self.sessions.begin() as db:
            from datetime import datetime
            db.add(Lesson(studio_id=1, name='Existing trainer booking', teacher_name='Trainer', teacher_id=2,
                start_time=datetime(2030, 1, 10, 10, 0), duration_min=60, total_spots=1,
                price=1200, status='confirmed', tz_iana='Europe/Prague', booking_mode='event', level='', equipment=''))
        with self.export(data) as export:
            preview = await self.importer.preview(export, 1, 'owner@example.test',
                {'masters': {'1.1': 1}, 'event_masters': {eid: 2}})
            self.assertFalse(preview['ready'], preview)
            self.assertIn('overlap', ' '.join(preview['items'][0]['errors']).lower())

    async def test_paid_import_cannot_be_reassigned_as_a_side_effect(self):
        from models import Lesson, Reservation
        data = self.data()
        eid = data['events'][0]['view']['id']
        with self.export(data) as export:
            first = await self.apply(export, {'masters': {'1.1': 1}})
            self.assertTrue(first['complete'], first)
            async with self.sessions.begin() as db:
                reservation = await db.scalar(select(Reservation).join(Lesson).where(Lesson.source_status == 'new'))
                reservation.auto_paid = True
            preview = await self.importer.preview(export, 1, 'owner@example.test',
                {'masters': {'1.1': 1}, 'event_masters': {eid: 2}})
            self.assertFalse(preview['ready'], preview)
            self.assertIn('financial', ' '.join(preview['items'][0]['errors']).lower())

    async def test_staff_lookup_excludes_same_name_in_another_studio(self):
        from models import User, StudioMember
        from scripts.prepare_bumpix_staff import target_staff
        async with self.sessions.begin() as db:
            local = await db.scalar(select(StudioMember).where(StudioMember.studio_id == 1, StudioMember.user_id == 2))
            local.name = 'Анастасія'
            db.add(User(id=3, email='other-ana@example.test', name='Анастасія', hashed_password='dummy'))
            await db.flush()
            db.add(StudioMember(studio_id=2, user_id=3, name='Анастасія', role='trainer', status='active'))
        async with self.sessions() as db:
            studio, owner, trainer = await target_staff(db, 'owner@example.test')
            self.assertEqual((studio.id, owner.user_id, trainer.user_id), (1, 1, 2))

    async def test_staff_lookup_stops_when_two_trainers_have_same_first_name(self):
        from models import User, StudioMember
        from scripts.prepare_bumpix_staff import target_staff
        async with self.sessions.begin() as db:
            local = await db.scalar(select(StudioMember).where(StudioMember.studio_id == 1, StudioMember.user_id == 2))
            local.name = 'Анастасія'
            db.add(User(id=3, email='another-ana@example.test', name='Анастасія', hashed_password='dummy'))
            await db.flush()
            db.add(StudioMember(studio_id=1, user_id=3, name='Анастасія', role='trainer', status='active'))
        async with self.sessions() as db:
            with self.assertRaisesRegex(ValueError, 'exactly one active trainer'):
                await target_staff(db, 'owner@example.test')
