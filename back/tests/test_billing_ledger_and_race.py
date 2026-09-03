"""Две тонкие правки денежного пути, которые молчат до боевого прогона.

1. **Гонка выпуска счёта.** Счета постоплаты заводятся строкой в БД ДО похода в
   Stripe. Событие по счёту может прилететь раньше, чем мы запишем
   `stripe_invoice_id`, и тогда вебхук заводил ВТОРУЮ строку, наш commit падал на
   уникальном индексе, а `_finish_pending` выпускал студии второй документ за тот
   же месяц. Ссылка на нашу строку теперь едет в метаданных счёта.

3. **Досылка невыставленных счетов роняла проход целиком.** Откат внутри цикла
   обесценивает ORM-объекты, выбранные до него, — см. раздел 3.

2. **Откат дохода платформы.** Возврат и проигранный спор снимают ранее
   записанный доход компенсирующей строкой. Сумму по онлайн-комиссии берём У
   STRIPE: вернулась она студии или осталась у платформы — решает студия галкой в
   своём дашборде, и угадывание ошибалось бы примерно в половине случаев.

Запуск из back/:  python -m tests.test_billing_ledger_and_race
"""
import asyncio
from types import SimpleNamespace

from sqlalchemy.exc import MissingGreenlet

import services.offline_fee_billing as OFB
from routers.billing.webhook import _adopt_local_invoice
from routers.checkout import stripe_pay as SP


class _R:
    def __init__(self, v): self._v = v
    def scalar_one_or_none(self): return self._v
    def scalar_one(self): return self._v


class _DB:
    def __init__(self, found=None):
        self.found = found
        self.queries = 0
        self.revenue = []

    async def execute(self, _q):
        self.queries += 1
        return _R(self.found)


# --------------------------------------------------------------------------
# 1. Гонка: вебхук находит НАШУ строку по метаданным, а не заводит вторую
# --------------------------------------------------------------------------

_PLAN = SimpleNamespace(studio_id=7)


def _meta(**kw):
    return SimpleNamespace(**kw)


def test_adopts_local_row_by_metadata():
    """invoice_id в метаданных → строка находится и получает ссылку на счёт Stripe."""
    row = SimpleNamespace(id=42, stripe_invoice_id=None)
    db = _DB(found=row)
    got = asyncio.run(_adopt_local_invoice(db, _PLAN, "in_live_1", _meta(invoice_id="42")))
    assert got is row
    assert row.stripe_invoice_id == "in_live_1", "ссылка не проставлена — вебхук заведёт вторую строку"


def test_no_metadata_means_no_lookup():
    """Счёт за тариф метаданных с invoice_id не несёт — в БД за ним не ходим вовсе."""
    db = _DB(found=SimpleNamespace(id=1, stripe_invoice_id=None))
    assert asyncio.run(_adopt_local_invoice(db, _PLAN, "in_1", _meta(kind="subscription"))) is None
    assert asyncio.run(_adopt_local_invoice(db, _PLAN, "in_1", None)) is None
    assert db.queries == 0, "лишний запрос на каждый счёт за тариф"


def test_garbage_metadata_does_not_crash_the_webhook():
    """Мусор в invoice_id не роняет обработку: 500 здесь = ретрай оплаченного счёта."""
    db = _DB(found=None)
    assert asyncio.run(_adopt_local_invoice(db, _PLAN, "in_1", _meta(invoice_id="не число"))) is None
    assert db.queries == 0


def test_missing_row_returns_none():
    """Строки нет (её уже подхватили или это чужой счёт) → None, вебхук заведёт свою."""
    db = _DB(found=None)
    assert asyncio.run(_adopt_local_invoice(db, _PLAN, "in_1", _meta(invoice_id="42"))) is None
    assert db.queries == 1


# --------------------------------------------------------------------------
# 2. Откат доли платформы: снимаем ровно то, что Stripe реально вернул
# --------------------------------------------------------------------------

class _LedgerDB(_DB):
    async def execute(self, _q):
        self.queries += 1
        return _R(SimpleNamespace(id=1, currency="CZK"))


def _run_reverse(application_fee, refunded, charge_id="ch_1"):
    """Прогон _reverse_platform_fee с подменённым Stripe. Возвращает записи леджера."""
    checkout = SimpleNamespace(
        application_fee=application_fee, account_id="acct_1",
        session_id="cs_1", studio_id=7,
    )
    db = _LedgerDB()
    recorded = []

    async def fake_fee(_charge, _acct):
        if refunded is None:
            raise RuntimeError("Stripe недоступен")
        return refunded

    async def fake_record(_db, studio_id, source, amount, currency, external_id):
        recorded.append((studio_id, source, amount, currency, external_id))

    saved = (SP.stripe_connect.refunded_application_fee, SP.platform_fee.record_revenue)
    SP.stripe_connect.refunded_application_fee = fake_fee
    SP.platform_fee.record_revenue = fake_record
    try:
        asyncio.run(SP._reverse_platform_fee(db, checkout, charge_id))
    finally:
        (SP.stripe_connect.refunded_application_fee, SP.platform_fee.record_revenue) = saved
    return recorded


def test_reverses_exactly_what_stripe_returned():
    """Комиссия вернулась студии → минусовая строка ровно на неё, со своим external_id."""
    assert _run_reverse(4500, 4500) == [
        (7, "connect_fee", -4500, "CZK", "rev:cs:cs_1"),
    ]


def test_fee_kept_by_platform_is_not_reversed():
    """Возврат платежа комиссию НЕ возвращает по умолчанию — доход остаётся нашим.

    Снять его «на всякий случай» значило бы занизить собственную выручку и
    недосчитать фактуру за онлайн-комиссию.
    """
    assert _run_reverse(4500, 0) == []


