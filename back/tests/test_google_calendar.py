"""EPIC 6 задача 4: Google Calendar OAuth и синхронизация.

Не мокает aiohttp/сеть к Google — в кодовой базе такого паттерна нет нигде
(connect_whatsapp, connect_instagram тоже не тестируют сам HTTP-вызов). Проверяется
локальная логика, которая реально в зоне риска: подпись/валидация state (CSRF),
ранние False-выходы push_lesson без сети (не подключено/нет календаря), скоуп
disconnect_studio по studio_id (обнуление gcal_event_id только своих занятий),
форма ответа _status(). disconnect_studio тестируется с config БЕЗ refresh_token,
чтобы не звать реальный revoke у Google (config без токена -> revoke_token не вызывается).
Реальная БД, ручная чистка. Запуск из back/:  python -m tests.test_google_calendar
"""
import asyncio
import warnings
from datetime import datetime, timedelta

warnings.filterwarnings("ignore")

from fastapi import BackgroundTasks
from jose import jwt as _jwt
from pydantic import ValidationError
from sqlalchemy import delete, select

from database import async_session_maker
from dependencies import ALGORITHM, SECRET_KEY
from models import Lesson, Studio, StudioIntegration
from routers.schedule.lessons import _schedule_gcal_push
from routers.settings.google_calendar import _make_state, _status, _studio_id_from_state
from schemas.settings.google_calendar import GoogleCalendarUpdate
from services import gcal


class _FakeLesson:
    def __init__(self, **kw):
        self.id = 1
        self.name = "Хатха-йога"
        self.teacher_name = "Анна К."
        self.status = "confirmed"
        self.gcal_event_id = None
        self.start_time = datetime(2026, 8, 1, 10, 0)
        self.duration_min = 60
        self.__dict__.update(kw)


async def _seed() -> tuple[int, int]:
    async with async_session_maker() as db:
        s = Studio(name="TEST-GCAL-STUDIO")
        other = Studio(name="TEST-GCAL-OTHER-STUDIO")
        db.add_all([s, other])
        await db.commit()
        sid, other_sid = s.id, other.id
        db.add_all([
            Lesson(
                studio_id=sid, name="Йога", teacher_name="Анна", start_time=datetime.now(),
                duration_min=60, price=1000, level="all", equipment="коврик",
                gcal_event_id="evt_mine",
            ),
            Lesson(
                studio_id=other_sid, name="Пилатес", teacher_name="Ольга", start_time=datetime.now(),
                duration_min=60, price=1000, level="all", equipment="коврик",
                gcal_event_id="evt_other",
            ),
        ])
        await db.commit()
        return sid, other_sid


async def _cleanup(sid: int, other_sid: int) -> None:
    async with async_session_maker() as db:
        await db.execute(delete(Lesson).where(Lesson.studio_id.in_([sid, other_sid])))
        await db.execute(delete(StudioIntegration).where(StudioIntegration.studio_id.in_([sid, other_sid])))
        await db.execute(delete(Studio).where(Studio.id.in_([sid, other_sid])))
        await db.commit()


