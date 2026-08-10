"""Постоплата комиссии с офлайн-продаж: согласие, начисление, срок, блокировка.

Экономика: онлайн-платёж расщепляет Stripe в момент оплаты, а наличные, терминал
и депозит копятся строками OfflineTransactionFee и выставляются счётом раз в
месяц. Карту не привязываем — студия платит по счёту сама. Не заплатила за
неделю → блокируются И CRM, И мини-приложение.

Инварианты, каждый из которых стоит платформе выручки или студии — доступа:
  1. Юридический: на тариф с процентом нельзя перейти без явного согласия.
  2. Денежный: комиссия начисляется на ВСЕХ путях офлайн-продаж и НИ РАЗУ на онлайне.
  3. Срочный: блокировка наступает строго после due_at, не раньше.
  4. Блокировка накрывает и мини-приложение, иначе клиенты пишутся в мёртвую студию.

Сеть и БД не трогаем.

Запуск из back/:  python -m tests.test_percent_billing
"""
import asyncio
from datetime import datetime, timedelta
from types import SimpleNamespace

import dependencies as D
import services.offline_fee_billing as OFB
import services.platform_fee as PF
from fastapi import HTTPException
from routers.billing.plans import PLANS, PERIOD_DISCOUNTS, amount_for, combo_amount_for
from schemas.settings.billing import ActivateModelRequest
from services.stripe_catalog import lookup_key, _product_id


def _db(value, *, first=None, scalar=None):
    """Фейк сессии: select отдаёт `value`; `.first()`/`.scalar_one_or_none()` для
    запроса причины блокировки задаются отдельно (`first`/`scalar`)."""
    class _DB:
        async def execute(self, _q):
            return SimpleNamespace(
                scalar_one_or_none=lambda: scalar if scalar is not None else value,
                scalar_one=lambda: value,
                first=lambda: first,
            )
    return _DB()


class _Plan:
    def __init__(self, billing_mode="subscription", status="active", expires_at=None):
        self.billing_mode = billing_mode
        self.status = status
        self.expires_at = expires_at


# ------------------------------------------------- 1. юридическое согласие

def test_percent_requires_explicit_consent_by_default():
    """Флаг согласия по умолчанию выключен — «забыли передать» не равно «согласились»."""
    body = ActivateModelRequest(mode="percent")
    assert body.accept_offline_terms is False


def test_consent_flag_is_accepted_when_sent():
    assert ActivateModelRequest(mode="percent", accept_offline_terms=True).accept_offline_terms is True


def test_terms_promise_the_same_grace_as_the_code_enforces():
    """Текст согласия и реальный срок блокировки обязаны совпадать.

    Разъехались — студия соглашалась на один срок, а отключают её по другому.
    Это прямой юридический риск, поэтому проверяется тестом, а не глазами.
    """
    from routers.billing.router import OFFLINE_TERMS

    assert OFFLINE_TERMS["grace_days"] == OFB.GRACE_DAYS == 7
    assert OFFLINE_TERMS["version"], "у условий обязана быть версия — её фиксируем в согласии"


# ------------------------------------------------------- 2. начисление

def _sell(billing_mode, payment_method, price=1500):
    """attach_subscription с подменённым окружением → список начислений."""
    import routers.clients.subscriptions as S

    accrued = []

    async def fake_record(_db, studio_id, minor, currency, *, client_id, payment_method):
        accrued.append((studio_id, minor, currency, payment_method))

    async def fake_noop(*_a, **_kw):
        return None

    async def fake_live(*_a, **_kw):
        return False

    class _DB:
        def add(self, _obj):
            pass

        async def flush(self):
            pass

        async def execute(self, _q):
            studio = SimpleNamespace(id=7, currency="CZK")
            return SimpleNamespace(scalar_one=lambda: studio, scalar_one_or_none=lambda: studio)

    package = SimpleNamespace(id=1, name="8 занятий", price=price, class_count=8, duration_days=30)
    saved = (S.platform_fee.record_offline_fee, S.accrue_points, S.register_purchase,
             S._has_live_subscription)
    S.platform_fee.record_offline_fee = fake_record
    S.accrue_points, S.register_purchase = fake_noop, fake_noop
    S._has_live_subscription = fake_live
    try:
        asyncio.run(S.attach_subscription(
            _DB(), 7, 42, package, SimpleNamespace(id=1, balance=0),
            mark_paid=True, price=price, payment_method=payment_method,
        ))
    finally:
        (S.platform_fee.record_offline_fee, S.accrue_points, S.register_purchase,
         S._has_live_subscription) = saved
    return accrued


