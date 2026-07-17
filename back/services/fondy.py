"""Клиент Fondy (задача 3): подпись, проверка подписи, создание checkout-ссылки.

Один мерчант на всё приложение (подписка студий на саму CRM), креды в .env по
паттерну security.py. Никаких Strategy/Factory — прямой модуль (правило 1 эпика).

Схема подписи Fondy: SHA1( password + '|' + '|'.join(значения непустых
параметров, отсортированных по ключу) ). В подпись входят ТОЛЬКО непустые
параметры; служебные signature/response_signature_string исключаются.
"""
import hashlib
import logging
import os

import aiohttp
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

MERCHANT_ID = os.getenv("FONDY_MERCHANT_ID", "1396424")
# .env.example использует FONDY_MERCHANT_PASSWORD; читаем и короткое имя как фолбэк.
PASSWORD = os.getenv("FONDY_MERCHANT_PASSWORD") or os.getenv("FONDY_PASSWORD", "test")
CURRENCY = os.getenv("FONDY_CURRENCY", "UAH")

# Хост api.fondy.eu отдаёт 403 (CloudFront) — рабочий домен API pay.fondy.eu.
CHECKOUT_URL = "https://pay.fondy.eu/api/checkout/url"
REVERSE_URL = "https://pay.fondy.eu/api/reverse/order_id"
RECURRING_URL = "https://pay.fondy.eu/api/recurring"
# Не входят в расчёт подписи (сами подписью не являются / служебные).
_SIGNATURE_EXCLUDED = {"signature", "response_signature_string"}


def build_signature(params: dict) -> str:
    """SHA1-подпись Fondy по непустым параметрам, отсортированным по ключу."""
    parts = [
        str(v)
        for k, v in sorted(params.items())
        if k not in _SIGNATURE_EXCLUDED and v not in (None, "")
    ]
    raw = "|".join([PASSWORD] + parts)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()


def verify_signature(payload: dict) -> bool:
    """True, если подпись из payload совпадает с пересчитанной. Пустая подпись → False."""
    given = payload.get("signature")
    if not given:
        return False
    return build_signature(payload) == given


async def create_checkout(
    order_id: str,
    amount: int,
    description: str,
    server_callback_url: str,
    response_url: str,
    currency: str | None = None,
    required_rectoken: str = "Y",
) -> str:
    """Создаёт платёж в Fondy и возвращает checkout_url. amount — в копейках."""
    request = {
        "order_id": order_id,
        "merchant_id": MERCHANT_ID,
        "order_desc": description,
        "amount": amount,
        "currency": currency or CURRENCY,
        "server_callback_url": server_callback_url,
        "response_url": response_url,
        "required_rectoken": required_rectoken,
    }
    request["signature"] = build_signature(request)

    async with aiohttp.ClientSession() as session:
        async with session.post(CHECKOUT_URL, json={"request": request}) as resp:
            data = (await resp.json()).get("response", {})

    if data.get("response_status") != "success":
        logger.error("Fondy checkout failed for %s: %s", order_id, data)
        raise RuntimeError(f"Fondy checkout error: {data.get('error_message', data)}")
    return data["checkout_url"]


async def reverse(order_id: str, amount: int, currency: str | None = None) -> None:
    """Возврат платежа Fondy (задача 6). amount — в копейках, полный возврат.

    Итог (order_status=reversed) приходит асинхронно в тот же вебхук; здесь только
    инициируем и проверяем, что банк принял запрос (response_status=success).
    """
    request = {
        "order_id": order_id,
        "merchant_id": MERCHANT_ID,
        "amount": amount,
        "currency": currency or CURRENCY,
    }
    request["signature"] = build_signature(request)

    async with aiohttp.ClientSession() as session:
        async with session.post(REVERSE_URL, json={"request": request}) as resp:
            data = (await resp.json()).get("response", {})

    if data.get("response_status") != "success":
        logger.error("Fondy reverse failed for %s: %s", order_id, data)
        raise RuntimeError(f"Fondy reverse error: {data.get('error_message', data)}")


async def recurring(
    order_id: str,
    amount: int,
    description: str,
    rectoken: str,
    server_callback_url: str,
    currency: str | None = None,
) -> None:
    """Списание по сохранённой карте (задача 7). amount — в копейках.

    Итоговый статус (approved/declined) приходит асинхронно в тот же вебхук по
    order_id — как у обычной оплаты; здесь только инициируем и проверяем, что
    банк принял запрос (response_status=success).
    """
    request = {
        "order_id": order_id,
        "merchant_id": MERCHANT_ID,
        "order_desc": description,
        "amount": amount,
        "currency": currency or CURRENCY,
        "rectoken": rectoken,
        "server_callback_url": server_callback_url,
    }
    request["signature"] = build_signature(request)

    async with aiohttp.ClientSession() as session:
        async with session.post(RECURRING_URL, json={"request": request}) as resp:
            data = (await resp.json()).get("response", {})

    if data.get("response_status") != "success":
        logger.error("Fondy recurring failed for %s: %s", order_id, data)
        raise RuntimeError(f"Fondy recurring error: {data.get('error_message', data)}")


if __name__ == "__main__":
    # Пример подписи из документации Fondy (password="test"):
    # ожидаемая подпись рассчитывается по этим же значениям вручную.
    _globals_pw = PASSWORD
    PASSWORD = "test"
    sample = {
        "order_id": "test123",
        "merchant_id": 1396424,
        "order_desc": "test order",
        "amount": 10000,
        "currency": "UAH",
        "signature": "",  # пустое — исключается фильтром непустых
    }
    expected = hashlib.sha1(
        "test|10000|UAH|1396424|test order|test123".encode()
    ).hexdigest()
    assert build_signature(sample) == expected, build_signature(sample)

    # verify: правильная подпись проходит, искажённая — нет.
    signed = {**sample}
    signed["signature"] = build_signature(signed)
    assert verify_signature(signed) is True
    signed["signature"] = "deadbeef"
    assert verify_signature(signed) is False
    # пустая/отсутствующая подпись → False
    assert verify_signature({"order_id": "x"}) is False
    PASSWORD = _globals_pw
    print("fondy self-check ok")
