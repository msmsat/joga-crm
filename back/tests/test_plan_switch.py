"""Смена тарифа: зачёт остатка, сгорание излишка, отсутствие выбора «когда».

Правило продукта (переделка 13.08.2026): переход ВСЕГДА немедленный.
Неиспользованный остаток текущего периода зачитывается в новый счёт, доплачивается
разница. Если остаток БОЛЬШЕ новой цены (переход на тариф дешевле) — доплачивать
нечего, а излишек СГОРАЕТ. Покупка того же тарифа — продление: ничего не
зачитывается и ничего не сгорает, месяцы прибавляются к сроку.

Инварианты, которые тут защищаются:
  1. Выбора «сейчас / с начала периода» больше нет — ни в теле запроса, ни в коде.
     Вернуть его значит вернуть два поведения у одной кнопки.
  2. Переход идёт с create_prorations + billing_cycle_anchor="now". Без прораций
     студия платила бы полную цену дважды; без якоря — получила бы тариф выше
     бесплатно до конца периода.
  3. После перехода кредит на балансе сжигается: иначе «к оплате 0» в модалке
     превращается в бесплатные месяцы дальше.
  4. Перед переходом снимается ранее выставленное расписание (легаси-студии).
  5. Превью считает те же цифры, что показывает модалка, и НЕ уходит в минус.
  6. Превью не врёт про продление: там нет ни зачёта, ни сгорания.

Сеть и БД не трогаем: Stripe и слой БД застублены.

Запуск из back/:  python -m pytest tests/test_plan_switch.py
"""
import asyncio
import inspect
from types import SimpleNamespace

import pytest

from services import stripe_billing


# ------------------------------------------- 1. выбора «когда применить» нет

def test_checkout_request_has_no_apply_field():
    """`apply` был единственным способом попросить отложенный переход. Пока поле
    живо, старый фронт (или чей-то curl) продолжит просить поведение, которого
    в коде уже нет, — и молча получит другое."""
    from schemas.settings.billing import CheckoutRequest

    assert "apply" not in CheckoutRequest.model_fields


def test_checkout_response_no_longer_promises_a_scheduled_switch():
    from schemas.settings.billing import CheckoutResponse

    fields = CheckoutResponse.model_fields
    assert "scheduled" not in fields and "applies_at" not in fields


def test_deferred_switch_machinery_is_gone():
    """SubscriptionSchedule заводился только ради отложенного перехода. Оставить
    функцию «на всякий случай» — оставить второй путь смены тарифа."""
    assert not hasattr(stripe_billing, "schedule_price_change")
    # release_schedule ОСТАЁТСЯ: у студий, успевших запланировать переход по старой
    # схеме, расписание висит и блокирует Subscription.modify.
    assert hasattr(stripe_billing, "release_schedule")


# --------------------------------------- 2-4. что именно делает переход сейчас

def test_switch_credits_the_remainder_and_restarts_the_cycle():
    from routers.billing.checkout import _switch_now

    src = inspect.getsource(_switch_now)
    assert 'proration_behavior="create_prorations"' in src
    assert 'billing_cycle_anchor="now"' in src


def test_switch_burns_the_leftover_credit():
    """Переход на тариф дешевле: Stripe кладёт разницу кредитом на баланс и гасит им
    следующие счета. Продукт обещает обратное — остаток сгорает, и модалка об этом
    предупредила ДО оплаты."""
    from routers.billing.checkout import _switch_now

    assert "drop_credit_balance" in inspect.getsource(_switch_now)


def test_switch_releases_a_pending_schedule_first():
    """Подписку под расписанием Stripe менять отказывается — студия, запланировавшая
    переход по прежней схеме, иначе упирается в 502 на любой смене тарифа."""
    from routers.billing.checkout import _switch_now

    assert "release_schedule" in inspect.getsource(_switch_now)


