"""EPIC P2, задача 3: DELETE /auth/sessions/current отзывает ровно ту
сессию, которой сделан запрос — следующий запрос тем же токеном получает
401 от get_current_user. Без реальной БД/HTTP — фейковые DB/User, как в
остальных тестах auth (test_studio_onboarding.py, test_change_password.py).
Запуск из back/:  python -m tests.test_profile_sessions
"""
import asyncio

from fastapi import HTTPException

from dependencies import get_current_user
from routers.auth.login import logout_current_session
from security import create_access_token
from services.sessions import hash_token


def _run(coro):
    return asyncio.run(coro)


class _User:
    def __init__(self, id=1, email="a@x.com"):
        self.id = id
        self.email = email


class _Session:
    def __init__(self, user_id, token_hash):
        self.user_id = user_id
        self.token_hash = token_hash
        self.revoked_at = None
        self.last_active = None


class _R:
    def __init__(self, v):
        self._v = v

    def scalars(self):
        return self

    def first(self):
        return self._v

    def all(self):
        return self._v

    def scalar_one_or_none(self):
        return self._v


class _DB:
    """Отдаёт результаты по одному на каждый execute(), как в test_studio_onboarding.py."""
    def __init__(self, seq=()):
        self._seq = list(seq)
        self.committed = False

    async def execute(self, _q):
        return _R(self._seq.pop(0))

    async def commit(self):
        self.committed = True


def test_logout_revokes_the_callers_session():
    user = _User()
    token = create_access_token(data={"sub": user.email})
    session = _Session(user_id=user.id, token_hash=hash_token(token))

    db = _DB([session])
    _run(logout_current_session(token, user, db))

    assert session.revoked_at is not None
    assert db.committed is True


def test_logout_is_idempotent_when_session_row_is_gone():
    """Токен мог быть выдан в обход логина (verify-email/onboarding/select-studio) —
    нет строки в user_sessions вовсе. Ручка не должна падать, просто нечего отзывать."""
    user = _User()
    token = create_access_token(data={"sub": user.email})

    db = _DB([None])
    _run(logout_current_session(token, user, db))  # не должно бросить

    assert db.committed is False


def test_logout_then_get_current_user_returns_401():
    """Полный сценарий из ТЗ: логин → DELETE /auth/sessions/current → 204;
    следующий GET /auth/me тем же токеном → 401."""
    user = _User()
    token = create_access_token(data={"sub": user.email})
    session = _Session(user_id=user.id, token_hash=hash_token(token))

    logout_db = _DB([session])
    _run(logout_current_session(token, user, logout_db))
    assert session.revoked_at is not None

    # Тот же объект session (уже с revoked_at) — как если бы GET /auth/me
    # прочитал ту же строку из БД повторным SELECT.
    me_db = _DB([user, session])
    try:
        _run(get_current_user(token, me_db))
        assert False, "должно было упасть"
    except HTTPException as e:
        assert e.status_code == 401


def test_run_profile_sessions():
    test_logout_revokes_the_callers_session()
    test_logout_is_idempotent_when_session_row_is_gone()
    test_logout_then_get_current_user_returns_401()


if __name__ == "__main__":
    test_run_profile_sessions()
    print("ALL PASS")
