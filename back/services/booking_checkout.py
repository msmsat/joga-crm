"""Оплата индивидуальной записи на шаге подтверждения в Журнале.

Две операции над уже выданными условиями записи (`services/booking_quotes`):

  * `preview`  — сколько заплатит клиент с промокодом, ваучером и ручной
                 скидкой администратора. Только чтение;
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
from services import booking, booking_quotes as quotes, held_codes, reservation_payment
from services.discounts import FirstLessonDiscount


def _code(value):
    """Пустое поле ввода — это «кода нет», а не код из пустой строки."""
    value = (value or "").strip()
    return value or None


def _first_lesson(terms) -> FirstLessonDiscount | None:
    """Скидка первого занятия из снимка условий: сумма, если она задана, иначе
    процент. None — клиенту она не положена."""
    if terms.get("first_lesson_amount") is not None:
        return FirstLessonDiscount(amount=terms["first_lesson_amount"])
    if terms.get("first_lesson_percent") is not None:
        return FirstLessonDiscount(percent=terms["first_lesson_percent"])
    return None


async def _quote(db, actor, terms, domain, codes, certificate_code):
    """Касса над записью, которой ещё нет: товар — занятие по цене этого
    мастера со скидкой первого занятия, если администратор её не выключил,
    с его ручной скидкой, если он её дал, и с баллами и депозитом клиента,
    если их решили списать."""
    from routers.checkout.router import ServiceAsProduct, _quote as price

    applied = terms.get("first_lesson_offered") and terms.get("first_lesson", True)
    package = ServiceAsProduct(
        id=0, name=domain.service_name, price=domain.base_price,
        per_visit_price=domain.base_price, service_id=terms.get("service_id"),
        first_lesson=_first_lesson(terms) if applied else None,
    )
    return await price(db, actor.studio_id, actor.client_id, package, "lesson",
                       _code(codes.promo_code), codes.use_bonuses, codes.use_deposit, certificate_code,
                       manual_percent=getattr(codes, "manual_discount_percent", None))


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
        first_lesson_amount=terms.get("first_lesson_amount"),
    )
    if funding.kind is not booking.FundingKind.PAY:
        # Абонемент, бесплатное первое занятие или скидка на всю сумму: платить
        # нечего, и ни промокод, ни ваучер здесь ничего не изменят.
        return {**result, "covered_by": funding.kind.value, "total": 0}

    certificate_code = _code(codes.certificate_code)
    certificate_error = None
    try:
        quote = await _quote(db, actor, terms, domain, codes, certificate_code)
    except HTTPException as exc:
        code = exc.detail.get("code") if isinstance(exc.detail, dict) else None
        if certificate_code is None or not (code or "").startswith("loyalty.cert_"):
            raise
        certificate_error = code
        quote = await _quote(db, actor, terms, domain, codes, None)
    return {
        **result,
        **await reservation_payment.check_lines(
            db, actor.studio_id, actor.client_id, quote,
            manual_percent=getattr(codes, "manual_discount_percent", None),
            promo_code=_code(codes.promo_code), certificate_error=certificate_error),
    }


async def discount(db, actor: quotes.Actor, booked: dict, percent: int) -> None:
    """Запись без оплаты со скидкой администратора: долг — уже со скидкой, и
    оплата позже возьмёт её сама (services/reservation_payment.discount_debt).
    Не коммитит — бронь и скидка попадают в базу одной транзакцией."""
    reservation = await db.get(Reservation, booked["reservation_id"])
    if reservation.payment_breakdown is not None:
        # Повтор подтверждения уже оплаченной записи: деньги взяты, скидку
        # поверх проведённой оплаты не кладём.
        return
    await reservation_payment.discount_debt(db, actor.studio_id, reservation, percent)


async def pay_cash(db, actor: quotes.Actor, booked: dict, payment) -> None:
    """Принять оплату за только что созданную бронь — её же транзакцией.
    Способ — наличные или перевод (`payment.method`), баллы и депозит — если
    их решили списать.

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
                payment_method=payment.method, use_bonuses=payment.use_bonuses,
                use_deposit=payment.use_deposit,
            ),
            method=payment.method, debt=debt, reservation_id=reservation.id,
            expected_total=payment.expected_total, manual_percent=payment.manual_discount_percent,
        )
    except HTTPException as exc:
        if isinstance(exc.detail, dict) and exc.detail.get("code") == "checkout.amount_changed":
            quotes.reject("AMOUNT_CHANGED")
        raise