def test_switch_clears_a_stale_scheduled_badge():
    """Подпись «с такого-то числа — тариф X» осталась бы висеть вечно."""
    from routers.billing.checkout import _switch_now

    src = inspect.getsource(_switch_now)
    assert "plan.scheduled_plan = None" in src


def test_billing_cycle_anchor_reaches_stripe():
    """Параметр обязан доезжать до Subscription.modify, а не оседать в сигнатуре."""
    src = inspect.getsource(stripe_billing.change_subscription_price)
    assert 'params["billing_cycle_anchor"] = billing_cycle_anchor' in src


def test_only_credit_balance_is_burned_never_a_debt(monkeypatch):
    """Отрицательный баланс у Stripe = кредит, положительный = ДОЛГ студии.
    Обнулить долг значит простить неоплаченный счёт."""
    modified = {}
    monkeypatch.setattr(
        stripe_billing.stripe.Customer, "modify",
        lambda cid, **kw: (modified.update(kw), SimpleNamespace(id=cid))[1],
    )

    monkeypatch.setattr(
        stripe_billing.stripe.Customer, "retrieve",
        lambda cid, **kw: SimpleNamespace(id=cid, balance=-4200),
    )
    assert asyncio.run(stripe_billing.drop_credit_balance("cus_x")) == 4200
    assert modified == {"balance": 0}

    modified.clear()
    monkeypatch.setattr(
        stripe_billing.stripe.Customer, "retrieve",
        lambda cid, **kw: SimpleNamespace(id=cid, balance=1500),
    )
    assert asyncio.run(stripe_billing.drop_credit_balance("cus_x")) == 0
    assert modified == {}


# ------------------------------------------------------ 5-6. что показывает превью

def _preview(*amounts):
    return SimpleNamespace(
        lines=SimpleNamespace(data=[SimpleNamespace(amount=a) for a in amounts]),
    )


def test_preview_splits_lines_into_price_and_credit():
    """Плюсовые позиции — новый тариф, минусовые — остаток прежнего. Из этой пары
    модалка рисует строки «Стоимость тарифа» и «Ваш тариф — остаток»."""
    assert stripe_billing.split_preview(_preview(9900, -1950)) == (9900, 1950)
    assert stripe_billing.split_preview(_preview()) == (0, 0)
    assert stripe_billing.split_preview(SimpleNamespace(lines=None)) == (0, 0)


class _Row:
    def __init__(self, v):
        self._v = v

    def scalar_one_or_none(self):
        return self._v


class _DB:
    """Минимальный стаб сессии: возвращает одну и ту же строку плана."""

    def __init__(self, plan):
        self._plan = plan

    async def execute(self, _q):
        return _Row(self._plan)

    async def flush(self):
        pass

    async def commit(self):
        pass

    def add(self, _row):
        pass


def _plan_row(**kw):
    return SimpleNamespace(**{
        "studio_id": 1, "plan_name": "start", "status": "active",
        "billing_mode": "subscription", "stripe_subscription_id": "sub_1",
        "stripe_customer_id": "cus_1", **kw,
    })


def _call_preview(plan_row, monkeypatch, gross_credit=None, boom=False, live_key=None):
    """`live_key` — lookup_key Price, по которому подписка идёт в Stripe СЕЙЧАС.
    По умолчанию совпадает с тарифом в нашей строке (зеркало не отстало)."""
    from routers.billing import checkout as checkout_mod

    async def fake_price_id(*_a, **_kw):
        return "price_new"

    async def fake_preview(*_a, **_kw):
        if boom:
            raise RuntimeError("Stripe прилёг")
        return gross_credit

    async def fake_price_key(*_a, **_kw):
        return live_key or f"velora_{plan_row.plan_name}_1m"

    monkeypatch.setattr(checkout_mod.stripe_catalog, "price_id", fake_price_id)
    monkeypatch.setattr(checkout_mod.stripe_billing, "preview_price_change", fake_preview)
    monkeypatch.setattr(checkout_mod.stripe_billing, "subscription_price_key", fake_price_key)
    monkeypatch.setattr(checkout_mod.stripe_billing, "configured", lambda: True)

    ctx = SimpleNamespace(studio_id=1, user=SimpleNamespace(id=1, email="u@e.com"))
    # Лимитер slowapi обёрнут поверх функции и читает request.client — реального
    # запроса тут нет, поэтому зовём распакованную функцию.
    fn = getattr(checkout_mod.preview_checkout, "__wrapped__", checkout_mod.preview_checkout)
    return asyncio.run(fn(
        request=None, plan="pro", period_months=1, ctx=ctx, db=_DB(plan_row),
    ))


