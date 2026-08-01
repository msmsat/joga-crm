"""GET/PUT /finances/gateways.

Stripe (Connect): статус берётся у Stripe по account_id, свои ключи студии не
хранятся вообще. Fondy: connected по secret_key, ключ наружу не течёт (FN-3.1).

Запуск из back/:  python -m tests.test_gateways
"""
import asyncio
from dataclasses import dataclass

import routers.finances.gateways as G


@dataclass
class _Ctx:
    studio_id: int = 7


class _Channel:
    def __init__(self, channel_type, is_active=False, public_key=None, secret_key=None, account_id=None):
        self.studio_id = 7
        self.channel_type = channel_type
        self.is_active = is_active
        self.public_key = public_key
        self.secret_key = secret_key
        self.account_id = account_id


class _R:
    def __init__(self, v):
        self._v = v

    def scalar_one_or_none(self):
        return self._v

    def scalar_one(self):
        return self._v

    def scalars(self):
        return self

    def all(self):
        return self._v


class _DB:
    """execute() отдаёт значения из seq по порядку вызовов; add/commit/refresh — no-op."""
    def __init__(self, seq):
        self._seq = list(seq)

    def add(self, _x):
        pass

    async def commit(self):
        pass

    async def refresh(self, _x):
        pass

    async def execute(self, _q):
        return _R(self._seq.pop(0))


class _FakeStripe:
    """Подменяет services.stripe_connect: тесты не ходят в сеть."""
    def __init__(self, charges=False, submitted=False, due=False, is_configured=True):
        self.status = (charges, submitted, due)
        self._configured = is_configured
        self.created_accounts = 0

    def configured(self):
        return self._configured

    async def account_status(self, _account_id):
        return self.status

    async def create_account(self, _email):
        self.created_accounts += 1
        return f"acct_new{self.created_accounts}"

    async def onboarding_url(self, account_id, _return_url, _refresh_url):
        return f"https://connect.stripe.com/setup/{account_id}"


def _with_stripe(fake, fn):
    saved = G.stripe_connect
    G.stripe_connect = fake
    try:
        return fn()
    finally:
        G.stripe_connect = saved


def test_list_gateways_always_two_virtual_when_absent():
    db = _DB([[]])  # ни stripe, ни fondy в БД
    result = _with_stripe(_FakeStripe(), lambda: asyncio.run(G.list_gateways(_Ctx(), db)))

    assert [r.gateway_type for r in result] == ["stripe", "fondy"]
    assert all(r.connected is False and r.is_active is False for r in result)
    assert result[0].account_id is None


def test_stripe_status_comes_from_stripe_not_from_db():
    """Строка в БД есть, но Stripe ещё проверяет данные — «Подключён» рисовать нельзя,
    иначе касса предложит оплату картой, которая упадёт у клиента."""
    channel = _Channel("stripe", is_active=True, account_id="acct_123")

    review = _with_stripe(
        _FakeStripe(charges=False, submitted=True),
        lambda: asyncio.run(G._stripe_read(channel)),
    )
    assert review.connected is False
    assert review.details_submitted is True
    assert review.account_id == "acct_123"

    active = _with_stripe(
        _FakeStripe(charges=True, submitted=True),
        lambda: asyncio.run(G._stripe_read(channel)),
    )
    assert active.connected is True and active.charges_enabled is True


def test_rejected_verification_is_not_reported_as_pending_review():
    """Верификация отклонена (requirements.past_due) — это НЕ «идёт проверка».
    Спутать значит сказать владельцу «подожди сутки» там, где ждать нечего."""
    channel = _Channel("stripe", is_active=True, account_id="acct_123")

    rejected = _with_stripe(
        _FakeStripe(charges=False, submitted=True, due=True),
        lambda: asyncio.run(G._stripe_read(channel)),
    )
    assert rejected.requirements_due is True
    assert rejected.details_submitted is True

    pending = _with_stripe(
        _FakeStripe(charges=False, submitted=True, due=False),
        lambda: asyncio.run(G._stripe_read(channel)),
    )
    assert pending.requirements_due is False


