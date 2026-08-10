"""Лояльность глазами клиента (`GET /global/loyalty`).

Одна ручка на весь раздел — по той же причине, что и каталог студии
(`miniapp_studio.py`): страница «Клуб» показывает карту, лестницу уровней,
историю баллов, сертификаты, персональные скидки, депозит и реферальную
программу разом, и пять независимых загрузок со своими скелетонами были бы
пятью поводами для рассинхрона на одном экране.

Всё, что здесь отдаётся, приходит из тех же таблиц, что видит владелец в
разделе «Лояльность» CRM. Ничего не считается «специально для клиента»:
уровень — тем же `_level_for` из `routers/loyalty/cards.py`, что и в карточках
владельца, суммы — тем же `_fmt_amount`, что в уведомлениях и кассе. Иначе
клиент и студия однажды увидели бы разный баланс.

Программа выключена владельцем (`is_enabled=False`) → `enabled: false` и
пустые списки: мини-приложение прячет раздел целиком, а не показывает нули.
"""
from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from ratelimit import limiter
from models import (
    Client, ClientLoyaltyCard, ClientOffer, DepositTransaction, GiftCertificate,
    LoyaltyPointTransaction, ReferralRecord, StudioCertificateConfig,
    StudioDiscountConfig, StudioLoyaltyConfig, StudioReferralConfig,
)
from routers.loyalty.cards import _get_or_create_levels, _level_for
from schemas._base import BaseSchema
from services.notifier import _fmt_amount, _studio_prefs

from .miniapp import get_current_client

router = APIRouter()

# Сколько последних движений показывать. Клиенту нужна не бухгалтерия, а ответ
# «откуда взялись баллы» — глубже двадцати строк за этим никто не полезет.
HISTORY_LIMIT = 20


class LoyaltyLevelInfo(BaseSchema):
    name: str
    color: str
    min_threshold: int
    min_threshold_str: str
    # Уровень уже достигнут по текущей сумме покупок — по этому полю рисуется
    # лестница, чтобы клиент видел не только где он, но и что дальше.
    reached: bool
    is_current: bool


class PointEntry(BaseSchema):
    points: int
    description: str
    created_at: str


class CertificateInfo(BaseSchema):
    code: str
    amount: int
    amount_str: str
    status: str
    expires_at: Optional[date]


class OfferInfo(BaseSchema):
    discount_type: str
    value: int
    # Готовая подпись «−15 %» / «−500 ₴»: правило склейки процента и суммы
    # одно на весь продукт, повторять его на клиенте незачем.
    label: str
    valid_until: Optional[date]


class ReferralInfo(BaseSchema):
    referrer_bonus: int
    referrer_bonus_str: str
    new_client_discount: int
    bonus_type: str
    trigger_condition: str
    invite_code: str
    # Ссылка собирается на сервере: она зависит от bot_username студии, и
    # собирать её из кусков на клиенте — второй источник правды.
    invite_link: Optional[str]
    invited_count: int
    completed_count: int


class LoyaltyOverview(BaseSchema):
    enabled: bool
    program_name: str
    currency: str

    points_balance: int
    # Сколько это в деньгах по курсу программы (points_exchange_rate баллов = 1
    # единица валюты). Баллы без цены — абстракция, ради которой никто не ходит.
    points_value_str: str
    points_exchange_rate: int

    total_spent: int
    total_spent_str: str

    level: Optional[LoyaltyLevelInfo]
    next_level: Optional[LoyaltyLevelInfo]
    # Сколько ещё потратить до следующего уровня; None — уровень последний.
    to_next_level: Optional[int]
    to_next_level_str: Optional[str]
    levels: List[LoyaltyLevelInfo]

    history: List[PointEntry]

    deposit_balance: int
    deposit_balance_str: str

    certificates: List[CertificateInfo]
    offers: List[OfferInfo]
    referral: Optional[ReferralInfo]


def _offer_label(discount_type: str, value: int, currency: str) -> str:
    return f"−{value} %" if discount_type == "percent" else f"−{_fmt_amount(value, currency)}"


