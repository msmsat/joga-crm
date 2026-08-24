"""Транспорт Instagram Direct. Переехало из routers/ai/instagram.py (P0.4)."""
import aiohttp

from .base import ACCEPTED, UNKNOWN, SendResult, classify

GRAPH = "https://graph.instagram.com/v23.0"
_TIMEOUT_SECONDS = 10


def render(payload: dict) -> str:
    """Канонический смысл -> текст. Кнопок-ссылок у нас в директе нет, поэтому
    ссылка уезжает в текст: потерять её хуже, чем показать не кнопкой."""
    text = payload["text"]
    button = payload.get("button")
    return f"{text}\n\n{button['url']}" if button else text


async def send(token: str, recipient: str, payload: dict) -> SendResult:
    if not token:
        return SendResult("permanent", error="канал не подключён: нет токена Instagram")
    timeout = aiohttp.ClientTimeout(total=_TIMEOUT_SECONDS)
    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(
                f"{GRAPH}/me/messages",
                params={"access_token": token},
                json={"recipient": {"id": recipient}, "message": {"text": render(payload)}},
            ) as resp:
                text = (await resp.text())[:400]
                if resp.status < 400:
                    data = await resp.json()
                    return SendResult(ACCEPTED, provider_message_id=(data or {}).get("message_id"))
                retry_after = resp.headers.get("Retry-After")
                return classify(resp.status, int(retry_after) if (retry_after or "").isdigit() else None, text)
    except (aiohttp.ClientError, TimeoutError) as exc:
        return SendResult(UNKNOWN, error=f"{type(exc).__name__}")


if __name__ == "__main__":
    assert render({"text": "Привет"}) == "Привет"
    assert render({"text": "Привет", "button": {"text": "t", "url": "https://x.test"}}).endswith("https://x.test")
    print("instagram channel self-check ok")
