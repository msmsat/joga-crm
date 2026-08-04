"""Вебхук входящих Telegram-обновлений своего бота студии: /start -> мини-приложение.

Каждая студия подключает СВОЙ бот собственным токеном (services/telegram_bot.py),
поэтому вебхук не может опираться на один секрет платформы — токен в самом URL
и адресует апдейт к студии, и служит секретом (без него запрос никто не соберёт;
Telegram его тоже не публикует).
"""
import logging
import os

import aiohttp
from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import BookingChannelConfig

logger = logging.getLogger(__name__)
router = APIRouter()

MINIAPP_URL = os.getenv("MINIAPP_URL", "http://localhost:5174").rstrip("/")
_TIMEOUT_SECONDS = 10
_START_TEXT = "Приветствуем, чтобы открыть мини-приложение откройте ссылку снизу"
_BUTTON_TEXT = "Открыть мини-приложение"


def _is_start(text: str) -> bool:
    return text.strip().startswith("/start")


def _reply_payload(chat_id: int, studio_id: int) -> dict:
    """Тело sendMessage: приветствие + кнопка web_app, открывающая /s/{studio_id}
    прямо в Telegram (не t.me?startapp= — тот требует Web App, зарегистрированный
    в BotFather, а бот тут произвольный, его студия подключает своим токеном).

    В web_app-кнопке Telegram принимает ТОЛЬКО https и на http отвергает
    сообщение целиком — с MINIAPP_URL=localhost клиент не получал на /start
    вообще ничего вместо «ответ без кнопки». Поэтому не-https уходит ссылкой
    в тексте: ответить на /start важнее, чем показать кнопку.
    """
    url = f"{MINIAPP_URL}/s/{studio_id}"
    if not url.startswith("https://"):
        return {"chat_id": chat_id, "text": f"{_START_TEXT}\n\n{url}"}
    return {
        "chat_id": chat_id,
        "text": _START_TEXT,
        "reply_markup": {
            "inline_keyboard": [[{"text": _BUTTON_TEXT, "web_app": {"url": url}}]],
        },
    }


async def _send_message(token: str, payload: dict) -> None:
    timeout = aiohttp.ClientTimeout(total=_TIMEOUT_SECONDS)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.post(f"https://api.telegram.org/bot{token}/sendMessage", json=payload) as resp:
            if resp.status >= 400:
                raise RuntimeError(f"Telegram {resp.status}: {(await resp.text())[:400]}")


async def _studio_by_token(db: AsyncSession, token: str) -> int | None:
    """studio_id подключённого telegram-канала с этим токеном.

    ponytail: линейный перебор активных telegram-каналов, как в
    routers/ai/whatsapp.py::_studio_by_phone_number_id — их единицы на бэкенд;
    индекс по config->>'token' понадобится при росте числа студий."""
    rows = (await db.execute(
        select(BookingChannelConfig).where(
            BookingChannelConfig.channel_type == "telegram",
            BookingChannelConfig.is_active == True,  # noqa: E712
        )
    )).scalars().all()
    for row in rows:
        if (row.config or {}).get("token") == token:
            return row.studio_id
    return None


@router.post("/telegram/webhook/{token}")
async def telegram_webhook(token: str, request: Request, db: AsyncSession = Depends(get_db)):
    """/start -> приветствие с кнопкой мини-приложения. Остальные апдейты молча отбрасываем.

    Всегда 200: Telegram ретраит недоставленные апдейты, и любой 4xx/5xx задвоил
    бы приветствие тем же паттерном, что и вебхук WhatsApp/Instagram.
    """
    try:
        update = await request.json()
    except ValueError:
        return {"ok": True}

    message = update.get("message") or {}
    chat_id = (message.get("chat") or {}).get("id")
    if chat_id is None or not _is_start(message.get("text") or ""):
        return {"ok": True}

    studio_id = await _studio_by_token(db, token)
    if studio_id is None:
        return {"ok": True}

    try:
        await _send_message(token, _reply_payload(chat_id, studio_id))
    except (aiohttp.ClientError, TimeoutError, RuntimeError) as exc:
        logger.error("telegram webhook: /start не отправлен, studio_id=%s: %s", studio_id, exc)

    return {"ok": True}


if __name__ == "__main__":
    assert _is_start("/start")
    assert _is_start("/start ref_abc123")
    assert _is_start("  /start")
    assert not _is_start("привет")
    assert not _is_start("")

    _saved = MINIAPP_URL
    MINIAPP_URL = "https://jogaua.online"
    payload = _reply_payload(chat_id=555, studio_id=42)
    assert payload["chat_id"] == 555
    assert payload["text"] == _START_TEXT
    button = payload["reply_markup"]["inline_keyboard"][0][0]
    assert button["web_app"]["url"] == "https://jogaua.online/s/42"

    # http (дев): кнопки нет, но ответ на /start есть — Telegram отверг бы всё сообщение.
    MINIAPP_URL = "http://localhost:5174"
    payload = _reply_payload(chat_id=555, studio_id=42)
    assert "reply_markup" not in payload
    assert payload["text"].endswith("http://localhost:5174/s/42")
    MINIAPP_URL = _saved
    print("telegram_webhook self-check ok")
