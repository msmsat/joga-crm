"""Сохранённые id Stripe, которых под текущим ключом нет, не ломают оплату.

Идентификаторы Stripe у test и live выглядят одинаково (`cus_…`, `sub_…`), а объекты
между режимами не переносятся. Значит смена ключа молча оставляет в БД ссылки в
никуда, и первое же «Оплатить» падает: `No such customer` — 500, `No such
subscription` — 502 «платёжный сервис отклонил запрос». Владелец упирается в тупик,
из которого сам не выберется. Второй путь в то же состояние — объект удалили в
дашборде Stripe.

Инварианты:
  1. Клиент: `resource_missing` → заводим нового и возвращаем ЕГО id (вызывающий
     пишет его в plan.stripe_customer_id, иначе следующая попытка повторит падение).
  2. Подписка: `resource_missing` → снимаем ссылку и оформляем заново. Проверка
     стоит ДО веток оформления — все они читают одно поле.
  3. Любая другая ошибка Stripe пробрасывается. Заводить второго клиента или вторую
     подписку на таймауте значит плодить дубли с разными IBAN.

Сеть не трогаем — Stripe подменяется заглушками.

Запуск из back/:  python -m pytest tests/test_stale_stripe_customer.py
"""
import asyncio
from types import SimpleNamespace

import pytest
import stripe

import services.stripe_billing as SB


def _run(modify, create):
    saved = (stripe.Customer.modify, stripe.Customer.create)
    stripe.Customer.modify = modify
    stripe.Customer.create = create
    try:
        return asyncio.run(SB.ensure_customer(
            "cus_gone", name="S", email=None, studio_id=1,
        ))
    finally:
        stripe.Customer.modify, stripe.Customer.create = saved


def _missing(*_a, **_kw):
    raise stripe.InvalidRequestError(
        "No such customer: 'cus_gone'", param="id", code="resource_missing",
    )


def test_missing_customer_is_recreated():
    created = {}

    def create(**kw):
        created.update(kw)
        return SimpleNamespace(id="cus_new")

    assert _run(_missing, create) == "cus_new"
    # Привязка к студии доезжает до нового клиента: по ней вебхук находит, чей
    # платёж пришёл. Адреса тут нет намеренно — его собирает страница Checkout и
    # пишет в Customer сама, а наш он бы затирал на каждой следующей оплате.
    assert created["metadata"]["studio_id"] == "1"
    assert "address" not in created


def test_other_stripe_errors_are_not_swallowed():
    """Дубль клиента на каждой сетевой ошибке — это россыпь плательщиков с пустой
    историей счетов и без реквизитов, введённых на странице Stripe."""
    def boom(*_a, **_kw):
        raise stripe.InvalidRequestError("nope", param="id", code="parameter_invalid_empty")

    def create(**_kw):
        pytest.fail("на посторонней ошибке заведён второй клиент")

    with pytest.raises(stripe.InvalidRequestError):
        _run(boom, create)


def test_existing_customer_is_only_updated():
    """Обычный путь не должен внезапно начать плодить клиентов."""
    def modify(cid, **_kw):
        return SimpleNamespace(id=cid)

    def create(**_kw):
        pytest.fail("живой клиент пересоздан вместо обновления")

    assert _run(modify, create) == "cus_gone"


# ------------------------------------------------------------ подписка

class _PlanDB:
    def __init__(self):
        self.commits = 0

    async def commit(self):
        self.commits += 1


def _forget(exists):
    """_forget_dead_subscription с подменённой проверкой существования."""
    import routers.billing.checkout as CO

    plan = SimpleNamespace(stripe_subscription_id="sub_gone", status="active")
    db = _PlanDB()
    saved = SB.subscription_exists

    async def fake(_id):
        return exists

    SB.subscription_exists = fake
    try:
        asyncio.run(CO._forget_dead_subscription(db, plan))
    finally:
        SB.subscription_exists = saved
    return plan, db, CO