@router.get("/loyalty", response_model=LoyaltyOverview)
@limiter.limit("30/minute")
async def get_loyalty_overview(
    request: Request,
    client: Client = Depends(get_current_client),
    db: AsyncSession = Depends(get_db),
):
    studio_id = client.studio_id
    _, currency = await _studio_prefs(db, studio_id)

    config = (await db.execute(
        select(StudioLoyaltyConfig).where(StudioLoyaltyConfig.studio_id == studio_id)
    )).scalar_one_or_none()

    # Карта заводится кассой при первой покупке, а не здесь: этот эндпоинт
    # только читает. Карты ещё нет — клиент в программе с нулями, а не ошибка.
    card = (await db.execute(
        select(ClientLoyaltyCard).where(ClientLoyaltyCard.client_id == client.id)
    )).scalar_one_or_none()

    points_balance = card.points_balance if card else 0
    total_spent = card.total_spent if card else 0
    deposit_balance = card.deposit_balance if card else 0

    rate = config.points_exchange_rate if config else 100
    # Курс — «сколько баллов в одной единице валюты». Ноль в делителе означал бы
    # кривой конфиг, а не бесконечную ценность баллов.
    points_value = points_balance // rate if rate > 0 else 0

    levels = await _get_or_create_levels(studio_id, db)
    current_level_id = _level_for(total_spent, levels)

    level_infos: List[LoyaltyLevelInfo] = []
    for lvl in levels:
        level_infos.append(LoyaltyLevelInfo(
            name=lvl.name,
            color=lvl.color,
            min_threshold=lvl.min_threshold,
            min_threshold_str=_fmt_amount(lvl.min_threshold, currency),
            reached=total_spent >= lvl.min_threshold,
            is_current=lvl.id == current_level_id,
        ))

    current = next((info for info in level_infos if info.is_current), None)
    # Следующий — первый недостигнутый по возрастанию порога. Список уже
    # отсортирован по sort_order, а пороги валидируются непрерывными при
    # сохранении (routers/loyalty/cards._validate_levels).
    nxt = next((info for info in level_infos if not info.reached), None)
    to_next = (nxt.min_threshold - total_spent) if nxt else None

    history_rows = (await db.execute(
        select(LoyaltyPointTransaction)
        .where(LoyaltyPointTransaction.client_id == client.id)
        .order_by(LoyaltyPointTransaction.created_at.desc())
        .limit(HISTORY_LIMIT)
    )).scalars().all()

    # Сертификаты клиента: только его собственные и только живые. Погашенный
    # сертификат в кабинете — обещание, которого уже нет.
    cert_config = (await db.execute(
        select(StudioCertificateConfig).where(StudioCertificateConfig.studio_id == studio_id)
    )).scalar_one_or_none()
    certificates: List[CertificateInfo] = []
    if cert_config and cert_config.is_enabled:
        cert_rows = (await db.execute(
            select(GiftCertificate)
            .where(
                GiftCertificate.client_id == client.id,
                GiftCertificate.status == "active",
            )
            .order_by(GiftCertificate.issued_at.desc())
        )).scalars().all()
        certificates = [
            CertificateInfo(
                code=row.code,
                amount=row.amount,
                amount_str=_fmt_amount(row.amount, currency),
                status=row.status,
                expires_at=row.expires_at,
            )
            for row in cert_rows
        ]

    # Персональные скидки — та же граница, что у find_active_offer и сводки
    # владельца: не использована и не просрочена. Третьего определения
    # «активной скидки» в продукте быть не должно.
    today = date.today()
    discount_config = (await db.execute(
        select(StudioDiscountConfig).where(StudioDiscountConfig.studio_id == studio_id)
    )).scalar_one_or_none()
    offers: List[OfferInfo] = []
    if discount_config is None or discount_config.visible_in_cabinet:
        offer_rows = (await db.execute(
            select(ClientOffer)
            .where(
                ClientOffer.client_id == client.id,
                ClientOffer.is_used.is_(False),
                (ClientOffer.valid_until.is_(None)) | (ClientOffer.valid_until >= today),
            )
            .order_by(ClientOffer.created_at.desc())
        )).scalars().all()
        offers = [
            OfferInfo(
                discount_type=row.discount_type,
                value=row.value,
                label=_offer_label(row.discount_type, row.value, currency),
                valid_until=row.valid_until,
            )
            for row in offer_rows
        ]

    # Реферальная программа — только если владелец её включил, и только
    # реальными числами из конфига. Выключена — блока в кабинете нет вовсе.
    referral_config = (await db.execute(
        select(StudioReferralConfig).where(StudioReferralConfig.studio_id == studio_id)
    )).scalar_one_or_none()
    referral: Optional[ReferralInfo] = None
    if referral_config and referral_config.is_enabled and client.invite_code:
        invited_count = (await db.execute(
            select(func.count(ReferralRecord.id))
            .where(ReferralRecord.referrer_client_id == client.id)
        )).scalar_one()
        completed_count = (await db.execute(
            select(func.count(ReferralRecord.id))
            .where(
                ReferralRecord.referrer_client_id == client.id,
                ReferralRecord.status == "completed",
            )
        )).scalar_one()

        bot_username = await _bot_username(db, studio_id)
        referral = ReferralInfo(
            referrer_bonus=referral_config.referrer_bonus,
            referrer_bonus_str=(
                f"{referral_config.referrer_bonus}"
                if referral_config.bonus_type == "points"
                else _fmt_amount(referral_config.referrer_bonus, currency)
            ),
            new_client_discount=referral_config.new_client_discount,
            bonus_type=referral_config.bonus_type,
            trigger_condition=referral_config.trigger_condition,
            invite_code=client.invite_code,
            invite_link=(
                f"https://t.me/{bot_username}?startapp=s{studio_id}_ref{client.invite_code}"
                if bot_username else None
            ),
            invited_count=invited_count,
            completed_count=completed_count,
        )

    # _get_or_create_levels мог создать дефолтную лестницу — она нужна и
    # владельцу, поэтому фиксируем, а не откатываем на выходе из запроса.
    await db.commit()

    return LoyaltyOverview(
        enabled=bool(config and config.is_enabled),
        program_name=(config.program_name if config else "Velora Club"),
        currency=currency,
        points_balance=points_balance,
        points_value_str=_fmt_amount(points_value, currency),
        points_exchange_rate=rate,
        total_spent=total_spent,
        total_spent_str=_fmt_amount(total_spent, currency),
        level=current,
        next_level=nxt,
        to_next_level=to_next,
        to_next_level_str=_fmt_amount(to_next, currency) if to_next is not None else None,
        levels=level_infos,
        history=[
            PointEntry(
                points=row.points,
                description=row.description,
                created_at=row.created_at.isoformat(),
            )
            for row in history_rows
        ],
        deposit_balance=deposit_balance,
        deposit_balance_str=_fmt_amount(deposit_balance, currency),
        certificates=certificates,
        offers=offers,
        referral=referral,
    )


