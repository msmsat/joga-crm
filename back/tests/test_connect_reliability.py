"""Connect must preserve account identity under concurrent clicks and failures."""
import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from sqlalchemy import select

from database import async_session_maker
from models import OnlineChannel, Studio
from routers.finances import gateways as G
from services import stripe_connect
import stripe


def test_unreachable_is_not_incomplete_onboarding():
    channel = SimpleNamespace(account_id='acct_existing', is_active=True)
    with patch.object(stripe_connect, 'configured', return_value=True), patch.object(
        stripe_connect, 'account_details', AsyncMock(side_effect=RuntimeError('offline')),
    ):
        result = asyncio.run(G._stripe_read(channel))
    assert result.status_available is False
    assert result.platform_configured is True
    assert result.account_id == 'acct_existing'
    assert result.connected is False


def test_server_not_configured_is_explicit_even_without_account():
    with patch.object(stripe_connect, 'configured', return_value=False):
        result = asyncio.run(G._stripe_read(None))
    assert result.platform_configured is False


def test_real_stripe_account_shape_keeps_payouts_and_requirements_separate():
    account = stripe.Account.construct_from({
        'id': 'acct_shape', 'charges_enabled': True, 'details_submitted': True,
        'payouts_enabled': False,
        'requirements': {'currently_due': [], 'past_due': ['external_account']},
    }, 'sk_test_shape')
    with patch.object(stripe_connect.stripe.Account, 'retrieve', return_value=account):
        details = asyncio.run(stripe_connect.account_details('acct_shape'))
        legacy = asyncio.run(stripe_connect.account_status('acct_shape'))
    assert details == dict(charges_enabled=True, details_submitted=True,
                           requirements_due=True, payouts_enabled=False)
    assert legacy == (True, True, True)


def test_account_creation_has_replay_key_and_live_guard():
    created = SimpleNamespace(id='acct_same')
    with patch.object(stripe_connect.stripe.Account, 'create', return_value=created) as create, patch.object(
        stripe_connect.stripe_env, 'guard_write', return_value=None,
    ):
        result = asyncio.run(stripe_connect.create_account('studio@example.test', idempotency_key='connect:77'))
    assert result == 'acct_same'
    assert create.call_args.kwargs['idempotency_key'] == 'connect:77'


def test_onboarding_and_wallet_registration_obey_live_guard():
    async def run():
        with patch.object(stripe_connect.stripe_env, 'guard_write', side_effect=RuntimeError('live denied')), patch.object(
            stripe_connect.stripe.AccountLink, 'create', side_effect=AssertionError('network call')) as link, patch.object(
            stripe_connect.stripe.PaymentMethodDomain, 'create', side_effect=AssertionError('network call')) as domain:
            try:
                await stripe_connect.onboarding_url('acct_x', 'https://crm.test/return', 'https://crm.test/refresh')
            except RuntimeError:
                pass
            else:
                raise AssertionError('live link mutation was not blocked')
            await stripe_connect.register_payment_method_domain('acct_x', 'crm.test')
            assert link.call_count == domain.call_count == 0
    asyncio.run(run())


def test_parallel_connect_creates_one_account_and_preserves_paused_state():
    async def run():
        async with async_session_maker() as db:
            studio = Studio(name='TEST-CONNECT-CONCURRENCY', email='studio@example.test')
            db.add(studio)
            await db.commit()
            sid = studio.id

        async def create(*args, **kwargs):
            await asyncio.sleep(0.05)  # Keep both requests in flight at the network boundary.
            return 'acct_concurrent_test'

        async def connect():
            async with async_session_maker() as db:
                return await G.connect_stripe(SimpleNamespace(studio_id=sid), db, '/dashboard/booking')

        try:
            with patch.object(stripe_connect, 'configured', return_value=True), patch.object(
                stripe_connect, 'create_account', AsyncMock(side_effect=create),
            ) as accounts, patch.object(stripe_connect, 'onboarding_url', AsyncMock(return_value='https://connect.stripe.com/test')):
                results = await asyncio.gather(connect(), connect())
                assert all(result.url == 'https://connect.stripe.com/test' for result in results)
                assert accounts.await_count == 1
                assert accounts.call_args.kwargs['idempotency_key'].startswith('connect-account:')
                async with async_session_maker() as db:
                    channel = (await db.execute(select(OnlineChannel).where(OnlineChannel.studio_id == sid))).scalar_one()
                    assert channel.account_id == 'acct_concurrent_test'
                    assert channel.is_active is True
                    channel.is_active = False
                    await db.commit()
                await connect()
                async with async_session_maker() as db:
                    channel = (await db.execute(select(OnlineChannel).where(OnlineChannel.studio_id == sid))).scalar_one()
                    assert channel.is_active is False
                assert accounts.await_count == 1
        finally:
            async with async_session_maker() as db:
                studio = await db.get(Studio, sid)
                await db.delete(studio)
                await db.commit()
    asyncio.run(run())
