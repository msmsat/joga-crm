"""WhatsApp-агент: Embedded Signup (подключение номера) + вебхук Cloud API.

Номер студии (token + phone_number_id) живёт в StudioIntegration("wa_notify") —
один на Уведомления, Настройки → Интеграции и агента. Подключить его можно двумя
путями: руками (POST /settings/integrations/whatsapp) или через Embedded Signup —
кнопка на странице Velora AI, ниже её серверная половина.

Embedded Signup сделан редиректом, как Instagram OAuth (routers/ai/instagram.py),
а не JS-библиотекой Meta: та выполняется в самой странице и требует от неё https,
из-за чего дев-фронт на http перестаёт работать. При редиректе https нужен только
от redirect_uri, то есть от бэкенда, — он и так за Cloudflare. Побочный эффект:
waba_id/phone_number_id не прилетают событием из окна, их бэкенд достаёт сам —
debug_token отдаёт WABA, к которым выдан доступ (_waba_from_token).

Вебхук Meta: GET проверяется verify-токеном, POST — подписью тела на app secret.
"""
import hashlib
import hmac
import json
import logging
import os
from datetime import datetime, timedelta
from urllib.parse import urlencode

import aiohttp
from fastapi import APIRouter, HTTPException, Query, Request, Depends
from fastapi.responses import JSONResponse, PlainTextResponse, RedirectResponse
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import ALGORITHM, SECRET_KEY, StudioContext, require_role
from models import StudioAISettings, StudioIntegration
from ratelimit import limiter

logger = logging.getLogger(__name__)

router = APIRouter()
callback_router = APIRouter()
webhook_router = APIRouter()

WA_APP_ID = os.getenv("WA_APP_ID", "")
WA_APP_SECRET = os.getenv("WA_APP_SECRET", "")
WA_VERIFY_TOKEN = os.getenv("WA_VERIFY_TOKEN", "")
# Configuration ID конфигурации Facebook Login for Business с вариантом
# WhatsApp Embedded Signup — именно он превращает обычный диалог логина в мастер
# подключения номера.
WA_CONFIG_ID = os.getenv("WA_CONFIG_ID", "")
WA_REDIRECT_URI = os.getenv("WA_REDIRECT_URI", "")
# PIN двухфакторки номера в Cloud API: задаётся при регистрации и нужен, чтобы
# позже перерегистрировать тот же номер. Один на инсталляцию — кладём в config.
WA_REGISTER_PIN = os.getenv("WA_REGISTER_PIN", "000000")
WEB_APP_URL = os.getenv("WEB_APP_URL", "http://localhost:5173").rstrip("/")
GRAPH = "https://graph.facebook.com/v23.0"
_TIMEOUT_SECONDS = 10
_STATE_TTL_MINUTES = 10
_STATE_PURPOSE = "wa_oauth"


def _valid_signature(raw: bytes, header: str | None) -> bool:
    """X-Hub-Signature-256: HMAC-SHA256 сырого тела на app secret. Fail closed:
    нет секрета в окружении — не верим никакому телу."""
    if not WA_APP_SECRET or not header or not header.startswith("sha256="):
        return False
    expected = hmac.new(WA_APP_SECRET.encode(), raw, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, header[len("sha256="):])


def _incoming_messages(payload: dict) -> list[tuple[str, str, str]]:
    """Полезные текстовые сообщения из тела вебхука -> [(phone_number_id студии,
    номер клиента, текст)].

    Отсекаем: статусы доставки (`statuses`, без них бот отвечал бы на собственные
    «доставлено»), нетекстовые сообщения (картинки, кнопки, локации).
    """
    out: list[tuple[str, str, str]] = []
    for entry in payload.get("entry") or []:
        for change in entry.get("changes") or []:
            value = change.get("value") or {}
            account = ((value.get("metadata") or {}).get("phone_number_id"))
            for message in value.get("messages") or []:
                text = (message.get("text") or {}).get("body")
                sender = message.get("from")
                if text and sender and account:
                    out.append((str(account), str(sender), text))
    return out


