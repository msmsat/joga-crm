from datetime import date, datetime, timedelta, timezone
from sqlalchemy import select
from stretch_support import StretchCase
import models as m

NOW = datetime(2026, 10, 6, 8, tzinfo=timezone.utc)


class FreezeTests(StretchCase):
    async def prepare(self, pending=False):
        async with self.sessions.begin() as db:
            db.add(m.Client(id=1, studio_id=17, name='Client', status='active', is_active=True))
            db.add(m.StudioSubscriptionProgramConfig(studio_id=17, is_enabled=True, max_freeze_days=14))
            await db.flush()
            db.add(m.ClientSubscription(id=1, client_id=1, type='8 занять', total_classes=9,
                 used_classes=0, expires_at=date(2026, 11, 1), status='pending' if pending else 'active'))

    async def change(self, frozen, now=NOW):
        from services.subscription_freeze import freeze_for_client, unfreeze_for_client
        async with self.sessions.begin() as db:
            return await (freeze_for_client if frozen else unfreeze_for_client)(db, 17, 1, now=now)

    async def test_early_resume_and_repeat_extend_only_once(self):
        await self.prepare()
        await self.change(True)
        await self.change(True)
        later = NOW + timedelta(days=5)
        await self.change(False, later)
        await self.change(False, later)
        async with self.sessions() as db:
            sub = await db.get(m.ClientSubscription, 1)
            self.assertEqual(sub.expires_at, date(2026, 11, 6))
            self.assertEqual(sub.freeze_used_days, 5)
            self.assertFalse(sub.is_frozen)
            self.assertTrue((await db.get(m.Client, 1)).is_active)

    async def test_remaining_allowance_caps_total_at_fourteen(self):
        await self.prepare()
        await self.change(True)
        await self.change(False, NOW + timedelta(days=5))
        await self.change(True, NOW + timedelta(days=6))
        await self.change(False, NOW + timedelta(days=25))
        async with self.sessions() as db:
            sub = await db.get(m.ClientSubscription, 1)
            self.assertEqual(sub.freeze_used_days, 14)
            self.assertEqual(sub.expires_at, date(2026, 11, 15))
        with self.assertRaises(ValueError):
            await self.change(True, NOW + timedelta(days=26))

    async def test_pending_package_does_not_gain_fake_expiry(self):
        await self.prepare(pending=True)
        await self.change(True)
        await self.change(False, NOW + timedelta(days=5))
        async with self.sessions() as db:
            sub = await db.get(m.ClientSubscription, 1)
            self.assertEqual(sub.expires_at, date(2026, 11, 1))
            self.assertIsNone(sub.starts_at)

    async def test_automatic_resume_preserves_manual_disable(self):
        from services.subscription_freeze import resume_due_freezes
        await self.prepare()
        await self.change(True)
        async with self.sessions.begin() as db:
            client = await db.get(m.Client, 1)
            client.status = 'inactive'
        await resume_due_freezes(self.sessions, now=NOW + timedelta(days=15))
        async with self.sessions() as db:
            self.assertFalse((await db.get(m.ClientSubscription, 1)).is_frozen)
            self.assertFalse((await db.get(m.Client, 1)).is_active)
            self.assertEqual((await db.get(m.Client, 1)).status, 'inactive')

    async def test_purchase_during_pause_waits_even_after_original_expiry(self):
        from routers.clients.subscriptions import attach_subscription
        await self.prepare()
        async with self.sessions.begin() as db:
            (await db.get(m.ClientSubscription, 1)).expires_at = NOW.date()+timedelta(days=2)
        await self.change(True)
        async with self.sessions.begin() as db:
            cfg = await db.scalar(select(m.StudioSubscriptionProgramConfig))
            package = m.SubscriptionPackage(studio_id=17, config_id=cfg.id, name='Наступний',
                class_count=4, price=1600, per_visit_price=400, duration_days=30)
            db.add(package)
            await db.flush()
            # Force the formerly broken edge: frozen expiry is now in the past.
            (await db.get(m.ClientSubscription, 1)).expires_at = date(2000,1,1)
            sub = await attach_subscription(db, 17, 1, package, None, mark_paid=False)
            self.assertEqual(sub.status, 'pending')
            self.assertIsNone(sub.starts_at)

    async def test_existing_paid_booking_is_not_silently_cancelled(self):
        await self.prepare()
        async with self.sessions.begin() as db:
            lesson = m.Lesson(studio_id=17, teacher_id=6, teacher_name='Test', name='Test',
                start_time=datetime(2026,10,7,9), tz_iana='Europe/Prague', duration_min=60,
                total_spots=10, price=450, level='', equipment='')
            db.add(lesson)
            await db.flush()
            db.add(m.Reservation(lesson_id=lesson.id, client_id=1, spot_number=1, status='active'))
        with self.assertRaises(ValueError):
            await self.change(True)
        async with self.sessions() as db:
            self.assertEqual((await db.scalar(select(m.Reservation))).status, 'active')
            self.assertFalse((await db.get(m.ClientSubscription,1)).is_frozen)
