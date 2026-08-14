"""Откуда Stripe узнаёт местоположение плательщика.

Цены тарифов заданы БЕЗ налога (`TAX_BEHAVIOR = "exclusive"`), а ставку и reverse
charge считает Stripe Tax по адресу в Customer. Адрес туда попадает из двух мест,
и эти тесты держат границу между ними:

* НАША форма реквизитов — она источник истины. Адрес и VAT ID лежат на АККАУНТЕ
  плательщика (models/user.py) и уезжают в Customer при оформлении. Профиль пустой
  (форму обошли старой вкладкой) — не шлём ничего, и реквизиты соберёт Checkout,
  как было раньше;
* счёт, который выставляем МЫ САМИ (комиссия с офлайн-продаж): хостед-страницы у
  него нет, и без местоположения Stripe Tax отвечает `customer_tax_location_invalid`.
  Там адрес студии передаётся только при СОЗДАНИИ клиента.

Сеть и БД не трогаем.

Запуск из back/:  python -m pytest tests/test_billing_tax_location.py
"""
import asyncio
import inspect
from types import SimpleNamespace

import pytest


# ------------------------------------- 1. реквизиты собирает страница Stripe

def test_checkout_page_collects_tax_id_and_writes_it_back():
    """Снять со страницы Checkout сбор VAT ID значит лишить бизнес reverse charge:
    другого места, где номер вообще можно ввести, в продукте нет."""
    from services.stripe_billing import create_subscription_checkout

    src = inspect.getsource(create_subscription_checkout)
    assert 'tax_id_collection={"enabled": True}' in src
    # Собранное обязано уехать обратно в Customer — иначе следующий счёт снова без
    # адреса, и Stripe Tax не посчитает ставку.
    assert '"address": "auto"' in src
    assert '"name": "auto"' in src


def _checkout_body() -> str:
    """Тело create_subscription_checkout БЕЗ докстринга.

    Докстринг у неё длинный и разбирает как раз те варианты, которые здесь
    запрещены, — грепать вместе с ним значит спорить с собственным комментарием.
    """
    from services.stripe_billing import create_subscription_checkout

    return inspect.getsource(create_subscription_checkout).split('"""')[-1]


def test_individuals_are_not_asked_for_a_street():
    """`billing_address_collection="required"` заставил бы физлицо вписать улицу и
    дом, хотя на чек ему нужны только страна и индекс. Полный адрес Stripe требует
    сам — у того, кто назвался бизнесом и ввёл номер НДС."""
    assert "billing_address_collection" not in _checkout_body(), (
        "адрес снова требуют у всех — у физлица улицы на чеке быть не должно"
    )


def test_vat_is_never_mandatory():
    """`required="if_supported"` обязал бы КАЖДОГО плательщика из страны с
    поддержкой tax id ввести номер, которого у физлица нет, — то есть закрыл бы
    оплату всем, кроме компаний."""
    assert "if_supported" not in _checkout_body()


# ------------- 2. в Stripe уезжают реквизиты АККАУНТА, а не профиль студии

class _R:
    def __init__(self, v):
        self._v = v

    def scalar_one(self):
        return self._v


class _DB:
    def __init__(self, studio):
        self._studio = studio

    async def execute(self, _q):
        return _R(self._studio)

    async def commit(self):
        pass


_STUDIO = SimpleNamespace(
    id=1, name="S", email="s@e.com", country="CZ", postal_code="11000",
    address="Olgy Havlove 2930/35", city="Praha", vat_id="CZ12345678",
    company_id="12345678",
)


def _user(**billing) -> SimpleNamespace:
    """Аккаунт плательщика. Без kwargs — реквизиты не заполнены."""
    fields = dict(
        billing_country=None, billing_line1=None, billing_line2=None,
        billing_postal_code=None, billing_city=None, billing_vat_id=None,
    )
    fields.update(billing)
    return SimpleNamespace(email="u@e.com", **fields)


def _run_ensure(monkeypatch, user) -> dict:
    from routers.billing import checkout as checkout_mod

    sent = {}

    async def fake_ensure(customer_id, **kwargs):
        sent.update(kwargs)
        return "cus_x"

    monkeypatch.setattr(checkout_mod.stripe_billing, "ensure_customer", fake_ensure)
    ctx = SimpleNamespace(studio_id=1, user=user)
    plan = SimpleNamespace(stripe_customer_id=None)
    asyncio.run(checkout_mod._ensure_customer(_DB(_STUDIO), ctx, plan))
    return sent


def test_an_empty_profile_sends_nothing_and_lets_checkout_ask(monkeypatch):
    """Профиль пустой — шлём только имя и почту. Подставить сюда адрес СТУДИИ было
    бы ошибкой: платёжный адрес владельца отличается от адреса зала, а прислать
    вместо него адрес зала значит посчитать налог не по тому месту."""
    assert _run_ensure(monkeypatch, _user()) == {
        "name": "S", "email": "s@e.com", "studio_id": 1,
    }


