"""Ход ассистента по расписанию: один вызов модели и дальше только сервер (P1.5).

    сообщение -> МОДЕЛЬ (один раз, структурно) -> происхождение -> разрешение
              -> план ответа -> рендер -> строка в очереди исходящих

ОДИН ВЫЗОВ МОДЕЛИ. Второго — «а теперь напиши красивый ответ» — здесь нет и не
будет. Он стоил бы денег и задержки, но главное: он вернул бы модели право
писать про время и места, ради отнятия которого всё это и строилось. Ответ
собирает сервер из фактов каталога, и красив он композицией, а не фантазией.

ПОЧЕМУ ЭТО ОТДЕЛЬНЫЙ МОДУЛЬ. `client_agent` — прежний путь с инструментами и
свободным текстом; он остаётся для всего, что не про расписание, и продолжает
работать при выключенном флаге. Смешивать их в одном файле значило бы получить
две границы доверия в одной функции.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

from services import (
    ai_language, catalog, llm, response_plan, response_render, search_intent,
    search_resolver, search_state,
)
from services.search_state import CanonicalState

logger = logging.getLogger(__name__)

UTC = timezone.utc

# Инструмент, которым модель отдаёт разобранное намерение. Схема собирается из
# Pydantic-модели — руками её здесь не переписываем, иначе описание и проверка
# разъедутся.
_TOOL_NAME = "search_schedule"

# Промпт короткий намеренно. Объяснять модели двести правил бизнес-истины больше
# не нужно: писать цену и число мест ей нечем — таких полей в схеме нет.
# Архитектура сильнее промпта, и промпт после P1.5 стал МЕНЬШЕ, а не больше.
_SYSTEM = (
    "Разбери сообщение клиента фитнес-студии в структуру поиска занятий.\n"
    "Заполняй ТОЛЬКО то, о чём человек сказал в ЭТОМ сообщении; остальное "
    "оставь пустым — прежние условия разговора помнит сервер.\n"
    "surface — ДОСЛОВНЫЙ кусок сообщения человека: не название услуги из "
    "каталога, не перевод, не исправленная опечатка. Не нашёл слова в "
    "сообщении — не пиши его вовсе.\n"
    "Даты не вычисляй: скажи словом (today, tomorrow, weekend...), их посчитает "
    "сервер по календарю студии.\n"
    "Отрицание («не у Валерии», «кроме утра») и всё, чего схема не выражает, "
    "клади дословно в unsupported и не пытайся выразить остальными полями."
)


@dataclass(frozen=True)
class Turn:
    """Результат хода: что отправить и что запомнить.

    Отправка и память записываются ОДНОЙ транзакцией выше (agent_jobs): иначе
    возможен список вариантов, который человеку не отправили.
    """
    payload: Optional[dict] = None
    state: Optional[CanonicalState] = None
    shown: list[tuple[str, int]] = field(default_factory=list)
    new_search: bool = False
    # Для логов и телеметрии. Текста человека здесь нет.
    plan_kind: Optional[str] = None
    outcome: Optional[str] = None
    # Один момент на весь ход: по нему считаны даты и по нему же истечёт срок
    # показанных вариантов.
    reference_now: Optional[datetime] = None


def tool_schema() -> dict:
    return {
        "type": "function",
        "function": {
            "name": _TOOL_NAME,
            "description": "Разобрать сообщение клиента в структуру поиска занятий.",
            "parameters": search_intent.json_schema(),
        },
    }


async def parse(text: str, *, history: Optional[list] = None) -> Optional[dict]:
    """Единственный вызов модели за ход. None — не ответила или ответила мимо.

    Историю показываем, чтобы модель поняла «а после 18?», но условия из неё она
    восстанавливать НЕ должна: их помнит сервер. Её дело — сказать, что нового
    прозвучало сейчас.
    """
    if not llm.is_configured():
        return None
    messages = [{"role": "system", "content": _SYSTEM}]
    for item in (history or [])[-6:]:
        messages.append({"role": item["role"], "content": item["text"]})
    messages.append({"role": "user", "content": text})
    try:
        reply = await llm.chat(messages, tools=[tool_schema()], think=False)
    except Exception:
        logger.exception("search parse: модель не ответила")
        return None
    call = next((c for c in (reply.tool_calls or []) if c.name == _TOOL_NAME), None)
    if call is None:
        return None
    try:
        return json.loads(call.arguments) if isinstance(call.arguments, str) else call.arguments
    except (TypeError, ValueError):
        return None


async def turn(db, *, studio_id: int, thread_id: Optional[int], channel: str,
               text: str, raw, lang: Optional[str] = None,
               now: Optional[datetime] = None) -> Turn:
    """Сырой ответ модели -> готовое сообщение и память разговора.

    Ни строчки текста модели дальше этой функции не проходит: `raw` — только
    структура, а слова берутся из таблиц переводов по решению сервера.
    """
    now = now or datetime.now(UTC)
    previous = None
    if thread_id is not None:
        previous = (await search_state.load(db, thread_id, now=now)).state

    result = await search_resolver.search(
        db, studio_id, raw, user_text=text, reference_now=now,
        previous=previous, thread_id=thread_id,
    )

    # Язык ответа — тем же резолвером, что и везде в продукте: вторая копия
    # правила разошлась бы с первой.
    if lang is None:
        ref = await catalog.studio(db, studio_id)
        lang = ai_language.resolve(
            [{"role": "user", "text": text}],
            studio_language=ref.language if ref else None) or "ru"

    show_branch = response_plan.needs_branch(result.lessons)
    refs = search_state.new_tokens(len(result.lessons) or (1 if result.selected else 0))
    plan = response_plan.build(result, refs=refs, show_branch=show_branch)
    payload = response_render.render(plan, lang=lang, channel=channel)

    logger.info(
        "response_plan_built studio_id=%s thread_id=%s kind=%s copy=%s "
        "options=%s outcome=%s new_search=%s",
        studio_id, thread_id, plan.kind.value, plan.copy_intent.value,
        len(plan.options), result.outcome.value, result.new_search,
    )
    # Запоминаем только то, что человек РЕАЛЬНО увидит: показанные варианты и
    # условия, по которым они найдены. Ссылка на шестой вариант, не попавший в
    # ответ, не должна существовать вовсе.
    shown = plan.shown() if plan.kind is response_plan.PlanKind.SEARCH_RESULTS else []
    return Turn(
        payload=payload, state=result.state, shown=shown,
        new_search=result.new_search and bool(shown),
        plan_kind=plan.kind.value, outcome=result.outcome.value,
        reference_now=now.replace(tzinfo=None),
    )


async def callback(db, *, studio_id: int, thread_id: int, token: str, channel: str,
                   lang: str, now: Optional[datetime] = None) -> Turn:
    """Нажатая кнопка. Модель не зовём вовсе: смысл сервер уже знает.

    Это и есть главный операционный выигрыш P1.5: «показать вариант» и
    «показать ещё» не стоят ни токена и не могут ничего выдумать.
    """
    now = now or datetime.now(UTC)
    result = await search_resolver.select_token(
        db, studio_id, thread_id, token, now=now)
    plan = response_plan.build(result, refs=[token])
    logger.info("deterministic_callback_handled studio_id=%s thread_id=%s outcome=%s",
                studio_id, thread_id, result.outcome.value)
    return Turn(payload=response_render.render(plan, lang=lang, channel=channel),
                plan_kind=plan.kind.value, outcome=result.outcome.value,
                reference_now=now.replace(tzinfo=None))
