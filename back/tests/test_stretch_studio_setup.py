from datetime import datetime, timezone, date
from sqlalchemy import select, func
import models as m
from stretch_support import StretchCase


class SetupTests(StretchCase):
    async def run_setup(self, apply=True):
        from services.stretch_setup import setup_studio
        return await setup_studio(self.sessions, studio_id=17, owner_email='sadomat31@gmail.com',
            apply=apply, now=datetime(2026, 10, 6, 0, tzinfo=timezone.utc))

    async def test_preview_rolls_back_everything(self):
        result = await self.run_setup(False)
        self.assertTrue(result['ready'])
        self.assertFalse(result['complete'])
        self.assertEqual(result['weekly_templates'], 17)
        async with self.sessions() as db:
            self.assertEqual(await db.scalar(select(func.count()).select_from(m.Service)), 0)
            self.assertEqual(await db.scalar(select(func.count()).select_from(m.Lesson)), 0)
            self.assertEqual((await db.get(m.Studio, 17)).name, 'стретч')

    async def test_native_catalogue_schedule_and_repeat(self):
        first = await self.run_setup()
        second = await self.run_setup()
        self.assertTrue(first['complete'])
        self.assertEqual(first['service_ids'], second['service_ids'])
        self.assertGreater(first['schedule']['created'], 60)
        self.assertEqual(second['schedule']['created'], 0)
        async with self.sessions.begin() as db:
            self.assertEqual(await db.scalar(select(func.count()).select_from(m.RecurringLessonTemplate)), 17)
            packages = (await db.scalars(select(m.SubscriptionPackage))).all()
            self.assertEqual(len(packages), 10)
            self.assertEqual(sorted(p.class_count for p in packages if len(p.service_ids)==3), [4,9,13,18,27])
            self.assertTrue(all(p.duration_days==30 for p in packages if len(p.service_ids)==1))
            self.assertEqual(await db.scalar(select(func.count()).select_from(m.Client)), 0)
            self.assertEqual(await db.scalar(select(func.count()).select_from(m.ClientPayment)), 0)
            source = await db.get(m.Studio, 16)
            self.assertEqual(source.name, 'MY STRETCH')
            self.assertIsNone(source.tz_iana)
            service = await db.get(m.Service, first['service_ids']['back'])
            service.name = 'Власна назва'
        await self.run_setup()
        async with self.sessions() as db:
            self.assertEqual((await db.get(m.Service, first['service_ids']['back'])).name, 'Власна назва')

    async def test_wrong_owner_ambiguous_branch_and_manual_name_stop(self):
        from services.stretch_setup import setup_studio
        with self.assertRaises(ValueError):
            await setup_studio(self.sessions, studio_id=16, owner_email='sadomat31@gmail.com', apply=True)
        async with self.sessions.begin() as db:
            db.add(m.Service(studio_id=17, name='Здорова спина', price=123, max_clients=3))
        result = await self.run_setup()
        self.assertFalse(result['ready'])
        async with self.sessions.begin() as db:
            await db.delete(await db.scalar(select(m.Service)))
            db.add_all([m.StudioBranch(studio_id=17,name='A'),m.StudioBranch(studio_id=17,name='B')])
        self.assertFalse((await self.run_setup())['ready'])

    async def test_busy_trainer_prevents_partial_apply(self):
        async with self.sessions.begin() as db:
            db.add(m.StaffBusyInterval(studio_id=17, user_id=6,
                start_time=datetime(2026,10,7,9), end_time=datetime(2026,10,7,10), tz_iana='Europe/Prague'))
        result = await self.run_setup()
        self.assertFalse(result['ready'])
        self.assertTrue(result['schedule']['conflicts'])
        async with self.sessions() as db:
            self.assertEqual(await db.scalar(select(func.count()).select_from(m.Lesson)), 0)

    async def seed_work_studio(self, *, sold=False):
        async with self.sessions.begin() as db:
            cfg = m.StudioSubscriptionProgramConfig(studio_id=16)
            db.add(cfg)
            await db.flush()
            db.add(m.Service(id=59, studio_id=16, name='Стретчинг', category='Стретчинг',
                price=450, duration_min=60, max_clients=10, service_type='group', booking_mode='event'))
            db.add_all([
                m.SubscriptionPackage(id=17, studio_id=16, config_id=cfg.id, name='4 заняття',
                    class_count=4, price=1600, per_visit_price=400, duration_days=30),
                m.SubscriptionPackage(id=18, studio_id=16, config_id=cfg.id, name='8 заннять',
                    class_count=8, price=2800, per_visit_price=350, duration_days=30),
            ])
            db.add(m.StudioBookingSettings(studio_id=16, booking_window_days=7))
            if sold:
                db.add(m.Client(id=90, studio_id=16, name='Existing client'))
                await db.flush()
                db.add(m.ClientSubscription(client_id=90, package_id=18, type='8 заннять',
                    total_classes=8, used_classes=2, expires_at=date(2026,11,1)))

    async def run_work_setup(self, apply=True):
        from services.stretch_setup import setup_studio
        return await setup_studio(self.sessions, studio_id=16, owner_email='tokarmaria1106@gmail.com',
            apply=apply, now=datetime(2026,10,6,0,tzinfo=timezone.utc))

    async def test_work_studio_reuses_unsold_packages_and_repeats_without_duplicates(self):
        await self.seed_work_studio()
        first = await self.run_work_setup()
        self.assertTrue(first['complete'])
        self.assertEqual(first['owner_email'], 'tokarmaria1106@gmail.com')
        second = await self.run_work_setup()
        self.assertEqual(first['service_ids'], second['service_ids'])
        self.assertEqual(second['schedule']['created'], 0)
        async with self.sessions() as db:
            self.assertEqual((await db.get(m.Studio,16)).name, 'MY STRETCH')
            self.assertEqual((await db.get(m.Service,59)).name, 'Стретчинг')
            packages = (await db.scalars(select(m.SubscriptionPackage).where(m.SubscriptionPackage.studio_id==16))).all()
            self.assertEqual(len(packages), 10)
            self.assertEqual((await db.get(m.SubscriptionPackage,18)).class_count, 9)
            self.assertEqual((await db.get(m.SubscriptionPackage,17)).service_ids,
                [first['service_ids'][key] for key in ('back','splits','combined')])
            lessons = (await db.scalars(select(m.Lesson).where(m.Lesson.studio_id==16))).all()
            self.assertGreater(len(lessons), 60)
            self.assertTrue(all(row.teacher_id==44 for row in lessons))
            self.assertEqual((await db.get(m.Studio,17)).name, 'стретч')

    async def test_work_preview_rolls_back_existing_package_changes(self):
        await self.seed_work_studio()
        result = await self.run_work_setup(False)
        self.assertTrue(result['ready'])
        self.assertFalse(result['complete'])
        async with self.sessions() as db:
            self.assertEqual((await db.get(m.SubscriptionPackage,18)).class_count, 8)
            self.assertEqual(await db.scalar(select(func.count()).select_from(m.Service)), 1)
            self.assertEqual(await db.scalar(select(func.count()).select_from(m.Lesson)), 0)
            self.assertIsNone((await db.get(m.Studio,16)).tz_iana)

    async def test_sold_legacy_package_stops_entire_work_setup(self):
        await self.seed_work_studio(sold=True)
        result = await self.run_work_setup()
        self.assertFalse(result['ready'])
        self.assertIn('already sold', result['error'])
        async with self.sessions() as db:
            self.assertEqual((await db.get(m.SubscriptionPackage,18)).class_count, 8)
            subscription = await db.scalar(select(m.ClientSubscription))
            self.assertEqual((subscription.total_classes,subscription.used_classes), (8,2))
            self.assertEqual(await db.scalar(select(func.count()).select_from(m.Lesson)), 0)
            self.assertEqual(await db.scalar(select(func.count()).select_from(m.Service)), 1)
