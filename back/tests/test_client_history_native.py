"""Native imported client -> card counters -> activity -> timeline, offline SQLite."""
import unittest
from types import SimpleNamespace as NS
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
import test_bumpix_native as fixtures

class ClientHistoryTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = fixtures.NativeImportTests.asyncSetUp
    asyncTearDown = fixtures.NativeImportTests.asyncTearDown
    export = fixtures.NativeImportTests.export
    data = fixtures.NativeImportTests.data
    apply = fixtures.NativeImportTests.apply

    async def test_imported_visit_is_visible_in_card_and_timeline_without_duplicate_or_payment(self):
        from models import Base, ActivityLog, Client, ClientSubscription, ClientPayment, ClientLoyaltyCard, LoyaltyPointTransaction, Reservation, Studio, Lesson
        from routers.clients import profiles
        tables=[ActivityLog.__table__, ClientSubscription.__table__, ClientPayment.__table__, ClientLoyaltyCard.__table__, LoyaltyPointTransaction.__table__]
        async with self.engine.begin() as conn:
            await conn.run_sync(lambda c: Base.metadata.create_all(c, tables=tables))
        data=self.data()
        # A completed visit in this month, an upcoming visit and a cancellation.
        from datetime import datetime, timedelta, timezone
        from services import studio_time
        today=studio_time.today(NS(tz_iana='Europe/Prague'))
        for event in data['events']:
            if event['view']['status']=='completed':
                event['view']['date_millis']=int(datetime.combine(today-timedelta(days=1), datetime.min.time(), timezone.utc).timestamp()*1000)
        with self.export(data) as export:
            report=await self.apply(export, {'masters': {'1.1': 1}})
            self.assertTrue(report['complete'])
            again=await self.apply(export, {'masters': {'1.1': 1}})
            self.assertTrue(again['complete'])
        async with self.sessions() as db:
            client=await db.scalar(select(Client).options(selectinload(Client.reservations).selectinload(Reservation.lesson),
                selectinload(Client.subscriptions), selectinload(Client.payments), selectinload(Client.loyalty_card)))
            card=profiles._client_list_item(client)
            self.assertEqual(card.visit_count, 1)
            self.assertEqual(card.total_spent, 0)
            self.assertEqual(card.last_visit_date, (today-timedelta(days=1)).isoformat())
            ctx=NS(studio_id=1,role='owner',user=NS(id=1))
            visits=await profiles.get_client_events(client.id,ctx,ctx.user,db,'visit')
            self.assertEqual(len(visits),3)
            self.assertEqual(len({e.lesson_id for e in visits}),3)
            self.assertEqual({e.appointment_status for e in visits},{'upcoming','completed','cancelled'})
            completed=await profiles.get_client_events(client.id,ctx,ctx.user,db,'completed')
            self.assertEqual(len(completed),1)
            self.assertEqual(completed[0].payment_status,'unknown')
            self.assertEqual(completed[0].attendance_status,'unknown')
            all_events=await profiles.get_client_events(client.id,ctx,ctx.user,db,'all')
            self.assertEqual(len(all_events),3)
            activity=await profiles.get_client_activity(client.id,ctx,ctx.user,db)
            self.assertEqual(sum(p.visits for p in activity),1)
            self.assertEqual(sum(p.payments_total for p in activity),0)
            # Trainer cannot read another master's appointments or activity.
            trainer=NS(studio_id=1,role='trainer',user=NS(id=2))
            from unittest.mock import AsyncMock, patch
            with patch.object(profiles, '_get_client_or_404', AsyncMock(return_value=client)):
                self.assertEqual(await profiles.get_client_events(client.id,trainer,trainer.user,db,'visit'),[])
                activity=await profiles.get_client_activity(client.id,trainer,trainer.user,db)
                self.assertEqual(sum(p.visits for p in activity),0)
