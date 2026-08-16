"""Уход с постоплаты на фиксированный тариф — только после расчёта.

Дыра, которую это закрывает. Комиссия с наличных копится весь месяц, а счёт по ней
выставляется уже ПОСЛЕ его конца: в любой день месяца за студией висит долг, на
который ещё нет документа. Переход на чистую подписку стирал его молча — и не
только текущий месяц: минимальный месячный платёж (`_bill_minimum`) берёт лишь тех,
кто на проценте В МОМЕНТ прохода, поэтому месяц, отработанный на проценте и
брошенный 30-го числа, не добирался до минимума вовсе.

Инварианты:
  1. Долгом считается И выставленный неоплаченный счёт, И ещё не выставленные
     начисления. Срок счёта роли не играет: блокировка доступа ждёт due_at, а
     переход на другой тариф ждать не обязан.
  2. Мелочь ниже порога выставления счёта долгом НЕ считается — иначе три цента,
     которые никогда не станут счётом, заперли бы студию на проценте навсегда.
  3. Курса нет — не блокируем: долг недоказуем, а запереть студию из-за
     недоступного справочника курсов хуже, чем недобрать.
  4. Гейт стоит на ОБОИХ входах. `POST /billing/model` — не единственный: режим
     поднимает ОПЛАТА (webhook._apply_paid_mode), то есть купить подписку и уехать
     с процента можно, вообще не трогая тот эндпоинт.
  5. Покупка комбо не блокируется: она процент не отменяет, а продолжает.

Сеть и БД не трогаем.

Запуск из back/:  python -m pytest tests/test_leaving_percent_settles_first.py
"""
import asyncio
import inspect
from types import SimpleNamespace

import services.offline_fee_billing as OFB


# ─── стабы ────────────────────────────────────────────────────────────────────

def _db(*, unpaid_invoice: bool, accrued: list, fx_rows: list):
    """Сессия-заглушка под `has_unsettled_commission`.

    Запросы идут строго по порядку, и отдаём мы их так же: поиск неоплаченного
    счёта (`first`), суммы начислений по валютам (`all`), курсы из БД (`all`).
    Последний — настоящий `_load_fx`: кэш курсов перед каждой проверкой пуст,
    поэтому эта ветка отрабатывает всерьёз, а не подсовывается мимо.
    """
    class _DB:
        def __init__(self):
            self.calls = 0

        async def execute(self, _q):
            self.calls += 1
            rows = accrued if self.calls == 2 else fx_rows
            return SimpleNamespace(
                first=lambda: (1,) if unpaid_invoice else None,
                all=lambda: rows,
            )
    return _DB()


def _check(*, unpaid_invoice=False, accrued=(), fx_rows=()) -> bool:
    saved = dict(OFB._FX)
    OFB._FX.clear()
    try:
        return asyncio.run(OFB.has_unsettled_commission(
            _db(unpaid_invoice=unpaid_invoice, accrued=list(accrued), fx_rows=list(fx_rows)), 7,
        ))
    finally:
        OFB._FX.clear()
        OFB._FX.update(saved)


# ─── 1. обе формы долга ───────────────────────────────────────────────────────

def test_unpaid_invoice_blocks_the_switch():
    """Счёт выставлен и не оплачен — уходить нельзя, даже пока срок не наступил."""
    assert _check(unpaid_invoice=True) is True


def test_accrued_but_not_yet_invoiced_blocks_too():
    """Главный случай: 30-е число, счёта ещё нет, а комиссия за месяц уже набежала.
    Ровно тут переход и стирал долг."""
    # 4500 галержей = 45 CZK, курс 0.04 → 1.80 € — выше порога выставления.
    assert _check(accrued=[("czk", 4500)], fx_rows=[("czk", 0.04)]) is True


def test_nothing_owed_lets_the_studio_leave():
    assert _check() is False
    assert _check(accrued=[("czk", 0)]) is False


def test_refunds_can_cancel_the_debt_out():
    """Возвраты кладут в начисления отрицательные строки (reverse_offline_fee).
    Сумма ушла в ноль или минус — держать студию не за что."""
    assert _check(accrued=[("czk", -4500)], fx_rows=[("czk", 0.04)]) is False


# ─── 2. порог: мелочь не запирает ─────────────────────────────────────────────

def test_dust_below_the_invoice_minimum_is_not_a_debt():
    """3 копейки в кроне — это 0.001 €, счёт на них Stripe не примет никогда.
    Считать их долгом значило бы запереть студию на проценте пожизненно."""
    assert _check(accrued=[("czk", 3)], fx_rows=[("czk", 0.04)]) is False
    # Ровно на пороге (1.00 €) — уже долг.
    assert _check(accrued=[("czk", 2500)], fx_rows=[("czk", 0.04)]) is True
    assert OFB.MIN_INVOICE_AMOUNT == 100


def test_billing_currency_needs_no_rate_at_all():
    """Студия торгует в валюте биллинга — конвертировать нечего."""
    assert _check(accrued=[(OFB.stripe_billing.CURRENCY, 500)]) is True


# ─── 3. неизвестный курс не запирает ──────────────────────────────────────────

def test_unknown_rate_does_not_lock_the_studio_in():
    """`to_billing_currency` вернула None — долг недоказуем. Ошибаемся в пользу
    студии: недобрать хуже, чем запереть её на тарифе из-за чужого справочника."""
    assert _check(accrued=[("pln", 100000)], fx_rows=[]) is False


# ─── 4. гейт на обоих входах ──────────────────────────────────────────────────

def test_both_exits_from_the_percent_model_are_gated():
    """`POST /billing/model` — не единственный выход: режим поднимает ОПЛАТА
    подписки (webhook._apply_paid_mode), то есть уехать с процента можно, вообще
    не трогая тот эндпоинт. Закрыт должен быть и он, и оформление оплаты."""
    from routers.billing.checkout import create_checkout
    from routers.billing.router import activate_model

    for fn in (activate_model, create_checkout):
        src = inspect.getsource(fn)
        assert "has_unsettled_commission" in src, fn.__name__
        assert "COMMISSION_UNSETTLED" in src, fn.__name__


def test_the_refusal_is_worded_once_for_both():
    """Один запрет — один текст: две формулировки читались бы как две разные
    причины, и владелец искал бы вторую кнопку."""
    # import_module, а не `import routers.billing.router`: пакет экспортирует
    # `router` как APIRouter (см. routers/billing/__init__.py), и имя модуля им
    # перекрыто — обычный импорт вернёт объект роутера, а не модуль.
    from importlib import import_module

    checkout = import_module("routers.billing.checkout")
    billing_router = import_module("routers.billing.router")

    assert billing_router.COMMISSION_UNSETTLED is checkout.COMMISSION_UNSETTLED
    assert checkout.COMMISSION_UNSETTLED["code"] == "billing.commission_unsettled"


def test_buying_combo_is_not_blocked():
    """Комбо процент НЕ отменяет — оно его продолжает по половинной ставке.
    Требовать расчёта при переходе процент→комбо значило бы мешать студии
    остаться платящей."""
    src = inspect.getsource(
        __import__("routers.billing.checkout", fromlist=["checkout"]).create_checkout
    )
    assert 'plan.billing_mode in ("percent", "combo") and not combo' in src


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_"):
            fn()
    print("leaving-percent self-check ok")