def test_preview_of_an_upgrade_shows_credit_and_the_difference(monkeypatch):
    res = _call_preview(_plan_row(), monkeypatch, gross_credit=(9900, 1950))
    assert res.kind == "switch"
    assert res.current_plan == "start"
    assert (res.gross, res.credit, res.total, res.burned) == (9900, 1950, 7950, 0)


def test_preview_of_a_downgrade_never_shows_a_negative_total(monkeypatch):
    """Зачёт больше цены: платить нечего, а излишек сгорает — ровно то, о чём
    предупреждает модалка. Отрицательный «итог» читался бы как долг платформы."""
    res = _call_preview(_plan_row(plan_name="business"), monkeypatch, gross_credit=(3900, 8200))
    assert res.total == 0
    assert res.burned == 4300


def test_preview_of_a_renewal_neither_credits_nor_burns(monkeypatch):
    """Тот же тариф — продление: месяцы прибавляются к сроку, терять нечего.
    Показать здесь зачёт значит пообещать скидку, которой не будет."""
    res = _call_preview(_plan_row(plan_name="pro"), monkeypatch, gross_credit=(0, 0))
    assert res.kind == "renewal"
    assert (res.credit, res.burned) == (0, 0)
    assert res.total == res.gross > 0


def test_preview_follows_the_live_subscription_not_our_mirror(monkeypatch):
    """`plan_name` в БД — зеркало, которое поднимает вебхук. Пока событие в пути,
    оно отстаёт, и покупка СВОЕГО ЖЕ тарифа разбиралась как смена: Stripe
    перезапускал цикл и брал полную цену, а зачитывать было нечего. Владелец
    увидел 99,07 € за Pro, который в подписке уже стоял (жалоба 13.08.2026)."""
    res = _call_preview(
        # В БД business, в Stripe подписка уже на pro — покупаем pro.
        _plan_row(plan_name="business"), monkeypatch,
        gross_credit=(9907, 0), live_key="velora_pro_1m",
    )
    assert res.kind == "renewal", "продление своего тарифа разобрано как смена"
    assert res.current_plan == "pro", "подпись показывает тариф из отставшего зеркала"
    assert (res.credit, res.burned) == (0, 0)


def test_preview_without_a_subscription_is_the_plain_catalog_price(monkeypatch):
    res = _call_preview(
        _plan_row(stripe_subscription_id=None, status="none"), monkeypatch, gross_credit=(0, 0),
    )
    assert res.kind == "new"
    assert res.total == res.gross > 0 and res.credit == 0


def test_preview_survives_a_stripe_outage(monkeypatch):
    """Превью — подпись под кнопкой, а не платёж. Уронить его в 502 значит запереть
    оплату целиком; показываем полную цену и честно помечаем её оценочной."""
    res = _call_preview(_plan_row(), monkeypatch, boom=True)
    assert res.estimated is True
    assert res.credit == 0 and res.total == res.gross > 0


