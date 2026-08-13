"""Подписки Stripe: каталог цен, маппинг статусов, смена Price.

Оплата переводом убрана целиком — вместе с ней ушли тесты реквизитов IBAN и
сквозной сетевой прогон входящего перевода. Способ оплаты один: карта.

Async-тесты гоняются через asyncio.run() внутри обычных def test_*, а не через
@pytest.mark.asyncio: в проекте не установлен pytest-asyncio (requirements-dev.txt
несёт только pytest) — тот же паттерн, что и в остальных back/tests/*.

Запуск из back/:  python -m tests.test_billing_subscription
"""
import asyncio
import os
import types
from datetime import datetime, timedelta, timezone

import pytest
import stripe

from routers.billing.checkout import _MIN_TRIAL
from routers.billing.plans import PLANS, PERIOD_DISCOUNTS, amount_for
from routers.billing.webhook import map_subscription_status, _subscription_id
from services import stripe_billing, stripe_catalog

_MIN_TRIAL_SEC = int(_MIN_TRIAL.total_seconds())


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
    конца триала, и любая смена тарифа отвечала ей 502.

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


def test_trial_end_holds_still_inside_the_idempotency_window():
    """Ключ Checkout Session живёт 10-минутным окном, значит и ТЕЛО запроса обязано
    быть постоянным всё окно. Ветка «остаток короче 48 часов» считает trial_end от
    now и без округления меняется каждую секунду: второй клик по «Оплатить» уходит
    другим телом под тем же ключом, Stripe отвечает IdempotencyError, а владелец
    видит «платёжный сервис отклонил запрос» (живая жалоба 13.08.2026)."""
    from routers.billing import checkout

    grid = stripe_billing.IDEMPOTENCY_WINDOW
    # Момент подобран так, чтобы now + _MIN_TRIAL упал в САМОЕ НАЧАЛО ячейки сетки:
    # иначе «через 5 минут» случайно перевалило бы за границу и тест ловил бы удачу.
    cell_start = 2_900_000 * grid + 1
    # Наивный UTC — ровно то, что отдаёт datetime.utcnow() в самом _trial_end.
    first = datetime.fromtimestamp(cell_start - _MIN_TRIAL_SEC, timezone.utc).replace(tzinfo=None)

    class _Clock(datetime):
        now_value = first

        @classmethod
        def utcnow(cls):
            return cls.now_value

    saved = checkout.datetime
    checkout.datetime = _Clock
    try:
        # Остаток короче 48 часов — та самая ветка с округлением вверх.
        plan = types.SimpleNamespace(
            stripe_subscription_id=None, expires_at=first + timedelta(hours=1),
        )
        same_window = []
        for shift in (0, 300):
            _Clock.now_value = first + timedelta(seconds=shift)
            same_window.append(checkout._trial_end(plan))
        assert same_window[0] == same_window[1], "два клика в одном окне дали разный trial_end"
        assert same_window[0] % grid == 0, "trial_end не лёг на сетку окна"
        # Округление строго ВВЕРХ: 48 часов у Stripe — жёсткий минимум, и значение
        # ниже него вернуло бы отказ, ради которого в _MIN_TRIAL взят запас в час.
        for shift in (0, 300):
            floor = (first + timedelta(seconds=shift)).replace(tzinfo=timezone.utc).timestamp()
            assert same_window[0] >= floor + _MIN_TRIAL_SEC

        # Следующее окно — новый ключ, и значение обязано сдвинуться вместе с ним,
        # иначе триал застрял бы в прошлом.
        _Clock.now_value = first + timedelta(seconds=grid)
        assert checkout._trial_end(plan) > same_window[0]
    finally:
        checkout.datetime = saved


def test_portal_configuration_recognises_its_own():
    """metadata у stripe 15 — StripeObject, а не dict: `.get` на нём падает
    AttributeError. Портал из-за этого не открывался вовсе (502 на /billing/portal),
    а на боевом ключе такая «незамеченная» конфигурация плодилась бы заново."""
    tagged = stripe.billing_portal.Configuration.construct_from(
        {"id": "bpc_ours", "metadata": {"velora": stripe_billing._PORTAL_TAG}}, "sk_test",
    )
    foreign = stripe.billing_portal.Configuration.construct_from(
        {"id": "bpc_foreign", "metadata": {}}, "sk_test",
    )
    created = []
    saved_list = stripe.billing_portal.Configuration.list
    saved_create = stripe.billing_portal.Configuration.create
    stripe.billing_portal.Configuration.list = lambda **kw: types.SimpleNamespace(
        data=[foreign, tagged]
    )
    stripe.billing_portal.Configuration.create = lambda **kw: created.append(kw) or (
        types.SimpleNamespace(id="bpc_new")
    )
    stripe_billing._PORTAL_CONFIG_ID = None
    try:
        assert asyncio.run(stripe_billing._portal_configuration()) == "bpc_ours"
        assert created == [], "свою конфигурацию не узнали и завели дубль"
    finally:
        stripe.billing_portal.Configuration.list = saved_list
        stripe.billing_portal.Configuration.create = saved_create
        stripe_billing._PORTAL_CONFIG_ID = None


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
    test_ensure_finalized_touches_only_drafts()
    test_trial_end_holds_still_inside_the_idempotency_window()
    test_portal_configuration_recognises_its_own()
    print("ALL PASS — подписки Stripe зелёные")
