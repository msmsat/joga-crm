"""Вход в платформенную админку: один человек, свой секрет, свой токен.

Аккаунт живёт в переменных окружения, а НЕ строкой в `users`. Таблицу `users`
обслуживают восстановление пароля, OTP, вход через Google, приглашения и
членство в студиях — каждый из этих путей потенциально дотягивается до любой
её строки, и стойкость админки стала бы равна стойкости слабейшего из них.

Секрет подписи тоже отдельный. С общим `SECRET_KEY` любой выданный CRM токен
был бы здесь валидной подписью, и вся разница свелась бы к содержимому
claim'ов — то есть к тому, что подписано тем же ключом.

Значения читаются из окружения на КАЖДЫЙ вызов, а не кэшируются в модуле: так
смена пароля в `.env` применяется пересозданием контейнера, а тесты могут
подменять переменные обычным monkeypatch.
"""
import os
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import jwt

from security import pwd_context

ALGORITHM = "HS256"
DEFAULT_TTL_HOURS = 12

# auto_error=False: без заголовка хотим СВОЙ 401 с понятным текстом, а не
# 403 от самой схемы безопасности.
_bearer = HTTPBearer(auto_error=False)


def _env(name: str) -> str:
    return (os.getenv(name) or "").strip()


def is_configured() -> bool:
    """Админка включена, только если заданы все три обязательные переменные."""
    return bool(
        _env("ADMIN_LOGIN") and _env("ADMIN_PASSWORD_HASH") and _env("ADMIN_JWT_SECRET")
    )


def secret_conflicts() -> bool:
    """Секрет админки совпал с общим SECRET_KEY — подпись перестала их различать."""
    from security import SECRET_KEY

    return bool(_env("ADMIN_JWT_SECRET")) and _env("ADMIN_JWT_SECRET") == SECRET_KEY


def admin_name() -> str:
    return _env("ADMIN_NAME") or _env("ADMIN_LOGIN")


def ttl_hours() -> int:
    raw = _env("ADMIN_TOKEN_TTL_HOURS")
    try:
        value = int(raw) if raw else DEFAULT_TTL_HOURS
    except ValueError:
        return DEFAULT_TTL_HOURS
    return value if 1 <= value <= 24 * 7 else DEFAULT_TTL_HOURS


def verify_credentials(login: str, password: str) -> bool:
    if not is_configured():
        return False
    if (login or "").strip().lower() != _env("ADMIN_LOGIN").lower():
        return False
    try:
        return pwd_context.verify(password or "", _env("ADMIN_PASSWORD_HASH"))
    except Exception:
        # Битый или чужого формата хэш в .env — это отказ во входе, а не 500.
        return False


def issue_token() -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {
            "sub": "admin",
            "name": admin_name(),
            "iat": now,
            "exp": now + timedelta(hours=ttl_hours()),
        },
        _env("ADMIN_JWT_SECRET"),
        algorithm=ALGORITHM,
    )


def decode_token(token: str) -> dict:
    """Бросает jose.JWTError на любой невалидный, чужой или просроченный токен."""
    return jwt.decode(token, _env("ADMIN_JWT_SECRET"), algorithms=[ALGORITHM])


async def require_admin(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> dict:
    if not is_configured():
        raise HTTPException(status_code=503, detail="Админка не настроена")
    if creds is None or (creds.scheme or "").lower() != "bearer":
        raise HTTPException(status_code=401, detail="Нужен токен администратора")
    try:
        claims = decode_token(creds.credentials)
    except Exception:
        raise HTTPException(status_code=401, detail="Токен недействителен")
    if claims.get("sub") != "admin":
        raise HTTPException(status_code=401, detail="Токен недействителен")
    return claims
