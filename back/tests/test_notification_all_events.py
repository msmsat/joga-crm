"""Сквозная приёмка всех 38 событий каталога: «включено — уходит, выключено — молчит».

Отдельно от tests/test_notification_resolver.py: там проверяется ЛОГИКА резолвера
на нескольких показательных событиях, здесь — КАЖДОЕ событие каталога прогоняется
через полный контракт. Разъедется каталог с резолвером (новое событие, смена tier,
канал не из ROLE_CHANNELS) — падает тут, а не у студии в проде.

Контракт, который проверяем для каждого event_id (см. notification_resolver):

  1. Всё подключено и включено, матрица не тронута
        -> ровно default_channels, forced=False, набор непустой
  2. Владелец снял ВСЕ галки события в матрице
        -> пусто у ЛЮБОГО тира: выключено значит выключено, форс-фолбэка нет
  3. Владелец выключил все каналы глобальными тумблерами
        -> пусто и forced=False у ЛЮБОГО тира: рубильник канала сильнее гарантии

Ничего не отправляет — только резолвит каналы. Ни SMTP, ни Graph API не трогает,
поэтому безопасен для повторных прогонов (ср. tests/test_notifier.py).

Запуск из back/:  python -m tests.test_notification_all_events
"""
import asyncio
import warnings

warnings.filterwarnings("ignore")

from sqlalchemy import delete

from database import async_session_maker
from models import NotificationEventToggle, Studio, StudioIntegration, StudioNotificationSettings
from services.notification_catalog import CATALOG, ROLE_CHANNELS
from services.notification_resolver import resolve_channels
from services.notifier import NOTIFY_CHANNELS

_STUDIO_NAME = "TEST-NOTIF-ALL-EVENTS"
# Канал -> integration_type, который делает его «подключённым» (см. резолвер).
_INTEGRATIONS = ("tg_notify", "wa_notify")  # ig_dm — не канал уведомлений (см. notifier.py)


async def _seed() -> int:
    """Студия, у которой подключено и включено ВСЁ — чтобы ни один канал не
    отсекался по причинам, к матрице отношения не имеющим."""
    async with async_session_maker() as db:
        studio = Studio(name=_STUDIO_NAME)
        db.add(studio)
        await db.commit()
        db.add(StudioNotificationSettings(
            studio_id=studio.id,
            **{f"{ch}_notifications": True for ch in NOTIFY_CHANNELS},
        ))
        db.add_all([
            StudioIntegration(studio_id=studio.id, integration_type=kind, is_connected=True)
            for kind in _INTEGRATIONS
        ])
        await db.commit()
        return studio.id


async def _cleanup(studio_id: int) -> None:
    async with async_session_maker() as db:
        await db.execute(delete(NotificationEventToggle).where(NotificationEventToggle.studio_id == studio_id))
        await db.execute(delete(StudioIntegration).where(StudioIntegration.studio_id == studio_id))
        await db.execute(delete(StudioNotificationSettings).where(StudioNotificationSettings.studio_id == studio_id))
        await db.execute(delete(Studio).where(Studio.id == studio_id))
        await db.commit()


async def _set_all_toggles(studio_id: int, role: str, event_id: str, is_enabled: bool) -> None:
    """Явная строка матрицы на КАЖДЫЙ канал — так владелец гасит событие целиком."""
    async with async_session_maker() as db:
        await db.execute(delete(NotificationEventToggle).where(
            NotificationEventToggle.studio_id == studio_id,
            NotificationEventToggle.event_id == event_id,
        ))
        db.add_all([
            NotificationEventToggle(
                studio_id=studio_id, role=role, event_id=event_id,
                channel_key=ch, is_enabled=is_enabled,
            )
            for ch in NOTIFY_CHANNELS
        ])
        await db.commit()


async def _clear_toggles(studio_id: int, event_id: str) -> None:
    async with async_session_maker() as db:
        await db.execute(delete(NotificationEventToggle).where(
            NotificationEventToggle.studio_id == studio_id,
            NotificationEventToggle.event_id == event_id,
        ))
        await db.commit()


async def _set_global(studio_id: int, is_enabled: bool) -> None:
    async with async_session_maker() as db:
        settings = (await db.execute(
            StudioNotificationSettings.__table__.select().where(
                StudioNotificationSettings.studio_id == studio_id
            )
        )).first()
        assert settings is not None, "строка настроек должна быть засеяна"
        await db.execute(
            StudioNotificationSettings.__table__.update()
            .where(StudioNotificationSettings.studio_id == studio_id)
            .values(**{f"{ch}_notifications": is_enabled for ch in NOTIFY_CHANNELS})
        )
        await db.commit()


async def _resolve(studio_id: int, role: str, event_id: str) -> tuple[set[str], bool]:
    async with async_session_maker() as db:
        return await resolve_channels(db, studio_id, role, event_id, None)


async def _run() -> None:
    studio_id = await _seed()
    failures: list[str] = []

    def check(event_id: str, case: str, got, want) -> None:
        if got != want:
            failures.append(f"{event_id} [{case}]: получено {got}, ожидалось {want}")

    try:
        # ── 1. Включено: ровно default_channels ──────────────────────────────
        for event_id, spec in CATALOG.items():
            want = set(spec.default_channels) & ROLE_CHANNELS[spec.role]
            got = await _resolve(studio_id, spec.role, event_id)
            check(event_id, "включено", got, (want, False))
            if not want:
                failures.append(f"{event_id}: пустой default_channels — событие немо по умолчанию")
        print(f"OK: 1/3 включено -> default_channels ({len(CATALOG)} событий)")

        # ── 2. Все галки события сняты ───────────────────────────────────────
        # Тир роли не играет: снятая галка обязана что-то значить у всех, включая
        # critical. Форс-фолбэк убран 06.08.2026 — раньше здесь ждали {email}.
        for event_id, spec in CATALOG.items():
            await _set_all_toggles(studio_id, spec.role, event_id, False)
            got = await _resolve(studio_id, spec.role, event_id)
            check(event_id, f"матрица off ({spec.tier})", got, (set(), False))
            await _clear_toggles(studio_id, event_id)
        print("OK: 2/3 матрица выключена -> тишина у всех тиров, включая critical")

        # ── 3. Глобальные тумблеры каналов выключены ─────────────────────────
        await _set_global(studio_id, False)
        for event_id, spec in CATALOG.items():
            got = await _resolve(studio_id, spec.role, event_id)
            check(event_id, "глобально off", got, (set(), False))
        await _set_global(studio_id, True)
        print("OK: 3/3 глобальный рубильник гасит всё, включая critical")

        # ── 4. Чужая роль не получает событие ────────────────────────────────
        for event_id, spec in CATALOG.items():
            other = "owner" if spec.role != "owner" else "client"
            got = await _resolve(studio_id, other, event_id)
            check(event_id, f"чужая роль {other}", got, (set(), False))
        print("OK: 4/4 событие не резолвится для чужой роли")

        assert not failures, "нарушен контракт «включено -> уходит, выключено -> молчит»:\n" + "\n".join(failures)
    finally:
        await _cleanup(studio_id)


def test_all_events_respect_toggles() -> None:
    asyncio.run(_run())


if __name__ == "__main__":
    test_all_events_respect_toggles()
    print(f"ALL PASS — все {len(CATALOG)} событий каталога уважают тумблеры")
