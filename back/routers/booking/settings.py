"""Настройки записи и каналы студии (задача 9).

Настройки — одна строка на студию (get-or-create дефолтов при первом GET).
Каналы — upsert по (studio_id, channel_type); при активации проставляется
connected_at. Всё — только owner, скоуп по ctx.studio_id.
"""
import re
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from dependencies import require_role, StudioContext
from models import StudioBookingSettings, BookingChannelConfig
from schemas.settings.booking import (
    BookingSettingsRead, BookingSettingsUpdate,
    BookingChannelRead, BookingChannelUpdate,
)
from services.telegram_bot import connect_telegram_bot, disconnect_telegram_bot, verify_bot_token
# Адрес мини-приложения один на проект — берём тот же, которым бот отвечает на
# /start, а не второй getenv: разъехавшись, они дадут владельцу ссылку, ведущую
# не туда, куда ведёт кнопка в Telegram.
from .telegram_webhook import MINIAPP_URL

router = APIRouter()

_CHANNEL_TYPES = {"telegram", "instagram", "whatsapp", "web"}
_TG_TOKEN_RE = re.compile(r"^\d{6,12}:[A-Za-z0-9_-]{30,50}$")


def _read(row: StudioBookingSettings) -> BookingSettingsRead:
    """Настройки + вычисляемая ссылка на мини-приложение (/s/{studio_id})."""
    return BookingSettingsRead.model_validate(row).model_copy(
        update={"miniapp_url": f"{MINIAPP_URL}/s/{row.studio_id}"}
    )


async def _telegram_channel(db: AsyncSession, studio_id: int) -> BookingChannelConfig:
    """Строка канала после записи общим сервисом — он гарантирует, что она есть."""
    return (await db.execute(
        select(BookingChannelConfig).where(
            BookingChannelConfig.studio_id == studio_id,
            BookingChannelConfig.channel_type == "telegram",
        )
    )).scalar_one()


@router.get("/settings", response_model=BookingSettingsRead)
async def get_booking_settings(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    row = (await db.execute(
        select(StudioBookingSettings).where(StudioBookingSettings.studio_id == ctx.studio_id)
    )).scalar_one_or_none()
    if row is None:
        row = StudioBookingSettings(studio_id=ctx.studio_id)
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return _read(row)


@router.patch("/settings", response_model=BookingSettingsRead)
async def update_booking_settings(
    body: BookingSettingsUpdate,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    row = (await db.execute(
        select(StudioBookingSettings).where(StudioBookingSettings.studio_id == ctx.studio_id)
    )).scalar_one_or_none()
    if row is None:
        row = StudioBookingSettings(studio_id=ctx.studio_id)
        db.add(row)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    await db.commit()
    await db.refresh(row)
    return _read(row)


@router.get("/channels", response_model=List[BookingChannelRead])
async def list_channels(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(BookingChannelConfig).where(BookingChannelConfig.studio_id == ctx.studio_id)
    )).scalars().all()
    return rows


@router.patch("/channels/{channel_type}", response_model=BookingChannelRead)
async def update_channel(
    channel_type: str,
    body: BookingChannelUpdate,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    if channel_type not in _CHANNEL_TYPES:
        raise HTTPException(status_code=400, detail="Неизвестный тип канала")

    # Telegram-бот у студии один на всю CRM: его токен и статус живут ещё в
    # Уведомлениях и в настройках AI-агента. Подключение/отключение идёт через
    # общий сервис, иначе правка только этой строки разъезжается с двумя другими.
    if channel_type == "telegram":
        token = (body.config or {}).get("token")
        if token is not None:
            if not isinstance(token, str) or not _TG_TOKEN_RE.match(token):
                raise HTTPException(status_code=400, detail="Неверный формат токена")
            username = await verify_bot_token(token)
            await connect_telegram_bot(db, ctx.studio_id, token, username)
            return await _telegram_channel(db, ctx.studio_id)
        if body.is_active is False:
            await disconnect_telegram_bot(db, ctx.studio_id)
            return await _telegram_channel(db, ctx.studio_id)

    row = (await db.execute(
        select(BookingChannelConfig).where(
            BookingChannelConfig.studio_id == ctx.studio_id,
            BookingChannelConfig.channel_type == channel_type,
        )
    )).scalar_one_or_none()
    if row is None:
        row = BookingChannelConfig(studio_id=ctx.studio_id, channel_type=channel_type)
        db.add(row)

    data = body.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(row, field, value)

    # connected_at проставляем при первой активации, снимаем при отключении.
    if row.is_active and row.connected_at is None:
        row.connected_at = datetime.utcnow()
    elif not row.is_active:
        row.connected_at = None

    await db.commit()
    await db.refresh(row)
    return row
