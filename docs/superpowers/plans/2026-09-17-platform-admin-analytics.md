# Платформенная админка Velora — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Отдельный сайт на `/adm`, закрытый одним логином на JWT, где владелец продукта видит трафик лендинга, регистрации, входы, пробные периоды и деньги.

**Architecture:** Механизм раздачи копирует мини-приложение: папка `admin/` со своей сборкой Vite, `dist` монтируется в контейнер `api`, FastAPI отдаёт его точечными маршрутами. API живёт в том же бэкенде под префиксом `/adm/api` со своим секретом подписи. Новая таблица `landing_visits` плюс три колонки в существующих таблицах дают воронку визит → регистрация → пробный → оплата; всё остальное уже лежит в базе.

**Tech Stack:** FastAPI, SQLAlchemy 2 (async), Alembic, python-jose, passlib/bcrypt, slowapi; Vite + React 19 + TypeScript + Tailwind v4 + recharts.

**Spec:** [`docs/superpowers/specs/2026-09-17-platform-admin-analytics-design.md`](../specs/2026-09-17-platform-admin-analytics-design.md)

## Global Constraints

- **Коммиты только по явному разрешению пользователя.** CLAUDE.md запрещает `git commit`, `git push` и правку истории без спроса. Каждая задача заканчивается зелёными проверками и остановкой, а не коммитом.
- Текущая голова Alembic — `e2a9c4f17b35`. Первая новая ревизия (`2b8474752c32`) цепляется к ней, вторая (`aa457ff31dab`) — к первой.
- **Id ревизий не выдумывать «красиво».** В проекте уже есть ревизии вида `a1b2c3d4e5f6`, и повтор такого id замыкает историю в цикл (`alembic heads` падает с `CycleDetected`). Id взяты `secrets.token_hex(6)` и проверены на отсутствие в `migrations/versions/`.
- JWT подписывается через `from jose import jwt` (python-jose), как в `back/security.py`. Второй библиотеки не заводим.
- Хэш пароля — существующий `pwd_context` из `back/security.py`. Второй `CryptContext` не создавать.
- Rate limit — существующий `limiter` из `back/ratelimit.py` (slowapi, ключ по IP).
- Сырой IP посетителя лендинга не хранить нигде: только ISO-код страны.
- Разные валюты в одну сумму не складывать — всегда разбивка по валютам.
- Дату регистрации не выдумывать: неизвестна — NULL в базе и «неизвестно» в интерфейсе.
- Тесты пишут в **тестовую** базу (`TEST_DATABASE_URL`). Боевой `DATABASE_URL` при прогоне не подставлять. Схема ставится `python -m scripts.init_test_db`.
- В `back/pytest.ini` стоит `asyncio_mode = auto`: `async def`-тесты и async-фикстуры работают без маркеров. Маркеры `@pytest.mark.asyncio` в примерах ниже оставлены для читаемости и не обязательны — проект их намеренно не расставляет.
- Зависимости для тестов уже есть: `pytest-asyncio==1.4.0` и `httpx==0.28.1` в `back/requirements-dev.txt`. Новых ставить не нужно.
- Языки исходящих текстов правила §5 CLAUDE.md здесь не затрагиваются: админка одноязычная (русский), наружу писем не шлёт.

---

### Task 1: Сервис входа админки

**Files:**
- Create: `back/services/admin_auth.py`
- Create: `back/scripts/admin_password.py`
- Test: `back/tests/test_admin_auth.py`

**Interfaces:**
- Consumes: `pwd_context` и `SECRET_KEY` из `back/security.py`
- Produces: `is_configured() -> bool`, `secret_conflicts() -> bool`, `admin_name() -> str`, `verify_credentials(login: str, password: str) -> bool`, `ttl_hours() -> int`, `issue_token() -> str`, `decode_token(token: str) -> dict`, `require_admin(...) -> dict` (FastAPI-зависимость)

- [ ] **Step 1: Написать падающий тест**

Создать `back/tests/test_admin_auth.py`:

```python
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


def test_expired_token_is_rejected(configured, monkeypatch):
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
```

- [ ] **Step 2: Прогнать тест и убедиться, что он падает**

Run: `cd back && pytest tests/test_admin_auth.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'services.admin_auth'`

- [ ] **Step 3: Написать сервис**

Создать `back/services/admin_auth.py`:

```python
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
```

- [ ] **Step 4: Написать скрипт выдачи хэша**

Создать `back/scripts/admin_password.py`:

```python
"""Печатает bcrypt-хэш пароля для ADMIN_PASSWORD_HASH в back/.env.

Запуск из back/:  python -m scripts.admin_password

Пароль спрашивается скрытым вводом и НЕ передаётся аргументом командной
строки намеренно: аргумент осел бы в истории оболочки и в списке процессов.
"""
import getpass
import sys

sys.path.insert(0, ".")

from security import pwd_context  # noqa: E402


def main() -> int:
    first = getpass.getpass("Пароль администратора: ")
    if len(first) < 12:
        print("Слишком короткий: нужно хотя бы 12 символов.")
        return 1
    if first != getpass.getpass("Повторите: "):
        print("Пароли не совпали.")
        return 1
    print()
    print("Строка для back/.env:")
    print(f"ADMIN_PASSWORD_HASH={pwd_context.hash(first)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 5: Прогнать тесты**

Run: `cd back && pytest tests/test_admin_auth.py -v`
Expected: PASS, 11 тестов

- [ ] **Step 6: Остановиться на проверке**

Показать пользователю вывод pytest. Коммит — только после явного разрешения.

---

### Task 2: Роутер `/adm/api` и вход

**Files:**
- Create: `back/routers/admin/__init__.py`
- Create: `back/routers/admin/router.py`
- Create: `back/routers/admin/auth.py`
- Create: `back/schemas/admin.py`
- Modify: `back/main.py` (импорт и `include_router` рядом с остальными)
- Modify: `back/tests/test_ai_coverage.py` (`UI_ONLY`)
- Test: `back/tests/test_admin_api.py`

**Interfaces:**
- Consumes: `services.admin_auth.{verify_credentials, issue_token, admin_name, is_configured, require_admin}`
- Produces: роутер `routers.admin.router` с `POST /adm/api/login` и `GET /adm/api/me`; схемы `AdminLoginRequest`, `AdminTokenResponse`, `AdminMeResponse`

- [ ] **Step 1: Написать падающий тест**

Создать `back/tests/test_admin_api.py`:

```python
"""HTTP-контур админки: вход, отказ и защита чтения.

Запуск из back/:  pytest tests/test_admin_api.py -v
"""
import warnings

warnings.filterwarnings("ignore")

import pytest
from httpx import ASGITransport, AsyncClient

from security import pwd_context

PASSWORD = "koala-7-Dunes!"
LOGIN = "owner@velora.test"


@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setenv("ADMIN_LOGIN", LOGIN)
    monkeypatch.setenv("ADMIN_NAME", "Марат")
    monkeypatch.setenv("ADMIN_PASSWORD_HASH", pwd_context.hash(PASSWORD))
    monkeypatch.setenv("ADMIN_JWT_SECRET", "a" * 64)


async def _call(method: str, path: str, **kw):
    from main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as http:
        return await getattr(http, method)(path, **kw)


@pytest.mark.asyncio
async def test_login_returns_token(configured):
    r = await _call("post", "/adm/api/login", json={"login": LOGIN, "password": PASSWORD})
    assert r.status_code == 200, r.text
    assert r.json()["token"]
    assert r.json()["name"] == "Марат"


@pytest.mark.asyncio
async def test_wrong_password_is_401(configured):
    r = await _call("post", "/adm/api/login", json={"login": LOGIN, "password": "нет"})
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_me_needs_token(configured):
    assert (await _call("get", "/adm/api/me")).status_code == 401


