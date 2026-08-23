"""Регрессии на три дыры предрелизного аудита биллинга (09.08.2026).

Каждая стоила либо денег, либо работоспособности тарифа целиком:

  1. Вебхук биллинга отвечал 200 на НЕОБРАБОТАННОЕ событие. Stripe ретраит только
     non-2xx — значит событие терялось навсегда. По `invoice.paid` это «деньги
     взяли, подписку не активировали»: студия с оплаченным тарифом упирается в 402.

  2. `check_plan_limit` блокировал студию на тарифе «только процент» по
     `expires_at` от давно истёкшего триала. Глобальный гейт percent пускает БЕЗ
     проверки даты — а лимиты нет, и тариф был нерабочим: ни клиента, ни
     сотрудника добавить нельзя.

  3. `POST /billing/model` менял режим ТОЛЬКО в нашей БД, не трогая подписку у
     Stripe. Уход на «процент» оставлял карту платить фикс (двойная оплата у
     студии), переход подписка⇄комбо — платить не по тому Price (переплата студии
     или недобор платформы: у комбо Price ПОЛОВИННЫЙ).

Сеть и БД не трогаем — Stripe подменяется заглушками.

Запуск из back/:  python -m pytest tests/test_billing_reconcile.py
"""
import asyncio
import inspect
import sys
from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

import routers.billing.webhook as WH
import services.plan_limits as PL
import services.stripe_billing as SB
import services.stripe_catalog as SC
from schemas.settings.billing import ActivateModelRequest

# `routers/billing/__init__.py` делает `from .router import router`, поэтому атрибут
# `routers.billing.router` — это APIRouter, а не модуль. Сам модуль берём из
# sys.modules: `import ... as BR` подсунул бы роутер и уронил все подмены ниже.
import routers.billing.router  # noqa: F401  (нужен ради регистрации в sys.modules)

BR = sys.modules["routers.billing.router"]


# --------------------------------------------------------- 1. потеря события

def test_webhook_reraises_so_stripe_retries():
    """Необработанное событие обязано уйти в 500, а не в 200.

    Проверяем поведение, а не текст: подменяем хендлер падающим и убеждаемся, что
    исключение долетает до вызывающей стороны (FastAPI превратит его в 500, Stripe
    придёт ещё раз). Вернись сюда `return {"status": "ok"}` — тест упадёт.
    """
    saved_parse, saved_handler = SB.parse_webhook, WH._handle_invoice
    SB.parse_webhook = lambda _payload, _sig: {
        "type": "invoice.paid", "data": {"object": {"id": "in_1"}},
    }

    async def boom(*_a, **_kw):
        raise RuntimeError("БД недоступна")

    WH._handle_invoice = boom

    class _Req:
        headers = {"stripe-signature": "sig"}

        async def body(self):
            return b"{}"

    try:
        with pytest.raises(RuntimeError):
            asyncio.run(WH.stripe_webhook(_Req()))
    finally:
        SB.parse_webhook, WH._handle_invoice = saved_parse, saved_handler


def test_webhook_still_returns_200_on_success():
    """Успешно обработанное событие — по-прежнему 200, иначе Stripe ретраит уже
    применённое (двойной ретрай сам по себе безвреден, но это шум и лишняя нагрузка)."""
    saved_parse, saved_handler = SB.parse_webhook, WH._handle_invoice
    SB.parse_webhook = lambda _payload, _sig: {
        "type": "invoice.paid", "data": {"object": {"id": "in_1"}},
    }

    async def ok(*_a, **_kw):
        return None

    WH._handle_invoice = ok

    class _Req:
        headers = {"stripe-signature": "sig"}

        async def body(self):
            return b"{}"

    try:
        assert asyncio.run(WH.stripe_webhook(_Req())) == {"status": "ok"}
    finally:
        SB.parse_webhook, WH._handle_invoice = saved_parse, saved_handler


