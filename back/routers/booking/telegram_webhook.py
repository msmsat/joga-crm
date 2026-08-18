"""Вебхук входящих Telegram-обновлений своего бота студии: /start -> мини-приложение.

Каждая студия подключает СВОЙ бот собственным токеном (services/telegram_bot.py),
поэтому вебхук не может опираться на один секрет платформы — токен в самом URL
и адресует апдейт к студии, и служит секретом (без него запрос никто не соберёт;
Telegram его тоже не публикует).
"""
import logging
import os
from html import escape

import aiohttp
from fastapi import APIRouter, BackgroundTasks, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import BookingChannelConfig, Studio
from services.client_agent import CHANNEL_TELEGRAM, schedule_reply

logger = logging.getLogger(__name__)
router = APIRouter()

MINIAPP_URL = os.getenv("MINIAPP_URL", "http://localhost:5174").rstrip("/")
_TIMEOUT_SECONDS = 10

# Ответ на /start объясняет ровно то, чего человек не может знать сам: Start
# открыл боту диалог, но кто он такой, мы ещё не знаем. Телефона и почты Telegram
# в апдейте не присылает, связать чат с карточкой клиента не по чему — это
# происходит на первом входе в мини-приложение (подписанный initData, miniapp.py).
# Поэтому текст ведёт не «посмотрите приложение», а «зайдите, иначе уведомлений
# не будет». Эмодзи здесь уместны: это чат с клиентом студии, а не интерфейс
# CRM (CLAUDE.md §5) — и обращение именно к клиенту, не к владельцу студии:
# этого бота открывает человек, который хочет записаться на занятие.
_BUTTON_TEXT = "🧘 Записаться на занятие"
_START_INTRO = (
    "👋 <b>Привет!</b>\n\n"
    "Это бот студии{studio_name}. Здесь вы сможете:\n\n"
    "📅  записаться на занятие и посмотреть расписание\n"
    "🎟  проверить абонемент — сколько занятий осталось и до какого числа\n"
    "⭐  посмотреть свою карту лояльности и баллы\n\n"
    "А я буду присылать сюда:\n\n"
    "✅  подтверждение записи\n"
    "⏰  напоминание перед занятием\n"
    "🎁  бонусы и специальные предложения\n\n"
)
_START_CTA = (
    "Чтобы начать, откройте приложение {where} 👇\n"
    "Как только вы зайдёте туда один раз, я буду знать, что писать именно вам."
)


def _is_start(text: str) -> bool:
    return text.strip().startswith("/start")


