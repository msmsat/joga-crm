"""Платёжный аудит 28.08.2026: четыре дыры, каждая — деньги.

Что здесь защищается (по одному разделу на дыру):

  1. ПАРАЛЛЕЛЬНАЯ ДОСТАВКА ВЕБХУКА. `apply_status` решал «этот счёт ещё не
     оплачен» по НЕЗАПЕРТОМУ полю. Stripe доставляет событие повторно и может
     доставить его параллельно (ретрай уходит, пока первая доставка ещё в
     работе), а ту же функцию из соседнего запроса дёргает ручная сверка. Два
     обработчика читали `pending` одновременно, оба доходили до продления — а оно
     НЕ идемпотентно: купленные месяцы прибавляются к текущему концу периода, и
     студия получала вдвое больше оплаченного времени (плюс второй чек).

  2. РУЧНАЯ СВЕРКА ТЕРЯЛА ПРОДЛЕНИЕ. `POST /invoices/{id}/sync` звал тот же
     переход БЕЗ `renew_months`: счёт продления отмечался оплаченным, доход шёл в
     леджер, чек уходил — а срок подписки не двигался вовсе. Студия платила за 12
     месяцев и не получала ни одного, причём ровно в том сценарии, ради которого
     кнопка и существует (событие не доехало). Автосверка это не подберёт: она
     зеркалит подписку у Stripe, а Stripe про наше продление знает только отсюда.

  3. КОМБО → ПОДПИСКА ДАРОМ. Зеркало жалобы 14.08.2026. У комбо ПОЛОВИННЫЙ Price:
     студия оплачивала период комбо, тут же переключала модель на «фиксированную»
     обычной настройкой — и получала полный тариф за половину денег (оплаченный
     период не перевыставляется), разом снимая с себя обязательство платить
     процент с оборота. Гейт «рассчитайтесь по комиссии» дыру не закрывал: у
     студии без офлайн-продаж долга нет, а минимальный месячный платёж на комбо не
     выставляется никогда.

  4. ДВОЙНАЯ ТРАТА БАЛЛОВ, ДЕПОЗИТА И СЕРТИФИКАТА. `_quote` считает по незапертому
     чтению, а `apply_points_change` делает read-modify-write в питоне: две
     параллельные оплаты одного клиента (две вкладки мини-приложения, ретрай сети)
     обе видели один остаток и обе списывали от него. 250 баллов оплачивали ДВА
     абонемента; сертификат гасился один раз, а выдавалось два. Дороже всего это в
     мини-приложении: пакет, целиком покрытый баллами или сертификатом, проводится
     БЕЗ Stripe вовсе (`_grant_fully_covered`) — второй абонемент бесплатный.

Сеть и БД не трогаем: и Stripe, и слой БД застублены, как в соседних файлах.

Запуск из back/:  python -m pytest tests/test_payment_audit.py
"""
import asyncio
import inspect
import sys
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

import routers.billing.webhook as WH
import routers.booking.miniapp_users as MU
import routers.checkout.router  # noqa: F401  (регистрация модуля в sys.modules)
import routers.checkout.stripe_pay as SP
import services.offline_fee_billing as OFB
import services.stripe_billing as SB
from schemas.settings.billing import ActivateModelRequest

# `routers/billing/__init__.py` экспортирует `router` как APIRouter, поэтому
# `routers.billing.router` — это объект роутера, а не модуль. Берём модуль из
# sys.modules, как в test_billing_reconcile.py.
import routers.billing.router  # noqa: F401  (нужен ради регистрации в sys.modules)

BR = sys.modules["routers.billing.router"]
# `routers/checkout/__init__.py` перекрывает имя `router` объектом APIRouter — тот
# же капкан, что у биллинга. Модуль берём из sys.modules.
CR = sys.modules["routers.checkout.router"]


def _run(coro):
    return asyncio.run(coro)