async def _lesson_quote(db, studio_id: int, reservation: Reservation, codes: held_codes.Codes):
    """Касса над уже созданной бронью: цена занятия этому клиенту с его кодами."""
    from routers.checkout.router import _get_client_package, _quote as price

    await db.flush()
    _client, package = await _get_client_package(
        db, studio_id, reservation.client_id, reservation.lesson_id, "lesson",
        reservation_id=reservation.id)
    return await price(db, studio_id, reservation.client_id, package, "lesson",
                       codes.promo_code, codes.use_bonuses, codes.use_deposit, codes.certificate_code,
                       hold_owner=reservation.id)


async def held_total(db, studio_id: int, reservation: Reservation) -> int:
    """Сумма формы Stripe за бронь, которая держит коды (services/booking_payment.pay_link)."""
    quote = await _lesson_quote(db, studio_id, reservation, held_codes.codes_of(reservation))
    return quote.total_price


async def hold(db, actor: quotes.Actor, booked: dict, payment) -> None:
    """Запись клиента из мини-приложения с промокодом, ваучером, баллами, депозитом.

    Деньги ещё не взяты, поэтому коды не гасятся, а держатся на брони
    (services/held_codes): долг «оплата на месте» заводится уже с ними, сумма
    формы Stripe считается с ними же, а погасит их оплата брони. Способ оплаты
    назвал quote: бронь в `hold` — платят картой, иначе на месте.

    `payment.expected_total` — итог, который клиент видел в чеке. Сервер считает
    заново; разошлось — AMOUNT_CHANGED и откат брони: записать человека на одну
    сумму, показав другую, нельзя.

    Коды покрыли всё при оплате на месте — платить у стойки нечего, и оплата
    (на ноль) проводится сразу той же кассой: коды гасятся, долг закрывается.
    Не коммитит, кроме этого случая (`perform_pay` коммитит сам).
    """
    from routers.checkout.router import perform_pay, reject_dead_promo
    from schemas.checkout import CheckoutPayRequest

    reservation = await db.get(Reservation, booked["reservation_id"])
    if reservation.held_codes is not None or reservation.payment_breakdown is not None:
        # Повтор того же подтверждения: коды уже держатся или оплата прошла.
        return
    codes = held_codes.Codes(
        promo_code=_code(payment.promo_code), certificate_code=_code(payment.certificate_code),
        use_bonuses=payment.use_bonuses, use_deposit=payment.use_deposit)
    card = reservation.status == "hold"
    debt = (await db.get(ClientPayment, reservation.debt_payment_id)
            if reservation.debt_payment_id is not None else None)
    if not card and (debt is None or debt.status != "pending"):
        # Платить нечего: абонемент, бесплатное первое занятие. Коды не нужны.
        if payment.expected_total != 0:
            quotes.reject("AMOUNT_CHANGED")
        return

    quote = await _lesson_quote(db, actor.studio_id, reservation, codes)
    reject_dead_promo(codes.promo_code, quote)
    if quote.total_price != payment.expected_total:
        quotes.reject("AMOUNT_CHANGED")

    if card:
        if quote.total_price <= 0:
            # Коды покрыли всё — платить картой нечего; экран в этом случае
            # предлагает только «на месте».
            quotes.reject("NOTHING_TO_PAY")
        if codes.any():
            held_codes.hold(reservation, codes, quote)
        return

    if quote.total_price == 0:
        await perform_pay(
            db, actor.studio_id, actor.actor_user_id,
            CheckoutPayRequest(
                client_id=actor.client_id, product_id=reservation.lesson_id, product_type="lesson",
                promo_code=codes.promo_code, certificate_code=codes.certificate_code,
                use_bonuses=codes.use_bonuses, use_deposit=codes.use_deposit, payment_method="cash",
            ),
            method="cash", debt=debt, reservation_id=reservation.id, expected_total=0,
        )
        return
    debt.amount = quote.total_price
    if codes.any():
        held_codes.hold(reservation, codes, quote)
