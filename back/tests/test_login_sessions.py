"""Чистая логика логина сессий (EPIC 5, задача 2): парсинг клиентского IP и
срок жизни сессионного токена.
Запуск из back/:  python -m tests.test_login_sessions
"""
from datetime import datetime, timedelta

from jose import jwt

from routers.auth.login import _client_ip
from security import ALGORITHM, SECRET_KEY, create_access_token


def test_session_token_lives_half_a_year():
    """Refresh-токена в продукте нет: укоротишь TTL — ровно через столько
    человека выкинет на форму входа. Полгода — сознательный срок, не случайный."""
    exp = jwt.decode(
        create_access_token({"sub": "a@b.c"}), SECRET_KEY, algorithms=[ALGORITHM]
    )["exp"]
    assert datetime.utcfromtimestamp(exp) - datetime.utcnow() > timedelta(days=179)


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
    test_session_token_lives_half_a_year()
    test_client_ip_prefers_first_forwarded_address()
    test_client_ip_strips_whitespace_around_forwarded_address()
    test_client_ip_falls_back_to_client_host_when_no_proxy_header()
    test_client_ip_none_when_neither_source_available()


if __name__ == "__main__":
    test_run_login_sessions()
    print("ALL PASS")
