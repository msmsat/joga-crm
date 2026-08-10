"""Продление уже оплаченного тарифа: оплатил свой же план — получил ещё N месяцев.

До этого оплата тарифа, который у студии УЖЕ есть, разбиралась как смена тарифа, и
обе ветки вели себя неверно:

  * «перейти сейчас» ставило billing_cycle_anchor="now" — цикл начинался заново, а
    остаток оплаченного периода СГОРАЛ. Студия платила деньги и теряла время;
  * «с начала периода» ставило в расписание переход на тот же самый тариф — денег
    не брало вовсе, зато рисовало «тариф сменится на Pro» тому, кто уже на Pro.

Инварианты, каждый из которых стоит денег той или другой стороне:

  1. Продление НЕ сжигает остаток: купленные месяцы прибавляются к текущему концу
     периода, а не заменяют его.
  2. Срок двигает ТОЛЬКО оплаченный счёт. Выставленный и неоплаченный не даёт ни
     дня — иначе продление раздаёт бесплатное время всем, кто не заплатит.
  3. Продление узнаётся по тарифу, а не по слову фронта: тот же план при живой
     подписке = продление, другой план = смена.
  4. Арифметика месяцев не накапливает лишние сутки на коротких месяцах.

Сеть и БД не трогаем.

Запуск из back/:  python -m pytest tests/test_billing_renewal.py
"""
import asyncio
import inspect
from datetime import datetime
from types import SimpleNamespace

import pytest

import routers.billing.checkout as CO
import routers.billing.webhook as WH


# ------------------------------------------- 1. что считается продлением

def _plan(plan_name="pro", status="active", sub="sub_1", mode="subscription"):
    return SimpleNamespace(
        plan_name=plan_name, status=status, stripe_subscription_id=sub,
        billing_mode=mode, studio_id=7,
    )


def test_same_plan_on_a_live_subscription_is_a_renewal():
    assert CO._is_renewal(_plan("pro"), "pro") is True


def test_another_plan_is_a_change_not_a_renewal():
    """Апгрейд и даунгрейд обязаны идти прежним путём — со сменой Price."""
    assert CO._is_renewal(_plan("pro"), "business") is False
    assert CO._is_renewal(_plan("pro"), "start") is False


def test_without_a_live_subscription_there_is_nothing_to_extend():
    """Первая покупка и мёртвая подписка — обычное оформление, а не продление:
    продлевать нечего, и счёт без подписки ничего бы не сдвинул."""
    assert CO._is_renewal(_plan("pro", status="expired"), "pro") is False
    assert CO._is_renewal(_plan("pro", sub=None), "pro") is False


def test_renewal_is_decided_by_the_server_not_by_the_client():
    """Признак считается из строки плана в нашей БД. Приди он полем в теле запроса,
    фронт мог бы попросить «продление» на чужой тариф и получить его по цене
    своего."""
    src = inspect.getsource(CO._is_renewal)
    assert "plan.plan_name" in src


# ------------------------------------------- 2. срок двигает только оплата

def test_invoice_is_issued_without_touching_the_subscription():
    """Ветка выставления счёта не должна звать ничего, что меняет подписку:
    ни extend_subscription, ни change_subscription_price, ни release_schedule."""
    src = inspect.getsource(CO._renewal_invoice)
    for forbidden in ("extend_subscription", "change_subscription_price", "release_schedule"):
        assert forbidden not in src, f"{forbidden} двигает подписку до оплаты"


def test_extension_happens_on_paid_only():
    """Сдвиг срока живёт в apply_status и только в ветке paid."""
    src = inspect.getsource(WH.apply_status)
    assert "_extend_paid_period" in src
    paid_branch = src.split('if status == "paid":')[-1]
    assert "_extend_paid_period" in paid_branch, "продление вынесено из ветки оплаты"


def test_extension_runs_after_the_commit():
    """Поход в Stripe внутри транзакции держал бы блокировки строк всё время
    запроса, а Stripe бросает вебхук на 20-й секунде и ретраит."""
    src = inspect.getsource(WH.apply_status)
    assert src.index("await db.commit()") < src.index("_extend_paid_period")


def test_renew_months_is_read_from_stripe_metadata():
    """Из метаданных счёта, а не из нашей строки: `period_months` есть у любого
    счёта за тариф, и по нему продление от обычной оплаты не отличить."""
    assert WH._renew_months(SimpleNamespace(
        metadata=SimpleNamespace(renew_months="12"),
    )) == 12
    # Обычный счёт продлением не считается.
    assert WH._renew_months(SimpleNamespace(metadata=SimpleNamespace())) is None
    assert WH._renew_months(SimpleNamespace(metadata=None)) is None
    # Мусор в метаданных не должен ронять обработку уже прошедшего платежа.
    assert WH._renew_months(SimpleNamespace(metadata=SimpleNamespace(renew_months="год"))) is None


