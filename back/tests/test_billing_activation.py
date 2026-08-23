"""Самопроверка активации тарифной модели (B2): расчёт комбо-фикса со скидкой
периода.

fake_iban() (тестовый детерминированный IBAN) удалена в Task 7 вместе с ручным
переводом счёта в paid, а сама оплата переводом — в переделке 13.08.2026: способ
оплаты остался один, карта. Комбо-фикс от этого не зависит — считается по каталогу.

Запуск из back/:  python -m tests.test_billing_activation
"""
from routers.billing.plans import COMBO_FIXED, PERIOD_DISCOUNTS


def test_combo_fixed_with_period_discount():
    # 15 мест = 80.00 €/мес, комбо-фикс — половина, 40.00 €/мес (COMBO_FIXED,
    # plans.py), период 12 → −40% → 24.00 €. Старое захардкоженное 124500 было
    # ценой ДО EUR-миграции (Task 1) и разошлось молча, потому что файл не
    # собирался (fake_iban, удалена в Task 7) — assert никогда не выполнялся.
    assert COMBO_FIXED["s15"] == 4000
    assert round(COMBO_FIXED["s15"] * (1 - PERIOD_DISCOUNTS[12])) == 2400


if __name__ == "__main__":
    test_combo_fixed_with_period_discount()
    print("ALL PASS — B2 combo-fixed discount")