@pytest.mark.asyncio
async def test_me_with_token(configured):
    login = await _call("post", "/adm/api/login", json={"login": LOGIN, "password": PASSWORD})
    token = login.json()["token"]
    r = await _call("get", "/adm/api/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json() == {"login": LOGIN, "name": "Марат"}


@pytest.mark.asyncio
async def test_disabled_admin_is_503(monkeypatch):
    monkeypatch.setenv("ADMIN_LOGIN", "")
    monkeypatch.setenv("ADMIN_PASSWORD_HASH", "")
    monkeypatch.setenv("ADMIN_JWT_SECRET", "")
    r = await _call("post", "/adm/api/login", json={"login": "x", "password": "y"})
    assert r.status_code == 503
```

- [ ] **Step 2: Прогнать тест и убедиться, что он падает**

Run: `cd back && pytest tests/test_admin_api.py -v`
Expected: FAIL — все маршруты отдают 404

- [ ] **Step 3: Написать схемы**

Создать `back/schemas/admin.py`:

```python
"""Схемы платформенной админки. Отдельный файл: к схемам студий эти данные
отношения не имеют и общих полей с ними не образуют."""
from pydantic import BaseModel


class AdminLoginRequest(BaseModel):
    login: str
    password: str


class AdminTokenResponse(BaseModel):
    token: str
    name: str


class AdminMeResponse(BaseModel):
    login: str
    name: str
```

- [ ] **Step 4: Написать роутер входа**

Создать `back/routers/admin/auth.py`:

```python
"""Вход в админку и представление о текущем администраторе."""
import os

from fastapi import APIRouter, Depends, HTTPException, Request

from ratelimit import limiter
from schemas.admin import AdminLoginRequest, AdminMeResponse, AdminTokenResponse
from services import admin_auth

router = APIRouter()


@router.post("/login", response_model=AdminTokenResponse)
# Пять попыток за пятнадцать минут: пароль здесь один на весь продукт, и
# неограниченный темп подбора — единственная реальная атака на эту ручку.
@limiter.limit("5/15minutes")
async def admin_login(body: AdminLoginRequest, request: Request):
    if not admin_auth.is_configured():
        raise HTTPException(status_code=503, detail="Админка не настроена")
    if not admin_auth.verify_credentials(body.login, body.password):
        # Один и тот же отказ на неверный логин и на неверный пароль: разные
        # ответы работали бы как проверялка существующего логина.
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")
    return AdminTokenResponse(token=admin_auth.issue_token(), name=admin_auth.admin_name())


@router.get("/me", response_model=AdminMeResponse)
async def admin_me(_claims: dict = Depends(admin_auth.require_admin)):
    return AdminMeResponse(
        login=(os.getenv("ADMIN_LOGIN") or "").strip(),
        name=admin_auth.admin_name(),
    )
```

- [ ] **Step 5: Собрать роутер раздела**

Создать `back/routers/admin/router.py`:

```python
"""Сборка маршрутов админки. Разделы чтения подключаются сюда же по мере
появления — см. задачи 8 и 9 плана."""
from fastapi import APIRouter

from .auth import router as auth_router

router = APIRouter()
router.include_router(auth_router)
```

Создать `back/routers/admin/__init__.py`:

```python
from .router import router

__all__ = ["router"]
```

- [ ] **Step 6: Подключить в main.py**

В `back/main.py` добавить импорт рядом с остальными роутерами (после строки `from routers.checkout import ...`):

```python
from routers.admin import router as admin_router
```

И регистрацию — после строки `app.include_router(billing_router, prefix="/billing", tags=["Billing"])`:

```python
# Платформенная админка: свой секрет подписи, своя зависимость, студии у неё нет
# вовсе — поэтому ни JWT кабинета, ни гейт подписки к ней не применяются.
app.include_router(admin_router, prefix="/adm/api", tags=["Admin"])
```

- [ ] **Step 7: Внести маршрут в UI_ONLY**

В `back/tests/test_ai_coverage.py`, в словарь `UI_ONLY`, добавить после блока про вход и регистрацию:

```python
    # ── Платформенная админка: контур владельца продукта, а не студии
    "POST /adm/api/login": "вход владельца продукта в платформенную админку — "
                           "контекста студии у этого контура нет вовсе",
```

- [ ] **Step 8: Прогнать тесты**

Run: `cd back && pytest tests/test_admin_api.py tests/test_ai_coverage.py -v`
Expected: PASS

- [ ] **Step 9: Остановиться на проверке**

---

### Task 3: Таблица визитов лендинга

**Files:**
- Create: `back/models/platform.py`
- Modify: `back/models/__init__.py`
- Create: `back/migrations/versions/2b8474752c32_landing_visits.py`

**Interfaces:**
- Produces: модель `LandingVisit` с полями `id, anon_id, path, referrer, utm_source, utm_medium, utm_campaign, country, device, lang, created_at`

- [ ] **Step 1: Написать модель**

Создать `back/models/platform.py`:

```python
"""Данные о продукте как о бизнесе: кто пришёл на лендинг.

Отдельный файл, а не `analytics.py`: там метрики КОНКРЕТНОЙ студии, здесь —
метрики платформы. У этих таблиц нет ни общего ключа, ни общего потребителя,
и складывать их в один модуль значило бы путать два разных смысла слова
«аналитика».
"""
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class LandingVisit(Base):
    """Один заход на лендинг.

    Сырого IP здесь нет и быть не должно: из него на лету берётся только
    ISO-код страны (services/geo_locale.visitor_country), а сам адрес никуда
    не пишется.

    `anon_id` — идентификатор браузера из localStorage. Он же уезжает в
    `users.signup_anon_id` при регистрации, и на этом держится вся воронка:
    без него визит и аккаунт остаются двумя несвязанными фактами.
    """

    __tablename__ = "landing_visits"
    __table_args__ = (
        # Составной индекс под дедупликацию: «был ли этот же браузер на этом же
        # пути за последние 30 минут» — самый частый запрос к таблице.
        Index("ix_landing_visits_anon_path_time", "anon_id", "path", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    anon_id: Mapped[str] = mapped_column(String(64), index=True)
    path: Mapped[str] = mapped_column(String(200))
    referrer: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    utm_source: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    utm_medium: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    utm_campaign: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    country: Mapped[Optional[str]] = mapped_column(String(2), nullable=True)
    device: Mapped[str] = mapped_column(String(10), default="unknown")
    lang: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), server_default=func.now(), index=True
    )
```

- [ ] **Step 2: Экспортировать модель**

В `back/models/__init__.py` добавить в том же стиле, что соседние строки:

```python
from .platform import LandingVisit
```

и дописать `"LandingVisit"` в `__all__`, если он там есть.

- [ ] **Step 3: Написать миграцию**

Создать `back/migrations/versions/2b8474752c32_landing_visits.py`:

```python
"""landing visits: кто заходил на лендинг

Revision ID: 2b8474752c32
Revises: e2a9c4f17b35
Create Date: 2026-09-17

Новая таблица, ничего существующего не трогает, поэтому downgrade безопасен:
он удаляет ровно то, что создал.

Миграция написана руками, а не autogenerate: dev-база проекта стоит на более
ранней ревизии, и автогенератор приписал бы сюда чужой дрейф схемы.
"""
import sqlalchemy as sa
from alembic import op

revision = "2b8474752c32"
down_revision = "e2a9c4f17b35"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "landing_visits",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("anon_id", sa.String(length=64), nullable=False),
        sa.Column("path", sa.String(length=200), nullable=False),
        sa.Column("referrer", sa.String(length=300), nullable=True),
        sa.Column("utm_source", sa.String(length=100), nullable=True),
        sa.Column("utm_medium", sa.String(length=100), nullable=True),
        sa.Column("utm_campaign", sa.String(length=100), nullable=True),
        sa.Column("country", sa.String(length=2), nullable=True),
        sa.Column("device", sa.String(length=10), nullable=False, server_default="unknown"),
        sa.Column("lang", sa.String(length=5), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=False),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_landing_visits_id", "landing_visits", ["id"])
    op.create_index("ix_landing_visits_anon_id", "landing_visits", ["anon_id"])
    op.create_index("ix_landing_visits_created_at", "landing_visits", ["created_at"])
    op.create_index(
        "ix_landing_visits_anon_path_time",
        "landing_visits",
        ["anon_id", "path", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_landing_visits_anon_path_time", table_name="landing_visits")
    op.drop_index("ix_landing_visits_created_at", table_name="landing_visits")
    op.drop_index("ix_landing_visits_anon_id", table_name="landing_visits")
    op.drop_index("ix_landing_visits_id", table_name="landing_visits")
    op.drop_table("landing_visits")
```

- [ ] **Step 4: Проверить, что модель импортируется и миграция линейна**

Run: `cd back && python -c "from models import LandingVisit; print(LandingVisit.__tablename__)"`
Expected: `landing_visits`

Run: `cd back && alembic heads`
Expected: одна голова — `2b8474752c32`

- [ ] **Step 5: Поставить таблицу в тестовую базу**

Run: `cd back && python -m scripts.init_test_db`
Expected: команда завершилась без ошибок, новая таблица создана

- [ ] **Step 6: Остановиться на проверке**

---

### Task 4: Сборщик визитов `POST /landing/visit`

**Files:**
- Create: `back/routers/admin/collect.py`
- Create: `back/services/visit_collector.py`
- Modify: `back/routers/admin/__init__.py` (экспорт второго роутера)
- Modify: `back/main.py` (регистрация публичного роутера)
- Modify: `back/tests/test_ai_coverage.py` (`UI_ONLY`)
- Create: `back/schemas/admin.py` (дополнить)
- Test: `back/tests/test_landing_visit.py`

**Interfaces:**
- Consumes: модель `LandingVisit` из задачи 3; `services.geo_locale.visitor_country`
- Produces: `services.visit_collector.{device_from_ua, clip, record_visit}`; публичный роутер `routers.admin.collect_router` с `POST /landing/visit`

- [ ] **Step 1: Написать падающий тест**

Создать `back/tests/test_landing_visit.py`:

```python
"""Сборщик визитов лендинга: страна и устройство считает сервер, повторы
схлопываются, мусор не роняет страницу.

Запуск из back/:  pytest tests/test_landing_visit.py -v
"""
import warnings

warnings.filterwarnings("ignore")

import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select

from database import async_session_maker
from models import LandingVisit
from services.visit_collector import clip, device_from_ua

IPHONE_UA = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
)
DESKTOP_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/130.0.0.0 Safari/537.36"
)


def test_device_from_ua():
    assert device_from_ua(IPHONE_UA) == "mobile"
    assert device_from_ua(DESKTOP_UA) == "desktop"
    assert device_from_ua("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)") == "tablet"
    assert device_from_ua(None) == "unknown"


def test_clip_never_exceeds_column():
    assert clip("x" * 900, 300) == "x" * 300
    assert clip(None, 300) is None
    assert clip("  ", 300) is None


async def _post(body: dict, headers: dict | None = None):
    from main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as http:
        return await http.post("/landing/visit", json=body, headers=headers or {})


async def _rows(anon: str) -> list[LandingVisit]:
    async with async_session_maker() as db:
        return list(
            (await db.execute(select(LandingVisit).where(LandingVisit.anon_id == anon)))
            .scalars()
            .all()
        )


async def _cleanup(anon: str):
    async with async_session_maker() as db:
        await db.execute(delete(LandingVisit).where(LandingVisit.anon_id == anon))
        await db.commit()


@pytest.mark.asyncio
async def test_visit_is_recorded_with_server_side_country_and_device():
    anon = f"test-{uuid.uuid4()}"
    try:
        r = await _post(
            {"anon_id": anon, "path": "/", "referrer": "https://google.com/search",
             "utm_source": "google", "lang": "ru"},
            headers={"CF-IPCountry": "CZ", "User-Agent": IPHONE_UA},
        )
        assert r.status_code == 204
        rows = await _rows(anon)
        assert len(rows) == 1
        assert rows[0].country == "CZ"
        assert rows[0].device == "mobile"
        assert rows[0].utm_source == "google"
    finally:
        await _cleanup(anon)


@pytest.mark.asyncio
async def test_country_from_body_is_ignored():
    # Клиент не источник правды о своей стране: иначе счётчик показывает то,
    # что ему прислали.
    anon = f"test-{uuid.uuid4()}"
    try:
        await _post(
            {"anon_id": anon, "path": "/", "country": "US", "device": "desktop"},
            headers={"CF-IPCountry": "DE", "User-Agent": IPHONE_UA},
        )
        rows = await _rows(anon)
        assert rows[0].country == "DE"
        assert rows[0].device == "mobile"
    finally:
        await _cleanup(anon)


@pytest.mark.asyncio
async def test_reload_within_window_does_not_duplicate():
    # Без этого перезагрузка страницы = новый «визит», и график трафика
    # становится графиком нажатий F5.
    anon = f"test-{uuid.uuid4()}"
    try:
        await _post({"anon_id": anon, "path": "/"}, headers={"CF-IPCountry": "CZ"})
        await _post({"anon_id": anon, "path": "/"}, headers={"CF-IPCountry": "CZ"})
        assert len(await _rows(anon)) == 1
    finally:
        await _cleanup(anon)


@pytest.mark.asyncio
async def test_other_path_is_a_new_visit():
    anon = f"test-{uuid.uuid4()}"
    try:
        await _post({"anon_id": anon, "path": "/"})
        await _post({"anon_id": anon, "path": "/pricing"})
        assert len(await _rows(anon)) == 2
    finally:
        await _cleanup(anon)


@pytest.mark.asyncio
async def test_long_referrer_does_not_break_the_insert():
    anon = f"test-{uuid.uuid4()}"
    try:
        r = await _post({"anon_id": anon, "path": "/", "referrer": "https://x.test/" + "a" * 5000})
        assert r.status_code == 204
        assert len(await _rows(anon)) == 1
    finally:
        await _cleanup(anon)


@pytest.mark.asyncio
async def test_garbage_body_is_204_and_writes_nothing():
    # Счётчик не имеет права ни ронять лендинг, ни рассказывать о своей схеме.
    r = await _post({"нет": "полей"})
    assert r.status_code == 204
```

- [ ] **Step 2: Прогнать тест и убедиться, что он падает**

Run: `cd back && pytest tests/test_landing_visit.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'services.visit_collector'`

- [ ] **Step 3: Написать сервис сбора**

Создать `back/services/visit_collector.py`:

```python
"""Запись визита на лендинг: нормализация, дедупликация, обрезка.

Вынесено из роутера, потому что тут три отдельных правила, каждое из которых
проверяется само по себе: чем считать устройство, что считать повтором и как
не уронить вставку слишком длинной строкой.
"""
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import LandingVisit

# Окно, внутри которого повторный заход того же браузера на тот же путь
# считается тем же визитом.
DEDUP_MINUTES = 30

_TABLET = ("ipad", "tablet", "playbook", "silk")
_MOBILE = ("iphone", "ipod", "android", "mobile", "windows phone", "opera mini")


def device_from_ua(user_agent: str | None) -> str:
    """Грубая, но честная классификация. Полноценный парсер UA сюда не нужен:
    в отчёте различаются три корзины, и цена ошибки — одна строка графика."""
    ua = (user_agent or "").lower()
    if not ua:
        return "unknown"
    if any(marker in ua for marker in _TABLET):
        return "tablet"
    # Android-планшет от телефона отличается отсутствием слова mobile — это
    # рекомендация самих Android-доков, а не догадка.
    if "android" in ua and "mobile" not in ua:
        return "tablet"
    if any(marker in ua for marker in _MOBILE):
        return "mobile"
    return "desktop"


def clip(value: str | None, limit: int) -> str | None:
    """Обрезает строку под длину колонки. Referrer длиной в километр — обычное
    дело, и без этого он ронял бы вставку на StringDataRightTruncation."""
    if value is None:
        return None
    text = value.strip()
    if not text:
        return None
    return text[:limit]


async def record_visit(
    db: AsyncSession,
    *,
    anon_id: str,
    path: str,
    referrer: str | None,
    utm_source: str | None,
    utm_medium: str | None,
    utm_campaign: str | None,
    lang: str | None,
    country: str | None,
    device: str,
) -> bool:
    """Пишет визит. Возвращает False, если это повтор внутри окна."""
    since = datetime.utcnow() - timedelta(minutes=DEDUP_MINUTES)
    recent = (
        await db.execute(
            select(LandingVisit.id)
            .where(
                LandingVisit.anon_id == anon_id,
                LandingVisit.path == path,
                LandingVisit.created_at >= since,
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    if recent is not None:
        return False

    db.add(
        LandingVisit(
            anon_id=anon_id,
            path=path,
            referrer=clip(referrer, 300),
            utm_source=clip(utm_source, 100),
            utm_medium=clip(utm_medium, 100),
            utm_campaign=clip(utm_campaign, 100),
            lang=clip(lang, 5),
            country=country,
            device=device,
        )
    )
    await db.commit()
    return True
```

- [ ] **Step 4: Дописать схему запроса**

В конец `back/schemas/admin.py` добавить:

```python
class LandingVisitRequest(BaseModel):
    """Тело маяка с лендинга.

    Страны и устройства здесь НЕТ намеренно: их считает сервер по заголовкам.
    Лишние поля Pydantic отбросит, поэтому старый бандл в кэше браузера ничего
    не сломает.
    """

    anon_id: str
    path: str
    referrer: str | None = None
    utm_source: str | None = None
    utm_medium: str | None = None
    utm_campaign: str | None = None
    lang: str | None = None
```

- [ ] **Step 5: Написать роутер сбора**

Создать `back/routers/admin/collect.py`:

```python
"""Публичный маяк лендинга. Без авторизации: его зовёт браузер анонимного
посетителя, у которого никакого токена ещё нет и быть не может."""
import logging

from fastapi import APIRouter, Depends, Request, Response
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from ratelimit import limiter
from schemas.admin import LandingVisitRequest
from services.geo_locale import visitor_country
from services.visit_collector import clip, device_from_ua, record_visit

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/landing/visit", status_code=204, include_in_schema=False)
# Лимит нужен не от людей, а от того, кто решит набить таблицу: маяк открыт
# всему интернету и ничего не требует взамен.
@limiter.limit("60/minute")
async def landing_visit(request: Request, db: AsyncSession = Depends(get_db)):
    # Тело читаем сами и валидируем вручную: маяк обязан отвечать 204 даже на
    # мусор. Штатный 422 от FastAPI рассказал бы случайному любопытному всю
    # схему запроса и подсветил бы ручку как интересную.
    try:
        body = LandingVisitRequest.model_validate(await request.json())
    except (ValidationError, ValueError):
        return Response(status_code=204)

    anon_id = clip(body.anon_id, 64)
    path = clip(body.path, 200)
    if not anon_id or not path:
        return Response(status_code=204)

    country = visitor_country(
        request.headers.get("CF-IPCountry"),
        request.client.host if request.client else None,
    )
    device = device_from_ua(request.headers.get("User-Agent"))

    try:
        await record_visit(
            db,
            anon_id=anon_id,
            path=path,
            referrer=body.referrer,
            utm_source=body.utm_source,
            utm_medium=body.utm_medium,
            utm_campaign=body.utm_campaign,
            lang=body.lang,
            country=country,
            device=device,
        )
    except Exception:
        # Счётчик никогда не ломает страницу, ради которой его позвали.
        logger.warning("не удалось записать визит лендинга", exc_info=True)

    return Response(status_code=204)
```

- [ ] **Step 6: Экспортировать и подключить**

`back/routers/admin/__init__.py` привести к виду:

```python
from .collect import router as collect_router
from .router import router

__all__ = ["router", "collect_router"]
```

В `back/main.py` дополнить импорт:

```python
from routers.admin import router as admin_router, collect_router as landing_collect_router
```

и добавить регистрацию рядом с `admin_router`:

```python
# Маяк лендинга — публичный и БЕЗ префикса админки: его зовёт браузер
# анонимного посетителя, а /adm/api закрыт токеном целиком.
app.include_router(landing_collect_router, tags=["Admin"])
```

- [ ] **Step 7: Внести маршрут в UI_ONLY**

В `back/tests/test_ai_coverage.py` дописать в тот же блок, что и в задаче 2:

```python
    "POST /landing/visit": "анонимный счётчик посещений лендинга, его зовёт "
                           "браузер посетителя без авторизации",
```

- [ ] **Step 8: Прогнать тесты**

Run: `cd back && pytest tests/test_landing_visit.py tests/test_ai_coverage.py -v`
Expected: PASS

- [ ] **Step 9: Остановиться на проверке**

---

### Task 5: Даты регистрации и ключ склейки

**Files:**
- Modify: `back/models/user.py` (две колонки)
- Modify: `back/models/studio.py` (одна колонка)
- Create: `back/migrations/versions/aa457ff31dab_signup_dates_and_anon_id.py`
- Test: `back/tests/test_signup_backfill.py`

**Interfaces:**
- Produces: `User.created_at`, `User.signup_anon_id`, `Studio.created_at`

- [ ] **Step 1: Добавить колонки в модели**

В `back/models/user.py`, в класс `User`, после `last_online_at`:

```python
    # Когда заведён аккаунт. Колонки не было с самого начала, поэтому у старых
    # строк она заполнена задним числом по первой сессии, а где сессий не было —
    # осталась NULL. NULL здесь значит «неизвестно», и интерфейс обязан писать
    # именно это: выдуманную дату потом не отличить от настоящей.
    created_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=False), server_default=func.now(), nullable=True
    )
    # Идентификатор браузера, с которого пришла регистрация (localStorage
    # лендинга). Единственное, что связывает анонимный визит с аккаунтом;
    # без него визит и регистрация остаются двумя несвязанными фактами.
    signup_anon_id: Mapped[Optional[str]] = mapped_column(
        String(64), nullable=True, index=True
    )
```

В `back/models/studio.py`, в класс `Studio`, после `strict_schedule_enabled`:

```python
    # Когда создана студия. См. комментарий у User.created_at: у строк, заведённых
    # до появления колонки, здесь NULL, и это честное «неизвестно».
    created_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=False), server_default=func.now(), nullable=True
    )
