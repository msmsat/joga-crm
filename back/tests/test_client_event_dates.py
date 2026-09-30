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
    db = NS(execute=AsyncMock(side_effect=[Rows(rows) for rows in batches]),
            get=AsyncMock(return_value=NS(tz_iana='Europe/Kyiv', timezone='UTC+3')))
    return asyncio.run(profiles.get_client_events(2, NS(studio_id=3, role='owner'), NS(id=5), db, kind))


def test_booking_primary_date_is_lesson_not_created_date(monkeypatch):
    event, = request(monkeypatch, 'booking', [[reservation()]])
    assert event.date.startswith('2026-09-28T10:00')
    assert event.scheduled_at.startswith('2026-09-28T10:00')
    assert event.occurred_at.startswith('2026-09-26T12:00')


def test_visit_keeps_studio_wall_clock(monkeypatch):
    event, = request(monkeypatch, 'visit', [[reservation(status='attended')]])
    assert event.date.startswith('2026-09-28T10:00')


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
    log = NS(created_at=datetime(2026, 9, 28, 8), title='Unfreeze')
    events = request(monkeypatch, 'freeze', [[sub], [log]])
    assert events[0].date.startswith('2026-09-28T11:00')
    assert events[1].date.startswith('2026-09-28T01:30')


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