def test_stripe_unreachable_is_not_reported_as_connected():
    """Stripe недоступен → честное «не готов», а не оптимистичное «подключён»."""
    channel = _Channel("stripe", account_id="acct_123")

    class _Broken(_FakeStripe):
        async def account_status(self, _account_id):
            raise RuntimeError("stripe down")

    result = _with_stripe(_Broken(), lambda: asyncio.run(G._stripe_read(channel)))
    assert result.connected is False and result.charges_enabled is False
    assert result.account_id == "acct_123"  # аккаунт при этом не «теряется»


def test_update_stripe_ignores_keys():
    """Секретные ключи студии не сохраняются даже если их прислали: в Connect они
    не нужны, а хранение чужого sk_ — та самая ответственность, от которой ушли."""
    channel = _Channel("stripe", account_id="acct_123")
    db = _DB([channel])
    body = G.GatewayUpdate(public_key="pk_live_123", secret_key="sk_live_456", is_active=True)

    _with_stripe(_FakeStripe(charges=True, submitted=True), lambda: asyncio.run(
        G.update_gateway("stripe", body, _Ctx(), db)
    ))

    assert channel.secret_key is None
    assert channel.public_key is None
    assert channel.is_active is True  # тумблер — единственное, что здесь меняется


def test_connect_reuses_existing_account():
    """Повторный клик по «Подключить» не заводит второй аккаунт: иначе деньги
    придут на брошенный acct_, а не на тот, что настроила студия."""
    channel = _Channel("stripe", account_id="acct_existing")
    fake = _FakeStripe()
    result = _with_stripe(fake, lambda: asyncio.run(G.connect_stripe(_Ctx(), _DB([channel]))))

    assert fake.created_accounts == 0
    assert result.url.endswith("acct_existing")


def test_connect_creates_account_once_when_absent():
    studio = type("S", (), {"email": "studio@example.com"})()
    fake = _FakeStripe()
    # execute(): 1) поиск канала — нет, 2) студия для email
    result = _with_stripe(fake, lambda: asyncio.run(G.connect_stripe(_Ctx(), _DB([None, studio]))))

    assert fake.created_accounts == 1
    assert result.url.endswith("acct_new1")


def test_connect_without_platform_key_is_refused():
    fake = _FakeStripe(is_configured=False)
    try:
        _with_stripe(fake, lambda: asyncio.run(G.connect_stripe(_Ctx(), _DB([None]))))
    except Exception as exc:
        assert getattr(exc, "status_code", None) == 503
    else:
        raise AssertionError("ожидали отказ без ключа платформы")


def test_update_gateway_empty_secret_key_sets_connected_false():
    existing = _Channel("fondy", is_active=True, public_key="pk_old", secret_key="sk_old")
    db = _DB([existing])
    body = G.GatewayUpdate(is_active=False)  # secret_key не передан -> остаётся старым
    result = asyncio.run(G.update_gateway("fondy", body, _Ctx(), db))

    assert result.connected is True
    assert not hasattr(result, "secret_key")

    db2 = _DB([existing])
    body2 = G.GatewayUpdate(secret_key="")
    result2 = asyncio.run(G.update_gateway("fondy", body2, _Ctx(), db2))
    assert result2.connected is False


if __name__ == "__main__":
    test_list_gateways_always_two_virtual_when_absent()
    test_stripe_status_comes_from_stripe_not_from_db()
    test_rejected_verification_is_not_reported_as_pending_review()
    test_stripe_unreachable_is_not_reported_as_connected()
    test_update_stripe_ignores_keys()
    test_connect_reuses_existing_account()
    test_connect_creates_account_once_when_absent()
    test_connect_without_platform_key_is_refused()
    test_update_gateway_empty_secret_key_sets_connected_false()
    print("ALL PASS")
