"""GET /settings/notifications/log (эпик N-10): экран журнала для поддержки.

Реальная БД, своя студия, ручная чистка. Сеть не трогаем.
Запуск из back/:  python -m tests.test_notification_log_endpoint
"""
import asyncio
import warnings

warnings.filterwarnings("ignore")

from datetime import datetime, timedelta

from sqlalchemy import delete

from database import async_session_maker
from dependencies import StudioContext
from models import NotificationLog, Studio
from routers.settings.notifications import get_notification_log


def _ctx(studio_id: int) -> StudioContext:
    return StudioContext(studio_id=studio_id, user=None, role="owner")


async def _log(db, studio_id: int, **kw):
    """Вызов эндпоинта напрямую, как в остальных тестах роутеров. offset/limit
    передаём явно: без FastAPI дефолты Query(...) остаются объектами Query."""
    kw.setdefault("offset", 0)
    kw.setdefault("limit", 25)
    return await get_notification_log(ctx=_ctx(studio_id), db=db, **kw)


async def _seed() -> tuple[int, int]:
    """Своя студия + чужая: журнал обязан быть виден только своей."""
    async with async_session_maker() as db:
        mine, other = Studio(name="TEST-LOG-MINE"), Studio(name="TEST-LOG-OTHER")
        db.add_all([mine, other])
        await db.commit()
        now = datetime.utcnow()
        db.add_all([
            NotificationLog(studio_id=mine.id, event_id="c2", channel="whatsapp",
                            recipient_address="+79990000001", dedup_key="test-log-1",
                            status="sent", created_at=now - timedelta(minutes=5)),
            NotificationLog(studio_id=mine.id, event_id="c2", channel="email",
                            recipient_address="anna@test.local", dedup_key="test-log-2",
                            status="sent", created_at=now - timedelta(minutes=4)),
            NotificationLog(studio_id=mine.id, event_id="c1", channel="whatsapp",
                            recipient_address="+79990000002", dedup_key="test-log-3",
                            status="rejected", error="Graph 400: template vlr_c1 is not approved",
                            created_at=now - timedelta(minutes=3)),
            NotificationLog(studio_id=mine.id, event_id="o1", channel="telegram",
                            recipient_address="555", dedup_key="test-log-4",
                            status="error", error="TimeoutError: ", created_at=now - timedelta(minutes=2)),
            NotificationLog(studio_id=other.id, event_id="c2", channel="whatsapp",
                            recipient_address="+79990000001", dedup_key="test-log-alien",
                            status="sent", created_at=now),
        ])
        await db.commit()
        return mine.id, other.id


async def _cleanup(*studio_ids: int) -> None:
    async with async_session_maker() as db:
        await db.execute(delete(NotificationLog).where(NotificationLog.studio_id.in_(studio_ids)))
        await db.execute(delete(Studio).where(Studio.id.in_(studio_ids)))
        await db.commit()


async def _run(mine: int, other: int) -> None:
    async with async_session_maker() as db:
        page = await _log(db, mine)
        # Чужая строка не попала — журнал такой же арендный, как всё остальное.
        assert page.total == 4, page.total
        assert all(r.recipient_address != "+79990000001" or r.event_id == "c2" for r in page.items)

        # Свежие сверху: поддержка открывает экран ради последнего, а не первого.
        assert [r.event_id for r in page.items] == ["o1", "c1", "c2", "c2"], page.items

        # Счётчики — тот самый ответ «всё ли доходит».
        assert (page.summary.sent, page.summary.rejected, page.summary.error) == (2, 1, 1)

        # Отказ провайдера сохранил тело ответа: в споре это доказательство.
        rejected = [r for r in page.items if r.status == "rejected"][0]
        assert "not approved" in rejected.error

        # Фильтр по статусу сужает список, но НЕ счётчики: иначе, выбрав
        # «отклонённые», студия увидела бы «остальное ноль» и решила, что всё сломано.
        only_rejected = await _log(db, mine, status="rejected")
        assert only_rejected.total == 1
        assert only_rejected.summary.sent == 2, only_rejected.summary

        # Канал — чтобы отделить платный WhatsApp от бесплатных.
        wa = await _log(db, mine, channel="whatsapp")
        assert wa.total == 2 and wa.summary.rejected == 1

        # Поиск по реквизиту получателя — главный сценарий поддержки
        # («вы отправляли ЭТОМУ клиенту напоминание?»).
        found = await _log(db, mine, search="79990000002")
        assert found.total == 1 and found.items[0].event_id == "c1"

        # ...и по id события, чтобы посмотреть на конкретное уведомление целиком.
        by_event = await _log(db, mine, search="c2")
        assert by_event.total == 2

        # Пагинация: total — по всей выборке, items — по странице.
        first = await _log(db, mine, limit=2)
        assert first.total == 4 and len(first.items) == 2

        # Пустой журнал чужой студии не должен падать на счётчиках.
        empty = await _log(db, other)
        assert empty.total == 1 and empty.summary.rejected == 0


async def _main() -> None:
    # Один event loop на весь тест: движок держит соединения привязанными к
    # первой петле, несколько asyncio.run() роняют asyncpg.
    mine, other = await _seed()
    try:
        await _run(mine, other)
    finally:
        await _cleanup(mine, other)


def test_notification_log_endpoint():
    asyncio.run(_main())


if __name__ == "__main__":
    test_notification_log_endpoint()
    print("ALL PASS — журнал отправок: изоляция студий, счётчики, фильтры, поиск")