def test_unsigned_event_is_rejected_loudly():
    """Не сошлась подпись — 400, а не 200 «ignored».

    Раньше здесь стоял 200 с рассуждением «ретраить подделку незачем». Рассуждение
    неверное: посторонний POST из интернета Stripe не доставлял, в его статистику
    он не попадает и нагрузки ему не создаёт. Зато у НАСТОЯЩЕЙ причины несошедшейся
    подписи — разъехавшегося секрета — 200 отбирает единственный способ о ней
    узнать: доставка считается удачной, ретраев нет, в дашборде зелено, а тариф при
    этом не активируется ни у одной студии. 400 помечает доставку неудачной, и
    Stripe ретраит трое суток и пишет письмо о падающем эндпоинте.
    """
    saved = SB.parse_webhook
    SB.parse_webhook = lambda _payload, _sig: None

    class _Req:
        headers = {}

        async def body(self):
            return b"{}"

    try:
        with pytest.raises(HTTPException) as exc:
            asyncio.run(WH.stripe_webhook(_Req()))
        assert exc.value.status_code == 400
    finally:
        SB.parse_webhook = saved


# ------------------------------------------------- 2. лимиты на «проценте»

class _Plan:
    def __init__(self, billing_mode, plan_name="s15", expires_at=None):
        self.billing_mode = billing_mode
        self.plan_name = plan_name
        self.expires_at = expires_at


def _limits_db(plan, count=0):
    class _DB:
        async def execute(self, _q):
            return SimpleNamespace(
                scalar_one_or_none=lambda: plan,
                scalar=lambda: count,
            )
    return _DB()


def _run_limit(plan, count=0, entity="clients"):
    """None — пустили; иначе код ошибки."""
    try:
        asyncio.run(PL.check_plan_limit(_limits_db(plan, count), 7, entity))
        return None
    except HTTPException as exc:
        return exc.detail["code"]


_LONG_AGO = datetime.utcnow() - timedelta(days=90)


def test_percent_studio_is_not_blocked_by_stale_trial_date():
    """Главная регрессия: у percent-студии expires_at навсегда в прошлом (триал),
    и раньше это давало 403 на каждое добавление клиента — тариф не работал."""
    assert _run_limit(_Plan("percent", expires_at=_LONG_AGO)) is None


def test_percent_studio_is_not_blocked_when_adding_staff_either():
    assert _run_limit(_Plan("percent", expires_at=_LONG_AGO), entity="staff") is None


def test_percent_studio_has_no_tier_ceiling():
    """Ступени у percent-студии нет: шапка биллинга печатает модель вместо тарифа,
    карточки Старт/Pro/Business на этой модели не рендерятся, апгрейда у неё нет.
    `plan_name` при этом остаётся от триала или прошлой подписки — и потолок по нему
    запирал студию на НЕВИДИМОЙ ступени сообщением «улучшите тариф» (жалоба
    18.08.2026: три сотрудника на `start`). Бесплатным безлимит не становится:
    процент платится с оборота, не меньше MIN_MONTHLY_FEE в месяц."""
    assert _run_limit(_Plan("percent", plan_name="s3", expires_at=_LONG_AGO), count=100) is None
    assert _run_limit(_Plan("percent", plan_name="s3"), count=999, entity="staff") is None


def test_expired_subscription_is_still_blocked():
    """Обратная сторона: обычная подписка с истёкшим сроком блокируется как и раньше."""
    assert _run_limit(_Plan("subscription", expires_at=_LONG_AGO)) == "subscription_expired"
    assert _run_limit(_Plan("combo", expires_at=_LONG_AGO)) == "subscription_expired"


def test_limits_and_gate_agree_on_percent():
    """Оба места обязаны освобождать percent от проверки даты. Разъедутся — вернётся
    ровно тот баг, из-за которого написан этот файл."""
    import dependencies as D

    assert 'billing_mode == "percent"' in inspect.getsource(D.require_active_subscription)
    assert 'billing_mode == "percent"' in inspect.getsource(PL.check_plan_limit)


