"""Закрытие платёжного аудита 29.08.2026: возврат, чарджбэк, grace, сверка.

Предыдущий проход (tests/test_payment_audit.py) закрыл пять P1. Этот закрывает
то, что тогда осталось непроверенным, и одну дыру, которую нашли уже при разборе
фактической версии Stripe API.

  1. ВОЗВРАТ ЗА ТАРИФ НЕ ОТЗЫВАЛ ДОСТУП (найдено сейчас, P1).
     `_handle_refund` искал счёт в поле `Charge.invoice`. В API 2026-07-29 у
     Charge этого поля НЕТ ВООБЩЕ (проверено по SDK 15.4.0: единственное
     упоминание слова invoice в объекте — докстринг про receipt_url), как нет и
     `PaymentIntent.invoice`; связь переехала в `Invoice.payments`. Обработчик
     выходил на первой же строке: счёт не переводился в refunded, компенсирующая
     строка в леджер не писалась, подписка НЕ отменялась. Владелец возвращал
     деньги кнопкой и доигрывал оплаченный период бесплатно.
     Прежний тест этого не ловил, потому что сам подкладывал в фейковый Charge
     поле `invoice`, которого в проде не существует, — здесь оно НЕ подкладывается.

  2. ЧАРДЖБЭК ПО ТАРИФУ НЕ ОТЗЫВАЛ ДОСТУП (P2-D).
     При возврате платёж назад инициируем мы и получаем `charge.refunded`. При
     чарджбэке деньги забирает банк, и `charge.refunded` не приходит вовсе —
     только `charge.dispute.closed`, на который биллинг не был подписан и
     которого не умел обрабатывать. Владелец оспаривал списание, выигрывал у
     банка и оставался с деньгами И с доступом.

  3. WON НЕ ДОЛЖЕН ОТЗЫВАТЬ. Обратная ошибка не дешевле: студия, которая спор
     выиграла (деньги остались у платформы), не может потерять оплаченный тариф.

  4. GRACE ПРИ `past_due` (P2-A). Гейт пускал студию, пока `expires_at` в
     будущем, а зеркало двигало `expires_at` на конец НОВОГО периода даже при
     неудавшемся списании. Ограничивал только dunning Stripe — то есть настройка
     в чужом интерфейсе, где «leave past due» превращала неоплаченный счёт в
     бессрочный бесплатный продукт.

  5. СВЕРКА ПОТЕРЯННЫХ ОПЛАТ КЛИЕНТОВ (P2-B) и ВОССТАНОВЛЕНИЕ ОСИРОТЕВШЕЙ
     СЕССИИ (P2-C) — см. соответствующие разделы.

Сеть не трогаем: Stripe застублен. БД не трогаем: слой сессии застублен, как в
соседних файлах.

Запуск из back/:  python -m pytest tests/test_payment_closure.py
"""
import asyncio
import inspect
import sys
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy import Update

import routers.billing.webhook as WH
import routers.booking.miniapp_users as MU
import routers.checkout.stripe_pay as SP
import services.stripe_billing as SB

import routers.billing.router  # noqa: F401  (регистрация модуля в sys.modules)

BR = sys.modules["routers.billing.router"]


def _run(coro):
    return asyncio.run(coro)


# ─── общие заглушки ───────────────────────────────────────────────────────────

def _invoice(**kw):
    """Наша строка счёта. По умолчанию — оплаченный счёт за тариф."""
    return SimpleNamespace(**{
        "id": 5, "studio_id": 7, "kind": "subscription", "status": "paid",
        "stripe_invoice_id": None,          # None = леджер в этом тесте не трогаем
        "amount": 9900, "plan_name": "s15", "period": None, "period_months": 12,
        "paid_at": None, "payment_method": "card", "pdf_url": None,
        "hosted_invoice_url": None, **kw,
    })


class _DB:
    """Сессия, отвечающая ПО ТАБЛИЦЕ в запросе, а не по порядку вызовов.

    Порядковые заглушки ломаются от любой лишней выборки и молча начинают
    проверять не то: блокировка строки счёта в `apply_status` добавила один
    запрос, и последовательный стаб отдал бы на него строку тарифа.
    """

    def __init__(self, invoice=None, plan=None):
        self._invoice = invoice
        self._plan = plan
        self.commits = 0

    async def execute(self, query):
        sql = str(query)
        row = None
        if "billing_invoices" in sql:
            row = self._invoice
        elif "studio_billing_plans" in sql:
            row = self._plan
        return SimpleNamespace(scalar_one_or_none=lambda: row)

    async def commit(self):
        self.commits += 1


