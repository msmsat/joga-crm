"""Чек погашения долга за занятие у стойки Журнала.

Считает НЕ отдельной формулой, а ядром кассы (`routers/checkout/router._quote`)
— тем же, что затем проведёт `perform_pay`. Две формулы разошлись бы на первой
правке скидок, и администратор назвал бы клиенту одну сумму, а касса взяла
другую; поэтому оплата вдобавок сверяет итог (`expected_total`).

Только чтение: баллы, депозит и одноразовые скидки гасит оплата, а не чек.
"""
from dataclasses import replace
from datetime import datetime

from fastapi import HTTPException

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from models import ClientPayment, Lesson, Reservation, Studio, StudioDiscountConfig, StudioLoyaltyConfig
from services import held_codes

_DISCOUNTS = (
    ("first_lesson", "first_lesson_discount_applied"),
    ("studio", "studio_discount_applied"),
    ("offer", "offer_discount_applied"),
    ("referral", "referral_discount_applied"),
    ("promo", "promo_discount_applied"),
    ("manual", "manual_discount_applied"),
)


async def _earn_rates(db: AsyncSession, studio_id: int) -> tuple[int, int | None]:
    """Курс баллов за оплату (денег за балл, 0 — программа выключена) и ставка
    кешбэка в процентах (None — выключен). Те же условия, что у начисления
    (`routers/clients/loyalty.accrue_points` и `register_purchase`)."""
    loyalty = (await db.execute(
        select(StudioLoyaltyConfig).where(StudioLoyaltyConfig.studio_id == studio_id)
    )).scalar_one_or_none()
    rate = loyalty.points_exchange_rate if loyalty is not None and loyalty.is_enabled else 0
    discount = (await db.execute(
        select(StudioDiscountConfig).where(StudioDiscountConfig.studio_id == studio_id)
    )).scalar_one_or_none()
    cashback = (discount.discount_value
                if discount is not None and discount.is_enabled and discount.discount_type == "cashback"
                else None)
    return max(rate or 0, 0), cashback


def snapshot(quote, method: str, certificate_code: str | None) -> dict:
    """Чем оплачено занятие — в том виде, в каком его покажут Журнал и история
    клиента. Зовётся кассой (`perform_pay`) в той же транзакции, что и деньги:
    отдельно записанный снимок мог бы разойтись с проведённой суммой."""
    resolved = quote.resolved
    promo = getattr(resolved, "promo", None)
    return {
        "base_price": quote.base_price,
        "discounts": [{"kind": kind, "amount": getattr(resolved, field)}
                      for kind, field in _DISCOUNTS if getattr(resolved, field)],
        "promo_code": promo.code if promo is not None else None,
        "bonuses_applied": quote.bonuses_applied,
        "bonuses_value": quote.bonuses_value,
        "deposit_applied": quote.deposit_applied,
        "certificate_applied": quote.certificate_applied,
        "certificate_code": certificate_code if quote.certificate_applied else None,
        "total": quote.total_price,
        "method": method,
        "paid_at": datetime.utcnow().replace(microsecond=0).isoformat(),
    }


