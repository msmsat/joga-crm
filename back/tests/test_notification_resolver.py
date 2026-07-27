"""EPIC 3, Задача 2: резолвер каналов доставки (resolve_channels). Реальная БД,
ручная чистка. Запуск из back/:  python -m tests.test_notification_resolver
"""
import asyncio
import warnings

warnings.filterwarnings("ignore")

from sqlalchemy import delete

from database import async_session_maker
from models import NotificationEventToggle, Studio, StudioIntegration, StudioNotificationSettings, User, UserNotificationPreference
from services.notification_resolver import resolve_channels


async def _seed() -> tuple[int, int]:
    async with async_session_maker() as db:
        studio = Studio(name="TEST-NOTIF-RESOLVER")
        user = User(email="resolver-test@example.com", hashed_password="x", name="Resolver Test")
        db.add_all([studio, user])
        await db.commit()
        return studio.id, user.id


async def _cleanup(studio_id: int, user_id: int) -> None:
    async with async_session_maker() as db:
        await db.execute(delete(UserNotificationPreference).where(UserNotificationPreference.user_id == user_id))
        await db.execute(delete(NotificationEventToggle).where(NotificationEventToggle.studio_id == studio_id))
        await db.execute(delete(StudioIntegration).where(StudioIntegration.studio_id == studio_id))
        await db.execute(delete(StudioNotificationSettings).where(StudioNotificationSettings.studio_id == studio_id))
        await db.execute(delete(Studio).where(Studio.id == studio_id))
        await db.execute(delete(User).where(User.id == user_id))
        await db.commit()


async def _run():
    studio_id, user_id = await _seed()
    try:
        # 1) Совсем свежая студия: ни StudioNotificationSettings, ни матрицы —
        #    critical всё равно уходит через forced-фолбэк (Guaranteed Delivery).
        async with async_session_maker() as db:
            channels, forced = await resolve_channels(db, studio_id, "client", "c3", None)
        assert forced is True, (channels, forced)
        assert channels == {"email"}, channels
        print("OK: fresh studio critical -> forced fallback")

        # 2) Добавляем настройки (дефолты True/True/True) — c1 (operational,
        #    default email+telegram) без строк матрицы = default_channels,
        #    но telegram не подключён (нет StudioIntegration) -> отфильтрован.
        async with async_session_maker() as db:
            db.add(StudioNotificationSettings(studio_id=studio_id))
            await db.commit()
        async with async_session_maker() as db:
            channels, forced = await resolve_channels(db, studio_id, "client", "c1", None)
        assert forced is False, (channels, forced)
        assert channels == {"email"}, channels
        print("OK: operational default minus unconnected telegram")

        # 3) Подключаем telegram -> c1 отдаёт оба канала из default_channels.
        async with async_session_maker() as db:
            db.add(StudioIntegration(studio_id=studio_id, integration_type="tg_notify", is_connected=True))
            await db.commit()
        async with async_session_maker() as db:
            channels, forced = await resolve_channels(db, studio_id, "client", "c1", None)
        assert channels == {"email", "telegram"}, channels
        print("OK: connected telegram included")

        # 4) Матрица явно выключает email для c1 -> остаётся только telegram.
        async with async_session_maker() as db:
            db.add(NotificationEventToggle(studio_id=studio_id, role="client", event_id="c1", channel_key="email", is_enabled=False))
            await db.commit()
        async with async_session_maker() as db:
            channels, forced = await resolve_channels(db, studio_id, "client", "c1", None)
        assert channels == {"telegram"}, channels
        print("OK: studio matrix override removes default channel")

        # 5) critical (c3) игнорирует матрицу и личный слой — email+telegram
        #    из default_channels, оба подключены/включены глобально.
        async with async_session_maker() as db:
            channels, forced = await resolve_channels(db, studio_id, "client", "c3", None)
        assert forced is False, (channels, forced)
        assert channels == {"email", "telegram"}, channels
        print("OK: critical ignores matrix override")

        # 6) optional-событие тренера (t8, default_channels=()) без строк
        #    матрицы/личных настроек -> ничего не включено (пусто, не forced).
        async with async_session_maker() as db:
            channels, forced = await resolve_channels(db, studio_id, "trainer", "t8", user_id)
        assert channels == set() and forced is False, (channels, forced)
        print("OK: optional with empty default stays empty, not forced")

        # 7) Владелец включает t8 по email в студийной матрице -> доходит.
        async with async_session_maker() as db:
            db.add(NotificationEventToggle(studio_id=studio_id, role="trainer", event_id="t8", channel_key="email", is_enabled=True))
            await db.commit()
        async with async_session_maker() as db:
            channels, forced = await resolve_channels(db, studio_id, "trainer", "t8", user_id)
        assert channels == {"email"}, channels
        print("OK: studio matrix turns optional event on")

        # 8) Личный слой сужает: сотрудник лично выключил email у t8 -> пусто,
        #    несмотря на то что студия его включила.
        async with async_session_maker() as db:
            db.add(UserNotificationPreference(user_id=user_id, event_id="t8", channel_key="email", is_enabled=False))
            await db.commit()
        async with async_session_maker() as db:
            channels, forced = await resolve_channels(db, studio_id, "trainer", "t8", user_id)
        assert channels == set(), channels
        print("OK: personal layer narrows optional event")

        # 9) Другой сотрудник (без личной настройки) по-прежнему получает t8 —
        #    личный слой одного тренера не бьёт по остальным.
        async with async_session_maker() as db:
            channels, forced = await resolve_channels(db, studio_id, "trainer", "t8", None)
        assert channels == {"email"}, channels
        print("OK: personal layer is per-user, not studio-wide")

        # 10) Неизвестный event_id или чужая роль -> пусто, не forced.
        async with async_session_maker() as db:
            channels, forced = await resolve_channels(db, studio_id, "client", "__unknown__", None)
        assert (channels, forced) == (set(), False), (channels, forced)
        async with async_session_maker() as db:
            channels, forced = await resolve_channels(db, studio_id, "trainer", "c1", None)  # c1 — событие клиента
        assert (channels, forced) == (set(), False), (channels, forced)
        print("OK: unknown event_id / role mismatch resolve to empty")

        print("ALL PASS — EPIC 3 Задача 2: notification_resolver")
    finally:
        await _cleanup(studio_id, user_id)


def test_resolve_channels():
    asyncio.run(_run())


if __name__ == "__main__":
    test_resolve_channels()