def _stub_stripe(monkeypatch, *, invoice_id="in_1", cancelled=None, raises=None):
    """Обратный резолв платежа и отмена подписки. Возвращает список отмен."""
    cancelled = [] if cancelled is None else cancelled

    async def fake_lookup(payment_intent=None, charge_id=None):
        if raises is not None:
            raise raises
        return invoice_id

    async def fake_cancel(subscription_id):
        cancelled.append(subscription_id)

    monkeypatch.setattr(SB, "invoice_id_for_payment", fake_lookup)
    monkeypatch.setattr(SB, "cancel_subscription", fake_cancel)
    return cancelled


# ─── 1. возврат за тариф на ФАКТИЧЕСКОЙ версии API ────────────────────────────

def _charge(**kw):
    """Charge ровно такой, каким его шлёт API 2026-07-29: БЕЗ поля `invoice`.

    Именно отсутствие поля и есть предмет теста — дописывать его сюда нельзя ни
    при каких обстоятельствах, иначе тест снова начнёт проверять несуществующую
    реальность.
    """
    return SimpleNamespace(**{
        "object": "charge", "id": "ch_1", "payment_intent": "pi_1",
        "amount": 9900, "amount_refunded": 9900, **kw,
    })


def test_a_charge_without_the_legacy_invoice_field_still_finds_our_invoice(monkeypatch):
    """Регрессия P1: возврат за тариф обязан отзывать тариф и на текущем API."""
    assert not hasattr(_charge(), "invoice"), "тест снова подкладывает поле, которого нет"

    cancelled = _stub_stripe(monkeypatch)
    invoice = _invoice()
    db = _DB(invoice=invoice, plan=SimpleNamespace(studio_id=7, stripe_subscription_id="sub_1"))

    _run(WH._handle_refund(db, _charge()))

    assert invoice.status == "refunded", "возврат не перевёл счёт — доступ остался оплаченным"
    assert cancelled == ["sub_1"], "подписка не отменена: деньги вернули, продукт остался"


def test_the_field_is_really_gone_from_the_sdk_we_ship():
    """Доказательство, а не вера в докстринг: ищем поле в самом объекте SDK.

    Появится обратно (откат версии API, апгрейд SDK) — тест упадёт, и быстрый
    путь в `_invoice_of_payment` снова станет основным. Это ровно та проверка,
    которой не хватало: прежний код молча зависел от исчезнувшего поля.
    """
    import re

    import stripe._charge as charge_module

    src = inspect.getsource(charge_module)
    block = src[src.index("class Charge("):]
    fields = dict(re.findall(r"^\s{4}(\w+): ([^\n=]+)$", block, re.M))
    assert "payment_intent" in fields, "пропал и payment_intent — резолв счёта сломан целиком"
    assert "invoice" not in fields, (
        "Charge.invoice снова существует — перепроверьте, какой путь резолва основной"
    )


def test_a_payment_we_cannot_link_changes_nothing(monkeypatch):
    """Чужой платёж или счёт вне нашей БД: тихо выходим, ничего не отзывая."""
    cancelled = _stub_stripe(monkeypatch, invoice_id=None)
    db = _DB(invoice=None, plan=None)
    _run(WH._handle_refund(db, _charge()))
    assert cancelled == []


def test_a_broken_lookup_is_not_swallowed(monkeypatch):
    """Сбой запроса к Stripe обязан долететь до вебхука: он отдаст 500, Stripe
    повторит. Проглотить значит потерять отзыв доступа насовсем."""
    _stub_stripe(monkeypatch, raises=RuntimeError("Stripe прилёг"))
    with pytest.raises(RuntimeError):
        _run(WH._handle_refund(_DB(), _charge()))


def test_a_partial_refund_still_does_not_revoke(monkeypatch):
    """Частичный возврат — не повод отобрать оплаченный период."""
    cancelled = _stub_stripe(monkeypatch)
    invoice = _invoice()
    db = _DB(invoice=invoice, plan=SimpleNamespace(studio_id=7, stripe_subscription_id="sub_1"))
    _run(WH._handle_refund(db, _charge(amount_refunded=1000)))
    assert invoice.status == "paid"
    assert cancelled == []


# ─── 2. чарджбэк по тарифу (P2-D) ─────────────────────────────────────────────

def _dispute(status="lost", **kw):
    """Dispute ровно в той форме, в какой его отдаёт API 2026-07-29."""
    return SimpleNamespace(**{
        "object": "dispute", "id": "dp_1", "status": status,
        "charge": "ch_1", "payment_intent": "pi_1", "amount": 9900, **kw,
    })


def test_a_lost_chargeback_revokes_the_tariff(monkeypatch):
    """Главный инвариант P2-D: деньги забрал банк — продукт заканчивается."""
    cancelled = _stub_stripe(monkeypatch)
    invoice = _invoice()
    db = _DB(invoice=invoice, plan=SimpleNamespace(studio_id=7, stripe_subscription_id="sub_1"))

    _run(WH._handle_dispute(db, _dispute("lost")))

    assert invoice.status == "refunded"
    assert cancelled == ["sub_1"]