```

В шапке `back/models/studio.py` дополнить импорты:

```python
from datetime import datetime
from sqlalchemy import Boolean, DateTime, Integer, String, func
```

- [ ] **Step 2: Написать миграцию**

Создать `back/migrations/versions/aa457ff31dab_signup_dates_and_anon_id.py`:

```python
"""signup dates and anon id: когда завели аккаунт и откуда пришли

Revision ID: aa457ff31dab
Revises: 2b8474752c32
Create Date: 2026-09-17

ПОРЯДОК ШАГОВ ОБЯЗАТЕЛЕН И НЕ ПЕРЕСТАВЛЯЕТСЯ.

Колонка добавляется БЕЗ server_default, потом заполняется, и только потом
default ставится на будущее. Добавление сразу с server_default в Postgres
проставило бы всем существующим строкам момент выката — то есть навсегда
подменило бы историю регистраций датой миграции и нарисовало на графике
вертикальную стену из тысячи «регистраций» одной секундой.

Заполняем тем, что реально знаем: у пользователя — время его первой сессии,
у студии — самая ранняя из известных дат её участников. Где не знаем — оставляем
NULL. NULL честнее правдоподобной выдумки: выдумку уже не отличить от факта.
"""
import sqlalchemy as sa
from alembic import op

revision = "aa457ff31dab"
down_revision = "2b8474752c32"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Колонки без default.
    op.add_column("users", sa.Column("created_at", sa.DateTime(timezone=False), nullable=True))
    op.add_column("users", sa.Column("signup_anon_id", sa.String(length=64), nullable=True))
    op.add_column("studios", sa.Column("created_at", sa.DateTime(timezone=False), nullable=True))
    op.create_index("ix_users_signup_anon_id", "users", ["signup_anon_id"])

    # 2. Заполнение по тому, что известно.
    op.execute(
        """
        UPDATE users u
           SET created_at = s.first_seen
          FROM (
            SELECT user_id, MIN(created_at) AS first_seen
              FROM user_sessions
             GROUP BY user_id
          ) s
         WHERE s.user_id = u.id
        """
    )
    op.execute(
        """
        UPDATE studios st
           SET created_at = m.first_seen
          FROM (
            SELECT sm.studio_id, MIN(u.created_at) AS first_seen
              FROM studio_members sm
              JOIN users u ON u.id = sm.user_id
             WHERE u.created_at IS NOT NULL
             GROUP BY sm.studio_id
          ) m
         WHERE m.studio_id = st.id
        """
    )

    # 3. И только теперь default — он касается лишь будущих строк.
    op.alter_column("users", "created_at", server_default=sa.func.now())
    op.alter_column("studios", "created_at", server_default=sa.func.now())


def downgrade() -> None:
    op.drop_index("ix_users_signup_anon_id", table_name="users")
    op.drop_column("studios", "created_at")
    op.drop_column("users", "signup_anon_id")
    op.drop_column("users", "created_at")
```

- [ ] **Step 3: Написать тест на то, что история не подменена**

Создать `back/tests/test_signup_backfill.py`:

```python
"""Колонки дат регистрации существуют и НЕ заполнены поголовно одной датой.

Главное, что здесь проверяется, — что миграция не подменила историю моментом
выката. Такую ошибку потом не отличить от настоящих данных, и заметить её надо
сразу.

Запуск из back/:  pytest tests/test_signup_backfill.py -v
"""
import warnings

warnings.filterwarnings("ignore")

import pytest
from sqlalchemy import func, select

from database import async_session_maker
from models import Studio, User


@pytest.mark.asyncio
async def test_columns_exist():
    async with async_session_maker() as db:
        await db.execute(select(User.created_at, User.signup_anon_id).limit(1))
        await db.execute(select(Studio.created_at).limit(1))


@pytest.mark.asyncio
async def test_existing_rows_are_not_all_stamped_with_one_moment():
    async with async_session_maker() as db:
        total = (await db.execute(select(func.count(User.id)))).scalar_one()
        if total < 2:
            pytest.skip("в базе меньше двух пользователей — проверять нечего")
        filled = (
            await db.execute(
                select(func.count(func.distinct(User.created_at))).where(
                    User.created_at.isnot(None)
                )
            )
        ).scalar_one()
        # Одно-единственное значение на всю таблицу — верный признак того, что
        # колонку добавили сразу с server_default.
        assert filled != 1, "у всех пользователей одна и та же дата регистрации"
```

- [ ] **Step 4: Применить и проверить**

Run: `cd back && alembic heads`
Expected: одна голова — `aa457ff31dab`

Run: `cd back && python -m scripts.init_test_db && pytest tests/test_signup_backfill.py -v`
Expected: PASS

- [ ] **Step 5: Остановиться на проверке**

Отдельно сказать пользователю: на боевой базе миграцию накатывать только после бэкапа (`backup.sh`), потому что она трогает `users` и `studios`.

---

### Task 6: Регистрация принимает `anon_id`

**Files:**
- Modify: `back/schemas/auth/requests.py:36-47` (`RegisterRequest`)
- Modify: `back/routers/auth/register.py:74-88`
- Test: `back/tests/test_register_anon_id.py`

**Interfaces:**
- Consumes: `User.signup_anon_id` из задачи 5
- Produces: `RegisterRequest.anon_id: str | None`

- [ ] **Step 1: Написать падающий тест**

Создать `back/tests/test_register_anon_id.py`:

```python
"""Регистрация запоминает браузер, с которого пришла: без этого воронка
визит → регистрация не собирается.

Запуск из back/:  pytest tests/test_register_anon_id.py -v
"""
import warnings

warnings.filterwarnings("ignore")

import pytest

from schemas import RegisterRequest


def test_anon_id_is_optional():
    # Необязательное поле: старый бандл в кэше браузера и прямые вызовы API
    # обязаны продолжать работать.
    body = RegisterRequest(
        email="a@b.test", name="A", password="koala-7-Dunes!", accept_terms=True
    )
    assert body.anon_id is None


def test_anon_id_is_accepted_and_clipped():
    body = RegisterRequest(
        email="a@b.test",
        name="A",
        password="koala-7-Dunes!",
        accept_terms=True,
        anon_id="x" * 500,
    )
    assert body.anon_id is not None
    assert len(body.anon_id) <= 64
