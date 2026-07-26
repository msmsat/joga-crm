"""Самопроверка активации тарифной модели и IBAN-ветки (B2): расчёт комбо-фикса
со скидкой периода + детерминированность тестового IBAN.

Запуск из back/:  python -m tests.test_billing_activation
"""
from routers.billing.plans import COMBO_FIXED, PERIOD_DISCOUNTS
from routers.billing.checkout import fake_iban


def test_combo_fixed_with_period_discount():
    # pro фикс 1245.00 коп/мес, период 12 → −30%
    assert round(COMBO_FIXED["pro"] * (1 - PERIOD_DISCOUNTS[12])) == round(124500 * 0.70)


def test_fake_iban_deterministic():
    assert fake_iban(1) == fake_iban(1)          # повторное открытие модалки — тот же IBAN
    assert fake_iban(1) != fake_iban(2)           # разные студии не путаются
    assert fake_iban(1).startswith("DE")


if __name__ == "__main__":
    test_combo_fixed_with_period_discount()
    test_fake_iban_deterministic()
    print("ALL PASS — B2 combo-fixed discount + fake IBAN")