# ------------------------------------------- 3. остаток не сгорает

def test_extension_counts_from_the_current_period_end():
    """Ключевой инвариант: месяцы прибавляются к КОНЦУ оплаченного периода, а не к
    сегодняшнему дню. Считать от «сейчас» значит молча съесть остаток."""
    src = inspect.getsource(WH._extend_paid_period)
    assert "_period_end(subscription)" in src
    assert "_add_months(datetime.utcfromtimestamp(current_end)" in src


def test_extension_never_restarts_the_billing_cycle():
    """billing_cycle_anchor="now" — то самое, что сжигало остаток. Проверяем ЧТО
    реально уехало в Stripe, а не текст функции: в докстроке этот параметр как раз
    упомянут — объяснением, почему его здесь нет."""
    import stripe

    import services.stripe_billing as SB

    class _Sub:
        def __getitem__(self, _key):
            return SimpleNamespace(data=[SimpleNamespace(id="si_1")])

    sent = {}
    saved = stripe.Subscription.retrieve, stripe.Subscription.modify
    stripe.Subscription.retrieve = lambda sid, **kw: _Sub()
    stripe.Subscription.modify = lambda sid, **kw: (sent.update(kw), SimpleNamespace(id=sid))[1]
    try:
        asyncio.run(SB.extend_subscription("sub_1", "price_1", 1800000000))
    finally:
        stripe.Subscription.retrieve, stripe.Subscription.modify = saved

    assert "billing_cycle_anchor" not in sent, "цикл начинается заново — остаток сгорит"
    assert sent["trial_end"] == 1800000000
    # Прорация вернула бы студии остаток кредитом вместо того, чтобы его сохранить.
    assert sent["proration_behavior"] == "none"
    assert sent["items"] == [{"id": "si_1", "price": "price_1"}]


def test_extension_failure_does_not_undo_the_payment():
    """Счёт уже оплачен. Исключение отсюда ушло бы наверх 500-м, и Stripe
    заретраил бы уже применённое событие."""
    src = inspect.getsource(WH._extend_paid_period)
    assert "except Exception" in src
    assert "logger.exception" in src
    assert "raise" not in src.split("except Exception")[1]


# ------------------------------------------- 4. арифметика месяцев

def test_months_add_up_across_the_year_boundary():
    assert WH._add_months(datetime(2026, 8, 26), 1) == datetime(2026, 9, 26)
    assert WH._add_months(datetime(2026, 8, 26), 6) == datetime(2027, 2, 26)
    assert WH._add_months(datetime(2026, 8, 26), 12) == datetime(2027, 8, 26)
    assert WH._add_months(datetime(2026, 8, 26), 24) == datetime(2028, 8, 26)
    assert WH._add_months(datetime(2026, 12, 31), 1) == datetime(2027, 1, 31)


def test_short_months_do_not_gift_extra_days():
    """31 января плюс месяц — 28 февраля, а не 3 марта. Иначе каждое продление на
    коротком месяце добавляло бы студии лишние сутки бесплатно."""
    assert WH._add_months(datetime(2026, 1, 31), 1) == datetime(2026, 2, 28)
    assert WH._add_months(datetime(2026, 3, 31), 1) == datetime(2026, 4, 30)
    # Високосный год — 29-е существует, схлопывать не надо.
    assert WH._add_months(datetime(2028, 1, 31), 1) == datetime(2028, 2, 29)


def test_time_of_day_survives_the_shift():
    """Час конца периода задаёт Stripe. Сбросить его в полночь значит подарить или
    отобрать у студии часть суток."""
    assert WH._add_months(datetime(2026, 8, 26, 1, 43, 9), 12) == datetime(2027, 8, 26, 1, 43, 9)


# ------------------------------------------- цена продления — из каталога

def test_renewal_price_comes_from_the_catalog():
    """Сумму считает каталог, а не Price подписки: Price задаёт РЕКУРРЕНТНОЕ
    списание, а тут разовая покупка N месяцев со скидкой периода."""
    src = inspect.getsource(CO._renewal_invoice)
    assert "combo_amount_for if combo else amount_for" in src


def test_combo_renews_at_the_half_price():
    """У комбо фиксированная часть половинная — продление обязано идти по ней,
    иначе студия платит полный тариф за половинный."""
    from routers.billing.plans import amount_for, combo_amount_for

    assert combo_amount_for("pro", 12) * 2 == amount_for("pro", 12)


if __name__ == "__main__":
    import sys
    sys.exit(pytest.main([__file__, "-q"]))
