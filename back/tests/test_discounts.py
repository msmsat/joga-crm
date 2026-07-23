"""apply_discount (V5-5, задача 2) — общий расчёт скидки для промокода,
персонального оффера и студийной скидки. Без БД, чистая функция.

Запуск из back/:  python -m tests.test_discounts
"""
from services.discounts import apply_discount


class _Discount:
    def __init__(self, discount_type, value):
        self.discount_type = discount_type
        self.value = value


def test_percent():
    assert apply_discount(_Discount("percent", 15), 1000) == 150


def test_amount():
    assert apply_discount(_Discount("amount", 300), 1000) == 300


def test_amount_capped_at_total():
    assert apply_discount(_Discount("amount", 5000), 1000) == 1000


def test_never_negative():
    assert apply_discount(_Discount("amount", -50), 1000) == 0
    assert apply_discount(_Discount("percent", -10), 1000) == 0


if __name__ == "__main__":
    test_percent()
    test_amount()
    test_amount_capped_at_total()
    test_never_negative()
    print("ALL PASS")