async def _send_wa_message(token: str, phone_number_id: str, to: str, text: str) -> None:
    timeout = aiohttp.ClientTimeout(total=_TIMEOUT_SECONDS)
    payload = {"messaging_product": "whatsapp", "to": to, "type": "text", "text": {"body": text}}
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.post(
            f"{GRAPH}/{phone_number_id}/messages",
            json=payload,
            headers={"Authorization": f"Bearer {token}"},
        ) as resp:
            if resp.status >= 400:
                # Тело ответа Graph — единственное место, где написана причина отказа
                # («вне 24-часового окна», «нет прав»). Токен не логируем.
                raise RuntimeError(f"Graph {resp.status}: {(await resp.text())[:400]}")


async def _studio_by_phone_number_id(db: AsyncSession, phone_number_id: str) -> tuple[int, str] | None:
    """(studio_id, token) подключённой интеграции wa_notify с этим номером.
    # ponytail: перебор подключённых интеграций в Python вместо JSON-запроса —
    # их единицы на студию; при росте числа студий — индекс по config->>'phone_number_id'.
    """
    rows = (await db.execute(
        select(StudioIntegration).where(
            StudioIntegration.integration_type == "wa_notify",
            StudioIntegration.is_connected == True,  # noqa: E712
        )
    )).scalars().all()
    for row in rows:
        config = row.config or {}
        if str(config.get("phone_number_id")) == phone_number_id and config.get("token"):
            return row.studio_id, config["token"]
    return None


# --- Embedded Signup -----------------------------------------------------------


async def _graph(method: str, path: str, token: str = "", **kwargs) -> dict:
    """Один вызов Graph API. Ошибку поднимаем вместе с телом ответа: причина отказа
    («номер уже зарегистрирован», «нет прав») написана только там. Токен не логируем."""
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    timeout = aiohttp.ClientTimeout(total=_TIMEOUT_SECONDS)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.request(method, f"{GRAPH}/{path}", headers=headers, **kwargs) as resp:
            if resp.status >= 400:
                raise RuntimeError(f"Graph {method} {path} -> {resp.status}: {(await resp.text())[:400]}")
            return await resp.json()


@router.get("/whatsapp/oauth-url")
async def get_whatsapp_oauth_url(ctx: StudioContext = Depends(require_role("owner"))):
    """Адрес мастера Embedded Signup. Студия — в подписанном state, не в сессии:
    callback приходит без Authorization-заголовка (как у Instagram)."""
    if not WA_APP_ID or not WA_CONFIG_ID or not WA_REDIRECT_URI:
        raise HTTPException(status_code=503, detail="wa_signup_not_configured")
    state = jwt.encode(
        {
            "studio_id": ctx.studio_id,
            "purpose": _STATE_PURPOSE,
            "exp": datetime.utcnow() + timedelta(minutes=_STATE_TTL_MINUTES),
        },
        SECRET_KEY, algorithm=ALGORITHM,
    )
    params = {
        "client_id": WA_APP_ID,
        "config_id": WA_CONFIG_ID,
        "redirect_uri": WA_REDIRECT_URI,
        "response_type": "code",
        # Без него диалог вернёт access_token во фрагменте URL, до сервера он не
        # дойдёт; нам нужен именно code, обмениваемый на стороне бэкенда.
        "override_default_response_type": "true",
        "state": state,
    }
    return {"url": f"https://www.facebook.com/v23.0/dialog/oauth?{urlencode(params)}"}


