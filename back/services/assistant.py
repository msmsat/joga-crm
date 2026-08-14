"""Единственное место в проекте, которое «думает» (эпик AI-1, задача 3).

run_agent() — цикл «модель ↔ инструменты» (эпик AI-5, задача 7): модель
получает вопрос, карту интерфейса и список инструментов, решает, что вызвать,
получает данные и отвечает. Изменяющие инструменты она не исполняет — только
предлагает. Провайдер не настроен — честная локализованная заглушка, а не
ошибка. Транспорт, уровни моделей и учёт денег живут в services/llm.py.
"""
import json
import logging
import random
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import AsyncIterator, Sequence

import aiohttp
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from dependencies import StudioContext
from models import AIChatMessage, Studio, StudioAISettings
from services import llm
from services.ai_tools import (
    TOOLS,
    UI_MAP,
    call_tool,
    make_action_proposal,
    studio_context_facts,
    tools_for,
)
from services.ai_usage import record_usage

logger = logging.getLogger(__name__)

_IG_REFRESH_TIMEOUT_SECONDS = 10
_IG_REFRESH_THRESHOLD = timedelta(days=10)

_FALLBACK_REPLIES = {
    "ru": [
        "Velora AI 3.5 подключается в ближайшем обновлении — я уже сохраняю ваши диалоги, скоро отвечу по существу.",
        "Настоящий интеллект Velora AI появится совсем скоро — а пока я внимательно всё записываю и ничего не теряю.",
        "Модель Velora AI 3.5 ещё не подключена, но история этого диалога уже сохранена и никуда не пропадёт.",
    ],
    "en": [
        "Velora AI 3.5 is arriving in the next update — I'm already saving our conversation and will reply properly soon.",
        "The real Velora AI is coming very soon — for now I'm carefully keeping track of everything you write.",
        "Velora AI 3.5 isn't connected yet, but this conversation's history is safely saved.",
    ],
}


def default_prompt(studio_name: str) -> str:
    return f"Ты — вежливый ассистент студии «{studio_name}». Отвечай кратко, по делу и дружелюбно."


async def get_or_create_ai_settings(studio_id: int, db: AsyncSession) -> StudioAISettings:
    """Настройки AI студии; создаёт запись с дефолтным промптом на имени студии, если её ещё нет."""
    settings = (await db.execute(
        select(StudioAISettings).where(StudioAISettings.studio_id == studio_id)
    )).scalar_one_or_none()
    if settings is None:
        studio_name = (await db.execute(
            select(Studio.name).where(Studio.id == studio_id)
        )).scalar_one()
        settings = StudioAISettings(studio_id=studio_id, system_prompt=default_prompt(studio_name))
        db.add(settings)
        await db.flush()
    await _maybe_refresh_instagram_token(settings, db)
    return settings


async def _maybe_refresh_instagram_token(settings: StudioAISettings, db: AsyncSession) -> None:
    """Продление long-lived IG-токена (эпик AI-3, задача 4, п.3): ленивый рефреш при
    любом обращении к настройкам студии — токен живёт ~60 дней, владелец заходит
    чаще, отдельный планировщик пока не нужен.
    # ponytail: рефреш при заходе в настройки вместо cron — вынести в общий
    # планировщик, когда он появится в проекте.
    """
    if not settings.ig_token or not settings.ig_token_expires_at:
        return
    if settings.ig_token_expires_at - datetime.utcnow() > _IG_REFRESH_THRESHOLD:
        return
    try:
        timeout = aiohttp.ClientTimeout(total=_IG_REFRESH_TIMEOUT_SECONDS)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(
                "https://graph.instagram.com/refresh_access_token",
                params={"grant_type": "ig_refresh_token", "access_token": settings.ig_token},
            ) as resp:
                resp.raise_for_status()
                data = await resp.json()
        settings.ig_token = data["access_token"]
        settings.ig_token_expires_at = datetime.utcnow() + timedelta(seconds=data["expires_in"])
        # Тот же токен лежит в канале Уведомлений — без этого он там протухает
        # молча. Импорт локальный: instagram_account импортирует этот модуль.
        from services.instagram_account import IG_LOGIN_API, write_dm_integration
        await write_dm_integration(
            db, settings.studio_id,
            token=settings.ig_token, ig_user_id=settings.ig_user_id,
            username=settings.ig_username, api=IG_LOGIN_API,
        )
    except (aiohttp.ClientError, TimeoutError, KeyError, ValueError):
        # Владелец увидит приближающийся срок в UI и переподключит по инструкции (задача 5).
        logger.exception("Instagram token refresh failed for studio_id=%s", settings.studio_id)


def _resolve_language(settings_language: str, studio_language: str | None) -> str:
    lang = (settings_language if settings_language != "auto" else studio_language) or "ru"
    lang = lang.split("-")[0]
    return lang if lang in _FALLBACK_REPLIES else "ru"


def _fallback_reply(settings_language: str, studio_language: str | None) -> str:
    lang = _resolve_language(settings_language, studio_language)
    return random.choice(_FALLBACK_REPLIES[lang])


