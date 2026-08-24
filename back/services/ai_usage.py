"""Запись расхода на модель (эпик AI-5, задача 2).

Отдельный модуль ровно из-за одной вещи: строка расхода пишется **своей**
сессией и коммитится сразу, вне транзакции чата. send_message держит одну
транзакцию на всю пару сообщений (chat.py), а агентный цикл делает внутри неё
2-4 платных вызова модели. Упал четвёртый — FastAPI закроет сессию без коммита,
и строки за уже оплаченные три откатятся вместе с чатом. Счёт от провайдера
при этом придёт полный, причём теряются именно неудачные диалоги — самые
дорогие, в них больше всего итераций и эскалаций.
"""
import logging

from database import async_session_maker
from models import AIUsage
from services.llm import LLMUsage

logger = logging.getLogger(__name__)


async def record_usage(
    studio_id: int,
    usage: LLMUsage,
    *,
    surface: str,
    billable: bool,
    user_id: int | None = None,
    sender_ref: str | None = None,
    tools: str | None = None,
    iterations: int | None = None,
    escalated: bool | None = None,
    escalation_reason: str | None = None,
    escalation_from_model: str | None = None,
    request_id: str | None = None,
) -> None:
    """Пишет строку расхода своей сессией и коммитит сразу.

    Исключения глушим — упавший учёт не имеет права уронить ответ человеку,
    но обязан попасть в лог.

    tools/iterations/escalated (эпик AI-6, задача 18) — метрики цикла, по
    которым видно, где ассистент «тупит»: вопрос, упёршийся в потолок итераций,
    и вопрос, ушедший на дорогую модель, выглядят в отчёте по-разному. Текста
    промптов здесь по-прежнему нет.

    request_id — один на весь вопрос человека: по нему собираются все вызовы
    модели, сделанные ради него. Соседство строк для этого не годится: два
    одновременных вопроса одной студии перемешивают цепочки.

    escalation_reason/escalation_from_model приезжают ровно на ПЕРВОЙ строке
    после переключения — той, что оплачена дорогой моделью. Причина на всех
    последующих строках вопроса сделала бы «сколько было эскалаций» неотличимым
    от «сколько после них было вызовов».
    """
    if not usage.model:
        return  # заглушка вместо модели (ключ не настроен) — платить не за что
    # ponytail: отдельная сессия на строку расхода; батчить в конце цикла — если
    # профиль покажет, что 3-4 коротких коммита на вопрос заметны.
    try:
        async with async_session_maker() as db:
            db.add(AIUsage(
                studio_id=studio_id,
                user_id=user_id,
                surface=surface,
                model=usage.model,
                prompt_tokens=usage.prompt_tokens,
                cached_tokens=usage.cached_tokens,
                completion_tokens=usage.completion_tokens,
                cost_micro=usage.cost_micro,
                billable=billable,
                sender_ref=sender_ref,
                tools=(tools or None),
                iterations=iterations,
                escalated=escalated,
                escalation_reason=escalation_reason,
                escalation_from_model=escalation_from_model,
                request_id=request_id,
            ))
            await db.commit()
    except Exception:
        logger.exception(
            "ai usage not recorded: studio=%s surface=%s model=%s cost_micro=%s",
            studio_id, surface, usage.model, usage.cost_micro,
        )
