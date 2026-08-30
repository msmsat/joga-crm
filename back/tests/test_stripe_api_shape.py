"""Контракт с версией Stripe API: поля, на которых держится денежный путь.

Зачем отдельный файл. Одна дыра этого аудита появилась ровно так: код читал
`Charge.invoice`, а в API 2026-07-29 этого поля больше нет — обработчик возврата
молча выходил на первой строке, и деньги возвращались, не отзывая тариф. Ни один
тест не падал: заглушка сама подкладывала исчезнувшее поле.

Поэтому здесь проверяется не наш код, а ФОРМА ОБЪЕКТОВ SDK, который поедет в
прод. Апгрейд `stripe`, откат версии API, переезд поля — и файл падает с именем
конкретного места, которое надо перечитать, вместо тихого «ничего не произошло».

Сеть не трогаем: всё читается из исходников установленного SDK.

Запуск из back/:  python -m pytest tests/test_stripe_api_shape.py
"""
import inspect
import re

import pytest
import stripe


def _fields(module, class_name: str) -> dict:
    """Аннотации верхнего уровня класса SDK: {имя поля: тип}."""
    src = inspect.getsource(module)
    block = src[src.index(f"class {class_name}("):]
    return dict(re.findall(r"^\s{4}(\w+): ([^\n=]+)$", block, re.M))


# ─── версия ───────────────────────────────────────────────────────────────────

def test_the_pinned_api_version_is_the_one_the_code_was_written_for():
    """Код разбирает объекты поколения 2026-07-29 (parent.subscription_details,
    периоды у позиции подписки, invoice.payments). Сменится версия — эти
    предположения надо перечитать, а не надеяться на фолбэки."""
    assert stripe.VERSION.startswith("15."), stripe.VERSION
    assert stripe.api_version.startswith("2026-07-29"), stripe.api_version


# ─── Charge и Dispute: путь «платёж → наш счёт» ───────────────────────────────

def test_charge_has_no_invoice_and_that_is_why_we_look_it_up():
    """Прямой ссылки со списания на счёт больше нет. Появится обратно — быстрый
    путь в webhook._invoice_of_payment станет основным, и лишний запрос уйдёт."""
    import stripe._charge as charge

    fields = _fields(charge, "Charge")
    assert "invoice" not in fields, "Charge.invoice вернулся — перечитайте резолв счёта"
    assert "payment_intent" in fields, "исчез payment_intent — резолв счёта сломан целиком"
    for money in ("amount", "amount_refunded"):
        assert money in fields, money


def test_payment_intent_has_no_invoice_either():
    """Вторая половина того же переезда: через интент к счёту тоже не пройти."""
    import stripe._payment_intent as pi

    assert "invoice" not in _fields(pi, "PaymentIntent")


def test_invoice_payments_is_the_only_link_back():
    """Обратный путь ровно один — список платежей счёта, фильтруемый по интенту.
    На нём стоит `stripe_billing.invoice_id_for_payment`."""
    import stripe._invoice as invoice
    import stripe.params._invoice_payment_list_params as params

    fields = _fields(invoice, "Invoice")
    assert "payments" in fields
    assert "charge" not in fields and "payment_intent" not in fields

    src = inspect.getsource(params)
    assert "class InvoicePaymentListParamsPayment" in src
    assert "payment_intent" in src, "фильтр по интенту исчез — резолв счёта надо переписать"


def test_dispute_carries_the_payment_and_the_outcome():
    """`charge.dispute.closed` — единственный сигнал о чарджбэке: `charge.refunded`
    при нём не приходит. Обработчику нужны и статус, и ссылка на платёж."""
    import stripe._dispute as dispute

    fields = _fields(dispute, "Dispute")
    for name in ("status", "charge", "payment_intent"):
        assert name in fields, name

    block = re.search(
        r"^    status: Union\[\n(.*?)^    \]", inspect.getsource(dispute), re.S | re.M,
    )
    literals = set(re.findall(r'"(\w+)"', block.group(1)))
    # Ветвимся ровно на этих значениях; остальные доступ не трогают.
    assert {"lost", "won", "prevented"} <= literals, literals


# ─── подписка: где лежат периоды ──────────────────────────────────────────────

def test_the_billing_period_lives_on_the_item_not_on_the_subscription():
    """И конец периода (срок доступа), и начало (якорь grace при неоплате)
    читаются у ПОЗИЦИИ — у самой подписки этих полей больше нет."""
    import stripe._subscription as subscription
    import stripe._subscription_item as item

    sub_fields = _fields(subscription, "Subscription")
    item_fields = _fields(item, "SubscriptionItem")

    assert "current_period_end" not in sub_fields
    assert "current_period_start" not in sub_fields
    assert "current_period_end" in item_fields
    assert "current_period_start" in item_fields


def test_the_invoice_knows_its_subscription_through_parent():
    """Метаданные подписки (тариф и период оплаты) вебхук читает из
    `parent.subscription_details` — плоского `invoice.subscription` больше нет."""
    import stripe._invoice as invoice

    src = inspect.getsource(invoice)
    assert "subscription_details" in src
    assert "subscription" not in _fields(invoice, "Invoice")


# ─── Checkout Session: чем связываем свою заявку ──────────────────────────────

def test_the_session_carries_our_own_reference():
    """`client_reference_id` — ниточка от сессии к нашей заявке. По ней вебхук и
    сверка находят покупку, если id сессии записать не успели."""
    import stripe.params.checkout._session_create_params as create

    src = inspect.getsource(create)
    for field in ("client_reference_id", "metadata", "ui_mode"):
        assert field in src, field


def test_sessions_cannot_be_listed_by_our_reference():
    """Фильтра по `client_reference_id` в списке НЕТ — поэтому осиротевшая сессия
    ищется перебором по времени создания (stripe_connect.find_session_by_reference).
    Появится фильтр — перебор надо заменить на него."""
    import stripe.params.checkout._session_list_params as params

    block = re.search(
        r"class SessionListParams\(RequestOptions\):(.*?)\n\nclass ",
        inspect.getsource(params), re.S,
    )
    names = set(re.findall(r"^\s{4}(\w+): ", block.group(1), re.M))
    assert "client_reference_id" not in names, (
        "фильтр появился — упростите find_session_by_reference"
    )
    assert "created" in names, "исчез фильтр по времени — перебор сессий больше не ограничен"


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-q"]))
