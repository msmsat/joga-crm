"""EPIC AI-3 задача 1: POST /ai/telegram/verify-token, DELETE /ai/telegram/token.
Реальная БД + реальный сетевой вызов Telegram API (заведомо мёртвый токен, тест
проверяет граничные случаи, а не факт существования бота).
Запуск из back/:  python -m tests.test_ai_agents
"""
import asyncio
import warnings

warnings.filterwarnings("ignore")

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import delete, select

from database import async_session_maker
from dependencies import StudioContext
from models import Studio, StudioAISettings
from routers.ai.agents import disconnect_telegram_token, verify_telegram_token
from schemas.ai import TelegramTokenIn

# Синтаксически валиден (проходит паттерн Pydantic), но бота с таким id не существует —
# Telegram гарантированно ответит {"ok": false}. Живой токен для полного цикла
# (сохранение username) недоступен в автотесте — это уже сетевая интеграция с
# реальным ботом, а не юнит на нашей логике.
_DEAD_TOKEN = "123456789:AAFakeTokenForAutomatedTestingPurpose00"


async def _seed() -> int:
    async with async_session_maker() as db:
        s = Studio(name="TEST-AI-AGENTS-STUDIO")
        db.add(s)
        await db.commit()
        return s.id


async def _cleanup(sid: int) -> None:
    async with async_session_maker() as db:
        await db.execute(delete(StudioAISettings).where(StudioAISettings.studio_id == sid))
        await db.execute(delete(Studio).where(Studio.id == sid))
        await db.commit()


async def _run():
    sid = await _seed()
    try:
        owner = StudioContext(user=None, studio_id=sid, role="owner")

        # Формат токена валидируется уже на схеме (422 на реальном эндпоинте).
        try:
            TelegramTokenIn(token="abc")
            assert False, "ожидался ValidationError на кривой формат токена"
        except ValidationError:
            pass

        # Синтаксически валидный, но мёртвый токен -> 400 invalid_bot_token, ничего не сохраняется.
        async with async_session_maker() as db:
            try:
                await verify_telegram_token(TelegramTokenIn(token=_DEAD_TOKEN), ctx=owner, db=db)
                assert False, "ожидался HTTPException invalid_bot_token"
            except HTTPException as e:
                assert e.status_code == 400 and e.detail == "invalid_bot_token", e.detail

        async with async_session_maker() as db:
            row = (await db.execute(
                select(StudioAISettings).where(StudioAISettings.studio_id == sid)
            )).scalar_one_or_none()
            assert row is None or row.tg_token is None, "мёртвый токен не должен был сохраниться"

        # DELETE симметрично гасит tg_token/tg_username/tg_enabled даже если уже пусто.
        async with async_session_maker() as db:
            await disconnect_telegram_token(ctx=owner, db=db)

        async with async_session_maker() as db:
            row = (await db.execute(
                select(StudioAISettings).where(StudioAISettings.studio_id == sid)
            )).scalar_one()
            assert row.tg_token is None and row.tg_username is None and row.tg_enabled is False

        print("OK: test_ai_agents")
    finally:
        await _cleanup(sid)


if __name__ == "__main__":
    asyncio.run(_run())
