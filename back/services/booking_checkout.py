"""Оплата индивидуальной записи на шаге подтверждения в Журнале.

Две операции над уже выданными условиями записи (`services/booking_quotes`):

  * `preview`  — сколько заплатит клиент с промокодом и ваучером. Только чтение;
  * `pay_cash` — принять эту сумму наличными в ТОЙ ЖЕ транзакции, что и запись.

Считает не этот модуль, а касса: `routers/checkout/router._quote` (скидки →
сертификат → итог) и `perform_pay` (доход в Финансы, комиссия платформы, баллы,
покупка в лояльность, лента событий, погашение сертификата и промокода). Второй
денежный путь разошёлся бы с кассой на первой же правке — как разошлись когда-то
две копии реферальной выплаты.

Ваучер здесь — подарочный сертификат из Лояльности: другого ваучера в продукте нет.
"""
from fastapi import HTTPException

from models import ClientPayment, Reservation
from services import booking, booking_quotes as quotes

# Строки скидок в порядке чека — поля ResolvedPrice, где лежит, сколько сняла каждая.
_DISCOUNTS = (
    ("first_lesson", "first_lesson_discount_applied"),
    ("studio", "studio_discount_applied"),
    ("offer", "offer_discount_applied"),
    ("referral", "referral_discount_applied"),
    ("promo", "promo_discount_applied"),
)


def _code(value):
    """Пустое поле ввода — это «кода нет», а не код из пустой строки."""
    value = (value or "").strip()
    return value or None


async def _quote(db, actor, terms, domain, promo_code, certificate_code):
    """Касса над записью, которой ещё нет: товар — занятие по цене этого
    мастера со скидкой первого занятия, если администратор её не выключил."""
    from routers.checkout.router import ServiceAsProduct, _quote as price

    applied = terms.get("first_lesson_offered") and terms.get("first_lesson", True)
    package = ServiceAsProduct(
        id=0, name=domain.service_name, price=domain.base_price,
        per_visit_price=domain.base_price, service_id=terms.get("service_id"),
        first_lesson_percent=terms.get("first_lesson_percent") if applied else None,
    )
    return await price(db, actor.studio_id, actor.client_id, package, "lesson",
                       promo_code, False, False, certificate_code)


async def preview(db, actor: quotes.Actor, quote_id: str, codes) -> dict:
    """Чек записи до её подтверждения: базовая цена, скидки строками, ваучер, итог.

    Ошибку ваучера (не найден, погашен, истёк) возвращает полем, а не отказом:
    кассир ввёл код — остальной чек он всё равно должен видеть. Промокод,
    который проиграл более выгодной скидке, помечается: скидки не суммируются,
    и молча его проглотить значит оставить кассира гадать, почему он «не сработал».
    """
    row = await quotes.read(db, quote_id, actor)
    if row.consumed_at is not None or row.terms.get("intent", "create") != "create":
        quotes.reject("NOT_FOUND", 404)
    terms = row.terms
    domain = booking.Terms.from_json(terms["domain"])
    if domain is None:
        quotes.reject("TERMS_CHANGED")
    funding = domain.funding
    offered = bool(terms.get("first_lesson_offered"))
    result = dict(
        currency=funding.currency, base_price=domain.base_price,
        first_lesson_offered=offered,
        first_lesson_applied=offered and bool(terms.get("first_lesson", True)),
        first_lesson_percent=terms.get("first_lesson_percent"),
    )
    if funding.kind is not booking.FundingKind.PAY:
        # Абонемент, бесплатное первое занятие или скидка на всю сумму: платить
        # нечего, и ни промокод, ни ваучер здесь ничего не изменят.
        return {**result, "covered_by": funding.kind.value, "total": 0}

    promo_code, certificate_code = _code(codes.promo_code), _code(codes.certificate_code)
    certificate_error = None
    try:
        quote = await _quote(db, actor, terms, domain, promo_code, certificate_code)
    except HTTPException as exc:
        code = exc.detail.get("code") if isinstance(exc.detail, dict) else None
        if certificate_code is None or not (code or "").startswith("loyalty.cert_"):
            raise
        certificate_error = code
        quote = await _quote(db, actor, terms, domain, promo_code, None)
    resolved = quote.resolved
    return {
        **result,
        "discounts": [{"kind": kind, "amount": getattr(resolved, field)}
                      for kind, field in _DISCOUNTS if getattr(resolved, field)],
        "promo_valid": quote.promo_valid if promo_code else None,
        "promo_outweighed": bool(promo_code and quote.promo_valid and resolved.promo is None),
        "certificate_error": certificate_error,
        "certificate_amount": quote.certificate.amount if quote.certificate is not None else 0,
        "certificate_applied": quote.certificate_applied,
        "total": quote.total_price,
    }


async def pay_cash(db, actor: quotes.Actor, booked: dict, payment) -> None:
    """Принять наличными за только что созданную бронь — её же транзакцией.

    Бронь к этому моменту создана (`resource_booking.confirm`) и сброшена в
    базу, но не закоммичена. `perform_pay` проводит долг брони и КОММИТИТ всё
    вместе: запись без оплаты или оплата без записи в базу не попадают. Любой
    отказ (ваучер погашен, промокод умер, сумма не та, что видел кассир) —
    исключение, по которому вызывающий откатывает и бронь.

    `payment.expected_total` — итог, названный клиенту. Сервер считает заново
    и при расхождении не принимает ничего: взять наличными не ту сумму хуже,
    чем попросить подтвердить ещё раз.
    """
    from routers.checkout.router import perform_pay
    from schemas.checkout import CheckoutPayRequest

    reservation = await db.get(Reservation, booked["reservation_id"])
    debt = (await db.get(ClientPayment, reservation.debt_payment_id)
            if reservation.debt_payment_id is not None else None)
    if debt is not None and debt.status == "success":
        # Повтор того же подтверждения (двойное нажатие): запись и оплата уже
        # проведены первым запросом, второй раз брать деньги не за что.
        return
    if debt is None:
        # Платить нечего: абонемент, бесплатное первое занятие, скидка на всю
        # сумму. Кассир при этом видел ноль — иначе условия разошлись.
        if payment.expected_total != 0:
            quotes.reject("AMOUNT_CHANGED")
        return
    try:
        await perform_pay(
            db, actor.studio_id, actor.actor_user_id,
            CheckoutPayRequest(
                client_id=actor.client_id, product_id=booked["lesson_id"], product_type="lesson",
                promo_code=_code(payment.promo_code), certificate_code=_code(payment.certificate_code),
                payment_method="cash",
            ),
            method="cash", debt=debt, reservation_id=reservation.id,
            expected_total=payment.expected_total,
        )
    except HTTPException as exc:
        if isinstance(exc.detail, dict) and exc.detail.get("code") == "checkout.amount_changed":
            quotes.reject("AMOUNT_CHANGED")
        raise
