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
from models import Studio, StudioAISettings, StudioIntegration
from routers.ai.instagram import _decode_state, disconnect_instagram
from routers.ai.settings import update_ai_settings
from schemas.ai import AISettingsUpdate
from services.assistant import _maybe_refresh_instagram_token, get_or_create_ai_settings
from services.instagram_account import connect_instagram_account


async def _seed() -> int:
    async with async_session_maker() as db:
        s = Studio(name="TEST-AI-INSTAGRAM-STUDIO")
        db.add(s)
        await db.commit()
        return s.id


async def _cleanup(sid: int) -> None:
    async with async_session_maker() as db:
        await db.execute(delete(StudioAISettings).where(StudioAISettings.studio_id == sid))
        await db.execute(delete(StudioIntegration).where(StudioIntegration.studio_id == sid))
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
        assert _decode_state(good_state) == (sid, "/dashboard/ai")

        # back из белого списка доезжает до callback; чужой путь схлопывается в дефолт,
        # иначе callback становится открытым редиректом.
        from_notifications = jwt.encode(
            {"studio_id": sid, "purpose": "ig_oauth", "back": "notifications",
             "exp": datetime.utcnow() + timedelta(minutes=10)},
            SECRET_KEY, algorithm=ALGORITHM,
        )
        assert _decode_state(from_notifications) == (sid, "/dashboard/notifications")
        evil = jwt.encode(
            {"studio_id": sid, "purpose": "ig_oauth", "back": "https://evil.example.com",
             "exp": datetime.utcnow() + timedelta(minutes=10)},
            SECRET_KEY, algorithm=ALGORITHM,
        )
        assert _decode_state(evil) == (sid, "/dashboard/ai")

        # неверный purpose -> отвергнут, даже если подпись верна.
        wrong_purpose = jwt.encode(
            {"studio_id": sid, "purpose": "something_else", "exp": datetime.utcnow() + timedelta(minutes=10)},
            SECRET_KEY, algorithm=ALGORITHM,
        )
        assert _decode_state(wrong_purpose)[0] is None

        # просроченный state -> отвергнут.
        expired = jwt.encode(
            {"studio_id": sid, "purpose": "ig_oauth", "exp": datetime.utcnow() - timedelta(minutes=1)},
            SECRET_KEY, algorithm=ALGORITHM,
        )
        assert _decode_state(expired)[0] is None

        # мусор/пусто -> отвергнут, не 500.
        assert _decode_state("garbage.not.a.jwt")[0] is None
        assert _decode_state(None)[0] is None

        # Подключение аккаунта видно сразу и в канале Уведомлений (ig_dm), одним
        # вызовом — это и есть «подключил в AI, доступно в сообщениях».
        async with async_session_maker() as db:
            await connect_instagram_account(
                db, sid, token="fake-long-lived-token", ig_user_id="17841400000000000",
                username="test_studio", expires_at=datetime.utcnow() + timedelta(days=60),
            )

        async with async_session_maker() as db:
            integ = (await db.execute(select(StudioIntegration).where(
                StudioIntegration.studio_id == sid, StudioIntegration.integration_type == "ig_dm",
            ))).scalar_one()
            assert integ.is_connected is True
            assert integ.config["token"] == "fake-long-lived-token"
            assert integ.config["ig_user_id"] == "17841400000000000"
            assert integ.config["api"] == "instagram_login"  # -> graph.instagram.com в notifier
            # Тумблер авто-ответчика подключение НЕ включает.
            ai = (await db.execute(select(StudioAISettings).where(StudioAISettings.studio_id == sid))).scalar_one()
            assert ai.ig_enabled is False and ai.ig_username == "test_studio"

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
            await _maybe_refresh_instagram_token(settings, db)  # не должно бросить исключение
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
            # ...и заодно гасит канал Уведомлений — токенов-сирот не остаётся.
            integ = (await db.execute(select(StudioIntegration).where(
                StudioIntegration.studio_id == sid, StudioIntegration.integration_type == "ig_dm",
            ))).scalar_one()
            assert integ.is_connected is False and integ.config is None

        print("OK: test_ai_instagram")
    finally:
        await _cleanup(sid)


if __name__ == "__main__":
    asyncio.run(_run())
