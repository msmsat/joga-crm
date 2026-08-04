"""Единый Telegram-бот студии: один токен на три поверхности CRM.

Токен физически лежит в трёх таблицах — StudioAISettings (авто-ответчик Velora AI),
StudioIntegration/tg_notify (рассылка уведомлений) и BookingChannelConfig/telegram
(канал онлайн-записи). Раньше каждая страница писала только в свою: подключение в
одном месте не было видно в двух других, а «Отключить» оставляло живые
токены-сироты. Всё подключение/отключение теперь идёт только через этот модуль,
одной транзакцией на все три таблицы.
"""
import logging
import os
from datetime import datetime

import aiohttp
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import BookingChannelConfig, StudioIntegration
from services.assistant import get_or_create_ai_settings

logger = logging.getLogger(__name__)

_VERIFY_TIMEOUT_SECONDS = 5
_WEBHOOK_TIMEOUT_SECONDS = 5
# Публичный адрес бэкенда — на него Telegram шлёт апдейты (см. BACKEND_URL в .env.example,
# тот же приём, что и у server_callback вебхука Fondy).
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000").rstrip("/")


async def _set_webhook(token: str) -> None:
    """Подписывает бота на апдейты /booking/telegram/webhook/{token} — оттуда
    отвечает /start (routers/booking/telegram_webhook.py).

    Ошибку глушим: без вебхука просто не будет ответа на /start, а не сломанное
    подключение — токен уже проверен verify_bot_token, отменять его из-за сети не за что.
    """
    try:
        timeout = aiohttp.ClientTimeout(total=_WEBHOOK_TIMEOUT_SECONDS)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(
                f"https://api.telegram.org/bot{token}/setWebhook",
                json={"url": f"{BACKEND_URL}/booking/telegram/webhook/{token}"},
            ) as resp:
                if resp.status >= 400:
                    logger.warning("Telegram setWebhook: %s (%s)", resp.status, (await resp.text())[:200])
    except (aiohttp.ClientError, TimeoutError) as exc:
        logger.warning("Telegram setWebhook не удался: %s", exc)


async def _delete_webhook(token: str) -> None:
    try:
        timeout = aiohttp.ClientTimeout(total=_WEBHOOK_TIMEOUT_SECONDS)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(f"https://api.telegram.org/bot{token}/deleteWebhook") as resp:
                if resp.status >= 400:
                    logger.warning("Telegram deleteWebhook: %s (%s)", resp.status, (await resp.text())[:200])
    except (aiohttp.ClientError, TimeoutError) as exc:
        logger.warning("Telegram deleteWebhook не удался: %s", exc)


async def verify_bot_token(token: str) -> str:
    """Живая проверка токена через Telegram getMe. Возвращает username бота.

    Формат токена проверяют схемы на входе, но синтаксически валидный токен может
    принадлежать несуществующему боту — без этого вызова он расползся бы по всем
    трём таблицам как рабочий.
    """
    try:
        timeout = aiohttp.ClientTimeout(total=_VERIFY_TIMEOUT_SECONDS)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(f"https://api.telegram.org/bot{token}/getMe") as resp:
                data = await resp.json(content_type=None)
    except (aiohttp.ClientError, TimeoutError, ValueError):
        raise HTTPException(status_code=400, detail="invalid_bot_token")

    username = (data.get("result") or {}).get("username") if data.get("ok") else None
    if not username:
        raise HTTPException(status_code=400, detail="invalid_bot_token")
    return username


async def _get_or_create_notify_integration(db: AsyncSession, studio_id: int) -> StudioIntegration:
    row = (await db.execute(
        select(StudioIntegration).where(
            StudioIntegration.studio_id == studio_id,
            StudioIntegration.integration_type == "tg_notify",
        )
    )).scalar_one_or_none()
    if row is None:
        row = StudioIntegration(studio_id=studio_id, integration_type="tg_notify")
        db.add(row)
        await db.flush()
    return row


async def _get_or_create_booking_channel(db: AsyncSession, studio_id: int) -> BookingChannelConfig:
    row = (await db.execute(
        select(BookingChannelConfig).where(
            BookingChannelConfig.studio_id == studio_id,
            BookingChannelConfig.channel_type == "telegram",
        )
    )).scalar_one_or_none()
    if row is None:
        row = BookingChannelConfig(studio_id=studio_id, channel_type="telegram")
        db.add(row)
        await db.flush()
    return row


async def connect_telegram_bot(db: AsyncSession, studio_id: int, token: str, username: str) -> None:
    """Проставляет токен во все три таблицы. Коммитит сам."""
    ai = await get_or_create_ai_settings(studio_id, db)
    ai.tg_token = token
    ai.tg_username = username
    # tg_enabled не трогаем: это отдельный тумблер авто-ответчика, подключение
    # бота не должно само включать ответы клиентам от имени AI.

    integ = await _get_or_create_notify_integration(db, studio_id)
    integ.is_connected = True
    integ.config = {"token": token, "bot_username": username}

    channel = await _get_or_create_booking_channel(db, studio_id)
    channel.is_active = True
    channel.config = {"token": token, "bot_username": username}
    if channel.connected_at is None:
        channel.connected_at = datetime.utcnow()

    await db.commit()
    # После коммита: подписка на вебхук не должна откатывать уже сохранённое
    # подключение, если Telegram недоступен (см. _set_webhook).
    await _set_webhook(token)


async def disconnect_telegram_bot(db: AsyncSession, studio_id: int) -> None:
    """Стирает токен из всех трёх таблиц. Коммитит сам."""
    ai = await get_or_create_ai_settings(studio_id, db)
    old_token = ai.tg_token
    ai.tg_token = None
    ai.tg_username = None
    ai.tg_enabled = False

    integ = await _get_or_create_notify_integration(db, studio_id)
    integ.is_connected = False
    integ.config = None

    channel = await _get_or_create_booking_channel(db, studio_id)
    channel.is_active = False
    channel.config = None
    channel.connected_at = None

    await db.commit()
    if old_token:
        await _delete_webhook(old_token)