# ─── 1. параллельная доставка вебхука ─────────────────────────────────────────

def _invoice(status, **kw):
    return SimpleNamespace(**{
        "id": 5, "status": status, "kind": "subscription", "studio_id": 7,
        "stripe_invoice_id": None, "amount": 9900, "plan_name": "s15",
        "period": None, "period_months": 12, "paid_at": None,
        "payment_method": "card", "pdf_url": None, "hosted_invoice_url": None,
        **kw,
    })


class _LockDB:
    """Сессия, отдающая на запрос с блокировкой ЧУЖОЕ (уже закоммиченное) состояние.

    Ровно то, что видит второй обработчик: пока он ждал блокировку, первый успел
    закоммитить `paid`. Заодно записывает, была ли блокировка вообще запрошена —
    без неё второй обработчик читал бы строку из своей identity map со старым
    статусом, и весь этот тест проходил бы вхолостую.
    """

    def __init__(self, locked_row):
        self._locked = locked_row
        self.for_update = []

    async def execute(self, query):
        self.for_update.append(getattr(query, "_for_update_arg", None) is not None)
        return SimpleNamespace(scalar_one_or_none=lambda: self._locked)

    async def commit(self):
        raise AssertionError("проигравший обработчик закоммитил повторную оплату")


def test_second_delivery_of_the_same_event_does_not_extend_the_period_twice():
    """Главный инвариант: продление ровно одно на один оплаченный счёт."""
    extended = []

    async def spy(*args, **kwargs):
        extended.append(args)

    saved = WH._extend_paid_period
    WH._extend_paid_period = spy
    try:
        db = _LockDB(_invoice("paid"))        # первый обработчик уже закоммитил
        loser = _invoice("pending")           # второй читает свой устаревший объект
        assert _run(WH.apply_status(db, loser, "paid", renew_months=12)) is False
    finally:
        WH._extend_paid_period = saved

    assert extended == [], "период продлён вторым обработчиком того же события"
    assert loser.status == "pending", "проигравший всё-таки переписал статус"


def test_the_transition_is_decided_under_a_row_lock():
    """Без `FOR UPDATE` проверка выше ничего не доказывает: оба обработчика
    прочитали бы `pending` и разошлись бы, не заметив друг друга."""
    db = _LockDB(_invoice("paid"))
    _run(WH.apply_status(db, _invoice("pending"), "paid", renew_months=12))
    assert db.for_update == [True], "строка счёта не запирается перед переходом"


def test_a_repeat_of_an_applied_status_costs_no_lock_at_all():
    """Самый частый случай — ретрай Stripe по уже обработанному событию. Лочить
    строку ради него незачем, и `_transition_allowed` отсекает его до БД."""
    db = _LockDB(_invoice("paid"))
    assert _run(WH.apply_status(db, _invoice("paid"), "paid")) is False
    assert db.for_update == []


def test_the_two_checks_use_one_and_the_same_rule():
    """Правило перехода проверяется дважды — до блокировки и под ней. Второй
    экземпляр условий однажды разъехался бы с первым, и разъехался бы на деньгах."""
    assert WH._transition_allowed("pending", "paid") is True
    assert WH._transition_allowed("paid", "paid") is False
    assert WH._transition_allowed("paid", "failed") is False
    assert WH._transition_allowed("refunded", "paid") is False
    assert WH._transition_allowed("pending", "processing") is False
    assert inspect.getsource(WH.apply_status).count("_transition_allowed(") == 2


# ─── 2. ручная сверка продлевает срок ─────────────────────────────────────────

class _SyncDB:
    def __init__(self, invoice, plan):
        self._answers = [invoice, plan]

    async def execute(self, _q):
        value = self._answers.pop(0) if self._answers else None
        return SimpleNamespace(scalar_one_or_none=lambda: value)

    async def commit(self):
        pass

    async def refresh(self, _row):
        pass


