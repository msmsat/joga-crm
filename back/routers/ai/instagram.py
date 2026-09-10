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
from datetime import datetime, timedelta
from urllib.parse import urlencode

import aiohttp
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse, PlainTextResponse, RedirectResponse
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import ALGORITHM, SECRET_KEY, StudioContext, require_role
from models import StudioAISettings
from ratelimit import limiter
from services import inbound
from services.instagram_account import connect_instagram_account, disconnect_instagram_account

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

# Подключение живёт на двух страницах (Velora AI и Уведомления) — возвращаем
# браузер туда, откуда ушли. Белый список, а не свободный URL из запроса: иначе
# callback становится открытым редиректом.
_RETURN_PAGES = {"ai": "/dashboard/ai", "notifications": "/dashboard/notifications"}
_DEFAULT_RETURN = "ai"


@router.get("/instagram/oauth-url")
async def get_instagram_oauth_url(
    back: str = Query(_DEFAULT_RETURN),
    ctx: StudioContext = Depends(require_role("owner")),
):
    if not IG_APP_ID or not IG_APP_SECRET or not IG_REDIRECT_URI:
        raise HTTPException(status_code=503, detail="ig_not_configured")
    state = jwt.encode(
        {
            "studio_id": ctx.studio_id,
            "purpose": _STATE_PURPOSE,
            "back": back if back in _RETURN_PAGES else _DEFAULT_RETURN,
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
    # Аккаунт один на всю CRM: гасим и канал Уведомлений/Интеграций, иначе там
    # остаётся живой токен-сирота (services/instagram_account).
    await disconnect_instagram_account(db, ctx.studio_id)


def _decode_state(state: str | None) -> tuple[int | None, str]:
    """(studio_id, путь возврата). Битый state — студии нет, возврат по умолчанию."""
    fallback = _RETURN_PAGES[_DEFAULT_RETURN]
    if not state:
        return None, fallback
    try:
        payload = jwt.decode(state, SECRET_KEY, algorithms=[ALGORITHM], options={"require_exp": True})
    except JWTError:
        return None, fallback
    studio_id = payload.get("studio_id")
    if payload.get("purpose") != _STATE_PURPOSE or type(studio_id) is not int or studio_id <= 0:
        return None, fallback
    back = payload.get("back")
    return studio_id, _RETURN_PAGES.get(back, fallback) if isinstance(back, str) else fallback


def _token(data: dict) -> str:
    value = data.get("access_token") if isinstance(data, dict) else None
    if not isinstance(value, str) or not value.strip():
        raise ValueError("invalid_token_response")
    return value


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
            return _token(data)


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
            token = _token(data)
            expires_in = data.get("expires_in")
            if type(expires_in) is not int or not 0 < expires_in <= 366 * 86400:
                raise ValueError("invalid_token_expiry")
            return token, expires_in


async def _fetch_ig_profile(token: str) -> tuple[str, str]:
    timeout = aiohttp.ClientTimeout(total=_OAUTH_TIMEOUT_SECONDS)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.get(
            f"{IG_GRAPH}/me",
            params={"fields": "user_id,username", "access_token": token},
        ) as resp:
            resp.raise_for_status()
            data = await resp.json()
            user_id = data.get("user_id") if isinstance(data, dict) else None
            username = data.get("username") if isinstance(data, dict) else None
            if (
                type(user_id) not in (str, int) or not str(user_id).isascii()
                or not str(user_id).isdigit() or not 0 < len(str(user_id)) <= 50
                or not isinstance(username, str) or not username.strip() or len(username) > 100
            ):
                raise ValueError("invalid_profile_response")
            return str(user_id), username


async def _subscribe_webhooks(token: str) -> None:
    """Подписка приложения на события аккаунта. Без неё Meta не шлёт ни одного
    сообщения в вебхук даже при валидном токене и настроенном в панели callback URL."""
    timeout = aiohttp.ClientTimeout(total=_OAUTH_TIMEOUT_SECONDS)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.post(
            f"{IG_GRAPH}/me/subscribed_apps",
            headers={"Authorization": f"Bearer {token}"},
            data={"subscribed_fields": "messages"},
        ) as resp:
            resp.raise_for_status()
            data = await resp.json()
            if not isinstance(data, dict) or data.get("success") is not True:
                raise ValueError("webhook_subscription_not_confirmed")


def _oauth_error(back: str, reason: str) -> RedirectResponse:
    return RedirectResponse(f"{WEB_APP_URL}{back}?{urlencode({'ig': 'error', 'ig_reason': reason})}")


def _log_oauth_failure(stage: str, studio_id: int, exc: Exception) -> None:
    # aiohttp exception strings/tracebacks contain request URLs, including tokens
    # and the app secret. Log only controlled context and HTTP status.
    logger.warning(
        "instagram_oauth_failed stage=%s studio_id=%s error_type=%s status=%s",
        stage, studio_id, type(exc).__name__, getattr(exc, "status", None),
    )


@callback_router.get("/instagram/callback")
@limiter.limit("20/minute")
async def instagram_oauth_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    studio_id, back = _decode_state(state)
    if studio_id is None or not code:
        return _oauth_error(back, "invalid_state" if studio_id is None else "authorization_denied")

    stage = "token_exchange_failed"
    try:
        short_token = await _exchange_code_for_token(code)
        long_token, expires_in = await _exchange_long_lived_token(short_token)
        stage = "profile_failed"
        ig_user_id, username = await _fetch_ig_profile(long_token)
        stage = "subscription_failed"
        await _subscribe_webhooks(long_token)
    except (aiohttp.ClientError, TimeoutError, KeyError, ValueError, TypeError) as exc:
        _log_oauth_failure(stage, studio_id, exc)
        return _oauth_error(back, stage)

    # Only show a connected account once delivery is subscribed and both local
    # surfaces have committed together. A failed reconnect preserves old settings.
    try:
        await connect_instagram_account(
            db, studio_id,
            token=long_token, ig_user_id=ig_user_id, username=username,
            expires_at=datetime.utcnow() + timedelta(seconds=expires_in),
        )
    except (HTTPException, SQLAlchemyError) as exc:
        await db.rollback()
        reason = "account_in_use" if isinstance(exc, HTTPException) and exc.detail == "ig_account_in_use" else "connection_failed"
        _log_oauth_failure(reason, studio_id, exc)
        return _oauth_error(back, reason)

    return RedirectResponse(f"{WEB_APP_URL}{back}?ig=connected")


# --- Вебхук входящих сообщений -------------------------------------------------


def _valid_signature(raw: bytes, header: str | None) -> bool:
    """X-Hub-Signature-256: HMAC-SHA256 сырого тела на app secret. Fail closed:
    нет секрета в окружении — не верим никакому телу."""
    if not IG_APP_SECRET or not header or not header.startswith("sha256="):
        return False
    expected = hmac.new(IG_APP_SECRET.encode(), raw, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, header[len("sha256="):])


def _incoming_messages(payload: dict) -> list[tuple[str, str, str, dict]]:
    """Полезные текстовые сообщения из тела вебхука -> [(id аккаунта студии,
    IGSID клиента, текст, само сообщение)].

    Отсекаем: is_echo (наш же ответ — иначе бот отвечает сам себе по кругу),
    события без текста (read, reaction, postback, вложения).

    Сообщение целиком нужно приёму (services/inbound.py): в нём лежит mid —
    идентификатор события у Meta. Разбираем ПОШТУЧНО, а не одним конвертом: в
    одном HTTP-запросе Meta присылает пачку, и дубль одного сообщения не должен
    отменить обработку соседних.
    """
    out: list[tuple[str, str, str, dict]] = []
    for entry in payload.get("entry") or []:
        for event in entry.get("messaging") or []:
            message = event.get("message") or {}
            text = message.get("text")
            sender = (event.get("sender") or {}).get("id")
            account = (event.get("recipient") or {}).get("id")
            if text and sender and account and not message.get("is_echo"):
                out.append((str(account), str(sender), text, message))
    return out


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
async def instagram_webhook(
    request: Request,
    # Ничего не планирует с P0.3 и остаётся намеренно: параметр — граница,
    # на которой архитектурный тест проверяет, что web не запускает агента.
    background: BackgroundTasks = None,
    db: AsyncSession = Depends(get_db),
):
    """Входящее сообщение директа -> ответ ассистента студии.

    На валидное тело ВСЕГДА 200 (как у вебхуков Stripe): любой 4xx/5xx заставит Meta
    ретраить и задвоит ответы клиенту. По той же причине генерация ответа уходит
    в фон: у Meta ~5 секунд на ответ вебхука, а агентный цикл идёт дольше.
    """
    raw = await request.body()
    if not _valid_signature(raw, request.headers.get("x-hub-signature-256")):
        return JSONResponse(status_code=403, content={"detail": "invalid signature"})
    try:
        payload = json.loads(raw)
    except ValueError:
        return {"ok": True}

    messages = _incoming_messages(payload)
    if not messages:
        # Meta шлёт в тот же вебхук эхо наших ответов, отметки о прочтении и
        # реакции. Это НЕ ошибка — но и не «ничего не пришло»: без этой строки
        # разбор упирается в 200 OK, за которым не видно, было ли там сообщение.
        logger.info("instagram webhook: в теле нет текстовых сообщений (эхо/прочтение/вложение)")

    for account_id, sender_igsid, text, message in messages:
        settings = (await db.execute(
            select(StudioAISettings).where(StudioAISettings.ig_user_id == account_id)
        )).scalar_one_or_none()
        # Тумблер агента на странице AI — источник правды: выключен, значит молчим.
        if settings is None or not settings.ig_enabled or not settings.ig_token:
            # Молча отбрасывать нельзя: снаружи это неотличимо от «Meta ничего не
            # присылала», а причины разные и чинятся в разных местах. Токен не
            # печатаем, только факт его наличия.
            logger.warning(
                "instagram webhook: сообщение отброшено, аккаунт=%s, студия=%s, "
                "агент_включён=%s, токен_есть=%s",
                account_id, getattr(settings, "studio_id", None),
                getattr(settings, "ig_enabled", None), bool(getattr(settings, "ig_token", None)),
            )
            continue
        # Приём — после проверки подписи и опознания студии, перед побочным
        # действием. Ключ — mid, идентификатор сообщения у Meta: он стабилен
        # между ретраями и уникален глобально.
        admission = await inbound.admit(
            inbound.INSTAGRAM, message.get("mid"), settings.studio_id, inbound.MESSAGE,
            sender_igsid, text, message,
        )
        if not admission.accepted:
            logger.info("instagram webhook: повтор сообщения отброшен, studio_id=%s", settings.studio_id)
            continue
        # Ответ, счётчик обработанных и учёт расхода — в отдельном процессе
        # (`python -m workers.main`). Текст входящего в лог не уходит целиком:
        # там переписка клиента чужого бизнеса.
        logger.info("instagram webhook: принято, studio_id=%s, входящее=%r", settings.studio_id, text[:50])

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

    # Транспорт (_send_ig_message) уехал в services/channels/instagram.py:
    # роутер — граница вебхука, сеть — сервис (P0.4).
    event = {"entry": [{"messaging": [
        {"sender": {"id": "111"}, "recipient": {"id": "999"}, "message": {"mid": "m1", "text": "Привет"}},
        {"sender": {"id": "999"}, "recipient": {"id": "111"}, "message": {"mid": "m2", "text": "Hello", "is_echo": True}},
        {"sender": {"id": "111"}, "recipient": {"id": "999"}, "read": {"mid": "m1"}},
    ]}]}
    assert _incoming_messages(event) == [("999", "111", "Привет", {"mid": "m1", "text": "Привет"})]
    assert _incoming_messages({}) == []
    print("instagram webhook self-check ok")
