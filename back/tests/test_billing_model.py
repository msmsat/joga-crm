"""Самопроверка дельты B1: новые колонки биллинга — тумблер напоминания
перед автосписанием и тип метода оплаты (card|iban).

Запуск из back/:  python -m tests.test_billing_model
"""
from models import StudioBillingPlan, PaymentCard


def test_notify_before_autocharge_column():
    col = StudioBillingPlan.__table__.columns["notify_before_autocharge"]
    assert col.type.python_type is bool
    assert col.default.arg is True


def test_payment_card_method_type_column():
    col = PaymentCard.__table__.columns["method_type"]
    assert col.type.python_type is str
    assert col.default.arg == "card"


if __name__ == "__main__":
    test_notify_before_autocharge_column()
    test_payment_card_method_type_column()
    print("ALL PASS — B1 billing columns")