# ------------------------------------- 3. реконсиляция подписки при смене режима

def _row(**kw):
    return SimpleNamespace(**{
        "studio_id": 7, "plan_name": "s15", "status": "active",
        "stripe_subscription_id": "sub_1", "billing_mode": "subscription", **kw
    })


# Реквизиты плательщика у владельца заполнены: без них постоплата не включается
# вовсе (счёт за комиссию выставляем мы сами, и Stripe Tax роняет его без страны).
# Отдельная проверка отказа — test_percent_needs_billing_details_first ниже.
_USER = SimpleNamespace(
    id=1, name="O", last_name="", email="o@studio.cz",
    billing_country="CZ", billing_line1="Radlická 1", billing_line2=None,
    billing_postal_code="15000", billing_city="Praha",
    billing_vat_id=None, billing_vat_verified=False,
)
_CTX = SimpleNamespace(studio_id=7, user=_USER)


def _reconcile(row, body, *, price_key="velora_s15_12m"):
    """Гоняет _reconcile_subscription с заглушками Stripe → (отменили, смена Price)."""
    calls = {"cancelled": None, "changed": None, "proration": None}

    async def fake_cancel(sub_id):
        calls["cancelled"] = sub_id

    async def fake_key(_sub_id):
        return price_key

    async def fake_price_id(plan, months, combo):
        return f"price_{plan}_{months}_{'combo' if combo else 'sub'}"

    async def fake_change(sub_id, price, metadata, *, proration_behavior="create_prorations"):
        calls["changed"] = (sub_id, price, metadata)
        calls["proration"] = proration_behavior

    saved = (SB.cancel_subscription, SB.subscription_price_key, SC.price_id, SB.change_subscription_price)
    SB.cancel_subscription, SB.subscription_price_key = fake_cancel, fake_key
    SC.price_id, SB.change_subscription_price = fake_price_id, fake_change
    try:
        asyncio.run(BR._reconcile_subscription(row, body, _CTX))
    finally:
        (SB.cancel_subscription, SB.subscription_price_key,
         SC.price_id, SB.change_subscription_price) = saved
    return calls


def test_switch_to_percent_cancels_the_live_subscription():
    """Иначе карта продолжает платить фикс на тарифе, где фикса нет вовсе:
    студия платит и подписку, и 3% с оборота."""
    row = _row()
    calls = _reconcile(row, ActivateModelRequest(mode="percent", accept_offline_terms=True))

    assert calls["cancelled"] == "sub_1"
    assert calls["changed"] is None
    # Ссылку снимаем сразу: повторный вызов иначе отменял бы уже отменённый объект.
    assert row.stripe_subscription_id is None


def test_switch_to_combo_moves_subscription_to_the_half_price():
    """У комбо ПОЛОВИННЫЙ Price. Без смены студия платила бы полную цену подписки,
    доплачивая сверху ещё и 1.5% с транзакций."""
    calls = _reconcile(_row(), ActivateModelRequest(
        mode="combo", plan="s15", period_months=12, accept_offline_terms=True,
    ))

    assert calls["cancelled"] is None
    _sub_id, price, metadata = calls["changed"]
    assert price == "price_s15_12_combo"
    # Метаданные обязаны ехать с новым Price: по ним webhook._activate поднимает
    # ступень тарифа на продлении.
    assert metadata["plan"] == "s15" and metadata["period_months"] == "12"
    assert metadata["billing_mode"] == "combo"


def test_switch_back_to_subscription_restores_the_full_price():
    """Обратный переход — недобор уже у платформы: полный тариф за половину цены."""
    calls = _reconcile(_row(billing_mode="combo"), ActivateModelRequest(mode="subscription"),
                       price_key="velora_combo_s15_12m")

    _sub_id, price, _metadata = calls["changed"]
    # Тариф и период не прислали — взяли из lookup_key живой подписки, а не угадали.
    assert price == "price_s15_12_sub"