def test_a_won_chargeback_takes_nothing_away(monkeypatch):
    """Обратная ошибка не дешевле: деньги остались у платформы, и отобрать у
    студии оплаченный тариф за то, что она спор проиграла, нельзя."""
    cancelled = _stub_stripe(monkeypatch)
    invoice = _invoice()
    db = _DB(invoice=invoice, plan=SimpleNamespace(studio_id=7, stripe_subscription_id="sub_1"))

    _run(WH._handle_dispute(db, _dispute("won")))

    assert invoice.status == "paid"
    assert cancelled == []


def test_an_unfinished_dispute_takes_nothing_away(monkeypatch):
    """Пока спор идёт, доступ не трогаем: `charge.dispute.created` и
    промежуточные статусы — не исход. `prevented` — тоже не потеря денег."""
    for status in (
        "needs_response", "under_review", "warning_needs_response",
        "warning_under_review", "warning_closed", "prevented", None, "какой-то новый",
    ):
        cancelled = _stub_stripe(monkeypatch)
        invoice = _invoice()
        db = _DB(invoice=invoice, plan=SimpleNamespace(studio_id=7, stripe_subscription_id="sub_1"))
        _run(WH._handle_dispute(db, _dispute(status)))
        assert invoice.status == "paid", status
        assert cancelled == [], status


def test_the_dispute_statuses_we_branch_on_exist_in_the_sdk():
    """`lost` и `won` — не выдуманные строки: сверяем с перечислением SDK."""
    import re

    import stripe._dispute as dispute_module

    src = inspect.getsource(dispute_module)
    # У Dispute несколько вложенных объектов со своим `status` — берём тот, что
    # объявлен на верхнем уровне класса (отступ ровно четыре пробела).
    block = re.search(r"^    status: Union\[\n(.*?)^    \]", src, re.S | re.M)
    assert block is not None, "разметка Dispute.status в SDK изменилась"
    literals = set(re.findall(r'"(\w+)"', block.group(1)))
    assert WH._DISPUTE_LOST in literals, literals
    assert "won" in literals and "prevented" in literals, literals


def test_a_repeated_dispute_event_does_not_cancel_twice(monkeypatch):
    """Ретрай Stripe и «чарджбэк поверх возврата» — один и тот же случай: счёт
    уже refunded, а этот статус конечный (apply_status под блокировкой строки)."""
    cancelled = _stub_stripe(monkeypatch)
    invoice = _invoice(status="refunded")
    db = _DB(invoice=invoice, plan=SimpleNamespace(studio_id=7, stripe_subscription_id="sub_1"))

    _run(WH._handle_dispute(db, _dispute("lost")))

    assert cancelled == [], "повтор события отменил подписку второй раз"


def test_a_refund_after_a_lost_dispute_is_a_noop(monkeypatch):
    """Обратный порядок событий — тот же ответ, и по той же причине."""
    cancelled = _stub_stripe(monkeypatch)
    invoice = _invoice(status="refunded")
    db = _DB(invoice=invoice, plan=SimpleNamespace(studio_id=7, stripe_subscription_id="sub_1"))
    _run(WH._handle_refund(db, _charge()))
    assert cancelled == []


def test_a_chargeback_on_a_commission_invoice_does_not_cancel_the_tariff(monkeypatch):
    """Комиссию и минимальный платёж возвращает поддержка руками. Отменять за это
    подписку значит закрыть студии доступ в наказание за нашу же ошибку в счёте.
    Сам счёт при этом refunded — это правда о деньгах."""
    for kind in ("offline_fee", "min_fee", "online_fee"):
        cancelled = _stub_stripe(monkeypatch)
        invoice = _invoice(kind=kind)
        db = _DB(invoice=invoice, plan=SimpleNamespace(studio_id=7, stripe_subscription_id="sub_1"))
        _run(WH._handle_dispute(db, _dispute("lost")))
        assert invoice.status == "refunded", kind
        assert cancelled == [], kind


def test_an_unknown_charge_does_not_crash_the_handler(monkeypatch):
    """Спор по платежу вне биллинга платформы (или уже удалённому счёту)."""
    cancelled = _stub_stripe(monkeypatch, invoice_id=None)
    _run(WH._handle_dispute(_DB(invoice=None), _dispute("lost")))
    assert cancelled == []


def test_a_dead_subscription_does_not_break_the_revocation(monkeypatch):
    """Подписка уже отменена — Stripe ответит ошибкой, но счёт к этому моменту
    переведён и закоммичен. Ронять обработку значит получить ретрай применённого
    события."""
    async def boom(_sub_id):
        raise RuntimeError("No such subscription")

    monkeypatch.setattr(SB, "cancel_subscription", boom)

    async def fake_lookup(payment_intent=None, charge_id=None):
        return "in_1"

    monkeypatch.setattr(SB, "invoice_id_for_payment", fake_lookup)
    invoice = _invoice()
    db = _DB(invoice=invoice, plan=SimpleNamespace(studio_id=7, stripe_subscription_id="sub_1"))

    _run(WH._handle_dispute(db, _dispute("lost")))          # не кидает
    assert invoice.status == "refunded"


