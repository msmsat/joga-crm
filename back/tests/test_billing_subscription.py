"""Подписки Stripe: каталог цен, маппинг статусов и сквозная IBAN-ветка.

Сетевые тесты помечены @pytest.mark.stripe и требуют sk_test_… в окружении —
без ключа они пропускаются, чтобы обычный прогон не зависел от сети.

Async-тесты гоняются через asyncio.run() внутри обычных def test_*, а не через
@pytest.mark.asyncio: в проекте не установлен pytest-asyncio (requirements-dev.txt
несёт только pytest) — тот же паттерн, что и в остальных back/tests/*.

Запуск из back/:  python -m tests.test_billing_subscription
Сетевой тест:     cd .. && pytest back/tests/test_billing_subscription.py -v -k end_to_end
"""
import asyncio
import os
import types

import pytest
import stripe

from routers.billing.plans import PLANS, PERIOD_DISCOUNTS, amount_for
from routers.billing.webhook import map_subscription_status, _subscription_id
from services import stripe_billing, stripe_catalog


def test_every_plan_period_has_lookup_key():
    """У каждой пары тариф×период есть ключ Price — иначе оплата упадёт в рантайме."""
    keys = {
        stripe_catalog.lookup_key(plan_id, months)
        for plan_id in PLANS
        for months in PERIOD_DISCOUNTS
    }
    assert len(keys) == len(PLANS) * len(PERIOD_DISCOUNTS) == 12


def test_intervals_cover_all_periods():
    """Период без интервала Stripe уронил бы sync() по KeyError на боевом ключе."""
    assert set(stripe_catalog._INTERVALS) == set(PERIOD_DISCOUNTS)


def test_two_year_period_fits_stripe_limit():
    """24 месяца = year×2. Максимум интервала у Stripe — 3 года."""
    interval, count = stripe_catalog._INTERVALS[24]
    assert (interval, count) == ("year", 2)


def test_longer_period_is_cheaper_per_month():
    """Скидка за период обязана быть выгодной, иначе калькулятор врёт клиенту."""
    for plan_id in PLANS:
        monthly = PLANS[plan_id]["price"]
        assert amount_for(plan_id, 24) / 24 < monthly


def test_unknown_subscription_status_is_not_active():
    """Незнакомый статус не должен раздавать тариф бесплатно."""
    assert map_subscription_status("совершенно новый статус") == "expired"
    assert map_subscription_status("unpaid") == "expired"


def test_past_due_still_allowed():
    """Перевод по IBAN идёт 1-2 дня — всё это время подписка past_due.
    Отрубать студию за деньги в пути нельзя."""
    assert map_subscription_status("past_due") == "past_due"


def test_subscription_id_extracted_from_all_shapes():
    """Stripe отдаёт id подписки то строкой, то объектом, то в parent."""
    assert _subscription_id(types.SimpleNamespace(subscription="sub_1")) == "sub_1"
    assert _subscription_id(
        types.SimpleNamespace(subscription=types.SimpleNamespace(id="sub_2"))
    ) == "sub_2"
    assert _subscription_id(types.SimpleNamespace(subscription=None, parent=None)) is None


# ─── Task 4: _ensure_price не должен падать на чужом разовом Price ──────────────

async def _ensure_price_survives_one_time_price():
    """Разовый (non-recurring) Price, случайно заведённый под нашим lookup_key,
    не должен ронять sync() AttributeError'ом на .recurring.interval — такой Price
    считается чужим мусором, и код должен завести новый recurring поверх него.

    Сеть застублена целиком: реального разового Price в Stripe не создаём.
    """
    # unit_amount/currency сознательно совпадают с тем, что посчитает _ensure_price:
    # иначе `and`-цепочка в реальном коде отвалится на первом же сравнении и до
    # чтения .recurring дело не дойдёт — тест НЕ проверял бы регрессию.
    fake_existing = types.SimpleNamespace(
        id="price_onetime",
        unit_amount=amount_for("start", 1),
        currency=stripe_catalog.CURRENCY,
        recurring=None,
    )

    async def _fake_find_price(_key):
        return fake_existing

    created = {}

    def _fake_create(**kwargs):
        created.update(kwargs)
        return types.SimpleNamespace(id="price_new")

    saved_find, saved_create = stripe_catalog._find_price, stripe.Price.create
    stripe_catalog._find_price = _fake_find_price
    stripe.Price.create = _fake_create
    try:
        price_id = await stripe_catalog._ensure_price("velora_start", "start", 1)
    finally:
        stripe_catalog._find_price = saved_find
        stripe.Price.create = saved_create

    assert price_id == "price_new"
    assert created["lookup_key"] == "velora_start_1m"


