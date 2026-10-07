import asyncio
from datetime import datetime
from types import SimpleNamespace as NS
from unittest.mock import AsyncMock

import pytest
from routers.clients import profiles


def lesson(day=28):
    return NS(id=8, name='Service', teacher_name='Anna', start_time=datetime(2026, 9, day, 10), tz_iana='Europe/Kyiv')


def reservation(**patch):
    values = dict(id=1, client_id=2, created_at=datetime(2026, 9, 26, 9), cancelled_at=datetime(2026, 9, 28, 8),
                  status='active', lesson=lesson(), payment_breakdown=None, debt_payment_id=4)
    return NS(**(values | patch))


class Rows:
    def __init__(self, rows): self.rows = rows
    def scalars(self): return Rows([r[0] if isinstance(r, tuple) else r for r in self.rows])
    def all(self): return self.rows


def request(monkeypatch, kind, batches):
    monkeypatch.setattr(profiles, '_get_client_or_404', AsyncMock(return_value=NS(id=2)))
    if kind in ('visit', 'completed', 'booking', 'cancel'):
        # Строка запроса — бронь, статус и сумма её платежа, имя абонемента.
        batches = [[r if isinstance(r, tuple) else (r, None, None, None) for r in rows] for rows in batches]
        # These tests verify timestamp formatting; freeze classification so old
        # fixture dates do not move from Booking to Completed as time passes.
        monkeypatch.setattr(profiles, 'appointment_state', lambda r, studio: 'upcoming' if kind == 'booking' else 'cancelled' if kind == 'cancel' else 'completed')
    db = NS(execute=AsyncMock(side_effect=[Rows(rows) for rows in batches]),
            get=AsyncMock(return_value=NS(tz_iana='Europe/Kyiv', timezone='UTC+3')))
    return asyncio.run(profiles.get_client_events(2, NS(studio_id=3, role='owner'), NS(id=5), db, kind))


def test_booking_primary_date_is_lesson_not_created_date(monkeypatch):
    event, = request(monkeypatch, 'booking', [[reservation()]])
    assert event.date.startswith('2026-09-28T10:00')
    assert event.scheduled_at.startswith('2026-09-28T10:00')
    assert event.occurred_at.startswith('2026-09-26T12:00')
    # The timeline prefix stays in title (the assistant reads it); the card
    # names the kind of event itself and takes the bare lesson name.
    assert event.title == 'Запись: Service'
    assert event.subject == 'Service'


def test_visit_keeps_studio_wall_clock(monkeypatch):
    event, = request(monkeypatch, 'visit', [[reservation(status='attended')]])
    assert event.date.startswith('2026-09-28T10:00')


def test_visit_names_its_service_and_master_for_booking_the_same_again(monkeypatch):
    # «Записать так же» в истории клиента ищет услугу и мастера по номерам:
    # имена для этого не годятся — их переименовывают.
    past = lesson()
    past.service_id, past.teacher_id = 12, 34
    event, = request(monkeypatch, 'visit', [[reservation(status='attended', lesson=past)]])
    assert (event.service_id, event.teacher_id) == (12, 34)
    # У занятия без услуги (перенесённая история) номера нет — повторять нечего.
    event, = request(monkeypatch, 'visit', [[reservation(status='attended')]])
    assert (event.service_id, event.teacher_id) == (None, None)


def test_visit_carries_its_price_discounts_and_settlement(monkeypatch):
    # Окно записи показывает в истории цену со скидкой и итог — по тем же
    # полям, что строка записанного в карточке занятия (BookedClient).
    past = lesson()
    past.price = 500
    unpaid = reservation(status='attended', lesson=past, is_trial=True, trial_discount_percent=20)
    event, = request(monkeypatch, 'visit', [[(unpaid, 'pending', 400, None)]])
    f = event.funding
    assert (f.price, f.is_trial, f.trial_discount_percent, f.debt, f.paid_amount) == (500, True, 20, 400, 0)
    # Оплачено — снимок кассы: прайс, скидки и итог.
    receipt = {'base_price': 500, 'discounts': [{'kind': 'first_lesson', 'amount': 100}], 'total': 400, 'method': 'cash'}
    paid = reservation(status='attended', lesson=past, payment_breakdown=receipt)
    event, = request(monkeypatch, 'visit', [[(paid, 'success', 400, None)]])
    assert (event.funding.paid_amount, event.funding.debt) == (400, 0)
    assert event.funding.payment.total == 400 and event.funding.payment.discounts[0].kind == 'first_lesson'
    # Абонемент — его имя; денег по такому визиту не ждут.
    sub = reservation(status='attended', lesson=past, subscription_id=9)
    event, = request(monkeypatch, 'visit', [[(sub, None, None, '10 занятий')]])
    assert event.funding.by_subscription and event.funding.subscription_name == '10 занятий'
    assert event.funding.debt == 0