def test_the_dispute_event_is_actually_wired_into_the_webhook():
    """Обработчик, до которого не доходит событие, — мёртвый код."""
    src = inspect.getsource(WH.stripe_webhook)
    assert '"charge.dispute.closed"' in src
    assert "_handle_dispute" in src


def test_connected_account_events_never_reach_the_billing_handlers():
    """Единственная защита от того, чтобы студия своим же аккаунтом дёргала
    биллинг платформы, — отбраковка по `event.account` ДО диспетчера."""
    src = inspect.getsource(WH.stripe_webhook)
    head = src.split("event_type = ")[0]
    assert 'getattr(event, "account", None)' in head
    assert 'return {"status": "ignored"}' in head


# ─── 3. общая точка отзыва ────────────────────────────────────────────────────

def test_refund_and_chargeback_revoke_through_one_and_the_same_code():
    """Два исхода — один смысл: денег у платформы нет. Разъехавшись, ветки дали
    бы разный доступ за одно и то же."""
    assert "_reverse_invoice" in inspect.getsource(WH._handle_refund)
    assert "_reverse_invoice" in inspect.getsource(WH._handle_dispute)
    # Отзыв идёт через apply_status — значит под блокировкой строки и с
    # компенсирующей записью в леджере, а не мимо них.
    assert "apply_status" in inspect.getsource(WH._reverse_invoice)


# ─── 5. grace при неоплаченной подписке (P2-A) ────────────────────────────────

def _subscription(status, start_days_ago, period_days):
    """Подписка Stripe в той форме, в какой её отдаёт API 2026-07-29: периоды
    лежат у ПОЗИЦИИ, а не у самой подписки."""
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=start_days_ago)
    item = SimpleNamespace(
        current_period_start=int(start.timestamp()),
        current_period_end=int((start + timedelta(days=period_days)).timestamp()),
    )
    return SimpleNamespace(
        id="sub_1", status=status, cancel_at_period_end=False,
        items=SimpleNamespace(data=[item]),
    )


def _mirror(subscription):
    plan = SimpleNamespace(
        studio_id=7, status="active", expires_at=None, auto_renewal=True,
    )
    WH._mirror_subscription_state(plan, subscription)
    return plan


def test_a_paid_subscription_gets_its_whole_period():
    """Потолок не должен трогать тех, кто заплатил: активная годовая подписка
    остаётся годовой."""
    plan = _mirror(_subscription("active", start_days_ago=1, period_days=365))
    assert plan.status == "active"
    assert plan.expires_at > datetime.utcnow() + timedelta(days=300)


def test_an_unpaid_year_does_not_buy_a_year_of_access():
    """Главный инвариант P2-A. Раньше `past_due` по годовому тарифу двигал срок
    на год вперёд: неоплаченный счёт давал год бесплатного продукта, а
    ограничивал только dunning Stripe — то есть галочка в чужом интерфейсе."""
    plan = _mirror(_subscription("past_due", start_days_ago=0, period_days=365))
    assert plan.status == "past_due"
    limit = datetime.utcnow() + WH.PAST_DUE_GRACE
    assert plan.expires_at <= limit + timedelta(minutes=1), plan.expires_at
    # И при этом доступ не отнимается мгновенно: перевод по IBAN идёт днями.
    assert plan.expires_at > datetime.utcnow() + timedelta(days=13)


def test_the_grace_is_anchored_to_the_period_not_to_now():
    """Stripe шлёт `customer.subscription.updated` на каждую попытку списания.
    Считай мы grace от «сейчас» — каждое такое событие продлевало бы бесплатный
    доступ, и он не кончался бы никогда. Отсчёт идёт от начала неоплаченного
    периода, поэтому повторные события ничего не двигают."""
    subscription = _subscription("past_due", start_days_ago=10, period_days=30)
    first = _mirror(subscription).expires_at
    second = _mirror(subscription).expires_at          # то же событие ещё раз
    assert first == second, "повтор события продлил grace"
    # Десять дней уже прошли — осталось четыре из четырнадцати.
    assert first < datetime.utcnow() + timedelta(days=5)


def test_a_long_overdue_subscription_is_already_out_of_grace():
    """Просрочка старше окна — доступа нет, что бы ни говорил dunning Stripe."""
    plan = _mirror(_subscription("past_due", start_days_ago=40, period_days=365))
    assert plan.expires_at < datetime.utcnow(), "неоплаченный сорокадневный долг всё ещё пускает"


