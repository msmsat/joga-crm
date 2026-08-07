"""EPIC N-6 задача 2: контракт GET/PATCH /settings/notifications — короткие ключи
(telegram, email, ...), не колонки ORM (*_notifications). Реальная БД, ручная чистка.
Запуск из back/:  python -m tests.test_notification_settings
"""
import asyncio
import warnings

warnings.filterwarnings("ignore")

from fastapi import HTTPException
from sqlalchemy import delete

from database import async_session_maker
from dependencies import StudioContext
from models import Studio, StudioIntegration, StudioNotificationSettings
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
        await db.execute(delete(StudioIntegration).where(StudioIntegration.studio_id == sid))
        await db.execute(delete(StudioNotificationSettings).where(StudioNotificationSettings.studio_id == sid))
        await db.execute(delete(Studio).where(Studio.id == sid))
        await db.commit()


async def _set_wa_config(sid: int, config: dict) -> None:
    """Подключённый номер с заданным состоянием проверок Meta. Токена нет, поэтому
    живые запросы к Graph внутри гейта возвращаются None и сохранённые значения
    остаются нетронутыми — решение принимается ровно по этому config."""
    async with async_session_maker() as db:
        integ = StudioIntegration(
            studio_id=sid, integration_type="wa_notify", is_connected=True, config=config,
        )
        await db.execute(delete(StudioIntegration).where(StudioIntegration.studio_id == sid))
        db.add(integ)
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

        # ─── Гейт включения WhatsApp: три барьера Meta ────────────────────────
        # Включить канал можно только когда сняты ВСЕ ТРИ; иначе доставка ноль, а
        # зелёный тумблер обещает рассылку, которой нет. Барьер называем первый
        # неснятый — по нему интерфейс показывает, что делать дальше.
        for config, expected in (
            ({}, "wa_payment_required"),
            ({"payment_connected": True}, "wa_verification_required"),
            ({"payment_connected": True, "business_verified": True}, "wa_templates_pending"),
            ({"payment_connected": True, "business_verified": True,
              "templates_status": {"vlr_c1:ru": "PENDING"}}, "wa_templates_pending"),
        ):
            await _set_wa_config(sid, config)
            async with async_session_maker() as db:
                try:
                    await update_notification_settings(
                        body=NotificationSettingsUpdate(whatsapp=True), ctx=owner, db=db,
                    )
                    raise AssertionError(f"ожидали 409 {expected} при config={config}")
                except HTTPException as e:
                    assert (e.status_code, e.detail) == (409, expected), (e.status_code, e.detail, config)
        print("OK: включение WhatsApp -> 409 на каждом неснятом барьере Meta")

        # Все три сняты — тумблер включается.
        await _set_wa_config(sid, {
            "payment_connected": True, "business_verified": True,
            "templates_status": {"vlr_c1:ru": "APPROVED", "vlr_c1:en": "PENDING"},
        })
        async with async_session_maker() as db:
            patched = await update_notification_settings(
                body=NotificationSettingsUpdate(whatsapp=True), ctx=owner, db=db,
            )
        assert patched.whatsapp_notifications is True, patched.whatsapp_notifications
        print("OK: все барьеры сняты -> WhatsApp включается")

        # ВЫКЛЮЧИТЬ можно всегда, даже когда барьеры вернулись: запрет на
        # включение не должен превращаться в ловушку.
        await _set_wa_config(sid, {})
        async with async_session_maker() as db:
            patched = await update_notification_settings(
                body=NotificationSettingsUpdate(whatsapp=False), ctx=owner, db=db,
            )
        assert patched.whatsapp_notifications is False, patched.whatsapp_notifications
        print("OK: выключение WhatsApp гейт не трогает")

        print("OK: test_notification_settings")
    finally:
        await _cleanup(sid)


if __name__ == "__main__":
    asyncio.run(_run())
