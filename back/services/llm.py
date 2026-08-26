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
# Клиентский агент в мессенджерах (services/client_agent.py). Уровень отдельный,
# потому что требования к нему противоположны остальным: там человек ждёт ответа
# в чате прямо сейчас, а задачи простые — «когда занятие», «сколько стоит».
# Замер 18.08.2026: на одном и том же вопросе gemini-3.7-flash отвечает 2.9 с,
# gemini-3.5-flash-lite — 0.6 с. Раньше агент делил слаг с FAST, и любая смена
# модели ради сообразительности CRM-ассистента била по скорости чата с клиентом.
TIER_CLIENT = "client"

_TIMEOUT_SECONDS = 60

# Потолок ОТВЕТА модели. Без него провайдер резервирует под ответ весь выход
# модели — у gemini-3.7-flash это 65 536 токенов — и отвечает 402 «не хватает
# кредитов», когда на счёте ещё есть деньги на сотню настоящих ответов.
# Замерено на отсчёте BASELINE_FLAT_65_FLASH: 9 вопросов из 62 не были заданы
# при остатке около $1, хотя каждый стоил бы центы. Самый длинный ответ за весь
# набор — 1455 токенов, так что 4096 это почти трёхкратный запас.
#
# Токены размышления списываются ИЗ ЭТОГО ЖЕ бюджета — проверено живым запросом
# 24.08.2026: при max_tokens=64 модель израсходовала все 64 на размышление и
# вернула ПУСТОЙ текст (finish_reason=length). Поэтому уровням с моделями
# Anthropic потолок выше: у них размышление длиннее, и общий на всех потолок
# однажды сделал бы их непригодными молча — ответ приходил бы пустым, а не
# ошибкой. Ограничение касается только выхода: вход, инструменты, результаты
# инструментов и история не режутся.
_MAX_OUTPUT_TOKENS = 4096
_MAX_OUTPUT_BY_TIER = {TIER_MAIN: 8192, TIER_SMART: 8192}

# Уровень -> переменная окружения со слагом модели. Дефолтов нет намеренно:
# preflight (задача 14) требует, чтобы все три были заданы явно, а дефолт
# сделал бы эту проверку бессмысленной — слаг «по умолчанию» устареет молча.
_ENV_BY_TIER = {
    TIER_FAST: "LLM_MODEL_FAST",
    TIER_MAIN: "LLM_MODEL_MAIN",
    TIER_SMART: "LLM_MODEL_SMART",
}
# Необязательные: не задана — уровень работает на модели FAST, как до её
# появления. Отдельно от _ENV_BY_TIER, потому что preflight требует ОБЯЗАТЕЛЬНОГО
# заполнения всего, что там перечислено, а этой переменной можно и не быть.
_OPTIONAL_ENV_BY_TIER = {TIER_CLIENT: "LLM_MODEL_CLIENT"}
# Запасная модель для списка `models`: соседний уровень того же вендорного пула.
# У клиентского агента запасная — FAST, а не MAIN: падать с дешёвой быстрой
# модели сразу на Sonnet значит платить втрое за «привет».
_FALLBACK_TIER = {TIER_FAST: TIER_MAIN, TIER_MAIN: TIER_SMART, TIER_SMART: TIER_MAIN,
                  TIER_CLIENT: TIER_FAST}