def test_manual_sync_of_a_renewal_invoice_moves_the_paid_period(monkeypatch):
    """Кнопка «Сверить» существует ровно для случая «вебхук не дошёл». Если она
    отмечает счёт оплаченным, но не двигает срок, студия платит за год и не
    получает ни дня — и подобрать это уже нечем."""
    from ratelimit import limiter

    limiter.enabled = False
    applied = {}

    async def fake_fetch(_stripe_id):
        return SimpleNamespace(
            id="in_1", status="paid",
            metadata=SimpleNamespace(renew_months="12"),
        )

    async def fake_mirror(_db, _plan, _inv):
        return None

    async def fake_apply(_db, _inv, status, **kw):
        applied.update(status=status, **kw)
        return True

    monkeypatch.setattr(SB, "fetch_invoice", fake_fetch)
    monkeypatch.setattr(BR, "mirror_invoice", fake_mirror)
    monkeypatch.setattr(BR, "apply_status", fake_apply)

    inv = _invoice("pending", stripe_invoice_id="in_1")
    ctx = SimpleNamespace(studio_id=7, user=SimpleNamespace(id=1))
    fn = getattr(BR.sync_invoice, "__wrapped__", BR.sync_invoice)
    _run(fn(SimpleNamespace(), inv.id, ctx, _SyncDB(inv, None)))

    assert applied.get("status") == "paid"
    assert applied.get("renew_months") == 12, "ручная сверка потеряла продление"


def test_manual_sync_reads_the_months_the_same_way_the_webhook_does():
    """Из метаданных счёта Stripe и той же функцией: вторая копия разбора
    однажды прочла бы период иначе, чем вебхук."""
    assert "_renew_months(stripe_invoice)" in inspect.getsource(BR.sync_invoice)


# ─── 3. комбо → подписка только за деньги ─────────────────────────────────────

def _plan_row(**kw):
    return SimpleNamespace(**{
        "id": 1, "studio_id": 7, "plan_name": "s15", "billing_cycle": "monthly",
        "status": "active", "expires_at": None, "max_staff": 15, "auto_renewal": True,
        "billing_mode": "combo", "percent_rate": 1.5, "fixed_base_amount": 2400,
        "notify_before_days": 3, "notify_before_autocharge": True,
        "email_receipt_enabled": True, "sms_notification_enabled": False,
        "scheduled_plan": None, "scheduled_at": None,
        "stripe_subscription_id": "sub_1", "stripe_customer_id": "cus_1",
        "percent_terms_accepted_at": None, "percent_terms_rate": 1.5,
        "percent_terms_version": BR.OFFLINE_TERMS["version"],
        "trial_started_at": None, **kw
    })


class _PlanDB:
    def __init__(self, row):
        self._row = row

    async def execute(self, _q):
        return SimpleNamespace(scalar_one_or_none=lambda: self._row)

    async def commit(self):
        pass

    async def refresh(self, _row):
        pass

    def add(self, _row):
        pass


_CTX = SimpleNamespace(
    studio_id=7,
    user=SimpleNamespace(
        id=1, name="Owner", last_name="One", email="o@x.com",
        billing_country="CZ", billing_line1="Ulice 1", billing_line2=None,
        billing_postal_code="11000", billing_city="Praha",
        billing_vat_id=None, billing_vat_verified=False,
    ),
)


def _activate(body, row, monkeypatch):
    """Прогон POST /billing/model со стаб-БД → тронули ли подписку в Stripe.

    Долг по комиссии стабим в «нет»: гейт расчёта — отдельное правило, и дыра,
    которую тут проверяют, живёт как раз у студии, которой платформе предъявить
    нечего.
    """
    reconciled = []

    async def no_debt(*_a, **_kw):
        return False

    async def fake_reconcile(*_a, **_kw):
        reconciled.append(True)

    monkeypatch.setattr(OFB, "has_unsettled_commission", no_debt)
    monkeypatch.setattr(BR, "_reconcile_subscription", fake_reconcile)
    monkeypatch.setattr(BR, "log_activity", lambda *a, **kw: None)
    _run(BR.activate_model(body, _CTX, _PlanDB(row)))
    return reconciled


