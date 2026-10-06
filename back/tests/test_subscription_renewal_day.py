from datetime import date, datetime, timezone
from fastapi import HTTPException
from sqlalchemy import select
import models as m
from stretch_support import StretchCase


class RenewalTests(StretchCase):
    async def prepare(self):
        async with self.sessions.begin() as db:
            cfg = m.StudioSubscriptionProgramConfig(studio_id=17, is_enabled=True,
                renewal_discount_percent=10)
            db.add(cfg)
            await db.flush()
            a = m.SubscriptionPackage(studio_id=17, config_id=cfg.id, name='4 заняття',
                class_count=4, price=1600, per_visit_price=400, service_ids=[1, 2, 3])
            b = m.SubscriptionPackage(studio_id=17, config_id=cfg.id, name='Індивідуальний',
                class_count=4, price=3600, per_visit_price=900, service_ids=[4])
            db.add_all([a, b, m.Client(id=1, studio_id=17, name='Test', status='active')])
            await db.flush()
            db.add(m.ClientSubscription(id=1, client_id=1, package_id=a.id, type=a.name,
                total_classes=4, used_classes=4, status='finished', expires_at=date(2026, 10, 6)))
            return a.id, b.id

    async def test_local_day_boundaries_and_product_scope(self):
        from services.pricing import resolve_price
        a, b = await self.prepare()
        async with self.sessions.begin() as db:
            for moment, expected in [('2026-10-05T21:59:00', 1600),
                                     ('2026-10-05T22:00:00', 1440),
                                     ('2026-10-06T21:59:00', 1440),
                                     ('2026-10-06T22:00:00', 1600)]:
                quote = await resolve_price(db, 17, 1, 1600, renewal_package_id=a,
                    renewal_at=datetime.fromisoformat(moment).replace(tzinfo=timezone.utc))
                self.assertEqual(quote.final_price, expected)
            now = datetime(2026, 10, 6, 12, tzinfo=timezone.utc)
            self.assertEqual((await resolve_price(db, 17, 1, 3600,
                renewal_package_id=b, renewal_at=now)).final_price, 3600)
            self.assertEqual((await resolve_price(db, 17, 1, 450, renewal_at=now)).final_price, 450)

    async def test_quote_does_not_consume_and_success_is_once(self):
        from services.pricing import resolve_price
        from services.subscription_renewal import consume_renewal
        a, _ = await self.prepare()
        now = datetime(2026, 10, 6, 12, tzinfo=timezone.utc)
        async with self.sessions.begin() as db:
            first = await resolve_price(db, 17, 1, 1600, renewal_package_id=a, renewal_at=now)
            second = await resolve_price(db, 17, 1, 1600, renewal_package_id=a, renewal_at=now)
            self.assertFalse((await db.get(m.ClientSubscription, 1)).renewal_discount_used)
            await consume_renewal(db, first.renewal)
            await db.flush()
            with self.assertRaises(HTTPException):
                await consume_renewal(db, second.renewal)
        async with self.sessions() as db:
            self.assertTrue((await db.get(m.ClientSubscription, 1)).renewal_discount_used)
            self.assertEqual((await resolve_price(db, 17, 1, 1600,
                renewal_package_id=a, renewal_at=now)).final_price, 1600)

    async def test_checkout_and_midnight_payment_share_original_day(self):
        from routers.checkout.router import _quote, consume_quote
        a, _ = await self.prepare()
        async with self.sessions.begin() as db:
            package = await db.get(m.SubscriptionPackage, a)
            now = datetime(2026, 10, 6, 21, 59, tzinfo=timezone.utc)
            quote = await _quote(db, 17, 1, package, 'subscription', None, False, quote_at=now)
            self.assertEqual(quote.resolved.final_price, 1440)
            self.assertEqual((await _quote(db, 17, 1, package, 'subscription', None, False,
                quote_at=datetime(2026, 10, 6, 22, 1, tzinfo=timezone.utc))).resolved.final_price, 1600)
            await consume_quote(db, 17, 1, quote)
            self.assertTrue((await db.get(m.ClientSubscription, 1)).renewal_discount_used)

    async def test_checkout_snapshot_is_stable_and_does_not_switch_previous_subscription(self):
        from types import SimpleNamespace
        from routers.checkout.router import _quote
        from services.subscription_renewal import renewal_payload, checkout_renewal_options, consume_renewal
        from routers.checkout.stripe_pay import business_attempt_id
        a, _ = await self.prepare()
        async with self.sessions.begin() as db:
            package = await db.get(m.SubscriptionPackage,a)
            first = await _quote(db,17,1,package,'subscription',None,False,
                quote_at=datetime(2026,10,6,8,tzinfo=timezone.utc))
            second = await _quote(db,17,1,package,'subscription',None,False,
                quote_at=datetime(2026,10,6,21,59,tzinfo=timezone.utc))
            payload = renewal_payload(first)
            self.assertEqual(payload, renewal_payload(second))
            self.assertEqual(business_attempt_id(17,payload,1440),
                             business_attempt_id(17,renewal_payload(second),1440))
            options = checkout_renewal_options(SimpleNamespace(payload=payload))
            self.assertEqual((await _quote(db,17,1,package,'subscription',None,False,**options)).total_price,1440)
            await consume_renewal(db,first.resolved.renewal)
            db.add(m.ClientSubscription(client_id=1,package_id=a,type=package.name,
                total_classes=4,status='finished',used_classes=4,expires_at=date(2026,10,6)))
            await db.flush()
            # Another expired product must not fund the already consumed checkout.
            self.assertEqual((await _quote(db,17,1,package,'subscription',None,False,**options)).total_price,1600)

    async def test_concurrent_success_only_consumes_once(self):
        import asyncio
        from services.subscription_renewal import renewal_candidate, consume_renewal
        a, _ = await self.prepare()
        async with self.sessions() as db:
            candidate = await renewal_candidate(db,17,1,a,now=datetime(2026,10,6,12,tzinfo=timezone.utc))
        async def redeem():
            try:
                async with self.sessions.begin() as db:
                    await consume_renewal(db,candidate)
                return True
            except HTTPException:
                return False
        self.assertEqual(sorted(await asyncio.gather(redeem(),redeem())),[False,True])

    async def pay_native(self, method):
        from unittest.mock import patch, AsyncMock
        from routers.checkout.router import perform_pay, _quote
        from schemas.checkout import CheckoutPayRequest
        from services.subscription_renewal import renewal_payload
        import routers.checkout.stripe_pay as stripe
        a, _ = await self.prepare()
        async with self.sessions.begin() as db:
            db.add(m.Account(id=1,studio_id=17,name='Test',type='online' if method=='stripe' else 'cash',color='#000000'))
        body=CheckoutPayRequest(client_id=1,product_id=a,product_type='subscription',account_id=1,payment_method='cash')
        async with self.sessions() as db:
            with patch('services.platform_fee.record_offline_fee',new=AsyncMock()), \
                 patch('routers.checkout.router.notify_payment',new=AsyncMock()):
                if method=='cash':
                    await perform_pay(db,17,6,body,method='cash',notify=False,expected_total=1440,
                        quote_at=datetime(2026,10,6,12,tzinfo=timezone.utc))
                else:
                    package=await db.get(m.SubscriptionPackage,a)
                    quote=await _quote(db,17,1,package,'subscription',None,False,
                        quote_at=datetime(2026,10,6,21,59,tzinfo=timezone.utc))
                    db.add(m.StripeCheckout(studio_id=17,user_id=6,session_id='cs_offline_test',
                        account_id='acct_offline_test',amount=1440,application_fee=0,
                        payload={**body.model_dump(mode='json'),**renewal_payload(quote)}))
                    await db.commit()
                    self.assertTrue(await stripe.apply_paid(db,'cs_offline_test'))
                    self.assertFalse(await stripe.apply_paid(db,'cs_offline_test'))
        async with self.sessions() as db:
            payment=await db.scalar(select(m.ClientPayment))
            operation=await db.scalar(select(m.Operation))
            self.assertEqual(payment.amount,1440)
            self.assertEqual(operation.amount,1440)
            self.assertEqual(operation.method,method)
            self.assertEqual(await db.scalar(select(__import__('sqlalchemy').func.count()).select_from(m.ClientPayment)),1)
            self.assertTrue((await db.get(m.ClientSubscription,1)).renewal_discount_used)

    async def test_cash_sale_writes_native_finances(self):
        await self.pay_native('cash')

    async def test_stripe_settlement_writes_native_finances_once(self):
        await self.pay_native('stripe')
