"""Транспорт к моделям (эпик AI-5, задача 1).

Один модуль, который умеет разговаривать с моделью: выбрать уровень
(дешёвый/основной/умный), передать инструменты, пометить статичный префикс
кэшируемым и вернуть не только текст, но и сколько это стоило.

Три вещи, без которых транспорт формально работает, но ведёт себя не так, как
обещают решения эпика:
  * ``provider.data_collection = deny`` — второй рубеж запрета на обучение
    (решение 8). Настройку аккаунта забудут при смене ключа, ключ в теле
    запроса — не забудут.
  * ``models: [основная, запасная]`` — фолбэк при падении провайдера, ради
    которого в решении 3 выбран OpenRouter.
  * ``HTTP-Referer``/``X-Title`` — атрибуция в дашборде OpenRouter, иначе
    расход по продуктам сливается в одну кучу.

Не настроено ≠ сломалось: пустой ``LLM_BASE_URL``/``LLM_API_KEY`` — это
заглушка (локальная разработка и тесты работают без ключа), а 503 приходит
только когда провайдер задан, но не отвечает.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from dataclasses import dataclass
from typing import AsyncIterator

import aiohttp
from fastapi import HTTPException

logger = logging.getLogger(__name__)

TIER_FAST, TIER_MAIN, TIER_SMART = "fast", "main", "smart"

_TIMEOUT_SECONDS = 60

# Уровень -> переменная окружения со слагом модели. Дефолтов нет намеренно:
# preflight (задача 14) требует, чтобы все три были заданы явно, а дефолт
# сделал бы эту проверку бессмысленной — слаг «по умолчанию» устареет молча.
_ENV_BY_TIER = {
    TIER_FAST: "LLM_MODEL_FAST",
    TIER_MAIN: "LLM_MODEL_MAIN",
    TIER_SMART: "LLM_MODEL_SMART",
}
# Запасная модель для списка `models`: соседний уровень того же вендорного пула.
_FALLBACK_TIER = {TIER_FAST: TIER_MAIN, TIER_MAIN: TIER_SMART, TIER_SMART: TIER_MAIN}

# model -> (вход, чтение кэша, ЗАПИСЬ кэша, выход) в микро-$ за 1M токенов.
# Сверено на openrouter.ai/models 2026-08-13 (задача 0, п. 7-8). Провайдеры
# меняют цены — при следующей сверке обновить и дату.
# Запись кэша дороже обычного входа (у Anthropic +25 %): первый вызов диалога
# платит за весь префикс по повышенной ставке и окупается только со второго.
_PRICES: dict[str, tuple[int, int, int, int]] = {
    "google/gemini-3-flash":      (500_000,    50_000,   625_000,  3_000_000),
    "anthropic/claude-sonnet-5":  (3_000_000, 300_000, 3_750_000, 15_000_000),
    "anthropic/claude-opus-5":    (5_000_000, 500_000, 6_250_000, 25_000_000),
}
# Решение 7: ПДн клиентов студии не уезжают в юрисдикции без адекватности GDPR.
_ALLOWED_VENDORS = ("google/", "anthropic/", "openai/")

# Заглушка на случай, если модель не настроена, а вызывающий код это не
# проверил. Основной путь — is_configured() у вызывающего: там есть язык
# студии и локализованный текст (services/assistant.py).
_STUB_TEXT = "Velora AI 3.5 подключается — я уже сохраняю ваши диалоги, скоро отвечу по существу."


@dataclass(frozen=True)
class LLMUsage:
    model: str
    prompt_tokens: int
    cached_tokens: int
    completion_tokens: int
    cost_micro: int          # стоимость в микро-долларах (1e-6 $), int — не float


@dataclass(frozen=True)
class LLMReply:
    text: str | None                 # None, когда модель вернула только tool_calls
    tool_calls: list[dict]           # [{"id","name","arguments"}]
    usage: LLMUsage


def is_configured() -> bool:
    """Настроен ли провайдер. False — вызывающий отдаёт свою заглушку, а не ошибку."""
    return bool(os.getenv("LLM_BASE_URL") and os.getenv("LLM_API_KEY"))


def model_for(tier: str) -> str:
    return os.getenv(_ENV_BY_TIER.get(tier, _ENV_BY_TIER[TIER_FAST]), "")


def _cost_micro(model: str, usage: dict) -> int:
    inp, cached, write, out = _PRICES.get(model, _PRICES["anthropic/claude-opus-5"])  # неизвестная — по самой дорогой
    # `.get(k) or {}`, а НЕ `.get(k, {})`: провайдер присылает ключ со значением
    # null, и второй вариант падает на AttributeError у None. Все счётчики —
    # через .get(..., 0): состав usage у вендоров разный, KeyError здесь = 500
    # в чате из-за отчёта о деньгах.
    details = usage.get("prompt_tokens_details") or {}
    cached_tok = details.get("cached_tokens", 0) or 0
    write_tok = details.get("cache_creation_tokens", 0) or 0
    fresh_tok = max((usage.get("prompt_tokens", 0) or 0) - cached_tok - write_tok, 0)
    return round((
        fresh_tok * inp + cached_tok * cached + write_tok * write
        + (usage.get("completion_tokens", 0) or 0) * out
    ) / 1_000_000)


def _usage(raw: dict | None, model: str) -> LLMUsage:
    """Цена считается по фактически отработавшей модели, а не по запрошенной:
    при фолбэке провайдера ответ приходит от запасной."""
    raw = raw or {}
    details = raw.get("prompt_tokens_details") or {}
    return LLMUsage(
        model=model,
        prompt_tokens=raw.get("prompt_tokens", 0) or 0,
        cached_tokens=details.get("cached_tokens", 0) or 0,
        completion_tokens=raw.get("completion_tokens", 0) or 0,
        cost_micro=_cost_micro(model, raw),
    )


def _stub_reply() -> LLMReply:
    return LLMReply(text=_STUB_TEXT, tool_calls=[], usage=LLMUsage("", 0, 0, 0, 0))


def _url() -> str:
    return f"{os.getenv('LLM_BASE_URL', '').rstrip('/')}/v1/chat/completions"


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {os.getenv('LLM_API_KEY', '')}",
        "HTTP-Referer": os.getenv("WEB_APP_URL", ""),
        "X-Title": "Velora CRM",
    }


def _with_cache_control(messages: list[dict], prefix_len: int) -> list[dict]:
    """Первым prefix_len сообщениям — `cache_control: ephemeral`.

    Anthropic через OpenRouter читает именно этот ключ (в блоке контента),
    Gemini и OpenAI его игнорируют и кэшируют префикс сами, так что ветвлений
    по вендору не нужно.
    """
    if prefix_len <= 0:
        return messages
    out = []
    for i, msg in enumerate(messages):
        content = msg.get("content")
        if i >= prefix_len or not isinstance(content, str):
            out.append(msg)
            continue
        out.append({
            **msg,
            "content": [{"type": "text", "text": content, "cache_control": {"type": "ephemeral"}}],
        })
    return out


def _body(
    messages: list[dict],
    tools: list[dict] | None,
    tier: str,
    cache_prefix_len: int,
    *,
    stream: bool,
) -> dict:
    primary = model_for(tier)
    spare = model_for(_FALLBACK_TIER.get(tier, TIER_MAIN))
    body: dict = {
        "model": primary,
        "messages": _with_cache_control(messages, cache_prefix_len),
        "provider": {"data_collection": "deny"},
    }
    if spare and spare != primary:
        body["models"] = [primary, spare]
    if tools:
        body["tools"] = tools
        body["tool_choice"] = "auto"
    if stream:
        body["stream"] = True
        # Без include_usage провайдер не пришлёт usage в финальном чанке, и
        # стриминговые ответы окажутся бесплатными в ai_usage — мимо квоты и
        # мимо себестоимости.
        body["stream_options"] = {"include_usage": True}
    return body


def _fail(status: int, detail: str) -> None:
    """4xx, которые повторять нельзя. Ключ в лог не попадает — только тело ответа."""
    if status == 402:
        # Единственная поломка эпика, которая чинится пополнением счёта, —
        # в логе она обязана быть различима с первого взгляда.
        logger.error("openrouter_credits: кредиты кончились, ИИ выключен у всех студий: %s", detail)
    elif status == 429:
        logger.error("llm: рейт-лимит провайдера (429), повтор сделает хуже: %s", detail)
    else:
        logger.error("llm: провайдер отверг запрос (%s): %s", status, detail)
    raise HTTPException(status_code=503, detail="assistant_unavailable")


def _timeout() -> aiohttp.ClientTimeout:
    return aiohttp.ClientTimeout(total=_TIMEOUT_SECONDS)


async def _request_json(body: dict) -> dict:
    """Одна повторная попытка на сеть/таймаут/5xx; 402 и 429 — без повтора."""
    for attempt in (1, 2):
        try:
            async with aiohttp.ClientSession(timeout=_timeout()) as session:
                async with session.post(_url(), json=body, headers=_headers()) as resp:
                    if resp.status < 400:
                        return await resp.json()
                    detail = (await resp.text())[:300]
                    if resp.status < 500:
                        _fail(resp.status, detail)
                    logger.warning("llm: %s от провайдера, попытка %s", resp.status, attempt)
        except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
            logger.warning("llm: запрос не прошёл (%s), попытка %s", type(exc).__name__, attempt)
            if attempt == 2:
                logger.exception("llm: провайдер недоступен")
    raise HTTPException(status_code=503, detail="assistant_unavailable")


def _parse_tool_calls(raw: list[dict] | None) -> list[dict]:
    """`arguments` приходит строкой JSON — парсим здесь, чтобы вызывающий код
    не занимался этим трижды. Битый JSON — пустые аргументы: инструмент их не
    провалидирует и вернёт модели текстовую ошибку (задача 4, п. 6)."""
    calls = []
    for call in raw or []:
        fn = call.get("function") or {}
        try:
            args = json.loads(fn.get("arguments") or "{}")
        except (ValueError, TypeError):
            args = {}
        calls.append({
            "id": call.get("id") or "",
            "name": fn.get("name") or "",
            "arguments": args if isinstance(args, dict) else {},
        })
    return calls


async def chat(
    messages: list[dict],
    tools: list[dict] | None = None,
    tier: str = TIER_FAST,
    cache_prefix_len: int = 0,
) -> LLMReply:
    if not is_configured():
        return _stub_reply()

    body = _body(messages, tools, tier, cache_prefix_len, stream=False)
    data = await _request_json(body)
    message = ((data.get("choices") or [{}])[0] or {}).get("message") or {}
    return LLMReply(
        text=message.get("content") or None,
        tool_calls=_parse_tool_calls(message.get("tool_calls")),
        usage=_usage(data.get("usage"), data.get("model") or body["model"]),
    )


def _merge_tool_call_delta(acc: dict[int, dict], deltas: list[dict]) -> None:
    """Аргументы инструментов в стриме приезжают по кускам — склеиваем по индексу."""
    for delta in deltas:
        slot = acc.setdefault(delta.get("index", 0), {"id": "", "name": "", "arguments": ""})
        if delta.get("id"):
            slot["id"] = delta["id"]
        fn = delta.get("function") or {}
        if fn.get("name"):
            slot["name"] = fn["name"]
        if fn.get("arguments"):
            slot["arguments"] += fn["arguments"]


async def chat_stream(
    messages: list[dict],
    tools: list[dict] | None = None,
    tier: str = TIER_FAST,
    cache_prefix_len: int = 0,
) -> AsyncIterator[tuple[str, object]]:
    """("token", str) по мере генерации; ("tool_calls", [...]) при вызове
    инструментов; ("usage", LLMUsage) — последним, ровно один раз."""
    if not is_configured():
        yield "token", _STUB_TEXT
        yield "usage", LLMUsage("", 0, 0, 0, 0)
        return

    body = _body(messages, tools, tier, cache_prefix_len, stream=True)
    started = False
    for attempt in (1, 2):
        calls: dict[int, dict] = {}
        usage_raw: dict = {}
        model = body["model"]
        try:
            async with aiohttp.ClientSession(timeout=_timeout()) as session:
                async with session.post(_url(), json=body, headers=_headers()) as resp:
                    if resp.status >= 400:
                        detail = (await resp.text())[:300]
                        if resp.status < 500:
                            _fail(resp.status, detail)
                        logger.warning("llm stream: %s от провайдера, попытка %s", resp.status, attempt)
                        continue
                    async for raw_line in resp.content:
                        line = raw_line.decode("utf-8", "replace").strip()
                        # OpenRouter шлёт комментарии-хартбиты `: OPENROUTER PROCESSING`.
                        if not line.startswith("data:"):
                            continue
                        payload = line[5:].strip()
                        if payload == "[DONE]":
                            break
                        try:
                            chunk = json.loads(payload)
                        except ValueError:
                            continue
                        model = chunk.get("model") or model
                        if chunk.get("usage"):
                            usage_raw = chunk["usage"]
                        delta = ((chunk.get("choices") or [{}])[0] or {}).get("delta") or {}
                        if delta.get("content"):
                            started = True
                            yield "token", delta["content"]
                        _merge_tool_call_delta(calls, delta.get("tool_calls") or [])

            if calls:
                yield "tool_calls", _parse_tool_calls([
                    {"id": c["id"], "function": {"name": c["name"], "arguments": c["arguments"]}}
                    for _, c in sorted(calls.items())
                ])
            yield "usage", _usage(usage_raw, model)
            return
        except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
            logger.warning("llm stream: обрыв (%s), попытка %s", type(exc).__name__, attempt)
            if started:
                # Часть текста человек уже увидел — повтор дописал бы ответ
                # дважды. Отдаём то, что успели насчитать, и выходим.
                logger.exception("llm stream: обрыв после начала генерации")
                yield "usage", _usage(usage_raw, model)
                return
    raise HTTPException(status_code=503, detail="assistant_unavailable")


if __name__ == "__main__":
    # Самопроверка без сети: деньги считаются целыми числами, кэш дешевле
    # свежего входа, неизвестная модель падает на дорогую ставку, а не на ноль.
    flash, opus = "google/gemini-3-flash", "anthropic/claude-opus-5"
    plain = {"prompt_tokens": 1000, "completion_tokens": 100}
    cached = {**plain, "prompt_tokens_details": {"cached_tokens": 800}}
    written = {**plain, "prompt_tokens_details": {"cache_creation_tokens": 1000}}

    assert _cost_micro(flash, plain) == 800, _cost_micro(flash, plain)
    assert _cost_micro(flash, cached) == 440, _cost_micro(flash, cached)
    assert _cost_micro(flash, cached) < _cost_micro(flash, plain)   # кэш дешевле
    assert _cost_micro(opus, written) > _cost_micro(opus, plain)    # запись кэша дороже входа
    assert _cost_micro("who/knows-1", plain) == _cost_micro(opus, plain)  # неизвестная — по опусу
    assert _cost_micro("who/knows-1", plain) > 0

    # «Странный» usage от провайдера: null вместо словаря, отсутствующие ключи.
    assert _cost_micro(flash, {"prompt_tokens_details": None, "prompt_tokens": 10}) > 0
    assert _cost_micro(flash, {}) == 0
    assert _cost_micro(flash, {"prompt_tokens": None, "completion_tokens": None}) == 0
    assert _usage(None, flash).cost_micro == 0

    # Кэшируется только префикс, и только текстовые сообщения.
    msgs = [{"role": "system", "content": "a"}, {"role": "user", "content": "b"}]
    marked = _with_cache_control(msgs, 1)
    assert marked[0]["content"][0]["cache_control"] == {"type": "ephemeral"}
    assert marked[1]["content"] == "b"
    assert _with_cache_control(msgs, 0) is msgs

    # Аргументы инструментов: строка JSON -> dict; битый JSON не роняет разбор.
    parsed = _parse_tool_calls([{"id": "c1", "function": {"name": "get_schedule", "arguments": '{"d":1}'}}])
    assert parsed == [{"id": "c1", "name": "get_schedule", "arguments": {"d": 1}}]
    assert _parse_tool_calls([{"function": {"arguments": "{oops"}}])[0]["arguments"] == {}

    # Склейка кусков стрима по индексу.
    acc: dict[int, dict] = {}
    _merge_tool_call_delta(acc, [{"index": 0, "id": "c1", "function": {"name": "get_client", "arguments": '{"id"'}}])
    _merge_tool_call_delta(acc, [{"index": 0, "function": {"arguments": ": 7}"}}])
    assert acc[0] == {"id": "c1", "name": "get_client", "arguments": '{"id": 7}'}

    print("llm self-check ok")
