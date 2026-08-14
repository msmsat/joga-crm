from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import BookingChannelConfig
from dependencies import StudioContext, get_studio_context, require_role
from schemas.ai import AIQuotaRead, AISettingsRead, AISettingsUpdate
from services.ai_quota import ai_quota_status
from services.assistant import get_or_create_ai_settings
from services.notifier import _integration_config

router = APIRouter()


@router.get("/quota", response_model=AIQuotaRead)
async def get_ai_quota(
    ctx: StudioContext = Depends(get_studio_context),
    db: AsyncSession = Depends(get_db),
):
    """Остаток обращений к ИИ за месяц. Видят все роли: лимит общий на студию,
    и тренеру полезно понимать, почему ассистент отказал (require_role не нужен)."""
    used, limit = await ai_quota_status(db, ctx.studio_id)
    return AIQuotaRead(used=used, limit=limit)


async def _tg_channel_active(db: AsyncSession, studio_id: int) -> bool:
    """Активен ли канал записи Telegram: от него зависит, дойдут ли апдейты бота
    до ветки агента (_studio_by_token ищет среди is_active == True)."""
    return bool((await db.execute(
        select(BookingChannelConfig.id).where(
            BookingChannelConfig.studio_id == studio_id,
            BookingChannelConfig.channel_type == "telegram",
            BookingChannelConfig.is_active == True,  # noqa: E712
        )
    )).scalar_one_or_none())


async def _wa_phone_number(db: AsyncSession, studio_id: int) -> str | None:
    """Номер подключённой интеграции wa_notify — гейт WhatsApp-агента. Своего
    подключения у агента нет: один номер на Уведомления, Настройки и агента."""
    cfg = await _integration_config(db, studio_id, "wa_notify")
    return cfg.get("display_phone_number") or cfg.get("phone_number_id")


@router.get("/settings", response_model=AISettingsRead)
async def get_ai_settings(
    ctx: StudioContext = Depends(get_studio_context),
    db: AsyncSession = Depends(get_db),
):
    settings = await get_or_create_ai_settings(ctx.studio_id, db)
    await db.commit()
    await db.refresh(settings)

    data = AISettingsRead.model_validate(settings).model_copy(
        update={
            "wa_phone_number": await _wa_phone_number(db, ctx.studio_id),
            "tg_channel_active": await _tg_channel_active(db, ctx.studio_id),
        }
    )
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
    # Срок известен только у Instagram Login (OAuth); у ручного токена Facebook
    # Login из Уведомлений его нет — отсутствие срока не значит «просрочен».
    ig_connected = bool(settings.ig_token) and (
        settings.ig_token_expires_at is None or settings.ig_token_expires_at > datetime.utcnow()
    )
    if fields.get("ig_enabled") and not ig_connected:
        raise HTTPException(status_code=400, detail="ig_not_connected")
    wa_phone = await _wa_phone_number(db, ctx.studio_id)
    if fields.get("wa_enabled") and not wa_phone:
        raise HTTPException(status_code=400, detail="wa_not_connected")

    for field, value in fields.items():
        setattr(settings, field, value)

    # --- ПРИ ДИСКОННЕКТЕ ЧЕРЕЗ AI АГЕНТА: ВЫКЛЮЧАЕМ ТУМБЛЕР AI И СТИРАЕМ ДАННЫЕ ---
    if "tg_token" in fields and not fields["tg_token"]:
        settings.tg_enabled = False
        settings.tg_token = None
        settings.tg_username = None
    # ------------------------------------------------------------------------------

    # --- СИНХРОНИЗАЦИЯ С ОБЩИМИ ИНТЕГРАЦИЯМИ (УВЕДОМЛЕНИЯМИ) ---
    if "tg_token" in fields:
        from models import StudioIntegration
        from sqlalchemy import select
        integ = (await db.execute(select(StudioIntegration).where(
            StudioIntegration.studio_id == ctx.studio_id,
            StudioIntegration.integration_type == "tg_notify"
        ))).scalar_one_or_none()
        
        if fields["tg_token"]:
            if not integ:
                integ = StudioIntegration(studio_id=ctx.studio_id, integration_type="tg_notify")
                db.add(integ)
            integ.config = {
                "token": fields["tg_token"], 
                "bot_username": fields.get("tg_username", settings.tg_username)
            }
            integ.is_connected = True
        else:
            # Если токен стерли — делаем дисконнект и в Уведомлениях
            if integ:
                integ.is_connected = False
                integ.config = None
    # -----------------------------------------------------------

    await db.commit()
    await db.refresh(settings)
    return AISettingsRead.model_validate(settings).model_copy(update={
        "wa_phone_number": wa_phone,
        "tg_channel_active": await _tg_channel_active(db, ctx.studio_id),
    })
