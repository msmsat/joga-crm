from datetime import datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace
from services.lesson_compensation import VisitValue, booking_price, calculate_compensation, visit_value


def calc(role='trainer', rate=40, rate_type='percent', clients=None, visits=None, **kwargs):
    member = SimpleNamespace(role=role, rate=rate, rate_type=rate_type, salary=kwargs.get('salary'))
    lesson = SimpleNamespace(status=kwargs.get('status', 'confirmed'), duration_min=kwargs.get('minutes', 90),
                             price=kwargs.get('price', 250))
    return calculate_compensation(member, lesson, clients if clients is not None else [{'debt': 125, 'paid_amount': 0}],
                                  visits)


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
def test_lesson_detail_shows_terms_to_owner_and_to_the_lessons_own_master(monkeypatch):
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
                'debt': 125, 'paid_amount': 0, 'by_subscription': False}]
    monkeypatch.setattr(lessons, 'get_scoped_lesson', AsyncMock(return_value=lesson))
    monkeypatch.setattr(lessons, '_lesson_location', AsyncMock(return_value={}))

    class Result:
        def __init__(self, value): self.value = value
        def scalar(self): return self.value
        def scalar_one_or_none(self): return self.value
        def mappings(self): return self
        def all(self): return self.value

    async def run(role, user_id, sees):
        member = SimpleNamespace(role='trainer', rate=40, rate_type='percent', salary=None)
        db = SimpleNamespace(execute=AsyncMock(side_effect=[Result(1), Result(clients), Result(member)]))
        ctx = SimpleNamespace(role=role, studio_id=3, user=SimpleNamespace(id=user_id))
        response = await lessons.get_lesson(7, ctx, db)
        if sees:
            assert response.compensation.amount == 50
            assert response.compensation.due_base == 125 and response.compensation.paid_base == 0
            # The staff terms must be selected in the lesson's studio, not globally.
            params = db.execute.call_args.args[0].compile().params
            assert params['studio_id_1'] == 3
            assert params['user_id_1'] == 9
        else:
            assert response.compensation is None
            assert db.execute.await_count == 2
    # The owner sees any lesson; the master sees what they earn on their own;
    # an administrator does not see someone else's terms.
    for role, user_id, sees in (('owner', 1, True), ('trainer', 9, True), ('admin', 4, False),
                                ('admin', 9, True)):
        asyncio.run(run(role, user_id, sees))

def test_staff_creation_legacy_salary_field_holds_percentage_rate():
    assert calc(rate=None, rate_type='percent', salary=40)['amount'] == 50


def test_staff_creation_legacy_salary_field_holds_hourly_rate():
    assert calc(rate=None, rate_type='hourly', salary=100)['amount'] == 150


# ─── The share is taken from what was actually paid ─────────────────────────

def test_half_price_discount_halves_the_share():
    """Price 4 000, paid 2 000 after a 50 % discount: 30 % of 2 000, not of 4 000."""
    receipt = {'base_price': 4000, 'discounts': [{'kind': 'manual', 'amount': 2000}], 'total': 2000,
               'deposit_applied': 0, 'certificate_applied': 0, 'bonuses_value': 0}
    result = calc(rate=30, price=4000, clients=[{'payment': receipt, 'paid_amount': 2000}])
    assert (result['amount'], result['base_amount'], result['paid_base']) == (600, 2000, 2000)
    assert result['paid_amount'] == 600 and result['due_base'] == 0


def test_open_debt_is_the_discounted_amount_still_expected():
    result = calc(rate=30, price=4000, clients=[{'debt': 2000, 'paid_amount': 0, 'manual_discount_percent': 50}])
    assert (result['amount'], result['due_base'], result['paid_base'], result['paid_amount']) == (600, 2000, 0, 0)


