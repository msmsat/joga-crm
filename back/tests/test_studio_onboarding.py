"""Мультистудийность (EPIC 7, задача 3): общий `_create_studio_with_defaults`
не трогает `is_onboarded`/проверку телефона (это ответственность вызывающего —
иначе создание второй студии свалится на телефоне, уже занятом тем же
пользователем), `/studios` (POST) работает без блокировки is_onboarded,
`/studios` (GET) верно определяет is_current по studio_id из токена и
подставляет 0 там, где счётчика нет. Плюс задача 4: `get_studio_context`
отдаёт машиночитаемый code для мультистудийного токена без studio_id — на
него ловит глобальный интерцептор фронта (client.ts) и ведёт на /select-crm.

Запуск из back/:  python -m tests.test_studio_onboarding
"""
import asyncio

from fastapi import HTTPException

import routers.auth.onboarding as O
from dependencies import get_studio_context
from schemas import OnboardingRequest
from security import create_access_token


def _run(coro):
    return asyncio.run(coro)


class _User:
    def __init__(self, id=1, email="owner@x.com", is_onboarded=True):
        self.id = id
        self.email = email
        self.is_onboarded = is_onboarded
        self.phone = None


class _Studio:
    def __init__(self, id, name):
        self.id = id
        self.name = name
        self.logo_url = None


class _Member:
    def __init__(self, role):
        self.role = role


class _R:
    def __init__(self, v):
        self._v = v

    def scalar_one_or_none(self):
        return self._v

    def scalars(self):
        return self

    def all(self):
        return self._v


class _DB:
    def __init__(self, seq=()):
        self._seq = list(seq)
        self.added = []
        self.committed = False

    def add(self, x):
        self.added.append(x)

    async def flush(self):
        pass

    async def commit(self):
        self.committed = True

    async def execute(self, _q):
        return _R(self._seq.pop(0))


def _onboarding_data(**overrides) -> OnboardingRequest:
    base = dict(
        studioName="Yoga Studio", activityType="yoga", phone="+79990000001",
        timezone="Europe/Moscow", language="ru", currency="RUB",
    )
    base.update(overrides)
    return OnboardingRequest(**base)


# ─── _validate_onboarding_request ─────────────────────────────────────────

def test_validate_rejects_short_name():
    try:
        O._validate_onboarding_request(_onboarding_data(studioName="Й"))
        assert False, "должно было упасть"
    except HTTPException as e:
        assert e.status_code == 400


def test_validate_rejects_missing_region_settings():
    try:
        O._validate_onboarding_request(_onboarding_data(currency=""))
        assert False, "должно было упасть"
    except HTTPException as e:
        assert e.status_code == 400


def test_validate_accepts_well_formed_data():
    O._validate_onboarding_request(_onboarding_data())  # не должно бросить


# ─── _create_studio_with_defaults ─────────────────────────────────────────

def test_create_studio_with_defaults_does_not_touch_is_onboarded_or_commit():
    """Инвариант задачи 3: общий хелпер не решает, первая это студия или
    вторая — эти проверки остаются на вызывающем."""
    user = _User(is_onboarded=False)
    db = _DB()
    studio = _run(O._create_studio_with_defaults(user, _onboarding_data(), db))

    assert studio.name == "Yoga Studio"
    assert studio.phone == "+79990000001"
    assert user.is_onboarded is False   # хелпер не выставляет флаг
    assert db.committed is False        # и не коммитит — это делает вызывающий

    member = next(x for x in db.added if type(x).__name__ == "StudioMember")
    assert member.user_id == user.id and member.role == "owner"
    plan = next(x for x in db.added if type(x).__name__ == "StudioBillingPlan")
    assert plan.plan_name == "free_trial" and plan.status == "trial"


# ─── POST /auth/studios ────────────────────────────────────────────────────

def test_create_studio_endpoint_works_even_when_not_yet_onboarded():
    """Ключевое отличие от /onboarding: здесь блокировки is_onboarded нет
    вовсе — ни в одну, ни в другую сторону."""
    user = _User(is_onboarded=False)
    db = _DB()
    out = _run(O.create_studio(_onboarding_data(), user, db))
    assert out.access_token
    assert out.token_type == "bearer"
    assert db.committed is True


def test_create_studio_endpoint_works_when_already_onboarded():
    user = _User(is_onboarded=True)
    db = _DB()
    out = _run(O.create_studio(_onboarding_data(studioName="Второй филиал"), user, db))
    assert out.access_token


# ─── GET /auth/studios ──────────────────────────────────────────────────────

def test_list_studios_marks_current_and_defaults_missing_counts_to_zero():
    rows = [(_Member("owner"), _Studio(1, "Studio A")), (_Member("owner"), _Studio(2, "Studio B"))]
    members_counts = [(1, 3), (2, 5)]
    clients_counts = [(2, 10)]  # у студии 1 клиентов нет вовсе — не должно упасть на .get

    db = _DB([rows, members_counts, clients_counts])
    token = create_access_token({"sub": "owner@x.com", "studio_id": 2, "role": "owner"})

    out = _run(O.list_studios(token, _User(), db))

    assert [s.id for s in out] == [1, 2]
    assert out[0].is_current is False and out[0].members_count == 3 and out[0].clients_count == 0
    assert out[1].is_current is True and out[1].members_count == 5 and out[1].clients_count == 10


# ─── get_studio_context: код для фронт-интерцептора (EPIC 7, задача 4) ─────

def test_ambiguous_token_raises_400_with_matchable_code():
    """Токен без studio_id/role (мультистудийный пользователь) при >1 членстве
    обязан отдать {code: no_active_studio, ...} — голая строка не даёт client.ts
    отличить эту ошибку от любого другого 400 в приложении."""
    token = create_access_token({"sub": "owner@x.com"})  # без studio_id/role
    db = _DB([[_Member("owner"), _Member("admin")]])  # 2 членства — неоднозначно
    try:
        _run(get_studio_context(token, _User(), db))
        assert False, "должно было упасть"
    except HTTPException as e:
        assert e.status_code == 400
        assert e.detail["code"] == "no_active_studio"


def test_run_studio_onboarding():
    test_validate_rejects_short_name()
    test_validate_rejects_missing_region_settings()
    test_validate_accepts_well_formed_data()
    test_create_studio_with_defaults_does_not_touch_is_onboarded_or_commit()
    test_create_studio_endpoint_works_even_when_not_yet_onboarded()
    test_create_studio_endpoint_works_when_already_onboarded()
    test_list_studios_marks_current_and_defaults_missing_counts_to_zero()
    test_ambiguous_token_raises_400_with_matchable_code()


if __name__ == "__main__":
    test_run_studio_onboarding()
    print("ALL PASS")
