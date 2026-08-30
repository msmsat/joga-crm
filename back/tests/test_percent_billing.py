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

        def add(self, _row):
            """Начисления только ЛОЖАТСЯ в сессию — коммитит вызывающий."""

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

    src = inspect.getsource(OFB._issue_to_stripe)
    assert "invoice.due_at = datetime.utcnow() + timedelta(days=GRACE_DAYS)" in src


def test_clock_starts_only_when_the_invoice_is_actually_issued():
    """Главная защита от блокировки за невыданный счёт.

    Локальная строка коммитится ДО похода в Stripe, и поход падает — у студии без
    страны в реквизитах Stripe Tax отвечает `customer_tax_location_invalid`. Со
    сроком, проставленным при создании строки, через неделю студию блокировал бы
    счёт, которого она не получала и не может оплатить: письма нет, ссылки нет, а
    начисления уже зарезервированы этой строкой.
    """
    import inspect

    for fn in (OFB._bill, OFB._bill_minimum, OFB._bill_online_fees):
        assert "due_at=None" in inspect.getsource(fn), fn.__name__
        assert "timedelta(days=GRACE_DAYS)" not in inspect.getsource(fn), fn.__name__


def test_reissued_invoice_restarts_the_clock():
    """Не смогли выставить счёт вовремя — студия не должна терять grace-период.

    Срок отсчитывается от МОМЕНТА ВЫДАЧИ, а выдачу повторяет `_finish_pending`, —
    значит удачная досылка сама начинает неделю заново. Отдельной правки срока в
    досылке быть не должно: она проставила бы его и на упавшей попытке.
    """
    import inspect

    assert "utcnow() + timedelta(days=GRACE_DAYS)" in inspect.getsource(OFB._issue_to_stripe)
    assert "invoice.due_at" not in inspect.getsource(OFB._finish_pending)


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
    # Именно ВЫЗОВ, а не любое упоминание: имя функции встречается и в комментариях
    # выше по телу, и тогда тест ловил бы порядок слов в прозе, а не порядок операций.
    stripe_call = src.index("await _issue_to_stripe")
    assert reserve < stripe_call, "счёт уходит в Stripe раньше, чем зарезервированы начисления"


# -------------------------------------------------------------- комбо-цены

def test_combo_costs_exactly_half_on_every_period():
    """Расхождение допустимо ровно на цент округления нечётной суммы, и только
    в пользу студии: 15 € за 3 месяца со скидкой — это 38.25 €, а половины по
    19.13 € в сумме дали бы больше половины."""
    for plan_id in PLANS:
        for months in PERIOD_DISCOUNTS:
            full, half = amount_for(plan_id, months), combo_amount_for(plan_id, months)
            assert full - 1 <= half * 2 <= full, (plan_id, months)


def test_combo_catalog_keys_never_collide():
    keys = {lookup_key(p, m, c) for p in PLANS for m in PERIOD_DISCOUNTS for c in (False, True)}
    assert len(keys) == len(PLANS) * len(PERIOD_DISCOUNTS) * 2
    assert lookup_key("unlimited", 1, True) == "velora_combo_unlimited_1m"
    assert _product_id("unlimited", True) != _product_id("unlimited")


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

    # `idempotency_key` — ключ бизнес-операции «возврат по этому счёту»
    # (routers/billing/refunds): без **kwargs заглушка падала бы TypeError и
    # выдавала «Stripe отклонил возврат» там, где гварды на самом деле пропустили.
    async def _refund(_target, **_kw):
        return None

    SB.refund_target_for_invoice, SB.refund = _target, _refund
    # Ручка под лимитером: зовём распакованную и подсовываем пустой Request —
    # лимит к гвардам возврата отношения не имеет, а без этого тест проверял бы
    # сигнатуру декоратора вместо самих гвардов.
    fn = getattr(R.refund_invoice, "__wrapped__", R.refund_invoice)
    try:
        asyncio.run(fn(SimpleNamespace(), 1, SimpleNamespace(studio_id=7), _db(invoice)))
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


# ------------------------------------- 6. оплата долга не меняет тарифную модель

def _mode_after_paying(kind: str):
    """Что станет с моделью студии, когда счёт вида `kind` придёт оплаченным.

    Подписка у студии висит на обычном (не комбо) Price — то есть Stripe готов
    рассказать про неё «модель = subscription» кому угодно, кто спросит.
    """
    from routers.billing.webhook import _apply_paid_mode

    plan = SimpleNamespace(billing_mode="percent", percent_rate=3.0, fixed_base_amount=None)
    subscription = SimpleNamespace(
        items=SimpleNamespace(data=[SimpleNamespace(
            price=SimpleNamespace(lookup_key=lookup_key("s15", 1)),
        )]),
    )
    _apply_paid_mode(plan, subscription, kind)
    return plan.billing_mode, plan.percent_rate