def test_ensure_price_survives_one_time_price_under_lookup_key():
    asyncio.run(_ensure_price_survives_one_time_price())


# ─── Task 7: refund_target_for_invoice выбирает заполненный ключ ────────────────

async def _refund_target_prefers_payment_intent_then_charge():
    """Оплата картой приходит как payment_intent; погашение счёта деньгами с
    баланса (наш IBAN-путь) — как charge. Refund.create принимает оба — нужно
    вернуть именно тот, который Stripe реально заполнил. Сеть застублена."""

    def _invoice_with(payment_intent=None, charge=None):
        payment = types.SimpleNamespace(payment_intent=payment_intent, charge=charge)
        row = types.SimpleNamespace(payment=payment)
        return types.SimpleNamespace(payments=types.SimpleNamespace(data=[row]))

    saved_retrieve = stripe.Invoice.retrieve
    try:
        stripe.Invoice.retrieve = lambda *a, **kw: _invoice_with(payment_intent="pi_1")
        assert await stripe_billing.refund_target_for_invoice("in_1") == {"payment_intent": "pi_1"}

        stripe.Invoice.retrieve = lambda *a, **kw: _invoice_with(charge="ch_1")
        assert await stripe_billing.refund_target_for_invoice("in_1") == {"charge": "ch_1"}
    finally:
        stripe.Invoice.retrieve = saved_retrieve


def test_refund_target_prefers_payment_intent_then_charge():
    asyncio.run(_refund_target_prefers_payment_intent_then_charge())


# ─── Немедленный переход у подписки на триале ───────────────────────────────────

def _modify_params(status: str, **kwargs) -> dict:
    """Что уедет в Subscription.modify при смене Price. Сеть застублена."""
    class _Sub:
        """Подписка Stripe читается и как объект (`.status`), и по ключу
        (`["items"]`) — SimpleNamespace второе не умеет."""

        id = "sub_1"

        def __init__(self, status):
            self.status = status

        def __getitem__(self, _key):
            return types.SimpleNamespace(data=[types.SimpleNamespace(id="si_1")])

    sent = {}
    saved = stripe.Subscription.retrieve, stripe.Subscription.modify
    stripe.Subscription.retrieve = lambda sid, **kw: _Sub(status)
    stripe.Subscription.modify = lambda sid, **kw: (
        sent.update(kw), types.SimpleNamespace(id=sid)
    )[1]
    try:
        asyncio.run(stripe_billing.change_subscription_price("sub_1", "price_1", {}, **kwargs))
    finally:
        stripe.Subscription.retrieve, stripe.Subscription.modify = saved
    return sent


def test_immediate_switch_ends_the_trial_first():
    """Регрессия на живой 502 (10.08.2026): «Trial end cannot be after
    billing_cycle_anchor».

    Триал у нас не только пробный период — его же ставит миграция уже оплативших
    (checkout._trial_end), чтобы подписка не брала денег до конца оплаченного
    периода. Значит под условие попадала КАЖДАЯ студия, оформившая подписку до
    конца триала, и обе ветки оплаты (карта с apply="now" и весь IBAN) отвечали ей
    502 вместо смены тарифа.

    «Перейти сейчас» означает «начать платить сейчас», поэтому триал заканчиваем,
    а не обходим запрет.
    """
    sent = _modify_params("trialing", proration_behavior="none", billing_cycle_anchor="now")
    assert sent["billing_cycle_anchor"] == "now"
    assert sent["trial_end"] == "now", "триал не закрыт — Stripe отвергнет запрос"


def test_switch_without_a_trial_does_not_touch_trial_end():
    """У обычной подписки trial_end трогать нечего: лишний параметр в денежном
    запросе — лишний повод для Stripe придраться."""
    sent = _modify_params("active", proration_behavior="none", billing_cycle_anchor="now")
    assert "trial_end" not in sent


def test_scheduled_switch_never_ends_the_trial():
    """Смена без якоря цикла (смена тарифной модели, отложенный переход) не должна
    заканчивать триал: студия ничего не просила ускорять, а конец триала — это
    начало списаний."""
    sent = _modify_params("trialing", proration_behavior="none")
    assert "trial_end" not in sent
    assert "billing_cycle_anchor" not in sent


