from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import StudioContext, get_studio_context, require_role
from schemas.ai import AISettingsRead, AISettingsUpdate
from services.assistant import get_or_create_ai_settings

router = APIRouter()


@router.get("/settings", response_model=AISettingsRead)
async def get_ai_settings(
    ctx: StudioContext = Depends(get_studio_context),
    db: AsyncSession = Depends(get_db),
):
    settings = await get_or_create_ai_settings(ctx.studio_id, db)
    await db.commit()
    await db.refresh(settings)

    data = AISettingsRead.model_validate(settings)
    if ctx.role != "owner":
        data = data.model_copy(update={"tg_token": None, "ig_token": None})
    return data


@router.patch("/settings", response_model=AISettingsRead)
async def update_ai_settings(
    body: AISettingsUpdate,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    settings = await get_or_create_ai_settings(ctx.studio_id, db)

    fields = body.model_dump(exclude_unset=True)
    if fields.get("tg_enabled") and not settings.tg_token:
        raise HTTPException(status_code=400, detail="tg_token_required")
    ig_connected = bool(settings.ig_token and settings.ig_token_expires_at and settings.ig_token_expires_at > datetime.utcnow())
    if fields.get("ig_enabled") and not ig_connected:
        raise HTTPException(status_code=400, detail="ig_not_connected")

    for field, value in fields.items():
        setattr(settings, field, value)

    await db.commit()
    await db.refresh(settings)
    return settings