```

- [ ] **Step 2: Прогнать тест и убедиться, что он падает**

Run: `cd back && pytest tests/test_register_anon_id.py -v`
Expected: FAIL — `AttributeError: 'RegisterRequest' object has no attribute 'anon_id'`

- [ ] **Step 3: Дополнить схему**

В `back/schemas/auth/requests.py`, в класс `RegisterRequest`, после `accept_terms`:

```python
    # Идентификатор браузера с лендинга (localStorage). Необязателен: регистрация
    # бывает и мимо лендинга — по прямой ссылке, из приглашения, с почты.
    # Обрезается здесь, а не в роутере: колонка в БД 64 символа, и длинная
    # строка иначе уронила бы вставку уже после проверки пароля.
    anon_id: Optional[str] = None

    @field_validator("anon_id")
    @classmethod
    def clip_anon_id(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        trimmed = value.strip()
        return trimmed[:64] or None
```

Убедиться, что в шапке файла есть `from typing import Optional`; если нет — добавить.

- [ ] **Step 4: Записывать в роутере**

В `back/routers/auth/register.py` заменить создание пользователя:

```python
    new_user = User(
        email=body.email,
        name=body.name,
        hashed_password=hashed_pwd,
        is_verified=False,
    )
```

на:

```python
    new_user = User(
        email=body.email,
        name=body.name,
        hashed_password=hashed_pwd,
        is_verified=False,
        # Откуда пришёл — записываем только при СОЗДАНИИ аккаунта. У повторной
        # регистрации на неподтверждённый адрес первый визит уже записан, и
        # перетирать его вторым значило бы приписывать конверсию не тому
        # источнику.
        signup_anon_id=body.anon_id,
    )
```

- [ ] **Step 5: Прогнать тесты**

Run: `cd back && pytest tests/test_register_anon_id.py -v`
Expected: PASS

Run: `cd back && pytest tests/test_auth.py -v` (если файл существует; иначе пропустить)
Expected: PASS — регистрация не сломана

- [ ] **Step 6: Остановиться на проверке**

---

### Task 7: Маяк на лендинге и в форме регистрации

**Files:**
- Create: `front/src/lib/anonId.ts`
- Create: `front/src/api/landing.ts`
- Modify: `front/src/pages/Landing/Landing.tsx` (добавить `useEffect`)
- Modify: `front/src/api/auth/auth.types.ts` (`RegisterPayload`)
- Modify: `front/src/pages/Registerpage.tsx` (передать `anon_id`)

**Interfaces:**
- Consumes: `POST /landing/visit` из задачи 4; `RegisterRequest.anon_id` из задачи 6
- Produces: `getAnonId(): string`, `reportLandingVisit(): void`

- [ ] **Step 1: Написать хранилище идентификатора**

Создать `front/src/lib/anonId.ts`:

```ts
/**
 * Идентификатор браузера для склейки анонимного визита с регистрацией.
 *
 * localStorage, а не sessionStorage: человек часто приходит на лендинг в один
 * день, а регистрируется в другой, и в sessionStorage такой путь терялся бы
 * целиком. Это первичный аналитический идентификатор — он упомянут в политике
 * cookies.
 *
 * Хранилище может быть недоступно (приватный режим, заблокированные данные
 * сайта) и тогда сам доступ к нему бросает исключение. В этом случае живём с
 * разовым идентификатором в памяти: аналитика — не повод уронить страницу.
 */
const KEY = 'velora_anon'

let memoryFallback: string | null = null

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

export function getAnonId(): string {
  try {
    const existing = localStorage.getItem(KEY)
    if (existing) return existing
    const fresh = createId()
    localStorage.setItem(KEY, fresh)
    return fresh
  } catch {
    if (!memoryFallback) memoryFallback = createId()
    return memoryFallback
  }
}
```

- [ ] **Step 2: Написать отправку маяка**

Создать `front/src/api/landing.ts`:

```ts
import { getAnonId } from '../lib/anonId'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

/**
 * Сообщает бэкенду о заходе на лендинг. Ошибки глотаются молча и намеренно:
 * счётчик посещений не имеет права ломать страницу, ради которой его позвали.
 *
 * Страна и устройство не отправляются — их определяет сервер по заголовкам.
 */
export function reportLandingVisit(): void {
  try {
    const params = new URLSearchParams(window.location.search)
    void fetch(`${BASE_URL}/landing/visit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        anon_id: getAnonId(),
        path: window.location.pathname,
        referrer: document.referrer || null,
        utm_source: params.get('utm_source'),
        utm_medium: params.get('utm_medium'),
        utm_campaign: params.get('utm_campaign'),
        lang: navigator.language?.slice(0, 5) ?? null,
      }),
    }).catch(() => {})
  } catch {
    /* аналитика молчит, страница живёт */
  }
}
```

- [ ] **Step 3: Позвать маяк с лендинга**

В `front/src/pages/Landing/Landing.tsx` дополнить импорты:

```tsx
import { useEffect } from "react";
import { reportLandingVisit } from "../../api/landing";
```

и первой строкой внутри `export default function Landing()`:

```tsx
  // Один раз на монтирование. Повторы внутри получаса схлопывает сервер, так
  // что перезагрузка страницы не превращается в новый визит.
  useEffect(() => { reportLandingVisit(); }, []);
```

- [ ] **Step 4: Передать идентификатор в регистрацию**

В `front/src/api/auth/auth.types.ts` дополнить `RegisterPayload`:

```ts
  /** Браузер, с которого пришли: склейка визита лендинга с аккаунтом. */
  anon_id?: string
```

В `front/src/pages/Registerpage.tsx` найти вызов `authApi.register({...})` и добавить в объект полезной нагрузки:

```tsx
      anon_id: getAnonId(),
```

с импортом в шапке файла:

```tsx
import { getAnonId } from '../lib/anonId'
```

- [ ] **Step 5: Проверить сборку и линт**

Run: `cd front && npm run build && npm run lint`
Expected: сборка проходит; в `lint` допускаются ТОЛЬКО те ошибки, что были до правки (старый код). Сравнить с `git stash` прогоном, если сомнения.

- [ ] **Step 6: Остановиться на проверке**

---

### Task 8: Обзор и трафик

**Files:**
- Create: `back/routers/admin/overview.py`
- Create: `back/services/platform_stats.py`
- Modify: `back/routers/admin/router.py`
- Test: `back/tests/test_admin_overview.py`

**Interfaces:**
- Consumes: `LandingVisit`, `User.created_at`, `User.signup_anon_id`, `Studio.created_at`, `StudioBillingPlan`, `PlatformRevenueLedger`, `services.admin_auth.require_admin`
- Produces: `GET /adm/api/overview?days=`, `GET /adm/api/traffic?days=`; хелперы `services.platform_stats.{paying_studio_ids, money_by_currency, period_bounds}`

- [ ] **Step 1: Написать падающий тест**

Создать `back/tests/test_admin_overview.py`:

```python
"""Арифметика обзора: воронка и деньги.

Главное здесь — что суммы в разных валютах НЕ складываются в одно число.
Это ровно та ошибка, которую в проекте уже ловили на счетах.

Запуск из back/:  pytest tests/test_admin_overview.py -v
"""
import warnings

warnings.filterwarnings("ignore")

import uuid
from datetime import datetime, timedelta

import pytest
from sqlalchemy import delete

from database import async_session_maker
from models import LandingVisit, PlatformRevenueLedger, Studio, StudioBillingPlan, User
from services.platform_stats import money_by_currency, period_bounds


@pytest.fixture
async def seeded():
    tag = uuid.uuid4().hex[:8]
    anon = f"test-{tag}"
    async with async_session_maker() as db:
        studio = Studio(name=f"TEST-ADM-{tag}", created_at=datetime.utcnow())
        db.add(studio)
        await db.flush()
        db.add(
            StudioBillingPlan(
                studio_id=studio.id,
                plan_name="free_trial",
                status="trial",
                trial_started_at=datetime.utcnow() - timedelta(days=2),
                expires_at=datetime.utcnow() + timedelta(days=28),
            )
        )
        db.add(
            User(
                email=f"{tag}@velora.test",
                name="Тест",
                hashed_password="x",
                created_at=datetime.utcnow(),
                signup_anon_id=anon,
            )
        )
        db.add(LandingVisit(anon_id=anon, path="/", device="desktop", country="CZ"))
        db.add(
            PlatformRevenueLedger(
                studio_id=studio.id, source="subscription", amount=3900,
                currency="eur", external_id=f"test-{tag}-eur",
            )
        )
        db.add(
            PlatformRevenueLedger(
                studio_id=studio.id, source="offline_fee", amount=25000,
                currency="czk", external_id=f"test-{tag}-czk",
            )
        )
        await db.commit()
        sid = studio.id
    yield {"studio_id": sid, "anon": anon, "tag": tag}
    async with async_session_maker() as db:
        await db.execute(delete(PlatformRevenueLedger).where(PlatformRevenueLedger.studio_id == sid))
        await db.execute(delete(StudioBillingPlan).where(StudioBillingPlan.studio_id == sid))
        await db.execute(delete(LandingVisit).where(LandingVisit.anon_id == anon))
        await db.execute(delete(User).where(User.signup_anon_id == anon))
        await db.execute(delete(Studio).where(Studio.id == sid))
        await db.commit()


def test_period_bounds_covers_whole_days():
    start, end = period_bounds(7)
    assert (end - start).days == 7


@pytest.mark.asyncio
async def test_money_is_split_by_currency(seeded):
    async with async_session_maker() as db:
        rows = await money_by_currency(db, *period_bounds(30))
    by = {r["currency"]: r["amount"] for r in rows}
    # Именно две отдельные строки: 3900 центов и 25000 галержей — это НЕ 28900
    # чего бы то ни было.
    assert by["eur"] >= 3900
    assert by["czk"] >= 25000
    assert "eurczk" not in by


@pytest.mark.asyncio
async def test_overview_funnel_links_visit_to_registration(seeded):
    from routers.admin.overview import admin_overview

    async with async_session_maker() as db:
        data = await admin_overview(days=30, db=db, _claims={})
    assert data["funnel"]["visits"] >= 1
    assert data["funnel"]["registrations_from_landing"] >= 1
    assert data["trials_active"] >= 1
```

- [ ] **Step 2: Прогнать тест и убедиться, что он падает**

Run: `cd back && pytest tests/test_admin_overview.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'services.platform_stats'`

- [ ] **Step 3: Написать общие хелперы**

Создать `back/services/platform_stats.py`:

```python
"""Общие определения метрик платформы.

Файл существует ради одного: чтобы «платящая студия» на экране обзора и на
экране аккаунтов означала одно и то же. Как только определение продублировано
в двух запросах, два экрана начинают показывать разные числа, и доверие к
обоим пропадает.
"""
from datetime import datetime, timedelta

from sqlalchemy import distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models import PlatformRevenueLedger


def period_bounds(days: int) -> tuple[datetime, datetime]:
    """Границы периода. `days` зажат в 1..365: запрос с days=100000 иначе
    превращается в полный скан, а с days=0 — в пустой ответ без объяснения."""
    safe = max(1, min(int(days or 30), 365))
    end = datetime.utcnow()
    return end - timedelta(days=safe), end


def paying_studio_ids_stmt():
    """Студии, реально заплатившие платформе.

    Источник — журнал поступлений, а НЕ статус счёта: журнал по определению
    пишется только по факту прихода денег, а счёт со статусом paid бывает
    выставлен и оплачен разными путями.
    """
    return select(distinct(PlatformRevenueLedger.studio_id))


async def paying_studio_ids(db: AsyncSession) -> set[int]:
    return set((await db.execute(paying_studio_ids_stmt())).scalars().all())


async def money_by_currency(
    db: AsyncSession, start: datetime, end: datetime
) -> list[dict]:
    """Поступления за период, РАЗБИВКОЙ по валютам.

    Одним числом эти суммы не выражаются: в журнале лежат и евроценты, и
    галержи, и сложить их — значит напечатать величину, которой не существует.
    """
    rows = (
        await db.execute(
            select(
                PlatformRevenueLedger.currency,
                func.sum(PlatformRevenueLedger.amount),
                func.count(PlatformRevenueLedger.id),
            )
            .where(
                PlatformRevenueLedger.occurred_at >= start,
                PlatformRevenueLedger.occurred_at <= end,
            )
            .group_by(PlatformRevenueLedger.currency)
            .order_by(func.sum(PlatformRevenueLedger.amount).desc())
        )
    ).all()
    return [
        {"currency": currency, "amount": int(total or 0), "payments": int(count or 0)}
        for currency, total, count in rows
    ]
```

- [ ] **Step 4: Написать роутер обзора и трафика**

Создать `back/routers/admin/overview.py`:

```python
"""Обзор платформы и трафик лендинга."""
from datetime import datetime
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, Query
from sqlalchemy import distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import LandingVisit, Studio, StudioBillingPlan, User
from services.admin_auth import require_admin
from services.platform_stats import money_by_currency, paying_studio_ids, period_bounds

router = APIRouter()


@router.get("/overview")
async def admin_overview(
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    _claims: dict = Depends(require_admin),
):
    start, end = period_bounds(days)
    now = datetime.utcnow()

    visits = (
        await db.execute(
            select(func.count(LandingVisit.id)).where(LandingVisit.created_at >= start)
        )
    ).scalar_one()
    uniques = (
        await db.execute(
            select(func.count(distinct(LandingVisit.anon_id))).where(
                LandingVisit.created_at >= start
            )
        )
    ).scalar_one()
    registrations = (
        await db.execute(
            select(func.count(User.id)).where(User.created_at >= start)
        )
    ).scalar_one()
    # Из тех, кто пришёл с лендинга: у аккаунта есть идентификатор браузера,
    # и по нему в таблице визитов есть хотя бы один заход.
    registrations_from_landing = (
        await db.execute(
            select(func.count(User.id)).where(
                User.created_at >= start,
                User.signup_anon_id.isnot(None),
                User.signup_anon_id.in_(select(distinct(LandingVisit.anon_id))),
            )
        )
    ).scalar_one()
    studios_created = (
        await db.execute(
            select(func.count(Studio.id)).where(Studio.created_at >= start)
        )
    ).scalar_one()

    paying = await paying_studio_ids(db)

    trial_rows = (
        await db.execute(
            select(StudioBillingPlan.studio_id, StudioBillingPlan.expires_at).where(
                StudioBillingPlan.trial_started_at.isnot(None),
                StudioBillingPlan.expires_at.isnot(None),
                StudioBillingPlan.expires_at > now,
            )
        )
    ).all()
    # Пробный считается активным, только пока студия не заплатила: иначе одна и
    # та же студия попадала бы и в «на пробном», и в «платящие».
    active_trials = [(sid, exp) for sid, exp in trial_rows if sid not in paying]
    expiring_7d = [
        sid for sid, exp in active_trials if (exp - now).days <= 7
    ]

    trials_started = (
        await db.execute(
            select(func.count(StudioBillingPlan.id)).where(
                StudioBillingPlan.trial_started_at >= start
            )
        )
    ).scalar_one()

    return {
        "days": days,
        "visits": int(visits or 0),
        "unique_visitors": int(uniques or 0),
        "registrations": int(registrations or 0),
        "studios_created": int(studios_created or 0),
        "trials_active": len(active_trials),
        "trials_expiring_7d": len(expiring_7d),
        "paying_studios": len(paying),
        "revenue": await money_by_currency(db, start, end),
        # Воронка за период. Каждая ступень — независимый счётчик, а не доля
        # предыдущей: человек мог зайти в прошлом месяце, а зарегистрироваться
        # в этом, и вычитать одно из другого было бы неверно.
        "funnel": {
            "visits": int(uniques or 0),
            "registrations": int(registrations or 0),
            "registrations_from_landing": int(registrations_from_landing or 0),
            "trials_started": int(trials_started or 0),
            "paying_studios": len(paying),
        },
    }


def _source_of(referrer: str | None, utm_source: str | None) -> str:
    if utm_source:
        return utm_source
    if not referrer:
        return "direct"
    host = urlparse(referrer).netloc.lower()
    return host.removeprefix("www.") or "direct"


@router.get("/traffic")
async def admin_traffic(
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    _claims: dict = Depends(require_admin),
):
    start, _end = period_bounds(days)

    by_day = (
        await db.execute(
            select(
                func.date(LandingVisit.created_at).label("d"),
                func.count(LandingVisit.id),
                func.count(distinct(LandingVisit.anon_id)),
            )
            .where(LandingVisit.created_at >= start)
            .group_by("d")
            .order_by("d")
        )
    ).all()

    # Источник считается в Python, а не в SQL: правило «utm_source, иначе домен
    # referrer, иначе direct» на SQL разворачивается в нечитаемый CASE с
    # разбором строки, а строк тут столько, что выигрыш не окупает цену.
    raw = (
        await db.execute(
            select(LandingVisit.referrer, LandingVisit.utm_source).where(
                LandingVisit.created_at >= start
            )
        )
    ).all()
    sources: dict[str, int] = {}
    for referrer, utm_source in raw:
        key = _source_of(referrer, utm_source)
        sources[key] = sources.get(key, 0) + 1

    countries = (
        await db.execute(
            select(LandingVisit.country, func.count(LandingVisit.id))
            .where(LandingVisit.created_at >= start, LandingVisit.country.isnot(None))
            .group_by(LandingVisit.country)
            .order_by(func.count(LandingVisit.id).desc())
            .limit(12)
        )
    ).all()

    return {
        "by_day": [
            {"date": str(day), "visits": int(v or 0), "uniques": int(u or 0)}
            for day, v, u in by_day
        ],
        "sources": sorted(
            ({"key": k, "visits": v} for k, v in sources.items()),
            key=lambda row: row["visits"],
            reverse=True,
        )[:12],
        "countries": [
            {"code": code, "visits": int(count or 0)} for code, count in countries
        ],
    }
```

- [ ] **Step 5: Подключить в роутер раздела**

`back/routers/admin/router.py` привести к виду:

```python
"""Сборка маршрутов админки."""
from fastapi import APIRouter

from .auth import router as auth_router
from .overview import router as overview_router

router = APIRouter()
router.include_router(auth_router)
router.include_router(overview_router)
```

- [ ] **Step 6: Прогнать тесты**

Run: `cd back && pytest tests/test_admin_overview.py tests/test_admin_api.py -v`
Expected: PASS

- [ ] **Step 7: Остановиться на проверке**

---

### Task 9: Аккаунты, платежи, входы

**Files:**
- Create: `back/routers/admin/accounts.py`
- Create: `back/routers/admin/feed.py`
- Modify: `back/routers/admin/router.py`
- Test: `back/tests/test_admin_accounts.py`

**Interfaces:**
- Consumes: `services.platform_stats.{paying_studio_ids, period_bounds}`, `services.admin_auth.require_admin`
- Produces: `GET /adm/api/accounts`, `GET /adm/api/payments`, `GET /adm/api/logins`

- [ ] **Step 1: Написать падающий тест**

Создать `back/tests/test_admin_accounts.py`:

```python
"""Список студий и ленты: владелец находится, деньги не смешиваются.

Запуск из back/:  pytest tests/test_admin_accounts.py -v
"""
import warnings

warnings.filterwarnings("ignore")

import uuid
from datetime import datetime

import pytest
from sqlalchemy import delete

from database import async_session_maker
from models import PlatformRevenueLedger, Studio, StudioBillingPlan, StudioMember, User


@pytest.fixture
async def account():
    tag = uuid.uuid4().hex[:8]
    async with async_session_maker() as db:
        owner = User(
            email=f"owner-{tag}@velora.test", name="Владелец", hashed_password="x",
            created_at=datetime.utcnow(),
        )
        db.add(owner)
        studio = Studio(name=f"TEST-ACC-{tag}", created_at=datetime.utcnow())
        db.add(studio)
        await db.flush()
        db.add(StudioMember(user_id=owner.id, studio_id=studio.id, role="owner", status="active"))
        db.add(StudioBillingPlan(studio_id=studio.id, plan_name="pro", status="active"))
        db.add(
            PlatformRevenueLedger(
                studio_id=studio.id, source="subscription", amount=9900,
                currency="eur", external_id=f"test-acc-{tag}",
            )
        )
        await db.commit()
        sid, uid = studio.id, owner.id
    yield {"studio_id": sid, "user_id": uid, "tag": tag}
    async with async_session_maker() as db:
        await db.execute(delete(PlatformRevenueLedger).where(PlatformRevenueLedger.studio_id == sid))
        await db.execute(delete(StudioBillingPlan).where(StudioBillingPlan.studio_id == sid))
        await db.execute(delete(StudioMember).where(StudioMember.studio_id == sid))
        await db.execute(delete(Studio).where(Studio.id == sid))
        await db.execute(delete(User).where(User.id == uid))
        await db.commit()


@pytest.mark.asyncio
async def test_account_row_has_owner_and_money(account):
    from routers.admin.accounts import admin_accounts

    async with async_session_maker() as db:
        data = await admin_accounts(q=f"TEST-ACC-{account['tag']}", limit=10, offset=0,
                                    db=db, _claims={})
    assert data["total"] == 1
    row = data["items"][0]
    assert row["owner"]["email"].startswith("owner-")
    assert row["plan"]["name"] == "pro"
    assert row["paid"] == [{"currency": "eur", "amount": 9900}]
    assert row["is_paying"] is True


@pytest.mark.asyncio
async def test_search_by_owner_email(account):
    from routers.admin.accounts import admin_accounts

    async with async_session_maker() as db:
        data = await admin_accounts(q=f"owner-{account['tag']}", limit=10, offset=0,
                                    db=db, _claims={})
    assert data["total"] == 1
```

- [ ] **Step 2: Прогнать тест и убедиться, что он падает**

Run: `cd back && pytest tests/test_admin_accounts.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'routers.admin.accounts'`

- [ ] **Step 3: Написать список аккаунтов**

Создать `back/routers/admin/accounts.py`:

```python
"""Список студий: кто это, что у них с тарифом и сколько они заплатили."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import (
    PlatformRevenueLedger,
    Studio,
    StudioBillingPlan,
    StudioMember,
    User,
    UserSession,
)
from services.admin_auth import require_admin

router = APIRouter()


@router.get("/accounts")
async def admin_accounts(
    q: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    _claims: dict = Depends(require_admin),
):
    # Владелец — активный участник с ролью owner. Роль проверяется вместе со
    # статусом: приглашённый, но не принявший приглашение человек владельцем
    # ещё не является.
    owner_join = (
        select(StudioMember.studio_id, User.id.label("uid"), User.name, User.email)
        .join(User, User.id == StudioMember.user_id)
        .where(StudioMember.role == "owner", StudioMember.status == "active")
        .subquery()
    )

    base = (
        select(Studio, owner_join.c.uid, owner_join.c.name, owner_join.c.email)
        .outerjoin(owner_join, owner_join.c.studio_id == Studio.id)
    )
    if q:
        pattern = f"%{q.strip()}%"
        base = base.where(
            or_(
                Studio.name.ilike(pattern),
                owner_join.c.email.ilike(pattern),
                owner_join.c.name.ilike(pattern),
            )
        )

    total = (
        await db.execute(select(func.count()).select_from(base.subquery()))
    ).scalar_one()

    rows = (
        await db.execute(
            base.order_by(Studio.created_at.desc().nullslast(), Studio.id.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()

    studio_ids = [studio.id for studio, *_ in rows]
    owner_ids = [uid for _s, uid, *_ in rows if uid is not None]

    plans = {
        plan.studio_id: plan
        for plan in (
            await db.execute(
                select(StudioBillingPlan).where(StudioBillingPlan.studio_id.in_(studio_ids or [0]))
            )
        ).scalars()
    }

    # Деньги — разбивкой по валютам, одним запросом на всю страницу списка.
    paid: dict[int, list[dict]] = {}
    for sid, currency, amount in (
        await db.execute(
            select(
                PlatformRevenueLedger.studio_id,
                PlatformRevenueLedger.currency,
                func.sum(PlatformRevenueLedger.amount),
            )
            .where(PlatformRevenueLedger.studio_id.in_(studio_ids or [0]))
            .group_by(PlatformRevenueLedger.studio_id, PlatformRevenueLedger.currency)
        )
    ).all():
        paid.setdefault(sid, []).append({"currency": currency, "amount": int(amount or 0)})

    last_login: dict[int, object] = dict(
        (
            await db.execute(
                select(UserSession.user_id, func.max(UserSession.created_at))
                .where(UserSession.user_id.in_(owner_ids or [0]))
                .group_by(UserSession.user_id)
            )
        ).all()
    )

    items = []
    for studio, uid, owner_name, owner_email in rows:
        plan = plans.get(studio.id)
        items.append(
            {
                "studio_id": studio.id,
                "name": studio.name,
                # None означает «неизвестно»: у студий, заведённых до появления
                # колонки, даты нет, и подставлять сюда что-либо нельзя.
                "created_at": studio.created_at.isoformat() if studio.created_at else None,
                "owner": {"name": owner_name, "email": owner_email},
                "plan": {
                    "name": plan.plan_name if plan else None,
                    "status": plan.status if plan else None,
                    "cycle": plan.billing_cycle if plan else None,
                    "mode": plan.billing_mode if plan else None,
                },
                "trial_started_at": (
                    plan.trial_started_at.isoformat()
                    if plan and plan.trial_started_at else None
                ),
                "expires_at": (
                    plan.expires_at.isoformat() if plan and plan.expires_at else None
                ),
                "last_login_at": (
                    last_login[uid].isoformat()
                    if uid in last_login and last_login[uid] else None
                ),
                "paid": paid.get(studio.id, []),
                "is_paying": studio.id in paid,
            }
        )

    return {"total": int(total or 0), "items": items}
```

- [ ] **Step 4: Написать ленты платежей и входов**

Создать `back/routers/admin/feed.py`:

```python
"""Две ленты: откуда приходят деньги и кто входит в продукт."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import BillingInvoice, PlatformRevenueLedger, Studio, User, UserSession
from services.admin_auth import require_admin
from services.platform_stats import period_bounds

router = APIRouter()

# Статусы счёта, означающие «деньги ещё не пришли». Словарь целиком:
# paid, pending, failed, refunded.
UNPAID = ("pending", "failed")


@router.get("/payments")
async def admin_payments(
    days: int = Query(90, ge=1, le=365),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    _claims: dict = Depends(require_admin),
):
    start, _end = period_bounds(days)

    received = (
        await db.execute(
            select(PlatformRevenueLedger, Studio.name)
            .outerjoin(Studio, Studio.id == PlatformRevenueLedger.studio_id)
            .where(PlatformRevenueLedger.occurred_at >= start)
            .order_by(PlatformRevenueLedger.occurred_at.desc())
            .limit(limit)
        )
    ).all()

    outstanding = (
        await db.execute(
            select(BillingInvoice, Studio.name)
            .outerjoin(Studio, Studio.id == BillingInvoice.studio_id)
            .where(BillingInvoice.status.in_(UNPAID))
            .order_by(BillingInvoice.due_at.asc().nullslast())
            .limit(limit)
        )
    ).all()

    return {
        "received": [
            {
                "studio_id": row.studio_id,
                "studio": name,
                "source": row.source,
                "amount": row.amount,
                "currency": row.currency,
                "occurred_at": row.occurred_at.isoformat() if row.occurred_at else None,
            }
            for row, name in received
        ],
        "outstanding": [
            {
                "studio_id": inv.studio_id,
                "studio": name,
                "kind": inv.kind,
                "plan": inv.plan_name,
                "amount": inv.amount,
                "status": inv.status,
                "period": inv.period,
                "due_at": inv.due_at.isoformat() if inv.due_at else None,
            }
            for inv, name in outstanding
        ],
    }


@router.get("/logins")
async def admin_logins(
    days: int = Query(7, ge=1, le=365),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    _claims: dict = Depends(require_admin),
):
    start, _end = period_bounds(days)

    rows = (
        await db.execute(
            select(UserSession, User.name, User.email)
            .join(User, User.id == UserSession.user_id)
            .where(UserSession.created_at >= start)
            .order_by(UserSession.created_at.desc())
            .limit(limit)
        )
    ).all()

    return {
        "items": [
            {
                "user_id": session.user_id,
                "name": name,
                "email": email,
                "at": session.created_at.isoformat() if session.created_at else None,
                "device": session.device,
                "platform": session.platform,
                "browser": session.browser,
                "country": session.location_country,
                "city": session.location_city,
                "revoked": session.revoked_at is not None,
            }
            for session, name, email in rows
        ]
    }
```

- [ ] **Step 5: Подключить в роутер раздела**

`back/routers/admin/router.py`:

```python
"""Сборка маршрутов админки."""
from fastapi import APIRouter

from .accounts import router as accounts_router
from .auth import router as auth_router
from .feed import router as feed_router
from .overview import router as overview_router

router = APIRouter()
router.include_router(auth_router)
router.include_router(overview_router)
router.include_router(accounts_router)
router.include_router(feed_router)
```

- [ ] **Step 6: Прогнать тесты**

Run: `cd back && pytest tests/test_admin_accounts.py tests/test_admin_overview.py tests/test_admin_api.py tests/test_ai_coverage.py -v`
Expected: PASS

- [ ] **Step 7: Остановиться на проверке**

---

### Task 10: Каркас админ-фронта и экран входа

**Files:**
- Create: `admin/package.json`, `admin/vite.config.ts`, `admin/tsconfig.json`, `admin/tsconfig.app.json`, `admin/tsconfig.node.json`, `admin/eslint.config.js`, `admin/index.html`, `admin/.dockerignore`
- Create: `admin/src/main.tsx`, `admin/src/index.css`, `admin/src/App.tsx`
- Create: `admin/src/lib/api.ts`, `admin/src/lib/session.ts`
- Create: `admin/src/screens/Login.tsx`

**Interfaces:**
- Consumes: `POST /adm/api/login`, `GET /adm/api/me`
- Produces: `api.get(path)`, `api.login(login, password)`, `session.{read, save, clear}`

- [ ] **Step 1: Завести проект**

Создать `admin/package.json`:

```json
{
  "name": "admin",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "preview": "vite preview"
  },
  "dependencies": {
    "@fontsource/manrope": "^5.3.0",
    "@tailwindcss/vite": "^4.3.3",
    "react": "^19.2.6",
    "react-dom": "^19.2.6",
    "recharts": "^3.8.1",
    "tailwindcss": "^4.3.3"
  },
  "devDependencies": {
    "@eslint/js": "^10.0.1",
    "@types/node": "^24.12.3",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^6.0.1",
    "eslint": "^10.3.0",
    "eslint-plugin-react-hooks": "^7.1.1",
    "eslint-plugin-react-refresh": "^0.5.2",
    "globals": "^17.6.0",
    "typescript": "~6.0.2",
    "typescript-eslint": "^8.59.2",
    "vite": "^8.0.12"
  }
}
```

Создать `admin/vite.config.ts`:

```ts
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Ассеты обязаны уехать под /adm/: на этом же домене мини-приложение уже
  // смонтировало /assets, и без префикса админка перекрыла бы его собой.
  base: '/adm/',
  // 5173 занят фронтом кабинета, 5174 — мини-приложением. strictPort, чтобы
  // dev-сервер не уехал молча на чужой свободный порт.
  server: { port: 5175, strictPort: true },
})
```

`admin/tsconfig.json`, `admin/tsconfig.app.json`, `admin/tsconfig.node.json` и `admin/eslint.config.js` скопировать из `miniapp/` без изменений — набор правил у проектов одинаковый.

Создать `admin/.dockerignore` по образцу `miniapp/.dockerignore`, если тот существует; иначе с содержимым `node_modules` и `dist`.

Создать `admin/index.html`:

```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex, nofollow" />
    <title>Velora — панель платформы</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Написать хранение сессии и клиент API**

Создать `admin/src/lib/session.ts`:

```ts
/** Токен админки. localStorage: перезагрузка страницы не должна выкидывать
 *  на экран входа каждый раз. */
const KEY = 'velora_admin_token'

export const session = {
  read(): string | null {
    try { return localStorage.getItem(KEY) } catch { return null }
  },
  save(token: string) {
    try { localStorage.setItem(KEY, token) } catch { /* приватный режим */ }
  },
  clear() {
    try { localStorage.removeItem(KEY) } catch { /* приватный режим */ }
  },
}
```

Создать `admin/src/lib/api.ts`:

```ts
import { session } from './session'

// Пусто по умолчанию: в проде админка раздаётся с того же origin, что и API,
// и относительного пути достаточно. В dev-режиме задаётся VITE_API_URL.
const BASE = import.meta.env.VITE_API_URL ?? ''

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = session.read()
  const res = await fetch(`${BASE}/adm/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  })
  if (res.status === 401) {
    // Токен протух или недействителен — единственный правильный ответ это
    // забыть его и показать вход. Молча оставлять мёртвый токен нельзя.
    session.clear()
    throw new ApiError(401, 'Нужен вход')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new ApiError(res.status, body?.detail ?? `Ошибка ${res.status}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  login: (login: string, password: string) =>
    request<{ token: string; name: string }>('/login', {
      method: 'POST',
      body: JSON.stringify({ login, password }),
    }),
}
```

- [ ] **Step 3: Написать экран входа**

Создать `admin/src/screens/Login.tsx`:

```tsx
import { useState } from 'react'
import { api } from '../lib/api'
import { session } from '../lib/session'

export function Login({ onDone }: { onDone: (name: string) => void }) {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { token, name } = await api.login(login, password)
      session.save(token)
      onDone(name)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось войти')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#FDFCFB] p-6">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-[0_8px_24px_-4px_rgba(0,0,0,0.04)]">
        <h1 className="text-2xl font-bold text-[#1A1A1A]">Панель платформы</h1>
        <p className="mt-1 text-sm text-[#666]">Вход только для владельца продукта</p>

        <label className="mt-6 block text-sm text-[#666]">Логин</label>
        <input
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          autoComplete="username"
          className="mt-1 w-full rounded-lg border border-[#E6E2DE] px-3 py-2 outline-none focus:border-[#FCAE91]"
        />

        <label className="mt-4 block text-sm text-[#666]">Пароль</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          className="mt-1 w-full rounded-lg border border-[#E6E2DE] px-3 py-2 outline-none focus:border-[#FCAE91]"
        />

        {error && <p className="mt-4 text-sm text-[#D88C9A]">{error}</p>}

        <button
          type="submit"
          disabled={busy || !login || !password}
          className="mt-6 w-full rounded-lg bg-[#FCAE91] py-2.5 font-semibold text-[#1A1A1A] disabled:opacity-50"
        >
          {busy ? 'Проверяем…' : 'Войти'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 4: Написать точку входа и оболочку**

Создать `admin/src/index.css`:

```css
@import "tailwindcss";

:root { color-scheme: light; }
body { margin: 0; font-family: Manrope, system-ui, sans-serif; }
```

Создать `admin/src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/manrope/400.css'
import '@fontsource/manrope/500.css'
import '@fontsource/manrope/600.css'
import '@fontsource/manrope/700.css'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

Создать `admin/src/App.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { api } from './lib/api'
import { session } from './lib/session'
import { Login } from './screens/Login'

export default function App() {
  // Роутера нет намеренно — как в мини-приложении: экранов четыре, и состояние
  // описывает их дешевле, чем библиотека маршрутизации. Заодно бэкенду не нужен
  // catch-all, который перехватывал бы пути API.
  const [name, setName] = useState<string | null>(null)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (!session.read()) { setChecked(true); return }
    api.get<{ name: string }>('/me')
      .then((me) => setName(me.name))
      .catch(() => session.clear())
      .finally(() => setChecked(true))
  }, [])

  if (!checked) return null
  if (!name) return <Login onDone={setName} />

  return (
    <div className="min-h-dvh bg-[#FDFCFB] p-6">
      <h1 className="text-xl font-bold text-[#1A1A1A]">Привет, {name}</h1>
      <button
        onClick={() => { session.clear(); setName(null) }}
        className="mt-4 text-sm text-[#666] underline"
      >
        Выйти
      </button>
    </div>
  )
}
```

- [ ] **Step 5: Собрать и проверить**

Run: `cd admin && npm install && npm run build && npm run lint`
Expected: сборка и линт проходят, появляется `admin/dist`

- [ ] **Step 6: Остановиться на проверке**

---

### Task 11: Экраны обзора, аккаунтов и ленты

**Files:**
- Create: `admin/src/screens/Overview.tsx`
- Create: `admin/src/screens/Accounts.tsx`
- Create: `admin/src/screens/Feed.tsx`
- Create: `admin/src/components/Shell.tsx`
- Create: `admin/src/lib/format.ts`
- Modify: `admin/src/App.tsx`

**Interfaces:**
- Consumes: `GET /adm/api/{overview,traffic,accounts,payments,logins}`
- Produces: экраны `Overview`, `Accounts`, `Feed`; `formatMoney(amount, currency)`, `formatDate(iso)`

- [ ] **Step 1: Написать форматирование**

Создать `admin/src/lib/format.ts`:

```ts
/** Деньги приходят в МЛАДШИХ единицах валюты, как их хранит Stripe. */
export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount / 100)
}

/** null означает «неизвестно» и показывается словом, а не выдуманной датой. */
export function formatDate(iso: string | null): string {
  if (!iso) return 'неизвестно'
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return 'неизвестно'
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}
```

- [ ] **Step 2: Написать оболочку с вкладками**

Создать `admin/src/components/Shell.tsx`:

```tsx
export type Tab = 'overview' | 'accounts' | 'feed'

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Обзор' },
  { key: 'accounts', label: 'Аккаунты' },
  { key: 'feed', label: 'Лента' },
]

export function Shell({
  tab, onTab, name, onLogout, children,
}: {
  tab: Tab
  onTab: (t: Tab) => void
  name: string
  onLogout: () => void
  children: React.ReactNode
}) {
  return (
    <div className="min-h-dvh bg-[#FDFCFB]">
      <header className="flex flex-wrap items-center gap-4 border-b border-[#EFEAE6] px-6 py-4">
        <span className="font-bold text-[#1A1A1A]">Velora · панель платформы</span>
        <nav className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => onTab(t.key)}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                tab === t.key ? 'bg-[#FCAE91] font-semibold text-[#1A1A1A]' : 'text-[#666]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm text-[#666]">
          <span>{name}</span>
          <button onClick={onLogout} className="underline">Выйти</button>
        </div>
      </header>
      <main className="p-6">{children}</main>
    </div>
  )
}
```

- [ ] **Step 3: Написать экран обзора**

Создать `admin/src/screens/Overview.tsx`:

```tsx
import { useEffect, useState } from 'react'
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { api } from '../lib/api'
import { formatMoney } from '../lib/format'

