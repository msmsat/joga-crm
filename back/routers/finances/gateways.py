from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from dependencies import require_role, StudioContext
from models import OnlineChannel
from schemas.finances.gateways import GatewayRead, GatewayUpdate, GatewayType

router = APIRouter()

GATEWAY_TYPES: tuple[GatewayType, ...] = ("stripe", "fondy")


def _to_read(gateway_type: GatewayType, channel: OnlineChannel | None) -> GatewayRead:
    if channel is None:
        return GatewayRead(gateway_type=gateway_type, connected=False, is_active=False, public_key=None)
    return GatewayRead(
        gateway_type=gateway_type,
        connected=bool(channel.secret_key),
        is_active=channel.is_active,
        public_key=channel.public_key,
    )


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
    return [_to_read(t, by_type.get(t)) for t in GATEWAY_TYPES]


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

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(channel, field, value)

    await db.commit()
    await db.refresh(channel)
    return _to_read(gateway_type, channel)
