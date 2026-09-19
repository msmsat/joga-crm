"""Public auth errors have stable codes for every UI language; no database needed."""
import asyncio
import inspect
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from routers.auth import login as routes
from schemas import LoginRequest, Login2FARequest


class DB:
    def __init__(self, user):
        self.user = user

    async def execute(self, _query):
        return SimpleNamespace(scalars=lambda: SimpleNamespace(first=lambda: self.user))


@pytest.mark.parametrize('user,status,code', [
    (None, 401, 'invalid_credentials'),
    (SimpleNamespace(is_verified=True, hashed_password='unused'), 401, 'invalid_credentials'),
    (SimpleNamespace(is_verified=False), 403, 'account_not_verified'),
])
def test_login_returns_stable_error_code(monkeypatch, user, status, code):
    monkeypatch.setattr(routes, 'verify_password', lambda *_: False)
    request = Request({'type': 'http', 'headers': [], 'client': ('127.0.0.1', 1234)})
    with pytest.raises(HTTPException) as caught:
        asyncio.run(inspect.unwrap(routes.login)(
            LoginRequest(identifier='audit@example.invalid', password='invalid-password'), request, DB(user)))
    assert caught.value.status_code == status
    assert caught.value.detail['code'] == code
    assert caught.value.detail['message']


def test_invalid_two_factor_code_returns_translatable_error():
    request = Request({'type': 'http', 'headers': [], 'client': ('127.0.0.1', 1234)})
    with pytest.raises(HTTPException) as caught:
        asyncio.run(inspect.unwrap(routes.login_2fa)(
            Login2FARequest(identifier='audit@example.invalid', code='123456'), request, DB(None)))
    assert caught.value.status_code == 400
    assert caught.value.detail['code'] == 'invalid_code'
