"""EPIC 3, Задача 3: GET /matrix, ужесточённые PATCH /events(/bulk), GET/PATCH /me.
Реальная БД, ручная чистка. Запуск из back/:  python -m tests.test_notification_matrix_endpoints
"""
import asyncio
import warnings

warnings.filterwarnings("ignore")

from fastapi import HTTPException
from sqlalchemy import delete, select

from database import async_session_maker
from dependencies import StudioContext
from models import NotificationEventToggle, Studio, User, UserNotificationPreference
from routers.settings.notifications import (
    get_notification_matrix,
    upsert_event_toggle,
    bulk_upsert_event_toggles,
    get_my_notification_prefs,
    update_my_notification_pref,
)
from schemas.settings.notifications import EventToggle, EventToggleBulkUpdate, UserPrefUpdate


async def _seed() -> tuple[int, int]:
    async with async_session_maker() as db:
        studio = Studio(name="TEST-NOTIF-MATRIX-ENDPOINTS")
        user = User(email="matrix-endpoints@example.com", hashed_password="x", name="Matrix Test")
        db.add_all([studio, user])
        await db.commit()
        return studio.id, user.id


async def _cleanup(studio_id: int, user_id: int) -> None:
    async with async_session_maker() as db:
        await db.execute(delete(UserNotificationPreference).where(UserNotificationPreference.user_id == user_id))
        await db.execute(delete(NotificationEventToggle).where(NotificationEventToggle.studio_id == studio_id))
        await db.execute(delete(Studio).where(Studio.id == studio_id))
        await db.execute(delete(User).where(User.id == user_id))
        await db.commit()