def test_booking_without_any_money_record_is_estimated_from_its_price():
    """A lesson moved from the previous system has neither a receipt nor a debt:
    the share is estimated from the booking price instead of showing zero."""
    result = calc(rate=30, price=4000, clients=[{'debt': 0, 'paid_amount': 0, 'booking_channel': 'import'}])
    assert (result['amount'], result['estimated_base'], result['paid_base']) == (1200, 4000, 0)


def test_estimate_keeps_the_discount_promised_to_the_booking():
    assert booking_price({'manual_discount_percent': 50}, 4000) == 2000
    assert booking_price({'is_trial': True, 'trial_discount_percent': 30}, 4000) == 2800
    assert booking_price({'is_trial': True, 'trial_discount_amount': 500}, 4000) == 3500
    # The best discount wins, as at the cashier: no stacking.
    assert booking_price({'is_trial': True, 'trial_discount_percent': 30, 'manual_discount_percent': 50}, 4000) == 2000
    assert booking_price({'is_trial': True, 'trial_discount_amount': 9000}, 4000) == 0
    assert booking_price({'manual_discount_percent': 100}, 4000) == 0


def test_group_splits_paid_and_expected_money():
    receipt = {'total': 2000, 'deposit_applied': 0, 'certificate_applied': 0}
    result = calc(rate=30, price=4000, clients=[
        {'payment': receipt, 'paid_amount': 2000},
        {'debt': 4000, 'paid_amount': 0},
        {'debt': 0, 'paid_amount': 0},
    ])
    assert result['base_amount'] == 10000
    assert (result['paid_base'], result['due_base'], result['estimated_base']) == (2000, 4000, 4000)
    assert (result['amount'], result['paid_amount']) == (3000, 600)


def test_no_show_adds_only_money_already_received():
    unpaid = calc(rate=30, price=4000, clients=[{'debt': 4000, 'paid_amount': 0, 'no_show': True}])
    assert (unpaid['amount'], unpaid['base_amount']) == (0, 0)
    kept = calc(rate=30, price=4000, clients=[{'debt': 0, 'paid_amount': 4000, 'no_show': True}])
    assert (kept['amount'], kept['paid_base']) == (1200, 4000)


def test_membership_visit_is_worth_its_share_of_the_sale():
    visits = {5: VisitValue(Decimal(3000) / 7, True)}
    result = calc(rate=30, clients=[{'reservation_id': 5, 'by_subscription': True, 'debt': 0}], visits=visits)
    assert result['paid_base'] == 428.57 and result['amount'] == 128.57


def test_membership_without_found_sale_is_an_estimate():
    visits = {5: VisitValue(Decimal(250), False)}
    result = calc(rate=40, clients=[{'reservation_id': 5, 'by_subscription': True, 'debt': 0}], visits=visits)
    assert (result['estimated_base'], result['paid_base'], result['amount']) == (250, 0, 100)


def test_unknown_membership_is_left_out_and_counted():
    result = calc(rate=40, clients=[{'reservation_id': 5, 'by_subscription': True, 'debt': 0},
                                    {'debt': 125, 'paid_amount': 0}])
    assert (result['amount'], result['unknown_count']) == (50, 1)


def test_visit_value_finds_the_sale_written_with_the_membership():
    sold = datetime(2026, 9, 1, 10, 0)

    def sale(amount, at, client=2, package='8'):
        return SimpleNamespace(client_id=client, item_key=package, amount=amount, created_at=at)

    sales = [sale(2400, sold), sale(3000, sold - timedelta(days=30)), sale(9999, sold, client=3),
             sale(7777, sold, package='9')]
    value = visit_value(8, sold, 2, 8, 3200, sales)
    assert value == VisitValue(Decimal(300), True)
    # No sale beside it: valued at the package price, which is not money received.
    assert visit_value(8, sold + timedelta(days=2), 2, 8, 3200, sales) == VisitValue(Decimal(400), False)
    assert visit_value(8, sold, 2, None, None, sales) is None
    assert visit_value(0, sold, 2, 8, 3200, sales) is None
