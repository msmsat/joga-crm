"""Clickwrap-согласие: доказательство, а не просто галочка на фронте.

Проверяем то, что ломается молча: аккаунт, заведённый без принятых документов,
и строка согласия без версии/IP — оба случая обнаруживаются только в суде.

БД и SMTP не нужны: guard срабатывает до обращения к базе, а record_consent
проверяется на подставном сеансе, который только собирает объекты.

Запуск из back/:  python -m tests.test_consent
"""
import asyncio

from fastapi import HTTPException

from legal import TERMS_VERSION, consent_ip, record_consent
from models import User
from routers.auth.register import register
from schemas import InviteAcceptRequest, RegisterRequest


class _Request:
    """Заглушка HTTP-запроса: нужны только заголовки и адрес клиента."""

    def __init__(self, headers=None, host="127.0.0.1"):
        self.headers = headers or {}
        self.client = type("C", (), {"host": host})() if host else None


class _Session:
    """Сеанс БД, который ничего не пишет — только запоминает, что добавили."""

    def __init__(self):
        self.added = []

    def add(self, obj):
        self.added.append(obj)


def test_register_refuses_account_without_consent():
    # db=None осознанно: guard обязан сработать ДО первого запроса к базе,
    # иначе аккаунт успевает завестись раньше проверки.
    payload = RegisterRequest(
        email="consent-check@veloratest.ru", name="Consent", password="Velora7pq",
    )
    try:
        asyncio.run(register(payload, _Request(), db=None))
    except HTTPException as exc:
        assert exc.status_code == 400, exc.status_code
        # Код, а не только текст: по нему фронт отличает «нужна галочка» от
        # прочих 400 и показывает её вместо общей ошибки.
        assert exc.detail["code"] == "consent_required", exc.detail
    else:
        raise AssertionError("регистрация прошла без принятия документов")


def test_invite_refuses_new_account_without_consent():
    """Приглашённый БЕЗ аккаунта в Velora — тоже регистрация.

    Ключевое здесь — порядок: guard обязан сработать до того, как аккаунт
    получит is_verified, иначе человек оказывается зарегистрированным, а
    доказательства согласия нет.
    """
    from routers.auth import invite as invite_router

    user = User(id=7, email="invited@veloratest.ru", hashed_password="x",
                is_verified=False, phone="+420722000099")
    membership = type("M", (), {"studio_id": 1, "status": "pending"})()

    async def _fake_resolve(_token, _db):
        return user, None, membership

    original_resolve, original_verify = invite_router._resolve_invite, invite_router.verify_password
    invite_router._resolve_invite = _fake_resolve
    invite_router.verify_password = lambda *_: True
    try:
        payload = InviteAcceptRequest(token="stub", password="Velora7pq")
        asyncio.run(invite_router.accept_invite.__wrapped__(_Request(), payload, db=None))
    except HTTPException as exc:
        assert exc.detail["code"] == "consent_required", exc.detail
        assert user.is_verified is False, "аккаунт подтвердили раньше проверки согласия"
        assert membership.status == "pending", "членство активировали раньше проверки"
    else:
        raise AssertionError("приглашение принято без принятия документов")
    finally:
        invite_router._resolve_invite = original_resolve
        invite_router.verify_password = original_verify


def test_consent_ip_prefers_proxy_header():
    # За обратным прокси client.host — адрес прокси, в доказательстве бесполезен.
    assert consent_ip(_Request({"x-forwarded-for": "203.0.113.7, 10.0.0.1"})) == "203.0.113.7"
    assert consent_ip(_Request({}, host="198.51.100.4")) == "198.51.100.4"
    assert consent_ip(None) is None


def test_recorded_consent_carries_version_and_evidence():
    db = _Session()
    request = _Request({"x-forwarded-for": "203.0.113.7", "user-agent": "UA/1.0"})
    asyncio.run(record_consent(db, User(id=42), request, "register"))

    (row,) = db.added
    assert row.user_id == 42
    assert row.version == TERMS_VERSION, row.version
    assert row.source == "register"
    assert row.ip == "203.0.113.7"
    assert row.user_agent == "UA/1.0"


def test_long_user_agent_fits_the_column():
    # 400 — длина колонки; необрезанный UA ронял бы саму регистрацию.
    db = _Session()
    asyncio.run(record_consent(db, User(id=1), _Request({"user-agent": "x" * 900}), "google"))
    assert len(db.added[0].user_agent) == 400


if __name__ == "__main__":
    test_register_refuses_account_without_consent()
    test_invite_refuses_new_account_without_consent()
    test_consent_ip_prefers_proxy_header()
    test_recorded_consent_carries_version_and_evidence()
    test_long_user_agent_fits_the_column()
    print("OK")
