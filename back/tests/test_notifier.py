"""Ядро notifier.py (эпик N-1, задача 4): только чистые функции _render/_fmt_amount,
без БД — язык и валюту передаёт вызывающий, шаблоны не трогают SQLAlchemy.
Запуск из back/:  python -m tests.test_notifier
"""
import services.notifier as N


def test_render_localizes_by_lang_and_currency():
    subject_en, text_en, html_en = N._render("c4", {"amount": 1500}, "en", "USD")
    assert "1 500 $" in text_en
    assert subject_en == "Payment received"

    subject_ru, text_ru, html_ru = N._render("c4", {"amount": 1500}, "ru", "RUB")
    assert "1 500 ₽" in text_ru
    assert subject_ru == "Оплата получена"
    assert html_ru == f"<p>{text_ru}</p>"


def test_render_unknown_event_returns_none():
    assert N._render("c99-unknown", {}, "ru", "RUB") is None


def test_render_unknown_lang_falls_back_to_ru():
    subject_ru, text_ru, _ = N._render("c4", {"amount": 100}, "ru", "RUB")
    subject_de, text_de, _ = N._render("c4", {"amount": 100}, "de", "RUB")
    assert (subject_de, text_de) == (subject_ru, text_ru)


def test_fmt_amount_none_defaults_to_zero():
    assert N._fmt_amount(None, "RUB") == "0 ₽"


def test_fmt_amount_unknown_currency_uses_code_as_sign():
    assert N._fmt_amount(10, "XYZ") == "10 XYZ"


def test_render():
    test_render_localizes_by_lang_and_currency()
    test_render_unknown_event_returns_none()
    test_render_unknown_lang_falls_back_to_ru()
    test_fmt_amount_none_defaults_to_zero()
    test_fmt_amount_unknown_currency_uses_code_as_sign()


if __name__ == "__main__":
    test_render()
    print("ALL PASS")
