"""Эпик 6, задача 4: Google Calendar — OAuth и синхронизация.

Два роутера в файле — паттерн routers/ai/instagram.py (то же разделение уже
доказало себя для Instagram OAuth): `router` — owner+JWT, обычные вызовы через
fetch; `callback_router` — публичный редирект браузера от Google без
Authorization-заголовка, студия восстанавливается только из подписанного `state`.

Отклонение от буквального текста ТЗ (эпик 6, п.4.2, диаграмма и раздел CORS):
там `/start` сам делает 302 на Google, а фронт обязан дойти до него через
голую навигацию (`window.location.assign`), поэтому ТЗ вводит отдельный
одноразовый `ticket`-эндпоинт — без него JWT пришлось бы класть в query
(история браузера, логи прокси). Вместо этого `/start` здесь — обычная
JSON-ручка под `require_role("owner")` (вызывается через fetch с обычным
Authorization-заголовком) и возвращает `{"url": ...}` для авторизации
Google; браузер уходит по этому URL прямой навигацией. Redirect через наш
бэкенд не участвует вовсе — значит, самого предмета спора (JWT в query)
просто не возникает, и отдельный ticket-эндпоинт не нужен. Это не новый
паттерн, а буквально то же самое, что уже работает для Instagram OAuth
(`GET /ai/instagram/oauth-url` → `{"url": ...}`, см. routers/ai/instagram.py).
"""
import logging
import os
from datetime import datetime, timedelta
from urllib.parse import urlencode

import aiohttp
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import ALGORITHM, SECRET_KEY, StudioContext, require_role
from models import StudioIntegration
from schemas.settings.google_calendar import (
    GoogleAuthorizeUrl, GoogleCalendarInfo, GoogleCalendarUpdate, GoogleSyncResult,
)
from schemas.settings.integrations import IntegrationStatus
from services import gcal

logger = logging.getLogger(__name__)

router = APIRouter()
callback_router = APIRouter()

WEB_APP_URL = os.getenv("WEB_APP_URL", "http://localhost:5173").rstrip("/")
_STATE_TTL_MINUTES = 10
_STATE_PURPOSE = "gcal_oauth"
_SYNC_WINDOW_DAYS = 30
_SCOPES = " ".join([
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/calendar.readonly",
    "email",  # не calendar-право; нужен только чтобы заполнить connected_email в конфиге
])


def _make_state(studio_id: int, user_id: int) -> str:
    return jwt.encode(
        {
            "studio_id": studio_id, "user_id": user_id, "purpose": _STATE_PURPOSE,
            "exp": datetime.utcnow() + timedelta(minutes=_STATE_TTL_MINUTES),
        },
        SECRET_KEY, algorithm=ALGORITHM,
    )


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


async def _get_gcal(db: AsyncSession, studio_id: int) -> StudioIntegration | None:
    return (await db.execute(
        select(StudioIntegration).where(
            StudioIntegration.studio_id == studio_id, StudioIntegration.integration_type == "gcal",
        )
    )).scalar_one_or_none()


async def _get_or_create_gcal(db: AsyncSession, studio_id: int) -> StudioIntegration:
    integ = await _get_gcal(db, studio_id)
    if integ is None:
        integ = StudioIntegration(studio_id=studio_id, integration_type="gcal")
        db.add(integ)
        await db.commit()
        await db.refresh(integ)
    return integ


def _status(integ: StudioIntegration | None) -> IntegrationStatus:
    connected = bool(integ and integ.is_connected)
    config = (integ.config or {}) if (connected and integ) else {}
    details = {
        "calendar_id": config.get("calendar_id"),
        "calendar_name": config.get("calendar_name"),
        "connected_email": config.get("connected_email"),
        "sync_mode": config.get("sync_mode"),
        "last_sync_at": config.get("last_sync_at"),
    } if connected else None
    return IntegrationStatus(
        type="google_calendar",
        connected=connected,
        connected_at=integ.updated_at if connected else None,
        details=details,
        capabilities=["schedule_sync"],
    )


