"""Автопродление, вебхук и защита от дублей в ручном налоговом режиме.

Самый опасный путь всей миграции — счёт очередного периода: его выставляет САМ
Stripe, нашего запроса в этот момент нет, а `default_tax_rates` он берёт у
подписки. Значит правильный налог на продлении держится не на вебхуке (тот может
не дойти), а на состоянии подписки, которое поддерживается заранее.

Здесь проверяются три слоя, и порядок их важности именно такой:

  1. состояние подписки поддерживается фоновым проходом (`sync_subscription_taxes`);
  2. черновик счёта правится вебхуком, если профиль изменился между периодами;
  3. решения нет → черновик ОСТАНАВЛИВАЕТСЯ, а не финализируется наугад.

Плюс денежные инварианты: повтор нажатия не создаёт второй долг, а состояние
«требует проверки» не выглядит как неоплата студии и не запускает санкции.

Запуск из back/:  python -m pytest tests/test_manual_tax_renewal.py
"""
import asyncio
from types import SimpleNamespace

import pytest
import stripe

import routers.billing.webhook as WH
import services.billing_tax as BT
import services.tax_policy as TP
import services.tax_rates as TR


RATE = "txr_manual_cz_21"


def _async(value):
    async def _inner():
        return value
    return _inner()


@pytest.fixture
def manual(monkeypatch):
    monkeypatch.setenv("BILLING_TAX_MODE", "manual")
    monkeypatch.setenv("BILLING_TAX_POLICY_CONFIRMED", TP.RULESET_VERSION)
    monkeypatch.setenv("BILLING_SELLER_COUNTRY", "CZ")
    monkeypatch.setenv("BILLING_SELLER_VAT_REGISTERED", "true")
    monkeypatch.setenv("BILLING_SELLER_VAT_ID", "CZ00000019")
    monkeypatch.setenv("BILLING_EU_B2C_SCHEME", TP.B2C_DOMESTIC_UNDER_THRESHOLD)
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_renewal")
    monkeypatch.setenv("STRIPE_PUBLISHABLE_KEY", "pk_test_renewal")
    TR.reset_cache()
    monkeypatch.setattr(TR, "_catalogue", lambda: _async({"CZ:21:vat:exclusive": RATE}))
    yield
    TR.reset_cache()


def _plan(studio_id=1):
    return SimpleNamespace(
        studio_id=studio_id, stripe_customer_id="cus_1",
        stripe_subscription_id="sub_1", status="active",
    )


def _app(country="CZ", state=TP.VAT_ABSENT):
    return asyncio.run(TR.resolve(TP.decide(
        TP.seller_profile(), TP.CustomerProfile(country=country, vat_state=state),
        TP.SUPPLY_SAAS_SUBSCRIPTION,
    )))


class _Calls:
    def __init__(self):
        self.modify = []
        self.exempt = []


@pytest.fixture
def spy(monkeypatch):
    calls = _Calls()
    monkeypatch.setattr(
        stripe.Invoice, "modify",
        lambda i, **kw: calls.modify.append({"id": i, **kw}) or SimpleNamespace(id=i),
    )

    async def _exempt(customer_id, app):
        calls.exempt.append((customer_id, app.customer_tax_exempt))
    monkeypatch.setattr(BT, "sync_customer_exempt", _exempt)
    return calls


# --- 1. черновик счёта автопродления ---------------------------------------------