def test_dead_subscription_link_is_dropped_before_the_branches():
    """Ссылка снята — значит и `_has_live_subscription`, и `_is_renewal` уводят на
    оформление заново, а не на смену несуществующей подписки."""
    plan, db, CO = _forget(exists=False)

    assert plan.stripe_subscription_id is None
    assert db.commits == 1, "снятая ссылка не закоммичена — падение повторится"
    assert CO._has_live_subscription(plan) is False
    # Тариф подписки нарочно совпадает с запрошенным: даже так продлевать нечего —
    # ссылки на подписку больше нет.
    assert CO._is_renewal(plan, "start", "start") is False
    # Доступ к CRM висит на status/expires_at — закрывать студии продукт из-за
    # пропавшего объекта Stripe мы не вправе.
    assert plan.status == "active"


def test_live_subscription_link_survives():
    plan, db, _CO = _forget(exists=True)

    assert plan.stripe_subscription_id == "sub_gone"
    assert db.commits == 0


def test_missing_subscription_is_reported_as_absent_not_raised():
    saved = stripe.Subscription.retrieve
    stripe.Subscription.retrieve = _missing
    try:
        assert asyncio.run(SB.subscription_exists("sub_gone")) is False
    finally:
        stripe.Subscription.retrieve = saved


def test_subscription_check_does_not_swallow_other_errors():
    """Иначе сетевая ошибка читалась бы как «подписки нет» и студии оформили бы
    ВТОРУЮ поверх живой."""
    def boom(*_a, **_kw):
        raise stripe.InvalidRequestError("nope", param="id", code="parameter_invalid_empty")

    saved = stripe.Subscription.retrieve
    stripe.Subscription.retrieve = boom
    try:
        with pytest.raises(stripe.InvalidRequestError):
            asyncio.run(SB.subscription_exists("sub_gone"))
    finally:
        stripe.Subscription.retrieve = saved


def _plan_row(subscription_id):
    return SimpleNamespace(
        plan_name="start", billing_cycle="monthly", status="active",
        expires_at=None, max_staff=5, auto_renewal=True, billing_mode="subscription",
        percent_rate=None, fixed_base_amount=None, notify_before_days=3,
        notify_before_autocharge=True, email_receipt_enabled=True,
        sms_notification_enabled=False, scheduled_plan=None, scheduled_at=None,
        stripe_subscription_id=subscription_id,
    )


def test_plan_response_reports_whether_the_subscription_is_live():
    """Интерфейс ветвится по ответу сервера, а не по одному `status`.

    Пока признак выводился из статуса, студия без подписки (оплата по старой схеме
    или потерянная ссылка при смене ключа) видела выбор «сейчас / с начала периода»,
    а сервер отвечал ей обычной ссылкой оплаты — и владельца уносило на страницу
    Stripe мимо выбора способа оплаты.
    """
    from routers.billing.router import _to_plan_read

    assert _to_plan_read(_plan_row("sub_live")).has_live_subscription is True
    # Статус тот же active — расходится только наличие подписки.
    assert _to_plan_read(_plan_row(None)).has_live_subscription is False


def test_plan_response_uses_the_checkout_predicate_itself():
    """Не копия правила: второе такое же условие разъехалось бы с первым."""
    import inspect

    from routers.billing.router import _to_plan_read

    assert "_has_live_subscription(row)" in inspect.getsource(_to_plan_read)


def test_the_charging_endpoint_checks_the_link():
    """Оплата осталась одна (карта) — но проверка мёртвой подписки обязана быть в
    ней: без неё смена тарифа падает «No such subscription» и упирается в тупик."""
    import inspect

    from routers.billing.checkout import create_checkout

    assert "_forget_dead_subscription" in inspect.getsource(create_checkout)


if __name__ == "__main__":
    import sys
    sys.exit(pytest.main([__file__, "-q"]))