def test_a_filled_profile_is_what_stripe_gets(monkeypatch):
    """Реквизиты вводит наша форма — она и источник истины. Не отправить их значит
    заставить Checkout спросить страну и индекс ещё раз, то есть сделать форму
    бессмысленной."""
    sent = _run_ensure(monkeypatch, _user(
        billing_country="DE", billing_line1="Kantstr. 5", billing_line2="Apt 3",
        billing_postal_code="10623", billing_city="Berlin",
    ))
    assert sent == {
        "name": "S", "email": "s@e.com", "studio_id": 1,
        "country": "DE", "postal_code": "10623", "city": "Berlin",
        "line1": "Kantstr. 5", "line2": "Apt 3",
    }
    # Адрес студии в запрос не попал ни одним полем.
    assert "Praha" not in str(sent) and "CZ" not in str(sent)


def test_a_half_filled_profile_is_not_sent_at_all(monkeypatch):
    """Частичный адрес хуже отсутствующего: Stripe примет его как полный, впишет в
    фактуру город без улицы и посчитает налог по нему, а Checkout больше ничего не
    переспросит. Пока обязательное не заполнено, реквизиты собирает Stripe."""
    sent = _run_ensure(monkeypatch, _user(billing_country="DE", billing_city="Berlin"))
    assert sent == {"name": "S", "email": "s@e.com", "studio_id": 1}


def test_a_vat_number_goes_up_as_its_own_object(monkeypatch):
    """У `Customer.modify` поля налогового номера нет — он живёт отдельным объектом.
    Не отправить его значит выписать компании счёт с НДС там, где действует reverse
    charge, то есть взять с неё лишний 21 %."""
    from routers.billing import checkout as checkout_mod

    async def fake_ensure(customer_id, **kwargs):
        return "cus_x"

    seen = []

    async def fake_set_tax_id(customer_id, value):
        seen.append((customer_id, value))

    monkeypatch.setattr(checkout_mod.stripe_billing, "ensure_customer", fake_ensure)
    monkeypatch.setattr(checkout_mod.stripe_billing, "set_tax_id", fake_set_tax_id)

    user = _user(
        billing_country="DE", billing_line1="Kantstr. 5", billing_postal_code="10623",
        billing_city="Berlin", billing_vat_id="DE811907980",
    )
    ctx = SimpleNamespace(studio_id=1, user=user)
    asyncio.run(checkout_mod._ensure_customer(
        _DB(_STUDIO), ctx, SimpleNamespace(stripe_customer_id=None),
    ))
    assert seen == [("cus_x", "DE811907980")]


def test_a_rejected_vat_number_never_breaks_the_payment(monkeypatch):
    """Номер необязателен, а Stripe отбивает незнакомый формат 400-й. Уронить на
    этом оплату значит поменять счёт с НДС (чинится порталом) на несостоявшийся
    платёж (не чинится ничем)."""
    from routers.billing import checkout as checkout_mod

    async def fake_ensure(customer_id, **kwargs):
        return "cus_x"

    async def boom(customer_id, value):
        raise RuntimeError("invalid tax id")

    monkeypatch.setattr(checkout_mod.stripe_billing, "ensure_customer", fake_ensure)
    monkeypatch.setattr(checkout_mod.stripe_billing, "set_tax_id", boom)

    user = _user(
        billing_country="DE", billing_line1="Kantstr. 5", billing_postal_code="10623",
        billing_city="Berlin", billing_vat_id="XX000",
    )
    ctx = SimpleNamespace(studio_id=1, user=user)
    plan = SimpleNamespace(stripe_customer_id=None)
    asyncio.run(checkout_mod._ensure_customer(_DB(_STUDIO), ctx, plan))
    assert plan.stripe_customer_id == "cus_x"


def test_paying_no_longer_gates_on_a_filled_in_country():
    """Гейт «заполните страну студии» был про ветку перевода, которой больше нет.
    Оставить его значит не пустить к оплате того, кто заплатил бы за две секунды."""
    src = inspect.getsource(inspect.getmodule(
        __import__("routers.billing.checkout", fromlist=["checkout"])
    ))
    assert "tax_details_required" not in src
    assert "require_country" not in src


# ------------------- 3. счёт БЕЗ хостед-страницы местоположение всё-таки шлёт

