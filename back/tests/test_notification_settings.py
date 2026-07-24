"""EPIC N-6 задача 2: контракт GET/PATCH /settings/notifications — короткие ключи
(telegram, email, ...), не колонки ORM (*_notifications). Реальная БД, ручная чистка.
Запуск из back/:  python -m tests.test_notification_settings
"""
import asyncio
import warnings

warnings.filterwarnings("ignore")

from sqlalchemy import delete

from database import async_session_maker
from dependencies import StudioContext
from models import Studio, StudioNotificationSettings
from routers.settings.notifications import (
    router as notifications_router,
    get_notification_settings,
    update_notification_settings,
)
from schemas.settings.notifications import NotificationSettingsRead, NotificationSettingsUpdate


async def _seed() -> int:
    async with async_session_maker() as db:
        s = Studio(name="TEST-NOTIFICATION-SETTINGS-STUDIO")
        db.add(s)
        await db.commit()
        return s.id


async def _cleanup(sid: int) -> None:
    async with async_session_maker() as db:
        await db.execute(delete(StudioNotificationSettings).where(StudioNotificationSettings.studio_id == sid))
        await db.execute(delete(Studio).where(Studio.id == sid))
        await db.commit()


async def _run():
    # Контракт роута: FastAPI сериализует response_model с by_alias=True по умолчанию —
    # без явного response_model_by_alias=False ответ уехал бы как telegram_notifications.
    routes = {(r.path, m): r for r in notifications_router.routes for m in r.methods}
    assert routes[("/notifications", "GET")].response_model_by_alias is False
    assert routes[("/notifications", "PATCH")].response_model_by_alias is False

    sid = await _seed()
    try:
        owner = StudioContext(user=None, studio_id=sid, role="owner")

        # PATCH коротким ключом. Роут возвращает ORM-объект (FastAPI сериализует его
        # через response_model только на реальном HTTP-запросе) — колонка модели
        # осталась telegram_notifications, проверяем персист по ней.
        async with async_session_maker() as db:
            patched = await update_notification_settings(
                body=NotificationSettingsUpdate(telegram=False), ctx=owner, db=db,
            )
        assert patched.telegram_notifications is False, patched.telegram_notifications

        # Регресс исходного бага: значение переживает новый GET (эмулирует F5).
        async with async_session_maker() as db:
            r = await get_notification_settings(ctx=owner, db=db)
        assert r.telegram_notifications is False, r.telegram_notifications
        assert r.email_notifications is True  # дефолт остальных каналов не тронут

        # Контракт сериализации: то, что реально уедет клиенту при
        # response_model_by_alias=False — короткие ключи, без *_notifications.
        body = NotificationSettingsRead.model_validate(r).model_dump(by_alias=False)
        assert body["telegram"] is False, body
        assert "telegram_notifications" not in body, body

        print("OK: test_notification_settings")
    finally:
        await _cleanup(sid)


if __name__ == "__main__":
    asyncio.run(_run())