def test_the_grace_never_outlives_the_period_itself():
    """Помесячная подписка: потолок — минимум из «начало + окно» и конца периода."""
    plan = _mirror(_subscription("past_due", start_days_ago=0, period_days=7))
    assert plan.expires_at <= datetime.utcnow() + timedelta(days=7, minutes=1)


def test_an_unreadable_period_start_does_not_hand_out_the_period():
    """Ошибаться безопаснее в сторону «не пустить»: платящая студия нажмёт
    «Оплатить» (счёт открыт), а неоплаченная не получит период целиком из-за
    нечитаемого поля."""
    broken = _subscription("past_due", start_days_ago=0, period_days=365)
    broken.items.data[0].current_period_start = None
    plan = _mirror(broken)
    assert plan.expires_at <= datetime.utcnow() + timedelta(seconds=5)


def test_a_recovered_payment_restores_the_full_period():
    """Деньги дошли — Stripe присылает `active`, и срок возвращается к полному."""
    plan = _mirror(_subscription("active", start_days_ago=10, period_days=365))
    assert plan.expires_at > datetime.utcnow() + timedelta(days=300)


def test_the_grace_length_is_the_products_own_promise():
    """Число не выдумано: столько продукт и так даёт на оплату выставленного
    счёта. Разъедется — платящая переводом студия начнёт получать 402."""
    assert WH.PAST_DUE_GRACE == timedelta(days=SB.DAYS_UNTIL_DUE)


# ─── 6. сверка потерянных оплат клиентов (P2-B) ───────────────────────────────

class _ReconDB:
    """Сессия под `reconcile_pending`: отдаёт список заявок и применяет UPDATE."""

    def __init__(self, rows):
        self._rows = rows
        self.commits = 0

    async def execute(self, query):
        if isinstance(query, Update):
            # Единственный UPDATE в проходе — закрытие заявки.
            for row in self._rows:
                if row.status == "pending":
                    row.status = "cancelled"
            return SimpleNamespace(rowcount=1)
        return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: list(self._rows)))

    async def commit(self):
        self.commits += 1

    async def rollback(self):
        pass


def _pending(**kw):
    return SimpleNamespace(**{
        "id": 1, "studio_id": 7, "account_id": "acct_1", "attempt_id": "att_1",
        "session_id": "cs_1", "status": "pending", "amount": 1500,
        "created_at": datetime.utcnow() - timedelta(hours=1), **kw,
    })


def _stub_connect(monkeypatch, *, session=None, reference=None, applied=None, raises=None):
    applied = [] if applied is None else applied

    async def fake_fetch(session_id, account_id):
        if raises is not None:
            raise raises
        return session

    async def fake_find(account_id, ref, created_after):
        return reference

    async def fake_apply(db, session_id, *, account_id=None, attempt_id=None):
        applied.append((session_id, account_id, attempt_id))
        return True

    monkeypatch.setattr(SP.stripe_connect, "fetch_session", fake_fetch)
    monkeypatch.setattr(SP.stripe_connect, "find_session_by_reference", fake_find)
    monkeypatch.setattr(SP, "apply_paid", fake_apply)
    return applied


def test_a_lost_webhook_is_recovered_by_reconciliation(monkeypatch):
    """Главный инвариант P2-B: покупка из мини-приложения проводится, даже если
    событие Stripe не доехало вовсе."""
    applied = _stub_connect(
        monkeypatch, session=SimpleNamespace(payment_status="paid", status="complete"),
    )
    rows = [_pending()]
    assert _run(SP.reconcile_pending(_ReconDB(rows))) == 1
    assert applied == [("cs_1", "acct_1", "att_1")]


def test_reconciliation_and_the_webhook_share_one_fulfillment_path():
    """Сверка НЕ имеет своей бизнес-логики: она зовёт тот же `apply_paid`, что и
    вебхук. Второй экземпляр проведения означал бы вторую пару глаз на деньги —
    и вторую возможность провести оплату дважды."""
    src = inspect.getsource(SP.reconcile_pending)
    assert "apply_paid(" in src
    for forbidden in ("perform_pay(", "attach_subscription(", "consume_quote("):
        assert forbidden not in src, forbidden


def test_an_unpaid_session_is_left_alone(monkeypatch):
    """Человек открыл форму и думает — это не повод закрывать заявку."""
    applied = _stub_connect(
        monkeypatch, session=SimpleNamespace(payment_status="unpaid", status="open"),
    )
    rows = [_pending()]
    assert _run(SP.reconcile_pending(_ReconDB(rows))) == 0
    assert applied == []
    assert rows[0].status == "pending"


