"""Момент вступления апгрейда в силу + отказ от шага реквизитов на карточной ветке.

Правило продукта: апгрейд (Старт → Pro/Business) по умолчанию начинается с КОНЦА
текущего оплаченного периода — студия доигрывает то, за что заплатила. Немедленный
переход возможен, но остаток СГОРАЕТ, и это отдельная кнопка с предупреждением.

Инварианты, которые тут защищаются:
  1. По умолчанию — отложенно. Забытый параметр не должен сжигать деньги студии.
  2. Отложенный путь НЕ трогает метод оплаты: студия, платящая переводом, не должна
     молча оказаться на автосписании с карты.
  3. Отложенный путь НЕ поднимает ступень тарифа в БД — её поднимает только
     оплаченный счёт новой фазы.
  4. Немедленный путь сжигает остаток ЯВНО: proration_behavior="none" +
     billing_cycle_anchor="now". Без anchor'а студия получила бы тариф выше бесплатно
     до конца периода; с прорацией — остаток вернулся бы кредитом, чего продукт
     не обещает.
  5. Перед немедленным переходом снимается ранее выставленное расписание, иначе
     Stripe откажется менять подписку.
  6. Обе ветки оплаты (карта и перевод) ведут себя одинаково — иначе предупреждение
     в интерфейсе враньё для одной из них.

Сеть и БД не трогаем.

Запуск из back/:  python -m pytest tests/test_upgrade_timing.py
"""
import inspect

import pytest

from schemas.settings.billing import CheckoutRequest


# ------------------------------------------------------ 1. дефолт — отложенно

def test_apply_defaults_to_period_end():
    """Забытый параметр обязан означать «ничего не сжигать»."""
    assert CheckoutRequest(plan="pro", period_months=1).apply == "period_end"


def test_apply_accepts_only_the_two_known_values():
    for value in ("period_end", "now"):
        assert CheckoutRequest(plan="pro", period_months=1, apply=value).apply == value
    with pytest.raises(ValueError):
        CheckoutRequest(plan="pro", period_months=1, apply="whenever")


def test_response_carries_the_scheduled_flag():
    """Фронт по нему решает, вести ли владельца на оплату: при отложенном переходе
    платить сейчас не за что, и редирект на Stripe был бы тупиком."""
    from schemas.settings.billing import CheckoutResponse

    assert CheckoutResponse(checkout_url="/x").scheduled is False
    res = CheckoutResponse(checkout_url="/x", scheduled=True, applies_at="2026-09-01T00:00:00")
    assert res.scheduled is True and res.applies_at


# ------------------------------------- 2-3. отложенный путь ничего не ломает

def _card_src():
    from routers.billing.checkout import create_checkout

    return inspect.getsource(create_checkout)


def _scheduled_branch() -> str:
    """Тело ветки apply == "period_end" — до немедленной ветки."""
    src = _card_src()
    start = src.index('if body.apply == "period_end":')
    return src[start:src.index("release_schedule", start)]


def test_scheduled_branch_does_not_touch_the_payment_method():
    """Студия, платящая переводом, не должна оказаться на автосписании с карты
    только потому, что выбрала будущий тариф."""
    assert "set_collection_method" not in _scheduled_branch()


def test_scheduled_branch_does_not_raise_the_tier_in_db():
    """Ступень доступа поднимает ТОЛЬКО оплаченный счёт (webhook._activate).
    Поднять её здесь значит отдать Business до того, как за него заплатили."""
    branch = _scheduled_branch()
    assert "plan.plan_name" not in branch
    # Пишет только справочные поля подписи в интерфейсе.
    assert "plan.scheduled_plan = body.plan" in branch


def test_scheduled_change_is_cleared_when_it_arrives():
    """Наступивший апгрейд обязан снять подпись «сменится с …», иначе она висит вечно."""
    from routers.billing.webhook import _activate

    src = inspect.getsource(_activate)
    assert "plan.scheduled_plan = None" in src
    # Сверка с именем оплаченного счёта: посторонний счёт не должен гасить
    # ещё не наступившую смену.
    assert "plan.scheduled_plan == invoice.plan_name" in src


# ------------------------------------------- 4-5. немедленный путь сжигает явно

def test_immediate_switch_burns_the_remainder_in_both_branches():
    """Оба способа оплаты обязаны сжигать одинаково — предупреждение одно на двоих."""
    from routers.billing.checkout import create_checkout, create_iban_checkout

    for func in (create_checkout, create_iban_checkout):
        src = inspect.getsource(func)
        assert 'proration_behavior="none"' in src, func.__name__
        # Без anchor'а Stripe не выставит счёт сразу, и студия получила бы тариф
        # выше бесплатно до конца текущего периода.
        assert 'billing_cycle_anchor="now"' in src, func.__name__


def test_immediate_switch_releases_a_pending_schedule_first():
    """Подписку под расписанием Stripe менять отказывается. Сценарий живой: студия
    запланировала переход, потом передумала и нажала «перейти сейчас»."""
    from routers.billing.checkout import create_checkout, create_iban_checkout

    for func in (create_checkout, create_iban_checkout):
        src = inspect.getsource(func)
        assert "release_schedule" in src, func.__name__


def test_billing_cycle_anchor_reaches_stripe():
    """Параметр обязан доезжать до Subscription.modify, а не оседать в сигнатуре."""
    from services.stripe_billing import change_subscription_price

    src = inspect.getsource(change_subscription_price)
    assert 'params["billing_cycle_anchor"] = billing_cycle_anchor' in src


def test_schedule_replaces_the_tail_instead_of_queueing_plans():
    """У подписки с ранее запланированной сменой фаз уже две. Дописать третью значит
    выстроить очередь тарифов вместо замены последнего решения владельца."""
    from services.stripe_billing import schedule_price_change

    src = inspect.getsource(schedule_price_change)
    assert "current = phases[0]" in src
    # Ровно две фазы уезжают обратно: текущая и новая.
    assert 'end_behavior="release"' in src


def test_schedule_carries_metadata_to_the_new_phase():
    """Метаданные фазы Stripe переносит в подписку при входе в неё, оттуда их читает
    счёт, а из счёта — webhook._activate. Без них продление вернёт прежнюю ступень."""
    from services.stripe_billing import schedule_price_change

    src = inspect.getsource(schedule_price_change)
    assert '"metadata": metadata' in src


def test_phase_items_send_price_ids_not_objects():
    """Из ответа Stripe price приезжает объектом, а на запись нужен id — вернуть
    объект как есть значит получить 400 посреди смены тарифа."""
    from types import SimpleNamespace

    from services.stripe_billing import _phase_items

    phase = SimpleNamespace(items=[
        SimpleNamespace(price=SimpleNamespace(id="price_1"), quantity=1),
        SimpleNamespace(price="price_2", quantity=2),
    ])
    assert _phase_items(phase) == [
        {"price": "price_1", "quantity": 1},
        {"price": "price_2", "quantity": 2},
    ]
    # Пустая фаза не роняет смену тарифа.
    assert _phase_items(SimpleNamespace(items=None)) == []


if __name__ == "__main__":
    import sys
    sys.exit(pytest.main([__file__, "-q"]))
