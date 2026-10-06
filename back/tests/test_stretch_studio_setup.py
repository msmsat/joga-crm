from datetime import datetime, timezone
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
            await setup_studio(self.sessions, studio_id=16, owner_email='tokarmaria1106@gmail.com', apply=True)
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