# --------------------------------- 3a. комбо включает ОПЛАТА, а не кнопка

def _sub(lookup_key):
    """Подписка Stripe в минимальном виде: только Price её единственной позиции."""
    return SimpleNamespace(items=SimpleNamespace(data=[
        SimpleNamespace(price=SimpleNamespace(lookup_key=lookup_key)),
    ]))


def _paid(lookup_key, **kw):
    plan = _row(**{
        "billing_mode": "subscription", "percent_rate": None, "fixed_base_amount": None, **kw
    })
    # kind="subscription": модель переставляет только оплата подписки — счета за
    # комиссию проверяются отдельно (test_percent_billing).
    WH._apply_paid_mode(plan, _sub(lookup_key), "subscription")
    return plan


def test_paid_combo_price_turns_the_combo_mode_on():
    """Комбо включается оплатой, и режим читается из Price, за который заплатили:
    у комбо он свой (velora_combo_*), второй копии хранить незачем."""
    plan = _paid("velora_combo_s15_12m")
    assert plan.billing_mode == "combo"
    assert plan.percent_rate == 1.5
    # Половина ступени «15 мест» (4000) со скидкой 40% за год — та же формула,
    # что в activate_model.
    assert plan.fixed_base_amount == round(4000 * 0.6)


def test_paid_plain_price_turns_the_combo_mode_off():
    """Обратная сторона: оплаченный обычный Price снимает и ставку, и фикс-базу —
    иначе студия, ушедшая с комбо, продолжала бы числиться должной 1.5% с оборота."""
    plan = _paid("velora_s15_12m", billing_mode="combo", percent_rate=1.5, fixed_base_amount=3465)
    assert plan.billing_mode == "subscription"
    assert plan.percent_rate is None and plan.fixed_base_amount is None


def test_an_unreadable_price_leaves_the_mode_alone():
    """Чужой или пустой lookup_key — не повод переписать режим наугад: ошибка здесь
    меняет то, сколько со студии списывают."""
    for key in (None, "price_legacy_42", "velora_unknown_1m"):
        plan = _paid(key, billing_mode="combo", percent_rate=1.5, fixed_base_amount=3465)
        assert (plan.billing_mode, plan.percent_rate) == ("combo", 1.5), key


def _plan_row(**kw):
    """Строка плана, достаточная для _to_plan_read в конце activate_model."""
    return SimpleNamespace(**{
        "id": 1, "studio_id": 7, "plan_name": "s15", "billing_cycle": "monthly",
        "status": "active", "expires_at": None, "max_staff": 15, "auto_renewal": True,
        "billing_mode": "subscription", "percent_rate": None, "fixed_base_amount": None,
        "notify_before_days": 3, "notify_before_autocharge": True,
        "email_receipt_enabled": True, "sms_notification_enabled": False,
        "scheduled_plan": None, "scheduled_at": None,
        "stripe_subscription_id": "sub_1", "stripe_customer_id": "cus_1",
        "percent_terms_accepted_at": None, "percent_terms_rate": None,
        "percent_terms_version": None,
        # Брали ли пробный период — по нему ответ считает trial_available
        # (router._trial_available), а без живой подписки лезет ещё и за
        # оплаченным счётом; стаб-БД ниже отдаёт на это None.
        "trial_started_at": None, **kw
    })


def _activate(body, row, monkeypatch, ctx=_CTX):
    """Прогон POST /billing/model со стаб-БД → тронули ли подписку в Stripe."""
    reconciled = []

    async def fake_reconcile(*_a, **_kw):
        reconciled.append(True)

    monkeypatch.setattr(BR, "_reconcile_subscription", fake_reconcile)
    monkeypatch.setattr(BR, "log_activity", lambda *a, **kw: None)

    class _DB:
        async def execute(self, _q):
            return SimpleNamespace(scalar_one_or_none=lambda: row)

        async def commit(self):
            pass

        async def refresh(self, _row):
            pass

        def add(self, _row):
            pass

    asyncio.run(BR.activate_model(body, ctx, _DB()))
    return reconciled