def test_leaving_combo_for_a_fixed_plan_is_a_purchase_not_a_setting(monkeypatch):
    """Оплатив ПОЛОВИНУ (комбо), студия одним запросом получала полный тариф на
    весь уже оплаченный период и снимала с себя процент с оборота."""
    row = _plan_row()
    with pytest.raises(HTTPException) as exc:
        _activate(ActivateModelRequest(mode="subscription"), row, monkeypatch)

    assert exc.value.status_code == 409
    assert exc.value.detail["code"] == "billing.combo_switch_requires_payment"
    assert row.billing_mode == "combo", "режим переписан отказанным запросом"
    assert row.percent_rate == 1.5, "обязательство платить процент снято даром"
    assert row.fixed_base_amount == 2400, "половинный фикс снят отказанным запросом"


def test_the_commission_gate_alone_never_closed_this_hole(monkeypatch):
    """Гейт «рассчитайтесь по комиссии» тут бессилен по устройству: долга у студии
    без офлайн-продаж нет, а минимальный месячный платёж выставляется ТОЛЬКО
    тарифу «только процент» — комбо он не касается никогда."""
    assert 'plan.billing_mode != "percent"' in inspect.getsource(OFB._bill_minimum)
    with pytest.raises(HTTPException) as exc:
        _activate(ActivateModelRequest(mode="subscription"), _plan_row(), monkeypatch)
    assert exc.value.status_code == 409


def test_without_a_live_subscription_there_is_nothing_to_gift(monkeypatch):
    """Дарить нечего — оплаченного периода нет. Запирать такую студию в комбо
    навсегда было бы отдельной поломкой."""
    row = _plan_row(stripe_subscription_id=None, status="expired")
    reconciled = _activate(ActivateModelRequest(mode="subscription"), row, monkeypatch)
    assert row.billing_mode == "subscription"
    assert row.percent_rate is None
    # Подписки нет — переводить нечего, и _reconcile_subscription сам выходит
    # первой же строкой; вызов тут не запрещён, запрещён подарок.
    assert reconciled == [True]


def test_the_refusal_leads_to_the_paid_path_not_to_a_dead_end():
    """`POST /billing/checkout` с combo=false — это смена тарифа за полную цену
    периода (checkout._switch_now), и режим поднимает уже оплата
    (webhook._apply_paid_mode). Отказ обязан вести именно туда."""
    from routers.billing.checkout import create_checkout

    assert "_switch_now" in inspect.getsource(create_checkout)
    assert "Оплатить" in BR.COMBO_SWITCH_REQUIRES_PAYMENT["message"]


# ─── 4. баллы, депозит и сертификат тратятся один раз ─────────────────────────

def _quote(**kw):
    return CR.PriceQuote(**{
        "base_price": 1000, "discount": 0, "promo_valid": True,
        "bonuses_available": 250, "bonuses_applied": 0, "bonuses_value": 0,
        "point_value": 1, "deposit_available": 0, "deposit_applied": 0,
        "certificate_applied": 0, "certificate": None, "total_price": 0,
        "resolved": SimpleNamespace(mark_used=lambda: None), **kw
    })


class _SpendDB:
    """Отдаёт то, что видно ПОД блокировкой, — то есть уже после чужого списания."""

    def __init__(self, locked):
        self._locked = locked
        self.for_update = []

    async def execute(self, query):
        self.for_update.append(getattr(query, "_for_update_arg", None) is not None)
        return SimpleNamespace(scalar_one_or_none=lambda: self._locked)

    async def commit(self):
        raise AssertionError("списание закоммичено поверх чужого")


