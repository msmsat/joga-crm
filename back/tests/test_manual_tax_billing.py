"""Ручной налог в реальных денежных путях: что именно уезжает в Stripe.

Проверяем ТЕЛА запросов, а не наличие слова в файлах. Слово `tax` в ручном
налоговом коде законно; незаконно — `automatic_tax: enabled=true` на документе и
любое обращение к платному Tax Calculations API.

Покрытые пути (по одному на каждый способ, которым платформа берёт деньги):

  1. первая покупка подписки через Checkout;
  2. автопродление — счёт, который Stripe выставляет САМ, без нашего запроса;
  3. ручное продление тарифа;
  4. смена тарифа и доплата;
  5. счета офлайн-комиссии и минимального платежа;
  6. фактура за уже удержанную онлайн-комиссию;
  7. повторы, восстановление после ошибок и вебхук;
  8. контур Connect — он не должен измениться вовсе.

Сеть закрыта conftest'ом; здесь подменяются конкретные вызовы Stripe.

Запуск из back/:  python -m pytest tests/test_manual_tax_billing.py
"""
import asyncio
from types import SimpleNamespace

import pytest
import stripe

import services.billing_tax as BT
import services.stripe_billing as SB
import services.stripe_connect as SC
import services.tax_policy as TP
import services.tax_rates as TR


RATE = "txr_manual_cz_21"


# --- фикстуры окружения --------------------------------------------------------

@pytest.fixture
def manual(monkeypatch):
    """Ручной режим с подтверждённой ТЕСТОВОЙ политикой и одной заведённой ставкой.

    Ставка подменяется прямо в кэше каталога: заводить Tax Rate — отдельная
    процедура (scripts/sync_tax_rates), и путь выставления счёта её не вызывает.
    """
    monkeypatch.setenv("BILLING_TAX_MODE", "manual")
    monkeypatch.setenv("BILLING_TAX_POLICY_CONFIRMED", TP.RULESET_VERSION)
    monkeypatch.setenv("BILLING_SELLER_COUNTRY", "CZ")
    monkeypatch.setenv("BILLING_SELLER_VAT_REGISTERED", "true")
    monkeypatch.setenv("BILLING_SELLER_VAT_ID", "CZ00000019")
    monkeypatch.setenv("BILLING_EU_B2C_SCHEME", TP.B2C_DOMESTIC_UNDER_THRESHOLD)
    TR.reset_cache()
    monkeypatch.setattr(
        TR, "_catalogue", lambda: _async({f"CZ:21:vat:exclusive": RATE}),
    )
    yield
    TR.reset_cache()


def _async(value):
    async def _inner():
        return value
    return _inner()


def _decision(country="CZ", state=TP.VAT_ABSENT):
    return TP.decide(
        TP.seller_profile(), TP.CustomerProfile(country=country, vat_state=state),
        TP.SUPPLY_SAAS_SUBSCRIPTION,
    )


def _apply(country="CZ", state=TP.VAT_ABSENT):
    return asyncio.run(TR.resolve(_decision(country, state)))


class _Subscription(dict):
    """Подписка Stripe так, как её читает код: и по ключу, и по атрибуту.

    `subscription["items"].data[0].id` — реальный способ добраться до позиции в
    stripe 15.x, поэтому заглушка обязана быть подписываемой, иначе тест проверял
    бы удобную выдумку вместо настоящего обращения.
    """

    def __init__(self, **kw):
        super().__init__(kw)
        self.__dict__.update(kw)


def _subscription(status="active"):
    return _Subscription(
        id="sub_1", status=status,
        items=SimpleNamespace(data=[SimpleNamespace(id="si_1")]),
    )


class _Recorder:
    """Ловушка вызовов Stripe: подменяет и запоминает тела запросов."""

    def __init__(self):
        self.calls = {}
        self._saved = {}

    def patch(self, obj, name, result):
        self._saved[(obj, name)] = getattr(obj, name)
        key = f"{obj.__name__ if hasattr(obj, '__name__') else obj}.{name}"

        def _fake(*args, **kwargs):
            self.calls.setdefault(name, []).append({"args": args, **kwargs})
            return result(*args, **kwargs) if callable(result) else result
        setattr(obj, name, _fake)

    def restore(self):
        for (obj, name), original in self._saved.items():
            setattr(obj, name, original)

    def last(self, name):
        return self.calls[name][-1]


@pytest.fixture
def rec(monkeypatch):
    r = _Recorder()
    # Страж ключей: в тестах ключ уже тестовый (conftest), но полагаться на это в
    # денежном тесте нельзя — он и проверяется отдельно ниже.
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_manual_tax")
    monkeypatch.setenv("STRIPE_PUBLISHABLE_KEY", "pk_test_manual_tax")
    yield r
    r.restore()


