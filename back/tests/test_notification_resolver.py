"""EPIC 3, Задача 2: резолвер каналов доставки (resolve_channels). Реальная БД,
ручная чистка. Запуск из back/:  python -m tests.test_notification_resolver
"""
import asyncio
import warnings

warnings.filterwarnings("ignore")

from sqlalchemy import delete, update

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
        #    глобальный слой берётся из дефолтов модели (а не «всё выключено»),
        #    поэтому critical уходит по-настоящему, без forced-фолбэка. Telegram
        #    отфильтрован только потому, что бот ещё не подключён.
        async with async_session_maker() as db:
            channels, forced = await resolve_channels(db, studio_id, "client", "c3", None)
        assert forced is False, (channels, forced)
        assert channels == {"email"}, channels
        print("OK: fresh studio falls back to model defaults, not silence")

        # 2) Явная строка настроек ничего не меняет — те же дефолты; c1
        #    (operational, default email+telegram) без строк матрицы =
        #    default_channels, но telegram не подключён -> отфильтрован.
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

        # 5) critical (c3) без правок матрицы — email+telegram из default_channels,
        #    оба подключены и включены глобально.
        async with async_session_maker() as db:
            channels, forced = await resolve_channels(db, studio_id, "client", "c3", None)
        assert forced is False, (channels, forced)
        assert channels == {"email", "telegram"}, channels
        print("OK: critical без правок -> default_channels")

        # 5b) Замков в матрице нет: владелец гасит email у critical — и это
        #     учитывается, остаётся telegram.
        async with async_session_maker() as db:
            db.add(NotificationEventToggle(studio_id=studio_id, role="client", event_id="c3", channel_key="email", is_enabled=False))
            await db.commit()
        async with async_session_maker() as db:
            channels, forced = await resolve_channels(db, studio_id, "client", "c3", None)
        assert channels == {"telegram"} and forced is False, (channels, forced)
        print("OK: critical учитывает матрицу (локов нет)")

        # 5c) Выключить ВСЁ можно и у critical — будет тишина. Форс-фолбэка нет
        #     (решение владельца продукта 06.08.2026): снятая галка обязана
        #     что-то значить, иначе тумблер врёт. Гарантия доставки держится на
        #     дефолтах (email во всех default_channels), а не на обходе настроек.
        async with async_session_maker() as db:
            db.add(NotificationEventToggle(studio_id=studio_id, role="client", event_id="c3", channel_key="telegram", is_enabled=False))
            await db.commit()
        async with async_session_maker() as db:
            channels, forced = await resolve_channels(db, studio_id, "client", "c3", None)
        assert channels == set() and forced is False, (channels, forced)
        print("OK: critical выключен целиком -> тишина, без форс-фолбэка")

        # Возвращаем c3 в исходное, чтобы не влиять на шаги ниже.
        async with async_session_maker() as db:
            await db.execute(delete(NotificationEventToggle).where(
                NotificationEventToggle.studio_id == studio_id, NotificationEventToggle.event_id == "c3",
            ))
            await db.commit()

        # 6) optional-событие (t8) владелец гасит целиком -> пусто и НЕ forced:
        #    единственный тир, где «не слать вообще» — легальный исход. У
        #    critical/operational пустой набор превратился бы в forced-фолбэк.
        async with async_session_maker() as db:
            db.add_all([
                NotificationEventToggle(studio_id=studio_id, role="trainer", event_id="t8",
                                        channel_key=ch, is_enabled=False)
                for ch in ("email", "telegram")
            ])
            await db.commit()
        async with async_session_maker() as db:
            channels, forced = await resolve_channels(db, studio_id, "trainer", "t8", user_id)
        assert channels == set() and forced is False, (channels, forced)
        print("OK: optional turned off completely stays empty, not forced")

        # 7) Владелец возвращает email у t8 (снимает своё же выключение) ->
        #    канал снова берётся из default_channels и событие доходит.
        async with async_session_maker() as db:
            await db.execute(delete(NotificationEventToggle).where(
                NotificationEventToggle.studio_id == studio_id,
                NotificationEventToggle.event_id == "t8",
                NotificationEventToggle.channel_key == "email",
            ))
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

        # 9b) Канал не подключён — не шлём в него НИЧЕГО, что бы ни стояло в
        #     матрице и в глобальных тумблерах. Отключаем бота обратно и
        #     проверяем все три тира: галка telegram остаётся стоять (она ждёт
        #     подключения), но в набор каналов telegram не попадает ни разу.
        async with async_session_maker() as db:
            await db.execute(delete(StudioIntegration).where(StudioIntegration.studio_id == studio_id))
            await db.execute(delete(NotificationEventToggle).where(NotificationEventToggle.studio_id == studio_id))
            db.add_all([
                NotificationEventToggle(studio_id=studio_id, role=role, event_id=eid,
                                        channel_key="telegram", is_enabled=True)
                for role, eid in (("client", "c1"), ("client", "c3"), ("client", "c5"))
            ])
            await db.commit()
        for eid, tier in (("c1", "operational"), ("c3", "critical"), ("c5", "optional")):
            async with async_session_maker() as db:
                channels, _ = await resolve_channels(db, studio_id, "client", eid, None)
            assert "telegram" not in channels, (eid, tier, channels)
        print("OK: неподключённый канал не получает ничего ни в одном тире")

        # 9c) Персоналу telegram не доставить структурно, даже если бот подключён,
        #     глобально включён И явно проставлен в матрице для тренера —
        #     ROLE_CHANNELS режет его раньше, чем дело доходит до подключения/
        #     матрицы. Заодно подключаем whatsapp — она для персонала легальна и
        #     должна остаться в наборе, показывая, что фильтр бьёт точечно, не
        #     гасит все каналы подряд.
        async with async_session_maker() as db:
            db.add_all([
                StudioIntegration(studio_id=studio_id, integration_type="tg_notify", is_connected=True),
                StudioIntegration(studio_id=studio_id, integration_type="wa_notify", is_connected=True),
                NotificationEventToggle(studio_id=studio_id, role="trainer", event_id="t1",
                                        channel_key="telegram", is_enabled=True),
            ])
            await db.commit()
        async with async_session_maker() as db:
            channels, forced = await resolve_channels(db, studio_id, "trainer", "t1", None)
        assert channels == {"email", "whatsapp"}, channels  # t1 default_channels теперь email+whatsapp
        assert "telegram" not in channels, channels
        print("OK: telegram недостижим для персонала, даже если бот подключён и матрица включает его")

        # 9d) Репорт пользователя: выключил email, оставил только telegram —
        #     клиенту телеграм пришёл верно, а тренеру ВСЁ РАВНО пришло письмо,
        #     хотя email был явно выключен. Причина — форс-фолбэк слал в email
        #     безусловно, не проверяя enabled_global. Воспроизводим ровно этот
        #     расклад: email и whatsapp выключены глобально, telegram включён
        #     (но тренеру недоступен структурно, см. 9c).
        async with async_session_maker() as db:
            await db.execute(update(StudioNotificationSettings).where(
                StudioNotificationSettings.studio_id == studio_id,
            ).values(email_notifications=False, whatsapp_notifications=False, telegram_notifications=True))
            await db.commit()

        # Клиенту (c1: email+telegram) — телеграм по-прежнему уходит, email нет.
        async with async_session_maker() as db:
            channels, forced = await resolve_channels(db, studio_id, "client", "c1", None)
        assert channels == {"telegram"} and forced is False, (channels, forced)

        # Тренеру (t1: email+whatsapp, telegram недоступен роли) — оба канала
        # выключены, форс-фолбэк на email СЕЙЧАС ТОЖЕ должен молчать: email
        # выключен явно, слать в него — не подстраховка, а игнор настроек.
        async with async_session_maker() as db:
            channels, forced = await resolve_channels(db, studio_id, "trainer", "t1", None)
        assert channels == set() and forced is False, (channels, forced)
        print("OK: явно выключенный email не используется даже как форс-фолбэк (репорт пользователя)")

        # Возвращаем email обратно, чтобы не влиять на шаги ниже.
        async with async_session_maker() as db:
            await db.execute(update(StudioNotificationSettings).where(
                StudioNotificationSettings.studio_id == studio_id,
            ).values(email_notifications=True, whatsapp_notifications=True))
            await db.commit()

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
