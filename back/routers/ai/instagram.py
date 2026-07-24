"""Эпик AI-3, задача 4: OAuth Instagram (Instagram API with Instagram Login) для авто-ответчика.

Два роутера в одном файле: `router` (oauth-url, disconnect) — owner+JWT, гейт подписки
вешает routers/ai/router.py; `callback_router` — публичный редирект браузера от Meta,
без Authorization-заголовка (аналог /booking/public — см. routers/booking/router.py).
Студия в callback устанавливается только через проверенный `state`-JWT, не через сессию.
"""
import logging
import os
from datetime import datetime, timedelta
from urllib.parse import urlencode

import aiohttp
from fastapi import APIRouter, Depends, Request
from fastapi.responses import RedirectResponse
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import ALGORITHM, SECRET_KEY, StudioContext, require_role
from ratelimit import limiter
from services.assistant import get_or_create_ai_settings

logger = logging.getLogger(__name__)

router = APIRouter()
callback_router = APIRouter()

IG_APP_ID = os.getenv("IG_APP_ID", "")
IG_APP_SECRET = os.getenv("IG_APP_SECRET", "")
IG_REDIRECT_URI = os.getenv("IG_REDIRECT_URI", "")
WEB_APP_URL = os.getenv("WEB_APP_URL", "http://localhost:5173").rstrip("/")

_STATE_TTL_MINUTES = 10
_OAUTH_TIMEOUT_SECONDS = 10
_STATE_PURPOSE = "ig_oauth"


@router.get("/instagram/oauth-url")
async def get_instagram_oauth_url(ctx: StudioContext = Depends(require_role("owner"))):
    state = jwt.encode(
        {
            "studio_id": ctx.studio_id,
            "purpose": _STATE_PURPOSE,
            "exp": datetime.utcnow() + timedelta(minutes=_STATE_TTL_MINUTES),
        },
        SECRET_KEY, algorithm=ALGORITHM,
    )
    params = {
        "client_id": IG_APP_ID,
        "redirect_uri": IG_REDIRECT_URI,
        "response_type": "code",
        "scope": "instagram_business_basic,instagram_business_manage_messages",
        "state": state,
    }
    return {"url": f"https://www.instagram.com/oauth/authorize?{urlencode(params)}"}


@router.delete("/instagram/connection", status_code=204)
async def disconnect_instagram(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    settings = await get_or_create_ai_settings(ctx.studio_id, db)
    settings.ig_token = None
    settings.ig_user_id = None
    settings.ig_username = None
    settings.ig_token_expires_at = None
    settings.ig_enabled = False
    await db.commit()


def _studio_id_from_state(state: str | None) -> int | None:
    if not state:
        return None
    try:
        payload = jwt.decode(state, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None
    if payload.get("purpose") != _STATE_PURPOSE:
        return None
    return payload.get("studio_id")


async def _exchange_code_for_token(code: str) -> str:
    """code -> short-lived access token."""
    timeout = aiohttp.ClientTimeout(total=_OAUTH_TIMEOUT_SECONDS)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.post(
            "https://api.instagram.com/oauth/access_token",
            data={
                "client_id": IG_APP_ID,
                "client_secret": IG_APP_SECRET,
                "grant_type": "authorization_code",
                "redirect_uri": IG_REDIRECT_URI,
                "code": code,
            },
        ) as resp:
            resp.raise_for_status()
            data = await resp.json()
            return data["access_token"]


async def _exchange_long_lived_token(short_token: str) -> tuple[str, int]:
    """short-lived -> (long-lived token, expires_in секунд, ~60 дней)."""
    timeout = aiohttp.ClientTimeout(total=_OAUTH_TIMEOUT_SECONDS)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.get(
            "https://graph.instagram.com/access_token",
            params={"grant_type": "ig_exchange_token", "client_secret": IG_APP_SECRET, "access_token": short_token},
        ) as resp:
            resp.raise_for_status()
            data = await resp.json()
            return data["access_token"], data["expires_in"]


async def _fetch_ig_profile(token: str) -> tuple[str, str]:
    timeout = aiohttp.ClientTimeout(total=_OAUTH_TIMEOUT_SECONDS)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.get(
            "https://graph.instagram.com/v23.0/me",
            params={"fields": "user_id,username", "access_token": token},
        ) as resp:
            resp.raise_for_status()
            data = await resp.json()
            return str(data["user_id"]), data["username"]


@callback_router.get("/instagram/callback")
@limiter.limit("20/minute")
async def instagram_oauth_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    studio_id = _studio_id_from_state(state)
    if studio_id is None or not code:
        return RedirectResponse(f"{WEB_APP_URL}/dashboard/ai?ig=error")

    try:
        short_token = await _exchange_code_for_token(code)
        long_token, expires_in = await _exchange_long_lived_token(short_token)
        ig_user_id, username = await _fetch_ig_profile(long_token)
    except (aiohttp.ClientError, TimeoutError, KeyError, ValueError):
        logger.exception("instagram_oauth_callback: token exchange failed for studio_id=%s", studio_id)
        return RedirectResponse(f"{WEB_APP_URL}/dashboard/ai?ig=error")

    settings = await get_or_create_ai_settings(studio_id, db)
    settings.ig_token = long_token
    settings.ig_user_id = ig_user_id
    settings.ig_username = username
    settings.ig_token_expires_at = datetime.utcnow() + timedelta(seconds=expires_in)
    await db.commit()

    return RedirectResponse(f"{WEB_APP_URL}/dashboard/ai?ig=connected")