def _decode_state(state: str | None) -> int | None:
    """studio_id из подписанного state. Битый state — студии нет."""
    if not state:
        return None
    try:
        payload = jwt.decode(state, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None
    if payload.get("purpose") != _STATE_PURPOSE:
        return None
    return payload.get("studio_id")


async def _waba_from_token(token: str) -> str:
    """WABA, к которому владелец дал доступ в мастере. В redirect-флоу его никто не
    присылает (это JS-библиотека Meta шлёт его событием в окно), но debug_token
    перечисляет выданные права вместе с target_ids — там он и лежит."""
    data = await _graph("GET", "debug_token", params={
        "input_token": token, "access_token": f"{WA_APP_ID}|{WA_APP_SECRET}",
    })
    for scope in (data.get("data") or {}).get("granular_scopes") or []:
        if scope.get("scope") == "whatsapp_business_management" and scope.get("target_ids"):
            return str(scope["target_ids"][0])
    raise RuntimeError("в токене нет WABA: права whatsapp_business_management не выданы")


@callback_router.get("/whatsapp/callback")
@limiter.limit("20/minute")
async def whatsapp_oauth_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Возврат из мастера: code -> бессрочный токен студии, WABA и номер из Graph,
    подписка на вебхук, регистрация номера, запись в ту же интеграцию wa_notify,
    что и ручное подключение из Уведомлений."""
    studio_id = _decode_state(state)
    if studio_id is None or not code:
        return RedirectResponse(f"{WEB_APP_URL}/dashboard/ai?wa=error")

    try:
        exchanged = await _graph("GET", "oauth/access_token", params={
            "client_id": WA_APP_ID, "client_secret": WA_APP_SECRET,
            "redirect_uri": WA_REDIRECT_URI, "code": code,
        })
        token = exchanged["access_token"]
        # Конфигурация Embedded Signup бывает с бессрочным токеном и с 60-дневным;
        # у второй expires_in приходит здесь и больше нигде. Просто сохраняем срок,
        # чтобы потом было чем предупредить студию, — сейчас его никто не читает.
        expires_in = exchanged.get("expires_in")
        waba_id = await _waba_from_token(token)
        numbers = (await _graph("GET", f"{waba_id}/phone_numbers", token=token)).get("data") or []
        if not numbers:
            raise RuntimeError("в WABA нет ни одного номера")
        phone_number_id = str(numbers[0]["id"])
        display_phone_number = numbers[0].get("display_phone_number")
    except (aiohttp.ClientError, TimeoutError, RuntimeError, KeyError, ValueError) as exc:
        logger.error("wa callback: подключение не удалось, studio_id=%s: %s", studio_id, exc)
        return RedirectResponse(f"{WEB_APP_URL}/dashboard/ai?wa=error")

    # Подписка и регистрация — отдельными шагами: токен уже валиден, значит
    # подключение состоялось и исходящие уведомления заработают в любом случае.
    # Без subscribed_apps не придёт ни одного входящего — это видно по логу.
    try:
        await _graph("POST", f"{waba_id}/subscribed_apps", token=token)
    except (aiohttp.ClientError, TimeoutError, RuntimeError) as exc:
        logger.error("wa callback: subscribed_apps не прошёл, studio_id=%s: %s", studio_id, exc)
    try:
        await _graph("POST", f"{phone_number_id}/register", token=token,
                     json={"messaging_product": "whatsapp", "pin": WA_REGISTER_PIN})
    except (aiohttp.ClientError, TimeoutError, RuntimeError) as exc:
        # Номер, уже зарегистрированный с другим PIN, сюда и попадает — отправка
        # с него всё равно работает, повторная регистрация не нужна.
        logger.warning("wa callback: register не прошёл, studio_id=%s: %s", studio_id, exc)

    integ = (await db.execute(select(StudioIntegration).where(
        StudioIntegration.studio_id == studio_id,
        StudioIntegration.integration_type == "wa_notify",
    ))).scalar_one_or_none()
    if integ is None:
        integ = StudioIntegration(studio_id=studio_id, integration_type="wa_notify")
        db.add(integ)
    integ.config = {
        "token": token,
        "phone_number_id": phone_number_id,
        "waba_id": waba_id,
        "display_phone_number": display_phone_number,
        "pin": WA_REGISTER_PIN,
        "token_expires_at": (
            (datetime.utcnow() + timedelta(seconds=int(expires_in))).isoformat() if expires_in else None
        ),
    }
    integ.is_connected = True
    await db.commit()
    logger.info("wa callback: номер подключён, studio_id=%s", studio_id)
    return RedirectResponse(f"{WEB_APP_URL}/dashboard/ai?wa=connected")


# --- Вебхук входящих сообщений -------------------------------------------------


@webhook_router.get("/whatsapp/webhook")
async def verify_whatsapp_webhook(
    mode: str | None = Query(None, alias="hub.mode"),
    token: str | None = Query(None, alias="hub.verify_token"),
    challenge: str | None = Query(None, alias="hub.challenge"),
):
    """Разовая проверка URL при сохранении вебхука в панели Meta: вернуть challenge как есть."""
    if mode == "subscribe" and WA_VERIFY_TOKEN and token and hmac.compare_digest(token, WA_VERIFY_TOKEN):
        return PlainTextResponse(challenge or "")
    logger.warning("whatsapp webhook verify: неверный verify_token")
    return PlainTextResponse("forbidden", status_code=403)


@webhook_router.post("/whatsapp/webhook")
async def whatsapp_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """Входящее сообщение WhatsApp -> ответ авто-ответчика.

    На валидное тело ВСЕГДА 200: любой 4xx/5xx заставит Meta ретраить и задвоит
    ответы клиенту (та же логика, что в вебхуке Instagram).
    """
    raw = await request.body()
    if not _valid_signature(raw, request.headers.get("x-hub-signature-256")):
        return JSONResponse(status_code=403, content={"detail": "invalid signature"})
    try:
        payload = json.loads(raw)
    except ValueError:
        return {"ok": True}

    for phone_number_id, sender, text in _incoming_messages(payload):
        found = await _studio_by_phone_number_id(db, phone_number_id)
        if found is None:
            continue
        studio_id, token = found
        settings = (await db.execute(
            select(StudioAISettings).where(StudioAISettings.studio_id == studio_id)
        )).scalar_one_or_none()
        # Тумблер агента на странице AI — источник правды: выключен, значит молчим.
        if settings is None or not settings.wa_enabled:
            continue
        try:
            await _send_wa_message(token, phone_number_id, sender, "Hello")
        except (aiohttp.ClientError, TimeoutError, RuntimeError) as exc:
            logger.error("whatsapp webhook: не удалось ответить, studio_id=%s: %s", studio_id, exc)
            continue
        settings.wa_handled_count += 1
        logger.info("whatsapp webhook: ответ отправлен, studio_id=%s, входящее=%r", studio_id, text[:50])

    await db.commit()
    return {"ok": True}


if __name__ == "__main__":
    # Самопроверка без сети и БД: подпись и разбор тела (паттерн routers/ai/instagram.py).
    WA_APP_SECRET = "s3cret"
    body = b'{"object":"whatsapp_business_account"}'
    good = "sha256=" + hmac.new(b"s3cret", body, hashlib.sha256).hexdigest()
    assert _valid_signature(body, good)
    assert not _valid_signature(body, "sha256=" + "0" * 64)
    assert not _valid_signature(body, None)
    assert not _valid_signature(b'{"object":"x"}', good)  # тело подменили — подпись не сходится

    event = {"entry": [{"changes": [
        {"value": {
            "metadata": {"phone_number_id": "999"},
            "messages": [
                {"from": "79990000000", "type": "text", "text": {"body": "Привет"}},
                {"from": "79990000000", "type": "image", "image": {"id": "1"}},
            ],
        }},
        {"value": {"metadata": {"phone_number_id": "999"}, "statuses": [{"status": "delivered"}]}},
    ]}]}
    assert _incoming_messages(event) == [("999", "79990000000", "Привет")]
    assert _incoming_messages({}) == []
    print("whatsapp webhook self-check ok")