# --- 1. первая покупка подписки -------------------------------------------------

def test_checkout_session_turns_paid_calculation_off_and_puts_rates_on_subscription(manual, rec):
    """Страница оплаты: платный расчёт выключен ЯВНО, ставки — на подписке.

    Ставки именно на подписке, а не только на первом счёте: счета автопродлений
    Stripe собирает из её состояния, и без этого второй месяц ушёл бы без налога.
    """
    rec.patch(stripe.checkout.Session, "create", SimpleNamespace(id="cs_1", url="https://x"))
    asyncio.run(SB.create_subscription_checkout(
        "cus_1", "price_1", {}, "s", "c", tax=_apply(),
    ))
    body = rec.last("create")
    assert body["automatic_tax"] == {"enabled": False}
    assert body["subscription_data"]["default_tax_rates"] == [RATE]
    assert "tax_id_collection" not in body, "дыра мимо VIES не должна вернуться"


def test_reverse_charge_checkout_carries_no_rate(manual, rec):
    """Reverse charge — это отметка на документе, а не ставка 0 %."""
    rec.patch(stripe.checkout.Session, "create", SimpleNamespace(id="cs_1", url="https://x"))
    app = _apply("DE", TP.VAT_VERIFIED)
    assert app.customer_tax_exempt == TR.EXEMPT_REVERSE
    asyncio.run(SB.create_subscription_checkout("cus_1", "price_1", {}, "s", "c", tax=app))
    assert rec.last("create")["subscription_data"]["default_tax_rates"] == []


# --- 2. счета, которые выставляем МЫ --------------------------------------------

def _invoice_calls(rec, factory):
    rec.patch(stripe.Invoice, "create", lambda **kw: SimpleNamespace(id="in_1"))
    rec.patch(stripe.InvoiceItem, "create", lambda **kw: SimpleNamespace(id="ii_1"))
    rec.patch(stripe.Invoice, "finalize_invoice", lambda i, **kw: SimpleNamespace(id=i))
    rec.patch(stripe.Invoice, "send_invoice", lambda *a, **kw: None)
    rec.patch(stripe.Invoice, "pay", lambda i, **kw: SimpleNamespace(id=i))
    asyncio.run(factory())
    return rec.calls


@pytest.mark.parametrize("kind", ["fee", "settled"])
def test_our_invoices_carry_manual_rates_and_no_paid_calculation(manual, rec, kind):
    """Счёт комиссии и фактура за удержанную комиссию — оба на ручных ставках.

    Ставки ставятся и на документ, и на ПОЗИЦИЮ: позиция перекрывает документ, и
    забытая позиция означала бы счёт без налога при верно оформленном документе.
    """
    app = _apply()
    if kind == "fee":
        factory = lambda: SB.create_fee_invoice(
            "cus_1", 3900, "eur", "тариф", 14, {"kind": "subscription"}, tax=app,
        )
    else:
        factory = lambda: SB.create_settled_invoice(
            "cus_1", 4500, "eur", "комиссия", {"kind": "online_fee"}, tax=app,
        )
    calls = _invoice_calls(rec, factory)

    created = [c for c in calls["create"] if "customer" in c and "collection_method" in c][0]
    assert created["automatic_tax"] == {"enabled": False}
    assert created["default_tax_rates"] == [RATE]

    item = [c for c in calls["create"] if "invoice" in c][0]
    assert item["tax_rates"] == [RATE]
    assert item["tax_behavior"] == SB.TAX_BEHAVIOR, "смысл цены «без налога» обязан сохраниться"
    assert "tax_code" not in item, "категория Stripe Tax в ручном режиме только путает"


def test_stripe_auto_mode_keeps_the_previous_payload(rec, monkeypatch):
    """Режим по умолчанию не изменился: выкат кода сам по себе ничего не переключает."""
    monkeypatch.delenv("BILLING_TAX_MODE", raising=False)
    app = TR.automatic_application()
    calls = _invoice_calls(rec, lambda: SB.create_fee_invoice(
        "cus_1", 3900, "eur", "тариф", 14, {}, tax=app,
    ))
    created = [c for c in calls["create"] if "collection_method" in c][0]
    assert created["automatic_tax"] == {"enabled": True}
    assert "default_tax_rates" not in created
    item = [c for c in calls["create"] if "invoice" in c][0]
    assert item["tax_code"] == SB.TAX_CODE