def test_self_issued_invoices_still_seed_the_location_once():
    """Комиссия с офлайн-продаж выставляется нами, страницы Stripe у неё нет.
    Без страны в Customer'е Stripe Tax отвечает `customer_tax_location_invalid`, и
    счёт не выставится вовсе — то есть тариф «процент» стал бы бесплатным."""
    from services.offline_fee_billing import _ensure_studio_customer

    src = inspect.getsource(_ensure_studio_customer)
    assert "country=studio.country" in src
    # ...но только при СОЗДАНИИ: ветка отрабатывает лишь когда клиента ещё нет,
    # поэтому затереть введённое у Stripe она не может.
    assert "if plan.stripe_customer_id:" in src
    # VAT ID и регистрационный номер отсюда уехать не должны — их у нас нет.
    assert "vat_id" not in src and "company_id" not in src


# --------------------- 4. портал Stripe — где VAT вводят ПОСЛЕ первой покупки

def _reset_portal_cache():
    from services import stripe_billing

    stripe_billing._PORTAL_CONFIG_ID = None


def test_portal_lets_the_customer_enter_a_tax_id(monkeypatch):
    """Ради этого портал и заведён. У дефолтной конфигурации Stripe `tax_id` в
    allowed_updates ВЫКЛЮЧЕН, поэтому конфигурацию создаём свою: иначе компания,
    купившая тариф как физлицо, не смогла бы добавить номер уже никогда — поля VAT
    есть только у Checkout, а он открывается лишь на первой покупке."""
    from services import stripe_billing

    _reset_portal_cache()
    created = {}
    monkeypatch.setattr(
        stripe_billing.stripe.billing_portal.Configuration, "list",
        lambda **kw: SimpleNamespace(data=[]),
    )
    monkeypatch.setattr(
        stripe_billing.stripe.billing_portal.Configuration, "create",
        lambda **kw: (created.update(kw), SimpleNamespace(id="bpc_1"))[1],
    )
    monkeypatch.setattr(
        stripe_billing.stripe.billing_portal.Session, "create",
        lambda **kw: SimpleNamespace(url="https://billing.stripe.com/x", **kw),
    )

    url = asyncio.run(stripe_billing.create_portal_session("cus_1", "https://app/back"))
    assert url == "https://billing.stripe.com/x"
    updates = created["features"]["customer_update"]
    assert updates["enabled"] is True
    assert "tax_id" in updates["allowed_updates"], "ради VAT портал и заведён"
    # Адрес рядом обязателен: ставку Stripe Tax считает по нему, и номер НДС без
    # страны бесполезен.
    assert "address" in updates["allowed_updates"]
    # Отмену подписки порталу не отдаём — она живёт тумблером автопродления, и
    # второй путь с другими правилами развёл бы БД и Stripe.
    assert "subscription_cancel" not in created["features"]


def test_portal_configuration_is_not_duplicated(monkeypatch):
    """Configuration.create НЕ идемпотентен. Без поиска своей по метке каждый
    перезапуск процесса плодил бы в аккаунте новую конфигурацию портала."""
    from services import stripe_billing

    _reset_portal_cache()
    mine = SimpleNamespace(id="bpc_existing", metadata={"velora": stripe_billing._PORTAL_TAG})
    alien = SimpleNamespace(id="bpc_alien", metadata={})
    monkeypatch.setattr(
        stripe_billing.stripe.billing_portal.Configuration, "list",
        lambda **kw: SimpleNamespace(data=[alien, mine]),
    )
    monkeypatch.setattr(
        stripe_billing.stripe.billing_portal.Configuration, "create",
        lambda **kw: pytest.fail("заведена вторая конфигурация портала"),
    )

    sessions = []
    monkeypatch.setattr(
        stripe_billing.stripe.billing_portal.Session, "create",
        lambda **kw: (sessions.append(kw), SimpleNamespace(url="https://billing.stripe.com/x"))[1],
    )
    asyncio.run(stripe_billing.create_portal_session("cus_1", "https://app/back"))
    assert sessions[0]["configuration"] == "bpc_existing", "взята чужая конфигурация"

    # Второй вызов не должен ходить в Stripe за списком заново.
    monkeypatch.setattr(
        stripe_billing.stripe.billing_portal.Configuration, "list",
        lambda **kw: pytest.fail("список конфигураций перечитан, хотя id уже известен"),
    )
    asyncio.run(stripe_billing.create_portal_session("cus_2", "https://app/back"))
    assert sessions[1]["customer"] == "cus_2"
    _reset_portal_cache()


# --------------------------------------------- 5. цены остаются заданными без НДС

def test_prices_stay_net_and_tax_goes_on_top():
    """Переключить на `inclusive` значит начать отдавать 21% из тех же 39 €:
    цена стала бы 32.23 нетто. Ставку сверху считает Stripe Tax."""
    from services.stripe_billing import TAX_BEHAVIOR

    assert TAX_BEHAVIOR == "exclusive"


if __name__ == "__main__":
    import sys
    sys.exit(pytest.main([__file__, "-q"]))
