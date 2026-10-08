"""Lost network responses and repeated taps reuse the same branded purchase."""
import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
from sqlalchemy import delete, select

from database import async_session_maker
from models import Client, OnlineChannel, Studio, StudioBookingSettings, StripeCheckout
from ratelimit import limiter
from routers.booking import miniapp_users as M
from tests.test_miniapp_checkout import _setup, _Req


@pytest.mark.parametrize('lost_response', [False, True])
def test_retry_reuses_branded_session_after_orm_rollback(lost_response):
    async def run():
        async with async_session_maker() as db:
            sid, package, client = await _setup(db)
            package_id, client_id = package.id, client.id
            db.add(OnlineChannel(studio_id=sid, channel_type='stripe', account_id='acct_retry', is_active=True))
            db.add(StudioBookingSettings(studio_id=sid, widget_accent_color='#234567', widget_language='cs'))
            await db.commit()

        requests = []
        async def create(**kwargs):
            requests.append(kwargs)
            if lost_response and len(requests) == 1:
                raise TimeoutError('Stripe accepted, response was lost')
            return 'cs_retry', 'https://checkout.stripe.com/retry'

        async def pay():
            async with async_session_maker() as db:
                return await M.create_checkout_session(request=_Req(),
                    body=M.CheckoutSessionRequest(package_id=package_id, in_telegram=False, expected_total=1000),
                    client=await db.get(Client, client_id), db=db)

        try:
            with patch.object(limiter, 'enabled', False), patch.object(M.stripe_connect, 'configured', return_value=True), patch.object(
                M.platform_fee, 'fee_for_studio', AsyncMock(return_value=0),
            ), patch.object(M.stripe_connect, 'create_hosted_checkout_session', side_effect=create), patch.object(
                M.stripe_connect, 'fetch_session', AsyncMock(return_value=SimpleNamespace(status='open', url='https://checkout.stripe.com/retry')),
            ):
                if lost_response:
                    with pytest.raises(HTTPException) as error:
                        await pay()
                    assert error.value.status_code == 502
                else:
                    assert (await pay()).url == 'https://checkout.stripe.com/retry'
                async with async_session_maker() as db:
                    settings = (await db.execute(select(StudioBookingSettings).where(StudioBookingSettings.studio_id == sid))).scalar_one()
                    settings.widget_accent_color = '#765432'
                    await db.commit()
                assert (await pay()).url == 'https://checkout.stripe.com/retry'
                assert requests[0]['branding_settings']['button_color'] == '#234567'
                assert requests[0]['locale'] == 'cs'
                assert requests[0]['metadata']['client_id'] == str(client_id)
                if lost_response:
                    assert requests[1] == requests[0]
                else:
                    assert len(requests) == 1
                async with async_session_maker() as db:
                    rows = (await db.execute(select(StripeCheckout).where(StripeCheckout.studio_id == sid))).scalars().all()
                    assert len(rows) == 1
                    assert rows[0].session_id == 'cs_retry'
                    assert rows[0].payload['client_id'] == client_id
        finally:
            async with async_session_maker() as db:
                await db.execute(delete(Studio).where(Studio.id == sid))
                await db.commit()
    asyncio.run(run())
