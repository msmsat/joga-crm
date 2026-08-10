"""Единая точка расчёта цены продажи (V5-5, задача 4).

Берёт базовую цену и применяет студийную скидку (StudioDiscountConfig),
персональный оффер клиента (ClientOffer) и промокод — по правилу «самая
выгодная клиенту, без стека» (если явно не включён stackable на студийной
скидке). Реальные деньги не двигает: возвращает только итоговую цену:
списание/эквайринг — забота кассы/мини-приложения (см. CLAUDE.md §2.16).
"""
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from models import ClientOffer, ReferralRecord, StudioDiscountConfig, StudioPromoCode, StudioReferralConfig
from services.discounts import apply_discount

# StudioDiscountConfig использует свой словарь ключей (задача 5), ClientOffer
# и промокод — 'percent'/'amount'. Приводим к общему виду перед apply_discount.
_STUDIO_TYPE_MAP = {"percentage": "percent", "fixed": "amount"}


class _AsDiscount:
    """Адаптер: любой (type, value) под интерфейс apply_discount."""
    def __init__(self, discount_type: str, value: int):
        self.discount_type = discount_type
        self.value = value


@dataclass
class ResolvedPrice:
    final_price: int
    studio_discount_applied: int = 0
    offer: Optional[ClientOffer] = None
    offer_discount_applied: int = 0
    promo: Optional[StudioPromoCode] = None
    promo_discount_applied: int = 0
    # Сама запись, а не только сумма: продавец обязан пометить `discount_used`
    # при фиксации продажи, иначе скидка новичка применится и на следующей.
    referral: Optional[ReferralRecord] = None
    referral_discount_applied: int = 0

    def mark_used(self) -> None:
        """Зафиксировать одноразовые скидки как потраченные.

        Зовётся ТОЛЬКО когда продажа реально состоялась (для Stripe — на
        вебхуке, не при создании сессии: брошенная корзина не должна сжигать
        скидку). Не коммитит — вызывающий в своей транзакции.
        """
        if self.promo is not None:
            self.promo.used_count += 1
        if self.offer is not None:
            self.offer.is_used = True
            self.offer.used_at = datetime.utcnow()
        if self.referral is not None:
            self.referral.discount_used = True


async def resolve_price(
    db: AsyncSession,
    studio_id: int,
    client_id: int,
    base_price: int,
    promo: Optional[StudioPromoCode] = None,
) -> ResolvedPrice:
    """`promo` — уже найденный и провалидированный промокод (find_valid_promo),
    поиск по коду сюда не входит — вызывающий решает, что делать с 404/400."""
    from routers.loyalty.offers import find_active_offer  # ponytail: локальный импорт разрывает цикл
    # services.pricing -> routers.loyalty (__init__) -> ... -> routers.clients.subscriptions -> services.pricing

    candidates: list[tuple[str, int, object]] = []

    cfg = (await db.execute(
        select(StudioDiscountConfig).where(StudioDiscountConfig.studio_id == studio_id)
    )).scalar_one_or_none()
    if (
        cfg is not None and cfg.is_enabled
        and cfg.discount_type in _STUDIO_TYPE_MAP  # cashback не снижает цену — другой механизм
        and (cfg.min_purchase_amount is None or base_price >= cfg.min_purchase_amount)
    ):
        amount = apply_discount(_AsDiscount(_STUDIO_TYPE_MAP[cfg.discount_type], cfg.discount_value), base_price)
        if amount > 0:
            candidates.append(("studio", amount, cfg))

    offer = await find_active_offer(studio_id, client_id, "renewal", db)
    if offer is not None:
        amount = apply_discount(offer, base_price)
        if amount > 0:
            candidates.append(("offer", amount, offer))

    if promo is not None:
        amount = apply_discount(promo, base_price)
        if amount > 0:
            candidates.append(("promo", amount, promo))

    referral_cfg = (await db.execute(
        select(StudioReferralConfig).where(StudioReferralConfig.studio_id == studio_id)
    )).scalar_one_or_none()
    if referral_cfg is not None and referral_cfg.is_enabled and referral_cfg.new_client_discount > 0:
        # Ключ — `discount_used`, а НЕ status: бонус пригласившему и скидка
        # новичку живут по разным расписаниям. На триггере 'registration' запись
        # становится 'completed' в момент регистрации, и по статусу новичок не
        # получил бы свою скидку никогда; на 'first_visit' — получал бы её на
        # каждой покупке до первого визита. Отменённый реферал скидку не даёт.
        referral = (await db.execute(
            select(ReferralRecord).where(
                ReferralRecord.referred_client_id == client_id,
                ReferralRecord.status != "cancelled",
                ReferralRecord.discount_used.is_(False),
            )
        )).scalar_one_or_none()
        if referral is not None:
            amount = apply_discount(_AsDiscount("percent", referral_cfg.new_client_discount), base_price)
            if amount > 0:
                candidates.append(("referral", amount, referral))

    if not candidates:
        return ResolvedPrice(final_price=base_price)

    stackable = cfg is not None and cfg.is_enabled and cfg.stackable
    chosen = candidates if stackable else [max(candidates, key=lambda c: c[1])]

    result = ResolvedPrice(final_price=base_price)
    total_discount = 0
    for kind, amount, obj in chosen:
        total_discount += amount
        if kind == "studio":
            result.studio_discount_applied = amount
        elif kind == "offer":
            result.offer = obj
            result.offer_discount_applied = amount
        elif kind == "promo":
            result.promo = obj
            result.promo_discount_applied = amount
        elif kind == "referral":
            result.referral = obj
            result.referral_discount_applied = amount

    result.final_price = max(0, base_price - total_discount)
    return result