def test_an_expired_session_closes_the_request(monkeypatch):
    """Протухшая форма: денег по ней не будет, и заявка не должна висеть вечно.

    Тот же переход, что делает вебхук по `checkout.session.expired`, — просто
    выясненный опросом, потому что событие могло не дойти.
    """
    applied = _stub_connect(
        monkeypatch, session=SimpleNamespace(payment_status="unpaid", status="expired"),
    )
    rows = [_pending()]
    assert _run(SP.reconcile_pending(_ReconDB(rows))) == 0
    assert applied == [], "по протухшей сессии нельзя проводить продажу"
    assert rows[0].status == "cancelled"


def test_stripe_being_down_does_not_touch_the_request(monkeypatch):
    """Сбой запроса — заявка остаётся как была, разберём в следующий проход."""
    _stub_connect(monkeypatch, raises=RuntimeError("Stripe прилёг"))
    rows = [_pending()]
    assert _run(SP.reconcile_pending(_ReconDB(rows))) == 0
    assert rows[0].status == "pending"


def test_a_business_rejection_does_not_stop_the_pass(monkeypatch):
    """Одна заявка ушла в разбор вручную — остальные обязаны быть разобраны."""
    calls = []

    async def fake_fetch(session_id, account_id):
        return SimpleNamespace(payment_status="paid", status="complete")

    async def fake_apply(db, session_id, *, account_id=None, attempt_id=None):
        calls.append(session_id)
        if session_id == "cs_bad":
            raise HTTPException(status_code=409, detail={"code": "checkout.paid_not_applied"})
        return True

    monkeypatch.setattr(SP.stripe_connect, "fetch_session", fake_fetch)
    monkeypatch.setattr(SP, "apply_paid", fake_apply)

    rows = [_pending(id=1, session_id="cs_bad"), _pending(id=2, session_id="cs_ok")]
    assert _run(SP.reconcile_pending(_ReconDB(rows))) == 1
    assert calls == ["cs_bad", "cs_ok"]


def test_only_stale_pending_requests_are_touched():
    """Свежая заявка в разбор не попадает: человек ещё платит."""
    src = inspect.getsource(SP.reconcile_pending)
    assert "RECONCILE_AFTER" in src
    assert 'StripeCheckout.status == "pending"' in src
    assert SP.RECONCILE_AFTER >= timedelta(minutes=10), "окно слишком короткое"


# ─── 7. осиротевшая сессия (P2-C) ─────────────────────────────────────────────

def test_a_request_without_a_session_id_finds_it_by_our_own_reference(monkeypatch):
    """Процесс упал между ответом Stripe и коммитом: сессия жива, id не записан.
    Ищем по `client_reference_id` — иначе оплата по ней не находится ничем."""
    applied = _stub_connect(
        monkeypatch, reference="cs_found",
        session=SimpleNamespace(payment_status="paid", status="complete"),
    )
    rows = [_pending(session_id=None)]
    assert _run(SP.reconcile_pending(_ReconDB(rows))) == 1
    assert applied == [("cs_found", "acct_1", "att_1")]


def test_a_young_orphan_is_not_closed_yet(monkeypatch):
    """Сессии не видно — но её могло не быть видно и по отставанию списка.
    Ждём дольше её собственного срока жизни, прежде чем закрывать."""
    _stub_connect(monkeypatch, reference=None)
    rows = [_pending(session_id=None)]
    assert _run(SP.reconcile_pending(_ReconDB(rows))) == 0
    assert rows[0].status == "pending"


def test_an_old_orphan_is_finally_closed(monkeypatch):
    """Форма так и не создалась — заявка не должна висеть в pending вечно."""
    _stub_connect(monkeypatch, reference=None)
    rows = [_pending(session_id=None, created_at=datetime.utcnow() - timedelta(days=3))]
    assert _run(SP.reconcile_pending(_ReconDB(rows))) == 0
    assert rows[0].status == "cancelled"


def test_the_reservation_happens_before_the_stripe_call():
    """Порядок и есть исправление: строка заявки коммитится ДО создания сессии.
    Обратный порядок — то самое окно, в котором оплата теряется целиком."""
    src = inspect.getsource(SP.create_session)
    assert src.index("reserve_checkout(") < src.index("create_checkout_session("), (
        "сессия Stripe снова создаётся раньше локальной заявки"
    )
    mini = inspect.getsource(MU.create_checkout_session)
    assert mini.index("reserve_checkout(") < mini.index("create_hosted_checkout_session(")


def test_a_failed_stripe_call_leaves_the_request_for_reconciliation():
    """Заявку НЕ отменяем на ошибке: Stripe мог принять запрос, а потеряться
    могла наша сторона ответа. Отменить значит выбросить единственную ниточку к
    возможно оплаченной сессии."""
    src = inspect.getsource(SP.create_session)
    tail = src[src.index("except Exception as exc:"):]
    assert 'status = "cancelled"' not in tail, "заявка отменяется на сбое — оплата станет невосстановимой"


