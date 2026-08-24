"""Потолок ответа модели в теле запроса.

Без явного max_tokens провайдер резервирует под ответ весь выход модели и
отвечает 402 «не хватает кредитов», когда денег на настоящий ответ хватает с
избытком. На отсчёте BASELINE_FLAT_65_FLASH так потерялось 9 вопросов из 62.

Тесты бьют по `_body`: это единственное место, где собирается тело, и через
него проходят оба пути — обычный чат и стрим. Сети здесь нет и не нужно.
"""
from services import llm

_MESSAGES = [
    {"role": "system", "content": "Ты ассистент студии."},
    {"role": "user", "content": "Сколько у нас клиентов?"},
]
_TOOLS = [{"type": "function", "function": {"name": "find_clients", "parameters": {}}}]

# Самый длинный ответ за весь набор из 173 вопросов. Потолок обязан его
# перекрывать с запасом, иначе живые ответы начнут обрываться на полуслове.
_OBSERVED_LONGEST_ANSWER = 1455


def _body(tier=llm.TIER_FAST, **kw):
    kw.setdefault("stream", False)
    return llm._body(_MESSAGES, _TOOLS, tier, 1, **kw)


def test_flash_request_carries_an_explicit_output_ceiling():
    assert _body()["max_tokens"] == 4096


def test_ceiling_clears_the_longest_answer_ever_observed():
    """Не «4096, потому что круглое»: запас считается от замера."""
    assert _body()["max_tokens"] > _OBSERVED_LONGEST_ANSWER * 2


def test_streaming_and_plain_requests_get_the_same_ceiling():
    """Потолок живёт в _body, а не в вызывающем коде: забыть его в одном из двух
    путей — ровно та поломка, которую этот тест обязан ловить."""
    assert _body(stream=True)["max_tokens"] == _body(stream=False)["max_tokens"]


def test_ceiling_holds_when_thinking_is_switched_off():
    assert _body(think=False)["max_tokens"] == _body(think=True)["max_tokens"]


def test_reasoning_tiers_get_more_room_than_the_cheap_one():
    """Токены размышления списываются из бюджета ответа — проверено живым
    запросом. Общий на всех потолок однажды вернул бы от умной модели пустой
    текст вместо ответа, и это выглядело бы не ошибкой, а плохим ответом."""
    fast = _body(llm.TIER_FAST)["max_tokens"]
    for tier in (llm.TIER_MAIN, llm.TIER_SMART):
        assert _body(tier)["max_tokens"] > fast


def test_unknown_tier_falls_back_to_the_default_ceiling():
    """Уровень клиентского агента и любой будущий получают дефолт, а не ноль и
    не отсутствие поля."""
    assert _body(llm.TIER_CLIENT)["max_tokens"] == 4096
    assert llm.max_output_tokens("такого-уровня-нет") == 4096


def test_override_is_per_tier_and_takes_effect(monkeypatch):
    monkeypatch.setitem(llm._MAX_OUTPUT_BY_TIER, llm.TIER_FAST, 777)
    assert _body(llm.TIER_FAST)["max_tokens"] == 777
    # соседний уровень не задет
    assert _body(llm.TIER_SMART)["max_tokens"] == 8192


def test_only_one_token_limit_field_is_sent():
    """Два конкурирующих поля в одном теле — путь к тому, что провайдер учтёт
    не то, которое правили."""
    body = _body()
    assert "max_completion_tokens" not in body
    assert [k for k in body if "token" in k] == ["max_tokens"]


def test_ceiling_does_not_touch_input_messages_or_tools():
    """Чинили резерв на ВЫХОД. Вход, инструменты и история остаются целыми."""
    body = _body()
    assert len(body["messages"]) == len(_MESSAGES)
    assert body["messages"][-1] == _MESSAGES[-1]
    assert body["tools"] == _TOOLS
    assert body["tool_choice"] == "auto"


def test_everything_the_body_carried_before_is_still_there(monkeypatch):
    monkeypatch.setenv("LLM_MODEL_FAST", "google/gemini-3.7-flash")
    monkeypatch.setenv("LLM_MODEL_MAIN", "anthropic/claude-sonnet-5")
    body = _body(stream=True, think=False)
    assert body["model"] == "google/gemini-3.7-flash"
    assert body["models"] == ["google/gemini-3.7-flash", "anthropic/claude-sonnet-5"]
    assert body["provider"] == {"data_collection": "deny"}
    assert body["reasoning"] == {"effort": "minimal"}
    assert body["stream"] is True
    assert body["stream_options"] == {"include_usage": True}


def test_sampling_added_by_the_caller_survives():
    """Набор оценки дописывает temperature/top_p/seed поверх тела. Потолок не
    должен ни затирать их, ни мешать им появиться."""
    body = _body()
    body.update(temperature=0, top_p=1, seed=7)
    assert (body["temperature"], body["top_p"], body["seed"]) == (0, 1, 7)
    assert body["max_tokens"] == 4096