def test_cash_sale_from_the_client_card_accrues():
    """Продажа из карточки клиента идёт мимо кассы — и всё равно начисляет.

    Главный админский флоу; хук в одной кассе оставил бы его бесплатным.
    """
    assert _sell("percent", "cash") == [(7, 150000, "CZK", "cash")]


def test_online_sale_is_never_charged_twice():
    """Stripe уже удержал долю при оплате — счёт был бы вторым списанием."""
    assert _sell("percent", PF.ONLINE_METHOD) == []


def test_free_attachment_accrues_nothing():
    """price=0 — автопродление с депозита и бесплатное подключение: денег нет."""
    assert _sell("percent", "cash", price=0) == []


def test_miniapp_marks_its_sale_as_online():
    """Регресс: мини-приложение обязано слать payment_method="stripe"."""
    import inspect

    import routers.checkout.stripe_pay as SP

    src = inspect.getsource(SP._apply_client_subscription_purchase)
    assert 'payment_method="stripe"' in src, "мини-приложение снова платит комиссию дважды"


def test_rate_is_frozen_at_sale_time():
    """Ставка пишется в строку начисления: смена тарифа не пересчитывает прошлое."""
    import inspect

    src = inspect.getsource(PF.record_offline_fee)
    assert "percent_rate=plan.percent_rate" in src


# --------------------------------------------------- 3. срок и блокировка

def _suspended(has_overdue_row):
    # Причин блокировки теперь две (комиссия и минимальный месячный платёж), и
    # suspension_reason отдаёт ВИД просроченного счёта — из него гейт выбирает текст.
    # studio_suspended остался булевой обёрткой, её и проверяем.
    return asyncio.run(PF.studio_suspended(
        _db(None, scalar=("offline_fee" if has_overdue_row else None)), 7,
    ))


def test_overdue_invoice_suspends():
    assert _suspended(True) is True


def test_no_overdue_invoice_keeps_access():
    assert _suspended(False) is False


def test_suspension_query_only_counts_unpaid_overdue_fee_invoices():
    """Условия блокировки заданы точно: чужой вид счёта, оплаченный или ещё не
    просроченный блокировать не должен. Проверяем сам предикат — подсунуть
    реальную БД тут нечем, а ошибка в любом из четырёх условий отключает
    платящую студию."""
    import inspect

    src = inspect.getsource(PF.suspension_reason)
    # Оба вида постоплаты: комиссия с наличных и минимальный месячный платёж.
    assert "kind.in_(SUSPENDING_KINDS)" in src
    assert set(PF.SUSPENDING_KINDS) == {"offline_fee", "min_fee"}
    assert 'notin_(("paid", "refunded"))' in src
    assert "due_at.isnot(None)" in src
    assert "due_at < datetime.utcnow()" in src


def test_invoice_gets_a_week_to_be_paid():
    """Срок ставим мы и в БД — блокировка не должна зависеть от события Stripe."""
    import inspect

    src = inspect.getsource(OFB._bill)
    assert "timedelta(days=GRACE_DAYS)" in src


def test_reissued_invoice_restarts_the_clock():
    """Не смогли выставить счёт вовремя — студия не должна терять grace-период."""
    import inspect

    src = inspect.getsource(OFB._finish_pending)
    assert "invoice.due_at = datetime.utcnow() + timedelta(days=GRACE_DAYS)" in src