async def _bot_username(db: AsyncSession, studio_id: int) -> Optional[str]:
    """Тот же источник, что у каталога студии: конфиг телеграм-канала."""
    from models import BookingChannelConfig

    channel = (await db.execute(
        select(BookingChannelConfig).where(
            BookingChannelConfig.studio_id == studio_id,
            BookingChannelConfig.channel_type == "telegram",
        )
    )).scalar_one_or_none()
    return (channel.config or {}).get("bot_username") if channel else None


class DepositEntry(BaseSchema):
    amount: int
    amount_str: str
    description: str
    created_at: str


@router.get("/loyalty/deposit-history", response_model=List[DepositEntry])
@limiter.limit("30/minute")
async def get_deposit_history(
    request: Request,
    client: Client = Depends(get_current_client),
    db: AsyncSession = Depends(get_db),
):
    """История депозита отдельной ручкой: это деньги, её открывают осознанно,
    и тащить её в основной ответ ради клиентов с нулевым балансом незачем."""
    _, currency = await _studio_prefs(db, client.studio_id)

    rows = (await db.execute(
        select(DepositTransaction)
        .where(DepositTransaction.client_id == client.id)
        .order_by(DepositTransaction.created_at.desc())
        .limit(HISTORY_LIMIT)
    )).scalars().all()

    return [
        DepositEntry(
            amount=row.amount,
            amount_str=_fmt_amount(row.amount, currency),
            description=row.description,
            created_at=row.created_at.isoformat(),
        )
        for row in rows
    ]