async def _run():
    studio_id, user_id = await _seed()
    try:
        owner = StudioContext(user=None, studio_id=studio_id, role="owner")

        # 1) GET /matrix — весь каталог, замков нет ни у одной строки, каналы
        #    по дефолтам каталога (студия ещё ничего не меняла).
        async with async_session_maker() as db:
            matrix = await get_notification_matrix(ctx=owner, db=db)
        by_id = {row.event_id: row for row in matrix.events}
        assert len(matrix.events) == 38, len(matrix.events)  # весь каталог, не только тронутые
        assert all(r.locked is False and r.locked_channels == [] for r in matrix.events)
        c3 = by_id["c3"]
        assert c3.channels == {"email": True, "telegram": True, "whatsapp": False, "instagram": False}, c3.channels
        print("OK: GET /matrix — без локов, каналы по дефолтам каталога")

        # 2) PATCH /events на critical проходит: замков в матрице больше нет,
        #    владелец гасит любую ячейку. Доставку это не отменяет — critical
        #    уходит по default_channels мимо тумблеров (notification_resolver).
        async with async_session_maker() as db:
            row = await upsert_event_toggle(
                body=EventToggle(role="client", event_id="c3", channel_key="email", is_enabled=False),
                ctx=owner, db=db,
            )
        assert row.channels["email"] is False, row.channels
        async with async_session_maker() as db:
            rows = (await db.execute(
                select(NotificationEventToggle).where(NotificationEventToggle.studio_id == studio_id)
            )).scalars().all()
        assert len(rows) == 1 and rows[0].event_id == "c3", rows
        print("OK: PATCH /events on critical -> 200 (локов нет)")

        # 3) Неизвестное событие / чужая роль -> 422.
        async with async_session_maker() as db:
            try:
                await upsert_event_toggle(
                    body=EventToggle(role="client", event_id="c1", channel_key="email", is_enabled=False),
                    ctx=StudioContext(user=None, studio_id=studio_id, role="owner"), db=db,
                )
            except HTTPException:
                raise AssertionError("c1/client валиден, не должен падать")
        async with async_session_maker() as db:
            try:
                await upsert_event_toggle(
                    body=EventToggle(role="trainer", event_id="c1", channel_key="email", is_enabled=False),
                    ctx=owner, db=db,
                )
                raise AssertionError("ожидали 422 — c1 принадлежит client, не trainer")
            except HTTPException as e:
                assert e.status_code == 422 and e.detail["code"] == "notifications.unknown_event", e.detail
        print("OK: role/event mismatch -> 422")

        # 4) c1 (email+telegram default) — email уже выключен шагом 3; гасим и
        #    telegram, последний канал. Тоже проходит: пустой набор превращается
        #    в forced-фолбэк в resolve_channels, а не в отказ здесь.
        async with async_session_maker() as db:
            row = await upsert_event_toggle(
                body=EventToggle(role="client", event_id="c1", channel_key="telegram", is_enabled=False),
                ctx=owner, db=db,
            )
        assert row.channels["telegram"] is False and row.channels["email"] is False, row.channels
        print("OK: PATCH /events last channel of operational -> 200 (fallback в резолвере)")

        # 5) Возвращаем email c1 обратно -> 200.
        async with async_session_maker() as db:
            row = await upsert_event_toggle(
                body=EventToggle(role="client", event_id="c1", channel_key="email", is_enabled=True),
                ctx=owner, db=db,
            )
        assert row.channels["email"] is True, row
        print("OK: PATCH /events re-enable -> 200")

        # 6) Bulk с critical-событием в пачке проходит целиком — записывается и
        #    соседний c2-тумблер (раньше пачку отклоняло из-за c3).
        async with async_session_maker() as db:
            await bulk_upsert_event_toggles(
                body=EventToggleBulkUpdate(toggles=[
                    EventToggle(role="client", event_id="c2", channel_key="whatsapp", is_enabled=True),
                    EventToggle(role="client", event_id="c3", channel_key="email", is_enabled=False),
                ]),
                ctx=owner, db=db,
            )
        async with async_session_maker() as db:
            c2_rows = (await db.execute(
                select(NotificationEventToggle).where(
                    NotificationEventToggle.studio_id == studio_id, NotificationEventToggle.event_id == "c2",
                )
            )).scalars().all()
        assert len(c2_rows) == 1 and c2_rows[0].is_enabled is True, c2_rows
        print("OK: bulk batch with critical item -> 200")

        # 7) Bulk гасит ОБА канала c1 одной пачкой — тоже проходит.
        async with async_session_maker() as db:
            await bulk_upsert_event_toggles(
                body=EventToggleBulkUpdate(toggles=[
                    EventToggle(role="client", event_id="c1", channel_key="email", is_enabled=False),
                    EventToggle(role="client", event_id="c1", channel_key="telegram", is_enabled=False),
                ]),
                ctx=owner, db=db,
            )
        async with async_session_maker() as db:
            matrix = await get_notification_matrix(ctx=owner, db=db)
        c1 = {row.event_id: row for row in matrix.events}["c1"]
        assert c1.channels["email"] is False and c1.channels["telegram"] is False, c1.channels
        print("OK: bulk gasit оба канала c1 -> 200")

        # ─── Личный слой («Мои уведомления») ─────────────────────────────────
        async with async_session_maker() as db:
            user = (await db.execute(select(User).where(User.id == user_id))).scalar_one()
        trainer_ctx = StudioContext(user=user, studio_id=studio_id, role="trainer")

        # 8) GET /me — только optional-события роли trainer (t7, t8), дефолт True.
        async with async_session_maker() as db:
            prefs = await get_my_notification_prefs(ctx=trainer_ctx, db=db)
        ids = {row.event_id for row in prefs.events}
        assert ids == {"t7", "t8"}, ids
        assert all(row.channels["email"] is True for row in prefs.events)
        print("OK: GET /notifications/me — only optional events of my role")

        # 9) PATCH /me на optional -> 200, персистится и видно в следующем GET.
        async with async_session_maker() as db:
            row = await update_my_notification_pref(
                body=UserPrefUpdate(event_id="t8", channel_key="email", is_enabled=False),
                ctx=trainer_ctx, db=db,
            )
        assert row.channels["email"] is False, row
        async with async_session_maker() as db:
            prefs = await get_my_notification_prefs(ctx=trainer_ctx, db=db)
        t8 = next(r for r in prefs.events if r.event_id == "t8")
        assert t8.channels["email"] is False, t8
        print("OK: PATCH /notifications/me persists and reflects in GET")

        # 10) PATCH /me на operational/critical -> 409 (личный слой их не трогает).
        async with async_session_maker() as db:
            try:
                await update_my_notification_pref(
                    body=UserPrefUpdate(event_id="t3", channel_key="email", is_enabled=False),
                    ctx=trainer_ctx, db=db,
                )
                raise AssertionError("ожидали 409 — t3 операционное, не personal")
            except HTTPException as e:
                assert e.status_code == 409 and e.detail["code"] == "notifications.not_personal", e.detail
        print("OK: PATCH /notifications/me on operational -> 409")

        # 11) PATCH /me на событие чужой роли -> 422.
        async with async_session_maker() as db:
            try:
                await update_my_notification_pref(
                    body=UserPrefUpdate(event_id="c7", channel_key="email", is_enabled=False),
                    ctx=trainer_ctx, db=db,
                )
                raise AssertionError("ожидали 422 — c7 принадлежит client")
            except HTTPException as e:
                assert e.status_code == 422 and e.detail["code"] == "notifications.unknown_event", e.detail
        print("OK: PATCH /notifications/me on foreign-role event -> 422")

        print("ALL PASS — EPIC 3 Задача 3: matrix/events/me endpoints")
    finally:
        await _cleanup(studio_id, user_id)


def test_matrix_endpoints():
    asyncio.run(_run())


if __name__ == "__main__":
    test_matrix_endpoints()
