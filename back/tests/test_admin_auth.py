"""Вход в платформенную админку: аккаунт из окружения, свой секрет подписи.

Запуск из back/:  pytest tests/test_admin_auth.py -v
"""
import warnings

warnings.filterwarnings("ignore")

import pytest

from security import pwd_context
import services.admin_auth as admin_auth

PASSWORD = "koala-7-Dunes!"
LOGIN = "owner@velora.test"


@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setenv("ADMIN_LOGIN", LOGIN)
    monkeypatch.setenv("ADMIN_NAME", "Марат")
    monkeypatch.setenv("ADMIN_PASSWORD_HASH", pwd_context.hash(PASSWORD))
    monkeypatch.setenv("ADMIN_JWT_SECRET", "a" * 64)
    monkeypatch.setenv("ADMIN_TOKEN_TTL_HOURS", "12")


def test_not_configured_means_disabled(monkeypatch):
    # Недонастроенная админка обязана быть ВЫКЛЮЧЕНА, а не пускать всех.
    monkeypatch.setenv("ADMIN_LOGIN", "")
    monkeypatch.setenv("ADMIN_PASSWORD_HASH", "")
    monkeypatch.setenv("ADMIN_JWT_SECRET", "")
    assert admin_auth.is_configured() is False
    assert admin_auth.verify_credentials(LOGIN, PASSWORD) is False


def test_right_password_accepted(configured):
    assert admin_auth.is_configured() is True
    assert admin_auth.verify_credentials(LOGIN, PASSWORD) is True


def test_login_is_case_insensitive(configured):
    assert admin_auth.verify_credentials(LOGIN.upper(), PASSWORD) is True


def test_wrong_password_rejected(configured):
    assert admin_auth.verify_credentials(LOGIN, PASSWORD + "x") is False


def test_wrong_login_rejected(configured):
    assert admin_auth.verify_credentials("someone@else.test", PASSWORD) is False


def test_broken_hash_is_refusal_not_crash(configured, monkeypatch):
    # Битый хэш в .env — отказ во входе, а не 500 на публичной ручке.
    monkeypatch.setenv("ADMIN_PASSWORD_HASH", "не-хэш-вовсе")
    assert admin_auth.verify_credentials(LOGIN, PASSWORD) is False


def test_token_round_trip(configured):
    claims = admin_auth.decode_token(admin_auth.issue_token())
    assert claims["sub"] == "admin"
    assert claims["name"] == "Марат"


def test_token_signed_by_app_secret_is_rejected(configured):
    # Ради этого секрет и разделён: токен CRM не должен открывать админку.
    from jose import jwt
    from security import ALGORITHM, SECRET_KEY

    foreign = jwt.encode({"sub": "admin"}, SECRET_KEY, algorithm=ALGORITHM)
    with pytest.raises(Exception):
        admin_auth.decode_token(foreign)


def test_expired_token_is_rejected(configured):
    from datetime import datetime, timedelta, timezone
    from jose import jwt

    stale = jwt.encode(
        {"sub": "admin", "exp": datetime.now(timezone.utc) - timedelta(hours=1)},
        "a" * 64,
        algorithm="HS256",
    )
    with pytest.raises(Exception):
        admin_auth.decode_token(stale)


def test_secret_conflict_is_detected(configured, monkeypatch):
    from security import SECRET_KEY

    monkeypatch.setenv("ADMIN_JWT_SECRET", SECRET_KEY)
    assert admin_auth.secret_conflicts() is True


def test_ttl_falls_back_on_garbage(configured, monkeypatch):
    monkeypatch.setenv("ADMIN_TOKEN_TTL_HOURS", "как-нибудь")
    assert admin_auth.ttl_hours() == 12