async def _run():
    sid, other_sid = await _seed()
    try:
        # --- state JWT: подпись/валидация (CSRF-защита колбэка) ---
        state = _make_state(sid, user_id=42)
        assert _studio_id_from_state(state) == sid
        assert _studio_id_from_state(None) is None
        assert _studio_id_from_state("garbage.not.a.jwt") is None
        assert _studio_id_from_state("") is None

        expired = _jwt.encode(
            {"studio_id": sid, "user_id": 1, "purpose": "gcal_oauth", "exp": datetime.utcnow() - timedelta(minutes=1)},
            SECRET_KEY, algorithm=ALGORITHM,
        )
        assert _studio_id_from_state(expired) is None, "просроченный state должен быть отвергнут"

        wrong_purpose = _jwt.encode(
            {"studio_id": sid, "user_id": 1, "purpose": "ig_oauth", "exp": datetime.utcnow() + timedelta(minutes=10)},
            SECRET_KEY, algorithm=ALGORITHM,
        )
        assert _studio_id_from_state(wrong_purpose) is None, "state с чужим purpose не должен приниматься"

        # --- _event_body: форма события Google (таймзона, extendedProperties) ---
        lesson = _FakeLesson()
        body = gcal._event_body(lesson, "Зал 1", "Europe/Moscow")
        assert body["summary"] == "Хатха-йога"
        assert body["description"] == "Анна К. · Зал 1"
        assert body["start"]["timeZone"] == "Europe/Moscow"
        assert body["start"]["dateTime"] == "2026-08-01T10:00:00"
        assert body["end"]["dateTime"] == "2026-08-01T11:00:00"
        assert body["extendedProperties"]["private"]["velora_lesson_id"] == "1"

        # --- push_lesson: ранние False-выходы без единого сетевого вызова ---
        async with async_session_maker() as db:
            ok = await gcal.push_lesson(db, sid, 999999)  # нет интеграции вовсе
        assert ok is False

        async with async_session_maker() as db:
            db.add(StudioIntegration(studio_id=sid, integration_type="gcal", is_connected=False, config={"calendar_id": "c1", "refresh_token": "r1"}))
            await db.commit()
        async with async_session_maker() as db:
            ok = await gcal.push_lesson(db, sid, 1)  # is_connected=False
        assert ok is False

        async with async_session_maker() as db:
            integ = (await db.execute(
                select(StudioIntegration).where(StudioIntegration.studio_id == sid)
            )).scalar_one()
            integ.is_connected = True
            integ.config = {"refresh_token": "r1"}  # без calendar_id
            await db.commit()
        async with async_session_maker() as db:
            ok = await gcal.push_lesson(db, sid, 1)  # нет calendar_id
        assert ok is False

        # --- _status(): форма ответа PATCH/DELETE /integrations/google ---
        not_connected = _status(None)
        assert not_connected.connected is False
        assert not_connected.details is None
        assert not_connected.capabilities == ["schedule_sync"]

        class _Integ:
            is_connected = True
            updated_at = datetime(2026, 7, 1, 12, 0)
            config = {
                "calendar_id": "cal1", "calendar_name": "Velora · Расписание",
                "connected_email": "owner@studio.ru", "sync_mode": "push",
                "last_sync_at": "2026-07-20T10:00:00", "refresh_token": "SECRET-must-not-leak",
            }
        connected = _status(_Integ())
        assert connected.connected is True
        assert connected.details["calendar_id"] == "cal1"
        assert connected.details["connected_email"] == "owner@studio.ru"
        assert "refresh_token" not in connected.details, connected.details  # секрет не уходит наружу

        # --- disconnect_studio: скоуп по studio_id, config без refresh_token -> без сети ---
        async with async_session_maker() as db:
            integ = (await db.execute(
                select(StudioIntegration).where(StudioIntegration.studio_id == sid)
            )).scalar_one()
            integ.config = {"calendar_id": "cal1"}  # намеренно без refresh_token
            await db.commit()

        async with async_session_maker() as db:
            await gcal.disconnect_studio(db, sid)

        async with async_session_maker() as db:
            integ = (await db.execute(
                select(StudioIntegration).where(StudioIntegration.studio_id == sid)
            )).scalar_one()
            assert integ.is_connected is False
            assert integ.config is None

            mine = (await db.execute(
                select(Lesson).where(Lesson.studio_id == sid)
            )).scalar_one()
            assert mine.gcal_event_id is None, "своё занятие должно потерять привязку к событию"

            other = (await db.execute(
                select(Lesson).where(Lesson.studio_id == other_sid)
            )).scalar_one()
            assert other.gcal_event_id == "evt_other", "чужая студия не должна быть задета"

        # --- _schedule_gcal_push: None (прямой вызов из теста) не должен падать;
        # реальный BackgroundTasks() должен получить задачу ---
        _schedule_gcal_push(None, sid, 1)  # не должно бросить исключение
        bg = BackgroundTasks()
        _schedule_gcal_push(bg, sid, 1)
        assert len(bg.tasks) == 1

        # --- GoogleCalendarUpdate: sync_mode — Literal, мусор отвергается ---
        GoogleCalendarUpdate(sync_mode="two_way")
        try:
            GoogleCalendarUpdate(sync_mode="weekly")
            raise AssertionError("невалидный sync_mode должен быть отвергнут")
        except ValidationError:
            pass

        print("OK: test_google_calendar")
    finally:
        await _cleanup(sid, other_sid)


if __name__ == "__main__":
    asyncio.run(_run())
