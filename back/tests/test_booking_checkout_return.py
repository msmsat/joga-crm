"""Real authenticated booking HTTP and PostgreSQL, controlled Stripe boundary."""
import asyncio

import pytest
from httpx import ASGITransport, AsyncClient

from test_miniapp_journey import fixture_app, login, seed


async def card_booking(http, ids):
    response = await http.post('/__test/booking-settings', json={
        'prepay_required': False, 'can_pay_online': True, 'service_price': 450})
    assert response.status_code == 200
    response = await http.get('/global/availability', params={
        'service_id': ids['haircut'], 'branch_id': ids['central'],
        'teacher_id': ids['anna'], 'date_from': ids['day'], 'date_to': ids['day']})
    body = {'booking_mode': 'resource', 'service_id': ids['haircut'],
        'branch_id': ids['central'], 'teacher_id': ids['anna'],
        'starts_at': response.json()['slots'][0]['starts_at'], 'payment_method': 'card'}
    response = await http.post('/global/booking-quotes', json=body)
    assert response.status_code == 201, response.text
    quote_id = response.json()['quote_id']
    response = await http.post('/global/bookings', json={'quote_id': quote_id})
    assert response.status_code == 200, response.text
    result = response.json()
    assert result['status'] == 'hold' and result['payment_url'].startswith('https://checkout.stripe.com/')
    # A repeated direct confirmation cannot turn the unpaid online hold active.
    again = await http.post('/global/bookings', json={'quote_id': quote_id})
    assert again.json()['status'] == 'hold'
    assert again.json()['reservation_id'] == result['reservation_id']
    return result, body


@pytest.mark.parametrize('paid', [False, True])
def test_return_cancels_only_unpaid_checkout_and_never_loses_a_paid_booking(monkeypatch, paid):
    async def scenario():
        async with fixture_app(monkeypatch) as (app, capture, state):
            ids = state['ids'] = await seed()
            async with AsyncClient(transport=ASGITransport(app=app), base_url='http://fixture.local') as http:
                await login(http, ids, capture)
                booked, body = await card_booking(http, ids)
                rid = booked['reservation_id']
                assert (await http.get('/__test/payment-ledger')).json()['income'] == []
                if paid:
                    assert (await http.post('/__test/confirm-stripe-payment', json={'reservation_id': rid})).status_code == 200
                for _ in range(2):
                    response = await http.post(f'/global/bookings/{rid}/checkout-return', json={})
                    assert response.status_code == 200, response.text
                    assert response.json()['status'] == ('active' if paid else 'cancelled')
                ledger = (await http.get('/__test/payment-ledger')).json()
                assert ledger['income'] == ([450] if paid else [])
                if not paid:
                    # Closing Stripe frees the same interval for either method.
                    body['payment_method'] = 'venue'
                    quote = await http.post('/global/booking-quotes', json=body)
                    assert quote.status_code == 201, quote.text
                    confirmed = await http.post('/global/bookings', json={'quote_id': quote.json()['quote_id']})
                    assert confirmed.status_code == 200, confirmed.text
                    assert confirmed.json()['status'] == 'active'
    asyncio.run(scenario())


@pytest.mark.parametrize('mode', ['processing', 'offline', 'mismatch', 'paid_race', 'concurrent'])
def test_checkout_return_respects_stripe_truth_and_does_not_hold_database_in_network(monkeypatch, mode):
    async def scenario():
        from services import stripe_connect
        async with fixture_app(monkeypatch) as (app, capture, state):
            ids = state['ids'] = await seed()
            async with AsyncClient(transport=ASGITransport(app=app), base_url='http://fixture.local') as http:
                await login(http, ids, capture)
                booked, _ = await card_booking(http, ids)
                rid = booked['reservation_id']
                fake = state['stripe']
                session = fake.only()
                if mode == 'processing': fake.complete_unpaid(session.id)
                if mode == 'offline': fake.fail_fetch = TimeoutError('Stripe offline')
                if mode == 'mismatch': session.amount_total += 1
                async def fetch(session_id, account_id):
                    assert capture.active_db_connections == 0, 'Stripe must not retain an open database transaction'
                    return await fake.fetch_session(session_id, account_id)
                monkeypatch.setattr(stripe_connect, 'fetch_session', fetch)
                if mode == 'paid_race':
                    async def expire(session_id, account_id):
                        fake.pay(session_id)
                        raise RuntimeError('Payment won before expiration')
                    monkeypatch.setattr(stripe_connect, 'expire_session', expire)
                endpoint = f'/global/bookings/{rid}/checkout-return'
                if mode == 'concurrent':
                    # Connection tracking is shared in this fixture. The earlier
                    # sequential cases prove lock-free I/O; concurrent HTTP may
                    # include the other request's short database transaction.
                    monkeypatch.setattr(stripe_connect, 'fetch_session', fake.fetch_session)
                    responses = await asyncio.gather(http.post(endpoint, json={}), http.post(endpoint, json={}))
                else: responses = [await http.post(endpoint, json={})]
                for response in responses:
                    assert response.status_code == (503 if mode in {'offline', 'mismatch'} else 200), response.text
                    if response.status_code == 200:
                        assert response.json()['status'] == ('active' if mode == 'paid_race' else 'cancelled' if mode == 'concurrent' else 'hold')
                ledger = (await http.get('/__test/payment-ledger')).json()
                assert ledger['income'] == ([450] if mode == 'paid_race' else [])
                if mode in {'processing', 'offline', 'mismatch'}:
                    assert (await http.get('/__test/bookings')).json()[0]['status'] == 'hold'
                    assert fake.expires == [], 'Do not release an uncertain or processing payment'
                    assert fake.creates == 1
    asyncio.run(scenario())


def test_checkout_return_cannot_cancel_another_studios_booking(monkeypatch):
    async def scenario():
        async with fixture_app(monkeypatch) as (app, capture, state):
            ids = state['ids'] = await seed()
            async with AsyncClient(transport=ASGITransport(app=app), base_url='http://fixture.local') as http:
                await login(http, ids, capture)
                booked, _ = await card_booking(http, ids)
                stranger = await seed()
                # An existing Bearer intentionally links email to that client.
                # Sign in independently to actually exercise another tenant.
                http.headers.pop('Authorization')
                auth = await login(http, stranger, capture)
                assert auth['user']['id'] != ids['client']
                response = await http.post(f"/global/bookings/{booked['reservation_id']}/checkout-return", json={})
                assert response.status_code == 404
                assert (await http.get('/__test/bookings')).json()[0]['status'] == 'hold'
                assert state['stripe'].expires == []
    asyncio.run(scenario())
