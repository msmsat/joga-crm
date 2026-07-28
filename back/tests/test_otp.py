"""OTP-верификация (EPIC 5, задача 3): скоуп действия, TTL, лимит попыток,
одноразовость — без БД и без email (issue() не вызывается, чтобы тест не
слал реальные письма через настроенный SMTP).
Запуск из back/:  python -m tests.test_otp
"""
import asyncio
from datetime import datetime, timedelta

import services.otp as otp
from security import get_password_hash


class _FakeUser:
    def __init__(self, action="change_password", code="123456", expires_in=timedelta(minutes=10)):
        self.email = "test@example.com"
        self.otp_code_hash = get_password_hash(code)
        self.otp_action = action
        self.otp_expires_at = datetime.utcnow() + expires_in
        self.otp_attempts = 0


class _FakeDB:
    async def commit(self):
        pass


def _run(coro):
    return asyncio.run(coro)


def test_correct_code_verifies_and_is_one_time():
    user = _FakeUser(code="123456")
    assert _run(otp.verify(_FakeDB(), user, "change_password", "123456"))
    assert user.otp_code_hash is None and user.otp_action is None and user.otp_expires_at is None
    assert not _run(otp.verify(_FakeDB(), user, "change_password", "123456"))


def test_wrong_action_scope_rejected():
    user = _FakeUser(action="change_password")
    assert not _run(otp.verify(_FakeDB(), user, "delete_account", "123456"))


def test_expired_code_rejected():
    user = _FakeUser(expires_in=timedelta(minutes=-1))
    assert not _run(otp.verify(_FakeDB(), user, "change_password", "123456"))


def test_five_wrong_attempts_then_lockout_even_with_correct_code():
    user = _FakeUser(code="123456")
    for _ in range(5):
        assert not _run(otp.verify(_FakeDB(), user, "change_password", "000000"))
    assert user.otp_attempts == 5
    assert not _run(otp.verify(_FakeDB(), user, "change_password", "123456"))


def test_run_otp():
    test_correct_code_verifies_and_is_one_time()
    test_wrong_action_scope_rejected()
    test_expired_code_rejected()
    test_five_wrong_attempts_then_lockout_even_with_correct_code()


if __name__ == "__main__":
    test_run_otp()
    print("ALL PASS")
