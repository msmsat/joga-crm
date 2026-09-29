from types import SimpleNamespace
from services.lesson_compensation import calculate_compensation


def calc(role='trainer', rate=40, rate_type='percent', clients=None, **kwargs):
    member = SimpleNamespace(role=role, rate=rate, rate_type=rate_type, salary=kwargs.get('salary'))
    lesson = SimpleNamespace(status=kwargs.get('status', 'confirmed'), duration_min=kwargs.get('minutes', 90))
    return calculate_compensation(member, lesson, clients if clients is not None else [{'debt': 125, 'paid_amount': 0}])


def test_percent_uses_discounted_price_not_catalog_price():
    assert calc()['amount'] == 50
    assert calc()['base_amount'] == 125


def test_owner_keeps_whole_discounted_amount():
    assert calc(role='owner')['amount'] == 125
    assert calc(role='owner')['kind'] == 'owner'


def test_hourly_uses_lesson_duration_once_not_per_client():
    assert calc(rate=100, rate_type='hourly', clients=[{'debt': 125}, {'debt': 125}])['amount'] == 150


def test_fixed_salary_is_not_allocated_to_a_lesson():
    assert calc(rate=3000, rate_type='fixed')['amount'] is None
    assert calc(rate=3000, rate_type='fixed')['kind'] == 'salary'


def test_legacy_salary_is_recognized():
    assert calc(rate=None, rate_type=None, salary=3000)['kind'] == 'salary'


def test_receipt_counts_deposit_and_certificate_but_not_bonus_discount():
    result = calc(clients=[{'payment': {'total': 50, 'deposit_applied': 25, 'certificate_applied': 50, 'bonuses_value': 25}, 'paid_amount': 50}])
    assert result['base_amount'] == 125
    assert result['amount'] == 50


def test_partial_payment_does_not_reduce_earned_share():
    assert calc(clients=[{'debt': 75, 'paid_amount': 50}])['amount'] == 50


def test_group_combines_revenue():
    assert calc(clients=[{'debt': 125}, {'paid_amount': 100}])['amount'] == 90


def test_subscription_without_per_visit_value_is_unknown_not_zero():
    assert calc(clients=[{'by_subscription': True, 'debt': 0}])['amount'] is None


def test_free_lesson_gives_zero():
    assert calc(clients=[{'debt': 0, 'is_trial': True}])['amount'] == 0


def test_cancelled_lesson_earns_nothing_even_hourly():
    assert calc(rate_type='hourly', rate=100, status='cancelled')['amount'] == 0


def test_missing_rate_is_not_zero_rate():
    assert calc(rate=None)['kind'] == 'unconfigured'
    assert calc(rate=0)['amount'] == 0


def test_rounding_keeps_currency_precision():
    assert calc(rate=33.33)['amount'] == 41.66


def test_missing_membership_is_not_an_owner():
    assert calculate_compensation(None, SimpleNamespace(status='confirmed', duration_min=60), [])['kind'] == 'unconfigured'

# Route-level contract: real response validation, isolated database reads.
def test_lesson_detail_exposes_estimate_only_to_owner(monkeypatch):
    import asyncio
    from datetime import datetime
    from unittest.mock import AsyncMock
    from routers.schedule import lessons

    lesson = SimpleNamespace(**{key: None for key in lessons._LESSON_FIELDS})
    lesson.__dict__.update(id=7, name='Yoga', teacher_name='Anna', teacher_id=9,
        start_time=datetime(2026, 9, 29, 12), duration_min=90, price=250,
        level='', equipment='', total_spots=1, status='confirmed', notes='', photos=[],
        clients_notified=False, booking_mode='resource', version=1)
    clients = [{'reservation_id': 1, 'client_id': 2, 'name': 'Client', 'status': 'active',
                'debt': 125, 'paid_amount': 0}]
    monkeypatch.setattr(lessons, 'get_scoped_lesson', AsyncMock(return_value=lesson))
    monkeypatch.setattr(lessons, '_lesson_location', AsyncMock(return_value={}))

    class Result:
        def __init__(self, value): self.value = value
        def scalar(self): return self.value
        def scalar_one_or_none(self): return self.value
        def mappings(self): return self
        def all(self): return self.value

    async def run(role):
        member = SimpleNamespace(role='trainer', rate=40, rate_type='percent', salary=None)
        db = SimpleNamespace(execute=AsyncMock(side_effect=[Result(1), Result(clients), Result(member)]))
        response = await lessons.get_lesson(7, SimpleNamespace(role=role, studio_id=3), db)
        if role == 'owner':
            assert response.compensation.amount == 50
            # The staff terms must be selected in the lesson's studio, not globally.
            params = db.execute.call_args.args[0].compile().params
            assert params['studio_id_1'] == 3
            assert params['user_id_1'] == 9
        else:
            assert response.compensation is None
            assert db.execute.await_count == 2
    for role in ('owner', 'admin', 'trainer'):
        asyncio.run(run(role))

def test_staff_creation_legacy_salary_field_holds_percentage_rate():
    assert calc(rate=None, rate_type='percent', salary=40)['amount'] == 50


def test_staff_creation_legacy_salary_field_holds_hourly_rate():
    assert calc(rate=None, rate_type='hourly', salary=100)['amount'] == 150
