"""Эпик AI-3, задача 1: проверка и подключение Telegram-бота для авто-ответчика.

Бот у студии один на всю CRM — запись/стирание токена идёт через
services.telegram_bot, который синхронно правит и Уведомления, и Онлайн-запись.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import StudioContext, require_role
from schemas.ai import TelegramTokenIn
from services.telegram_bot import connect_telegram_bot, disconnect_telegram_bot, verify_bot_token

router = APIRouter()


@router.post("/telegram/verify-token")
async def verify_telegram_token(
    body: TelegramTokenIn,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    username = await verify_bot_token(body.token)
    await connect_telegram_bot(db, ctx.studio_id, body.token, username)
    return {"username": username}


@router.delete("/telegram/token", status_code=204)
async def disconnect_telegram_token(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    await disconnect_telegram_bot(db, ctx.studio_id)
