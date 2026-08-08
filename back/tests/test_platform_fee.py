"""Расщепление платежа: доля платформы удерживается на тарифах «процент»/«комбо».

Проверяется вся цепочка, а не только арифметика:
  тариф студии в БД → platform_fee → application_fee_amount в запросе к Stripe.

Разрыв в любом звене стоит платформе всей выручки с транзакций, а ошибка в другую
сторону снимает со студии чужие деньги — поэтому тут же и обратная проверка: на
подписке в запрос не должно уехать НИ application_fee_amount, ни лишних полей.

Сеть не трогаем: stripe.checkout.Session.create подменяется и только записывает,
с какими аргументами его позвали.

Запуск из back/:  python -m tests.test_platform_fee
"""
import asyncio
from types import SimpleNamespace

import services.platform_fee as PF
import services.stripe_connect as SC


class _Plan:
    def __init__(self, billing_mode, percent_rate=None):
        self.billing_mode = billing_mode
        self.percent_rate = percent_rate


class _DB:
    """Отдаёт один тариф студии на любой select. None = строки тарифа нет."""

    def __init__(self, plan):
        self._plan = plan

    async def execute(self, _query):
        return SimpleNamespace(scalar_one_or_none=lambda: self._plan)


def _fee(plan, amount_minor=150000):
    return asyncio.run(PF.fee_for_studio(_DB(plan), 7, amount_minor))


# ---------------------------------------------------------------- расчёт доли

def test_subscription_plan_pays_no_transaction_fee():
    """Фикс-подписка: Velora зарабатывает тарифом, с транзакций студии не берёт."""
    assert _fee(_Plan("subscription")) == 0


def test_percent_plan_withholds_catalog_rate():
    """3% с 1500.00 = 45.00 (в младших единицах)."""
    assert _fee(_Plan("percent", 3.0)) == 4500


def test_combo_plan_withholds_half_rate():
    """Комбо берёт 1.5%: остальное платформа получает фиксированной частью."""
    assert _fee(_Plan("combo", 1.5)) == 2250


def test_missing_rate_falls_back_to_catalog():
    """Режим есть, ставка пустая — считаем по каталогу.

    Дрейф данных (миграция проставила режим, но не ставку) не должен молча
    превращаться в бесплатный приём платежей.
    """
    assert _fee(_Plan("percent", None)) == 4500
    assert _fee(_Plan("combo", None)) == 2250


def test_studio_without_plan_row_pays_nothing():
    """До онбординга строки тарифа нет — снимать чужие деньги не с чего."""
    assert _fee(None) == 0


def test_fee_never_exceeds_the_payment():
    """Опечатка в ставке не должна ронять оплату студии целиком.

    application_fee_amount > суммы платежа — это 400 от Stripe, то есть клиент
    просто не сможет заплатить. Недобрать комиссию безопаснее.
    """
    assert PF.fee_amount("percent", 150.0, 10000) == 10000


# --------------------------------------------------- проброс в запрос к Stripe

def _capture_session_create(monkey_result):
    """Подменяет stripe.checkout.Session.create; возвращает список вызовов."""
    calls = []

    def fake_create(**kwargs):
        calls.append(kwargs)
        return monkey_result

    SC.stripe.checkout.Session.create = fake_create
    return calls


def _hosted(**extra):
    """Сессия мини-приложения с подменённым Stripe → аргументы запроса."""
    calls = _capture_session_create(SimpleNamespace(id="cs_1", url="https://pay"))
    asyncio.run(SC.create_hosted_checkout_session(
        account_id="acct_studio", amount_minor=150000, currency="CZK",
        description="Абонемент", metadata={}, success_url="s", cancel_url="c",
        **extra,
    ))
    return calls[0]


def test_percent_plan_sends_application_fee_to_stripe():
    """Доля платформы реально уезжает в запрос, а не теряется по дороге."""
    kwargs = _hosted(application_fee_minor=4500)
    assert kwargs["payment_intent_data"]["application_fee_amount"] == 4500


def test_money_still_goes_to_the_connected_account():
    """stripe_account обязателен: без него платёж сядет на аккаунт платформы.

    Комиссия оседает у платформы именно как application_fee, а не тем, что мы
    забрали весь платёж себе.
    """
    kwargs = _hosted(application_fee_minor=4500)
    assert kwargs["stripe_account"] == "acct_studio"
    assert kwargs["line_items"][0]["price_data"]["unit_amount"] == 150000, (
        "клиент платит полную цену — расщепление не уменьшает сумму платежа"
    )


def test_subscription_plan_sends_no_payment_intent_data():
    """Ноль комиссии и нет почты — payment_intent_data вообще не передаётся."""
    assert "payment_intent_data" not in _hosted()
    assert "payment_intent_data" not in _hosted(application_fee_minor=0)


def test_receipt_email_is_passed_for_stripe_to_send_receipt():
    """Чек клиенту шлёт Stripe — нам достаточно отдать ему почту."""
    kwargs = _hosted(receipt_email="client@example.com")
    assert kwargs["payment_intent_data"]["receipt_email"] == "client@example.com"


def test_client_without_email_still_can_pay():
    """Почты нет (вход по Telegram) — оплата проходит, просто без чека."""
    kwargs = _hosted(application_fee_minor=4500, receipt_email=None)
    assert "receipt_email" not in kwargs["payment_intent_data"]
    assert kwargs["payment_intent_data"]["application_fee_amount"] == 4500


def test_crm_counter_withholds_the_same_fee():
    """Касса CRM — тот же приём денег на аккаунт студии, что и мини-приложение.

    Без комиссии здесь студия на тарифе «процент» проводила бы продажи через
    кассу и не платила бы платформе ничего.
    """
    calls = _capture_session_create(SimpleNamespace(id="cs_2", client_secret="sec"))
    asyncio.run(SC.create_checkout_session(
        account_id="acct_studio", amount_minor=150000, currency="CZK",
        description="Абонемент", metadata={},
        application_fee_minor=4500, receipt_email="client@example.com",
    ))
    assert calls[0]["payment_intent_data"] == {
        "application_fee_amount": 4500, "receipt_email": "client@example.com",
    }
    assert calls[0]["stripe_account"] == "acct_studio"


if __name__ == "__main__":
    _saved = SC.stripe.checkout.Session.create
    try:
        test_subscription_plan_pays_no_transaction_fee()
        test_percent_plan_withholds_catalog_rate()
        test_combo_plan_withholds_half_rate()
        test_missing_rate_falls_back_to_catalog()
        test_studio_without_plan_row_pays_nothing()
        test_fee_never_exceeds_the_payment()
        test_percent_plan_sends_application_fee_to_stripe()
        test_money_still_goes_to_the_connected_account()
        test_subscription_plan_sends_no_payment_intent_data()
        test_receipt_email_is_passed_for_stripe_to_send_receipt()
        test_client_without_email_still_can_pay()
        test_crm_counter_withholds_the_same_fee()
    finally:
        SC.stripe.checkout.Session.create = _saved
    print("ALL PASS")
