"""Смена тарифа: зачёт остатка, сгорание излишка, отсутствие выбора «когда».

Правило продукта (MVP): переход ВСЕГДА немедленный и БЕЗ зачёта. Новый период
платится целиком, а неиспользованный остаток прежнего тарифа СГОРАЕТ. Покупка
ТОГО ЖЕ тарифа переходом не является — это продление, и там месяцы прибавляются
к сроку, ничего не теряя.

Инварианты, которые тут защищаются:
  1. Выбора «сейчас / с начала периода» больше нет — ни в теле запроса, ни в коде.
     Вернуть его значит вернуть два поведения у одной кнопки.
  2. Переход идёт с proration_behavior="none" + billing_cycle_anchor="now". Без
     якоря студия получила бы тариф выше бесплатно до конца оплаченного периода;
     с прорациями вернулся бы зачёт, которого продукт больше не обещает.
  3. После перехода кредит на балансе сжигается: у студий, успевших перейти по
     прежней схеме, он молча оплатил бы следующие счета.
  4. Перед переходом снимается ранее выставленное расписание (легаси-студии).
  5. Сумма в превью — каталожная цена периода, одна и та же во всех трёх исходах.
  6. Превью не врёт про продление: сгорание грозит только смене тарифа.

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

def test_switch_burns_the_remainder_and_restarts_the_cycle():
    """Остаток прежнего тарифа сгорает: период начинается заново и платится целиком.

    Якорь без прораций — обязательная пара. Вернётся `create_prorations` — вернётся
    зачёт, которого модалка больше не обещает; пропадёт якорь — студия получит
    тариф выше бесплатно до конца уже оплаченного периода.
    """
    from routers.billing.checkout import _switch_now

    src = inspect.getsource(_switch_now)
    assert 'proration_behavior="none"' in src
    assert 'billing_cycle_anchor="now"' in src


def test_switch_still_burns_a_legacy_credit_balance():
    """У студий, успевших перейти по схеме с прорацией, кредит мог остаться на
    балансе — и молча оплатил бы следующие счета."""
    from routers.billing.checkout import _switch_now

    assert "drop_credit_balance" in inspect.getsource(_switch_now)


def test_no_credit_machinery_survived_anywhere():
    """Зачёт убран целиком, а не «отключён флагом». Полуживой второй путь расчёта
    суммы — это ровно тот случай, когда модалка и счёт однажды разъезжаются."""
    for gone in ("preview_price_change", "split_preview", "add_credit_balance",
                 "subscription_prepaid_trial"):
        assert not hasattr(stripe_billing, gone), gone

    from schemas.settings.billing import CheckoutPreviewRead

    for gone in ("credit", "burned", "estimated"):
        assert gone not in CheckoutPreviewRead.model_fields, gone


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
        "studio_id": 1, "plan_name": "s3", "status": "active",
        "billing_mode": "subscription", "stripe_subscription_id": "sub_1",
        "stripe_customer_id": "cus_1",
        # Читает _trial_end: превью без подписки называет дату, до которой ещё
        # действует уже оплаченный остаток.
        "expires_at": None, **kw,
    })


def _call_preview(plan_row, monkeypatch, live_key=None,
                  settled=False, want="s15", combo=False):
    """`live_key` — lookup_key Price, по которому подписка идёт в Stripe СЕЙЧАС.
    По умолчанию совпадает с тарифом в нашей строке (зеркало не отстало).
    `settled` — оплачен ли последний счёт подписки; спрашивается только когда Price
    выше нашей ступени. `want` — тариф, который владелец выбрал в модалке.
    `combo` — выбрана ли модель «фикс + процент» прямо сейчас.

    Превью-счёт Stripe тут не стабится, потому что его больше нет: зачёта не
    осталось, и сумму целиком диктует каталог."""
    from routers.billing import checkout as checkout_mod

    async def fake_price_id(*_a, **_kw):
        return "price_new"

    async def fake_price_key(*_a, **_kw):
        return live_key or f"velora_{plan_row.plan_name}_1m"

    async def fake_settled(*_a, **_kw):
        return settled

    monkeypatch.setattr(checkout_mod.stripe_catalog, "price_id", fake_price_id)
    monkeypatch.setattr(checkout_mod.stripe_billing, "subscription_price_key", fake_price_key)
    monkeypatch.setattr(checkout_mod.stripe_billing, "subscription_settled", fake_settled)
    monkeypatch.setattr(checkout_mod.stripe_billing, "configured", lambda: True)

    ctx = SimpleNamespace(studio_id=1, user=SimpleNamespace(id=1, email="u@e.com"))
    # Лимитер slowapi обёрнут поверх функции и читает request.client — реального
    # запроса тут нет, поэтому зовём распакованную функцию.
    fn = getattr(checkout_mod.preview_checkout, "__wrapped__", checkout_mod.preview_checkout)
    # combo передаём явно: у распакованной функции дефолт — объект Query, а не bool.
    return asyncio.run(fn(
        request=None, plan=want, period_months=1, combo=combo, ctx=ctx, db=_DB(plan_row),
    ))


def test_preview_of_a_switch_is_the_full_catalog_price(monkeypatch):
    """Смена тарифа платится целиком: зачёта нет, скидывать нечего."""
    from routers.billing.plans import amount_for

    res = _call_preview(_plan_row(), monkeypatch)
    assert res.kind == "switch"
    assert res.current_plan == "s3"
    assert res.gross == res.total == amount_for("s15", 1)


def test_switching_down_costs_full_price_too(monkeypatch):
    """Переход на тариф ДЕШЕВЛЕ тоже платится с нуля: остаток дорогого сгорает, а
    не гасит новый счёт. Показать здесь ноль значит пообещать бесплатный месяц."""
    from routers.billing.plans import amount_for

    res = _call_preview(_plan_row(plan_name="unlimited"), monkeypatch, want="s3")
    assert res.kind == "switch"
    assert res.total == amount_for("s3", 1) > 0


def test_preview_of_a_renewal_is_a_renewal(monkeypatch):
    """Тот же тариф — продление: месяцы прибавляются к сроку, терять нечего.
    Разобрать его как смену значит сжечь студии оплаченный остаток за продление."""
    res = _call_preview(_plan_row(plan_name="s15"), monkeypatch)
    assert res.kind == "renewal"
    assert res.total == res.gross > 0


def test_preview_follows_the_live_subscription_not_our_mirror(monkeypatch):
    """`plan_name` в БД — зеркало, которое поднимает вебхук. Пока событие в пути,
    оно отстаёт, и покупка СВОЕГО ЖЕ тарифа разбиралась как смена: Stripe
    перезапускал цикл и брал полную цену, а зачитывать было нечего. Владелец
    увидел 99,07 € за Pro, который в подписке уже стоял (жалоба 13.08.2026)."""
    res = _call_preview(
        # В БД business, в Stripe подписка уже на pro — покупаем pro.
        _plan_row(plan_name="unlimited"), monkeypatch,
        live_key="velora_s15_1m",
    )
    assert res.kind == "renewal", "продление своего тарифа разобрано как смена"
    assert res.current_plan == "s15", "подпись показывает тариф из отставшего зеркала"


def test_preview_ignores_a_price_nobody_has_paid_for(monkeypatch):
    """ЖАЛОБА 14.08.2026. Неудавшийся переход оставляет подписку уже НА BUSINESS с
    неоплаченным счётом-прорацией. Страница после этого противоречила сама себе:
    карточка тарифа (наше зеркало) показывала Pro, а модалка оплаты Business
    считала студию уже сидящей на нём — «продление» вместо перехода. Разница
    принципиальная: продление остаток сохраняет, а переход его сжигает.

    Текущий тариф = тот, за который заплачено. Неоплаченный Price им не является."""
    res = _call_preview(
        # В БД pro (оплачен), в Stripe подписка уже на business — счёт за неё висит.
        _plan_row(plan_name="s15"), monkeypatch, want="unlimited",
        live_key="velora_unlimited_1m", settled=False,
    )
    assert res.kind == "switch", "неоплаченный Price выдан за текущий тариф"
    assert res.current_plan == "s15"


def test_preview_trusts_a_higher_price_once_its_invoice_is_paid(monkeypatch):
    """Обратная сторона: счёт за переход ОПЛАЧЕН, а вебхук не дошёл. Тариф у студии
    уже новый, и покупка его же — продление (13.08.2026). Проверка на оплату не
    должна возвращать эту дыру."""
    res = _call_preview(
        _plan_row(plan_name="s15"), monkeypatch, want="unlimited",
        live_key="velora_unlimited_1m", settled=True,
    )
    assert res.kind == "renewal", "оплаченный переход снова разобран как смена тарифа"
    assert res.current_plan == "unlimited"


def test_preview_without_a_subscription_is_the_plain_catalog_price(monkeypatch):
    res = _call_preview(
        _plan_row(stripe_subscription_id=None, status="none"), monkeypatch,
    )
    assert res.kind == "new"
    assert res.total == res.gross > 0


def test_preview_names_the_date_billing_actually_starts(monkeypatch):
    """Оплаченный остаток (триал, прежний период) не сгорает: подписка стартует
    бесплатно до его конца (_trial_end). Без этой строки модалка показывала сумму
    так, будто спишут её сегодня, и владелец видел вторую оплату за уже
    оплаченный месяц."""
    from datetime import datetime, timedelta

    res = _call_preview(
        _plan_row(
            stripe_subscription_id=None, status="active",
            expires_at=datetime.utcnow() + timedelta(days=30),
        ),
        monkeypatch,
    )
    assert res.kind == "new"
    assert res.free_until is not None
    assert res.free_days == 30, "число дней разошлось с датой первого списания"


def test_preview_without_a_paid_leftover_promises_nothing_free(monkeypatch):
    """Обещать бесплатные дни там, где их нет, — прямая ложь о сумме."""
    res = _call_preview(
        _plan_row(stripe_subscription_id=None, status="none"), monkeypatch,
    )
    assert res.free_until is None and res.free_days == 0


def test_combo_preview_uses_the_half_price(monkeypatch):
    """На комбо подписка платит ровно половину (plans.COMBO_FIXED). Показать полную
    значит напугать владельца суммой, которой Stripe не спишет."""
    from routers.billing.plans import amount_for, combo_amount_for

    combo = _call_preview(
        _plan_row(billing_mode="combo", stripe_subscription_id=None, status="none"),
        monkeypatch, combo=True,
    )
    assert combo.gross == combo_amount_for("s15", 1)
    assert combo.gross * 2 == amount_for("s15", 1)


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


# ------------------------------------------- 7. счёт перехода доводится до конца

class _Inv:
    """Счёт Stripe в минимальном виде: и атрибут, и доступ по ключу — как у SDK."""

    def __init__(self, id, status, hosted_invoice_url=None):
        self.id, self.status, self.hosted_invoice_url = id, status, hosted_invoice_url

    def __getitem__(self, key):
        return getattr(self, key)


def _run_switch(monkeypatch, invoice, metadata=None, mirrored_plan=None, sent=None):
    """Прогон _switch_now со стаб-Stripe и стаб-БД.

    `mirrored_plan` — тариф в строке, которую вернуло зеркало счёта: у прошлого,
    уже оплаченного счёта он ЧУЖОЙ, и применять такой счёт нельзя.

    `sent` — словарь, куда складываются аргументы Subscription.modify: ими
    задаётся, сгорит остаток или зачтётся, и проверять их надо по факту вызова,
    а не по исходнику.
    """
    passed = sent if sent is not None else {}
    from routers.billing import checkout as checkout_mod
    from routers.billing import webhook as webhook_mod

    metadata = metadata or {"plan": "s15", "period_months": "1"}

    async def noop(*_a, **_kw):
        return None

    async def fake_change(*_a, **kw):
        passed.update(kw)
        return SimpleNamespace(latest_invoice=invoice)

    finalized = []

    async def fake_finalize(inv):
        if inv.status != "draft":
            return inv
        finalized.append(inv["id"])
        return _Inv(inv.id, "open", "https://stripe/inv")

    burned = []

    async def fake_drop(*_a, **_kw):
        burned.append(True)
        return 0

    monkeypatch.setattr(stripe_billing, "release_schedule", noop)
    monkeypatch.setattr(stripe_billing, "drop_credit_balance", fake_drop)
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
    return url, finalized, applied, burned


def test_switch_asks_stripe_to_burn_not_to_credit(monkeypatch):
    """Главный денежный аргумент перехода — по факту вызова, а не по исходнику.

    `create_prorations` вернул бы зачёт, которого модалка больше не обещает;
    потерянный якорь отдал бы новый тариф бесплатно до конца оплаченного периода.
    """
    sent = {}
    _run_switch(monkeypatch, _Inv("in_draft", "draft"), sent=sent)
    assert sent["proration_behavior"] == "none"
    assert sent["billing_cycle_anchor"] == "now"


def test_switch_burns_a_legacy_balance_on_both_exits(monkeypatch):
    """Кредит гасится и когда счёт выставлен, и когда его не появилось вовсе:
    иначе остаток с прежней схемы молча оплатил бы следующие месяцы."""
    for invoice in (_Inv("in_draft", "draft"), None):
        *_rest, burned = _run_switch(monkeypatch, invoice)
        assert burned == [True], invoice


def test_switch_finalizes_the_invoice_draft(monkeypatch):
    """Счёт Stripe отдаёт ЧЕРНОВИКОМ: ни номера, ни ссылки на оплату. Без
    финализации владелец получал пустой ответ вместо счёта, доплата висела
    невидимым черновиком, а тариф не менялся никогда — подписка в Stripe уже на
    новом тарифе, в нашей БД прежний (живая жалоба 13.08.2026)."""
    url, finalized, applied, _burned = _run_switch(monkeypatch, _Inv("in_draft", "draft"))
    assert finalized == ["in_draft"], "черновик остался черновиком"
    assert url == "https://stripe/inv", "ссылки на оплату так и не появилось"
    assert applied == [], "неоплаченный счёт не имеет права поднимать тариф"


def test_switch_paid_on_the_spot_applies_the_plan_at_once(monkeypatch):
    """Счёт перехода Stripe иногда закрывает сразу — привязанной картой. Ждать
    вебхук ради уже случившегося незачем: иначе владелец видит прежний тариф и
    жмёт «оплатить» снова."""
    url, _finalized, applied, _burned = _run_switch(monkeypatch, _Inv("in_paid", "paid"))
    assert url is None, "платить нечего — вести владельца некуда"
    assert applied == ["paid"]


# ------------------------------------- 8. один счёт за тариф на студию за раз

class _Invoices:
    """Стаб сессии: на любой запрос отдаёт заранее заданный список счетов."""

    def __init__(self, rows):
        self._rows = rows

    async def execute(self, _q):
        return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: self._rows))


def _bill(id, kind="subscription", status="pending", stripe_id=None):
    return SimpleNamespace(
        id=id, studio_id=1, kind=kind, status=status,
        stripe_invoice_id=stripe_id or f"in_{id}",
    )


def _supersede(monkeypatch, fresh, stale, voided=True, boom=False):
    """Прогон _supersede_unpaid → список счетов, которые погасили в Stripe."""
    from routers.billing import webhook as webhook_mod

    closed = []

    async def fake_void(stripe_id):
        if boom:
            raise RuntimeError("Stripe прилёг")
        closed.append(stripe_id)
        return voided

    monkeypatch.setattr(webhook_mod.stripe_billing, "void_invoice", fake_void)
    asyncio.run(webhook_mod._supersede_unpaid(_Invoices(stale), fresh))
    return closed


def test_a_new_tariff_invoice_closes_the_previous_unpaid_one(monkeypatch):
    """Неудавшийся переход (закрыли вкладку, карта отклонила) оставлял открытый
    счёт-прорацию, следующая попытка добавляла второй — и Stripe дожимал ОБА,
    списывая за один тариф дважды. Правило: один счёт за тариф на студию."""
    old = _bill(1)
    closed = _supersede(monkeypatch, _bill(2), [old])
    assert closed == ["in_1"], "прежний счёт остался открытым в Stripe"
    assert old.status == "failed", "прежний счёт остался в списке к оплате"


def test_fee_invoices_are_not_touched(monkeypatch):
    """Счёт за комиссию закрывает СВОИ начисления (OfflineTransactionFee.invoice_id),
    и в новый счёт они не переедут. Погасить его значит стереть долг студии перед
    платформой, а не убрать дубль."""
    fee = _bill(1, kind="offline_fee")
    assert _supersede(monkeypatch, _bill(2, kind="offline_fee"), [fee]) == []
    assert fee.status == "pending"


def test_a_bill_stripe_refuses_to_close_stays_as_it_was(monkeypatch):
    """Stripe видит счёт иначе (уже оплачен) — в своей строке этого не выдумываем:
    отметить его провалившимся значило бы спрятать оплату из истории."""
    old = _bill(1)
    _supersede(monkeypatch, _bill(2), [old], voided=False)
    assert old.status == "pending"

    other = _bill(1)
    _supersede(monkeypatch, _bill(2), [other], boom=True)
    assert other.status == "pending", "Stripe не ответил, а счёт уже закрыт у нас"


def _void(monkeypatch, status, billing_reason="subscription_update"):
    """Прогон void_invoice со стаб-SDK → (результат, что дёрнули у Stripe)."""
    calls = []
    invoice = SimpleNamespace(status=status, billing_reason=billing_reason)
    monkeypatch.setattr(stripe_billing.stripe.Invoice, "retrieve", lambda *_a, **_k: invoice)
    monkeypatch.setattr(
        stripe_billing.stripe.Invoice, "void_invoice", lambda i, **_k: calls.append(("void", i)),
    )
    monkeypatch.setattr(
        stripe_billing.stripe.Invoice, "delete", lambda i, **_k: calls.append(("delete", i)),
    )
    return asyncio.run(stripe_billing.void_invoice("in_1")), calls


def test_a_finalized_bill_is_voided_and_a_draft_is_deleted(monkeypatch):
    """У финализированного счёта есть номер из сквозной нумерации — удалить его
    значит оставить дыру в отчётности. Черновику номер ещё не выдан."""
    assert _void(monkeypatch, "open") == (True, [("void", "in_1")])
    assert _void(monkeypatch, "draft") == (True, [("delete", "in_1")])
    assert _void(monkeypatch, "paid") == (False, []), "оплаченный счёт погашен"


def test_the_cycle_invoice_is_never_closed(monkeypatch):
    """Счёт очередного цикла Stripe выставляет сам за УЖЕ ИДУЩИЙ период и тут же
    пытается списать. Погасить его посреди попытки — уронить подписку в past_due;
    погасить залежавшийся — подарить студии месяц, которым она пользовалась."""
    assert _void(monkeypatch, "open", billing_reason="subscription_cycle") == (False, [])
    # Прорация за переход и счёт продления рождаются нажатием кнопки — их гасим.
    assert _void(monkeypatch, "open", billing_reason="manual")[0] is True


def test_switch_ignores_a_paid_invoice_of_another_plan(monkeypatch):
    """`latest_invoice` бывает и прошлым, уже оплаченным счётом. Применить его
    значит вернуть студию на прежний тариф её же старым платежом."""
    _url, _finalized, applied, _burned = _run_switch(
        monkeypatch, _Inv("in_old", "paid"),
        metadata={"plan": "s15"}, mirrored_plan="unlimited",
    )
    assert applied == [], "чужой счёт поднял тариф"


# ------------------------------------------- 8. страница показывает реальный тариф

class _CommitLog:
    """Стаб сессии: считает коммиты, больше от неё сверке ничего не нужно."""

    def __init__(self):
        self.commits = 0

    async def commit(self):
        self.commits += 1


def _reconcile(monkeypatch, mirror_plan, live_key, expires="2027-01-26", checked_at=None,
               settled=False):
    """Прогон сверки тарифа с подпиской → (строка плана, число коммитов)."""
    from importlib import import_module

    from routers.billing import checkout as checkout_mod

    # Именно import_module: в пакете `routers.billing` имя `router` занято самим
    # APIRouter, и обычный `from ... import router` принёс бы его, а не модуль.
    router_mod = import_module("routers.billing.router")

    async def fake_price_key(*_a, **_kw):
        return live_key

    async def fake_settled(*_a, **_kw):
        return settled

    monkeypatch.setattr(checkout_mod.stripe_billing, "subscription_price_key", fake_price_key)
    monkeypatch.setattr(checkout_mod.stripe_billing, "subscription_settled", fake_settled)
    monkeypatch.setattr(router_mod, "_PLAN_CHECKED_AT", dict(checked_at or {}))

    row = _plan_row(plan_name=mirror_plan, max_staff=999, expires_at=expires)
    db = _CommitLog()
    asyncio.run(router_mod._reconcile_plan_name(db, row))
    return row, db.commits


def test_plan_page_follows_the_live_subscription(monkeypatch):
    """Владелец видел «Business» и цены Business, когда Stripe уже списывал Pro:
    вебхук, который поднимает наше зеркало, не дошёл. Страница обязана показывать
    тариф, за который берут деньги (жалоба 13.08.2026)."""
    row, commits = _reconcile(monkeypatch, mirror_plan="unlimited", live_key="velora_s15_1m")
    assert row.plan_name == "s15"
    assert row.max_staff == 15, "лимиты остались от прежней ступени"
    assert commits == 1, "выравнивание не сохранено"


def test_plan_page_never_raises_the_tier_for_free(monkeypatch):
    """ИНЦИДЕНТ 14.08.2026. `change_subscription_price` переводит подписку на новый
    Price СРАЗУ, а счёт-прорация в этот момент ещё `open`. Сверка «по Price
    подписки» выдала студии Business за неоплаченные 169,41 €. Вверх ступень
    двигает только оплаченный счёт (webhook._activate) — и никто больше."""
    row, commits = _reconcile(monkeypatch, mirror_plan="s15", live_key="velora_unlimited_1m")
    assert row.plan_name == "s15", "тариф выдан за неоплаченный счёт"
    assert row.max_staff == 999, "лимиты подняты за неоплаченный счёт"
    assert commits == 0


def test_plan_page_does_not_upgrade_a_trial(monkeypatch):
    """У пробного периода цены в каталоге нет, сравнивать не с чем — а любой
    переход с него был бы повышением. Молча уходим и ждём оплату."""
    row, commits = _reconcile(monkeypatch, mirror_plan="free_trial", live_key="velora_unlimited_1m")
    assert row.plan_name == "free_trial"
    assert commits == 0


def test_plan_reconcile_never_touches_the_paid_period(monkeypatch):
    """Срок у нас законно уходит вперёд цикла подписки: продление — отдельный счёт,
    который двигает дату сам. Подтянуть `expires_at` «как в Stripe» значило бы
    отобрать уже оплаченные месяцы."""
    row, _commits = _reconcile(monkeypatch, mirror_plan="unlimited", live_key="velora_s15_1m")
    assert row.expires_at == "2027-01-26"
    assert row.status == "active"


def test_plan_reconcile_is_throttled(monkeypatch):
    """`/billing/plan` дёргает каркас кабинета на каждой странице. Без дросселя
    один заход стоил бы четырёх запросов в Stripe."""
    import time as _time

    row, commits = _reconcile(
        monkeypatch, mirror_plan="unlimited", live_key="velora_s15_1m",
        checked_at={1: _time.time()},
    )
    assert row.plan_name == "unlimited", "сверка ушла в сеть раньше срока"
    assert commits == 0


def test_plan_reconcile_ignores_a_foreign_price(monkeypatch):
    """Price не из нашего каталога (заведён руками в дашборде) тарифом не является —
    затирать им ступень значит уронить студию в «неизвестный тариф»."""
    row, commits = _reconcile(monkeypatch, mirror_plan="unlimited", live_key="some_other_price")
    assert row.plan_name == "unlimited"
    assert commits == 0


if __name__ == "__main__":
    import sys
    sys.exit(pytest.main([__file__, "-q"]))