def test_points_already_spent_by_a_parallel_sale_are_not_spent_again():
    """250 баллов не могут оплатить два абонемента. Вторая оплата обязана
    упереться в остаток, прочитанный ПОД блокировкой, а не в свой снимок."""
    card = SimpleNamespace(points_balance=0, deposit_balance=0)
    db = _SpendDB(card)
    with pytest.raises(HTTPException) as exc:
        _run(CR.consume_quote(db, 7, 42, _quote(bonuses_applied=250, bonuses_value=250)))

    assert exc.value.status_code == 409
    assert exc.value.detail["code"] == "checkout.balance_changed"
    assert db.for_update == [True], "карта лояльности не запирается перед списанием"


def test_deposit_already_spent_by_a_parallel_sale_is_not_spent_again():
    card = SimpleNamespace(points_balance=0, deposit_balance=100)
    with pytest.raises(HTTPException) as exc:
        _run(CR.consume_quote(_SpendDB(card), 7, 42, _quote(deposit_applied=500)))
    assert exc.value.detail["code"] == "checkout.balance_changed"


def test_a_certificate_redeemed_in_another_window_is_refused():
    """Сертификат гасится целиком и ровно один раз: две параллельные продажи
    видели «active» обе и выдавали два абонемента за один документ."""
    used = SimpleNamespace(id=3, code="GIFT", status="used", used_at=None, amount=1000)
    db = _SpendDB(used)
    with pytest.raises(HTTPException) as exc:
        _run(CR.consume_quote(db, 7, 42, _quote(
            certificate_applied=1000,
            certificate=SimpleNamespace(
                id=3, code="GIFT", status="active", used_at=None, amount=1000,
            ),
        )))

    assert exc.value.status_code == 400
    assert exc.value.detail["code"] == "loyalty.cert_used"
    assert db.for_update == [True], "сертификат не запирается перед погашением"


def test_enough_balance_still_goes_through():
    """Защита не должна ломать обычную продажу: остаток на месте — списываем."""
    card = SimpleNamespace(points_balance=250, deposit_balance=500)
    spent = []

    async def fake_points(_client_id, _studio_id, points, _description, _db):
        spent.append(("points", points))

    async def fake_deposit(_client_id, _studio_id, amount, _description, _db):
        spent.append(("deposit", amount))

    saved = (CR.apply_points_change, CR.apply_deposit_change)
    CR.apply_points_change, CR.apply_deposit_change = fake_points, fake_deposit
    try:
        class _OkDB(_SpendDB):
            async def commit(self):
                pass

        out = _run(CR.consume_quote(
            _OkDB(card), 7, 42,
            _quote(bonuses_applied=250, bonuses_value=250, deposit_applied=500),
        ))
    finally:
        CR.apply_points_change, CR.apply_deposit_change = saved

    assert sorted(spent) == [("deposit", -500), ("points", -250)]
    assert out == {"bonuses": 250, "deposit": 500, "certificate_code": None}


# ─── 5. возврат уходит в Stripe ровно один раз ────────────────────────────────

def test_a_refund_carries_a_business_idempotency_key(monkeypatch):
    """Гварда «возвращаем только оплаченный» двойной возврат не ловит: `refunded`
    проставляет вебхук, а он придёт уже после того, как второй запрос уйдёт в
    Stripe. Ключ по НАШЕМУ счёту делает второй возврат невозможным в принципе, а
    не оставляет защиту на чужой стороне."""
    import stripe

    from routers.billing import refunds as RF

    sent = []
    monkeypatch.setattr(
        stripe.Refund, "create",
        lambda **kw: sent.append(kw) or SimpleNamespace(id="re_1"),
    )

    async def target(_stripe_invoice_id):
        return {"payment_intent": "pi_1"}

    monkeypatch.setattr(SB, "refund_target_for_invoice", target)

    invoice = SimpleNamespace(
        id=42, studio_id=7, status="paid", kind="subscription",
        paid_at=None, stripe_invoice_id="in_1", order_id=None,
    )

    class _DB:
        async def execute(self, _q):
            return SimpleNamespace(scalar_one_or_none=lambda: invoice)

    fn = getattr(RF.refund_invoice, "__wrapped__", RF.refund_invoice)
    _run(fn(SimpleNamespace(), 42, SimpleNamespace(studio_id=7), _DB()))

    assert len(sent) == 1
    assert sent[0]["payment_intent"] == "pi_1"
    assert sent[0]["idempotency_key"] == "rf:42", "повтор запроса вернёт деньги дважды"


