"""Минимальный месячный платёж тарифа «только процент» + исход чарджбэка.

Инварианты, каждый из которых стоит платформе выручки или студии — доступа:

  1. Месяц, в котором платформа заработала на percent-студии меньше минимума,
     добирается счётом на РАЗНИЦУ. Без этого тариф «процент» был бессрочной
     бесплатной CRM для студии, которая не проводит продажи.
  2. Заработали больше минимума — счёта нет вовсе.
  3. Порог не обходится одной копеечной продажей (считаем разницу, а не «строго ноль»).
  4. Минимум выставляется ТОЛЬКО на percent: у комбо и подписки фикс уже берётся
     подпиской, второй раз брать нельзя.
  5. За один месяц счёт нельзя выставить дважды.
  6. Просроченный минимум блокирует так же, как комиссия, но объясняется ДРУГИМ
     текстом: у студии не было продаж, и «оплатите комиссию с продаж» её запутает.
  7. Исход спора закрывает заявку: выигранный возвращает в paid, проигранный
     откатывает продажу.

Сеть и БД не трогаем.

Запуск из back/:  python -m pytest tests/test_min_monthly_fee.py
"""
import asyncio
import inspect
from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest

import dependencies as D
import services.offline_fee_billing as OFB
import services.platform_fee as PF
from routers.billing.plans import MIN_MONTHLY_FEE, PLANS


# ------------------------------------------------------------ 1. сумма минимума

def test_minimum_is_the_cheapest_plan():
    """15 € — месяц нижней ступени (2 места). Плоский для всех: percent-студия
    после триала числится на средней ступени, и брать с неё её цену за пустой
    месяц несоразмерно."""
    assert MIN_MONTHLY_FEE == PLANS["s2"]["price"] == 1500


def test_minimum_never_exceeds_the_cheapest_subscription():
    """Иначе «процент» в пустой месяц дороже подписки, и тариф теряет смысл."""
    assert MIN_MONTHLY_FEE <= min(p["price"] for p in PLANS.values())


# ------------------------------------------------- 2. добор разницы, а не порога

def _shortfall(revenue: int) -> int:
    """Та же арифметика, что в _bill_minimum: счёт = минимум − заработанное."""
    return MIN_MONTHLY_FEE - revenue


def test_empty_month_is_billed_in_full():
    assert _shortfall(0) == 1500


def test_partial_month_is_topped_up_to_the_minimum():
    """Заработали 12 € → счёт на 3 €, а не на все 15 и не на ноль."""
    assert _shortfall(1200) == 300


def test_one_cent_sale_does_not_cancel_the_minimum():
    """Главная причина считать разницу, а не «строго ноль»: порог по нулю
    обходился бы одной продажей на копейку."""
    assert _shortfall(1) == 1499
    assert _shortfall(1) >= OFB.MIN_INVOICE_AMOUNT, "счёт обязан выставиться"


def test_month_above_the_minimum_is_not_billed():
    """Заработали больше — счёта нет: shortfall уходит ниже порога Stripe."""
    for revenue in (MIN_MONTHLY_FEE, MIN_MONTHLY_FEE + 1, 15000):
        assert _shortfall(revenue) < OFB.MIN_INVOICE_AMOUNT, revenue


def test_near_minimum_shortfall_is_skipped_not_sent_as_dust():
    """Не добрали 50 центов — счёт не выставляем: Stripe отвергает платёж ниже
    минимального, а банковская комиссия съела бы остаток."""
    assert _shortfall(MIN_MONTHLY_FEE - 50) < OFB.MIN_INVOICE_AMOUNT


# ------------------------------------------------------ 3. только на «проценте»

def _db(plan, *, existing=None):
    """Фейк сессии: scalar_one_or_none отдаёт план, first() — наличие счёта."""
    class _DB:
        async def execute(self, _q):
            return SimpleNamespace(
                scalar_one_or_none=lambda: plan,
                first=lambda: existing,
                all=lambda: [],
                scalar=lambda: 0,
            )
    return _DB()


_MONTH = datetime(2026, 7, 1)
_NEXT = datetime(2026, 8, 1)


class _Plan:
    def __init__(self, billing_mode, customer="cus_1", since=_MONTH - timedelta(days=1)):
        self.studio_id = 7
        self.billing_mode = billing_mode
        self.stripe_customer_id = customer
        # Когда студия согласилась на постоплату, то есть с какого момента она на
        # проценте. По умолчанию — до начала расчётного месяца: месяц её.
        self.percent_terms_accepted_at = since


def _run_min(plan, existing=None):
    return asyncio.run(OFB._bill_minimum(_db(plan, existing=existing), 7, _MONTH, _NEXT))


def test_combo_studio_is_never_billed_the_minimum():
    """У комбо фиксированная часть уже берётся подпиской — второй раз нельзя."""
    assert _run_min(_Plan("combo")) is None


def test_subscription_studio_is_never_billed_the_minimum():
    assert _run_min(_Plan("subscription")) is None


def test_studio_without_a_plan_row_is_skipped():
    assert _run_min(None) is None