def test_draft_of_a_renewal_invoice_is_corrected_when_the_profile_changed(manual, spy, monkeypatch):
    """Профиль сменился между периодами → черновик приводится к текущему решению.

    Живой сценарий: студия подтвердила номер НДС после первой оплаты. Подписка ещё
    со старой ставкой, а счёт нового периода уже собран — правим, пока черновик.
    """
    ready = _app("DE", TP.VAT_VERIFIED)      # стал reverse charge

    async def _app_for(db, studio_id, kind):
        return ready
    monkeypatch.setattr(BT, "application", _app_for)

    draft = SimpleNamespace(
        id="in_draft", status="draft",
        default_tax_rates=[SimpleNamespace(id=RATE)],   # была чешская ставка
    )
    asyncio.run(WH._ensure_draft_tax(None, _plan(), draft))

    assert spy.modify, "черновик обязан быть поправлен до финализации"
    body = spy.modify[-1]
    assert body["automatic_tax"] == {"enabled": False}
    assert body["default_tax_rates"] == "", "снятие ставок задаётся пустой строкой"
    assert spy.exempt == [("cus_1", TR.EXEMPT_REVERSE)]


def test_draft_is_left_alone_when_it_already_matches(manual, spy, monkeypatch):
    """Совпадает — не трогаем. Лишняя правка счёта это лишнее событие и лишний риск."""
    ready = _app()

    async def _app_for(db, studio_id, kind):
        return ready
    monkeypatch.setattr(BT, "application", _app_for)

    draft = SimpleNamespace(
        id="in_draft", status="draft", default_tax_rates=[SimpleNamespace(id=RATE)],
    )
    asyncio.run(WH._ensure_draft_tax(None, _plan(), draft))
    assert spy.modify == []


def test_draft_is_stopped_when_there_is_no_tax_decision(manual, spy, monkeypatch):
    """Решения нет → черновик НЕ финализируется.

    `auto_advance=false` оставляет счёт черновиком: он не выставляется студии, не
    порождает налоговой строки и не начисляет комиссию за расчёт. Это сознательный
    размен — остановленное продление с криком в логе лучше документа с наугад
    выбранным налогом.
    """
    async def _app_for(db, studio_id, kind):
        raise TR.TaxReviewRequired(TP.TaxDecision(
            outcome=TP.REQUIRES_REVIEW, basis="customer_country_missing",
            review_reason="у плательщика не заполнена страна",
        ))
    monkeypatch.setattr(BT, "application", _app_for)

    draft = SimpleNamespace(id="in_draft", status="draft", default_tax_rates=[])
    asyncio.run(WH._ensure_draft_tax(None, _plan(), draft))

    assert spy.modify == [{"id": "in_draft", "auto_advance": False}]
    assert spy.exempt == [], "статус клиента при нерешённом налоге не трогаем"


def test_finalized_invoice_is_never_rewritten(manual, spy, monkeypatch):
    """Финализированный счёт не правим: у него номер из сквозной нумерации."""
    ready = _app("DE", TP.VAT_VERIFIED)

    async def _app_for(db, studio_id, kind):
        return ready
    monkeypatch.setattr(BT, "application", _app_for)

    for status in ("open", "paid", "void"):
        spy.modify.clear()
        invoice = SimpleNamespace(id="in_1", status=status, default_tax_rates=[])
        asyncio.run(WH._ensure_draft_tax(None, _plan(), invoice))
        assert spy.modify == [], f"счёт в статусе {status} правился"


def test_automatic_mode_does_not_touch_drafts(spy, monkeypatch):
    """В прежнем режиме вебхук ничего не меняет — поведение не должно поехать."""
    monkeypatch.delenv("BILLING_TAX_MODE", raising=False)
    draft = SimpleNamespace(id="in_draft", status="draft", default_tax_rates=[])
    asyncio.run(WH._ensure_draft_tax(None, _plan(), draft))
    assert spy.modify == []


# --- 2. фоновая синхронизация подписок -------------------------------------------

