"""Эпик AI-3, задача 4: OAuth Instagram (Instagram API with Instagram Login) для авто-ответчика.

Три роутера в одном файле: `router` (oauth-url, disconnect) — owner+JWT, гейт подписки
вешает routers/ai/router.py; `callback_router` — публичный редирект браузера от Meta,
без Authorization-заголовка (аналог /booking/public — см. routers/booking/router.py);
`webhook_router` — публичные GET/POST от Meta с входящими сообщениями директа,
авторизация не по JWT, а по verify-токену (GET) и подписи тела (POST).
Студия в callback устанавливается только через проверенный `state`-JWT, не через сессию.
"""
import hashlib
import hmac
import json
import logging
import os
import re
from datetime import datetime, timedelta, timezone, tzinfo
from urllib.parse import urlencode
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import aiohttp
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse, PlainTextResponse, RedirectResponse
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import ALGORITHM, SECRET_KEY, StudioContext, require_role
from models import AIChatMessage, Studio, StudioAISettings, StudioWorkingHours
from ratelimit import limiter
from services.assistant import generate_reply, get_or_create_ai_settings

logger = logging.getLogger(__name__)

router = APIRouter()
callback_router = APIRouter()
webhook_router = APIRouter()

IG_APP_ID = os.getenv("IG_APP_ID", "")
IG_APP_SECRET = os.getenv("IG_APP_SECRET", "")
IG_REDIRECT_URI = os.getenv("IG_REDIRECT_URI", "")
IG_VERIFY_TOKEN = os.getenv("IG_VERIFY_TOKEN", "")
WEB_APP_URL = os.getenv("WEB_APP_URL", "http://localhost:5173").rstrip("/")
IG_GRAPH = "https://graph.instagram.com/v23.0"

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
            f"{IG_GRAPH}/me",
            params={"fields": "user_id,username", "access_token": token},
        ) as resp:
            resp.raise_for_status()
            data = await resp.json()
            return str(data["user_id"]), data["username"]


async def _subscribe_webhooks(token: str) -> None:
    """Подписка приложения на события аккаунта. Без неё Meta не шлёт ни одного
    сообщения в вебхук даже при валидном токене и настроенном в панели callback URL."""
    timeout = aiohttp.ClientTimeout(total=_OAUTH_TIMEOUT_SECONDS)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.post(
            f"{IG_GRAPH}/me/subscribed_apps",
            params={"subscribed_fields": "messages", "access_token": token},
        ) as resp:
            resp.raise_for_status()


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

    # Подписка отдельным шагом: упала — подключение всё равно состоялось, токен валиден.
    # Повторится при следующем подключении; событий до этого не будет — видно по логу.
    try:
        await _subscribe_webhooks(long_token)
    except (aiohttp.ClientError, TimeoutError):
        logger.exception("instagram_oauth_callback: subscribed_apps failed for studio_id=%s", studio_id)

    settings = await get_or_create_ai_settings(studio_id, db)
    settings.ig_token = long_token
    settings.ig_user_id = ig_user_id
    settings.ig_username = username
    settings.ig_token_expires_at = datetime.utcnow() + timedelta(seconds=expires_in)
    await db.commit()

    return RedirectResponse(f"{WEB_APP_URL}/dashboard/ai?ig=connected")


# --- Вебхук входящих сообщений -------------------------------------------------


def _valid_signature(raw: bytes, header: str | None) -> bool:
    """X-Hub-Signature-256: HMAC-SHA256 сырого тела на app secret. Fail closed:
    нет секрета в окружении — не верим никакому телу."""
    if not IG_APP_SECRET or not header or not header.startswith("sha256="):
        return False
    expected = hmac.new(IG_APP_SECRET.encode(), raw, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, header[len("sha256="):])


def _incoming_messages(payload: dict) -> list[tuple[str, str, str]]:
    """Полезные текстовые сообщения из тела вебхука -> [(id аккаунта студии, IGSID клиента, текст)].

    Отсекаем: is_echo (наш же ответ — иначе бот отвечает сам себе по кругу),
    события без текста (read, reaction, postback, вложения).
    """
    out: list[tuple[str, str, str]] = []
    for entry in payload.get("entry") or []:
        for event in entry.get("messaging") or []:
            message = event.get("message") or {}
            text = message.get("text")
            sender = (event.get("sender") or {}).get("id")
            account = (event.get("recipient") or {}).get("id")
            if text and sender and account and not message.get("is_echo"):
                out.append((str(account), str(sender), text))
    return out