type Overview = {
  visits: number
  unique_visitors: number
  registrations: number
  studios_created: number
  trials_active: number
  trials_expiring_7d: number
  paying_studios: number
  revenue: { currency: string; amount: number; payments: number }[]
  funnel: Record<string, number>
}

type Traffic = {
  by_day: { date: string; visits: number; uniques: number }[]
  sources: { key: string; visits: number }[]
  countries: { code: string; visits: number }[]
}

function Card({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-[0_8px_24px_-4px_rgba(0,0,0,0.04)]">
      <div className="text-sm text-[#666]">{label}</div>
      <div className="mt-2 text-3xl font-bold text-[#1A1A1A]">{value}</div>
    </div>
  )
}

export function Overview() {
  const [data, setData] = useState<Overview | null>(null)
  const [traffic, setTraffic] = useState<Traffic | null>(null)
  const [days, setDays] = useState(30)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setError(null)
    Promise.all([
      api.get<Overview>(`/overview?days=${days}`),
      api.get<Traffic>(`/traffic?days=${days}`),
    ])
      .then(([o, t]) => { setData(o); setTraffic(t) })
      .catch((e) => setError(e.message))
  }, [days])

  if (error) return <p className="text-[#D88C9A]">{error}</p>
  if (!data || !traffic) return <p className="text-[#666]">Загружаем…</p>

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {[7, 30, 90].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              days === d ? 'bg-[#1A1A1A] text-white' : 'bg-white text-[#666]'
            }`}
          >
            {d} дней
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card label="Визиты" value={data.visits} />
        <Card label="Уникальные посетители" value={data.unique_visitors} />
        <Card label="Регистрации" value={data.registrations} />
        <Card label="Новые студии" value={data.studios_created} />
        <Card label="На пробном" value={data.trials_active} />
        <Card label="Пробный кончается за 7 дней" value={data.trials_expiring_7d} />
        <Card label="Платящих студий" value={data.paying_studios} />
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-[0_8px_24px_-4px_rgba(0,0,0,0.04)]">
        <h2 className="font-semibold text-[#1A1A1A]">Деньги за период</h2>
        {data.revenue.length === 0 ? (
          <p className="mt-2 text-sm text-[#666]">Поступлений нет</p>
        ) : (
          // Каждая валюта отдельной строкой: складывать их в одно число нельзя.
          <ul className="mt-3 space-y-1">
            {data.revenue.map((r) => (
              <li key={r.currency} className="text-lg text-[#1A1A1A]">
                {formatMoney(r.amount, r.currency)}
                <span className="ml-2 text-sm text-[#666]">({r.payments} поступлений)</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-[0_8px_24px_-4px_rgba(0,0,0,0.04)]">
        <h2 className="font-semibold text-[#1A1A1A]">Воронка</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-5">
          {[
            ['Уникальных визитов', data.funnel.visits],
            ['Регистраций', data.funnel.registrations],
            ['Из них с лендинга', data.funnel.registrations_from_landing],
            ['Взяли пробный', data.funnel.trials_started],
            ['Платят', data.funnel.paying_studios],
          ].map(([label, value]) => (
            <div key={String(label)}>
              <div className="text-2xl font-bold text-[#1A1A1A]">{value}</div>
              <div className="text-xs text-[#666]">{label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-[0_8px_24px_-4px_rgba(0,0,0,0.04)]">
        <h2 className="font-semibold text-[#1A1A1A]">Визиты по дням</h2>
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={traffic.by_day}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EFEAE6" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#666' }} />
              <YAxis tick={{ fontSize: 11, fill: '#666' }} allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="visits" stroke="#FCAE91" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="uniques" stroke="#A3C9A8" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-6 shadow-[0_8px_24px_-4px_rgba(0,0,0,0.04)]">
          <h2 className="font-semibold text-[#1A1A1A]">Источники</h2>
          <ul className="mt-3 space-y-1 text-sm">
            {traffic.sources.map((s) => (
              <li key={s.key} className="flex justify-between text-[#666]">
                <span>{s.key}</span><span className="text-[#1A1A1A]">{s.visits}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-[0_8px_24px_-4px_rgba(0,0,0,0.04)]">
          <h2 className="font-semibold text-[#1A1A1A]">Страны</h2>
          <ul className="mt-3 space-y-1 text-sm">
            {traffic.countries.map((c) => (
              <li key={c.code} className="flex justify-between text-[#666]">
                <span>{c.code}</span><span className="text-[#1A1A1A]">{c.visits}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Написать экран аккаунтов**

Создать `admin/src/screens/Accounts.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { formatDate, formatDateTime, formatMoney } from '../lib/format'