# model -> (вход, чтение кэша, ЗАПИСЬ кэша, выход) в микро-$ за 1M токенов.
#
# СВЕРЕНО ЖИВЫМ ЗАПРОСОМ к /v1/models 2026-08-18, не переписано из документа:
# в эпике стояли `google/gemini-3-flash` (такой модели в каталоге нет вовсе) и
# ставки Sonnet 5 $3/$15 (по факту $2/$10). На неверных ставках весь учёт денег
# в ai_usage — фикция, поэтому при смене модели цены сверять заново тем же
# запросом, а не по памяти. Ожидается пересмотр цен Anthropic 01.09.2026.
#
# Запись кэша дороже обычного входа (у Anthropic +25 %): первый вызов диалога
# платит за весь префикс по повышенной ставке и окупается только со второго.
# У Gemini наоборот — запись дешевле входа, и «по образцу соседа» эту графу
# заполнять нельзя ни в одну сторону.
_PRICES: dict[str, tuple[int, int, int, int]] = {
    # Замерено на живом каталоге OpenRouter 18.08.2026. Модели, которой здесь
    # нет, считают цену по ставке Opus (см. ниже) — забытая строка расходы
    # завышает, а не занижает. Это осознанно.
    "google/gemini-3.1-flash-lite": (250_000,   25_000,    83_333,  1_500_000),
    # Рабочий уровень FAST. Запись кэша тут ДЕШЕВЛЕ обычного входа (0.0208 против
    # 0.375) — редкий случай, и в таблице она стояла вшестеро дороже правды:
    # 125_000 было переписано по образцу соседей, а не сверено запросом.
    "google/gemini-3.7-flash":      (375_000,   37_500,    20_833,  1_875_000),
    # Сверено живым /v1/models 18.08.2026. Строка заведена заранее, до смены
    # LLM_MODEL_FAST: без неё эта модель считалась бы по ставке Opus (см. ниже),
    # и месячная квота студии сгорала бы в разы быстрее — молча.
    "google/gemini-3.5-flash-lite": (300_000,   30_000,    83_333,  2_500_000),
    "openai/gpt-5-mini":            (250_000,   25_000,    83_333,  2_000_000),
    "openai/gpt-5.4-nano":          (200_000,   20_000,    66_667,  1_250_000),
    "anthropic/claude-haiku-4.5": (1_000_000,  100_000, 1_250_000,  5_000_000),
    "google/gemini-2.5-flash":      (300_000,   30_000,    83_333,  2_500_000),
    "google/gemini-2.5-flash-lite": (100_000,   10_000,    83_333,    400_000),
    "anthropic/claude-sonnet-5":  (2_000_000,  200_000, 2_500_000, 10_000_000),
    "anthropic/claude-opus-5":    (5_000_000,  500_000, 6_250_000, 25_000_000),
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
    # Почему модель остановилась: "stop" — договорила, "tool_calls" — зовёт
    # инструмент, "length" — УПЁРЛАСЬ В ПОТОЛОК и оборвана на полуслове.
    # Последнее обязано быть различимо: обрезанный ответ выглядит как обычный,
    # и без этого поля он молча уезжает человеку как полный.
    finish_reason: str | None = None


def is_truncated(reply: LLMReply) -> bool:
    """Ответ оборван потолком, а не закончен."""
    return reply.finish_reason == "length"


def is_configured() -> bool:
    """Настроен ли провайдер. False — вызывающий отдаёт свою заглушку, а не ошибку."""
    return bool(os.getenv("LLM_BASE_URL") and os.getenv("LLM_API_KEY"))


def model_for(tier: str) -> str:
    if tier in _OPTIONAL_ENV_BY_TIER:
        # Переменной нет — уровень работает на общей дешёвой модели, ровно как
        # до её появления. Это и делает переменную безопасной для прода: пока её
        # не добавили в back/.env на сервере, поведение прежнее.
        return os.getenv(_OPTIONAL_ENV_BY_TIER[tier], "") or os.getenv(_ENV_BY_TIER[TIER_FAST], "")
    return os.getenv(_ENV_BY_TIER.get(tier, _ENV_BY_TIER[TIER_FAST]), "")


def max_output_tokens(tier: str) -> int:
    """Потолок ответа для уровня. Переопределяется по уровню, а не по модели:
    слаг модели берётся из окружения и меняется без правки кода, а потолок
    осмысленно задавать именно для роли уровня — дешёвый отвечает коротко,
    умный размышляет."""
    return _MAX_OUTPUT_BY_TIER.get(tier, _MAX_OUTPUT_TOKENS)


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
    think: bool = True,
) -> dict:
    primary = model_for(tier)
    spare = model_for(_FALLBACK_TIER.get(tier, TIER_MAIN))
    body: dict = {
        "model": primary,
        "messages": _with_cache_control(messages, cache_prefix_len),
        # Единственное поле потолка в теле: OpenAI-совместимый путь OpenRouter
        # читает max_tokens, и второе поле рядом (max_completion_tokens) только
        # спорило бы с этим. Проверено живым запросом: при 64 ответ обрезан
        # (finish_reason=length), при 4096 доходит до конца.
        "max_tokens": max_output_tokens(tier),
        "provider": {"data_collection": "deny"},
    }
    if spare and spare != primary:
        body["models"] = [primary, spare]
    if not think:
        # Модели с размышлением тратят его и на «привет»: замерено на
        # google/gemini-3.7-flash — 360-430 токенов размышления на 180 символов
        # ответа, 3.5-5 секунд вместо 1.2-1.5. Клиент в мессенджере этих токенов
        # не увидит никогда, а ждёт их и платит за них студия.
        #
        # Именно "minimal", а не выключение: {"enabled": false} и
        # {"max_tokens": 0} эта модель не принимает, и OpenRouter молча
        # переключается на запасную из `models` — в замере ответ приезжал уже от
        # anthropic/claude-sonnet-5, то есть втрое дороже и не быстрее.
        body["reasoning"] = {"effort": "minimal"}
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
    think: bool = True,
) -> LLMReply:
    """think=False — «не размышляй, отвечай»: для простых вопросов, где
    размышление модели это только задержка и деньги (см. _body)."""
    if not is_configured():
        return _stub_reply()

    body = _body(messages, tools, tier, cache_prefix_len, stream=False, think=think)
    data = await _request_json(body)
    choice = (data.get("choices") or [{}])[0] or {}
    message = choice.get("message") or {}
    return LLMReply(
        text=message.get("content") or None,
        tool_calls=_parse_tool_calls(message.get("tool_calls")),
        usage=_usage(data.get("usage"), data.get("model") or body["model"]),
        finish_reason=choice.get("finish_reason"),
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
        finish: str | None = None
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
                        choice = (chunk.get("choices") or [{}])[0] or {}
                        # Причина остановки приезжает в последнем чанке с
                        # текстом, а usage — ещё позже, отдельным. Поэтому не
                        # перезаписываем её пустым значением из хвоста.
                        finish = choice.get("finish_reason") or finish
                        delta = choice.get("delta") or {}
                        if delta.get("content"):
                            started = True
                            yield "token", delta["content"]
                        _merge_tool_call_delta(calls, delta.get("tool_calls") or [])

            if calls:
                yield "tool_calls", _parse_tool_calls([
                    {"id": c["id"], "function": {"name": c["name"], "arguments": c["arguments"]}}
                    for _, c in sorted(calls.items())
                ])
            # Почему модель остановилась — событием, а не полем usage: usage про
            # деньги, а это про полноту ответа, и смешивать их значит однажды
            # потерять одно вместе с другим.
            yield "finish", finish
            yield "usage", _usage(usage_raw, model)
            return
        except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
            logger.warning("llm stream: обрыв (%s), попытка %s", type(exc).__name__, attempt)
            if started:
                # Часть текста человек уже увидел — повтор дописал бы ответ
                # дважды. Отдаём то, что успели насчитать, и выходим.
                logger.exception("llm stream: обрыв после начала генерации")
                yield "finish", finish
                yield "usage", _usage(usage_raw, model)
                return
    raise HTTPException(status_code=503, detail="assistant_unavailable")


if __name__ == "__main__":
    # Самопроверка без сети: деньги считаются целыми числами, кэш дешевле
    # свежего входа, неизвестная модель падает на дорогую ставку, а не на ноль.
    flash, opus = "google/gemini-2.5-flash", "anthropic/claude-opus-5"
    plain = {"prompt_tokens": 1000, "completion_tokens": 100}
    cached = {**plain, "prompt_tokens_details": {"cached_tokens": 800}}
    written = {**plain, "prompt_tokens_details": {"cache_creation_tokens": 1000}}

    # Точное число ловит опечатку в _PRICES: 1000 входных по $0.30/1M плюс
    # 100 выходных по $2.50/1M = 550 микро-долларов.
    assert _cost_micro(flash, plain) == 550, _cost_micro(flash, plain)
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