def test_paying_the_commission_invoice_does_not_switch_the_model_off_percent():
    """Студия закрыла свой же долг — и осталась на том тарифе, за который платит.

    Раньше режим переставлялся по ЛЮБОМУ оплаченному счёту: `offline_fee` читал
    Price висящей подписки, ставил billing_mode=subscription и обнулял ставку.
    Начисления прекращались, а раздел «Комиссия с офлайн-продаж» исчезал.
    """
    assert _mode_after_paying("offline_fee") == ("percent", 3.0)
    assert _mode_after_paying("min_fee") == ("percent", 3.0)
    assert _mode_after_paying("online_fee") == ("percent", 3.0)


def test_paying_the_subscription_still_applies_the_bought_model():
    """Гейт не должен заодно сломать то, ради чего функция существует."""
    assert _mode_after_paying("subscription") == ("subscription", None)


# ------------------------- 7. возврат комиссии не отменяет тариф студии

def _refund_cancels_subscription(kind: str) -> bool:
    """Отменит ли `_handle_refund` подписку студии при полном возврате счёта `kind`."""
    import routers.billing.webhook as WH

    invoice = SimpleNamespace(id=7, studio_id=1, kind=kind, status="paid", stripe_invoice_id="in_1")
    plan = SimpleNamespace(studio_id=1, stripe_subscription_id="sub_1")
    cancelled = []

    class _SeqDB:
        """Обработчик спрашивает БД дважды: сперва счёт, потом строку тарифа.
        Общий `_db` отдаёт один и тот же объект на оба, и до второго запроса
        проверка вида счёта в норме просто не доходит."""

        def __init__(self):
            self._rows = [invoice, plan]

        async def execute(self, _q):
            row = self._rows.pop(0) if self._rows else None
            return SimpleNamespace(scalar_one_or_none=lambda: row)

    async def fake_apply(_db, _inv, _status, **_kw):
        return True

    async def fake_cancel(sub_id):
        cancelled.append(sub_id)

    saved_apply, saved_cancel = WH.apply_status, WH.stripe_billing.cancel_subscription
    WH.apply_status = fake_apply
    WH.stripe_billing.cancel_subscription = fake_cancel
    try:
        # Полный возврат: amount == amount_refunded, иначе ветка вовсе не та.
        charge = SimpleNamespace(
            payment_intent="pi_1", invoice="in_1", amount=3900, amount_refunded=3900,
        )
        asyncio.run(WH._handle_refund(_SeqDB(), charge))
    finally:
        WH.apply_status, WH.stripe_billing.cancel_subscription = saved_apply, saved_cancel
    return bool(cancelled)


def test_refunded_commission_does_not_cancel_the_tariff():
    """Комиссию и минимальный платёж самообслуживание не возвращает вовсе — их
    возвращает поддержка руками из дашборда Stripe, и это штатный путь.

    Прилетает такой возврат тем же `charge.refunded`, что и возврат за тариф. Без
    проверки вида счёта студия за возвращённую ей переплату получала ОТМЕНУ
    ПОДПИСКИ: доступ закрывался в наказание за нашу же ошибку в счёте.
    """
    assert _refund_cancels_subscription("offline_fee") is False
    assert _refund_cancels_subscription("min_fee") is False
    assert _refund_cancels_subscription("online_fee") is False


def test_refunded_subscription_still_cancels_it():
    """Гейт не должен заодно сломать то, ради чего обработчик существует: вернули
    деньги за тариф — тариф заканчивается."""
    assert _refund_cancels_subscription("subscription") is True


# --------------- 8. возврат наличной продажи снимает начисленную комиссию

def _reverse(mode, amount_minor, rate=None, charged=10_000_000):
    """Компенсирующее начисление по возврату: (сумма продажи, сумма комиссии).

    `charged` — сколько комиссии студии начислено за всё время: по нему стоит
    потолок снятия. По умолчанию заведомо много, чтобы обычные проверки его не
    задевали; проверки самого потолка задают его явно.
    """
    plan = SimpleNamespace(studio_id=1, billing_mode=mode, percent_rate=rate)

    class _SeqDB:
        """Сначала спрашивают тариф, потом сумму начисленного — отдаём по порядку."""

        def __init__(self):
            self.calls = 0

        async def execute(self, _q):
            self.calls += 1
            return SimpleNamespace(
                scalar_one_or_none=lambda: plan,
                scalar_one=lambda: charged,
            )

        def add(self, _row):
            """Начисления только ЛОЖАТСЯ в сессию — коммитит вызывающий."""

    row = asyncio.run(PF.reverse_offline_fee(_SeqDB(), 1, amount_minor, "CZK"))
    return None if row is None else (row.sale_amount, row.fee_amount)