@dataclass
class AgentResult:
    text: str
    # Изменяющее действие не исполнено, а предложено (задача 6): {tool, args,
    # description, token}. None — обычный ответ.
    action_proposal: dict | None = None


# Кэшируется только ПРЕФИКС, поэтому статичное идёт первым и его порядок менять
# нельзя: переставленная местами карта интерфейса обнуляет кэш и умножает счёт.
#   [0] карта интерфейса          ─┐ одинаковы у ВСЕХ студий → кэшируемый префикс
#   [1] правила ассистента        ─┘
#   [2] промпт студии, роль, дата, валюта, текущая страница — своё у каждой
#   [3:] история сессии
#
# Схемы инструментов отдельным сообщением НЕ дублируются, хотя эпик рисовал их
# третьим слотом: они уходят полем `tools` запроса, которое провайдер и так
# кладёт в кэшируемую часть перед системным блоком. Копия текстом стоила бы
# ~3K токенов в каждом запросе ради кэширования самой себя.
_CACHE_PREFIX_LEN = 2

# Один вопрос = 2-4 вызова модели; шесть — потолок против зацикливания.
_MAX_ITERATIONS = 6

_RULES = """Ты — Velora AI, ассистент внутри CRM для студий йоги, пилатеса и фитнеса.

Как отвечать:
- Коротко и по делу, без вступлений и без пересказа вопроса.
- Данные о студии бери ТОЛЬКО из инструментов. Не помнишь и не видел — вызови инструмент.
- Не выдумывай цифры, имена, занятия и кнопки. Нет данных — так и скажи.
- «Куда нажать» отвечай по карте интерфейса выше, дословным путём из неё.
  Такого действия в карте нет — честно скажи, что такой функции в Velora нет.
- Суммы называй с валютой студии из контекста. Свой знак валюты не подставляй.
- Даты и «сегодня/завтра» считай по часовому поясу студии из контекста.
- Изменяющее действие (создать, записать, отменить, заморозить) ты не выполняешь:
  вызови нужный инструмент — человек подтвердит его кнопкой сам.
- Инструмент вернул ошибку — объясни её человеку своими словами, не повторяй попытку вслепую.
- Отвечай на языке, указанном в контексте студии."""


def _context_prompt(
    settings: StudioAISettings,
    facts: dict,
    ctx: StudioContext,
    studio_language: str | None,
    current_page: str | None,
) -> str:
    """Слот [2]: всё, что различается по студии, роли и дню.

    StudioAISettings.system_prompt обязан попасть сюда — это редактируемое
    владельцем поле, ради которого сделан эпик AI-2. Потерять его при
    переписывании значит тихо отменить готовую фичу: поле в интерфейсе
    сохраняется и ни на что не влияет. Но в кэшируемый префикс он не идёт: у
    каждой студии он свой, и префикс перестал бы быть общим.
    """
    lines = [
        settings.system_prompt or default_prompt(facts["studio_name"]),
        "",
        f"Студия: {facts['studio_name']}",
        f"Роль спрашивающего: {ctx.role}",
        f"Сегодня: {facts['today']} (часовой пояс студии {facts['timezone']})",
        f"Валюта студии: {facts['currency']}",
        f"Язык ответа: {_resolve_language(settings.language, studio_language)}",
    ]
    if current_page:
        lines.append(f"Пользователь сейчас на странице: {current_page}")
    return "\n".join(lines)


async def build_messages(
    ctx: StudioContext,
    db: AsyncSession,
    settings: StudioAISettings,
    history: Sequence[AIChatMessage],
    studio_language: str | None = None,
    current_page: str | None = None,
) -> list[dict]:
    facts = await studio_context_facts(db, ctx.studio_id)
    return [
        {"role": "system", "content": UI_MAP},
        {"role": "system", "content": _RULES},
        {"role": "system", "content": _context_prompt(settings, facts, ctx, studio_language, current_page)},
        *[{"role": m.role, "content": m.text} for m in history],
    ]


def _assistant_turn(reply: llm.LLMReply) -> dict:
    """Ответ модели обратно в историю. tool_calls обязаны вернуться в том же
    формате, иначе следующий запрос с ролью tool провайдер отвергнет как 400."""
    return {
        "role": "assistant",
        "content": reply.text or "",
        "tool_calls": [
            {
                "id": c["id"],
                "type": "function",
                "function": {"name": c["name"], "arguments": json.dumps(c["arguments"], ensure_ascii=False)},
            }
            for c in reply.tool_calls
        ],
    }


