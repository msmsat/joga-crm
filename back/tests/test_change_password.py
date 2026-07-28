"""Гейт require_otp (EPIC 5, задача 4): заголовок обязателен, скоуп по
action, токен привязан к пользователю, обычный access_token не подходит.
guard() вызывается напрямую в обход FastAPI DI — user передаётся явно.
Запуск из back/:  python -m tests.test_change_password
"""
import asyncio

from fastapi import HTTPException

from dependencies import require_otp
from security import create_access_token


class _FakeUser:
    def __init__(self, email: str):
        self.email = email


def _run(coro):
    return asyncio.run(coro)


def _otp_token(sub: str, action: str) -> str:
    return create_access_token(data={"sub": sub, "action": action, "typ": "otp"}, expires_minutes=5)


def test_missing_header_is_401():
    guard = require_otp("change_password")
    user = _FakeUser("a@x.com")
    try:
        _run(guard(x_otp_token=None, user=user))
        assert False, "должно было упасть"
    except HTTPException as e:
        assert e.status_code == 401


def test_garbage_token_is_401():
    guard = require_otp("change_password")
    user = _FakeUser("a@x.com")
    try:
        _run(guard(x_otp_token="not-a-jwt", user=user))
        assert False, "должно было упасть"
    except HTTPException as e:
        assert e.status_code == 401


def test_wrong_action_is_403():
    guard = require_otp("change_password")
    user = _FakeUser("a@x.com")
    token = _otp_token("a@x.com", "delete_account")
    try:
        _run(guard(x_otp_token=token, user=user))
        assert False, "должно было упасть"
    except HTTPException as e:
        assert e.status_code == 403


def test_wrong_user_is_403():
    guard = require_otp("change_password")
    user = _FakeUser("victim@x.com")
    token = _otp_token("attacker@x.com", "change_password")
    try:
        _run(guard(x_otp_token=token, user=user))
        assert False, "должно было упасть"
    except HTTPException as e:
        assert e.status_code == 403


def test_regular_access_token_is_rejected():
    """Обычный login-токен (без typ=otp) не должен проходить гейт."""
    guard = require_otp("change_password")
    user = _FakeUser("a@x.com")
    token = create_access_token(data={"sub": "a@x.com"})
    try:
        _run(guard(x_otp_token=token, user=user))
        assert False, "должно было упасть"
    except HTTPException as e:
        assert e.status_code == 403


def test_matching_token_passes():
    guard = require_otp("change_password")
    user = _FakeUser("a@x.com")
    token = _otp_token("a@x.com", "change_password")
    _run(guard(x_otp_token=token, user=user))  # не должно бросить исключение


def test_run_change_password():
    test_missing_header_is_401()
    test_garbage_token_is_401()
    test_wrong_action_is_403()
    test_wrong_user_is_403()
    test_regular_access_token_is_rejected()
    test_matching_token_passes()


if __name__ == "__main__":
    test_run_change_password()
    print("ALL PASS")