_COMBO = dict(mode="combo", plan="s15", period_months=12, accept_offline_terms=True)


def test_combo_on_a_live_subscription_changes_nothing_until_paid(monkeypatch):
    """ЖАЛОБА 14.08.2026: «нажал в комбо соглашаюсь, и меня перевело, хотя я не
    оплатил». У комбо ПОЛОВИННЫЙ Price — студия с оплаченным периодом одним
    нажатием начинала платить вдвое меньше, не заплатив ничего. Этот запрос теперь
    только записывает согласие; покупка идёт обычным путём оплаты, с расчётом."""
    row = _plan_row()
    reconciled = _activate(ActivateModelRequest(**_COMBO), row, monkeypatch)

    assert row.billing_mode == "subscription", "комбо включено до оплаты"
    assert row.fixed_base_amount is None, "половинный фикс выдан за нажатие кнопки"
    assert reconciled == [], "подписку перевели на половинный Price до оплаты"


def test_consent_is_still_recorded_even_though_the_mode_waits(monkeypatch):
    """Согласие на постоплату — про обязательство, а не про включение. Без записи
    оформление комбо упрётся в 422: `create_checkout` требует именно её."""
    row = _plan_row()
    _activate(ActivateModelRequest(**_COMBO), row, monkeypatch)
    assert row.percent_terms_accepted_at is not None
    assert row.percent_terms_rate == 1.5, "оплата комбо не пройдёт гейт согласия"
    assert row.percent_terms_version == BR.OFFLINE_TERMS["version"]


def test_combo_without_a_live_subscription_waits_for_payment_too(monkeypatch):
    """И тут тоже: «нажал согласен — и надпись в шапке сменилась на Комбо, хотя я
    не платил». Цену оформления это не ломает — `checkout._is_combo` берёт выбор
    из тела запроса, а не из этого поля."""
    row = _plan_row(stripe_subscription_id=None, status="none")
    _activate(ActivateModelRequest(**_COMBO), row, monkeypatch)

    assert row.billing_mode == "subscription"
    assert row.fixed_base_amount is None


def test_percent_still_switches_at_once(monkeypatch):
    """У «процента» подписки нет вовсе: фикс не уменьшается, а появляется
    обязательство платить комиссию и минимум. Отложить его нечем и незачем."""
    row = _plan_row()
    reconciled = _activate(
        ActivateModelRequest(mode="percent", accept_offline_terms=True), row, monkeypatch,
    )
    assert row.billing_mode == "percent"
    assert reconciled == [True], "подписку не отменили — карта продолжит платить фикс"


def test_percent_needs_billing_details_first(monkeypatch):
    """Постоплата без реквизитов плательщика не включается.

    Счёт за комиссию и минимальный платёж выставляем МЫ, с automatic_tax, а клиент
    Stripe без страны роняет такой счёт целиком (`customer_tax_location_invalid`).
    Онбординг адрес не спрашивает — значит percent-студия оказывалась одновременно
    неоплачиваемой и (после введения срока) блокируемой за счёт, который до неё так
    и не доехал. Гейт стоит на сервере, а не только в форме: тот же принцип, что у
    `accept_offline_terms`.
    """
    blank = SimpleNamespace(
        id=1, name="O", last_name="", email="o@studio.cz",
        billing_country=None, billing_line1=None, billing_line2=None,
        billing_postal_code=None, billing_city=None,
        billing_vat_id=None, billing_vat_verified=False,
    )
    row = _plan_row()
    with pytest.raises(HTTPException) as exc:
        _activate(
            ActivateModelRequest(mode="percent", accept_offline_terms=True), row, monkeypatch,
            ctx=SimpleNamespace(studio_id=7, user=blank),
        )
    assert exc.value.status_code == 422
    assert exc.value.detail["code"] == "billing.billing_profile_required"
    assert row.billing_mode != "percent", "режим включился в обход гейта реквизитов"


