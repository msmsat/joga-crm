"""Ссылка-приглашение: токен должен быть неподделываемым и одноцелевым.

Без БД и SMTP — чистая проверка кодирования/декодирования, поэтому запускать
можно всегда (в отличие от остальных тестов, см. CLAUDE.md §4).

Запуск: pytest back/tests/test_invite_token.py
"""
import asyncio

import pytest
from fastapi import HTTPException
from jose import jwt

from dependencies import get_current_user
from security import ALGORITHM, SECRET_KEY, create_access_token
from services.invites import build_invite_url, decode_invite


def _token_from(url: str) -> str:
    return url.split("token=", 1)[1]


def test_roundtrip():
    token = _token_from(build_invite_url("anna@velora.studio", 42))
    assert decode_invite(token) == ("anna@velora.studio", 42)


def test_rejects_session_token():
    """Обычный токен сессии не должен работать как приглашение: иначе любой
    залогиненный пользователь дотянулся бы до чужой студии, подставив её id."""
    token = create_access_token(data={"sub": "anna@velora.studio", "studio_id": 42, "role": "owner"})
    with pytest.raises(ValueError):
        decode_invite(token)


def test_rejects_otp_token():
    token = create_access_token(data={"sub": "anna@velora.studio", "studio_id": 42, "typ": "otp"})
    with pytest.raises(ValueError):
        decode_invite(token)


def test_rejects_foreign_signature():
    token = jwt.encode(
        {"sub": "anna@velora.studio", "studio_id": 42, "typ": "invite"},
        SECRET_KEY + "x", algorithm=ALGORITHM,
    )
    with pytest.raises(ValueError):
        decode_invite(token)


def test_rejects_expired():
    token = create_access_token(
        data={"sub": "anna@velora.studio", "studio_id": 42, "typ": "invite"},
        expires_minutes=-1,
    )
    with pytest.raises(ValueError):
        decode_invite(token)


def test_invite_token_is_not_a_session():
    """Приглашение обязано нести `typ` — на него опирается get_current_user,
    отсеивая спец-токены от сессионных."""
    token = _token_from(build_invite_url("anna@velora.studio", 42))
    assert jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])["typ"] == "invite"


@pytest.mark.parametrize("typ", ["invite", "otp"])
def test_get_current_user_rejects_special_tokens(typ):
    """Главный барьер: ссылка из письма (и одноразовый OTP-токен) не должны
    работать как Bearer-сессия. Проверка `typ` стоит до похода в БД, поэтому
    db здесь не нужен — если гард пропадёт, тест упадёт на db=None."""
    token = create_access_token(data={"sub": "anna@velora.studio", "studio_id": 42, "typ": typ})
    with pytest.raises(HTTPException) as e:
        asyncio.run(get_current_user(token=token, db=None))
    assert e.value.status_code == 401