def test_none_means_previous_behaviour_everywhere():
    """Незаполненный аргумент — прежнее поведение, а не «без налога».

    Это страховка от забытой врезки: путь, который не научили передавать решение,
    обязан вести себя как раньше, а не выставлять счета без налога.
    """
    assert SB.tax_params(None) == {"automatic_tax": {"enabled": True}}
    assert SB.item_tax_params(None)["tax_code"] == SB.TAX_CODE


# --- 3. смена тарифа и подписка --------------------------------------------------

def test_switching_plan_moves_tax_in_the_same_request(manual, rec):
    """Налог едет тем же запросом, что и цена.

    Отдельный вызов оставил бы окно, в котором подписка уже на новой цене, а счёт
    прорации Stripe выставляет немедленно — по прежним правилам.
    """
    rec.patch(stripe.Subscription, "retrieve", _subscription())
    rec.patch(stripe.Subscription, "modify", SimpleNamespace(id="sub_1", latest_invoice=None))
    asyncio.run(SB.change_subscription_price("sub_1", "price_2", {"plan": "pro"}, tax=_apply()))
    body = rec.last("modify")
    assert body["automatic_tax"] == {"enabled": False}
    assert body["default_tax_rates"] == [RATE]
    assert body["items"][0]["tax_rates"] == [RATE]


def test_clearing_rates_uses_empty_string_not_empty_list(manual, rec):
    """Снятие ставок у Stripe задаётся пустой СТРОКОЙ.

    Пустой список прежние ставки не убирает — подписка, переведённая на reverse
    charge, продолжила бы начислять 21 %.
    """
    rec.patch(stripe.Subscription, "retrieve", _subscription())
    rec.patch(stripe.Subscription, "modify", SimpleNamespace(id="sub_1"))
    asyncio.run(SB.set_subscription_tax("sub_1", _apply("DE", TP.VAT_VERIFIED)))
    body = rec.last("modify")
    assert body["default_tax_rates"] == ""
    assert body["items"][0]["tax_rates"] == ""
    assert body["proration_behavior"] == "none", "правка налога не должна порождать счёт"


# --- 4. состояние «решения нет» ---------------------------------------------------

def test_review_state_never_becomes_a_silent_zero(manual, monkeypatch):
    """`requires_review` не превращается в ставку 0 % — он не доходит до Stripe."""
    monkeypatch.delenv("BILLING_EU_B2C_SCHEME", raising=False)
    decision = TP.decide(
        TP.seller_profile(), TP.CustomerProfile(country="DE", vat_state=TP.VAT_ABSENT),
        TP.SUPPLY_SAAS_SUBSCRIPTION,
    )
    assert decision.needs_review
    with pytest.raises(TR.TaxReviewRequired):
        asyncio.run(TR.resolve(decision))


def test_missing_rate_on_the_account_is_an_error_not_a_zero(manual, monkeypatch):
    """Ставки нет на аккаунте → отказ. Выставить счёт без налога нельзя."""
    monkeypatch.setattr(TR, "_catalogue", lambda: _async({}))
    with pytest.raises(TR.TaxRateMissing):
        asyncio.run(TR.resolve(_decision()))


def test_request_path_never_creates_a_tax_rate(manual, rec):
    """Создание ставки — отдельная процедура, а не побочный эффект счёта."""
    rec.patch(stripe.TaxRate, "create", SimpleNamespace(id="txr_new"))
    asyncio.run(TR.resolve(_decision()))
    assert "create" not in rec.calls, "путь выставления счёта завёл Tax Rate"


def test_ensure_rate_is_dry_by_default(manual, rec, monkeypatch):
    """Даже прямой вызов синхронизации по умолчанию ничего не создаёт."""
    monkeypatch.setattr(TR, "_catalogue", lambda: _async({}))
    rec.patch(stripe.TaxRate, "create", SimpleNamespace(id="txr_new"))
    rate_id, created = asyncio.run(TR.ensure_rate(_decision()))
    assert (rate_id, created) == (None, False)
    assert "create" not in rec.calls


# --- 5. платный Tax API не зовём ни при каких обстоятельствах ----------------------

