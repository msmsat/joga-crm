from types import SimpleNamespace
from stretch_support import StretchCase
import models as m


class TrialScopeTests(StretchCase):
    def test_scope_is_opt_in_and_empty_means_disabled(self):
        from services.booking_rules import BookingRules, trial_service_allowed
        self.assertTrue(trial_service_allowed(BookingRules(), 99))
        self.assertTrue(trial_service_allowed(BookingRules(trial_service_ids=(1, 2, 3)), 2))
        self.assertFalse(trial_service_allowed(BookingRules(trial_service_ids=(1, 2, 3)), 4))
        self.assertFalse(trial_service_allowed(BookingRules(trial_service_ids=()), 1))

    async def test_group_receives_trial_individual_does_not(self):
        from services.booking_rules import BookingRules
        from services.booking_access import resolve_coverage, trial_eligible
        rules = BookingRules(trial_lesson_free=True, trial_discount_type='amount',
                             trial_discount_amount=200, trial_service_ids=(1, 2, 3))
        async with self.sessions.begin() as db:
            db.add(m.Client(id=1, studio_id=17, name='New client'))
            await db.flush()
            group = SimpleNamespace(service_id=1, start_time=__import__('datetime').datetime(2026, 10, 20))
            individual = SimpleNamespace(service_id=4, start_time=group.start_time)
            self.assertTrue((await resolve_coverage(db, 1, group, rules, lock=False))[1])
            self.assertFalse((await resolve_coverage(db, 1, individual, rules, lock=False))[1])
            self.assertEqual(await trial_eligible(db, [1], rules, service_id=4), set())

    def test_miniapp_uses_scope_on_each_lesson(self):
        from services.booking_rules import BookingRules
        from routers.booking.miniapp_lessons import _lesson_fields
        from datetime import datetime
        rules = BookingRules(trial_lesson_free=True, trial_discount_type='amount',
                             trial_discount_amount=200, trial_service_ids=(1,))
        # Exercise the actual miniapp serializer, not an imitation of its arithmetic.
        def lesson(service_id,price):
            return SimpleNamespace(id=1,service_id=service_id,price=price,total_spots=10,
                name='Test',level='',equipment='',teacher_name='Test',teacher_id=6,hall_id=None,branch_id=None,
                booking_mode='event',tz_iana='Europe/Prague',start_time=datetime(2026,10,20,9),duration_min=60)
        group = _lesson_fields(lesson(1,450),[],False,'CZK',{},rules,first_lesson=rules.first_lesson)
        individual = _lesson_fields(lesson(4,1000),[],False,'CZK',{},rules,first_lesson=rules.first_lesson)
        self.assertIn('250',group['first_lesson_price_str'])
        self.assertEqual(individual['first_lesson_price_str'],'')