def test_a_month_spent_on_another_model_is_not_billed():
    """ЖАЛОБА 14.08.2026: «за что 39 €, я просто нажал кнопку». Проход берёт всех,
    кто на проценте В МОМЕНТ ПРОХОДА, и выставляет счёт за ЗАКРЫТЫЙ месяц — студия,
    перешедшая 14 августа, получала минимум за ИЮЛЬ, который целиком провела на
    подписке и уже оплатила."""
    assert _run_min(_Plan("percent", since=datetime(2026, 8, 14))) is None
    # Неполный первый месяц тоже не добираем: переход 20 июля → июль не наш.
    assert _run_min(_Plan("percent", since=datetime(2026, 7, 20))) is None
    # Согласия нет вовсе (легаси-строка) — брать не за что.
    assert _run_min(_Plan("percent", since=None)) is None


def test_a_full_month_on_percent_is_still_billed(monkeypatch):
    """Обратная сторона: студия на проценте с июня обязана получить счёт за июль,
    иначе тариф снова становится бесплатной CRM. Дальше по функции идёт Stripe —
    ловим её маркером на входе в него: важно, что проверка согласия пропустила."""
    async def no_fx(_db):
        """Курс теперь читается из БД, поэтому стаб принимает сессию."""

    async def marker(*_a, **_kw):
        raise RuntimeError("дошли до Stripe")

    monkeypatch.setattr(OFB, "_refresh_fx", no_fx)
    monkeypatch.setattr(OFB, "_ensure_studio_customer", marker)
    with pytest.raises(RuntimeError, match="дошли до Stripe"):
        _run_min(_Plan("percent", since=datetime(2026, 6, 15)))


def test_same_month_is_never_billed_twice():
    """Воркер самовосстанавливается и догоняет пропущенные запуски — без этой
    проверки догоняющий проход выставил бы второй счёт за тот же месяц."""
    assert _run_min(_Plan("percent"), existing=(1,)) is None


def test_period_is_unique_per_studio_and_kind_in_the_schema():
    """Проверка в коде экономит поход в Stripe, но гарантию даёт индекс:
    два процесса могут пройти проверку одновременно."""
    from models import BillingInvoice

    names = {c.name for c in BillingInvoice.__table__.constraints}
    assert "uq_billing_invoice_period" in names


def test_period_label_is_the_closed_month_not_the_billing_month():
    """Счёт выставляется 1-го числа за ПРОШЛЫЙ месяц. Подписать его текущим значит
    и соврать в фактуре, и разъехаться с ключом уникальности."""
    cutoff = OFB.month_start(datetime(2026, 8, 1, 3, 0))
    assert OFB.period_label(OFB.prev_month_start(cutoff)) == "2026-07"
    # Переход через январь — обычная ловушка ручной арифметики месяцев.
    assert OFB.period_label(OFB.prev_month_start(datetime(2026, 1, 1))) == "2025-12"


# ------------------------------------------------------------- 4. блокировка

def test_minimum_blocks_access_like_the_commission_invoice():
    assert "min_fee" in PF.SUSPENDING_KINDS
    assert "offline_fee" in PF.SUSPENDING_KINDS


def test_block_reason_has_its_own_wording():
    """«Оплатите комиссию с офлайн-продаж» студии без продаж ничего не объясняет."""
    commission = D.suspended_detail("offline_fee")["message"]
    minimum = D.suspended_detail("min_fee")["message"]
    assert commission != minimum
    assert "минимальный месячный платёж" in minimum.lower()
    # Код один: фронт ловит его глобально и ведёт в раздел оплаты.
    assert D.suspended_detail("min_fee")["code"] == D.suspended_detail("offline_fee")["code"] == "billing.suspended"


def test_unknown_reason_falls_back_to_the_commission_text():
    """Новый вид счёта не должен ронять гейт на KeyError."""
    assert D.suspended_detail(None) is D.SUSPENDED_DETAIL
    assert D.suspended_detail("что-то новое") is D.SUSPENDED_DETAIL


def test_consent_version_was_raised_with_the_new_obligation():
    """Минимум — НОВОЕ денежное обязательство. Согласия, данные до него, его не
    покрывают, поэтому версия текста обязана отличаться от прежней."""
    from routers.billing.router import OFFLINE_TERMS

    assert OFFLINE_TERMS["version"] != "2026-08-1", "версию согласия не подняли"
    assert OFFLINE_TERMS["min_monthly"] == MIN_MONTHLY_FEE
    # Срок в согласии и срок блокировки — одно и то же число.
    assert OFFLINE_TERMS["grace_days"] == OFB.GRACE_DAYS


