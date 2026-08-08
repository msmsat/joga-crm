"""Самопроверка активации тарифной модели (B2): расчёт комбо-фикса со скидкой
периода.

fake_iban() (тестовый детерминированный IBAN) удалена в Task 7 вместе с ручным
переводом счёта в paid — IBAN теперь настоящий, выданный Stripe
(funding_instructions в services/stripe_billing.py), а закрывает счёт сам Stripe
по входящему переводу. Сквозная проверка этой ветки — в
tests/test_billing_subscription.py::test_bank_transfer_closes_invoice_end_to_end.

Запуск из back/:  python -m tests.test_billing_activation
"""
from routers.billing.plans import COMBO_FIXED, PERIOD_DISCOUNTS


def test_combo_fixed_with_period_discount():
    # pro фикс 49.50 €/мес (COMBO_FIXED — половина от подписки 99.00 €, plans.py),
    # период 12 → −30% → 34.65 €. Старое захардкоженное 124500 было ценой ДО
    # EUR-миграции (Task 1) и разошлось молча, потому что файл не собирался
    # (fake_iban, удалена в Task 7) — assert никогда не выполнялся.
    assert COMBO_FIXED["pro"] == 4950
    assert round(COMBO_FIXED["pro"] * (1 - PERIOD_DISCOUNTS[12])) == 3465


if __name__ == "__main__":
    test_combo_fixed_with_period_discount()
    print("ALL PASS — B2 combo-fixed discount")