def test_partial_fee_refund_reverses_partially():
    """Вернулась часть — снимаем часть, а не всю удержанную сумму."""
    assert _run_reverse(4500, 1500) == [
        (7, "connect_fee", -1500, "CZK", "rev:cs:cs_1"),
    ]


def test_nothing_withheld_means_no_stripe_call():
    """Тариф-подписка: доли платформы с транзакций нет — в Stripe не ходим."""
    assert _run_reverse(0, 4500) == []
    assert _run_reverse(4500, 4500, charge_id=None) == []


def test_stripe_failure_does_not_break_the_refund():
    """Stripe не ответил → строку не пишем и НЕ падаем: возврат уже проведён,
    и упавший запрос не повод оставить абонемент живым."""
    assert _run_reverse(4500, None) == []


if __name__ == "__main__":
    test_adopts_local_row_by_metadata()
    test_no_metadata_means_no_lookup()
    test_garbage_metadata_does_not_crash_the_webhook()
    test_missing_row_returns_none()
    test_reverses_exactly_what_stripe_returned()
    test_fee_kept_by_platform_is_not_reversed()
    test_partial_fee_refund_reverses_partially()
    test_nothing_withheld_means_no_stripe_call()
    test_stripe_failure_does_not_break_the_refund()
    print("ALL PASS — леджер и гонка выпуска счёта")


# --------------------------------------------------------------------------
# 3. Досылка счетов: сбой по одному не имеет права уносить проход целиком
# --------------------------------------------------------------------------

class _ExpiringInvoice:
    """ORM-объект внутри async-сессии.

    `Session.rollback()` обесценивает ВЕСЬ identity map — безусловно, флаг
    `expire_on_commit=False` его не касается (sqlalchemy/orm/session.py,
    `_restore_snapshot(dirty_only=False)`). Дальше обращение к любому полю
    требует нового SELECT, а синхронный доступ к атрибуту в async-сессии сходить
    в БД не может. Ровно это и моделируем: за откатом `invoice.id` падает
    MissingGreenlet.
    """

    def __init__(self, **fields):
        self.__dict__["_data"] = fields
        self.__dict__["_expired"] = False

    def _expire(self):
        self.__dict__["_expired"] = True

    def _revive(self):
        """db.get() перечитывает строку — это законный await, объект оживает."""
        self.__dict__["_expired"] = False

    def __getattr__(self, name):
        if self.__dict__["_expired"]:
            raise MissingGreenlet(
                "greenlet_spawn has not been called; can't call await_only() here"
            )
        try:
            return self.__dict__["_data"][name]
        except KeyError:
            raise AttributeError(name) from None


class _FinishDB:
    """Сессия под `_finish_pending`. Отвечает по таблице в запросе.

    Сессия помнит, что отдала наружу: колоночный select отдаёт обычные значения
    (их откат не касается), select по сущности — живые объекты, которые откат
    обесценивает.
    """

    def __init__(self, invoices, plan):
        self.invoices = invoices
        self.plan = plan
        self.rollbacks = 0

    async def execute(self, query):
        sql = str(query)
        if "count(" in sql:
            return SimpleNamespace(scalar=lambda: 3)
        if "studio_billing_plans" in sql:
            return SimpleNamespace(scalar_one_or_none=lambda: self.plan)
        if "billing_invoices" in sql:
            # Колоночный select (только id) против select по сущности.
            columns = [c["name"] for c in query.column_descriptions]
            if columns == ["id"]:
                return SimpleNamespace(
                    scalars=lambda: SimpleNamespace(
                        all=lambda: [inv.id for inv in self.invoices]
                    )
                )
            return SimpleNamespace(
                scalars=lambda: SimpleNamespace(all=lambda: list(self.invoices))
            )
        raise AssertionError(f"неожиданный запрос: {sql}")

    async def get(self, _model, pk):
        for inv in self.invoices:
            if inv.__dict__["_data"]["id"] == pk:
                inv._revive()
                return inv
        return None

    async def commit(self):
        pass

    async def rollback(self):
        self.rollbacks += 1
        for inv in self.invoices:
            inv._expire()


def test_a_failed_reissue_does_not_take_the_whole_pass_down(monkeypatch):
    """Сбой по одному счёту не должен уносить досылку целиком.

    Дело не в `try/except` — он тут был. Ловушка в откате: он обесценивает все
    ORM-объекты, выбранные ДО цикла, и следующее `invoice.id` уходит за SELECT'ом,
    падая MissingGreenlet. Причём падает и сам обработчик ошибки, на `invoice.id`
    внутри logger.exception, — то есть мимо `except`. Наружу улетало вторичное
    исключение, унося и настоящую причину сбоя, и все оставшиеся счета. Раз в час,
    пока счёт висит невыставленным.
    """
    invoices = [
        _ExpiringInvoice(id=1, studio_id=7, kind="offline_fee", amount=500),
        _ExpiringInvoice(id=2, studio_id=7, kind="offline_fee", amount=700),
    ]
    db = _FinishDB(invoices, plan=SimpleNamespace(studio_id=7))

    issued = []

    async def fake_issue(_db, invoice, customer_id, description):
        if invoice.id == 1:
            raise RuntimeError("Stripe не ответил")
        issued.append(invoice.id)

    async def fake_customer(_db, _plan):
        return "cus_1"

    monkeypatch.setattr(OFB, "_issue_to_stripe", fake_issue)
    monkeypatch.setattr(OFB, "_ensure_studio_customer", fake_customer)

    assert asyncio.run(OFB._finish_pending(db)) == 1
    assert issued == [2], "досылка встала на первом же сбое"
    assert db.rollbacks == 1