def test_combo_preview_uses_the_half_price(monkeypatch):
    """На комбо подписка платит ровно половину (plans.COMBO_FIXED). Показать полную
    значит напугать владельца суммой, которой Stripe не спишет."""
    from routers.billing.plans import amount_for, combo_amount_for

    combo = _call_preview(
        _plan_row(billing_mode="combo", stripe_subscription_id=None, status="none"),
        monkeypatch, gross_credit=(0, 0),
    )
    assert combo.gross == combo_amount_for("pro", 1)
    assert combo.gross * 2 == amount_for("pro", 1)


# ------------------------- 7. триал миграции не должен ронять первую оплату

def test_trial_shorter_than_stripes_minimum_is_rounded_up():
    """Регрессия на живой 502 (13.08.2026): «The `trial_end` date has to be at least
    2 days in the future».

    Минимальный триал у Stripe — 48 часов, а триалом мы закрываем уже оплаченный
    остаток мигрирующей студии. Остаток в один день ронял Checkout Session целиком:
    владелец видел «платёжный сервис отклонил запрос» и не мог купить тариф вообще.
    """
    from datetime import datetime, timedelta, timezone

    from routers.billing.checkout import _MIN_TRIAL, _trial_end

    now = datetime.utcnow()
    soon = _plan_row(stripe_subscription_id=None, expires_at=now + timedelta(hours=20))
    # Запас в 5 секунд — на время между двумя вызовами utcnow(), а не на логику.
    assert _trial_end(soon) >= int((now + _MIN_TRIAL).timestamp()) - 5
    # Главное: уехали ЗА 48-часовой минимум Stripe, иначе он отбивает запрос.
    assert _trial_end(soon) > int((now + timedelta(days=2)).timestamp())

    # Длинный остаток берётся как есть — округлять вверх там нечего.
    far = now + timedelta(days=17)
    assert _trial_end(
        _plan_row(stripe_subscription_id=None, expires_at=far)
    ) == int(far.replace(tzinfo=timezone.utc).timestamp())


def test_no_trial_without_something_already_paid_for():
    """Триал закрывает ОПЛАЧЕННЫЙ остаток. Выдать его студии без срока или с
    истёкшим значит подарить два дня тарифа ни за что."""
    from datetime import datetime, timedelta

    from routers.billing.checkout import _trial_end

    now = datetime.utcnow()
    assert _trial_end(_plan_row(stripe_subscription_id=None, expires_at=None)) is None
    assert _trial_end(
        _plan_row(stripe_subscription_id=None, expires_at=now - timedelta(days=1))
    ) is None
    # У существующей подписки срок ведёт сам Stripe — второй триал её бы сбросил.
    assert _trial_end(_plan_row(expires_at=now + timedelta(days=10))) is None


class _SubStub:
    """Подписка Stripe: статус атрибутом, позиции — через индексацию, как у SDK."""

    def __init__(self, status):
        self.status = status

    def __getitem__(self, key):
        assert key == "items"
        return SimpleNamespace(data=[SimpleNamespace(id="si_1")])


def test_preview_ends_a_trial_exactly_like_the_real_switch(monkeypatch):
    """У подписки на триале Stripe отвергает якорь цикла («Trial end cannot be after
    billing_cycle_anchor»). Триал у нас ставит и миграция уже оплативших
    (checkout._trial_end) — то есть без этой пары превью падало бы ровно у тех, кому
    есть что зачитывать, и модалка показала бы полную цену как оценочную."""
    sent = {}
    monkeypatch.setattr(
        stripe_billing.stripe.Invoice, "create_preview",
        lambda **kw: (sent.update(kw), _preview(9900, -1950))[1],
    )

    monkeypatch.setattr(
        stripe_billing.stripe.Subscription, "retrieve",
        lambda sid, **kw: _SubStub("trialing"),
    )
    assert asyncio.run(stripe_billing.preview_price_change("sub_1", "price_new")) == (9900, 1950)
    assert sent["subscription_details"]["trial_end"] == "now"

    sent.clear()
    monkeypatch.setattr(
        stripe_billing.stripe.Subscription, "retrieve",
        lambda sid, **kw: _SubStub("active"),
    )
    asyncio.run(stripe_billing.preview_price_change("sub_1", "price_new"))
    assert "trial_end" not in sent["subscription_details"], (
        "лишний параметр в денежном запросе — лишний повод для Stripe придраться"
    )
    # Позиция подписки обязана уехать с новым Price, иначе превью посчитает
    # текущий тариф и покажет «доплатить 0» на любом апгрейде.
    assert sent["subscription_details"]["items"] == [{"id": "si_1", "price": "price_new"}]


