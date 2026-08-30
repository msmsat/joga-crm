"""Транспорт Telegram: отправка сообщения и индикатор «печатает…».

Переехало сюда из routers/booking/telegram_webhook.py (P0.4): роутер остаётся
границей вебхука, сеть живёт в сервисе. Сборка текста приветствия там же и
осталась — это содержание ответа, а не транспорт.
"""
import logging

import aiohttp

from .base import ACCEPTED, UNKNOWN, SendResult, classify

logger = logging.getLogger(__name__)

API = "https://api.telegram.org"
_TIMEOUT_SECONDS = 10


def render(chat_id: int, payload: dict) -> dict:
    """Канонический смысл ответа -> тело sendMessage.

    Ссылка-кнопка превращается в inline-клавиатуру, но только на https: Telegram
    отвергает web_app-кнопку с http ЦЕЛИКОМ, вместе с сообщением, и человек не
    получает ничего вместо «ответ без кнопки». Поэтому на http ссылка уезжает в
    текст — ответить важнее, чем показать кнопку.
    """
    body = {"chat_id": chat_id, "text": payload["text"]}
    if payload.get("parse_mode"):
        body["parse_mode"] = payload["parse_mode"]
    rows = _option_rows(payload.get("options"))
    if rows:
        # Кнопки вариантов поиска (P1.5). В callback_data уходит НЕПРОЗРАЧНАЯ
        # ссылка и действие из закрытого списка — ни lesson_id, ни service_id
        # тут не появляется. Лимит Telegram на callback_data — 64 байта, наш
        # токен из 32 символов вместе с коротким действием в него укладывается.
        body["reply_markup"] = {"inline_keyboard": rows}
        return body
    button = payload.get("button")
    if not button:
        return body
    url = button["url"]
    if url.startswith("https://"):
        body["reply_markup"] = {"inline_keyboard": [[{"text": button["text"], "web_app": {"url": url}}]]}
    else:
        body["text"] = f"{body['text']}\n\n{url}"
    return body


# Одна кнопка в ряд: подписи вариантов длинные, в два столбца они обрезаются.
_MAX_BUTTONS = 8
_CALLBACK_LIMIT = 64


def _option_rows(options) -> list:
    """Варианты ответа -> ряды inline-клавиатуры.

    Не влезло в лимит callback_data — кнопки нет, но вариант остаётся в тексте
    под своим номером: потерять кнопку не страшно, потерять сообщение целиком
    (Telegram отвергает всю отправку) — страшно.
    """
    rows = []
    for option in (options or [])[:_MAX_BUTTONS]:
        data = option["action"] if not option.get("ref") else f"{option['action']}:{option['ref']}"
        if len(data.encode()) > _CALLBACK_LIMIT:
            continue
        rows.append([{"text": option["label"], "callback_data": data}])
    return rows


async def send(token: str, recipient: str, payload: dict) -> SendResult:
    """Отправить сообщение. Исход разобран по коду ответа, а не по тексту."""
    if not token:
        return SendResult("permanent", error="канал не подключён: нет токена бота")
    body = render(int(recipient), payload)
    timeout = aiohttp.ClientTimeout(total=_TIMEOUT_SECONDS)
    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(f"{API}/bot{token}/sendMessage", json=body) as resp:
                text = (await resp.text())[:400]
                if resp.status < 400:
                    data = await resp.json()
                    message_id = str(((data or {}).get("result") or {}).get("message_id") or "")
                    return SendResult(ACCEPTED, provider_message_id=message_id or None)
                # Telegram кладёт срок ожидания в тело, а не только в заголовок.
                retry_after = None
                try:
                    retry_after = ((await resp.json()).get("parameters") or {}).get("retry_after")
                except Exception:
                    pass
                if retry_after is None and resp.headers.get("Retry-After", "").isdigit():
                    retry_after = int(resp.headers["Retry-After"])
                return classify(resp.status, retry_after, text)
    except (aiohttp.ClientError, TimeoutError) as exc:
        # Ответа не было. Дошёл ли запрос — неизвестно, и это НЕ то же самое,
        # что отказ: повтор здесь может задвоить сообщение у человека.
        return SendResult(UNKNOWN, error=f"{type(exc).__name__}")


async def send_typing(token: str, chat_id: int) -> None:
    """«печатает…» на время, пока агент думает.

    Ответ занимает несколько секунд, и всё это время чат выглядит так, будто
    сообщение не дошло. Telegram гасит индикатор сам через 5 секунд. Ошибку
    глотаем: индикатор — не ответ, ронять из-за него ход не за что.

    Единственный сетевой вызов, который делает воркер агента, и он намеренно
    вынесен из очереди: индикатор имеет смысл только ВО ВРЕМЯ хода, доставлять
    его надёжно незачем, а сообщением он не является.
    """
    timeout = aiohttp.ClientTimeout(total=_TIMEOUT_SECONDS)
    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            await session.post(f"{API}/bot{token}/sendChatAction",
                               json={"chat_id": chat_id, "action": "typing"})
    except (aiohttp.ClientError, TimeoutError):
        logger.debug("telegram sendChatAction не прошёл — ответ это не отменяет")


if __name__ == "__main__":
    plain = render(555, {"text": "Привет"})
    assert plain == {"chat_id": 555, "text": "Привет"}

    https = render(555, {"text": "Привет", "parse_mode": "HTML",
                         "button": {"text": "Записаться", "url": "https://x.test/s/1"}})
    assert https["reply_markup"]["inline_keyboard"][0][0]["web_app"]["url"] == "https://x.test/s/1"
    assert https["parse_mode"] == "HTML"

    # Варианты поиска: непрозрачная ссылка на кнопке, идентификатора занятия нет.
    picked = render(555, {"text": "Вот что есть:", "options": [
        {"action": "view_option", "ref": "opt_abc", "label": "1. 18:30"},
        {"action": "show_more", "ref": None, "label": "Показать ещё"},
    ]})
    keyboard = picked["reply_markup"]["inline_keyboard"]
    assert [b[0]["callback_data"] for b in keyboard] == ["view_option:opt_abc", "show_more"]
    assert all(len(b[0]["callback_data"].encode()) <= _CALLBACK_LIMIT for b in keyboard)
    # Слишком длинная ссылка кнопкой не становится, но сообщение уходит.
    long = render(555, {"text": "t", "options": [
        {"action": "view_option", "ref": "x" * 80, "label": "1"}]})
    assert "reply_markup" not in long and long["text"] == "t"

    # http: кнопки нет, но ссылка есть — иначе Telegram отверг бы всё сообщение.
    http = render(555, {"text": "Привет", "button": {"text": "Записаться", "url": "http://localhost/s/1"}})
    assert "reply_markup" not in http
    assert http["text"].endswith("http://localhost/s/1")
    print("telegram channel self-check ok")