def test_subscription_sync_is_the_primary_mechanism(manual, monkeypatch):
    """Подписка переводится на ручные ставки без всякого вебхука.

    Это и есть ответ на «событие может не дойти»: счёт автопродления соберётся из
    состояния подписки, а его поддерживает ежечасный проход.
    """
    changed = {}
    ready = _app()

    async def _app_for(db, studio_id, kind):
        return ready
    monkeypatch.setattr(BT, "application", _app_for)

    async def _exempt(customer_id, app):
        pass
    monkeypatch.setattr(BT, "sync_customer_exempt", _exempt)

    async def _set(sub_id, app):
        changed[sub_id] = app.rate_ids
    monkeypatch.setattr(WH.stripe_billing, "set_subscription_tax", _set)
    monkeypatch.setattr(
        stripe.Subscription, "retrieve",
        lambda sid, **kw: SimpleNamespace(
            id=sid, default_tax_rates=[], automatic_tax=SimpleNamespace(enabled=True),
        ),
    )

    class _DB:
        async def execute(self, *_a, **_kw):
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: [_plan()]))

    assert asyncio.run(WH.sync_subscription_taxes(_DB())) == 1
    assert changed == {"sub_1": (RATE,)}


def test_subscription_sync_skips_studios_without_a_decision(manual, monkeypatch):
    """Студию без решения НЕ трогаем: стереть ставки «на всякий случай» значит
    выставить следующий счёт без налога."""
    touched = []

    async def _app_for(db, studio_id, kind):
        raise TR.TaxRateMissing("ставки нет на аккаунте")
    monkeypatch.setattr(BT, "application", _app_for)

    async def _set(sub_id, app):
        touched.append(sub_id)
    monkeypatch.setattr(WH.stripe_billing, "set_subscription_tax", _set)

    class _DB:
        async def execute(self, *_a, **_kw):
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: [_plan()]))

    assert asyncio.run(WH.sync_subscription_taxes(_DB())) == 0
    assert touched == []


def test_subscription_sync_is_idempotent(manual, monkeypatch):
    """Уже переведённую подписку второй раз не трогаем — иначе каждый час правка."""
    touched = []
    ready = _app()

    async def _app_for(db, studio_id, kind):
        return ready
    monkeypatch.setattr(BT, "application", _app_for)

    async def _set(sub_id, app):
        touched.append(sub_id)
    monkeypatch.setattr(WH.stripe_billing, "set_subscription_tax", _set)
    monkeypatch.setattr(
        stripe.Subscription, "retrieve",
        lambda sid, **kw: SimpleNamespace(
            id=sid, default_tax_rates=[SimpleNamespace(id=RATE)],
            automatic_tax=SimpleNamespace(enabled=False),
        ),
    )

    class _DB:
        async def execute(self, *_a, **_kw):
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: [_plan()]))

    assert asyncio.run(WH.sync_subscription_taxes(_DB())) == 0
    assert touched == []


def test_sync_does_nothing_in_automatic_mode(monkeypatch):
    monkeypatch.delenv("BILLING_TAX_MODE", raising=False)
    assert asyncio.run(WH.sync_subscription_taxes(None)) == 0


# --- 3. состояние «требует проверки» не является неоплатой -------------------------

def test_review_state_is_not_a_customer_debt(manual):
    """Нерешённый налог — наша системная заминка, а не долг студии.

    Проверяем свойство, на котором держится вывод: счёт не создаётся вовсе, значит
    в БД не появляется строки с `due_at`, а блокировка студии смотрит именно на
    просроченный `due_at` (services/platform_fee.suspension_reason).
    """
    from services import platform_fee

    source = __import__("inspect").getsource(platform_fee.suspension_reason)
    assert "due_at" in source, (
        "блокировка перестала опираться на due_at — проверьте, что нерешённый налог "
        "по-прежнему не выглядит как неоплата"
    )
    with pytest.raises(TR.TaxReviewRequired):
        asyncio.run(TR.resolve(TP.TaxDecision(
            outcome=TP.REQUIRES_REVIEW, basis="customer_country_missing",
            review_reason="нет страны",
        )))