_TONE_HINTS = {
    "friendly": "Пиши дружелюбно и тепло, как живой администратор студии.",
    "formal": "Пиши вежливо и официально, обращайся на «вы».",
    "neutral": "Пиши нейтрально и по-деловому, без лишних эмоций.",
}


def _studio_tz(timezone_name: str | None) -> tzinfo | None:
    """Зона студии. Онбординг сохраняет её как смещение («UTC+3»), а не как имя IANA
    («Europe/Kyiv»), поэтому понимаем оба формата. Не разобрали — None (время сервера)."""
    if not timezone_name:
        return None
    try:
        return ZoneInfo(timezone_name)
    except (ZoneInfoNotFoundError, ValueError):
        pass
    m = re.fullmatch(r"UTC([+-])(\d{1,2})(?::(\d{2}))?", timezone_name.strip(), re.IGNORECASE)
    if m:
        sign = 1 if m.group(1) == "+" else -1
        return timezone(sign * timedelta(hours=int(m.group(2)), minutes=int(m.group(3) or 0)))
    logger.warning("instagram webhook: не разобрал таймзону студии %r", timezone_name)
    return None


def _studio_now(timezone_name: str | None) -> datetime:
    """Местное время студии; зона не задана или не разобрана — время сервера."""
    return datetime.now(_studio_tz(timezone_name))


def _is_open_now(hours: StudioWorkingHours | None, now: datetime) -> bool:
    """Открыта ли студия в этот момент. Нет записи на сегодня — считаем закрытой."""
    if hours is None or not hours.is_open:
        return False
    # open/close_time хранятся как "HH:MM" — лексикографическое сравнение здесь корректно.
    return hours.open_time <= now.strftime("%H:%M") < hours.close_time


async def _compose_reply(
    settings: StudioAISettings, studio: Studio, incoming: str, db: AsyncSession
) -> str | None:
    """Текст ответа авто-ответчика или None, если по настройкам отвечать не нужно."""
    if settings.ig_off_hours_only:
        hours = (await db.execute(
            select(StudioWorkingHours).where(
                StudioWorkingHours.studio_id == settings.studio_id,
                # 0 = понедельник, как в routers/studio/router.py::_DEFAULT_HOURS
                StudioWorkingHours.day_of_week == _studio_now(studio.timezone).weekday(),
            )
        )).scalar_one_or_none()
        if _is_open_now(hours, _studio_now(studio.timezone)):
            return None  # рабочее время: отвечает живой администратор, не бот

    limit = settings.ig_max_length
    extra = (
        f"{_TONE_HINTS.get(settings.ig_tone, '')} Это переписка в Instagram Direct: "
        f"ответь одним сообщением не длиннее {limit} символов."
    ).strip()
    reply = await generate_reply(
        settings, studio.name, studio.language,
        [AIChatMessage(role="user", text=incoming)],
        extra_system=extra,
    )
    # Жёсткая обрезка: модель просьбу о лимите может и не соблюсти, а Graph отвергнет
    # сообщение длиннее 1000 символов целиком.
    return reply[:limit]


async def _send_ig_message(token: str, recipient_igsid: str, text: str) -> None:
    timeout = aiohttp.ClientTimeout(total=_OAUTH_TIMEOUT_SECONDS)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.post(
            f"{IG_GRAPH}/me/messages",
            params={"access_token": token},
            json={"recipient": {"id": recipient_igsid}, "message": {"text": text}},
        ) as resp:
            if resp.status >= 400:
                # Тело ответа Graph — единственное место, где написана причина отказа
                # («вне 24-часового окна», «нет прав», «получатель недоступен»).
                # Без него в логе остаётся голая 400 и гадание. Токен не логируем.
                raise RuntimeError(f"Graph {resp.status}: {(await resp.text())[:400]}")


@webhook_router.get("/instagram/webhook")
async def verify_instagram_webhook(
    mode: str | None = Query(None, alias="hub.mode"),
    token: str | None = Query(None, alias="hub.verify_token"),
    challenge: str | None = Query(None, alias="hub.challenge"),
):
    """Разовая проверка URL при сохранении вебхука в панели Meta: вернуть challenge как есть."""
    if mode == "subscribe" and IG_VERIFY_TOKEN and token and hmac.compare_digest(token, IG_VERIFY_TOKEN):
        return PlainTextResponse(challenge or "")
    logger.warning("instagram webhook verify: неверный verify_token")
    return PlainTextResponse("forbidden", status_code=403)


