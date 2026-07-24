"""Эпик AI-3, задача 1: проверка и подключение Telegram-бота для авто-ответчика."""
import aiohttp
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import StudioContext, require_role
from schemas.ai import TelegramTokenIn
from services.assistant import get_or_create_ai_settings

router = APIRouter()

_VERIFY_TIMEOUT_SECONDS = 5


@router.post("/telegram/verify-token")
async def verify_telegram_token(
    body: TelegramTokenIn,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    try:
        timeout = aiohttp.ClientTimeout(total=_VERIFY_TIMEOUT_SECONDS)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(f"https://api.telegram.org/bot{body.token}/getMe") as resp:
                data = await resp.json(content_type=None)
    except (aiohttp.ClientError, TimeoutError, ValueError):
        raise HTTPException(status_code=400, detail="invalid_bot_token")

    username = (data.get("result") or {}).get("username") if data.get("ok") else None
    if not username:
        raise HTTPException(status_code=400, detail="invalid_bot_token")

    settings = await get_or_create_ai_settings(ctx.studio_id, db)
    settings.tg_token = body.token
    settings.tg_username = username
    await db.commit()

    return {"username": username}


@router.delete("/telegram/token", status_code=204)
async def disconnect_telegram_token(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    settings = await get_or_create_ai_settings(ctx.studio_id, db)
    settings.tg_token = None
    settings.tg_username = None
    settings.tg_enabled = False
    await db.commit()
