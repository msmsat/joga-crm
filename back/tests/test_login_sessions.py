"""Чистая логика логина сессий (EPIC 5, задача 2): парсинг клиентского IP.
Запуск из back/:  python -m tests.test_login_sessions
"""
from routers.auth.login import _client_ip


def test_client_ip_prefers_first_forwarded_address():
    assert _client_ip("203.0.113.7, 10.0.0.1", "10.0.0.1") == "203.0.113.7"


def test_client_ip_strips_whitespace_around_forwarded_address():
    assert _client_ip(" 203.0.113.7 , 10.0.0.1", "10.0.0.1") == "203.0.113.7"


def test_client_ip_falls_back_to_client_host_when_no_proxy_header():
    assert _client_ip(None, "127.0.0.1") == "127.0.0.1"
    assert _client_ip("", "127.0.0.1") == "127.0.0.1"


def test_client_ip_none_when_neither_source_available():
    assert _client_ip(None, None) is None


def test_run_login_sessions():
    test_client_ip_prefers_first_forwarded_address()
    test_client_ip_strips_whitespace_around_forwarded_address()
    test_client_ip_falls_back_to_client_host_when_no_proxy_header()
    test_client_ip_none_when_neither_source_available()


if __name__ == "__main__":
    test_run_login_sessions()
    print("ALL PASS")
