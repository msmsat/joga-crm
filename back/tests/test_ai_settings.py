"""EPIC AI-2 задача 1: GET/PATCH /ai/settings (get-or-create, ролевой гейт токенов, гейт тумблеров).
Реальная БД, ручная чистка. Запуск из back/:  python -m tests.test_ai_settings
"""
import asyncio
import warnings

warnings.filterwarnings("ignore")

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import delete

from database import async_session_maker
from dependencies import StudioContext
from models import Studio, StudioAISettings
from routers.ai.settings import get_ai_settings, update_ai_settings
from schemas.ai import AISettingsUpdate


async def _seed() -> int:
    async with async_session_maker() as db:
        s = Studio(name="TEST-AI-SETTINGS-STUDIO")
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
        trainer = StudioContext(user=None, studio_id=sid, role="trainer")

        # GET на свежей студии: get-or-create, дефолтный промпт с именем студии, модель velora-3.5.
        async with async_session_maker() as db:
            r = await get_ai_settings(ctx=owner, db=db)
        assert r.model == "velora-3.5", r.model
        assert r.system_prompt and "TEST-AI-SETTINGS-STUDIO" in r.system_prompt, r.system_prompt
        assert r.tg_token is None and r.ig_token is None  # ещё не подключены

        # GET той же студии второй раз — не пересоздаёт строку (id/prompt стабильны).
        async with async_session_maker() as db:
            r2 = await get_ai_settings(ctx=owner, db=db)
        assert r2.system_prompt == r.system_prompt

        # PATCH владельцем: меняем язык, не трогаем остальное.
        async with async_session_maker() as db:
            patched = await update_ai_settings(body=AISettingsUpdate(language="en"), ctx=owner, db=db)
        assert patched.language == "en", patched.language
        assert patched.model == "velora-3.5"  # не переписалось

        # Нельзя выбрать несуществующую модель — падает уже на конструкции схемы (422 на реальном эндпоинте).
        try:
            AISettingsUpdate(model="gpt-4o")
            assert False, "ожидался ValidationError на чужую модель"
        except ValidationError:
            pass

        # Включить tg_enabled без сохранённого tg_token — серверный гейт 400.
        async with async_session_maker() as db:
            try:
                await update_ai_settings(body=AISettingsUpdate(tg_enabled=True), ctx=owner, db=db)
                assert False, "ожидался HTTPException tg_token_required"
            except HTTPException as e:
                assert e.status_code == 400 and e.detail == "tg_token_required", e.detail

        # Включить ig_enabled без ig_token — тот же гейт, свой код ошибки.
        async with async_session_maker() as db:
            try:
                await update_ai_settings(body=AISettingsUpdate(ig_enabled=True), ctx=owner, db=db)
                assert False, "ожидался HTTPException ig_not_connected"
            except HTTPException as e:
                assert e.status_code == 400 and e.detail == "ig_not_connected", e.detail

        # GET тренером: язык уже сменился (общие поля видны), токены скрыты ролевым гейтом.
        async with async_session_maker() as db:
            r3 = await get_ai_settings(ctx=trainer, db=db)
        assert r3.language == "en"
        assert r3.tg_token is None and r3.ig_token is None

        print("OK: test_ai_settings")
    finally:
        await _cleanup(sid)


if __name__ == "__main__":
    asyncio.run(_run())