# ─── Получатель перевода — тот, кого назвал Stripe ──────────────────────────────

async def _funding_instructions_return_stripe_beneficiary():
    """Имя получателя берётся из ответа Stripe, а не подписывается «Velora».

    Счёт коллекторский, его держателем значится Stripe. Чужое имя в поле получателя —
    несовпадение при проверке получателя (Verification of Payee) в банке плательщика:
    предупреждение или отбитый перевод. Заодно проверяем, что среди адресов
    выбирается именно iban, а не первый попавшийся. Сеть застублена."""
    account = types.SimpleNamespace(
        iban="DE89370400440532013000", bic="DEUTDEFF",
        account_holder_name="Stripe Payments Europe, Limited",
    )
    instructions = types.SimpleNamespace(bank_transfer=types.SimpleNamespace(financial_addresses=[
        types.SimpleNamespace(type="sort_code", sort_code=object()),   # чужой формат идёт первым
        types.SimpleNamespace(type="iban", iban=account),
    ]))

    saved = stripe.Customer.create_funding_instructions
    stripe.Customer.create_funding_instructions = lambda *a, **kw: instructions
    try:
        assert await stripe_billing.funding_instructions("cus_1") == (
            "DE89370400440532013000", "DEUTDEFF", "Stripe Payments Europe, Limited",
        )
    finally:
        stripe.Customer.create_funding_instructions = saved


def test_funding_instructions_return_stripe_beneficiary():
    asyncio.run(_funding_instructions_return_stripe_beneficiary())


def test_ensure_finalized_touches_only_drafts():
    """Черновик финализируется, открытый счёт — не трогаем: повторная финализация
    вернула бы 400 и уронила бы всю оплату переводом. Сеть застублена."""
    calls = []
    saved = stripe.Invoice.finalize_invoice
    stripe.Invoice.finalize_invoice = lambda iid: (
        calls.append(iid), types.SimpleNamespace(id=iid, status="open")
    )[1]
    # StripeObject индексируется, а не только читается атрибутами — ensure_finalized
    # берёт id через obj["id"], поэтому фейк тоже должен поддерживать индексацию.
    class _Draft:
        status = "draft"

        def __getitem__(self, key):
            return {"id": "in_draft", "status": "draft"}[key]

    try:
        finalized = asyncio.run(stripe_billing.ensure_finalized(_Draft()))
        assert finalized.status == "open"
        assert calls == ["in_draft"]

        already_open = types.SimpleNamespace(status="open", id="in_open")
        assert asyncio.run(stripe_billing.ensure_finalized(already_open)) is already_open
        assert calls == ["in_draft"], "открытый счёт финализировали повторно"
    finally:
        stripe.Invoice.finalize_invoice = saved


# ─── Сквозной сетевой тест: перевод по IBAN закрывает счёт сам ──────────────────

requires_stripe = pytest.mark.skipif(
    not os.getenv("STRIPE_SECRET_KEY", "").startswith("sk_test_"),
    reason="нужен тестовый ключ Stripe (sk_test_…)",
)