def test_switch_happens_at_once_without_refunding_the_remainder():
    """Правило продукта: переход вступает в силу сразу, остаток оплаченного периода
    НЕ возвращается. `create_prorations` вернул бы его кредитом на баланс клиента, и
    следующий счёт пришёл бы уменьшенным — вопреки тому, что обещает модалка."""
    calls = _reconcile(_row(), ActivateModelRequest(
        mode="combo", plan="s15", period_months=12, accept_offline_terms=True,
    ))
    assert calls["proration"] == "none"


def test_no_subscription_means_nothing_to_reconcile():
    """Студия без подписки (первый вход, чистый «процент») в Stripe не ходит вовсе."""
    calls = _reconcile(_row(stripe_subscription_id=None), ActivateModelRequest(mode="combo", plan="s15"))
    assert calls == {"cancelled": None, "changed": None, "proration": None}


def test_dead_subscription_is_left_alone():
    """Отменённую/неоплаченную подписку не трогаем: менять Price у мёртвого объекта
    значит получить 502 на ровном месте."""
    for status in ("expired", "pending", "none"):
        calls = _reconcile(_row(status=status), ActivateModelRequest(mode="combo", plan="s15"))
        assert calls["changed"] is None, status
        assert calls["cancelled"] is None, status


def test_stripe_failure_blocks_the_mode_change():
    """Сбой Stripe обязан отменить смену режима целиком (502 до commit'а):
    рассинхрон БД и Stripe — это и есть та самая двойная оплата."""
    src = inspect.getsource(BR.activate_model)
    # Реконсиляция стоит ДО commit'а — иначе откатывать уже нечего, и БД разъедется
    # со Stripe ровно в том сценарии, ради которого писался фикс.
    assert src.index("_reconcile_subscription") < src.index("await db.commit()")
    assert "502" in src


# ------------------------- 4. автосверка: событие не доехало ВООБЩЕ

class _SubPlan:
    """Строка StudioBillingPlan в объёме, который читает автосверка."""

    def __init__(self, status="active", expires_at=None, sub_id="sub_1"):
        self.studio_id = 7
        self.status = status
        self.expires_at = expires_at
        self.stripe_subscription_id = sub_id
        # Автопродление тоже зеркало (владелец мог отменить подписку в портале
        # Stripe, а не в CRM) — сверка читает и пишет его наравне со статусом.
        self.auto_renewal = True


def _reconcile_db(plans):
    class _DB:
        committed = False

        async def execute(self, _q):
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: plans))

        async def commit(self):
            _DB.committed = True

    return _DB()


def _stripe_subscription(status, period_end):
    """Подписка в форме API 2026-07-29: срок лежит на ПОЗИЦИИ, а не на подписке."""
    return SimpleNamespace(
        id="sub_1", status=status,
        items=SimpleNamespace(data=[SimpleNamespace(current_period_end=period_end)]),
    )


def _run_reconcile(plan, subscription=None, fail=False):
    """Число исправленных строк. Сеть застублена."""
    saved = SB.fetch_subscription

    async def _fetch(_sub_id):
        if fail:
            raise RuntimeError("Stripe недоступен")
        return subscription

    SB.fetch_subscription = _fetch
    try:
        return asyncio.run(WH.reconcile_subscriptions(_reconcile_db([plan])))
    finally:
        SB.fetch_subscription = saved


_YESTERDAY = datetime.utcnow() - timedelta(days=1)
_IN_30_DAYS = int((datetime.utcnow() + timedelta(days=30)).timestamp())