# ------------------------------------------- 7. счёт перехода доводится до конца

class _Inv:
    """Счёт Stripe в минимальном виде: и атрибут, и доступ по ключу — как у SDK."""

    def __init__(self, id, status, hosted_invoice_url=None):
        self.id, self.status, self.hosted_invoice_url = id, status, hosted_invoice_url

    def __getitem__(self, key):
        return getattr(self, key)


def _run_switch(monkeypatch, invoice, metadata=None, mirrored_plan=None):
    """Прогон _switch_now со стаб-Stripe и стаб-БД.

    `mirrored_plan` — тариф в строке, которую вернуло зеркало счёта: у прошлого,
    уже оплаченного счёта он ЧУЖОЙ, и применять такой счёт нельзя.
    """
    from routers.billing import checkout as checkout_mod
    from routers.billing import webhook as webhook_mod

    metadata = metadata or {"plan": "pro", "period_months": "1"}

    async def noop(*_a, **_kw):
        return None

    async def fake_change(*_a, **_kw):
        return SimpleNamespace(latest_invoice=invoice)

    finalized = []

    async def fake_finalize(inv):
        if inv.status != "draft":
            return inv
        finalized.append(inv["id"])
        return _Inv(inv.id, "open", "https://stripe/inv")

    monkeypatch.setattr(stripe_billing, "release_schedule", noop)
    monkeypatch.setattr(stripe_billing, "drop_credit_balance", noop)
    monkeypatch.setattr(stripe_billing, "change_subscription_price", fake_change)
    monkeypatch.setattr(stripe_billing, "ensure_finalized", fake_finalize)

    applied = []
    row = SimpleNamespace(plan_name=mirrored_plan or metadata["plan"])

    async def fake_mirror(_db, _plan, _inv):
        return row

    async def fake_apply(_db, _row, status, **_kw):
        applied.append(status)
        return True

    monkeypatch.setattr(webhook_mod, "mirror_invoice", fake_mirror)
    monkeypatch.setattr(webhook_mod, "apply_status", fake_apply)

    url = asyncio.run(checkout_mod._switch_now(
        SimpleNamespace(commit=noop), _plan_row(), "cus_1", "price_new", metadata,
    ))
    return url, finalized, applied


def test_switch_finalizes_the_proration_draft(monkeypatch):
    """Прорацию Stripe отдаёт ЧЕРНОВИКОМ: ни номера, ни ссылки на оплату. Без
    финализации владелец получал пустой ответ вместо счёта, доплата висела
    невидимым черновиком, а тариф не менялся никогда — подписка в Stripe уже на
    новом тарифе, в нашей БД прежний (живая жалоба 13.08.2026)."""
    url, finalized, applied = _run_switch(monkeypatch, _Inv("in_draft", "draft"))
    assert finalized == ["in_draft"], "черновик остался черновиком"
    assert url == "https://stripe/inv", "ссылки на оплату так и не появилось"
    assert applied == [], "неоплаченный счёт не имеет права поднимать тариф"


def test_switch_paid_by_the_leftover_applies_the_plan_at_once(monkeypatch):
    """Переход на тариф дешевле зачитывается остатком целиком — такой счёт Stripe
    закрывает сам. Ждать вебхук ради уже случившегося незачем: иначе владелец
    видит прежний тариф и жмёт «оплатить» снова."""
    url, _finalized, applied = _run_switch(monkeypatch, _Inv("in_paid", "paid"))
    assert url is None, "платить нечего — вести владельца некуда"
    assert applied == ["paid"]