def test_the_attempt_link_cannot_hijack_someone_elses_request():
    """Усыновление по attempt_id разрешено ТОЛЬКО для заявки без сессии. Иначе
    чужой (или уже связанный) платёж переклеивался бы на другую покупку."""
    src = inspect.getsource(SP.apply_paid)
    assert "StripeCheckout.session_id.is_(None)" in src
    assert "StripeCheckout.attempt_id == attempt_id" in src


def test_the_attempt_id_is_never_taken_from_the_client():
    """Ключ попытки генерирует сервер. Приняв его снаружи, мы дали бы возможность
    приклеиться к чужой заявке."""
    for src in (inspect.getsource(SP.create_session), inspect.getsource(MU.create_checkout_session)):
        assert "body.attempt_id" not in src
        assert "attempt_id=body" not in src
    # В схемах запроса поля тоже нет.
    from schemas.checkout import CheckoutPayRequest

    assert "attempt_id" not in CheckoutPayRequest.model_fields


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-q"]))


# ─── 4. подписка вебхуков сверяется с кодом, а не с памятью ───────────────────

def test_preflight_demands_every_event_the_code_handles():
    """Обработчик, на событие которого эндпоинт не подписан, — мёртвый код.

    Проверка живёт в preflight (она ходит в Stripe), но СПИСОК обязан совпадать с
    тем, что реально разбирает вебхук. Разъехавшись, preflight начнёт зеленеть на
    конфигурации, где половина веток не выполняется никогда — ровно так и жил
    `charge.dispute.closed` до этого прохода.
    """
    import re

    import routers.checkout.stripe_pay as SP
    from scripts import preflight

    billing_src = inspect.getsource(WH.stripe_webhook)
    # Событие, которое обработчик разбирает по точному имени.
    handled = set(re.findall(r'event_type == "([\w.]+)"', billing_src))
    # И семейства, которые он берёт по префиксу (customer.subscription.*).
    prefixes = set(re.findall(r'event_type\.startswith\("([\w.]+)"\)', billing_src))

    for name in handled:
        assert name in preflight._BILLING_EVENTS, (
            f"вебхук биллинга разбирает {name}, а preflight его не требует"
        )
    for prefix in prefixes:
        assert any(e.startswith(prefix) for e in preflight._BILLING_EVENTS), prefix

    # Касса: события перечислены константами, их и сверяем.
    connect_handled = set(SP._PAID_EVENTS) | set(SP._DEAD_EVENTS) | set(SP._REVERSED_EVENTS)
    connect_handled.add(SP._DISPUTE_CLOSED_EVENT)
    assert connect_handled <= preflight._CONNECT_EVENTS, (
        connect_handled - preflight._CONNECT_EVENTS
    )


def test_preflight_checks_are_actually_wired_into_the_run():
    """Проверка, которую не зовёт main(), не проверяет ничего."""
    from scripts import preflight

    src = inspect.getsource(preflight.main)
    assert "check_webhook_endpoints()" in src
    assert "check_duplicate_customers()" in src


# ─── 8. третий проход red team: новые поверхности ─────────────────────────────

def test_a_foreign_account_cannot_hijack_a_reserved_request(monkeypatch):
    """Владелец подключённого аккаунта распоряжается им сам и может создать у
    себя сессию с ЧУЖИМ `client_reference_id`. Проверка аккаунта обязана
    случиться ДО того, как мы что-либо запишем в чужую заявку."""
    victim = SimpleNamespace(
        id=1, studio_id=7, account_id="acct_victim", attempt_id="att_victim",
        session_id=None, status="pending", amount=1500, payload={},
        user_id=None, application_fee=0,
    )

    class _HijackDB:
        async def execute(self, query):
            sql = str(query)
            row = victim if "stripe_checkouts" in sql and "session_id IS NULL" in sql else None
            return SimpleNamespace(scalar_one_or_none=lambda: row)

        async def commit(self):
            raise AssertionError("чужое событие не должно ничего коммитить")

    ok = _run(SP.apply_paid(
        _HijackDB(), "cs_attacker",
        account_id="acct_attacker", attempt_id="att_victim",
    ))
    assert ok is False
    assert victim.session_id is None, "чужая сессия вписана в заявку другой студии"
    assert victim.status == "pending"


def test_reconciliation_refuses_a_session_that_is_not_ours(monkeypatch):
    """В заявке оказался чужой id сессии — провести по ней продажу нельзя."""
    applied = _stub_connect(
        monkeypatch,
        session=SimpleNamespace(
            payment_status="paid", status="complete", client_reference_id="att_someone_else",
        ),
    )
    rows = [_pending()]
    assert _run(SP.reconcile_pending(_ReconDB(rows))) == 0
    assert applied == []


