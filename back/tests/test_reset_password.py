"""Проверка кода восстановления пароля (POST /auth/forgot-password →
/auth/reset-password). Тестируется то, на чём держится безопасность сценария:
одноразовость кода, скоуп по action, срок жизни, лимит попыток и хранение
хэшем. БД и SMTP не нужны — services.otp работает с объектом пользователя,
сессия подменена заглушкой, отправка письма — тоже.

Запуск из back/:  python -m tests.test_reset_password
"""
import asyncio
from datetime import datetime, timedelta

import services.otp as otp
from routers.auth.password import RESET_ACTION


class _FakeDB:
    async def commit(self):
        pass


class _FakeUser:
    def __init__(self):
        self.email = "reset-test@example.com"
        self.otp_code_hash = None
        self.otp_action = None
        self.otp_expires_at = None
        self.otp_attempts = 0


def _run(coro):
    return asyncio.run(coro)


def _issue(user, action=RESET_ACTION) -> str:
    """Выдаёт код, перехватывая письмо: наружу возвращается то, что ушло бы в почту."""
    sent = {}

    async def fake_send_email(to, subject, html):
        sent["html"] = html

    original = otp.send_email
    otp.send_email = fake_send_email
    try:
        _run(otp.issue(_FakeDB(), user, action))
    finally:
        otp.send_email = original

    code = "".join(ch for ch in sent["html"] if ch.isdigit())
    assert len(code) == 6, f"код должен быть 6-значным, получено: {code!r}"
    return code


def test_correct_code_passes_once():
    """Верный код принимается — и ровно один раз: повтор уже не пройдёт."""
    user = _FakeUser()
    code = _issue(user)
    assert _run(otp.verify(_FakeDB(), user, RESET_ACTION, code)) is True
    assert _run(otp.verify(_FakeDB(), user, RESET_ACTION, code)) is False


def test_wrong_code_rejected():
    user = _FakeUser()
    code = _issue(user)
    wrong = "000000" if code != "000000" else "111111"
    assert _run(otp.verify(_FakeDB(), user, RESET_ACTION, wrong)) is False


def test_code_is_scoped_to_action():
    """Код, выданный на смену пароля из аккаунта, не годится для сброса —
    иначе один перехваченный код открывал бы любой сценарий."""
    user = _FakeUser()
    code = _issue(user, action="change_password")
    assert _run(otp.verify(_FakeDB(), user, RESET_ACTION, code)) is False


def test_expired_code_rejected():
    user = _FakeUser()
    code = _issue(user)
    user.otp_expires_at = datetime.utcnow() - timedelta(seconds=1)
    assert _run(otp.verify(_FakeDB(), user, RESET_ACTION, code)) is False


def test_brute_force_is_capped():
    """После MAX_ATTEMPTS промахов не проходит уже и верный код."""
    user = _FakeUser()
    code = _issue(user)
    for _ in range(otp.MAX_ATTEMPTS):
        assert _run(otp.verify(_FakeDB(), user, RESET_ACTION, "999999")) is False
    assert _run(otp.verify(_FakeDB(), user, RESET_ACTION, code)) is False


def test_code_stored_hashed():
    """В БД лежит хэш: дамп таблицы не даёт сбросить чужой пароль."""
    user = _FakeUser()
    code = _issue(user)
    assert user.otp_code_hash and code not in user.otp_code_hash


def test_run_reset_password():
    test_correct_code_passes_once()
    test_wrong_code_rejected()
    test_code_is_scoped_to_action()
    test_expired_code_rejected()
    test_brute_force_is_capped()
    test_code_stored_hashed()


if __name__ == "__main__":
    test_run_reset_password()
    print("ALL PASS")
