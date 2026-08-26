"""Оборванный ответ обязан быть отличим от законченного.

С потолком вывода появился новый исход: модель останавливается не потому, что
договорила, а потому, что кончился бюджет. Внешне это обычный ответ — та же
структура, тот же usage, — и без явной проверки «...и тогда стоит» без
продолжения уезжает человеку как законченная мысль.

Провайдера здесь нет: тело ответа собирается вручную, проверяется разбор.
Живых вызовов эти проверки не требуют и денег не стоят.
"""
import asyncio
import json
import warnings

warnings.filterwarnings("ignore")

from services import llm


def _reply(finish: str | None, text: str = "Ответ.") -> llm.LLMReply:
    return llm.LLMReply(text=text, tool_calls=[],
                        usage=llm.LLMUsage("m", 1, 0, 1, 1), finish_reason=finish)


# ── Признак сам по себе ───────────────────────────────────────────────────────

def test_only_length_counts_as_truncated():
    assert llm.is_truncated(_reply("length"))
    for ok in ("stop", "tool_calls", "content_filter", None):
        assert not llm.is_truncated(_reply(ok)), ok


def test_reply_without_the_field_is_not_truncated():
    """Старый код и заглушки строят LLMReply тремя позиционными полями. Такой
    ответ обязан считаться нормальным, а не оборванным."""
    assert not llm.is_truncated(llm.LLMReply("Готово.", [], llm.LLMUsage("m", 0, 0, 0, 0)))


# ── Нестриминговый путь ───────────────────────────────────────────────────────

def _install_response(payload: dict):
    async def _request_json(body):
        return payload
    llm._request_json = _request_json


def test_plain_chat_carries_the_finish_reason(monkeypatch):
    monkeypatch.setenv("LLM_BASE_URL", "http://llm.invalid")
    monkeypatch.setenv("LLM_API_KEY", "x")
    real = llm._request_json
    try:
        for reason in ("stop", "length", "tool_calls"):
            _install_response({
                "choices": [{"message": {"content": "текст"}, "finish_reason": reason}],
                "usage": {"prompt_tokens": 10, "completion_tokens": 2},
                "model": "google/gemini-3.7-flash",
            })
            reply = asyncio.run(llm._real_chat([{"role": "user", "content": "?"}]))
            assert reply.finish_reason == reason, reason
            assert llm.is_truncated(reply) is (reason == "length")
    finally:
        llm._request_json = real


def test_plain_chat_survives_a_response_without_finish_reason(monkeypatch):
    """Поле необязательное по спецификации — его отсутствие не должно падать."""
    monkeypatch.setenv("LLM_BASE_URL", "http://llm.invalid")
    monkeypatch.setenv("LLM_API_KEY", "x")
    real = llm._request_json
    try:
        _install_response({
            "choices": [{"message": {"content": "текст"}}],
            "usage": {"prompt_tokens": 1, "completion_tokens": 1},
        })
        reply = asyncio.run(llm._real_chat([{"role": "user", "content": "?"}]))
        assert reply.finish_reason is None
        assert not llm.is_truncated(reply)
    finally:
        llm._request_json = real


# ── Стриминговый путь ─────────────────────────────────────────────────────────

class _FakeContent:
    def __init__(self, lines):
        self._lines = lines

    def __aiter__(self):
        async def gen():
            for line in self._lines:
                yield line
        return gen()


class _FakeResp:
    status = 200

    def __init__(self, lines):
        self.content = _FakeContent(lines)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False


class _FakeSession:
    def __init__(self, lines):
        self._lines = lines

    def post(self, *a, **kw):
        return _FakeResp(self._lines)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False


def _stream_lines(reason: str | None):
    chunks = [
        {"model": "google/gemini-3.7-flash", "choices": [{"delta": {"content": "часть "}}]},
        {"model": "google/gemini-3.7-flash",
         "choices": [{"delta": {"content": "ответа"}, "finish_reason": reason}]},
        # usage приезжает ОТДЕЛЬНЫМ чанком уже без choices — на нём причина не
        # должна затираться пустым значением.
        {"model": "google/gemini-3.7-flash", "choices": [],
         "usage": {"prompt_tokens": 10, "completion_tokens": 2}},
    ]
    lines = [f"data: {json.dumps(c, ensure_ascii=False)}".encode() for c in chunks]
    return lines + [b"data: [DONE]"]


def _drain(reason: str | None, monkeypatch) -> dict:
    monkeypatch.setenv("LLM_BASE_URL", "http://llm.invalid")
    monkeypatch.setenv("LLM_API_KEY", "x")
    monkeypatch.setattr(llm.aiohttp, "ClientSession",
                        lambda *a, **kw: _FakeSession(_stream_lines(reason)))

    async def run():
        out = {"tokens": "", "finish": "не приходило", "usage": None}
        async for kind, data in llm._real_chat_stream([{"role": "user", "content": "?"}]):
            if kind == "token":
                out["tokens"] += data
            elif kind == "finish":
                out["finish"] = data
            elif kind == "usage":
                out["usage"] = data
        return out

    return asyncio.run(run())


def test_stream_reports_the_finish_reason(monkeypatch):
    out = _drain("length", monkeypatch)
    assert out["tokens"] == "часть ответа"
    assert out["finish"] == "length"
    assert out["usage"].completion_tokens == 2


def test_stream_reports_a_normal_stop_too(monkeypatch):
    """Событие приходит всегда, а не только при обрыве: «не приходило» и
    «договорила» — разные вещи, и потребитель не должен их путать."""
    assert _drain("stop", monkeypatch)["finish"] == "stop"


def test_stream_and_plain_paths_agree(monkeypatch):
    """Два пути обязаны отвечать одинаково на один и тот же исход — иначе
    стриминговый ответ окажется «полным», а фолбэк того же вопроса «обрезанным».
    """
    streamed = _drain("length", monkeypatch)["finish"]
    real = llm._request_json
    try:
        _install_response({
            "choices": [{"message": {"content": "часть ответа"}, "finish_reason": "length"}],
            "usage": {"prompt_tokens": 10, "completion_tokens": 2},
        })
        plain = asyncio.run(llm._real_chat([{"role": "user", "content": "?"}])).finish_reason
    finally:
        llm._request_json = real
    assert streamed == plain == "length"
