"""Последняя открытая студия (users.last_studio_id): вход мультистудийного
пользователя не должен упираться в /select-crm — токен минтится сразу на ту
студию, где человек работал в прошлый раз.

Порядок выбора в `_build_token_for_user`: явно переданная → прошлая →
единственная. Без БД: фейковые user/db, как в test_studio_onboarding.

Запуск из back/:  python -m tests.test_last_studio
"""
import asyncio

from jose import jwt

from dependencies import ALGORITHM, SECRET_KEY
from routers.auth._helpers import _build_token_for_user


def _run(coro):
    return asyncio.run(coro)


class _User:
    def __init__(self, last_studio_id=None):
        self.id = 1
        self.email = "owner@x.com"
        self.last_studio_id = last_studio_id


class _Member:
    def __init__(self, studio_id, role):
        self.studio_id = studio_id
        self.role = role


class _R:
    def __init__(self, v):
        self._v = v

    def scalars(self):
        return self

    def all(self):
        return self._v


class _DB:
    def __init__(self, memberships):
        self._memberships = memberships
        self.committed = False

    async def execute(self, _q):
        return _R(self._memberships)

    async def commit(self):
        self.committed = True


def _claims(user, db, studio_id=None):
    token = _run(_build_token_for_user(user, db, studio_id))
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])


def test_remembered_studio_wins_over_ambiguity():
    """Два членства и запомненная студия — токен со студией, а не пустой."""
    db = _DB([_Member(1, "owner"), _Member(2, "admin")])
    claims = _claims(_User(last_studio_id=2), db)
    assert claims["studio_id"] == 2 and claims["role"] == "admin", claims


def test_explicit_studio_beats_remembered_and_is_recorded():
    """Приглашение задаёт студию явно — она перебивает прошлую и запоминается."""
    user = _User(last_studio_id=2)
    db = _DB([_Member(1, "owner"), _Member(2, "admin")])
    claims = _claims(user, db, studio_id=1)
    assert claims["studio_id"] == 1 and claims["role"] == "owner", claims
    assert user.last_studio_id == 1 and db.committed


def test_stale_membership_falls_back_to_select_crm():
    """Из запомненной студии человека убрали — выбор снова спрашиваем."""
    db = _DB([_Member(1, "owner"), _Member(2, "admin")])
    claims = _claims(_User(last_studio_id=99), db)
    assert "studio_id" not in claims, claims


def test_single_membership_still_works_and_is_remembered():
    user = _User()
    db = _DB([_Member(7, "trainer")])
    claims = _claims(user, db)
    assert claims["studio_id"] == 7 and claims["role"] == "trainer", claims
    assert user.last_studio_id == 7


def test_run_last_studio():
    test_remembered_studio_wins_over_ambiguity()
    test_explicit_studio_beats_remembered_and_is_recorded()
    test_stale_membership_falls_back_to_select_crm()
    test_single_membership_still_works_and_is_remembered()


if __name__ == "__main__":
    test_run_last_studio()
    print("ok")
