"""Транспорт WhatsApp Cloud API. Переехало из routers/ai/whatsapp.py (P0.4).

Реквизиты канала — пара «phone_number_id + токен», она приходит из интеграции
wa_notify одной строкой через «|» (так же, как это делал агент до P0.4).
"""
import aiohttp

from .base import ACCEPTED, UNKNOWN, SendResult, classify

GRAPH = "https://graph.facebook.com/v23.0"
_TIMEOUT_SECONDS = 10


def render(payload: dict) -> str:
    """Канонический смысл -> текст. Свободный текст Meta принимает только внутри
    24-часового окна; вне его Graph отвечает отказом, и это PERMANENT — шаблон
    подставить нам сейчас нечем (журнал шаблонов появится не здесь)."""
    text = payload["text"]
    button = payload.get("button")
    return f"{text}\n\n{button['url']}" if button else text


async def send(transport: str, recipient: str, payload: dict) -> SendResult:
    phone_number_id, _, token = transport.partition("|")
    if not phone_number_id or not token:
        return SendResult("permanent", error="канал не подключён: нет номера или токена")
    timeout = aiohttp.ClientTimeout(total=_TIMEOUT_SECONDS)
    body = {"messaging_product": "whatsapp", "to": recipient,
            "type": "text", "text": {"body": render(payload)}}
    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(
                f"{GRAPH}/{phone_number_id}/messages",
                json=body, headers={"Authorization": f"Bearer {token}"},
            ) as resp:
                text = (await resp.text())[:400]
                if resp.status < 400:
                    data = await resp.json()
                    messages = (data or {}).get("messages") or [{}]
                    return SendResult(ACCEPTED, provider_message_id=messages[0].get("id"))
                retry_after = resp.headers.get("Retry-After")
                return classify(resp.status, int(retry_after) if (retry_after or "").isdigit() else None, text)
    except (aiohttp.ClientError, TimeoutError) as exc:
        return SendResult(UNKNOWN, error=f"{type(exc).__name__}")


if __name__ == "__main__":
    import asyncio
    assert render({"text": "Привет"}) == "Привет"
    assert render({"text": "T", "button": {"text": "t", "url": "https://x.test"}}).endswith("https://x.test")
    # Неподключённый канал не уходит в сеть вовсе.
    assert asyncio.run(send("", "7999", {"text": "x"})).outcome == "permanent"
    assert asyncio.run(send("123|", "7999", {"text": "x"})).outcome == "permanent"
    print("whatsapp channel self-check ok")
