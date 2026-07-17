from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from dependencies import require_role, StudioContext
from models import StudioNotificationSettings, NotificationEventToggle
from schemas.settings.notifications import (
    NotificationSettingsRead,
    NotificationSettingsUpdate,
    EventToggle,
)

router = APIRouter()


async def _get_or_create_settings(studio_id: int, db: AsyncSession) -> StudioNotificationSettings:
    settings = (await db.execute(
        select(StudioNotificationSettings).where(StudioNotificationSettings.studio_id == studio_id)
    )).scalar_one_or_none()
    if settings is None:
        settings = StudioNotificationSettings(studio_id=studio_id)
        db.add(settings)
        await db.commit()
        await db.refresh(settings)
    return settings


@router.get("/notifications", response_model=NotificationSettingsRead)
async def get_notification_settings(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    return await _get_or_create_settings(ctx.studio_id, db)


@router.patch("/notifications", response_model=NotificationSettingsRead)
async def update_notification_settings(
    body: NotificationSettingsUpdate,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    settings = await _get_or_create_settings(ctx.studio_id, db)
    # exclude_unset — трогаем только присланные поля; by_alias — колонки модели.
    for field, value in body.model_dump(exclude_unset=True, by_alias=True).items():
        setattr(settings, field, value)
    await db.commit()
    await db.refresh(settings)
    return settings


@router.get("/notifications/events", response_model=list[EventToggle])
async def get_event_toggles(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    toggles = (await db.execute(
        select(NotificationEventToggle).where(NotificationEventToggle.studio_id == ctx.studio_id)
    )).scalars().all()
    return toggles


@router.patch("/notifications/events", response_model=EventToggle)
async def upsert_event_toggle(
    body: EventToggle,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    toggle = (await db.execute(
        select(NotificationEventToggle).where(
            NotificationEventToggle.studio_id == ctx.studio_id,
            NotificationEventToggle.role == body.role,
            NotificationEventToggle.event_id == body.event_id,
            NotificationEventToggle.channel_key == body.channel_key,
        )
    )).scalar_one_or_none()
    if toggle is None:
        toggle = NotificationEventToggle(studio_id=ctx.studio_id, **body.model_dump())
        db.add(toggle)
    else:
        toggle.is_enabled = body.is_enabled
    await db.commit()
    await db.refresh(toggle)
    return toggle
