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

router = APIRouter()

_CHANNEL_TYPES = {"telegram", "instagram", "whatsapp", "web"}
_TG_TOKEN_RE = re.compile(r"^\d{6,12}:[A-Za-z0-9_-]{30,50}$")


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
    return row


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
    return row


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

    if channel_type == "telegram" and body.config and "token" in body.config:
        token = body.config["token"]
        if not isinstance(token, str) or not _TG_TOKEN_RE.match(token):
            raise HTTPException(status_code=400, detail="Неверный формат токена")

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
