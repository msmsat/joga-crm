"""WhatsApp-агент: входящие сообщения WhatsApp Cloud API -> авто-ответ.

Подключения здесь нет: номер студии (token + phone_number_id) живёт в
StudioIntegration("wa_notify") и подключается в Уведомлениях / Настройках →
Интеграции. Этот файл — только вебхук Meta (аналог routers/ai/instagram.py):
GET проверяется verify-токеном, POST — подписью тела на app secret.
"""
import hashlib
import hmac
import json
import logging
import os

import aiohttp
from fastapi import APIRouter, Query, Request, Depends
from fastapi.responses import JSONResponse, PlainTextResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import StudioAISettings, StudioIntegration

logger = logging.getLogger(__name__)

webhook_router = APIRouter()

WA_APP_SECRET = os.getenv("WA_APP_SECRET", "")
WA_VERIFY_TOKEN = os.getenv("WA_VERIFY_TOKEN", "")
GRAPH = "https://graph.facebook.com/v20.0"
_TIMEOUT_SECONDS = 10


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