def test_assistant_does_not_receive_visit_funding(monkeypatch):
    # Разбор цены нужен окну записи; модели он удвоил бы ответ инструмента.
    from services import ai_tools
    past = lesson()
    past.price = 500
    event, = request(monkeypatch, 'visit', [[(reservation(status='attended', lesson=past), 'pending', 500, None)]])
    assert event.funding is not None
    monkeypatch.setattr(ai_tools, '_r_get_client_events', AsyncMock(return_value=[event]))
    monkeypatch.setattr(ai_tools, '_currency', AsyncMock(return_value='EUR'))
    ctx = NS(user=NS(id=5), studio_id=3, role='owner')
    result = asyncio.run(ai_tools.get_client_events(ctx, NS(), ai_tools.ClientEventsArgs(client_id=2, event_type='visit')))
    (item,) = result['items']
    assert 'funding' not in item and item['subject'] == 'Service'


def test_cancellation_keeps_both_action_time_and_lesson_time(monkeypatch):
    event, = request(monkeypatch, 'cancel', [[reservation(status='cancelled')]])
    assert event.occurred_at.startswith('2026-09-28T11:00')
    assert event.scheduled_at.startswith('2026-09-28T10:00')


def test_payment_uses_receipt_settlement_time_instead_of_debt_creation(monkeypatch):
    r = reservation(payment_breakdown={'paid_at': '2026-09-28T17:20:00'})
    p = NS(id=4, created_at=datetime(2026, 9, 26, 9), description='Service', amount=125)
    event, = request(monkeypatch, 'payment', [[(p, r, r.lesson)]])
    assert event.date.startswith('2026-09-28T20:20')
    assert event.occurred_at.startswith('2026-09-28T20:20')
    assert event.scheduled_at.startswith('2026-09-28T10:00')
    assert event.amount == '125'


def test_old_settled_debt_does_not_invent_a_payment_date(monkeypatch):
    r = reservation()
    p = NS(id=4, created_at=datetime(2026, 9, 26, 9), description='Service', amount=125)
    event, = request(monkeypatch, 'payment', [[(p, r, r.lesson)]])
    assert event.occurred_at is None
    assert event.recorded_at.startswith('2026-09-26T12:00')


def test_new_success_payment_has_its_own_date(monkeypatch):
    p = NS(id=4, created_at=datetime(2026, 9, 28, 9), description='Subscription', amount=1000)
    event, = request(monkeypatch, 'payment', [[(p, None, None)]])
    assert event.occurred_at.startswith('2026-09-28T12:00')


def test_bonus_near_midnight_uses_studio_calendar_day(monkeypatch):
    tr = NS(created_at=datetime(2026, 9, 27, 22, 30), description='Bonus', points=10)
    event, = request(monkeypatch, 'bonus', [[tr]])
    assert event.date.startswith('2026-09-28T01:30')
    assert event.amount == '+10'


def test_freezes_and_logs_preserve_local_timestamp(monkeypatch):
    sub = NS(frozen_at=datetime(2026, 9, 27, 22, 30), type='Package')
    log = NS(created_at=datetime(2026, 9, 28, 8), title='Unfreeze', event_type='unfreeze')
    events = request(monkeypatch, 'freeze', [[sub], [log]])
    assert events[0].date.startswith('2026-09-28T11:00')
    assert events[1].date.startswith('2026-09-28T01:30')
    # One event type covers both directions — the card needs to tell them apart.
    assert events[0].freeze_action == 'unfreeze'
    assert (events[1].freeze_action, events[1].subject) == ('freeze', 'Package')


def test_timeline_orders_actions_not_future_appointment_dates(monkeypatch):
    old = reservation(lesson=lesson(day=30))
    recent = reservation(created_at=datetime(2026, 9, 28, 8), lesson=lesson(day=29))
    events = request(monkeypatch, 'booking', [[old, recent]])
    assert [event.scheduled_at[:10] for event in events] == ['2026-09-29', '2026-09-30']


def test_action_dates_respect_daylight_saving_and_legacy_offsets():
    from services.client_event_dates import action_stamp
    studio = NS(tz_iana='Europe/Prague')
    assert action_stamp(datetime(2026, 1, 3, 23, 30), studio) == '2026-01-04T00:30:00+01:00'
    assert action_stamp(datetime(2026, 7, 3, 23, 30), studio) == '2026-07-04T01:30:00+02:00'
    assert action_stamp(datetime(2026, 7, 3, 23, 30), NS(timezone='UTC-5')) == '2026-07-03T18:30:00-05:00'
    assert action_stamp('invalid', studio) is None
