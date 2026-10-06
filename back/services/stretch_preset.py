"""Reviewed MY STRETCH prices and timetable for the approved test studio only."""
PRESET = 'stretch-test-v1'
TARGET = (17, 6, 'sadomat31@gmail.com')
SERVICES = {
    'back': ('Здорова спина', 450, 10, 'group', 'Стретчинг'),
    'splits': ('Розкішні шпагати', 450, 10, 'group', 'Стретчинг'),
    'combined': ('Спина + шпагат', 450, 10, 'group', 'Стретчинг'),
    'individual': ('Індивідуальне тренування', 1000, 1, 'individual', 'Індивідуальні заняття'),
}
SLOTS = [(day, minute, key) for day in (0, 2, 4) for minute, key in
         ((540, 'back'), (630, 'combined'), (840, 'combined'), (960, 'back'), (1020, 'splits'))]
SLOTS += [(5, 600, 'back'), (5, 840, 'combined')]
# key, display name, usable visits (including gifts), price, validity, format
PACKAGES = [
    ('group4', '4 заняття', 4, 1600, 30, 'group'),
    ('group8', '8 занять + 1 у подарунок', 9, 2800, 30, 'group'),
    ('group12', '12 занять + 1 у подарунок', 13, 4000, 60, 'group'),
    ('group16', '16 занять + 2 у подарунок', 18, 5100, 60, 'group'),
    ('group24', '24 заняття + 3 у подарунок', 27, 7300, 90, 'group'),
    *[(f'individual{count}', f'Індивідуальні: {count} тренувань', count, price, 30, 'individual')
      for count, price in ((1, 1000), (4, 3600), (8, 7200), (10, 9000), (12, 10800))],
]
