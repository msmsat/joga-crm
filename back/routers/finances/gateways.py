import logging
import os
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from dependencies import require_role, StudioContext
from models import OnlineChannel, Studio
from schemas.finances.gateways import GatewayConnectResult, GatewayRead, GatewayUpdate, GatewayType
from services import stripe_connect

logger = logging.getLogger(__name__)
router = APIRouter()

GATEWAY_TYPES: tuple[GatewayType, ...] = ("stripe", "fondy")

WEB_APP_URL = os.getenv("WEB_APP_URL", "http://localhost:5173").rstrip("/")
# tab=onlinePayments — ключ вкладки, который читает Finances.tsx (initialFromUrl).
_RETURN_URL = f"{WEB_APP_URL}/dashboard/finances?tab=onlinePayments&stripe=return"
_REFRESH_URL = f"{WEB_APP_URL}/dashboard/finances?tab=onlinePayments&stripe=refresh"

# Домен, на котором крутится форма оплаты — его и регистрируем под кошельки.
# localhost зарегистрировать нельзя (Apple требует публичный HTTPS), поэтому
# локально Apple/Google Pay в форме не появятся — это ограничение Apple, не наше.
_WALLET_DOMAIN = urlparse(WEB_APP_URL).hostname or ""
_WALLET_DOMAIN_PUBLIC = bool(_WALLET_DOMAIN) and _WALLET_DOMAIN not in ("localhost", "127.0.0.1")


def _to_read(gateway_type: GatewayType, channel: OnlineChannel | None) -> GatewayRead:
    if channel is None:
        return GatewayRead(gateway_type=gateway_type, connected=False, is_active=False, public_key=None)
    return GatewayRead(
        gateway_type=gateway_type,
        connected=bool(channel.secret_key),
        is_active=channel.is_active,
        public_key=channel.public_key,
    )


async def _stripe_read(channel: OnlineChannel | None) -> GatewayRead:
    """Карточка Stripe: статус спрашиваем у Stripe, в БД лежит только acct_….

    Stripe недоступен/ключ платформы не задан → показываем аккаунт как есть, без
    признаков готовности. Молча рисовать «Подключён» по наличию строки в БД
    нельзя: касса тогда предложит оплату картой, которая упадёт у клиента.
    """
    if channel is None or not channel.account_id:
        return GatewayRead(gateway_type="stripe", connected=False, is_active=False)

    charges_enabled = details_submitted = requirements_due = False
    if stripe_connect.configured():
        try:
            charges_enabled, details_submitted, requirements_due = await stripe_connect.account_status(channel.account_id)
        except Exception:
            logger.exception("Stripe: не удалось получить статус аккаунта %s", channel.account_id)

    return GatewayRead(
        gateway_type="stripe",
        connected=charges_enabled,
        is_active=channel.is_active,
        account_id=channel.account_id,
        details_submitted=details_submitted,
        charges_enabled=charges_enabled,
        requirements_due=requirements_due,
    )


async def get_stripe_channel(db: AsyncSession, studio_id: int) -> OnlineChannel | None:
    return (await db.execute(
        select(OnlineChannel).where(
            OnlineChannel.studio_id == studio_id,
            OnlineChannel.channel_type == "stripe",
        )
    )).scalar_one_or_none()


@router.get("/gateways", response_model=list[GatewayRead])
async def list_gateways(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    channels = (await db.execute(
        select(OnlineChannel).where(
            OnlineChannel.studio_id == ctx.studio_id,
            OnlineChannel.channel_type.in_(GATEWAY_TYPES),
        )
    )).scalars().all()
    by_type = {c.channel_type: c for c in channels}
    return [
        await _stripe_read(by_type.get("stripe")) if t == "stripe" else _to_read(t, by_type.get(t))
        for t in GATEWAY_TYPES
    ]


@router.post("/gateways/stripe/connect", response_model=GatewayConnectResult)
async def connect_stripe(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Кнопка «Подключить Stripe» → ссылка на форму Stripe Connect.

    Аккаунт студии создаём один раз и переиспользуем: повторный клик (анкета
    брошена на середине, ссылка протухла) выдаёт новую ссылку на ТОТ ЖЕ acct_…,
    иначе у студии копятся пустые аккаунты, а деньги придут не на тот.
    """
    if not stripe_connect.configured():
        raise HTTPException(status_code=503, detail={
            "code": "gateways.stripe_not_configured",
            "message": "Приём оплат через Stripe не настроен на сервере",
        })

    channel = await get_stripe_channel(db, ctx.studio_id)
    if channel is None:
        # is_active=True сразу: клик по «Подключить» и ЕСТЬ намерение принимать
        # оплаты. С дефолтным False владелец прошёл бы весь онбординг Stripe и
        # упёрся в «приём выключен» — тумблер тут для паузы, а не для старта.
        channel = OnlineChannel(studio_id=ctx.studio_id, channel_type="stripe", is_active=True)
        db.add(channel)

    if not channel.account_id:
        studio = (await db.execute(
            select(Studio).where(Studio.id == ctx.studio_id)
        )).scalar_one()
        try:
            channel.account_id = await stripe_connect.create_account(studio.email)
        except Exception as exc:
            logger.exception("Stripe: не удалось создать аккаунт для студии %s", ctx.studio_id)
            raise HTTPException(status_code=502, detail={
                "code": "gateways.stripe_error", "message": "Stripe отклонил запрос",
            }) from exc
        # Коммитим до выдачи ссылки: если ответ потеряется по дороге, аккаунт уже
        # наш и следующий клик продолжит его, а не создаст второй.
        await db.commit()

    # ponytail: регистрируем домен на каждый клик «Подключить/Продолжить» вместо
    # отдельного хука на завершение онбординга. Вызов идемпотентный и не роняет
    # подключение; отдельный хук — если это станет заметно в логах.
    if _WALLET_DOMAIN_PUBLIC:
        await stripe_connect.register_payment_method_domain(channel.account_id, _WALLET_DOMAIN)

    try:
        url = await stripe_connect.onboarding_url(channel.account_id, _RETURN_URL, _REFRESH_URL)
    except Exception as exc:
        logger.exception("Stripe: не удалось создать ссылку онбординга для %s", channel.account_id)
        raise HTTPException(status_code=502, detail={
            "code": "gateways.stripe_error", "message": "Stripe отклонил запрос",
        }) from exc

    return GatewayConnectResult(url=url)


@router.put("/gateways/{gateway_type}", response_model=GatewayRead)
async def update_gateway(
    gateway_type: GatewayType,
    body: GatewayUpdate,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    channel = (await db.execute(
        select(OnlineChannel).where(
            OnlineChannel.studio_id == ctx.studio_id,
            OnlineChannel.channel_type == gateway_type,
        )
    )).scalar_one_or_none()
    if channel is None:
        channel = OnlineChannel(studio_id=ctx.studio_id, channel_type=gateway_type)
        db.add(channel)

    fields = body.model_dump(exclude_unset=True)
    # У Stripe своих ключей студии нет — только тумблер. Приняв их здесь, мы бы
    # снова начали хранить чужой secret_key, ради отказа от которого и Connect.
    if gateway_type == "stripe":
        fields = {k: v for k, v in fields.items() if k == "is_active"}

    for field, value in fields.items():
        setattr(channel, field, value)

    await db.commit()
    await db.refresh(channel)
    return await _stripe_read(channel) if gateway_type == "stripe" else _to_read(gateway_type, channel)