@webhook_router.post("/instagram/webhook")
async def instagram_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """Входящее сообщение директа -> ответ авто-ответчика.

    На валидное тело ВСЕГДА 200 (как у вебхука Fondy): любой 4xx/5xx заставит Meta
    ретраить и задвоит ответы клиенту.
    # ponytail: ответ отправляется прямо в обработчике (у Meta ~5 c на ответ вебхука);
    # при заметном потоке сообщений — в фоновую очередь.
    """
    raw = await request.body()
    if not _valid_signature(raw, request.headers.get("x-hub-signature-256")):
        return JSONResponse(status_code=403, content={"detail": "invalid signature"})
    try:
        payload = json.loads(raw)
    except ValueError:
        return {"ok": True}

    for account_id, sender_igsid, text in _incoming_messages(payload):
        settings = (await db.execute(
            select(StudioAISettings).where(StudioAISettings.ig_user_id == account_id)
        )).scalar_one_or_none()
        # Тумблер агента на странице AI — источник правды: выключен, значит молчим.
        if settings is None or not settings.ig_enabled or not settings.ig_token:
            continue
        studio = (await db.execute(
            select(Studio).where(Studio.id == settings.studio_id)
        )).scalar_one_or_none()
        if studio is None:
            continue

        try:
            reply = await _compose_reply(settings, studio, text, db)
        except HTTPException:  # generate_reply: модель недоступна
            logger.exception("instagram webhook: ассистент недоступен, studio_id=%s", settings.studio_id)
            continue
        if reply is None:
            logger.info("instagram webhook: рабочее время, агент настроен только на нерабочие часы")
            continue

        try:
            await _send_ig_message(settings.ig_token, sender_igsid, reply)
        except (aiohttp.ClientError, TimeoutError, RuntimeError) as exc:
            logger.error("instagram webhook: не удалось ответить, studio_id=%s: %s", settings.studio_id, exc)
            continue
        settings.ig_handled_count += 1
        logger.info("instagram webhook: ответ отправлен, studio_id=%s, входящее=%r", settings.studio_id, text[:50])

    await db.commit()
    return {"ok": True}


if __name__ == "__main__":
    # Самопроверка без сети и БД: подпись и разбор тела (паттерн routers/billing/webhook.py).
    IG_APP_SECRET = "s3cret"
    body = b'{"object":"instagram"}'
    good = "sha256=" + hmac.new(b"s3cret", body, hashlib.sha256).hexdigest()
    assert _valid_signature(body, good)
    assert not _valid_signature(body, "sha256=" + "0" * 64)
    assert not _valid_signature(body, None)
    assert not _valid_signature(b'{"object":"x"}', good)  # тело подменили — подпись не сходится

    event = {"entry": [{"messaging": [
        {"sender": {"id": "111"}, "recipient": {"id": "999"}, "message": {"mid": "m1", "text": "Привет"}},
        {"sender": {"id": "999"}, "recipient": {"id": "111"}, "message": {"mid": "m2", "text": "Hello", "is_echo": True}},
        {"sender": {"id": "111"}, "recipient": {"id": "999"}, "read": {"mid": "m1"}},
    ]}]}
    assert _incoming_messages(event) == [("999", "111", "Привет")]
    assert _incoming_messages({}) == []

    # Рабочие часы: границы включительно слева, исключительно справа; закрытый день и
    # отсутствие расписания одинаково означают «нерабочее время».
    from types import SimpleNamespace
    day = SimpleNamespace(is_open=True, open_time="09:00", close_time="21:00")
    at = lambda hhmm: datetime.strptime(hhmm, "%H:%M")
    assert _is_open_now(day, at("09:00"))
    assert _is_open_now(day, at("20:59"))
    assert not _is_open_now(day, at("08:59"))
    assert not _is_open_now(day, at("21:00"))
    assert not _is_open_now(SimpleNamespace(is_open=False, open_time="09:00", close_time="21:00"), at("12:00"))
    assert not _is_open_now(None, at("12:00"))
    print("instagram webhook self-check ok")
