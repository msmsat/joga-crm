"""Real DB + HTTP: a debt made on 26, appointment on 28 and payment on 29."""
import asyncio
from datetime import datetime

from sqlalchemy import select

import test_first_lesson_payment as flp
import test_hybrid_crm_api as crm
import test_resource_booking as resource
from database import async_session_maker
from models import ActivityLog, ClientPayment, Lesson, Reservation, Studio
from routers.clients.router import router as clients_router

enabled = resource.enabled
frozen_clock = flp.frozen_clock


def test_debt_settlement_dates_and_freeze_history_in_actual_api():
    async def run():
        ids = await flp._seed()
        try:
            app = flp._app(ids)
            app.include_router(clients_router, prefix='/clients')
            async with crm._client(app) as http:
                quote = (await flp._quote(http, ids))['quote_id']
                booked = await http.post('/schedule/bookings', json={'quote_id': quote})
                assert booked.status_code == 200, booked.text
                r = await flp._reservation(ids)
                paid = await http.post(f'/schedule/reservations/{r.id}/pay', json={'payment_method': 'cash'})
                assert paid.status_code == 200, paid.text
                async with async_session_maker() as db:
                    studio = await db.get(Studio, ids['studio'])
                    studio.tz_iana = 'Europe/Kyiv'
                    lesson = await db.get(Lesson, r.lesson_id)
                    lesson.start_time = datetime(2026, 9, 28, 10)
                    reservation = await db.get(Reservation, r.id)
                    reservation.created_at = datetime(2026, 9, 26, 9)
                    reservation.payment_breakdown = dict(reservation.payment_breakdown, paid_at='2026-09-29T17:20:00')
                    payment = await db.get(ClientPayment, r.debt_payment_id)
                    payment.created_at = datetime(2026, 9, 26, 9)
                    # A temporary checkout hold must not appear as a confirmed booking.
                    hold_lesson = Lesson(studio_id=ids['studio'], name='Hidden hold', teacher_name='Anna',
                        teacher_id=ids['teacher'], start_time=datetime(2026, 9, 30, 10), duration_min=60,
                        price=100, level='', equipment='', total_spots=5, status='confirmed', booking_mode='event')
                    db.add(hold_lesson)
                    await db.flush()
                    db.add(Reservation(client_id=ids['client'], lesson_id=hold_lesson.id, spot_number=1, status='hold'))
                    await db.commit()
                response = await http.get(f"/clients/{ids['client']}/events")
                assert response.status_code == 200, response.text
                events = response.json()
                booking, = [e for e in events if e['type'] == 'booking']
                assert booking['scheduled_at'] == '2026-09-28T10:00:00'
                assert booking['occurred_at'] == '2026-09-26T12:00:00+03:00'
                payment, = [e for e in events if e['type'] == 'payment']
                assert payment['occurred_at'] == '2026-09-29T20:20:00+03:00'
                assert payment['scheduled_at'] == booking['scheduled_at']
                assert events.index(payment) < events.index(booking)
                for frozen in [True, True, False, False]:
                    response = await http.patch(f"/clients/{ids['client']}/freeze", json={'frozen': frozen})
                    assert response.status_code == 200, response.text
                response = await http.get(f"/clients/{ids['client']}/events", params={'event_type': 'freeze'})
                assert response.status_code == 200, response.text
                assert len(response.json()) == 2, 'one freeze and one unfreeze, without no-op duplicates'
                async with async_session_maker() as db:
                    logs = (await db.execute(select(ActivityLog).where(ActivityLog.studio_id == ids['studio'],
                        ActivityLog.event_type.in_(['freeze', 'unfreeze'])))).scalars().all()
                    assert {log.event_type for log in logs} == {'freeze', 'unfreeze'}
        finally:
            await flp._cleanup(ids)
    asyncio.run(run())
