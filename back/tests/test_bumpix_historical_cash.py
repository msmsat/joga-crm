"""Historical receipts use native finance/attendance, without replaying a sale."""
import unittest
from datetime import datetime, date
from sqlalchemy import select, func
import test_bumpix_native as fixtures


class HistoricalCashTests(unittest.IsolatedAsyncioTestCase):
    asyncTearDown = fixtures.NativeImportTests.asyncTearDown
    export = fixtures.NativeImportTests.export
    apply = fixtures.NativeImportTests.apply
    data = fixtures.NativeImportTests.data

    async def asyncSetUp(self):
        await fixtures.NativeImportTests.asyncSetUp(self)
        from models import Base, Account, Operation, ClientPayment, ClientLoyaltyCard, LoyaltyLevel
        async with self.engine.begin() as conn:
            await conn.run_sync(lambda c: Base.metadata.create_all(c, tables=[m.__table__ for m in
                (Account, Operation, ClientPayment, ClientLoyaltyCard, LoyaltyLevel)]))

    async def completed(self, db):
        from models import Lesson, Reservation
        return (await db.execute(select(Lesson, Reservation).join(Reservation,
            Reservation.lesson_id == Lesson.id).where(Lesson.source_status == 'completed'))).one()

    async def test_preview_is_read_only_and_reports_historical_receipt(self):
        from models import Account, ClientPayment, Reservation
        self.importer.native_options['historical_cash'] = True
        with self.export(self.data()) as export:
            report = await self.importer.preview(export, 1, 'owner@example.test', {'masters': {'1.1': 2}})
        self.assertTrue(report['ready'], report)
        self.assertEqual(report['historical_cash']['counts'], {'create': 1, 'ineligible': 2})
        self.assertEqual(report['historical_cash']['create_amount'], 1200)
        async with self.sessions() as db:
            for model in (Account, ClientPayment, Reservation):
                self.assertEqual(await db.scalar(select(func.count()).select_from(model)), 0)

    async def test_upgrades_existing_import_and_repeat_never_duplicates_money(self):
        from models import Account, Operation, ClientPayment, Reservation, ClientLoyaltyCard
        from models.bumpix import BumpixJournalLink
        with self.export(self.data()) as export:
            self.assertTrue((await self.apply(export, {'masters': {'1.1': 2}}))['complete'])
            self.importer.native_options['historical_cash'] = True
            self.assertTrue((await self.apply(export, {'masters': {'1.1': 2}}))['complete'])
            self.assertTrue((await self.apply(export, {'masters': {'1.1': 2}}))['complete'])
            # A later ordinary import must keep the receipt and attended marker.
            self.importer.native_options.pop('historical_cash')
            self.assertTrue((await self.apply(export, {'masters': {'1.1': 2}}))['complete'])
        async with self.sessions() as db:
            lesson, reservation = await self.completed(db)
            self.assertEqual(reservation.status, 'attended')
            self.assertFalse(reservation.auto_paid)
            self.assertEqual(reservation.payment_breakdown['method'], 'cash')
            self.assertEqual(reservation.payment_breakdown['total'], 1200)
            self.assertEqual(reservation.payment_breakdown['paid_at'], '2025-08-01T09:00:00')
            self.assertEqual(lesson.source_details['settlement_basis'], 'owner_confirmed_completed_cash')
            payment = await db.get(ClientPayment, reservation.debt_payment_id)
            self.assertEqual((payment.status, payment.item_key, payment.created_at),
                             ('success', str(lesson.id), datetime(2025, 8, 1, 9)))
            op = await db.scalar(select(Operation))
            self.assertEqual((op.amount, op.op_date, op.trainer_id, op.service_id, op.client_id),
                             (1200, date(2025, 8, 1), 2, lesson.service_id, reservation.client_id))
            self.assertEqual((await db.get(Account, op.account_id)).balance, 1200)
            card = await db.scalar(select(ClientLoyaltyCard))
            self.assertEqual((card.total_spent, card.points_balance, card.deposit_balance), (1200, 0, 0))
            self.assertEqual(await db.scalar(select(func.count()).select_from(Operation)), 1)
            self.assertEqual(await db.scalar(select(func.count()).select_from(ClientPayment)), 1)
            for r in (await db.scalars(select(Reservation).where(Reservation.id != reservation.id))).all():
                self.assertIsNone(r.payment_breakdown)
            link = await db.scalar(select(BumpixJournalLink).where(BumpixJournalLink.lesson_id == lesson.id))
            self.assertIn('historical_cash', link.managed_values)

    async def test_manual_paid_booking_keeps_original_payment_but_confirms_attendance(self):
        from models import ClientPayment, Operation
        with self.export(self.data()) as export:
            await self.apply(export, {'masters': {'1.1': 2}})
            async with self.sessions.begin() as db:
                lesson, reservation = await self.completed(db)
                payment = ClientPayment(client_id=reservation.client_id, amount=1200,
                    status='success', description='Previously paid', action_type='lesson', item_key=str(lesson.id))
                db.add(payment)
                await db.flush()
                reservation.debt_payment_id = payment.id
                reservation.payment_breakdown = {'method': 'bank', 'total': 1200, 'paid_at': '2025-08-01T09:01:00'}
            self.importer.native_options['historical_cash'] = True
            result = await self.apply(export, {'masters': {'1.1': 2}})
            self.assertTrue(result['complete'], result)
        async with self.sessions() as db:
            _, reservation = await self.completed(db)
            self.assertEqual(reservation.status, 'attended')
            self.assertEqual(reservation.payment_breakdown['method'], 'bank')
            self.assertEqual(await db.scalar(select(func.count()).select_from(Operation)), 0)
            self.assertEqual(await db.scalar(select(func.count()).select_from(ClientPayment)), 1)

    async def test_manual_no_show_is_preserved_and_never_paid(self):
        from models import Operation
        with self.export(self.data()) as export:
            await self.apply(export, {'masters': {'1.1': 2}})
            async with self.sessions.begin() as db:
                _, reservation = await self.completed(db)
                reservation.no_show = True
            self.importer.native_options['historical_cash'] = True
            result = await self.apply(export, {'masters': {'1.1': 2}})
            self.assertTrue(result['complete'], result)
        async with self.sessions() as db:
            _, reservation = await self.completed(db)
            self.assertTrue(reservation.no_show)
            self.assertEqual(reservation.status, 'active')
            self.assertIsNone(reservation.payment_breakdown)
            self.assertEqual(await db.scalar(select(func.count()).select_from(Operation)), 0)

    async def test_pending_debt_blocks_before_any_writes(self):
        from models import ClientPayment, Operation
        with self.export(self.data()) as export:
            await self.apply(export, {'masters': {'1.1': 2}})
            async with self.sessions.begin() as db:
                lesson, reservation = await self.completed(db)
                payment = ClientPayment(client_id=reservation.client_id, amount=1200, status='pending',
                    description='Manual debt', action_type='lesson', item_key=str(lesson.id))
                db.add(payment)
                await db.flush()
                reservation.debt_payment_id = payment.id
            self.importer.native_options['historical_cash'] = True
            result = await self.apply(export, {'masters': {'1.1': 2}})
            self.assertFalse(result['ready'])
            self.assertIn('unsettled', ' '.join(result['items'][0]['errors']))
        async with self.sessions() as db:
            self.assertEqual(await db.scalar(select(func.count()).select_from(Operation)), 0)

    async def test_deleted_historical_operation_is_not_recreated(self):
        from models import Operation
        self.importer.native_options['historical_cash'] = True
        with self.export(self.data()) as export:
            await self.apply(export, {'masters': {'1.1': 2}})
            async with self.sessions.begin() as db:
                op = await db.scalar(select(Operation))
                self.assertIsNotNone(op)
                await db.delete(op)
            result = await self.apply(export, {'masters': {'1.1': 2}})
            self.assertFalse(result['ready'])
            self.assertIn('receipt', ' '.join(result['items'][0]['errors']))
        async with self.sessions() as db:
            self.assertEqual(await db.scalar(select(func.count()).select_from(Operation)), 0)

    async def test_future_completed_and_cancelled_never_generate_receipts(self):
        from models import Operation, ClientPayment
        data = self.data()
        data['events'][1]['view']['date_millis'] = 1924992000000  # 2031-01-01
        self.importer.native_options['historical_cash'] = True
        with self.export(data) as export:
            self.assertTrue((await self.apply(export, {'masters': {'1.1': 2}}))['complete'])
        async with self.sessions() as db:
            _, reservation = await self.completed(db)
            self.assertEqual(reservation.status, 'active')
            for model in (Operation, ClientPayment):
                self.assertEqual(await db.scalar(select(func.count()).select_from(model)), 0)

    async def test_zero_price_is_paid_without_fake_income_operation(self):
        from models import Operation, ClientPayment
        data = self.data()
        data['events'][1]['view']['income'] = '0'
        self.importer.native_options['historical_cash'] = True
        with self.export(data) as export:
            self.assertTrue((await self.apply(export, {'masters': {'1.1': 2}}))['complete'])
        async with self.sessions() as db:
            _, reservation = await self.completed(db)
            self.assertEqual((reservation.status, reservation.payment_breakdown['total']), ('attended', 0))
            self.assertEqual(await db.scalar(select(func.count()).select_from(Operation)), 0)
            self.assertEqual((await db.scalar(select(ClientPayment))).amount, 0)

    async def test_native_attendance_and_revenue_queries_include_historical_receipt(self):
        from models import Operation, Lesson, Reservation
        from services.client_visits import visit_condition
        self.importer.native_options['historical_cash'] = True
        with self.export(self.data()) as export:
            await self.apply(export, {'masters': {'1.1': 2}})
        async with self.sessions() as db:
            visits = await db.scalar(select(func.count(Reservation.id)).join(Lesson,
                Lesson.id == Reservation.lesson_id).where(Reservation.status == 'attended', Lesson.teacher_id == 2))
            self.assertEqual(visits, 1)
            self.assertEqual(await db.scalar(select(func.sum(Operation.amount)).where(
                Operation.studio_id == 1, Operation.trainer_id == 2,
                Operation.op_date == date(2025, 8, 1), Operation.type == 'in')), 1200)
            self.assertEqual(await db.scalar(select(func.count(Reservation.id)).join(Lesson,
                Lesson.id == Reservation.lesson_id).where(visit_condition(datetime(2026, 10, 5)))), 1)
            from routers.analytics.overview import _period_kpi
            from routers.analytics._filters import ReportFilters
            filters = ReportFilters(date(2025, 8, 1), date(2025, 8, 1), None, None, 2, None)
            kpi = await _period_kpi(filters, 1, db)
            self.assertEqual((kpi['attendance'], kpi['revenue'], kpi['profit']), (1, 1200, 1200))
            other = await _period_kpi(filters, 2, db)
            self.assertEqual((other['attendance'], other['revenue']), (0, 0))

    async def test_corrects_unmarked_booking_but_never_changes_a_cashier_receipt(self):
        from models import Account, Operation
        self.importer.native_options['historical_cash'] = True
        with self.export(self.data()) as export:
            await self.apply(export, {'masters': {'1.1': 2}})
            async with self.sessions.begin() as db:
                op = await db.scalar(select(Operation))
                op.amount = 1199
            result = await self.apply(export, {'masters': {'1.1': 2}})
            self.assertFalse(result['ready'])
            self.assertIn('receipt', ' '.join(result['items'][0]['errors']))
        async with self.sessions() as db:
            self.assertEqual((await db.scalar(select(Operation))).amount, 1199)
            self.assertEqual((await db.scalar(select(Account))).balance, 1200)

    async def test_creation_failure_rolls_back_visit_and_money_together(self):
        from unittest.mock import patch
        from models import Operation, ClientPayment, Reservation
        self.importer.native_options['historical_cash'] = True
        with self.export(self.data()) as export:
            with patch('services.bumpix_import.historical_cash.record_historical_spending',
                       side_effect=ValueError('injected failure')):
                result = await self.apply(export, {'masters': {'1.1': 2}})
            self.assertFalse(result['complete'])
            self.assertIn('injected failure', result['error'])
        async with self.sessions() as db:
            for model in (Operation, ClientPayment, Reservation):
                self.assertEqual(await db.scalar(select(func.count()).select_from(model)), 0)

    async def test_existing_main_cash_and_other_studio_are_not_mixed(self):
        from models import Account, Operation
        async with self.sessions.begin() as db:
            db.add_all([Account(studio_id=1, name='Main till', type='cash', balance=700, color='#FCAE91'),
                        Account(studio_id=2, name='Історична готівка', type='cash', balance=900, color='#FCAE91')])
        self.importer.native_options['historical_cash'] = True
        with self.export(self.data()) as export:
            self.assertTrue((await self.apply(export, {'masters': {'1.1': 2}}))['complete'])
        async with self.sessions() as db:
            main = await db.scalar(select(Account).where(Account.name == 'Main till'))
            other = await db.scalar(select(Account).where(Account.studio_id == 2))
            receipt = await db.scalar(select(Operation))
            self.assertEqual((main.balance, other.balance), (700, 900))
            self.assertNotIn(receipt.account_id, (main.id, other.id))
            self.assertEqual((await db.get(Account, receipt.account_id)).name, 'Історична готівка')

    async def test_midnight_finish_keeps_receipt_in_the_appointment_day(self):
        from models import Operation
        data = self.data()
        data['events'][1]['view'].update(start_minutes=1410, stop_minutes=1440)
        self.importer.native_options['historical_cash'] = True
        with self.export(data) as export:
            self.assertTrue((await self.apply(export, {'masters': {'1.1': 2}}))['complete'])
            self.assertTrue((await self.apply(export, {'masters': {'1.1': 2}}))['complete'])
        async with self.sessions() as db:
            self.assertEqual((await db.scalar(select(Operation))).op_date, date(2025, 8, 1))

    async def test_ambiguous_historical_account_is_detected_in_preview(self):
        from models import Account, Operation
        async with self.sessions.begin() as db:
            db.add_all([Account(studio_id=1, name='Історична готівка', type='cash', balance=0, color='#FCAE91'),
                        Account(studio_id=1, name='Історична готівка', type='cash', balance=0, color='#FCAE91')])
        self.importer.native_options['historical_cash'] = True
        with self.export(self.data()) as export:
            with self.assertRaisesRegex(ValueError, 'ambiguous'):
                await self.importer.preview(export, 1, 'owner@example.test', {'masters': {'1.1': 2}})
        async with self.sessions() as db:
            self.assertEqual(await db.scalar(select(func.count()).select_from(Operation)), 0)

    async def test_finance_crud_cannot_break_linked_receipt_or_replay_fees(self):
        from types import SimpleNamespace
        from fastapi import HTTPException
        from models import Account, Operation, ClientPayment
        from routers.finances.operations import update_operation, delete_operation
        from schemas.finances.operations import OperationUpdate
        from unittest.mock import patch, AsyncMock
        self.importer.native_options['historical_cash'] = True
        with self.export(self.data()) as export:
            self.assertTrue((await self.apply(export, {'masters': {'1.1': 2}}))['complete'])
        async with self.sessions() as db:
            op = await db.scalar(select(Operation))
            ctx = SimpleNamespace(studio_id=1)
            with patch('routers.finances.operations._apply_platform_fee', new=AsyncMock(
                    side_effect=AssertionError('linked historical receipt reached live fees'))) as fees:
                for action in (
                    lambda: update_operation(op.id, OperationUpdate(amount=1300), ctx, db),
                    lambda: delete_operation(op.id, ctx, db),
                ):
                    with self.assertRaises(HTTPException) as error:
                        await action()
                    self.assertEqual(error.exception.status_code, 409)
                fees.assert_not_awaited()
            self.assertEqual(op.amount, 1200)
            self.assertEqual((await db.get(Account, op.account_id)).balance, 1200)
            self.assertEqual((await db.scalar(select(ClientPayment))).amount, 1200)

    async def test_live_default_cash_excludes_history_even_after_rename(self):
        from models import Account, Operation
        from routers.finances.accounts import get_or_create_default_account
        self.importer.native_options['historical_cash'] = True
        with self.export(self.data()) as export:
            await self.apply(export, {'masters': {'1.1': 2}})
        async with self.sessions.begin() as db:
            op = await db.scalar(select(Operation))
            history = await db.get(Account, op.account_id)
            history.name = 'Renamed history'
            live = await get_or_create_default_account(db, 1)
            self.assertNotEqual(live.id, history.id)
            self.assertEqual((live.type, live.balance, history.balance), ('cash', 0, 1200))

    async def test_ordinary_import_validates_saved_receipt_after_manual_no_show(self):
        from models import Operation
        self.importer.native_options['historical_cash'] = True
        with self.export(self.data()) as export:
            await self.apply(export, {'masters': {'1.1': 2}})
            async with self.sessions.begin() as db:
                op = await db.scalar(select(Operation))
                await db.delete(op)
                _, reservation = await self.completed(db)
                reservation.no_show, reservation.status = True, 'active'
            self.importer.native_options.pop('historical_cash')
            result = await self.apply(export, {'masters': {'1.1': 2}})
            self.assertFalse(result['ready'])
            self.assertIn('receipt', ' '.join(result['items'][0]['errors']))

    async def test_source_only_price_update_can_be_synchronized_before_cash(self):
        from models import ClientPayment, Operation
        with self.export(self.data()) as export:
            await self.apply(export, {'masters': {'1.1': 2}})
        data = self.data()
        data['events'][1]['view']['income'] = '1300'
        self.importer.native_options['historical_cash'] = True
        with self.export(data) as export:
            result = await self.apply(export, {'masters': {'1.1': 2}})
            self.assertTrue(result['complete'], result)
        async with self.sessions() as db:
            self.assertEqual((await db.scalar(select(Operation))).amount, 1300)
            self.assertEqual((await db.scalar(select(ClientPayment))).amount, 1300)

    async def test_historical_account_cannot_be_deleted_or_its_ledger_overwritten(self):
        from types import SimpleNamespace
        from fastapi import HTTPException
        from models import Account, Operation
        from routers.finances.accounts import update_account, delete_account
        from schemas.finances.accounts import AccountUpdate
        self.importer.native_options['historical_cash'] = True
        with self.export(self.data()) as export:
            await self.apply(export, {'masters': {'1.1': 2}})
        async with self.sessions() as db:
            op = await db.scalar(select(Operation))
            ctx = SimpleNamespace(studio_id=1)
            for action in (
                lambda: update_account(op.account_id, AccountUpdate(balance=0), ctx, db),
                lambda: update_account(op.account_id, AccountUpdate(type='bank'), ctx, db),
                lambda: delete_account(op.account_id, ctx, db),
            ):
                with self.assertRaises(HTTPException) as error:
                    await action()
                self.assertEqual(error.exception.status_code, 409)
            renamed = await update_account(op.account_id, AccountUpdate(name='History'), ctx, db)
            self.assertEqual((renamed.name, renamed.balance, renamed.type), ('History', 1200, 'cash'))
            self.assertEqual(await db.scalar(select(func.count()).select_from(Operation)), 1)

    async def test_renamed_historical_account_is_reused_for_new_receipts(self):
        from models import Account
        self.importer.native_options['historical_cash'] = True
        with self.export(self.data()) as export:
            await self.apply(export, {'masters': {'1.1': 2}})
        async with self.sessions.begin() as db:
            history = await db.scalar(select(Account))
            history.name = 'Renamed history'
        from bumpix_fixtures import snapshot
        data = snapshot(cid='1.101', name='Another client')
        for event in data['events']:
            event['view']['income'] = '1200'
            event['raw']['e'] = '1.22'
        data['events'][0]['view']['date_millis'] = 1894320000000
        with self.export(data, cid='1.101') as export:
            result = await self.apply(export, {'masters': {'1.1': 2}})
            self.assertTrue(result['complete'], result)
        async with self.sessions() as db:
            self.assertEqual(await db.scalar(select(func.count()).select_from(Account)), 1)
            self.assertEqual((await db.scalar(select(Account))).balance, 2400)