# ─── 6. клиент Stripe у студии ровно один ─────────────────────────────────────

class _CustomerDB:
    """Сессия, в которой параллельный запрос УЖЕ завёл клиента и закоммитил.

    `populate_existing` у настоящей ORM переписывает поля объекта значениями из
    БД — здесь это и воспроизводится: на запросе с блокировкой строка плана
    «просыпается» с чужим, уже сохранённым `stripe_customer_id`.
    """

    def __init__(self, plan, studio, winner="cus_winner"):
        self._plan = plan
        self._studio = studio
        self._winner = winner
        self.for_update = []

    async def execute(self, query):
        locking = getattr(query, "_for_update_arg", None) is not None
        self.for_update.append(locking)
        if locking:
            self._plan.stripe_customer_id = self._winner
            return SimpleNamespace(scalar_one=lambda: self._plan)
        return SimpleNamespace(scalar_one=lambda: self._studio)

    async def commit(self):
        pass


_STUDIO = SimpleNamespace(id=7, name="Studio", email="s@e.com")


def test_two_parallel_first_payments_do_not_create_two_stripe_customers(monkeypatch):
    """Клиент у студии ровно один, и это не про чистоту дашборда.

    Два Customer'а означают, что подписка родилась на одном, а в нашей строке
    записан другой: вебхук по оплате не находит студию НИ по подписке (её id мы
    ещё не знаем), НИ по клиенту — и тариф не активируется никогда. Деньги при
    этом списаны, а автосверка бессильна: ей нужен `stripe_subscription_id`.
    """
    from routers.billing import checkout as checkout_mod

    seen = []

    async def fake_ensure(customer_id, **_kw):
        seen.append(customer_id)
        return customer_id or "cus_loser"

    monkeypatch.setattr(checkout_mod.stripe_billing, "ensure_customer", fake_ensure)

    plan = SimpleNamespace(studio_id=7, stripe_customer_id=None)   # устаревший снимок
    db = _CustomerDB(plan, _STUDIO)
    ctx = SimpleNamespace(studio_id=7, user=_CTX.user)
    got = _run(checkout_mod._ensure_customer(db, ctx, plan))

    assert db.for_update[0] is True, "строка плана не запирается перед заведением клиента"
    assert seen == ["cus_winner"], "второй запрос завёл студии ВТОРОГО клиента"
    assert got == "cus_winner"


def test_the_same_lock_guards_the_monthly_commission_pass():
    """Спорят не только две вкладки: месячный проход выставляет счёт за комиссию
    ровно тогда, когда владелец идёт платить тариф. Второй Customer развёл бы
    подписку и счета постоплаты по разным клиентам."""
    src = inspect.getsource(OFB._ensure_studio_customer)
    assert "with_for_update()" in src
    assert src.index("with_for_update()") < src.index("if plan.stripe_customer_id:")


def test_every_spending_path_goes_through_the_one_choke_point():
    """Три входа тратят баллы/сертификат/депозит — касса, вебхук Stripe и
    мини-приложение. Защита стоит в `consume_quote` именно потому, что она у них
    одна: четвёртый вход мимо неё вернул бы двойную трату целиком."""
    for fn in (CR.perform_pay, SP._apply_client_subscription_purchase, MU._grant_fully_covered):
        assert "consume_quote" in inspect.getsource(fn), fn.__name__


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-q"]))
