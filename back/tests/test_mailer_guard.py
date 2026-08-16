"""Барьер недоставляемых адресов (services/mailer.is_deliverable).

ЗАЧЕМ ЭТОТ ТЕСТ СУЩЕСТВУЕТ. Тесты заводят владельцев студий с адресами вида
`epic5-test-<hex>@example.invalid` (tests/test_danger_zone.py) и чистят их в
`finally` — но прогон, убитый на полпути, оставляет строки в dev-БД. Дальше
такую студию каждый вечер в 20:00 подхватывает `daily_notify` и шлёт владельцу
сводку. SMTP письмо ПРИНИМАЕТ, DNS домена не находит, и баунс возвращается в
ящик отправителя: восемь мёртвых студий = восемь писем каждый вечер.

Один guard у единственной двери наружу дешевле, чем чистить БД после каждого
падения прогона, — но работает он ровно до тех пор, пока список доменов не
разъехался с RFC. Отсюда этот тест.

Запуск из back/:  python -m tests.test_mailer_guard
"""
from services.mailer import is_deliverable


def test_reserved_tlds_are_not_deliverable():
    # RFC 6761: эти TLD гарантированно не существуют в DNS.
    assert not is_deliverable("epic5-test-75ce106f@example.invalid")
    assert not is_deliverable("a@somewhere.test")
    assert not is_deliverable("a@host.localhost")
    assert not is_deliverable("a@my.example")


def test_reserved_example_domains_are_not_deliverable():
    # RFC 2606: example.com/net/org зарезервированы под документацию.
    for domain in ("example.com", "example.net", "example.org"):
        assert not is_deliverable(f"a@{domain}"), domain


def test_case_and_trailing_dot_do_not_slip_through():
    """Адрес не нормализован: приходит как записан в БД. Заглавные буквы и
    DNS-корневая точка на конце — валидный способ записать тот же домен."""
    assert not is_deliverable("A@Example.INVALID")
    assert not is_deliverable("a@host.localhost.")
    assert not is_deliverable("  a@example.com  ")


def test_real_addresses_pass():
    assert is_deliverable("sadomat31@gmail.com")
    assert is_deliverable("owner@studio.ru")
    # Совпадение подстрокой ловить нельзя: «.invalid» запрещён как TLD целиком,
    # а не как кусок имени домена.
    assert is_deliverable("a@invalid-domain.ru")
    assert is_deliverable("a@test-studio.com")
    assert is_deliverable("a@example.company")


def test_empty_address_does_not_crash_the_guard():
    """Пустой/None email отсеивает вызывающий (notify проверяет r.email), но
    guard обязан пережить его без исключения — он стоит на пути ВСЕЙ почты."""
    assert is_deliverable("") is True   # не наше дело: «пусто» — не «мёртвый домен»
    assert is_deliverable(None) is True


if __name__ == "__main__":
    test_reserved_tlds_are_not_deliverable()
    test_reserved_example_domains_are_not_deliverable()
    test_case_and_trailing_dot_do_not_slip_through()
    test_real_addresses_pass()
    test_empty_address_does_not_crash_the_guard()
    print("ALL PASS")