def test_switch_ignores_a_paid_invoice_of_another_plan(monkeypatch):
    """`latest_invoice` бывает и прошлым, уже оплаченным счётом. Применить его
    значит вернуть студию на прежний тариф её же старым платежом."""
    _url, _finalized, applied = _run_switch(
        monkeypatch, _Inv("in_old", "paid"),
        metadata={"plan": "pro"}, mirrored_plan="business",
    )
    assert applied == [], "чужой счёт поднял тариф"


# ------------------------------------------- 8. страница показывает реальный тариф

class _CommitLog:
    """Стаб сессии: считает коммиты, больше от неё сверке ничего не нужно."""

    def __init__(self):
        self.commits = 0

    async def commit(self):
        self.commits += 1


def _reconcile(monkeypatch, mirror_plan, live_key, expires="2027-01-26", checked_at=None):
    """Прогон сверки тарифа с подпиской → (строка плана, число коммитов)."""
    from importlib import import_module

    from routers.billing import checkout as checkout_mod

    # Именно import_module: в пакете `routers.billing` имя `router` занято самим
    # APIRouter, и обычный `from ... import router` принёс бы его, а не модуль.
    router_mod = import_module("routers.billing.router")

    async def fake_price_key(*_a, **_kw):
        return live_key

    monkeypatch.setattr(checkout_mod.stripe_billing, "subscription_price_key", fake_price_key)
    monkeypatch.setattr(router_mod, "_PLAN_CHECKED_AT", dict(checked_at or {}))

    row = _plan_row(plan_name=mirror_plan, max_staff=999, expires_at=expires)
    db = _CommitLog()
    asyncio.run(router_mod._reconcile_plan_name(db, row))
    return row, db.commits


def test_plan_page_follows_the_live_subscription(monkeypatch):
    """Владелец видел «Business» и цены Business, когда Stripe уже списывал Pro:
    вебхук, который поднимает наше зеркало, не дошёл. Страница обязана показывать
    тариф, за который берут деньги (жалоба 13.08.2026)."""
    row, commits = _reconcile(monkeypatch, mirror_plan="business", live_key="velora_pro_1m")
    assert row.plan_name == "pro"
    assert row.max_staff == 15, "лимиты остались от прежней ступени"
    assert commits == 1, "выравнивание не сохранено"


def test_plan_reconcile_never_touches_the_paid_period(monkeypatch):
    """Срок у нас законно уходит вперёд цикла подписки: продление — отдельный счёт,
    который двигает дату сам. Подтянуть `expires_at` «как в Stripe» значило бы
    отобрать уже оплаченные месяцы."""
    row, _commits = _reconcile(monkeypatch, mirror_plan="business", live_key="velora_pro_1m")
    assert row.expires_at == "2027-01-26"
    assert row.status == "active"


def test_plan_reconcile_is_throttled(monkeypatch):
    """`/billing/plan` дёргает каркас кабинета на каждой странице. Без дросселя
    один заход стоил бы четырёх запросов в Stripe."""
    import time as _time

    row, commits = _reconcile(
        monkeypatch, mirror_plan="business", live_key="velora_pro_1m",
        checked_at={1: _time.time()},
    )
    assert row.plan_name == "business", "сверка ушла в сеть раньше срока"
    assert commits == 0


def test_plan_reconcile_ignores_a_foreign_price(monkeypatch):
    """Price не из нашего каталога (заведён руками в дашборде) тарифом не является —
    затирать им ступень значит уронить студию в «неизвестный тариф»."""
    row, commits = _reconcile(monkeypatch, mirror_plan="business", live_key="some_other_price")
    assert row.plan_name == "business"
    assert commits == 0


if __name__ == "__main__":
    import sys
    sys.exit(pytest.main([__file__, "-q"]))