async def _one_turn(
    messages: list[dict], tools: list[dict], tier: str, stream: bool,
) -> AsyncIterator[tuple[str, object]]:
    """Один обращение к модели. В стриме отдаёт куски текста по мере генерации;
    последним — ("reply", LLMReply) с собранным текстом, вызовами и usage."""
    if not stream:
        yield "reply", await llm.chat(messages, tools=tools, tier=tier, cache_prefix_len=_CACHE_PREFIX_LEN)
        return

    parts: list[str] = []
    calls: list[dict] = []
    usage: llm.LLMUsage | None = None
    async for kind, data in llm.chat_stream(
        messages, tools=tools, tier=tier, cache_prefix_len=_CACHE_PREFIX_LEN,
    ):
        if kind == "token":
            parts.append(data)
            yield "token", data
        elif kind == "tool_calls":
            calls = data
        elif kind == "usage":
            usage = data
    yield "reply", llm.LLMReply(
        text="".join(parts) or None,
        tool_calls=calls,
        usage=usage or llm.LLMUsage("", 0, 0, 0, 0),
    )


async def agent_events(
    ctx: StudioContext,
    db: AsyncSession,
    settings: StudioAISettings,
    history: Sequence[AIChatMessage],
    *,
    session_id: int | None = None,
    studio_language: str | None = None,
    current_page: str | None = None,
    surface: str = "crm",
    stream: bool = False,
) -> AsyncIterator[tuple[str, object]]:
    """Цикл «модель ↔ инструменты» как поток событий. history — последние 20
    сообщений сессии.

    События: ("token", str) — кусок текста (только при stream=True);
    ("tool_status", имя инструмента); ("navigate", маршрут);
    ("result", AgentResult) — ровно один раз, последним.

    Один цикл на оба режима намеренно: две копии разошлись бы в поведении, и
    ответ из стрима перестал бы совпадать с ответом фолбэка.

    Начинает всегда на дешёвом уровне; на дорогой переходит не более одного раза
    за вопрос. Эскалация обнуляет кэш префикса — 10K токенов уедут в новую модель
    по полной ставке, поэтому «на всякий случай» не эскалируем никогда.
    """
    # Провайдер не настроен — честная заглушка, а не ошибка: на этом стоит
    # локальная разработка без ключа и существующие тесты (задача 1, п. 6).
    if not llm.is_configured():
        yield "result", AgentResult(text=_fallback_reply(settings.language, studio_language))
        return

    messages = await build_messages(ctx, db, settings, history, studio_language, current_page)
    tools = tools_for(ctx)
    tier = llm.TIER_FAST
    escalated = False
    last_text: str | None = None

    for step in range(_MAX_ITERATIONS):
        reply: llm.LLMReply | None = None
        async for kind, data in _one_turn(messages, tools, tier, stream):
            if kind == "reply":
                reply = data
            else:
                yield kind, data
        # Квоту жжёт только первая итерация: человек задал один вопрос, а
        # сколько раз ради него сходили в модель — не его дело.
        await record_usage(
            ctx.studio_id, reply.usage,
            surface=surface, billable=(step == 0), user_id=ctx.user.id,
        )
        if reply.text:
            last_text = reply.text
        if not reply.tool_calls:
            text = reply.text or last_text or _fallback_reply(settings.language, studio_language)
            yield "result", AgentResult(text=text)
            return

        # Изменяющее — НЕ исполняем: собираем предложение и выходим (решение 5).
        for call in reply.tool_calls:
            t = TOOLS.get(call["name"])
            if t is not None and t.mutating:
                proposal = make_action_proposal(call["name"], call["arguments"], ctx, session_id)
                yield "result", AgentResult(
                    text=reply.text or f"Подтвердите действие: {proposal['description']}",
                    action_proposal=proposal,
                )
                return

        messages.append(_assistant_turn(reply))
        had_error = False
        wants_smart = False
        for call in reply.tool_calls:
            yield "tool_status", call["name"]
            result = await call_tool(call["name"], call["arguments"], ctx, db)
            if result.get("navigate"):
                yield "navigate", result["navigate"]
            had_error = had_error or "error" in result
            t = TOOLS.get(call["name"])
            wants_smart = wants_smart or (t is not None and t.tier_hint == llm.TIER_SMART)
            messages.append({
                "role": "tool",
                "tool_call_id": call["id"],
                "content": json.dumps(result, ensure_ascii=False, default=str),
            })

        if not escalated and tier == llm.TIER_FAST:
            if wants_smart:
                tier, escalated = llm.TIER_SMART, True
            elif step >= 3 or had_error:
                tier, escalated = llm.TIER_MAIN, True

    # Лимит итераций исчерпан. Пустой ответ хуже неполного.
    logger.warning("agent loop exhausted: studio=%s surface=%s", ctx.studio_id, surface)
    tail = "\n\nЗадача оказалась сложнее обычного — уточните вопрос, и я продолжу."
    yield "result", AgentResult(text=(last_text or "Не удалось довести ответ до конца.") + tail)


async def run_agent(
    ctx: StudioContext,
    db: AsyncSession,
    settings: StudioAISettings,
    history: Sequence[AIChatMessage],
    **kwargs,
) -> AgentResult:
    """Нестриминговый ответ ассистента — фолбэк POST /messages и клиентские каналы."""
    async for kind, data in agent_events(ctx, db, settings, history, **kwargs):
        if kind == "result":
            return data
    return AgentResult(text="")  # недостижимо: цикл всегда заканчивается result
