"""Нормализация контактов перед сравнением (services/contacts.normalize).

Без БД и без SMTP — безопасно прогонять в любой момент. SQL-двойник этой функции
(normalized_column) обязан давать тот же результат: правишь одну — правь обе.
"""
from services.contacts import normalize


def test_email_trim_and_lower():
    assert normalize("email", "  Ivan@Mail.RU ") == "ivan@mail.ru"


def test_phone_keeps_digits_only():
    assert normalize("phone", "+7 (999) 123-45-67") == "79991234567"
    assert normalize("phone", "79991234567") == "79991234567"


def test_phone_leading_eight_becomes_seven():
    assert normalize("phone", "8 999 123 45 67") == "79991234567"
    # 8 не трогаем, если это не 11-значный российский номер
    assert normalize("phone", "+8 12 34") == "81234"


def test_empty_is_free():
    for value in (None, "", "   "):
        assert normalize("email", value) is None
        assert normalize("phone", value) is None