def _reply_payload(chat_id: int, studio_id: int, studio_name: str) -> dict:
    """Тело sendMessage: приветствие + кнопка web_app, открывающая /s/{studio_id}
    прямо в Telegram (не t.me?startapp= — тот требует Web App, зарегистрированный
    в BotFather, а бот тут произвольный, его студия подключает своим токеном).

    В web_app-кнопке Telegram принимает ТОЛЬКО https и на http отвергает
    сообщение целиком — с MINIAPP_URL=localhost клиент не получал на /start
    вообще ничего вместо «ответ без кнопки». Поэтому не-https уходит ссылкой
    в тексте: ответить на /start важнее, чем показать кнопку.
    """
    # Studio.name не nullable в схеме, но здесь мы вне транзакции создания
    # студии — пустая строка на всякий случай не рвёт фразу знаком «« »».
    name_part = f" «{escape(studio_name, quote=False)}»" if studio_name else ""
    intro = _START_INTRO.format(studio_name=name_part)
    url = f"{MINIAPP_URL}/s/{studio_id}"
    if not url.startswith("https://"):
        text = intro + _START_CTA.format(where="по ссылке ниже") + f"\n\n{url}"
        return {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}
    return {
        "chat_id": chat_id,
        "text": intro + _START_CTA.format(where="кнопкой ниже"),
        "parse_mode": "HTML",
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


async def send_typing(token: str, chat_id: int) -> None:
    """«печатает…» на время, пока агент думает.

    Ответ агента занимает несколько секунд (два круга к модели, когда нужен
    инструмент), и всё это время чат выглядит так, будто сообщение не дошло.
    Telegram гасит индикатор сам через 5 секунд, продлевать не нужно. Ошибку
    глотаем: индикатор — не ответ, ронять из-за него генерацию не за что.
    """
    timeout = aiohttp.ClientTimeout(total=_TIMEOUT_SECONDS)
    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            await session.post(
                f"https://api.telegram.org/bot{token}/sendChatAction",
                json={"chat_id": chat_id, "action": "typing"},
            )
    except (aiohttp.ClientError, TimeoutError):
        logger.debug("telegram sendChatAction не прошёл — ответ это не отменяет")


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
async def telegram_webhook(
    token: str,
    request: Request,
    background: BackgroundTasks = None,
    db: AsyncSession = Depends(get_db),
):
    """/start -> приветствие с кнопкой мини-приложения, остальной текст -> ассистент студии.

    Ветка ассистента живёт ЗДЕСЬ, а не в routers/ai/, потому что у бота может
    быть ровно один webhook-URL: повторный setWebhook молча отобрал бы апдейты у
    онбординга, и мини-приложение перестало бы открываться — регрессия без единой
    ошибки в логах (эпик AI-5, задача 12, п. 7).

    Всегда 200: Telegram ретраит недоставленные апдейты, и любой 4xx/5xx задвоил
    бы приветствие тем же паттерном, что и вебхук WhatsApp/Instagram.
    """
    try:
        update = await request.json()
    except ValueError:
        return {"ok": True}

    message = update.get("message") or {}
    chat_id = (message.get("chat") or {}).get("id")
    text = message.get("text") or ""
    if chat_id is None or not text:
        return {"ok": True}

    studio_id = await _studio_by_token(db, token)
    if studio_id is None:
        # Канал онлайн-записи выключили, оставив тумблер агента включённым —
        # апдейты перестают находить студию, и агент замолкает без единой строки
        # в логе. Отсюда WARNING с хвостом токена: иначе это неотличимо от
        # «бота никто не подключал».
        logger.warning("telegram webhook: студия не найдена, канал записи выключен? token=…%s", token[-6:])
        return {"ok": True}

    if not _is_start(text):
        # Не /start — это разговор с ассистентом студии. Тумблер агента и квоту
        # проверяет сама фоновая задача: до неё доходит только текст и отправитель.
        sender_id = (message.get("from") or {}).get("id")
        if sender_id is not None:
            schedule_reply(background, studio_id, CHANNEL_TELEGRAM, str(sender_id), text, token)
        return {"ok": True}

    studio_name = (await db.execute(select(Studio.name).where(Studio.id == studio_id))).scalar_one_or_none()

    try:
        await _send_message(token, _reply_payload(chat_id, studio_id, studio_name or ""))
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
    payload = _reply_payload(chat_id=555, studio_id=42, studio_name="Velora Yoga")
    assert payload["chat_id"] == 555
    assert payload["parse_mode"] == "HTML"
    assert "«Velora Yoga»" in payload["text"]
    assert "кнопкой ниже" in payload["text"]
    # Разметка — только <b></b>: незакрытый или лишний тег = 400 от Telegram,
    # и человек не получает на /start вообще ничего.
    assert payload["text"].count("<") == payload["text"].count(">") == 2
    button = payload["reply_markup"]["inline_keyboard"][0][0]
    assert button["web_app"]["url"] == "https://jogaua.online/s/42"

    # Название с HTML-символами не должно ломать разметку сообщения.
    payload = _reply_payload(chat_id=555, studio_id=42, studio_name="Fit & <Yoga>")
    assert "Fit &amp; &lt;Yoga&gt;" in payload["text"]
    assert payload["text"].count("<") == payload["text"].count(">") == 2  # только <b></b>

    # Пустое имя студии — фраза не рвётся пустыми кавычками.
    payload = _reply_payload(chat_id=555, studio_id=42, studio_name="")
    assert "Это бот студии. Здесь" in payload["text"]

    # http (дев): кнопки нет, но ответ на /start есть — Telegram отверг бы всё сообщение.
    MINIAPP_URL = "http://localhost:5174"
    payload = _reply_payload(chat_id=555, studio_id=42, studio_name="Velora Yoga")
    assert "reply_markup" not in payload
    assert "по ссылке ниже" in payload["text"]
    assert payload["text"].endswith("http://localhost:5174/s/42")
    MINIAPP_URL = _saved

    print(_reply_payload(chat_id=1, studio_id=1, studio_name="Velora Yoga")["text"]
          .replace("<b>", "").replace("</b>", ""))
    print("telegram_webhook self-check ok")