def test_reconcile_revives_a_studio_whose_renewal_event_was_lost():
    """Главный сценарий: деньги списаны, а событие продления до нас не доехало.

    Ретраи Stripe живут трое суток — эндпоинт, лежавший дольше, теряет событие
    навсегда. Тогда `expires_at` остаётся от прошлого периода, гейт смотрит на дату
    и отдаёт 402 ПЛАТЯЩЕЙ студии, а починить это она не может: ручная сверка идёт
    по счёту, которого в её списке нет (он не зеркалился).
    """
    plan = _SubPlan(status="active", expires_at=_YESTERDAY)
    assert _run_reconcile(plan, _stripe_subscription("active", _IN_30_DAYS)) == 1
    assert plan.status == "active"
    assert plan.expires_at > datetime.utcnow(), "срок не подвинулся — студия осталась в 402"


def test_reconcile_closes_a_studio_whose_subscription_actually_died():
    """Сверка работает в обе стороны: подписка отменена у Stripe, а событие
    `deleted` не дошло — доступ обязан закрыться, а не остаться бесплатным."""
    plan = _SubPlan(status="active", expires_at=_YESTERDAY)
    assert _run_reconcile(plan, _stripe_subscription("canceled", _IN_30_DAYS)) == 1
    assert plan.status == "expired"
    assert plan.expires_at <= datetime.utcnow()


def test_reconcile_does_not_grant_a_period_to_an_unpaid_subscription():
    """`incomplete` (SCA не пройден, карта не списана) — период у Stripe уже
    проставлен, но денег нет. Двигать по нему `expires_at` значит раздать
    оплаченный период неоплатившим — той же дырой, что закрыта в вебхуке."""
    plan = _SubPlan(status="pending", expires_at=_YESTERDAY)
    _run_reconcile(plan, _stripe_subscription("incomplete", _IN_30_DAYS))
    assert plan.status == "pending"
    assert plan.expires_at == _YESTERDAY, "неоплатившему выдали оплаченный период"


def test_reconcile_survives_a_stripe_outage():
    """Stripe недоступен — сверка молчит и ничего не портит: следующий тик через час."""
    plan = _SubPlan(status="active", expires_at=_YESTERDAY)
    assert _run_reconcile(plan, fail=True) == 0
    assert plan.expires_at == _YESTERDAY


def test_reconcile_and_webhook_mirror_through_one_function():
    """Правило «когда двигать expires_at» обязано быть ОДНИМ. Разъехавшись, сверка
    выдала бы период тому, кому вебхук его сознательно не выдал."""
    assert "_mirror_subscription_state" in inspect.getsource(WH._handle_subscription)
    assert "_mirror_subscription_state" in inspect.getsource(WH.reconcile_subscriptions)


def test_reconcile_only_looks_at_studios_that_can_be_broken():
    """Выборка обязана быть узкой: живая ссылка на подписку, невыгоревший статус и
    истекающий срок. Иначе часовой проход ходит в Stripe за каждой студией, а
    `expired` он воскрешал бы мимо оплаты."""
    src = inspect.getsource(WH.reconcile_subscriptions)
    assert "stripe_subscription_id.isnot(None)" in src
    assert 'status.in_(("active", "past_due", "pending"))' in src
    assert "expires_at < horizon" in src


def test_reconcile_runs_in_the_hourly_pass_under_the_lock():
    """Сверка обязана жить в проходе, который уже взят под advisory-лок: иначе
    несколько инстансов ходили бы в Stripe одновременно за одними и теми же
    подписками."""
    import services.offline_fee_billing as OFB

    assert "reconcile_subscriptions" in inspect.getsource(OFB._run_billing_pass)
    assert "pg_try_advisory_lock" in inspect.getsource(OFB.run_offline_fee_billing)


if __name__ == "__main__":
    import sys
    sys.exit(pytest.main([__file__, "-q"]))