def test_no_paid_tax_api_call_on_any_money_path(manual, rec):
    """Ни один денежный путь не обращается к Tax Calculations/Transactions.

    Это отдельная статья расходов Stripe («Tax Api Calculation»), и она не лечится
    выключением automatic_tax — только отсутствием вызовов.
    """
    exploded = []
    rec.patch(stripe.tax.Calculation, "create", lambda **kw: exploded.append(kw))
    rec.patch(stripe.tax.Transaction, "create_from_calculation", lambda **kw: exploded.append(kw))
    rec.patch(stripe.checkout.Session, "create", SimpleNamespace(id="cs", url="u"))
    rec.patch(stripe.Invoice, "create", lambda **kw: SimpleNamespace(id="in_1"))
    rec.patch(stripe.InvoiceItem, "create", lambda **kw: SimpleNamespace(id="ii_1"))
    rec.patch(stripe.Invoice, "finalize_invoice", lambda i, **kw: SimpleNamespace(id=i))
    rec.patch(stripe.Invoice, "send_invoice", lambda *a, **kw: None)
    rec.patch(stripe.Invoice, "pay", lambda i, **kw: SimpleNamespace(id=i))

    app = _apply()
    asyncio.run(SB.create_subscription_checkout("cus_1", "price_1", {}, "s", "c", tax=app))
    asyncio.run(SB.create_fee_invoice("cus_1", 3900, "eur", "т", 14, {}, tax=app))
    asyncio.run(SB.create_settled_invoice("cus_1", 4500, "eur", "к", {}, tax=app))
    assert exploded == [], "кто-то позвал платный Tax API"


def test_no_automatic_tax_true_literal_outside_the_mode_switch():
    """Единственное место, где может стоять `enabled: True`, — переключатель режима.

    Врезка, сделанная мимо `tax_params`, выглядит рабочей и молча возвращает платный
    расчёт на одном пути из шести.
    """
    import inspect

    source = inspect.getsource(SB)
    switch = inspect.getsource(SB.tax_params) + inspect.getsource(SB._subscription_tax_params)
    outside = source.replace(switch, "")
    for line in outside.splitlines():
        stripped = line.strip()
        if stripped.startswith("#") or "assert" in stripped:
            continue
        assert 'automatic_tax={"enabled": True}' not in stripped, line


# --- 6. контур Connect не изменился ------------------------------------------------

def test_connect_payments_stay_free_of_platform_tax(rec):
    """Оплаты клиентов студиям — не наш налог и не наш документ.

    Налог платформы там появиться не может: продавец — студия. Любой налоговый
    параметр в этой сессии означал бы, что миграция залезла не в тот контур.
    """
    rec.patch(stripe.checkout.Session, "create", SimpleNamespace(id="cs_1", client_secret="cs_secret"))
    asyncio.run(SC.create_checkout_session(
        "acct_1", 50000, "czk", "Абонемент", {"studio_id": "1"},
        application_fee_minor=1500, receipt_email="c@example.com",
    ))
    body = rec.last("create")
    for forbidden in ("automatic_tax", "default_tax_rates", "tax_id_collection", "invoice_creation"):
        assert forbidden not in body, f"в контур Connect протёк {forbidden}"
    assert body["stripe_account"] == "acct_1"
    assert body["payment_intent_data"]["application_fee_amount"] == 1500


# --- 7. снимок операции --------------------------------------------------------------

def test_snapshot_records_the_reason_not_just_the_number(manual):
    """В строке счёта остаётся ОСНОВАНИЕ, а не только сумма.

    Ноль налога у reverse charge и у продажи вне ЕС выглядит одинаково; различает
    их только исход и основание, и именно они нужны бухгалтеру.
    """
    snap = BT.snapshot(_apply(), 3900, "eur")
    assert snap["tax_outcome"] == TP.TAXABLE
    assert snap["tax_amount"] == 819
    assert snap["tax_rate_percent"] == 21.0
    assert snap["tax_jurisdiction"] == "CZ"
    assert snap["tax_ruleset_version"] == TP.RULESET_VERSION
    assert snap["tax_basis"] == "domestic_standard_rate"

    reverse = BT.snapshot(_apply("DE", TP.VAT_VERIFIED), 3900, "eur")
    assert reverse["tax_amount"] == 0
    assert reverse["tax_outcome"] == TP.REVERSE_CHARGE
    assert reverse["tax_outcome"] != snap["tax_outcome"]


def test_snapshot_keeps_vat_number_out_of_free_text(manual):
    """Номер НДС в свободный текст не пишем — он уже есть в профиле и на фактуре."""
    line = BT._evidence_line(_apply("DE", TP.VAT_VERIFIED))
    assert "DE" in line  # юрисдикция — можно
    assert "vat=verified" in line
    assert "811907980" not in line


def test_preview_uses_the_same_decision_as_the_invoice(manual):
    """Модалка и счёт считаются одним решением — иначе спор о сумме с клиентом."""
    decision = _decision()
    tax, gross = TP.apply(3900, decision)
    snap = BT.snapshot(_apply(), 3900, "eur")
    assert snap["tax_amount"] == tax == 819
    assert gross == 4719
