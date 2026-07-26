"""Единый Telegram-бот студии: connect/disconnect пишут во все три таблицы.

Реальная БД, без сети — verify_bot_token здесь не участвует (его граничные
случаи покрыты в test_ai_agents), проверяется именно синхронность записи.
Запуск из back/:  python -m tests.test_telegram_bot_sync
"""
import asyncio
import warnings

warnings.filterwarnings("ignore")

from sqlalchemy import delete, select

from database import async_session_maker
from models import BookingChannelConfig, Studio, StudioAISettings, StudioIntegration
from services.telegram_bot import connect_telegram_bot, disconnect_telegram_bot

_TOKEN = "123456789:AAFakeTokenForAutomatedTestingPurpose00"
_USERNAME = "velora_test_bot"


async def _seed() -> int:
    async with async_session_maker() as db:
        s = Studio(name="TEST-TG-SYNC-STUDIO")
        db.add(s)
        await db.commit()
        return s.id


async def _cleanup(sid: int) -> None:
    async with async_session_maker() as db:
        await db.execute(delete(StudioAISettings).where(StudioAISettings.studio_id == sid))
        await db.execute(delete(StudioIntegration).where(StudioIntegration.studio_id == sid))
        await db.execute(delete(BookingChannelConfig).where(BookingChannelConfig.studio_id == sid))
        await db.execute(delete(Studio).where(Studio.id == sid))
        await db.commit()


async def _read(sid: int):
    async with async_session_maker() as db:
        ai = (await db.execute(
            select(StudioAISettings).where(StudioAISettings.studio_id == sid)
        )).scalar_one()
        integ = (await db.execute(
            select(StudioIntegration).where(
                StudioIntegration.studio_id == sid,
                StudioIntegration.integration_type == "tg_notify",
            )
        )).scalar_one()
        channel = (await db.execute(
            select(BookingChannelConfig).where(
                BookingChannelConfig.studio_id == sid,
                BookingChannelConfig.channel_type == "telegram",
            )
        )).scalar_one()
        return ai, integ, channel


async def _run():
    sid = await _seed()
    try:
        # Connect из любой точки создаёт недостающие строки и заполняет все три.
        async with async_session_maker() as db:
            await connect_telegram_bot(db, sid, _TOKEN, _USERNAME)

        ai, integ, channel = await _read(sid)
        assert ai.tg_token == _TOKEN and ai.tg_username == _USERNAME, "AI: токен не записан"
        assert ai.tg_enabled is False, "AI: подключение бота не должно само включать авто-ответчик"
        assert integ.is_connected is True, "Уведомления: канал не подключён"
        assert integ.config == {"token": _TOKEN, "bot_username": _USERNAME}, integ.config
        assert channel.is_active is True, "Онлайн-запись: канал не активирован"
        assert channel.config == {"token": _TOKEN, "bot_username": _USERNAME}, channel.config
        assert channel.connected_at is not None, "Онлайн-запись: connected_at не проставлен"

        # Тумблер авто-ответчика включён вручную — disconnect обязан его погасить.
        async with async_session_maker() as db:
            ai = (await db.execute(
                select(StudioAISettings).where(StudioAISettings.studio_id == sid)
            )).scalar_one()
            ai.tg_enabled = True
            await db.commit()

        async with async_session_maker() as db:
            await disconnect_telegram_bot(db, sid)

        ai, integ, channel = await _read(sid)
        assert ai.tg_token is None and ai.tg_username is None, "AI: токен остался после отключения"
        assert ai.tg_enabled is False, "AI: авто-ответчик остался включённым без токена"
        assert integ.is_connected is False and integ.config is None, "Уведомления: не отключено"
        assert channel.is_active is False and channel.config is None, "Онлайн-запись: не отключено"
        assert channel.connected_at is None, "Онлайн-запись: connected_at не сброшен"

        # Disconnect идемпотентен — повторный вызов на чистой студии не падает.
        async with async_session_maker() as db:
            await disconnect_telegram_bot(db, sid)

        print("OK: test_telegram_bot_sync")
    finally:
        await _cleanup(sid)


if __name__ == "__main__":
    asyncio.run(_run())