type Account = {
  studio_id: number
  name: string
  created_at: string | null
  owner: { name: string | null; email: string | null }
  plan: { name: string | null; status: string | null; cycle: string | null; mode: string | null }
  trial_started_at: string | null
  expires_at: string | null
  last_login_at: string | null
  paid: { currency: string; amount: number }[]
  is_paying: boolean
}

export function Accounts() {
  const [q, setQ] = useState('')
  const [items, setItems] = useState<Account[]>([])
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Задержка, чтобы не слать запрос на каждую букву в поиске.
    const timer = setTimeout(() => {
      setError(null)
      api.get<{ total: number; items: Account[] }>(
        `/accounts?limit=100&q=${encodeURIComponent(q)}`,
      )
        .then((d) => { setItems(d.items); setTotal(d.total) })
        .catch((e) => setError(e.message))
    }, 300)
    return () => clearTimeout(timer)
  }, [q])

  return (
    <div className="space-y-4">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Поиск по студии или почте владельца"
        className="w-full max-w-md rounded-lg border border-[#E6E2DE] px-3 py-2 outline-none focus:border-[#FCAE91]"
      />
      <p className="text-sm text-[#666]">Найдено: {total}</p>
      {error && <p className="text-[#D88C9A]">{error}</p>}

      <div className="overflow-x-auto rounded-2xl bg-white shadow-[0_8px_24px_-4px_rgba(0,0,0,0.04)]">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-[#EFEAE6] text-left text-[#666]">
              <th className="p-4">Студия</th>
              <th className="p-4">Владелец</th>
              <th className="p-4">Создана</th>
              <th className="p-4">Тариф</th>
              <th className="p-4">Пробный до</th>
              <th className="p-4">Последний вход</th>
              <th className="p-4">Заплачено</th>
            </tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <tr key={a.studio_id} className="border-b border-[#F6F3F0]">
                <td className="p-4 font-medium text-[#1A1A1A]">{a.name}</td>
                <td className="p-4 text-[#666]">
                  {a.owner.name ?? '—'}<br />
                  <span className="text-xs">{a.owner.email ?? '—'}</span>
                </td>
                <td className="p-4 text-[#666]">{formatDate(a.created_at)}</td>
                <td className="p-4 text-[#666]">
                  {a.plan.name ?? '—'}<br />
                  <span className="text-xs">{a.plan.status ?? '—'}</span>
                </td>
                <td className="p-4 text-[#666]">{formatDate(a.expires_at)}</td>
                <td className="p-4 text-[#666]">{formatDateTime(a.last_login_at)}</td>
                <td className="p-4">
                  {a.paid.length === 0
                    ? <span className="text-[#666]">—</span>
                    : a.paid.map((p) => (
                        <div key={p.currency} className="text-[#1A1A1A]">
                          {formatMoney(p.amount, p.currency)}
                        </div>
                      ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Написать экран ленты**

Создать `admin/src/screens/Feed.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { formatDateTime, formatMoney } from '../lib/format'

type Payments = {
  received: {
    studio: string | null; source: string; amount: number
    currency: string; occurred_at: string | null
  }[]
  outstanding: {
    studio: string | null; kind: string; plan: string; amount: number
    status: string; period: string | null; due_at: string | null
  }[]
}

type Logins = {
  items: {
    user_id: number; name: string; email: string; at: string | null
    device: string; browser: string | null; country: string | null; city: string | null
  }[]
}

export function Feed() {
  const [payments, setPayments] = useState<Payments | null>(null)
  const [logins, setLogins] = useState<Logins | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([api.get<Payments>('/payments?days=90'), api.get<Logins>('/logins?days=7')])
      .then(([p, l]) => { setPayments(p); setLogins(l) })
      .catch((e) => setError(e.message))
  }, [])

  if (error) return <p className="text-[#D88C9A]">{error}</p>
  if (!payments || !logins) return <p className="text-[#666]">Загружаем…</p>

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-2xl bg-white p-6 shadow-[0_8px_24px_-4px_rgba(0,0,0,0.04)]">
        <h2 className="font-semibold text-[#1A1A1A]">Поступления (90 дней)</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {payments.received.map((p, i) => (
            <li key={i} className="flex justify-between gap-3 text-[#666]">
              <span>{p.studio ?? '—'} · {p.source}</span>
              <span className="whitespace-nowrap text-[#1A1A1A]">
                {formatMoney(p.amount, p.currency)} · {formatDateTime(p.occurred_at)}
              </span>
            </li>
          ))}
          {payments.received.length === 0 && <li className="text-[#666]">Пусто</li>}
        </ul>

        <h3 className="mt-6 font-semibold text-[#1A1A1A]">Неоплаченные счета</h3>
        <ul className="mt-3 space-y-2 text-sm">
          {payments.outstanding.map((o, i) => (
            <li key={i} className="flex justify-between gap-3 text-[#666]">
              <span>{o.studio ?? '—'} · {o.kind} · {o.status}</span>
              <span className="whitespace-nowrap text-[#D88C9A]">
                до {formatDateTime(o.due_at)}
              </span>
            </li>
          ))}
          {payments.outstanding.length === 0 && <li className="text-[#666]">Долгов нет</li>}
        </ul>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-[0_8px_24px_-4px_rgba(0,0,0,0.04)]">
        <h2 className="font-semibold text-[#1A1A1A]">Входы (7 дней)</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {logins.items.map((l, i) => (
            <li key={i} className="flex justify-between gap-3 text-[#666]">
              <span>{l.name} · <span className="text-xs">{l.email}</span></span>
              <span className="whitespace-nowrap">
                {[l.country, l.device, l.browser].filter(Boolean).join(' · ')} ·{' '}
                {formatDateTime(l.at)}
              </span>
            </li>
          ))}
          {logins.items.length === 0 && <li className="text-[#666]">Входов нет</li>}
        </ul>
      </section>
    </div>
  )
}
```

- [ ] **Step 6: Собрать оболочку в App**

Заменить содержимое `admin/src/App.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Shell, type Tab } from './components/Shell'
import { api } from './lib/api'
import { session } from './lib/session'
import { Accounts } from './screens/Accounts'
import { Feed } from './screens/Feed'
import { Login } from './screens/Login'
import { Overview } from './screens/Overview'

export default function App() {
  // Роутера нет намеренно — как в мини-приложении: экранов четыре, и состояние
  // описывает их дешевле, чем библиотека маршрутизации. Заодно бэкенду не нужен
  // catch-all, который перехватывал бы пути API.
  const [name, setName] = useState<string | null>(null)
  const [checked, setChecked] = useState(false)
  const [tab, setTab] = useState<Tab>('overview')

  useEffect(() => {
    if (!session.read()) { setChecked(true); return }
    api.get<{ name: string }>('/me')
      .then((me) => setName(me.name))
      .catch(() => session.clear())
      .finally(() => setChecked(true))
  }, [])

  if (!checked) return null
  if (!name) return <Login onDone={setName} />

  return (
    <Shell tab={tab} onTab={setTab} name={name} onLogout={() => { session.clear(); setName(null) }}>
      {tab === 'overview' && <Overview />}
      {tab === 'accounts' && <Accounts />}
      {tab === 'feed' && <Feed />}
    </Shell>
  )
}
```

- [ ] **Step 7: Собрать и проверить**

Run: `cd admin && npm run build && npm run lint`
Expected: PASS

- [ ] **Step 8: Остановиться на проверке**

---

### Task 12: Раздача, деплой и preflight

**Files:**
- Modify: `back/main.py` (монтирование `admin/dist`)
- Modify: `docker-compose.yml` (том `./admin/dist:/admin/dist:ro`)
- Modify: `front/Caddyfile` (блок `{$ADMIN_ADDRESS::8081}`)
- Modify: `.env.example` (`ADMIN_ADDRESS`)
- Modify: `back/.env.example` (переменные админки), если файл существует
- Modify: `back/scripts/preflight.py` (проверка секрета)
- Modify: `DEPLOY.md` (раздел про админку)

**Interfaces:**
- Consumes: `services.admin_auth.{is_configured, secret_conflicts}` из задачи 1; `admin/dist` из задач 10–11

- [ ] **Step 1: Смонтировать сборку в FastAPI**

В `back/main.py`, сразу ПОСЛЕ блока мини-приложения (после маршрута `miniapp_index`), добавить:

```python
# --- Платформенная админка ------------------------------------------------------
# Тот же механизм, что у мини-приложения: сборка делается на хосте, dist
# монтируется томом, раздаётся отсюда. Отдельного хостинга и второго процесса
# ради трёх статических файлов не нужно.
#
# Ассеты лежат под /adm/assets (vite base='/adm/'), а не под /assets: последний
# уже занят мини-приложением, и без префикса они перекрыли бы друг друга.
#
# Роутера внутри админки нет — экраны переключаются состоянием, поэтому
# catch-all не нужен и пути /adm/api остаются за API.
_ADMIN_DIST = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "admin", "dist"
)
_ADMIN_INDEX = os.path.join(_ADMIN_DIST, "index.html")

if os.path.isfile(_ADMIN_INDEX):
    app.mount(
        "/adm/assets",
        StaticFiles(directory=os.path.join(_ADMIN_DIST, "assets")),
        name="admin-assets",
    )

    @app.get("/adm", include_in_schema=False)
    async def admin_index():
        return FileResponse(_ADMIN_INDEX)
```

- [ ] **Step 2: Смонтировать том в compose**

В `docker-compose.yml`, в сервисе `api`, после строки с `./miniapp/dist:/miniapp/dist:ro`, добавить:

```yaml
      # Собранная админка платформы — та же история, что с мини-аппом: в образ
      # она не попадает (build-контекст — ./back), монтируем с хоста. Папки нет —
      # /adm отдаёт 404, API живёт.
      - ./admin/dist:/admin/dist:ro
```

- [ ] **Step 3: Добавить блок Caddy**

В конец `front/Caddyfile` добавить:

```
# Третий домен (admin.example.com) — та же админка, что на /adm основного
# бэкенда. Переменной нет (локально) -> :8081, порт наружу не проброшен.
#
# redir, а не rewrite: ассеты админки абсолютные (/adm/assets/...), и правило
# вида `rewrite * /adm{uri}` превратило бы их в /adm/adm/assets/... Один редирект
# с корня решает это без переписывания путей.
{$ADMIN_ADDRESS::8081} {
	encode gzip zstd
	redir / /adm
	reverse_proxy api:8000
}
```

В `docker-compose.yml`, в сервисе `web`, в `environment`, добавить:

```yaml
      ADMIN_ADDRESS: ${ADMIN_ADDRESS:-:8081}
```

В `.env.example` добавить:

```
# Домен платформенной админки (admin.example.com). Пусто — отдельный домен не
# поднимается, админка доступна по адресу <домен API>/adm.
ADMIN_ADDRESS=
```

- [ ] **Step 4: Задокументировать переменные приложения**

Если существует `back/.env.example`, дописать в него:

```
# --- Платформенная админка (отдельный контур владельца продукта) ---
# Не заданы — админка ВЫКЛЮЧЕНА целиком: /adm не поднимается, /adm/api отдаёт 503.
ADMIN_LOGIN=
ADMIN_NAME=
# Хэш получить: cd back && python -m scripts.admin_password
ADMIN_PASSWORD_HASH=
# ОБЯЗАН отличаться от SECRET_KEY: с общим ключом любой токен CRM был бы
# валидной подписью и здесь. Сгенерировать:
#   python -c "import secrets; print(secrets.token_hex(32))"
ADMIN_JWT_SECRET=
ADMIN_TOKEN_TTL_HOURS=12
```

- [ ] **Step 5: Добавить проверку в preflight**

В `back/scripts/preflight.py` добавить проверку в том же стиле, что соседние (найти, как оформлены существующие проверки, и повторить структуру):

```python
def check_admin_panel() -> list[str]:
    """Админка платформы: включена — значит настроена правильно."""
    from services import admin_auth

    problems: list[str] = []
    if not admin_auth.is_configured():
        # Это не блокер: админка — необязательный контур.
        return problems
    if admin_auth.secret_conflicts():
        problems.append(
            "ADMIN_JWT_SECRET совпадает с SECRET_KEY: любой токен CRM станет "
            "валидной подписью для админки. Сгенерируйте отдельный секрет."
        )
    return problems
```

и вызвать её там же, где вызываются остальные проверки, чтобы её вывод попадал в общий отчёт и влиял на код выхода.

- [ ] **Step 6: Задокументировать в DEPLOY.md**

В `DEPLOY.md`, после раздела про мини-приложение, добавить:

````markdown
---

## Панель платформы (админка владельца продукта)

Отдельный сайт со своим логином: трафик лендинга, регистрации, входы, пробные
периоды и деньги. Собирается на хосте, как мини-приложение:

```bash
cd admin && npm ci && npm run build
```

Контейнер `api` монтирует готовый `admin/dist` и раздаёт его по `/adm`. Нет
папки — нет админки (API при этом работает). Пересобирать образ после правок
не нужно, достаточно `npm run build`.

Аккаунт задаётся в `back/.env`. **Не заданы все три обязательные переменные —
админка выключена целиком**, а не открыта:

```
ADMIN_LOGIN=me@example.com
ADMIN_NAME=Имя
ADMIN_PASSWORD_HASH=<из python -m scripts.admin_password>
ADMIN_JWT_SECRET=<python -c "import secrets; print(secrets.token_hex(32))">
```

`ADMIN_JWT_SECRET` обязан отличаться от `SECRET_KEY`: с общим ключом любой
выданный кабинетом токен был бы валидной подписью и для админки. Расхождение
проверяет `python -m scripts.preflight`.

Адрес: `https://<домен API>/adm` — работает сразу, DNS менять не надо. Нужен
отдельный домен — завести A-запись `admin.<домен>` и вписать её в `ADMIN_ADDRESS`
корневого `.env`; Caddy сам выпустит сертификат.

**Смена пароля** — новый хэш в `back/.env` и обязательно
`docker compose up -d --force-recreate api`: `restart` не перечитывает `env_file`.
Формы смены пароля в интерфейсе нет намеренно.
````

- [ ] **Step 7: Проверить всё вместе**

Run: `cd admin && npm run build`
Expected: `admin/dist/index.html` существует

Run: `cd back && pytest tests/test_admin_auth.py tests/test_admin_api.py tests/test_landing_visit.py tests/test_admin_overview.py tests/test_admin_accounts.py tests/test_signup_backfill.py tests/test_register_anon_id.py tests/test_ai_coverage.py -v`
Expected: PASS

Run: `cd front && npm run build && npm run lint`
Expected: сборка проходит

Run: `cd back && python -m scripts.preflight`
Expected: новых блокеров нет

- [ ] **Step 8: Остановиться и показать результат пользователю**

Отдельно сказать: перед накатом на боевую базу сделать бэкап (`./backup.sh`), потому что миграция задачи 5 трогает `users` и `studios`.

---

## Самопроверка плана

**Покрытие спеки:**

| Раздел спеки | Задача |
|---|---|
| Размещение и раздача | 10, 12 |
| Вход, переменные окружения, выключенное состояние | 1, 2, 12 |
| Таблица `landing_visits` | 3 |
| Колонки `created_at` / `signup_anon_id` и порядок шагов миграции | 5 |
| Сбор визитов, дедупликация, обрезка, страна и устройство на сервере | 4 |
| Склейка с регистрацией (бэк) | 6 |
| Склейка с регистрацией (фронт), `localStorage`, политика cookies | 7 |
| API чтения и определения метрик | 8, 9 |
| Фронт админки, четыре экрана | 10, 11 |
| `UI_ONLY` для двух изменяющих маршрутов | 2, 4 |
| Проверки | внутри каждой задачи, сводно — 12 |
| Ограничение «валюты не складывать» | 8 (`money_by_currency`), 9, 11 |

**Известные места, требующие внимания исполнителя:**

1. `back/scripts/preflight.py` и `back/.env.example` в плане описаны по смыслу, а не построчно: их текущую структуру надо прочитать и вписаться в неё, а не переписывать.
2. `front/src/pages/Registerpage.tsx` — точное место вызова `authApi.register` надо найти в файле; в плане оно описано по имени функции.
3. Файлы `admin/tsconfig*.json` и `admin/eslint.config.js` копируются из `miniapp/` — их содержимое в плане не дублируется намеренно, копия надёжнее пересказа.
4. Время в дедупликации визитов сравнивает `datetime.utcnow()` с колонкой, заполненной `func.now()`. Это та же договорённость об UTC, на которой уже стоят `otp_expires_at` и `past_due_since`; в контейнере Postgres она выполняется. Отдельной правки не требует, но если БД когда-нибудь поедет на не-UTC зону, окно дедупликации поедет вместе с ней.
