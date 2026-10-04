import unittest
from datetime import datetime, timezone
from services.bumpix_import.matching import native_values


class NativeProfileTests(unittest.TestCase):
    def test_real_birthday_populates_the_normal_birth_date(self):
        millis = int(datetime(1990, 2, 3, tzinfo=timezone.utc).timestamp() * 1000)
        values, warnings = native_values({'name': 'Fictional', 'birthday': millis})
        self.assertEqual(values.get('birth_date'), '1990-02-03')
        self.assertFalse(warnings)

    def test_birthdays_before_1970_are_supported(self):
        millis = int(datetime(1965, 8, 9, tzinfo=timezone.utc).timestamp() * 1000)
        self.assertEqual(native_values({'name': 'Fictional', 'birthday': millis})[0].get('birth_date'), '1965-08-09')

    def test_absent_birthday_sentinels_do_not_generate_a_warning_or_date(self):
        for value in (None, '', 0, '0', 1, '1'):
            values, warnings = native_values({'name': 'Fictional', 'birthday': value})
            self.assertIsNone(values.get('birth_date'))
            self.assertFalse(warnings, str(value))

    def test_additional_contacts_and_address_are_native_fields(self):
        values, _ = native_values({'name': 'Fictional', 'phone2': '+420123456789', 'address': 'Fictional street'})
        self.assertEqual(values.get('phone2'), '+420123456789')
        self.assertEqual(values.get('address'), 'Fictional street')


if __name__ == '__main__':
    unittest.main()