# --------------------------------------------------------------- 4. гейты

def _run_gate(*, plan, suspended):
    # Гейт спрашивает ВИД просроченного счёта, а не булево: текст отказа за
    # комиссию и за минимальный платёж разный.
    saved = PF.suspension_reason

    async def fake(_db, _sid):
        return "offline_fee" if suspended else None

    PF.suspension_reason = fake
    try:
        asyncio.run(D.require_active_subscription(SimpleNamespace(studio_id=7), _db(plan)))
        return None
    except HTTPException as exc:
        return exc.detail["code"]
    finally:
        PF.suspension_reason = saved


def test_percent_studio_works_without_card_and_without_subscription():
    """Карту больше не требуем: студия платит по счёту."""
    assert _run_gate(plan=_Plan("percent", status="expired"), suspended=False) is None


def test_overdue_debt_blocks_even_a_paid_studio():
    assert _run_gate(
        plan=_Plan(expires_at=datetime.utcnow() + timedelta(days=30)), suspended=True,
    ) == "billing.suspended"


def test_combo_still_needs_its_subscription():
    assert _run_gate(plan=_Plan("combo", status="expired"), suspended=False) == "subscription_expired"


def test_subscription_studio_is_unaffected():
    assert _run_gate(plan=_Plan(expires_at=datetime.utcnow() + timedelta(days=1)), suspended=False) is None
    assert _run_gate(plan=_Plan(expires_at=datetime.utcnow() - timedelta(days=1)), suspended=False) == "subscription_expired"


def test_miniapp_is_suspended_together_with_the_crm():
    """Клиенты не должны записываться в студию с отключённым кабинетом.

    Проверяем проводку в самой зависимости: её проходят все ручки мини-приложения.
    """
    import inspect

    import routers.booking.miniapp as M

    src = inspect.getsource(M.get_current_client)
    assert "studio_suspended" in src
    assert "SUSPENDED_DETAIL" in src


def test_billing_section_stays_reachable_when_suspended():
    """Заблокированная студия обязана видеть долг и уметь его закрыть.

    Гейт вешается роутерами в main.py; /billing в списке быть не должно, иначе
    блокировка становится тупиком без выхода.
    """
    import re
    from pathlib import Path

    src = Path(__file__).resolve().parents[1].joinpath("main.py").read_text(encoding="utf-8")
    line = next(l for l in src.splitlines() if "billing_router" in l and "include_router" in l)
    assert "_sub_gate" not in line, "гейт на /billing запирает студию без возможности заплатить"
    assert re.search(r"offline-fees", Path(__file__).resolve().parents[1]
                     .joinpath("routers/billing/router.py").read_text(encoding="utf-8"))


# ------------------------------------------------------------ валюта и суммы

def test_unknown_fx_rate_defers_instead_of_undercharging():
    saved = dict(OFB._FX)
    OFB._FX.clear()
    try:
        assert OFB.to_billing_currency(4500, "czk") is None
        assert OFB.to_billing_currency(4500, OFB.stripe_billing.CURRENCY) == 4500
    finally:
        OFB._FX.clear()
        OFB._FX.update(saved)


def test_current_month_keeps_accruing():
    assert OFB.month_start(datetime(2026, 8, 8, 23, 59)) == datetime(2026, 8, 1)


def test_fees_are_reserved_before_going_to_stripe():
    """Порядок операций денежный: коммит резерва ДО создания счёта у Stripe.

    Обратный порядок при сбое коммита выставил бы те же начисления вторым счётом
    в следующем месяце — двойное списание.
    """
    import inspect

    src = inspect.getsource(OFB._bill)
    reserve = src.index("fee.invoice_id = invoice.id")
    stripe_call = src.index("_issue_to_stripe")
    assert reserve < stripe_call, "счёт уходит в Stripe раньше, чем зарезервированы начисления"