def test_the_miniapp_never_takes_the_client_id_from_the_request_body():
    """Ключ попытки строится из payload, а тот в мини-приложении собирается из
    АУТЕНТИФИЦИРОВАННОГО клиента. Прими мы client_id из тела — один клиент мог бы
    подобрать чужой ключ попытки и приклеиться к чужой покупке."""
    src = inspect.getsource(MU.create_checkout_session)
    assert '"client_id": client.id' in src
    assert "body.client_id" not in src


def test_the_attempt_key_cannot_collide_across_studios():
    """studio_id входит в ключ: одинаковые покупки разных студий не столкнутся."""
    payload = {"client_id": 1, "product_id": 2, "product_type": "subscription"}
    assert SP.business_attempt_id(1, payload, 1500) != SP.business_attempt_id(2, payload, 1500)


def test_a_different_basket_is_a_different_attempt():
    """Сменили промокод или сумму — это другая покупка, и форма ей нужна своя."""
    base = {"client_id": 1, "product_id": 2, "product_type": "subscription"}
    assert SP.business_attempt_id(1, base, 1500) != SP.business_attempt_id(1, base, 1400)
    assert SP.business_attempt_id(1, base, 1500) != SP.business_attempt_id(
        1, {**base, "promo_code": "SUMMER"}, 1500,
    )


def test_the_reconcile_window_never_races_a_live_attempt():
    """Сверка не должна трогать заявку, которую прямо сейчас переиспользует
    повторный запрос: окно попытки обязано быть КОРОЧЕ окна сверки. Иначе
    свежую форму закроют у человека из-под рук."""
    assert SP.ATTEMPT_WINDOW < SP.RECONCILE_AFTER, (SP.ATTEMPT_WINDOW, SP.RECONCILE_AFTER)
    assert SP.RECONCILE_AFTER < SP.ORPHAN_CLOSE_AFTER


def test_a_fully_covered_basket_never_reaches_stripe():
    """Пакет, закрытый баллами и сертификатом целиком, проводится без Stripe —
    и до резервации попытки: сессию на нулевую сумму создать всё равно нельзя."""
    src = inspect.getsource(MU.create_checkout_session)
    assert src.index("_grant_fully_covered(") < src.index("reserve_checkout(")


def test_a_session_already_being_paid_is_not_handed_out_again():
    """Клиент заплатил минуту назад, проведение ещё не дошло — заявка всё ещё
    pending. Отдать такую сессию значит нарисовать пустую модалку; завести
    вторую — списать деньги дважды. Честный отказ."""
    checkout = SimpleNamespace(id=1)
    for status in ("complete", "expired", None):
        with pytest.raises(HTTPException) as exc:
            SP._require_open(SimpleNamespace(status=status), checkout)
        assert exc.value.status_code == 409
        assert exc.value.detail["code"] == "checkout.attempt_in_progress"

    # Открытая сессия переиспользуется как обычно.
    assert SP._require_open(SimpleNamespace(status="open"), checkout) is None


def test_both_entrances_guard_the_reused_session():
    """Проверка стоит на обоих путях: касса и мини-приложение переиспользуют
    попытку одинаково."""
    assert "_require_open(" in inspect.getsource(SP.create_session)
    assert "_require_open(" in inspect.getsource(MU.create_checkout_session)


# ─── 9. предохранитель частоты на денежных ручках ─────────────────────────────

def test_every_money_endpoint_has_a_rate_limit():
    """Лимит — НЕ защита: за этими ручками JWT и все серверные проверки, а от
    дублей спасают блокировки и уникальные индексы. Он нужен от другого — от
    зациклившегося ретрая фронта и от угнанного токена, который иначе упирается
    только в лимиты Stripe.

    Проверяем по исходнику (как в test_register_verification): у декорированной
    функции параметры лимита наружу не выставлены.
    """
    import routers.billing.refunds as RF
    import sys as _sys

    CR = _sys.modules["routers.checkout.router"]
    money = [
        (SP.create_session, "POST /checkout/session"),
        (SP.confirm, "POST /checkout/confirm"),
        (CR.pay, "POST /checkout/pay"),
        (RF.refund_invoice, "POST /billing/invoices/{id}/refund"),
        (BR.sync_invoice, "POST /billing/invoices/{id}/sync"),
    ]
    for fn, title in money:
        src = inspect.getsource(getattr(fn, "__wrapped__", fn))
        assert "limiter.limit" in src, f"{title} без ограничения частоты"


def test_the_webhooks_are_never_rate_limited():
    """Лимит на вебхуке означал бы потерянные оплаты: Stripe шлёт события пачкой
    и ретраит только non-2xx. Сверка и воркеры ходят мимо HTTP и лимита не видят."""
    for fn in (WH.stripe_webhook, SP.stripe_webhook):
        assert "limiter.limit" not in inspect.getsource(fn), fn.__name__
    assert "limiter" not in inspect.getsource(SP.reconcile_pending)
