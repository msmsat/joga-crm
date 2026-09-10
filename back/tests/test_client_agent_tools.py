"""Инструменты клиентского агента реально вызываются (инцидент 10.09.2026).

ЧТО СЛУЧИЛОСЬ В БОЮ. `lessons_by_date` сменил параметр `client` на `viewer`
(появился Viewer — клиент ЛИБО гость), а вызов в client_agent остался прежним.
Инструмент падал с TypeError на КАЖДОМ вызове, `_call` ловил исключение и
возвращал модели «Не удалось получить данные»: агент не мог назвать ни одного
занятия, а снаружи это выглядело как «ассистент тупит», не как поломка.

Тестов на это не было ни одного: `test_ai_agent` проверяет инструменты
CRM-ассистента (services/ai_tools), а у клиентского агента свой набор и свой
`_call`. Здесь закрывается именно он — САМИМ вызовом, а не сверкой сигнатур:
подпись можно сверить и остаться с неверно собранным Viewer.

Тестовая БД, ручная чистка. Запуск из back/:
    python -m pytest tests/test_client_agent_tools.py
"""
import asyncio
import warnings
from datetime import date, timedelta

warnings.filterwarnings("ignore")

import pytest
from sqlalchemy import delete

from database import async_session_maker
from models import Studio
from services import client_agent

_NAME = "TEST-CLIENT-AGENT-TOOLS"


async def _seed() -> int:
    async with async_session_maker() as db:
        studio = Studio(name=_NAME)
        db.add(studio)
        await db.commit()
        return studio.id


async def _cleanup(studio_id: int) -> None:
    async with async_session_maker() as db:
        await db.execute(delete(Studio).where(Studio.id == studio_id))
        await db.commit()


async def _tool(name: str, args: dict, studio_id: int, client=None) -> dict:
    async with async_session_maker() as db:
        return await client_agent._call(name, args, db, studio_id, client)


@pytest.fixture()
def studio_id():
    sid = asyncio.run(_seed())
    try:
        yield sid
    finally:
        asyncio.run(_cleanup(sid))


def test_schedule_tool_answers_a_stranger(studio_id):
    """Незнакомец спрашивает расписание — инструмент отвечает, а не отказывает.

    Расписание студии публично, и агент обязан называть занятия человеку без
    карточки: именно так приходят новые клиенты. Пустой список — законный
    ответ; `error` — нет, он означает, что инструмент вообще не отработал.
    """
    tomorrow = (date.today() + timedelta(days=1)).isoformat()

    result = asyncio.run(_tool("get_schedule", {"on_date": tomorrow}, studio_id))

    assert "error" not in result, f"инструмент расписания не отработал: {result}"
    assert result["items"] == []


def test_schedule_tool_rejects_a_broken_date_without_crashing(studio_id):
    """Кривая дата от модели — понятная подсказка, а не отказ инструмента.

    Разные ответы: «поправь формат» модель может исправить сама, «не удалось
    получить данные» — нет.
    """
    result = asyncio.run(_tool("get_schedule", {"on_date": "завтра"}, studio_id))

    assert "ГГГГ-ММ-ДД" in result["error"]


def test_personal_tools_stay_closed_to_a_stranger(studio_id):
    """Личные данные без опознания не отдаются — и это не «ошибка инструмента».

    Граница проверяется здесь же, потому что чинили соседнюю строку того же
    `_call`: незнакомец не должен получить чужую бронь и чужой абонемент.
    """
    for name in ("get_my_bookings", "get_my_subscription"):
        result = asyncio.run(_tool(name, {}, studio_id))
        assert "не опознан" in result["error"], (name, result)
