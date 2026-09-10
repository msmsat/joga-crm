"""Транспорт Instagram Direct: явный аккаунт и безопасные исходы доставки."""
from dataclasses import dataclass, field

import aiohttp

from .base import ACCEPTED, AUTH, PERMANENT, RETRY, UNKNOWN, SendResult, classify

GRAPH = "https://graph.instagram.com/v23.0"
FACEBOOK_GRAPH = "https://graph.facebook.com/v23.0"
_TIMEOUT_SECONDS = 10


@dataclass(frozen=True)
class Credentials:
    token: str = field(repr=False)
    account_id: str
    api: str = "instagram_login"


def render(payload: dict) -> str:
    """Канонический смысл -> текст. Кнопок-ссылок у нас в директе нет, поэтому
    ссылка уезжает в текст: потерять её хуже, чем показать не кнопкой."""
    text = payload["text"]
    button = payload.get("button")
    return f"{text}\n\n{button['url']}" if button else text


async def send(token: str | Credentials, recipient: str, payload: dict) -> SendResult:
    account_id, api = "me", "instagram_login"
    if isinstance(token, Credentials):
        account_id, api, token = token.account_id, token.api, token.token
    if not token:
        return SendResult(PERMANENT, error="канал не подключён: нет токена Instagram")
    if api not in ("instagram_login", "facebook_login"):
        return SendResult(PERMANENT, error="Instagram: неизвестный тип подключения")
    if account_id != "me" and not (account_id.isascii() and account_id.isdigit()):
        return SendResult(PERMANENT, error="Instagram: неверный ID аккаунта")
    if not isinstance(recipient, str) or not (recipient.isascii() and recipient.isdigit()):
        return SendResult(PERMANENT, error="Instagram: неверный ID получателя")
    try:
        message_text = render(payload)
    except (KeyError, TypeError):
        return SendResult(PERMANENT, error="Instagram: неверное содержимое сообщения")
    if not isinstance(message_text, str) or not message_text.strip():
        return SendResult(PERMANENT, error="Instagram: пустое сообщение")
    graph = GRAPH if api == "instagram_login" else FACEBOOK_GRAPH
    timeout = aiohttp.ClientTimeout(total=_TIMEOUT_SECONDS)
    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(
                f"{graph}/{account_id}/messages",
                headers={"Authorization": f"Bearer {token}"},
                json={"recipient": {"id": recipient}, "message": {"text": message_text}},
                allow_redirects=False,
            ) as resp:
                try:
                    data = await resp.json()
                except (ValueError, aiohttp.ContentTypeError):
                    data = None
                if 200 <= resp.status < 300:
                    mid = data.get("message_id") if isinstance(data, dict) else None
                    if isinstance(mid, str) and mid:
                        return SendResult(ACCEPTED, provider_message_id=mid)
                    # Успешный HTTP без подтверждения нельзя повторять: Meta
                    # уже мог отправить сообщение, несмотря на сломанный ответ.
                    return SendResult(UNKNOWN, error="Instagram: нет подтверждения отправки")
                retry_after = resp.headers.get("Retry-After")
                delay = min(int(retry_after), 3600) if (retry_after or "").isdigit() else None
                error = data.get("error") if isinstance(data, dict) else None
                if isinstance(error, dict):
                    code = error.get("code")
                    # Meta использует HTTP 400 и для истёкшего токена, и для
                    # ограничения частоты. Текст ошибок содержит секреты/PII.
                    if type(code) is int and code in (190, 102, 10, 200):
                        return SendResult(AUTH, error=f"Instagram: доступ отклонён (code={code})")
                    if (type(code) is int and code in (4, 17, 32, 613, 80002)) or error.get("is_transient") is True:
                        return SendResult(RETRY, retry_after=delay or 60,
                                          error="Instagram: временный отказ API")
                return classify(resp.status, delay, "Instagram API отказал в отправке")
    except aiohttp.ClientConnectorCertificateError:
        return SendResult(PERMANENT, error="Instagram: ошибка сертификата сервера")
    except aiohttp.ClientConnectorError:
        # Соединение не установлено: сообщение точно не было передано.
        return SendResult(RETRY, error="Instagram: соединение не установлено")
    except (aiohttp.ClientError, TimeoutError) as exc:
        return SendResult(UNKNOWN, error=f"{type(exc).__name__}")


if __name__ == "__main__":
    assert render({"text": "Привет"}) == "Привет"
    assert render({"text": "Привет", "button": {"text": "t", "url": "https://x.test"}}).endswith("https://x.test")
    print("instagram channel self-check ok")
