"""Отмена оплаты занятия, принятой у стойки, — «Поменять» в окне оплаты Журнала.

Деньги за бронь проводит касса (`routers/checkout/router.perform_pay`): доход в
Финансы, комиссия платформы, баллы и сумма покупок клиента, списанные баллы,
депозит и сертификат, погашенные одноразовые скидки, снимок чека на брони.
Отмена кладёт всё это назад и снова открывает долг — дальше администратор
принимает оплату заново тем же окном, уже с новым выбором.

КАК ОТКАТЫВАЮТСЯ ДЕНЬГИ — тем же образцом, что возврат по карте
(`checkout/stripe_pay._revert_sale`) и отмена автозачисления
(`services/attendance`): проведённый доход не стирается, а гасится расходом
категории «Возвраты» (отчёты за закрытый период задним числом не меняются),
комиссия платформы снимается компенсирующей строкой, баллы и сумма покупок —
общим `loyalty.revert_purchase`. Из Финансов доход брони уводит ОДНА функция
(`reverse_income`) для обеих дверей: две копии разошлись бы на первой правке.

ЧЕМ ОТЛИЧАЕТСЯ ОТ ВОЗВРАТА ПО КАРТЕ: это исправление выбора, а не расторжение
сделки, поэтому одноразовые скидки (промокод, персональное предложение, скидка
новичка) тоже возвращаются — иначе повторная оплата того же занятия вышла бы
дороже первой.

ЧЕГО НЕ ОТМЕНЯЕТ (`refusal`):
  * Оплату картой онлайн (Stripe): деньги у банка, вернуть их может только
    возврат через Stripe — он и откатит всё сам (`_revert_sale`).
  * Перенесённую историю (импорт): за ней стоит запись импорта, и правка
    здесь разошлась бы с ней.
  * Оплату без снимка чека (проведённую до снимков): неизвестно, чем платили,
    и вернуть клиенту было бы нечего — её исправляют через Финансы.

Скидку первого занятия, которую кассир не засчитал при оплате, отмена не
возвращает: снимок пробной записи снят тогда же (`forget_first_lesson`), и
восстанавливать его не из чего.
"""
from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from activity import log_activity
from models import (
    Client, ClientOffer, ClientPayment, Lesson, Operation, ReferralRecord, Reservation, Studio,
    StudioPromoCode,
)
from services import platform_fee, reservation_payment, stripe_connect

# Способы оплаты у стойки: их деньги у студии, и отменить их может она сама.
DESK_METHODS = ("cash", "transfer")

# Персональное предложение гасится той же транзакцией, что и снимок чека
# (`perform_pay`): отметка времени у них расходится на миллисекунды. Окно —
# запас на медленную транзакцию, а не на чужую продажу.
_OFFER_WINDOW = timedelta(minutes=5)


def refusal(reservation: Reservation, payment: ClientPayment | None) -> str | None:
    """Почему оплату брони нельзя отменить у стойки; None — можно."""
    receipt = reservation.payment_breakdown or {}
    if payment is None or payment.status != "success":
        return "За эту запись оплаты нет — отменять нечего"
    if not receipt:
        return "Оплата проведена до снимков чека — исправьте её через Финансы"
    if receipt.get("migration_basis"):
        return "Оплата перенесена из прошлой системы — менять её здесь нельзя"
    if receipt.get("method") not in DESK_METHODS:
        return "Оплату картой онлайн возвращают через Stripe"
    return None


