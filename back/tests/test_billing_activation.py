"""Самопроверка активации тарифной модели (B2): расчёт комбо-фикса со скидкой
периода.

fake_iban() (тестовый детерминированный IBAN) удалена в Task 7 вместе с ручным
переводом счёта в paid, а сама оплата переводом — в переделке 13.08.2026: способ
оплаты остался один, карта. Комбо-фикс от этого не зависит — считается по каталогу.

Запуск из back/:  python -m tests.test_billing_activation
"""
from routers.billing.plans import COMBO_FIXED, PERIOD_DISCOUNTS


def test_combo_fixed_with_period_discount():
    # 15 мест = 130.00 €/мес, комбо-фикс — половина, 65.00 €/мес.
    # Годовой период со скидкой 30% даёт 45.50 €/мес фиксированной части.
    assert COMBO_FIXED["s15"] == 6500
    assert round(COMBO_FIXED["s15"] * (1 - PERIOD_DISCOUNTS[12])) == 4550


if __name__ == "__main__":
    test_combo_fixed_with_period_discount()
    print("ALL PASS — B2 combo-fixed discount")