def test_review_exception_carries_the_reason_for_humans(manual):
    """У отказа обязана быть причина: «Stripe отклонил запрос» отправило бы владельца
    искать поломку не там."""
    decision = TP.TaxDecision(
        outcome=TP.REQUIRES_REVIEW, basis="eu_b2c_scheme_unconfirmed",
        review_reason="не подтверждён режим обложения B2C",
    )
    with pytest.raises(TR.TaxReviewRequired) as exc:
        asyncio.run(TR.resolve(decision))
    assert exc.value.decision.basis == "eu_b2c_scheme_unconfirmed"
    assert "B2C" in str(exc.value)


# --- 4. повтор нажатия не создаёт второй долг ---------------------------------------

def test_repeated_renewal_click_reuses_the_open_invoice(monkeypatch):
    """Второе нажатие «Оплатить» отдаёт УЖЕ выставленный счёт, а не выставляет новый.

    Ключа идемпотентности Stripe здесь мало: он живёт минуты, а владелец
    возвращается к неоплаченному счёту через час и через день. Каждый лишний счёт —
    это и второй долг студии, и вторая финализация (в прежнем режиме — вторая
    платная комиссия за расчёт налога).
    """
    import routers.billing.checkout as CO

    created = []
    monkeypatch.setattr(
        CO.stripe_billing, "create_fee_invoice",
        lambda **kw: created.append(kw),
    )

    row = SimpleNamespace(stripe_invoice_id="in_open", id=7)

    class _Result:
        def __init__(self, value):
            self._value = value

        def scalars(self):
            return SimpleNamespace(first=lambda: self._value, all=lambda: [self._value])

    class _DB:
        def __init__(self):
            self.queries = 0

        async def execute(self, *_a, **_kw):
            self.queries += 1
            # Первый запрос — блокировка строки плана, второй — поиск счёта.
            return _Result(row if self.queries >= 2 else None)

    async def _fetch(invoice_id):
        return SimpleNamespace(id=invoice_id, status="open", hosted_invoice_url="https://pay")
    monkeypatch.setattr(CO.stripe_billing, "fetch_invoice", _fetch)

    ctx = SimpleNamespace(studio_id=1, user=SimpleNamespace(id=1, name="O", last_name=""))
    plan = _plan()
    result = asyncio.run(CO._renewal_invoice(
        _DB(), ctx, plan, "cus_1", "s5", 1, False, None,
    ))

    assert result.id == "in_open", "повтор обязан вернуть уже выставленный счёт"
    assert created == [], "повтор нажатия выставил ВТОРОЙ счёт"


def test_paid_invoice_is_not_reused_as_something_to_pay(monkeypatch):
    """Оплаченный счёт переиспользовать нельзя — вебхук просто ещё не доехал.

    Отдать его как «вот счёт на оплату» значило бы попросить заплатить дважды.
    """
    import routers.billing.checkout as CO

    created = []

    async def _create(**kw):
        created.append(kw)
        return SimpleNamespace(id="in_new", hosted_invoice_url="https://new")
    monkeypatch.setattr(CO.stripe_billing, "create_fee_invoice", _create)

    async def _fetch(invoice_id):
        return SimpleNamespace(id=invoice_id, status="paid")
    monkeypatch.setattr(CO.stripe_billing, "fetch_invoice", _fetch)

    async def _sub(sub_id):
        return SimpleNamespace(collection_method="send_invoice")
    monkeypatch.setattr(CO.stripe_billing, "fetch_subscription", _sub)

    row = SimpleNamespace(stripe_invoice_id="in_paid", id=7)

    class _Result:
        def scalars(self):
            return SimpleNamespace(first=lambda: row, all=lambda: [row])

    class _DB:
        async def execute(self, *_a, **_kw):
            return _Result()

    ctx = SimpleNamespace(studio_id=1, user=SimpleNamespace(id=1, name="O", last_name=""))
    result = asyncio.run(CO._renewal_invoice(
        _DB(), ctx, _plan(), "cus_1", "s5", 1, False, None,
    ))
    assert result.id == "in_new"
    assert len(created) == 1