def test_cash_refund_takes_the_commission_back():
    """Продали за 5000 наличными (3% = 150), вернули клиенту — комиссии больше нет.

    Наличные Stripe не расщепляет, про их возврат знает только CRM. Без этого
    студия получала счёт за продажу, которой уже не существует.
    """
    assert _reverse("percent", 500000) == (-500000, -15000)
    # Комбо берёт половинную ставку — и снимает ровно её же.
    assert _reverse("combo", 500000) == (-500000, -7500)


def test_subscription_studio_has_nothing_to_reverse():
    """На фиксированной подписке платформа с транзакций не берёт ничего, значит и
    снимать нечего: минусовая строка там завела бы студии долг платформы перед ней."""
    assert _reverse("subscription", 500000) is None
    assert _reverse(None, 500000) is None


def test_reversal_is_a_compensating_row_not_an_edit():
    """Исходное начисление могло уже уехать в выставленный счёт. Минус уменьшает
    БЛИЖАЙШИЙ следующий, а выставленный документ задним числом не переписывается."""
    assert PF.reverse_offline_fee.__doc__ and "КОМПЕНСИРУЮЩЕЙ" in PF.reverse_offline_fee.__doc__
    sale, fee = _reverse("percent", 500000)
    assert sale < 0 and fee < 0, "снятие обязано быть отрицательным, иначе оно добавит долг"


def test_refund_cannot_give_back_more_than_was_ever_charged():
    """Потолок снятия. Категорию расхода владелец вписывает руками, а сумму
    придумывает сам: без потолка «возврат» на 100 000 уменьшал счёт на 3 000, и
    ничто не сверяло, что за ним стоит реальная продажа.

    Снять можно не больше, чем начислено за всё время. Пожизненный минус означал
    бы, что платформа доплачивает студии за её собственные возвраты.
    """
    # Начислено 150 (одна продажа на 5000), «возвращают» 100 000 — снимается 150.
    sale, fee = _reverse("percent", 10_000_000, charged=15000)
    assert fee == -15000
    # Сумма продажи в строке обрезана в ту же пропорцию: иначе в разборе окажется
    # возврат на 100 000 с комиссией 150 и «ставкой» 0,15 %.
    assert sale == -500000

    # Не начислено ничего — снимать нечего вовсе, строки не будет.
    assert _reverse("percent", 500000, charged=0) is None
    assert _reverse("percent", 500000, charged=-100) is None


def test_refund_within_the_ceiling_is_untouched():
    """Обратная сторона: честный возврат обрезаться не должен."""
    assert _reverse("percent", 500000, charged=15000) == (-500000, -15000)


def test_refund_category_is_matched_case_and_wording_insensitively():
    """Поле «Категория» — свободный текст. Сравнение буква-в-букву означало, что
    «возвраты» с маленькой или английское «Refund» комиссию НЕ снимают: студия
    вернула деньги и продолжает платить 3 % с продажи, которой нет."""
    for value in ("Возвраты", "возвраты", "  ВОЗВРАТЫ ", "Возврат", "Refund", "refunds"):
        assert PF.is_refund_category(value), value


def test_unrelated_expenses_are_not_refunds():
    """Набор написаний, а не вхождение подстроки: «Возврат поставщику» — расход в
    пользу контрагента, комиссию по нему снимать не за что."""
    for value in ("Возврат поставщику", "Аренда", "Зарплата", "", None, "возвратный лизинг"):
        assert not PF.is_refund_category(value), value


def test_card_refunds_do_not_double_reverse():
    """Возврат по карте откатывает вебхук Stripe (_revert_sale) — там своя ветка со
    снятием доли из леджера. Второе снятие здесь было бы двойным."""
    import inspect
    from routers.finances import operations

    src_op = inspect.getsource(operations._apply_platform_fee)
    assert "platform_fee.is_refund_category" in src_op
    assert "platform_fee.ONLINE_METHOD" in src_op, "онлайн-возвраты не исключены"


