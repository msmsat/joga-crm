import asyncio
from types import SimpleNamespace
from unittest.mock import patch

from database import async_session_maker
from models import Studio, StudioBookingSettings, StripeCheckout
from routers.checkout.stripe_pay import reserve_checkout
from services import stripe_connect


def test_studio_name_theme_and_public_logo_reach_checkout():
    from services.studio_checkout_branding import appearance
    studio = SimpleNamespace(name='Stretch Studio', logo_url='https://studio.example/logo.png')
    settings = SimpleNamespace(widget_accent_color='#7B9D84', widget_dark_mode=True,
                               widget_language='cs', widget_logo_url=None)
    result = appearance(studio, settings)
    assert result['branding_settings']['display_name'] == 'Stretch Studio'
    assert result['branding_settings']['button_color'] == '#7B9D84'
    assert result['branding_settings']['background_color'] == '#121212'
    assert result['branding_settings']['logo'] == {'type': 'url', 'url': 'https://studio.example/logo.png'}
    assert result['locale'] == 'cs'


def test_invalid_brand_values_do_not_break_payment(monkeypatch):
    from services.studio_checkout_branding import appearance
    monkeypatch.setenv('BACKEND_URL', 'http://localhost:8000')
    for logo in ['http://localhost/logo.png', 'https://127.0.0.1/logo.png', 'javascript:alert(1)', '/uploads/logo.png', 'https://example.com/logo.svg']:
        result = appearance(SimpleNamespace(name='Studio', logo_url=logo), SimpleNamespace(
            widget_accent_color='red; color:blue', widget_dark_mode=False, widget_language='nonsense', widget_logo_url=None,
        ))
        assert 'logo' not in result['branding_settings']
        assert result['branding_settings']['button_color'] == '#FCAE91'
        assert result['locale'] == 'auto'


def test_hosted_checkout_preserves_direct_charge_and_prefills_receipt_email():
    with patch.object(stripe_connect.stripe.checkout.Session, 'create', return_value=SimpleNamespace(
        id='cs_test_brand', url='https://checkout.stripe.com/test',
    )) as create, patch.object(stripe_connect.stripe_env, 'guard_write'):
        asyncio.run(stripe_connect.create_hosted_checkout_session(
            account_id='acct_studio', amount_minor=12500, currency='EUR', description='Pilates',
            metadata={'studio_id': '7'}, success_url='https://studio.example/?pay=paysuccess',
            cancel_url='https://studio.example/?pay=paycancel', receipt_email='client@example.test',
            branding_settings={'display_name': 'Stretch Studio'}, locale='cs', idempotency_key='cs:attempt1',
        ))
    params = create.call_args.kwargs
    assert params['stripe_account'] == 'acct_studio'
    assert params['branding_settings'] == {'display_name': 'Stretch Studio'}
    assert params['locale'] == 'cs'
    assert params['customer_email'] == 'client@example.test'
    assert params['payment_intent_data']['receipt_email'] == 'client@example.test'
    assert params['idempotency_key'] == 'cs:attempt1'


def test_brand_change_during_retry_does_not_create_another_payment():
    async def run():
        async with async_session_maker() as db:
            studio = Studio(name='TEST-BRANDED-CHECKOUT', currency='EUR')
            db.add(studio)
            await db.commit()
            sid = studio.id
            try:
                common = dict(studio_id=sid, user_id=None, account_id='acct_brand',
                              payload={'client_id': 7, 'package_id': 8}, amount=125, application_fee=0)
                first, _ = await reserve_checkout(db, **common, presentation={'branding_settings': {'display_name': 'Before'}})
                first_id = first.id
                second, _ = await reserve_checkout(db, **common, presentation={'branding_settings': {'display_name': 'After'}})
                assert second.id == first_id
                assert second.payload['stripe_presentation']['branding_settings']['display_name'] == 'Before'
            finally:
                from sqlalchemy import delete
                await db.execute(delete(StripeCheckout).where(StripeCheckout.studio_id == sid))
                await db.execute(delete(StudioBookingSettings).where(StudioBookingSettings.studio_id == sid))
                await db.execute(delete(Studio).where(Studio.id == sid))
                await db.commit()
    asyncio.run(run())