async def reverse_income(
    db: AsyncSession, studio: Studio, lesson: Lesson, reservation: Reservation, amount: int, *,
    method: str, title: str, note: str,
) -> None:
    """Увести из Финансов доход, принятый за бронь: расход «Возвраты» с того же
    счёта, снятие комиссии платформы, откат баллов и суммы покупок. Не коммитит.

    `title` — строка расхода в Финансах, `note` — подпись снятых баллов."""
    if amount <= 0:
        return
    # Касса тянет за собой роутеры чекаута — импорт здесь, иначе цикл при старте.
    from routers.checkout.router import ACCOUNT_TYPE_FOR_METHOD, resolve_account
    from routers.clients.loyalty import revert_purchase

    currency = studio.currency or "CZK"
    # Тот же счёт, на который касса положила доход: кассир счёт не выбирает,
    # и касса берёт счёт по способу оплаты.
    account = await resolve_account(
        db, studio.id, None, default_type=ACCOUNT_TYPE_FOR_METHOD.get(method, "cash"))
    db.add(Operation(
        studio_id=studio.id,
        type="out",
        title=title,
        amount=amount,
        op_date=date.today(),
        # Категория возврата — по ней отчёты гасят выручку, а комиссия
        # платформы снимается ниже (как у возврата по карте).
        category=platform_fee.REFUND_CATEGORY,
        method=method,
        account_id=account.id,
        client_id=reservation.client_id,
        service_id=lesson.service_id,
    ))
    account.balance -= amount
    await platform_fee.reverse_offline_fee(
        db, studio.id, stripe_connect.to_minor_units(amount, currency), currency,
        client_id=reservation.client_id)
    await revert_purchase(db, studio.id, reservation.client_id, amount, note)


async def cancel(db: AsyncSession, *, studio: Studio, lesson: Lesson, reservation: Reservation,
                 actor_name: str) -> None:
    """Отменить оплату брони, принятую у стойки, и снова открыть долг. Не коммитит.

    Вызывающий держит замок студии и уже спросил `refusal`."""
    from routers.checkout.router import restore_spent

    payment = await db.get(ClientPayment, reservation.debt_payment_id)
    receipt = reservation.payment_breakdown or {}
    client_id = reservation.client_id

    await restore_spent(
        db, studio.id, client_id,
        bonuses=receipt.get("bonuses_applied") or 0, deposit=receipt.get("deposit_applied") or 0,
        certificate_code=receipt.get("certificate_code"), reason="Отмена оплаты",
    )
    await _restore_one_time(db, studio.id, client_id, receipt)
    await reverse_income(
        db, studio, lesson, reservation, payment.amount, method=receipt["method"],
        title=f"Отмена оплаты: «{lesson.name}»", note="Отмена оплаты",
    )

    # Долг снова открыт — по цене брони, а не по уплаченному: касса переписала
    # сумму строки на итог чека (баллы, промокод), а их только что вернули.
    payment.status = "pending"
    reservation.payment_breakdown = None
    reservation.auto_paid = False
    await reservation_payment.reprice_debt(db, studio.id, reservation)

    client = await db.get(Client, client_id)
    log_activity(
        db, studio.id, "payment",
        title=f"Оплата отменена — {client.name if client else ''} · «{lesson.name}»",
        actor_name=actor_name, entity_type="reservation", entity_id=reservation.id,
    )


async def _restore_one_time(db: AsyncSession, studio_id: int, client_id: int, receipt: dict) -> None:
    """Вернуть одноразовые скидки, погашенные этой оплатой (`ResolvedPrice.
    mark_used`): промокод, персональное предложение, скидку новичка. Какие
    именно сработали — видно по строкам скидок в снимке чека."""
    kinds = {line.get("kind") for line in receipt.get("discounts") or ()}

    code = receipt.get("promo_code")
    if "promo" in kinds and code:
        promo = (await db.execute(
            select(StudioPromoCode).where(StudioPromoCode.studio_id == studio_id, StudioPromoCode.code == code)
        )).scalar_one_or_none()
        if promo is not None and promo.used_count > 0:
            promo.used_count -= 1

    if "offer" in kinds and receipt.get("paid_at"):
        paid_at = datetime.fromisoformat(receipt["paid_at"])
        offer = (await db.execute(
            select(ClientOffer).where(
                ClientOffer.studio_id == studio_id,
                ClientOffer.client_id == client_id,
                ClientOffer.is_used.is_(True),
                ClientOffer.used_at.between(paid_at - _OFFER_WINDOW, paid_at + _OFFER_WINDOW),
            ).order_by(ClientOffer.used_at.desc())
        )).scalars().first()
        if offer is not None:
            offer.is_used = False
            offer.used_at = None

    if "referral" in kinds:
        referral = (await db.execute(
            select(ReferralRecord).where(
                ReferralRecord.referred_client_id == client_id,
                ReferralRecord.status != "cancelled",
                ReferralRecord.discount_used.is_(True),
            )
        )).scalar_one_or_none()
        if referral is not None:
            referral.discount_used = False
