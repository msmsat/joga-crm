"""Temporary, explicit table fixtures; no connection to the application database."""
import tempfile
import unittest
from pathlib import Path
from datetime import datetime, timedelta
from unittest.mock import patch
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from fastapi import HTTPException
import models as m


async def sqlite_interval_guard(db, studio, *, teacher_id, hall_id, start, end, **kw):
    """SQLite has no PostgreSQL INTERVAL; test the same real fixture intervals."""
    from services import booking_time
    instant = booking_time.resolve_interval(start, end, studio.tz_iana)
    for row in (await db.scalars(select(m.Lesson).where(m.Lesson.studio_id == studio.id,
                            m.Lesson.status != 'cancelled'))).all():
        if row.teacher_id != teacher_id and row.hall_id != hall_id:
            continue
        other = booking_time.resolve_interval(row.start_time - timedelta(minutes=row.buffer_before_min),
                    row.start_time + timedelta(minutes=row.duration_min + row.buffer_after_min), row.tz_iana)
        if not instant or not other or other[0] < instant[1] and instant[0] < other[1]:
            raise HTTPException(409, 'Occupied lesson')
    for row in (await db.scalars(select(m.StaffBusyInterval).where(
                    m.StaffBusyInterval.studio_id == studio.id,
                    m.StaffBusyInterval.user_id == teacher_id))).all():
        other = booking_time.resolve_interval(row.start_time, row.end_time, row.tz_iana)
        if not other or other[0] < instant[1] and instant[0] < other[1]:
            raise HTTPException(409, 'Busy trainer')


class StretchCase(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.engine = create_async_engine('sqlite+aiosqlite:///' + str(Path(self.temp.name) / 'db.sqlite'))
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False)
        names = 'Studio User StudioMember Service Hall StudioBranch StudioWorkingHours BranchWorkingHours StaffWorkingHours StaffDayOverride StaffBusyInterval StudioBookingSettings StudioSubscriptionProgramConfig SubscriptionPackage Client ClientSubscription ClientPayment Lesson Reservation StudioDiscountConfig StudioReferralConfig ReferralRecord ClientOffer StudioPromoCode ActivityLog Account Operation PaymentMethodConfig ClientLoyaltyCard LoyaltyLevel StudioLoyaltyConfig GiftCertificate StripeCheckout'.split()
        names += [n for n in ('RecurringLessonTemplate', 'RecurringLessonOccurrence', 'StudioSetupLink') if hasattr(m, n)]
        tables = [getattr(m, n).__table__ for n in names] + [m.user_services, m.ServiceScheduleSlot.__table__]
        async with self.engine.begin() as conn:
            await conn.run_sync(lambda c: m.Base.metadata.create_all(c, tables=tables))
        async with self.sessions.begin() as db:
            db.add_all([m.Studio(id=17, name='стретч', currency='CZK', tz_iana='Europe/Prague'),
                        m.Studio(id=16, name='MY STRETCH', currency='CZK'),
                        m.User(id=6, name='Валерия', email='sadomat31@gmail.com', hashed_password='test-only'),
                        m.User(id=44, name='Марія', email='tokarmaria1106@gmail.com', hashed_password='test-only')])
            await db.flush()
            db.add_all([m.StudioMember(studio_id=17, user_id=6, name='Валерия', role='owner', status='active'),
                        m.StudioMember(studio_id=16, user_id=44, name='Марія', role='owner', status='active')])
            db.add(m.StudioBookingSettings(studio_id=17, booking_window_days=30))
        self.guard = patch('services.schedule_guard.assert_interval_free', sqlite_interval_guard)
        self.guard.start()

    async def asyncTearDown(self):
        self.guard.stop()
        await self.engine.dispose()
        self.temp.cleanup()

    async def timetable(self):
        async with self.sessions.begin() as db:
            hall = m.Hall(studio_id=17, name='Зал', capacity=10)
            service = m.Service(studio_id=17, name='Здорова спина', price=450, duration_min=60,
                                service_type='group', category='Стретчинг', max_clients=10)
            db.add_all([hall, service])
            await db.flush()
            db.add(m.RecurringLessonTemplate(studio_id=17, service_id=service.id, teacher_id=6,
                hall_id=hall.id, key='monday-0900', weekday=0, start_minute=540, duration_min=60,
                total_spots=10, price=450, starts_on=datetime(2026, 10, 6).date()))
