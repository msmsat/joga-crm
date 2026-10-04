import unittest
from datetime import datetime, timezone
from sqlalchemy import select, func
import test_bumpix_import as fixtures
from bumpix_fixtures import ACCOUNT


class JournalTests(unittest.IsolatedAsyncioTestCase):
    asyncTearDown = fixtures.ImportTests.asyncTearDown
    export = fixtures.ImportTests.export
    apply = fixtures.ImportTests.apply

    async def asyncSetUp(self):
        await fixtures.ImportTests.asyncSetUp(self)
        from models import Base, Studio, Service, Lesson, Reservation, StaffBusyInterval, user_services
        from models.bumpix import BumpixJournalLink
        from services.bumpix_import.journal import JournalProjector
        async with self.engine.begin() as conn:
            await conn.run_sync(lambda c: Base.metadata.create_all(c, tables=[m.__table__ for m in (Service, Lesson, Reservation, BumpixJournalLink, StaffBusyInterval)] + [user_services]))
        with self.export() as export:
            await self.apply(export, {'masters': {'1.1': 2}})
        async with self.sessions.begin() as db:
            studio = await db.get(Studio, 1)
            studio.tz_iana = 'Europe/Prague'
            studio.currency = 'CZK'
            db.add(Service(id=1, studio_id=1, name='Mapped service', price=2000, duration_min=60))
            event = await db.scalar(select(self.models[3]).where(self.models[3].status == 'new'))
            event.start_time = datetime(2030, 1, 10, 10)
            event.end_time = datetime(2030, 1, 10, 11)
            event.income = '2000.00'
            event.payload = dict(event.payload, raw=dict(event.payload['raw'], e='1.22'))
            self.eid = event.source_event_id
        self.projector = JournalProjector(self.sessions)
        self.mapping = {'timezone': 'Europe/Prague', 'currency': 'CZK', 'services': {'1.22': 1}}
        self.now = datetime(2026, 10, 3, tzinfo=timezone.utc)

    async def project(self, apply=False, mapping=None):
        return await self.projector.run(1, 'owner@example.test', ACCOUNT, mapping or self.mapping, apply=apply, now=self.now)

    async def test_preview_has_no_native_writes_and_reports_exact_data(self):
        from models import Lesson
        report = await self.project()
        self.assertTrue(report['ready'])
        self.assertEqual(report['counts']['create'], 1)
        self.assertEqual(report['items'][0]['price'], 2000)
        self.assertEqual(report['items'][0]['source_event_id'], self.eid)
        async with self.sessions() as db:
            self.assertEqual(await db.scalar(select(func.count()).select_from(Lesson)), 0)

    async def test_apply_repeat_preserves_native_edits_and_no_fake_payments(self):
        from models import Lesson, Reservation
        from models.bumpix import BumpixJournalLink
        self.assertTrue((await self.project(True))['complete'])
        async with self.sessions.begin() as db:
            lesson = await db.scalar(select(Lesson))
            self.assertEqual(lesson.booking_mode, 'event')
            self.assertEqual(lesson.total_spots, 1)
            self.assertEqual(lesson.teacher_id, 2)
            self.assertEqual(lesson.service_id, 1)
            lesson.start_time = datetime(2030, 1, 11, 12)
            reservation = await db.scalar(select(Reservation))
            self.assertEqual(reservation.status, 'active')
            self.assertIsNone(reservation.debt_payment_id)
            self.assertIsNone(reservation.subscription_id)
        again = await self.project(True)
        self.assertEqual(again['counts']['skip'], 1)
        async with self.sessions() as db:
            self.assertEqual(await db.scalar(select(func.count()).select_from(Lesson)), 1)
            self.assertEqual(await db.scalar(select(func.count()).select_from(BumpixJournalLink)), 1)
            self.assertEqual((await db.scalar(select(Lesson))).start_time, datetime(2030, 1, 11, 12))

    async def test_mapping_and_fractional_money_block_without_writes(self):
        from models import Lesson
        missing = await self.project(mapping={'timezone': 'Europe/Prague', 'currency': 'CZK'})
        self.assertFalse(missing['ready'])
        async with self.sessions.begin() as db:
            (await db.scalar(select(self.models[3]).where(self.models[3].status == 'new'))).income = '12.50'
        result = await self.project(True)
        self.assertFalse(result['complete'])
        async with self.sessions() as db:
            self.assertEqual(await db.scalar(select(func.count()).select_from(Lesson)), 0)

    async def test_existing_occupancy_blocks_projection(self):
        from models import Lesson
        async with self.sessions.begin() as db:
            db.add(Lesson(studio_id=1, teacher_id=2, teacher_name='Trainer', name='Existing', start_time=datetime(2030,1,10,10,30), tz_iana='Europe/Prague', duration_min=60, price=10, level='', equipment='', total_spots=1))
        report = await self.project(True)
        self.assertFalse(report['complete'])
        self.assertIn('overlap', report['items'][0]['error'])

    async def test_deleted_link_is_not_recreated(self):
        from models import Lesson
        from models.bumpix import BumpixJournalLink
        await self.project(True)
        async with self.sessions.begin() as db:
            link = await db.scalar(select(BumpixJournalLink))
            link.lesson_id = None
            link.reservation_id = None
            await db.delete(await db.scalar(select(Lesson)))
        report = await self.project(True)
        self.assertEqual(report['counts']['skip'], 1)
        async with self.sessions() as db:
            self.assertEqual(await db.scalar(select(func.count()).select_from(Lesson)), 0)

    async def test_foreign_tenant_and_owner_are_rejected(self):
        with self.assertRaises(ValueError):
            await self.projector.run(2, 'owner@example.test', ACCOUNT, self.mapping, now=self.now)
        with self.assertRaises(ValueError):
            await self.projector.run(1, 'trainer@example.test', ACCOUNT, self.mapping, now=self.now)

    async def test_current_native_teacher_controls_source_photos_and_overlay_excludes_link(self):
        from types import SimpleNamespace
        from models import Lesson
        from services.bumpix_import.reading import conditions
        from services.bumpix_import.journal_reading import range_page, linked_detail
        ctx = SimpleNamespace(studio_id=1, role='trainer', user=SimpleNamespace(id=2))
        async with self.sessions() as db:
            page = await range_page(db, ctx, datetime(2030,1,10), datetime(2030,1,11), 0, 50)
            self.assertEqual(page['total'], 1)
        await self.project(True)
        async with self.sessions.begin() as db:
            lesson = await db.scalar(select(Lesson))
            lesson.teacher_id = 1
            lid = lesson.id
        async with self.sessions() as db:
            self.assertEqual((await range_page(db, ctx, datetime(2030,1,10), datetime(2030,1,11), 0, 50))['total'], 0)
            self.assertIsNone(await linked_detail(db, ctx, lid))
            events = (await db.scalars(select(self.models[3]).where(*conditions(ctx, None)))).all()
            self.assertNotIn(self.eid, [e.source_event_id for e in events])
            ctx.user.id = 1
            detail = await linked_detail(db, ctx, lid)
            self.assertEqual(detail['event']['source_event_id'], self.eid)
            self.assertEqual(len(detail['event']['photos']), 1)
            ctx.studio_id = 2
            self.assertIsNone(await linked_detail(db, ctx, lid))

    async def test_source_range_paginates_every_status_and_preserves_wall_time(self):
        from types import SimpleNamespace
        from services.bumpix_import.journal_reading import range_page, month_days
        ctx = SimpleNamespace(studio_id=1, role='owner', user=SimpleNamespace(id=1))
        async with self.sessions() as db:
            page = await range_page(db, ctx, datetime(2025,8,1), datetime(2025,8,2), 0, 1)
            self.assertEqual(page['total'], 2)
            self.assertEqual(len(page['items']), 1)
            other = await range_page(db, ctx, datetime(2025,8,1), datetime(2025,8,2), 1, 1)
            self.assertNotEqual(page['items'][0]['event']['id'], other['items'][0]['event']['id'])
            self.assertEqual({page['items'][0]['event']['status'], other['items'][0]['event']['status']}, {'completed','canceled'})
            self.assertEqual(page['items'][0]['event']['start_time'], datetime(2025,8,1,10))
            self.assertEqual(await month_days(db, ctx, datetime(2025,8,1), datetime(2025,9,1), []), ['2025-08-01'])
            self.assertEqual(await month_days(db, ctx, datetime(2025,8,1), datetime(2025,9,1), [2]), [])

    async def test_native_timezone_snapshot_and_staff_block_are_respected(self):
        from models import Lesson, StaffBusyInterval, Base
        async with self.engine.begin() as conn:
            await conn.run_sync(lambda c: Base.metadata.create_all(c,tables=[StaffBusyInterval.__table__]))
        async with self.sessions.begin() as db:
            event = await db.scalar(select(self.models[3]).where(self.models[3].status == 'new'))
            event.start_time = datetime(2030,1,10,11)
            event.end_time = datetime(2030,1,10,12)
            db.add(Lesson(studio_id=1,teacher_id=2,teacher_name='Trainer',name='London snapshot',start_time=datetime(2030,1,10,10),tz_iana='Europe/London',duration_min=60,price=10,level='',equipment='',total_spots=1))
        self.assertFalse((await self.project())['ready'])
        async with self.sessions.begin() as db:
            await db.delete(await db.scalar(select(Lesson)))
            db.add(StaffBusyInterval(studio_id=1,user_id=2,start_time=datetime(2030,1,10,10),end_time=datetime(2030,1,10,11),tz_iana='Europe/London'))
        self.assertFalse((await self.project())['ready'])

    async def test_explicit_link_requires_confirmed_matching_service_and_is_unique(self):
        from models import Lesson, Reservation
        async with self.sessions.begin() as db:
            event = await db.scalar(select(self.models[3]).where(self.models[3].status == 'new'))
            lesson = Lesson(studio_id=1,teacher_id=2,teacher_name='Trainer',name='Existing',start_time=event.start_time,tz_iana='Europe/Prague',duration_min=60,price=2000,level='',equipment='',total_spots=1,service_id=1,status='cancelled')
            db.add(lesson)
            await db.flush()
            lid=lesson.id
            db.add(Reservation(lesson_id=lid,client_id=event.client_id,spot_number=1,status='active'))
        mapping=dict(self.mapping,events={self.eid:{'lesson_id':lid}})
        self.assertFalse((await self.project(mapping=mapping))['ready'])
        async with self.sessions.begin() as db:
            (await db.get(Lesson,lid)).status='confirmed'
        report=await self.project(True,mapping)
        self.assertTrue(report['complete'])
        self.assertEqual(report['counts']['link'],1)
        self.assertEqual((await self.project(True,mapping))['counts']['skip'],1)

    async def test_http_range_limits_and_current_teacher_are_enforced(self):
        import importlib.util, sys, types
        from unittest.mock import patch
        from pathlib import Path
        import httpx
        from fastapi import FastAPI
        fake_database=types.ModuleType('database')
        async def get_db():
            async with self.sessions() as db:
                yield db
        fake_database.get_db=get_db
        fake_security=types.ModuleType('security')
        fake_security.SECRET_KEY='fictional';fake_security.ALGORITHM='HS256'
        with patch.dict(sys.modules,{'database':fake_database,'security':fake_security}):
            import dependencies
            spec=importlib.util.spec_from_file_location('journal_test_router',Path(__file__).parents[1]/'routers/schedule/bumpix.py')
            module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        app=FastAPI();app.include_router(module.router,prefix='/schedule')
        ctx=dependencies.StudioContext(user=types.SimpleNamespace(id=1),studio_id=1,role='owner')
        async def context(): return ctx
        app.dependency_overrides[dependencies.get_studio_context]=context
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test') as http:
            path='/schedule/bumpix-events?date_from=2025-08-01&date_to=2025-08-01&limit=1'
            page=(await http.get(path)).json()
            self.assertEqual(page['total'],2);self.assertEqual(len(page['items']),1)
            self.assertEqual((await http.get('/schedule/bumpix-events?date_from=2025-01-01&date_to=2025-08-01')).status_code,422)
            ctx.studio_id=2
            self.assertEqual((await http.get(path)).json()['total'],0)
            ctx.studio_id=1;ctx.role='client'
            self.assertEqual((await http.get(path)).status_code,403)

    async def test_non_specialist_admin_cannot_receive_future_native_lesson(self):
        from models import StudioMember
        async with self.sessions.begin() as db:
            (await db.scalar(select(StudioMember).where(StudioMember.user_id==2,StudioMember.studio_id==1))).role='admin'
        self.assertFalse((await self.project(True))['complete'])
