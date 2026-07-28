"""Единственное место в проекте, которое «думает» (эпик AI-1, задача 3).

generate_reply() говорит по OpenAI-совместимому протоколу: пустой LLM_BASE_URL —
честная локализованная заглушка; заданный — реальный запрос к любому
OpenAI-совместимому серверу (Ollama и т.п.). Подключение модели = две
переменные в .env, код роутера не меняется.
"""
import logging
import os
import random
from datetime import datetime, timedelta
from typing import Sequence

import aiohttp
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import AIChatMessage, Studio, StudioAISettings

logger = logging.getLogger(__name__)

_LLM_TIMEOUT_SECONDS = 60
_IG_REFRESH_TIMEOUT_SECONDS = 10
_IG_REFRESH_THRESHOLD = timedelta(days=10)

_FALLBACK_REPLIES = {
    "ru": [
        "Velora AI 3.5 подключается в ближайшем обновлении — я уже сохраняю ваши диалоги, скоро отвечу по существу.",
        "Настоящий интеллект Velora AI появится совсем скоро — а пока я внимательно всё записываю и ничего не теряю.",
        "Модель Velora AI 3.5 ещё не подключена, но история этого диалога уже сохранена и никуда не пропадёт.",
    ],
    "en": [
        "Velora AI 3.5 is arriving in the next update — I'm already saving our conversation and will reply properly soon.",
        "The real Velora AI is coming very soon — for now I'm carefully keeping track of everything you write.",
        "Velora AI 3.5 isn't connected yet, but this conversation's history is safely saved.",
    ],
}


def default_prompt(studio_name: str) -> str:
    return f"Ты — вежливый ассистент студии «{studio_name}». Отвечай кратко, по делу и дружелюбно."


async def get_or_create_ai_settings(studio_id: int, db: AsyncSession) -> StudioAISettings:
    """Настройки AI студии; создаёт запись с дефолтным промптом на имени студии, если её ещё нет."""
    settings = (await db.execute(
        select(StudioAISettings).where(StudioAISettings.studio_id == studio_id)
    )).scalar_one_or_none()
    if settings is None:
        studio_name = (await db.execute(
            select(Studio.name).where(Studio.id == studio_id)
        )).scalar_one()
        settings = StudioAISettings(studio_id=studio_id, system_prompt=default_prompt(studio_name))
        db.add(settings)
        await db.flush()
    await _maybe_refresh_instagram_token(settings)
    return settings


async def _maybe_refresh_instagram_token(settings: StudioAISettings) -> None:
    """Продление long-lived IG-токена (эпик AI-3, задача 4, п.3): ленивый рефреш при
    любом обращении к настройкам студии — токен живёт ~60 дней, владелец заходит
    чаще, отдельный планировщик пока не нужен.
    # ponytail: рефреш при заходе в настройки вместо cron — вынести в общий
    # планировщик, когда он появится в проекте.
    """
    if not settings.ig_token or not settings.ig_token_expires_at:
        return
    if settings.ig_token_expires_at - datetime.utcnow() > _IG_REFRESH_THRESHOLD:
        return
    try:
        timeout = aiohttp.ClientTimeout(total=_IG_REFRESH_TIMEOUT_SECONDS)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(
                "https://graph.instagram.com/refresh_access_token",
                params={"grant_type": "ig_refresh_token", "access_token": settings.ig_token},
            ) as resp:
                resp.raise_for_status()
                data = await resp.json()
        settings.ig_token = data["access_token"]
        settings.ig_token_expires_at = datetime.utcnow() + timedelta(seconds=data["expires_in"])
    except (aiohttp.ClientError, TimeoutError, KeyError, ValueError):
        # Владелец увидит приближающийся срок в UI и переподключит по инструкции (задача 5).
        logger.exception("Instagram token refresh failed for studio_id=%s", settings.studio_id)


def _resolve_language(settings_language: str, studio_language: str | None) -> str:
    lang = (settings_language if settings_language != "auto" else studio_language) or "ru"
    lang = lang.split("-")[0]
    return lang if lang in _FALLBACK_REPLIES else "ru"


def _fallback_reply(settings_language: str, studio_language: str | None) -> str:
    lang = _resolve_language(settings_language, studio_language)
    return random.choice(_FALLBACK_REPLIES[lang])


async def generate_reply(
    settings: StudioAISettings,
    studio_name: str,
    studio_language: str | None,
    history: Sequence[AIChatMessage],
) -> str:
    """Ответ ассистента. history — последние 20 сообщений сессии, по возрастанию created_at."""
    messages = [
        {"role": "system", "content": settings.system_prompt or default_prompt(studio_name)},
        *[{"role": m.role, "content": m.text} for m in history],
    ]

    base_url = os.getenv("LLM_BASE_URL")
    if not base_url:
        return _fallback_reply(settings.language, studio_language)

    try:
        timeout = aiohttp.ClientTimeout(total=_LLM_TIMEOUT_SECONDS)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(
                f"{base_url}/v1/chat/completions",
                json={"model": os.getenv("LLM_MODEL", settings.model), "messages": messages},
            ) as resp:
                resp.raise_for_status()
                data = await resp.json()
                return data["choices"][0]["message"]["content"]
    except (aiohttp.ClientError, TimeoutError, KeyError, IndexError):
        logger.exception("generate_reply: LLM request failed")
        raise HTTPException(status_code=503, detail="assistant_unavailable")
