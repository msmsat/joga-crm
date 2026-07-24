"""EPIC AI-3 задача 4: OAuth Instagram — state JWT, disconnect, гейт истёкшего токена,
ленивый рефреш (реальная БД; сетевые вызовы к Meta без валидных кредов — проверяем,
что сбой глотается в лог, а не роняет запрос).
Запуск из back/:  python -m tests.test_ai_instagram
"""
import asyncio
import warnings
from datetime import datetime, timedelta

warnings.filterwarnings("ignore")

from fastapi import HTTPException
from jose import jwt
from sqlalchemy import delete, select

from database import async_session_maker
from dependencies import ALGORITHM, SECRET_KEY, StudioContext
from models import Studio, StudioAISettings
from routers.ai.instagram import _studio_id_from_state, disconnect_instagram
from routers.ai.settings import update_ai_settings
from schemas.ai import AISettingsUpdate
from services.assistant import _maybe_refresh_instagram_token, get_or_create_ai_settings


async def _seed() -> int:
    async with async_session_maker() as db:
        s = Studio(name="TEST-AI-INSTAGRAM-STUDIO")
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

        # state JWT: валидный round-trip.
        good_state = jwt.encode(
            {"studio_id": sid, "purpose": "ig_oauth", "exp": datetime.utcnow() + timedelta(minutes=10)},
            SECRET_KEY, algorithm=ALGORITHM,
        )
        assert _studio_id_from_state(good_state) == sid

        # неверный purpose -> отвергнут, даже если подпись верна.
        wrong_purpose = jwt.encode(
            {"studio_id": sid, "purpose": "something_else", "exp": datetime.utcnow() + timedelta(minutes=10)},
            SECRET_KEY, algorithm=ALGORITHM,
        )
        assert _studio_id_from_state(wrong_purpose) is None

        # просроченный state -> отвергнут.
        expired = jwt.encode(
            {"studio_id": sid, "purpose": "ig_oauth", "exp": datetime.utcnow() - timedelta(minutes=1)},
            SECRET_KEY, algorithm=ALGORITHM,
        )
        assert _studio_id_from_state(expired) is None

        # мусор/пусто -> отвергнут, не 500.
        assert _studio_id_from_state("garbage.not.a.jwt") is None
        assert _studio_id_from_state(None) is None

        # Гейт AI-2, ужесточённый в AI-3 п.4: токен есть, но срок истёк -> всё равно 400.
        async with async_session_maker() as db:
            settings = await get_or_create_ai_settings(sid, db)
            settings.ig_token = "fake-long-lived-token"
            settings.ig_token_expires_at = datetime.utcnow() - timedelta(days=1)  # уже истёк
            await db.commit()

        async with async_session_maker() as db:
            try:
                await update_ai_settings(body=AISettingsUpdate(ig_enabled=True), ctx=owner, db=db)
                assert False, "ожидался HTTPException ig_not_connected на истёкшем токене"
            except HTTPException as e:
                assert e.status_code == 400 and e.detail == "ig_not_connected", e.detail

        # ...а со свежим сроком годности тумблер включается штатно.
        async with async_session_maker() as db:
            settings = await get_or_create_ai_settings(sid, db)
            settings.ig_token_expires_at = datetime.utcnow() + timedelta(days=30)
            await db.commit()

        async with async_session_maker() as db:
            patched = await update_ai_settings(body=AISettingsUpdate(ig_enabled=True), ctx=owner, db=db)
        assert patched.ig_enabled is True

        # Ленивый рефреш: срок скоро истекает -> код пытается дёрнуть Meta с фейковым
        # токеном, сбой должен молча проглотиться (лог), а не уронить запрос и не
        # стереть старые значения.
        async with async_session_maker() as db:
            settings = await get_or_create_ai_settings(sid, db)
            settings.ig_token = "fake-token-near-expiry"
            settings.ig_token_expires_at = datetime.utcnow() + timedelta(days=5)  # < порога в 10 дней
            await db.commit()
            await _maybe_refresh_instagram_token(settings)  # не должно бросить исключение
            assert settings.ig_token == "fake-token-near-expiry"  # рефреш не удался -> значение не тронуто

        # DELETE /instagram/connection гасит все четыре поля + ig_enabled.
        async with async_session_maker() as db:
            await disconnect_instagram(ctx=owner, db=db)

        async with async_session_maker() as db:
            row = (await db.execute(
                select(StudioAISettings).where(StudioAISettings.studio_id == sid)
            )).scalar_one()
            assert row.ig_token is None
            assert row.ig_user_id is None
            assert row.ig_username is None
            assert row.ig_token_expires_at is None
            assert row.ig_enabled is False

        print("OK: test_ai_instagram")
    finally:
        await _cleanup(sid)


if __name__ == "__main__":
    asyncio.run(_run())