# -------------------------------------------------------------- комбо-цены

def test_combo_costs_exactly_half_on_every_period():
    for plan_id in PLANS:
        for months in PERIOD_DISCOUNTS:
            assert combo_amount_for(plan_id, months) * 2 == amount_for(plan_id, months)


def test_combo_catalog_keys_never_collide():
    keys = {lookup_key(p, m, c) for p in PLANS for m in PERIOD_DISCOUNTS for c in (False, True)}
    assert len(keys) == len(PLANS) * len(PERIOD_DISCOUNTS) * 2
    assert lookup_key("business", 1, True) == "velora_combo_business_1m"
    assert _product_id("business", True) != _product_id("business")


# ------------------------- 5. долг нельзя вернуть себе самому

def _invoice(kind="subscription", status="paid", age_days=0):
    return SimpleNamespace(
        id=1, studio_id=7, kind=kind, status=status,
        paid_at=datetime.utcnow() - timedelta(days=age_days),
        stripe_invoice_id="in_1", order_id=None,
    )


def _run_refund(invoice):
    """Гварды POST /billing/invoices/{id}/refund. None — возврат разрешён.
    Stripe застублен: до него доходят только счета, которые гварды пропустили."""
    import routers.billing.refunds as R
    import services.stripe_billing as SB

    saved = SB.refund_target_for_invoice, SB.refund

    async def _target(_invoice_id):
        return {"payment_intent": "pi_1"}

    async def _refund(_target):
        return None

    SB.refund_target_for_invoice, SB.refund = _target, _refund
    try:
        asyncio.run(R.refund_invoice(1, SimpleNamespace(studio_id=7), _db(invoice)))
        return None
    except HTTPException as exc:
        return exc.detail["code"] if isinstance(exc.detail, dict) else exc.detail
    finally:
        SB.refund_target_for_invoice, SB.refund = saved


def test_owner_cannot_refund_the_commission_invoice():
    """Дыра предрелизного аудита: гварда по `kind` не было вовсе.

    Владелец на «проценте» оплачивал счёт за комиссию и тут же возвращал деньги
    кнопкой. Дальше всё складывалось само: `suspension_reason` не считает
    refunded-счёт блокирующим, а начисления (OfflineTransactionFee) уже помечены
    выставленными и во второй счёт не попадут. Итог — деньги вернулись, долг
    исчез, блокировка снята НАВСЕГДА. Бесплатная CRM в один запрос.
    """
    assert _run_refund(_invoice(kind="offline_fee")) == "billing.refund_not_allowed"


def test_owner_cannot_refund_the_minimum_monthly_invoice():
    """Тот же путь через минимальный месячный платёж — он тоже блокирующий."""
    assert _run_refund(_invoice(kind="min_fee")) == "billing.refund_not_allowed"


def test_stale_subscription_invoice_is_out_of_the_self_service_window():
    """Срока давности не было тоже: оплаченный на 24 месяца тариф можно было
    отработать двадцать месяцев и вернуть целиком."""
    from routers.billing.refunds import REFUND_WINDOW_DAYS

    assert _run_refund(_invoice(age_days=REFUND_WINDOW_DAYS + 1)) == "billing.refund_window_passed"


def test_fresh_subscription_invoice_is_still_refundable():
    """Законный возврат обязан продолжать работать — иначе фикс превращается в
    «возврата нет вообще»."""
    assert _run_refund(_invoice(age_days=1)) is None


def test_unpaid_invoice_is_still_rejected_first():
    """Порядок гвардов: неоплаченный счёт отсекается раньше, чем вид и срок."""
    assert _run_refund(_invoice(status="pending")) == "Возврат возможен только для оплаченного счёта"


if __name__ == "__main__":
    for _name, _fn in sorted(globals().items()):
        if _name.startswith("test_"):
            _fn()
    print("ALL PASS")