def test_reaccepting_the_terms_does_not_move_the_anchor():
    """Отметку `percent_terms_accepted_at` двигает только ВХОД в режим.

    По ней `_bill_minimum` решает, прожила ли студия расчётный месяц на проценте
    (`since >= start` → месяц не наш). Пока отметка обновлялась на КАЖДОЕ
    подтверждение условий, повторное нажатие «процент» раз в месяц — запрос
    проходит, режим тот же, флаг согласия стоит — сдвигало её в текущий месяц, и
    минимум не выставлялся НИКОГДА.
    """
    from routers.billing.router import activate_model

    src = inspect.getsource(activate_model)
    stamp = "row.percent_terms_accepted_at = datetime.utcnow()"
    assert stamp in src
    guard = src.index("if previous_mode != body.mode or row.percent_terms_accepted_at is None:")
    assert guard < src.index(stamp), "отметка ставится в обход проверки входа в режим"
    # Режим «до» обязан читаться ДО того, как тело запроса его перезапишет.
    assert src.index("previous_mode = row.billing_mode") < src.index("row.billing_mode = body.mode")


def test_percent_requires_billing_details_up_front():
    """Счёт за комиссию и минимум выставляем МЫ, с automatic_tax. Клиент Stripe без
    страны роняет такой счёт целиком (`customer_tax_location_invalid`), а онбординг
    адрес не спрашивает — значит реквизиты нужны в момент ВКЛЮЧЕНИЯ постоплаты,
    иначе тариф оказывается неоплачиваемым, а с ноября 2026 ещё и блокирующим.
    """
    from routers.billing.router import activate_model

    src = inspect.getsource(activate_model)
    assert "billing.billing_profile_required" in src
    assert "billing_profile(ctx.user).filled" in src


def test_catalog_exposes_the_minimum_to_the_frontend():
    """Модалка согласия называет конкретную сумму. Хардкод на фронте разъехался бы
    с сервером — и владелец подтвердил бы не ту цифру, по которой ему выставят счёт."""
    from schemas.settings.billing import PlansCatalogRead

    assert "min_monthly" in PlansCatalogRead.model_fields


# --------------------------------------------------------- 5. исход чарджбэка

def test_dispute_closed_is_handled_at_all():
    """Раньше на это событие не подписывались, и заявка навсегда висела в disputed."""
    import routers.checkout.stripe_pay as SP

    assert SP._DISPUTE_CLOSED_EVENT == "charge.dispute.closed"
    src = inspect.getsource(SP.stripe_webhook)
    assert "_DISPUTE_CLOSED_EVENT" in src


def test_only_final_dispute_statuses_move_the_sale():
    """Промежуточные статусы спора (`warning_*`, `under_review`) продажу не трогают:
    погасить абонемент клиенту, который спор ещё не проиграл, значит отобрать оплаченное."""
    import routers.checkout.stripe_pay as SP

    src = inspect.getsource(SP._close_dispute)
    assert 'status not in ("won", "lost")' in src


def _run_dispute(status, checkout):
    """Гоняет _close_dispute с заглушками Stripe и БД → изменённая заявка."""
    import routers.checkout.stripe_pay as SP

    class _DB:
        async def execute(self, _q):
            return SimpleNamespace(scalar_one_or_none=lambda: checkout)

        async def commit(self):
            pass

        def add(self, _x):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_a):
            return False

    reverted = []

    async def fake_session_id(_pi, _acct):
        return "cs_1"

    # charge_id — третьим аргументом: по нему _revert_sale спрашивает у Stripe,
    # вернулась ли удержанная доля платформы (_reverse_platform_fee).
    async def fake_revert(_db, ch, _charge_id=None):
        reverted.append(ch)

    saved = (SP.async_session_maker, SP.stripe_connect.session_id_for_payment_intent,
             SP._revert_sale, SP.log_activity)
    SP.async_session_maker = lambda: _DB()
    SP.stripe_connect.session_id_for_payment_intent = fake_session_id
    SP._revert_sale = fake_revert
    SP.log_activity = lambda *a, **kw: None
    try:
        asyncio.run(SP._close_dispute(
            SimpleNamespace(status=status, payment_intent="pi_1"), "acct_1",
        ))
    finally:
        (SP.async_session_maker, SP.stripe_connect.session_id_for_payment_intent,
         SP._revert_sale, SP.log_activity) = saved
    return reverted


def _checkout():
    return SimpleNamespace(
        status="disputed", amount=1500, studio_id=7,
        payload={"client_id": 1}, subscription_id=None,
    )


def test_won_dispute_returns_the_sale_to_paid():
    """Деньги остались у студии — заявка обязана перестать выглядеть проблемной."""
    checkout = _checkout()
    reverted = _run_dispute("won", checkout)
    assert checkout.status == "paid"
    assert reverted == [], "выигранный спор не должен откатывать продажу"


def test_lost_dispute_reverts_the_sale():
    """Деньги ушли клиенту — абонемент не может остаться действующим."""
    checkout = _checkout()
    reverted = _run_dispute("lost", checkout)
    assert checkout.status == "chargeback"
    assert reverted == [checkout]


def test_pending_dispute_leaves_everything_alone():
    checkout = _checkout()
    reverted = _run_dispute("under_review", checkout)
    assert checkout.status == "disputed"
    assert reverted == []


if __name__ == "__main__":
    import sys
    sys.exit(pytest.main([__file__, "-q"]))