def points_for(total: int, rate: int, cashback: int | None) -> int:
    """Сколько баллов клиент получит за оплату `total` — курс плюс кешбэк,
    они суммируются (так начисляет касса)."""
    if total <= 0:
        return 0
    return (total // rate if rate > 0 else 0) + (total * cashback // 100 if cashback else 0)


def code_of(value: str | None) -> str | None:
    """Пустое поле ввода — это «кода нет», а не код из пустой строки."""
    value = (value or "").strip()
    return value or None


def manual_of(reservation: Reservation, requested: int | None) -> int | None:
    """Скидка администратора, по которой считать оплату брони.

    None — кассир о скидке не говорил: действует та, что дали брони при записи
    (`Reservation.manual_discount_percent`), иначе ассистент или старое окно
    взяли бы полную цену при долге со скидкой. 0 — скидку сняли явно.
    """
    if requested is None:
        return reservation.manual_discount_percent
    return requested or None


async def discount_debt(db: AsyncSession, studio_id: int, reservation: Reservation, percent: int) -> None:
    """Скидка брони, записанной без оплаты: запомнить её и завести долг уже со
    скидкой — тем же ядром кассы, каким её потом проведёт оплата (скидки не
    суммируются: действует самая выгодная). Скидка на всю сумму — долга нет.
    Не коммитит."""
    from routers.checkout.router import _get_client_package, _quote  # ponytail: локальный импорт разрывает цикл

    reservation.manual_discount_percent = percent
    if reservation.debt_payment_id is None:
        return
    debt = await db.get(ClientPayment, reservation.debt_payment_id)
    if debt is None or debt.status != "pending":
        return
    await db.flush()
    _client, package = await _get_client_package(
        db, studio_id, reservation.client_id, reservation.lesson_id, "lesson", reservation_id=reservation.id,
    )
    # Коды, которые бронь держит с записи, остаются в долге и со скидкой.
    codes = held_codes.codes_of(reservation)
    quote = await _quote(db, studio_id, reservation.client_id, package, "lesson", codes.promo_code,
                         codes.use_bonuses, codes.use_deposit, codes.certificate_code,
                         manual_percent=percent, hold_owner=reservation.id)
    if quote.total_price > 0:
        debt.amount = quote.total_price
    else:
        reservation.debt_payment_id = None
        await db.delete(debt)


def forget_first_lesson(reservation: Reservation) -> None:
    """Администратор не засчитал первое занятие: бронь больше не пробная.

    Касса берёт скидку со снимка на брони (`booking_access.trial_percent`) —
    сняв снимок, оплата посчитает полную цену тем же ядром, что и чек. Так же
    выглядит индивидуальная запись, у которой «Первое занятие» выключили."""
    reservation.is_trial = False
    reservation.trial_discount_percent = None


async def preview(
    db: AsyncSession, studio_id: int, reservation: Reservation, lesson: Lesson, debt: ClientPayment,
    *, manual_percent: int | None, use_bonuses: bool, use_deposit: bool,
    first_lesson: bool = True, promo_code: str | None = None, certificate_code: str | None = None,
) -> dict:
    from routers.checkout.router import _get_client_package, _quote  # ponytail: локальный импорт разрывает цикл

    _client, package = await _get_client_package(
        db, studio_id, reservation.client_id, lesson.id, "lesson", reservation_id=reservation.id,
    )
    offered_percent = package.first_lesson_percent
    if not first_lesson:
        package = replace(package, first_lesson_percent=None)
    # Коды, названные клиентом при записи, подставляются сами (held_codes):
    # администратор видит сумму к оплате уже с ними.
    codes = held_codes.merged(reservation, promo_code=promo_code, certificate_code=certificate_code,
                              use_bonuses=use_bonuses, use_deposit=use_deposit)
    promo_code, certificate_code = codes.promo_code, codes.certificate_code

    async def quote_with(certificate: str | None):
        return await _quote(
            db, studio_id, reservation.client_id, package, "lesson", promo_code, codes.use_bonuses,
            codes.use_deposit, certificate, manual_percent=manual_percent, hold_owner=reservation.id,
        )

    # Ошибку сертификата (не найден, погашен, истёк) отдаём полем, а не
    # отказом: остальной чек администратор всё равно должен видеть.
    certificate_error = None
    try:
        quote = await quote_with(certificate_code)
    except HTTPException as exc:
        code = exc.detail.get("code") if isinstance(exc.detail, dict) else None
        if certificate_code is None or not (code or "").startswith("loyalty.cert_"):
            raise
        certificate_error = code
        quote = await quote_with(None)
    studio = await db.get(Studio, studio_id)
    return {
        "currency": (studio.currency if studio is not None else None) or "CZK",
        "debt": debt.amount,
        "first_lesson_offered": offered_percent is not None,
        "first_lesson_applied": offered_percent is not None and first_lesson,
        "first_lesson_percent": offered_percent,
        "manual_discount_percent": manual_percent,
        **await check_lines(db, studio_id, reservation.client_id, quote,
                            manual_percent=manual_percent, promo_code=promo_code,
                            certificate_error=certificate_error),
    }


async def check_lines(db: AsyncSession, studio_id: int, client_id: int, quote, *,
                      manual_percent: int | None, promo_code: str | None,
                      certificate_error: str | None) -> dict:
    """Строки чека из расчёта кассы: скидки, коды, баллы, депозит, приглашения,
    итог. Общие для оплаты долга и оплаты при записи (services/booking_checkout):
    окно оплаты у них одно, и поля не должны расходиться."""
    from services import referral  # ponytail: локальный импорт разрывает цикл

    resolved = quote.resolved
    rate, cashback = await _earn_rates(db, studio_id)
    return {
        "base_price": quote.base_price,
        "discounts": [{"kind": kind, "amount": getattr(resolved, field)}
                      for kind, field in _DISCOUNTS if getattr(resolved, field)],
        "manual_outweighed": bool(manual_percent) and not resolved.manual_discount_applied,
        "promo_valid": quote.promo_valid if promo_code else None,
        "promo_outweighed": bool(promo_code and quote.promo_valid and resolved.promo is None),
        "certificate_error": certificate_error,
        "certificate_amount": quote.certificate.amount if quote.certificate is not None else 0,
        "certificate_applied": quote.certificate_applied,
        "bonuses_available": quote.bonuses_available,
        "bonuses_applied": quote.bonuses_applied,
        "bonuses_value": quote.bonuses_value,
        "point_value": quote.point_value,
        "deposit_available": quote.deposit_available,
        "deposit_applied": quote.deposit_applied,
        "cashback_percent": cashback,
        "points_to_earn": points_for(quote.total_price, rate, cashback),
        "referral": await referral.summary(db, studio_id, client_id),
        "total": quote.total_price,
    }
