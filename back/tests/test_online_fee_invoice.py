"""Фактура за онлайн-комиссию: документ на деньги, которые УЖЕ удержаны.

Свою долю с платежа клиента Stripe снимает в момент оплаты
(`application_fee_amount`) и кладёт строкой леджера `connect_fee`. Раньше этим всё
и заканчивалось: студия на «проценте» платила комиссию и не могла списать её в
расход, а у платформы не было фактуры на собственный доход. Офлайн-комиссия
документ имела всегда, онлайновая — ни одного.

Инварианты, каждый из которых стоит денег той или другой стороне:

  1. Фактура НЕ просит оплату. Деньги уже у платформы — обычный счёт означал бы
     требование заплатить комиссию второй раз.
  2. Фактура НИКОГО не блокирует. `online_fee` не входит в SUSPENDING_KINDS и не
     несёт `due_at`: просроченный срок по оплаченному документу закрыл бы студии
     и CRM, и мини-приложение ни за что.
  3. Доход не записывается в леджер второй раз. Он уже там строками `connect_fee`;
     дубль удвоил бы выручку платформы и завысил `_month_platform_revenue`, по
     которой считается минимальный месячный платёж, — студия недополучила бы счёт.
  4. За один месяц фактура выпускается один раз.
  5. Нет курса валюты — откладываем ЦЕЛИКОМ, а не выпускаем на неполную сумму:
     документ, не сходящийся с выпиской, хуже отсутствующего.

Сеть и БД не трогаем — Stripe подменяется заглушками.

Запуск из back/:  python -m pytest tests/test_online_fee_invoice.py
"""
import asyncio
import inspect
from types import SimpleNamespace

import pytest
import stripe

import routers.billing.webhook as WH
import services.offline_fee_billing as OFB
import services.platform_fee as PF
import services.stripe_billing as SB


# ------------------------------------------- 1. фактура не просит оплату

def test_settled_invoice_is_issued_already_paid():
    """`paid_out_of_band=True` — «оплачено мимо Stripe». Без него Stripe считал бы
    счёт неоплаченным и начал взыскание уже полученных денег."""
    calls = {}
    saved = (
        stripe.Invoice.create, stripe.InvoiceItem.create,
        stripe.Invoice.finalize_invoice, stripe.Invoice.pay, stripe.Invoice.send_invoice,
    )
    stripe.Invoice.create = lambda **kw: (calls.update(create=kw), SimpleNamespace(id="in_1"))[1]
    stripe.InvoiceItem.create = lambda **kw: (calls.update(item=kw), SimpleNamespace(id="ii_1"))[1]
    stripe.Invoice.finalize_invoice = lambda i, **kw: SimpleNamespace(id=i)
    stripe.Invoice.pay = lambda i, **kw: (calls.update(pay=kw), SimpleNamespace(id=i))[1]
    stripe.Invoice.send_invoice = lambda *a, **kw: calls.update(sent=True)
    try:
        asyncio.run(SB.create_settled_invoice("cus_1", 4500, "eur", "комиссия", {"kind": "online_fee"}))
    finally:
        (
            stripe.Invoice.create, stripe.InvoiceItem.create,
            stripe.Invoice.finalize_invoice, stripe.Invoice.pay, stripe.Invoice.send_invoice,
        ) = saved

    assert calls["pay"]["paid_out_of_band"] is True
    # auto_advance=False обязателен вместе с этим: иначе Stripe сам погнал бы счёт
    # по обычному циклу сбора платежа.
    assert calls["create"]["auto_advance"] is False
    # Письма «оплатите» быть не должно: платить нечего.
    assert "sent" not in calls, "по уже оплаченной фактуре ушло требование оплаты"