def test_manual_income_is_charged_like_any_other_sale():
    """Доход, заведённый руками в Финансах, — те же деньги студии, что и продажа
    через кассу, и облагается так же.

    Пока начисления здесь не было, процентный тариф обходился в один клик: провести
    оплату занятия не кассой, а операцией «доход» — и комиссии нет, при том что
    абонемент, разовое, сертификат и депозит её платят.
    """
    import inspect
    from routers.finances import operations

    src = inspect.getsource(operations._apply_platform_fee)
    assert "platform_fee.record_offline_fee" in src, "ручной доход снова мимо комиссии"
    # Обе стороны обязаны жить в одной функции и исключать онлайн одинаково:
    # разъехавшись, они дадут либо двойное начисление, либо двойное снятие.
    assert "platform_fee.reverse_offline_fee" in src
    assert src.count("platform_fee.ONLINE_METHOD") == 1

    # И зовётся она из ВСЕХ трёх ручек: правка и удаление, оставленные без неё,
    # превращали начисление в необязательное — достаточно было завести операцию,
    # а потом переписать сумму или убрать её вовсе.
    for fn in (operations.create_operation, operations.update_operation, operations.delete_operation):
        assert "_apply_platform_fee" in inspect.getsource(fn), fn.__name__
    for fn in (operations.update_operation, operations.delete_operation):
        assert "undo=True" in inspect.getsource(fn), fn.__name__


# ------------------------- 9. VIES: реестр молчит — не отказываем, но и не врём

def test_vat_format_is_checked_before_the_registry():
    """Опечатку отсекаем ДО сети: поход в реестр за заведомо кривым номером —
    лишние 10 секунд ожидания в форме и лишняя нагрузка на чужой сервис."""
    from services import vies

    assert vies.format_ok("DE", "DE811907980")
    assert not vies.format_ok("DE", "DE8119079")
    assert not vies.format_ok("NL", "NL004495445X01")


def test_unverified_number_never_reaches_stripe():
    """ГЛАВНЫЙ инвариант сценария: номер, который никто не сверял, в Stripe не
    уезжает. Уехал бы — Stripe Tax обнулил бы НДС по формату, а недобор налога
    сняли бы с ПЛАТФОРМЫ. Поэтому такому плательщику идёт полный НДС."""
    import inspect
    from routers.billing import checkout

    src_ensure = inspect.getsource(checkout._ensure_customer)
    assert "profile.vat_verified" in src_ensure, "неподтверждённый номер уезжает в Stripe"


def test_silent_registry_does_not_reject_the_payer():
    """Узел отдельной страны ЕС лежит регулярно. Отказывать из-за этого нельзя:
    номер сохраняется неподтверждённым, а не теряется вместе с покупателем."""
    import inspect
    from routers.billing.router import save_billing_profile

    src_save = inspect.getsource(save_billing_profile)
    assert "vat_bad_format" in src_save and "vat_invalid" in src_save
    assert "vat_unavailable" not in src_save, "отказ по молчащему реестру вернулся"
    assert "verified = valid is True" in src_save


def test_health_pool_is_several_countries():
    """Одна проба означала бы «прод закрыт в день техработ у чужой страны»."""
    from services import vies

    assert len(vies.HEALTH_PROBES) >= 3
    assert set(vies.HEALTH_PROBES) <= vies.EU_VAT_COUNTRIES


def test_unverified_numbers_get_rechecked_in_the_background():
    """Без досверки компания переплачивала бы НДС до тех пор, пока не догадается
    открыть форму и нажать «Сохранить» ещё раз."""
    import inspect
    from routers.billing import webhook as WH
    import services.offline_fee_billing as OFB

    assert "billing_vat_verified" in inspect.getsource(WH.recheck_vat_numbers)
    assert "recheck_vat_numbers" in inspect.getsource(OFB._run_billing_pass)


# ------------------------------ 10. курс валют переживает падение провайдера

def test_rate_lives_in_the_db_not_in_a_temp_file():
    """Файл во временном каталоге контейнера стирается при перезапуске: после него
    в день, когда ЕЦБ недоступен, курса не оставалось вовсе — и комиссии студий,
    торгующих не в валюте биллинга, не попадали в счёт."""
    import services.offline_fee_billing as OFB

    assert hasattr(OFB, "_load_fx") and hasattr(OFB, "_save_fx")
    assert not hasattr(OFB, "_FX_CACHE_PATH"), "файловый кэш вернулся"


def test_missing_rate_still_defers_instead_of_charging_zero():
    """Курса нет вообще (первый запуск, пустая таблица) — счёт откладывается.
    Посчитать по нулю значило бы молча подарить студии комиссию."""
    import services.offline_fee_billing as OFB

    saved = dict(OFB._FX)
    OFB._FX.clear()
    try:
        assert OFB.to_billing_currency(4500, "czk") is None
    finally:
        OFB._FX.update(saved)


if __name__ == "__main__":
    for _name, _fn in sorted(globals().items()):
        if _name.startswith("test_"):
            _fn()
    print("ALL PASS")
