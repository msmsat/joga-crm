"""Единый Instagram-аккаунт студии: одно подключение на все поверхности CRM.

Аккаунт физически лежит в двух таблицах — StudioAISettings (авто-ответчик Velora AI,
подключается по OAuth на странице AI) и StudioIntegration/ig_dm (канал Уведомлений
и карточка в Настройках → Интеграции). Раньше каждая страница писала только в свою:
подключённый в AI инстаграм не появлялся в Уведомлениях, там его приходилось
подключать вторым, отдельным токеном, а «Отключить» в одном месте оставляло живой
токен-сироту в другом. Всё подключение/отключение теперь идёт только через этот
модуль — как у Telegram-бота (services/telegram_bot.py), одной транзакцией.

`api` в config различает две несовместимые версии Graph API: токен из OAuth на
странице AI («Instagram API with Instagram Login») ходит на graph.instagram.com,
токен, введённый руками в Уведомлениях («…with Facebook Login») — на
graph.facebook.com. По нему выбирает хост services/notifier._send_instagram;
у старых строк ключа нет — это facebook_login, как и было до появления OAuth.
"""
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import StudioIntegration
from services.assistant import get_or_create_ai_settings

IG_LOGIN_API = "instagram_login"
FB_LOGIN_API = "facebook_login"


async def _get_or_create_dm_integration(db: AsyncSession, studio_id: int) -> StudioIntegration:
    row = (await db.execute(
        select(StudioIntegration).where(
            StudioIntegration.studio_id == studio_id,
            StudioIntegration.integration_type == "ig_dm",
        )
    )).scalar_one_or_none()
    if row is None:
        row = StudioIntegration(studio_id=studio_id, integration_type="ig_dm")
        db.add(row)
        await db.flush()
    return row


async def write_dm_integration(
    db: AsyncSession, studio_id: int, *, token: str, ig_user_id: str, username: str | None, api: str,
) -> None:
    """Реквизиты аккаунта в StudioIntegration/ig_dm. НЕ коммитит — зовётся и из
    ленивого рефреша токена (services/assistant), у которого своя транзакция."""
    integ = await _get_or_create_dm_integration(db, studio_id)
    integ.is_connected = True
    integ.config = {"token": token, "ig_user_id": ig_user_id, "username": username, "api": api}


async def connect_instagram_account(
    db: AsyncSession, studio_id: int, *, token: str, ig_user_id: str, username: str | None,
    expires_at: datetime | None = None, api: str = IG_LOGIN_API,
) -> None:
    """Проставляет аккаунт в обе таблицы. Коммитит сам.

    expires_at известен только у Instagram Login (long-lived ~60 дней); у ручного
    токена Facebook Login срока нет — None, и гейт тумблера его не требует.
    """
    ai = await get_or_create_ai_settings(studio_id, db)
    ai.ig_token = token
    ai.ig_user_id = ig_user_id
    ai.ig_username = username
    ai.ig_token_expires_at = expires_at
    # ig_enabled не трогаем: это отдельный тумблер авто-ответчика, подключение
    # аккаунта не должно само начать отвечать клиентам от имени AI.

    await write_dm_integration(db, studio_id, token=token, ig_user_id=ig_user_id, username=username, api=api)
    await db.commit()


async def disconnect_instagram_account(db: AsyncSession, studio_id: int) -> None:
    """Стирает аккаунт из обеих таблиц. Коммитит сам."""
    ai = await get_or_create_ai_settings(studio_id, db)
    ai.ig_token = None
    ai.ig_user_id = None
    ai.ig_username = None
    ai.ig_token_expires_at = None
    ai.ig_enabled = False

    integ = await _get_or_create_dm_integration(db, studio_id)
    integ.is_connected = False
    integ.config = None

    await db.commit()