async def _bank_transfer_closes_invoice_end_to_end():
    """Входящий перевод закрывает счёт без ручного вмешательства.

    Проверяем именно то, чего не умела фейковая ветка: Stripe сам сверяет деньги
    с открытым счётом и переводит его в paid.
    """
    # 1. Customer с автосверкой и реквизитами для налога.
    customer_id = await stripe_billing.ensure_customer(
        None,
        name="Velora e2e test",
        email="sadomat31@gmail.com",
        country="CZ",
        postal_code="11000",
        city="Praha",
        line1="Testovaci 1",
        vat_id=None,
        studio_id=999_999,
    )

    # 2. IBAN, который увидела бы студия. Настоящий, выданный Stripe.
    iban, bic, beneficiary = await stripe_billing.funding_instructions(customer_id)
    assert iban.startswith("DE"), iban
    assert bic
    # Получателя показываем того, кого назвал Stripe: чужое имя в этом поле ломает
    # проверку получателя (Verification of Payee) в банке плательщика.
    assert beneficiary

    # 3. Подписка с оплатой переводом.
    price_id = await stripe_catalog.price_id("start", 1)
    subscription = await stripe_billing.create_iban_subscription(
        customer_id=customer_id,
        price_id=price_id,
        metadata={"studio_id": "999999", "plan": "start", "period_months": "1"},
    )
    invoice = subscription.latest_invoice
    assert invoice is not None
    assert invoice.status in ("draft", "open")

    # Счёт должен быть финализирован, иначе платить нечего — и у черновика нет номера,
    # который студия ставит назначением платежа. Тем же вызовом, что и checkout.
    invoice = await stripe_billing.ensure_finalized(invoice)
    assert invoice.status == "open"
    assert invoice.number, "у финализированного счёта обязан быть номер"
    amount_due = invoice.amount_due

    # 4. Имитируем входящий банковский перевод ровно на сумму счёта.
    # `stripe.test_helpers.Customer.fund_cash_balance` (старый ресурсный API) в
    # stripe-python 15.4.0 удалён — тестовые хелперы переехали на StripeClient
    # (services API); ниже актуальный вызов того же эндпоинта
    # (POST /v1/test_helpers/customers/{customer}/fund_cash_balance).
    client = stripe.StripeClient(stripe.api_key)
    await asyncio.to_thread(
        client.v1.test_helpers.customers.fund_cash_balance,
        customer_id, params={"amount": amount_due, "currency": stripe_billing.CURRENCY},
    )

    # 5. Stripe сверяет асинхронно — ждём, пока счёт закроется.
    for _ in range(20):
        refreshed = await stripe_billing.fetch_invoice(invoice.id)
        if refreshed.status == "paid":
            break
        await asyncio.sleep(1)
    else:
        pytest.fail(f"счёт {invoice.id} не закрылся переводом за 20 с")

    assert refreshed.status == "paid"
    assert refreshed.amount_remaining == 0

    # Уборка: тестовые подписки не должны копиться в аккаунте.
    await stripe_billing.cancel_subscription(subscription.id)


@requires_stripe
def test_bank_transfer_closes_invoice_end_to_end():
    asyncio.run(_bank_transfer_closes_invoice_end_to_end())


# ------------------------- выключенный в дашборде банковский перевод

def test_disabled_bank_transfer_is_told_apart_from_a_generic_refusal():
    """Способ оплаты `customer_balance` включается галкой в дашборде Stripe, и пока
    он выключен, Subscription.create отвечает «payment method type is invalid».

    Под общим текстом «Stripe отклонил запрос, попробуйте ещё раз» это был тупик:
    повтор не меняет ничего, а починить может только владелец аккаунта. Отделяем,
    чтобы отдать 503 с внятной причиной."""
    from routers.billing.checkout import _is_bank_transfer_disabled

    disabled = stripe.InvalidRequestError(
        "The payment method type `customer_balance` is invalid. Please ensure the "
        "provided type is activated in your dashboard",
        param=None,
    )
    assert _is_bank_transfer_disabled(disabled) is True

    # Посторонние отказы Stripe обязаны остаться 502: выдать их за ненастроенный
    # перевод значит послать владельца крутить не ту галку.
    for other in (
        stripe.InvalidRequestError("No such subscription: 'sub_1'", param="id"),
        stripe.CardError("Your card was declined", param=None, code="card_declined"),
        RuntimeError("customer_balance"),  # текст совпал, тип — нет
    ):
        assert _is_bank_transfer_disabled(other) is False, type(other).__name__


def test_disabled_bank_transfer_answers_503_with_its_own_code():
    """Фронт показывает текст сервера — общий код увёл бы студию в «попробуйте ещё раз»."""
    import inspect

    from routers.billing.checkout import _BANK_TRANSFER_OFF, create_iban_checkout

    src = inspect.getsource(create_iban_checkout)
    assert "_is_bank_transfer_disabled(exc)" in src
    assert "status_code=503, detail=_BANK_TRANSFER_OFF" in src
    assert _BANK_TRANSFER_OFF["code"] == "billing.bank_transfer_disabled"


if __name__ == "__main__":
    test_every_plan_period_has_lookup_key()
    test_intervals_cover_all_periods()
    test_two_year_period_fits_stripe_limit()
    test_longer_period_is_cheaper_per_month()
    test_unknown_subscription_status_is_not_active()
    test_past_due_still_allowed()
    test_subscription_id_extracted_from_all_shapes()
    test_ensure_price_survives_one_time_price_under_lookup_key()
    test_refund_target_prefers_payment_intent_then_charge()
    test_funding_instructions_return_stripe_beneficiary()
    test_ensure_finalized_touches_only_drafts()
    if os.getenv("STRIPE_SECRET_KEY", "").startswith("sk_test_"):
        test_bank_transfer_closes_invoice_end_to_end()
    print("ALL PASS — подписки Stripe зелёные")