def test_invoice_items_carry_a_tax_behavior():
    """Регрессия на живой 502 (10.08.2026): «The price … does not have a tax
    behavior set, which is required for automatic tax computation».

    Позиция, заданная голой суммой, порождает у Stripe одноразовый Price без
    признака обложения. Со включённым automatic_tax расчёт налога отваливается
    целиком — и падает НЕ только продление, а всё, что выпускается этой парой
    функций: счёт за офлайн-комиссию, минимальный платёж, фактура за онлайн.
    Причём два из трёх выпускает фоновый воркер, где падение видно только в логах.

    Проверяем ОБЕ функции: признак нужен там, где включён automatic_tax.
    """
    import services.stripe_billing as SB

    for factory, kwargs in (
        (SB.create_fee_invoice, dict(days_until_due=7)),
        (SB.create_settled_invoice, {}),
    ):
        calls = {}
        saved = (
            stripe.Invoice.create, stripe.InvoiceItem.create,
            stripe.Invoice.finalize_invoice, stripe.Invoice.pay, stripe.Invoice.send_invoice,
        )
        stripe.Invoice.create = lambda **kw: (calls.update(create=kw), SimpleNamespace(id="in_1"))[1]
        stripe.InvoiceItem.create = lambda **kw: (calls.update(item=kw), SimpleNamespace(id="ii_1"))[1]
        stripe.Invoice.finalize_invoice = lambda i, **kw: SimpleNamespace(id=i)
        stripe.Invoice.pay = lambda i, **kw: SimpleNamespace(id=i)
        stripe.Invoice.send_invoice = lambda *a, **kw: None
        try:
            asyncio.run(factory("cus_1", 4500, "eur", "позиция", metadata={}, **kwargs))
        finally:
            (
                stripe.Invoice.create, stripe.InvoiceItem.create,
                stripe.Invoice.finalize_invoice, stripe.Invoice.pay, stripe.Invoice.send_invoice,
            ) = saved

        assert calls["create"]["automatic_tax"] == {"enabled": True}, factory.__name__
        assert calls["item"]["tax_behavior"] == SB.TAX_BEHAVIOR, factory.__name__
        assert calls["item"]["tax_code"] == SB.TAX_CODE, factory.__name__


def test_tax_settings_are_shared_with_the_price_catalog():
    """Одна категория и один способ обложения на тариф и на комиссию: у одного
    продавца они разъезжаться не могут. Вторая копия константы однажды разъедется."""
    import services.stripe_billing as SB
    import services.stripe_catalog as SC

    assert (SC.TAX_BEHAVIOR, SC.TAX_CODE) == (SB.TAX_BEHAVIOR, SB.TAX_CODE)
    assert SB.TAX_BEHAVIOR == "exclusive", "цены заданы БЕЗ налога, налог сверху"


def test_settled_invoice_item_is_pinned_to_its_invoice():
    """InvoiceItem без явного `invoice` становится отложенным и приклеивается к
    следующему счёту подписки — сумма за тариф выросла бы на величину комиссии."""
    assert 'invoice=invoice.id' in inspect.getsource(SB.create_settled_invoice)
    assert 'pending_invoice_items_behavior="exclude"' in inspect.getsource(SB.create_settled_invoice)


# ------------------------------------------- 2. фактура никого не блокирует

def test_online_fee_is_not_a_suspending_document():
    """Главный инвариант. Деньги за онлайн уже получены — блокировать за них
    нельзя ни при каких обстоятельствах."""
    assert "online_fee" not in PF.SUSPENDING_KINDS
    assert set(PF.SUSPENDING_KINDS) == {"offline_fee", "min_fee"}


def test_online_fee_invoice_carries_no_due_date():
    """Вторая половина той же защиты: блокировка ищет счёт с `due_at` в прошлом.
    Непустой срок у оплаченного документа закрыл бы студию ни за что."""
    assert "due_at=None" in inspect.getsource(OFB._bill_online_fees)
    # Срок проставляет выдача (_issue_to_stripe) — и делает это ТОЛЬКО в ветке
    # счетов, которые просят денег. Ветка online_fee обязана оставить его пустым:
    # деньги по ней уже удержаны, просить их второй раз и тем более блокировать
    # за неуплату нечего.
    assert "invoice.due_at = None" in inspect.getsource(OFB._issue_to_stripe)


def test_online_fee_is_closed_locally_right_after_issuing():
    """Локальная строка закрывается сразу: иначе она висела бы `pending` с
    несуществующим долгом и путала бы и виджет, и владельца."""
    src = inspect.getsource(OFB._issue_to_stripe)
    assert 'invoice.status = "paid"' in src


# ------------------------------------------- 3. доход не удваивается

def test_online_fee_is_never_recorded_as_revenue_twice():
    """Деньги уже в леджере строками connect_fee. Вторая запись удвоила бы выручку
    платформы и завысила расчёт минимального месячного платежа."""
    assert "online_fee" not in WH._REVENUE_SOURCE


def test_every_other_kind_keeps_its_own_source():
    """Раньше здесь была заглушка «offline_fee или иначе subscription», и любой
    новый вид счёта молча записывался бы выручкой за подписку."""
    assert WH._REVENUE_SOURCE == {
        "subscription": "subscription",
        "offline_fee": "offline_fee",
        "min_fee": "min_fee",
    }