@router.get("/integrations/google/start", response_model=GoogleAuthorizeUrl)
async def google_calendar_start(ctx: StudioContext = Depends(require_role("owner"))):
    params = {
        "client_id": gcal.GOOGLE_CLIENT_ID,
        "redirect_uri": gcal.GOOGLE_CALENDAR_REDIRECT_URI,
        "response_type": "code",
        "scope": _SCOPES,
        "access_type": "offline",  # без него Google не пришлёт refresh_token
        "prompt": "consent",  # иначе при повторном подключении refresh_token = None
        "state": _make_state(ctx.studio_id, ctx.user.id),
    }
    return GoogleAuthorizeUrl(url=f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}")


@callback_router.get("/integrations/google/callback")
async def google_calendar_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    if error:
        return RedirectResponse(f"{WEB_APP_URL}/dashboard/settings?tab=integrations&google=denied")

    studio_id = _studio_id_from_state(state)
    if studio_id is None or not code:
        return RedirectResponse(f"{WEB_APP_URL}/dashboard/settings?tab=integrations&google=error")

    try:
        token_data = await gcal.exchange_code(code)
        refresh_token = token_data.get("refresh_token")
        if not refresh_token:
            # Повторное подключение без prompt=consent (эдж-кейс эпика) — не сохраняем
            # битый конфиг без refresh_token, просим владельца подключить заново.
            return RedirectResponse(f"{WEB_APP_URL}/dashboard/settings?tab=integrations&google=error")
        connected_email = await gcal.fetch_connected_email(token_data["access_token"])
        calendars = await gcal.list_calendars(refresh_token)
    except (aiohttp.ClientError, TimeoutError, KeyError):
        logger.exception("google_calendar_callback: token exchange failed, studio_id=%s", studio_id)
        return RedirectResponse(f"{WEB_APP_URL}/dashboard/settings?tab=integrations&google=error")

    # Два клика — не три (эпик, user story): сразу берём основной календарь
    # владельца, а не заставляем его выбирать календарь как отдельный шаг.
    primary = next((c for c in calendars if c["primary"]), calendars[0] if calendars else None)

    integ = await _get_or_create_gcal(db, studio_id)
    integ.config = {
        "refresh_token": refresh_token,
        "connected_email": connected_email,
        "calendar_id": primary["id"] if primary else None,
        "calendar_name": primary["name"] if primary else None,
        "sync_mode": "push",
        "last_sync_at": None,
    }
    integ.is_connected = True
    await db.commit()
    return RedirectResponse(f"{WEB_APP_URL}/dashboard/settings?tab=integrations&google=ok")


@router.post("/integrations/google/sync", response_model=GoogleSyncResult)
async def google_calendar_sync(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.utcnow()
    result = await gcal.sync_studio(
        db, ctx.studio_id, now - timedelta(days=_SYNC_WINDOW_DAYS), now + timedelta(days=_SYNC_WINDOW_DAYS),
    )
    return GoogleSyncResult(**result)


@router.get("/integrations/google/calendars", response_model=list[GoogleCalendarInfo])
async def google_calendar_calendars(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    integ = await _get_gcal(db, ctx.studio_id)
    refresh_token = (integ.config or {}).get("refresh_token") if integ else None
    if integ is None or not integ.is_connected or not refresh_token:
        raise HTTPException(status_code=400, detail="Google Calendar не подключён")
    return [GoogleCalendarInfo(**c) for c in await gcal.list_calendars(refresh_token)]


@router.patch("/integrations/google", response_model=IntegrationStatus)
async def google_calendar_update(
    body: GoogleCalendarUpdate,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    integ = await _get_gcal(db, ctx.studio_id)
    if integ is None or not integ.is_connected:
        raise HTTPException(status_code=400, detail="Google Calendar не подключён")

    config = dict(integ.config or {})
    if body.calendar_id is not None:
        calendars = await gcal.list_calendars(config["refresh_token"])
        match = next((c for c in calendars if c["id"] == body.calendar_id), None)
        if match is None:
            raise HTTPException(status_code=400, detail="Календарь не найден в списке доступных")
        config["calendar_id"], config["calendar_name"] = match["id"], match["name"]
    if body.sync_mode is not None:
        config["sync_mode"] = body.sync_mode

    integ.config = config
    await db.commit()
    await db.refresh(integ)
    return _status(integ)


@router.delete("/integrations/google", response_model=IntegrationStatus)
async def google_calendar_disconnect(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    await gcal.disconnect_studio(db, ctx.studio_id)
    return _status(None)
