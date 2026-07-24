from fastapi import APIRouter, Depends
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from dependencies import require_role, StudioContext
from models import StudioNotificationSettings, NotificationEventToggle
from schemas.settings.notifications import (
    NotificationSettingsRead,
    NotificationSettingsUpdate,
    EventToggle,
    EventToggleBulkUpdate,
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


@router.get(
    "/notifications",
    response_model=NotificationSettingsRead,
    response_model_by_alias=False,  # отдаём telegram, а не telegram_notifications
)
async def get_notification_settings(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    return await _get_or_create_settings(ctx.studio_id, db)


@router.patch(
    "/notifications",
    response_model=NotificationSettingsRead,
    response_model_by_alias=False,  # ответ PATCH тоже в коротких ключах
)
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


@router.patch("/notifications/events/bulk", response_model=list[EventToggle])
async def bulk_upsert_event_toggles(
    body: EventToggleBulkUpdate,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Пачка тумблеров матрицы — один INSERT ... ON CONFLICT, одна транзакция
    (EPIC N-8: дефект B — было 2×N запросов на серию кликов)."""
    rows = [
        {
            "studio_id": ctx.studio_id,  # studio_id всегда из контекста, не из тела
            "role": t.role,
            "event_id": t.event_id,
            "channel_key": t.channel_key,
            "is_enabled": t.is_enabled,
        }
        for t in body.toggles
    ]
    stmt = (
        pg_insert(NotificationEventToggle)
        .values(rows)
        .on_conflict_do_update(
            constraint="uq_notif_toggle",
            set_={"is_enabled": pg_insert(NotificationEventToggle).excluded.is_enabled},
        )
        .returning(NotificationEventToggle)
    )
    result = (await db.execute(stmt)).scalars().all()
    await db.commit()
    return result