def test_ledger_source_of_online_money_stays_connect_fee():
    """Расчёт минимума читает именно connect_fee — переименование источника
    обнулило бы выручку студии в его глазах и выставило лишний счёт."""
    assert 'source == "connect_fee"' in inspect.getsource(OFB._month_platform_revenue)
    assert '"connect_fee"' in inspect.getsource(OFB._bill_online_fees)


# ------------------------------------------- 4. один месяц — одна фактура

def _db(first=None):
    class _DB:
        async def execute(self, _q):
            return SimpleNamespace(
                first=lambda: first,
                all=lambda: [],
                scalar_one_or_none=lambda: None,
                scalars=lambda: SimpleNamespace(all=lambda: []),
            )

        async def commit(self):
            pass

    return _DB()


def test_second_run_in_the_same_month_issues_nothing():
    """Проход идемпотентен: повторный тик не выпускает вторую фактуру за тот же
    месяц. Гарантию даёт уникальный индекс, эта проверка бережёт поход в Stripe."""
    from datetime import datetime

    result = asyncio.run(OFB._bill_online_fees(
        _db(first=(1,)), 7, datetime(2026, 7, 1), datetime(2026, 8, 1),
    ))
    assert result is None


def test_month_without_online_payments_issues_nothing():
    """Леджер пуст — документа нет вовсе, а не фактура на ноль."""
    from datetime import datetime

    result = asyncio.run(OFB._bill_online_fees(
        _db(first=None), 7, datetime(2026, 7, 1), datetime(2026, 8, 1),
    ))
    assert result is None


def test_uniqueness_is_guaranteed_by_the_index_not_only_by_the_check():
    """Проверка в коде закрывает гонку не полностью — закрывает её индекс."""
    from models import BillingInvoice

    names = {c.name for c in BillingInvoice.__table_args__}
    assert "uq_billing_invoice_period" in names


# ------------------------------------------- 5. нет курса — откладываем целиком

def test_missing_rate_postpones_the_whole_invoice():
    """Выпустить фактуру на часть удержанного значит выдать документ, который не
    сойдётся с выпиской. Возвращаем None и ждём курса."""
    src = inspect.getsource(OFB._bill_online_fees)
    assert "if converted is None" in src
    assert "return None" in src.split("if converted is None")[1][:400]


# ------------------------------------------- документы различимы для бухгалтера

def test_online_and_offline_descriptions_are_not_interchangeable():
    """Студия видит эту строку в фактуре. «Комиссия» без пояснения, откуда взялись
    деньги, порождает вопрос «почему счёт уже оплачен»."""
    online = OFB._describe(SimpleNamespace(kind="online_fee", period="2026-07"), 0)
    offline = OFB._describe(SimpleNamespace(kind="offline_fee", period="2026-07"), 12)
    assert "онлайн" in online and "удержана" in online
    assert "офлайн" in offline
    assert online != offline
    # Числа операций у онлайна быть не должно: в досылке count считается по
    # строкам OfflineTransactionFee, которых у онлайна нет, и уехало бы «0 операц.».
    assert "0 операц" not in online


# ------------------------------------------- уведомление платформе

def test_platform_notice_ignores_the_studio_receipt_toggle():
    """Тумблер «Чек на email» принадлежит владельцу студии и управляет ЕГО
    письмами. Отчётность платформы отключаться настройкой студии не должна."""
    import services.billing_mail as BM

    assert "email_receipt_enabled" not in inspect.getsource(BM.send_platform_income)


def test_platform_notice_is_silent_without_an_address():
    """Адрес не задан — тихо выходим. Отсутствие настройки не должно ронять
    обработку платежа."""
    import services.billing_mail as BM

    saved = BM.PLATFORM_BILLING_EMAIL
    BM.PLATFORM_BILLING_EMAIL = ""
    try:
        assert asyncio.run(BM.send_platform_income(_db(), SimpleNamespace(id=1))) is False
    finally:
        BM.PLATFORM_BILLING_EMAIL = saved


def test_platform_notice_covers_every_kind_of_income():
    """Пропущенный вид дохода печатался бы в письме сырым ключом."""
    import services.billing_mail as BM

    assert set(BM._INCOME_KIND) == {"subscription", "offline_fee", "min_fee", "online_fee"}


if __name__ == "__main__":
    import sys
    sys.exit(pytest.main([__file__, "-q"]))
