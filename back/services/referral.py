"""Реферальный бонус пригласившему — одна выплата на весь продукт.

Раньше эта логика была написана дважды, и в двух копиях расходились БАГИ:
`booking/public.py` при `bonus_type='discount'` не платил ничего, но всё равно
ставил `bonus_paid=True` (обещание сгорало молча), а `clients/loyalty.py` тот же
'discount' проводил ДЕНЬГАМИ на депозит. Ни одна копия не знала про триггер
'registration', хотя владелец выбирает его в CRM наравне с остальными.

Владелец в разделе «Лояльность» задаёт 3 триггера × 3 типа бонуса = 9 сочетаний.
Здесь они работают все девять, одинаково во всех каналах: касса CRM, публичный
веб-виджет, мини-приложение.

Не коммитит — вызывающий отвечает за транзакцию.
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from models import ClientOffer, ReferralRecord, StudioReferralConfig

# Триггеры ровно те, что показывает CRM (Loyalty/.../ReferralConfig.tsx:14).
# Расхождение этого набора с фронтом = мёртвая опция в интерфейсе владельца.
TRIGGERS = ("registration", "first_visit", "first_payment")


async def fire_referral(
    db: AsyncSession,
    studio_id: int,
    client_id: int,
    trigger: str,
    *,
    referred_name: str = "",
) -> bool:
    """Выдать бонус пригласившему `client_id`, если студия ждёт именно `trigger`.

    `client_id` — ПРИГЛАШЁННЫЙ (тот, кто совершил действие). Бонус получает
    `referral.referrer_client_id`.

    True — бонус выдан именно сейчас. Повторный вызов вернёт False:
    `bonus_paid` снимает запись с выборки, поэтому дважды заплатить нельзя даже
    если триггер дёрнут из двух мест.
    """
    # Локальный импорт разрывает цикл: routers.clients.loyalty -> ... -> services.
    from routers.clients.loyalty import apply_deposit_change, apply_points_change

    referral = (await db.execute(
        select(ReferralRecord).where(
            ReferralRecord.referred_client_id == client_id,
            ReferralRecord.status == "pending",
            ReferralRecord.bonus_paid.is_(False),
        )
    )).scalar_one_or_none()
    if referral is None or referral.referrer_client_id is None:
        return False

    cfg = (await db.execute(
        select(StudioReferralConfig).where(StudioReferralConfig.studio_id == studio_id)
    )).scalar_one_or_none()
    if cfg is None or not cfg.is_enabled or cfg.trigger_condition != trigger:
        return False
    if cfg.referrer_bonus <= 0:
        return False

    description = (
        f"Реферальный бонус за приглашение {referred_name}".strip()
        if referred_name else "Реферальный бонус за приглашение"
    )

    if cfg.bonus_type == "points":
        await apply_points_change(referral.referrer_client_id, studio_id, cfg.referrer_bonus, description, db)
    elif cfg.bonus_type == "deposit":
        await apply_deposit_change(referral.referrer_client_id, studio_id, cfg.referrer_bonus, description, db)
    elif cfg.bonus_type == "discount":
        # Скидка пригласившему — реальный объект, который подхватит resolve_price
        # на его следующей покупке, а не строчка в письме. `referrer_bonus`
        # подписан в CRM валютой, поэтому 'amount', а не проценты.
        # scope='renewal' — единственное, что ищет find_active_offer на MVP.
        db.add(ClientOffer(
            studio_id=studio_id,
            client_id=referral.referrer_client_id,
            discount_type="amount",
            value=cfg.referrer_bonus,
            reason="campaign",
            scope="renewal",
        ))
    else:
        # Неизвестный тип бонуса — НЕ помечаем выплаченным. Обещание остаётся
        # висеть, и владелец увидит незакрытый реферал, а не тихую пропажу.
        return False

    referral.status = "completed"
    referral.bonus_paid = True
    return True
