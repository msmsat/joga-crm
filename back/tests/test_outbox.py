"""Журнал отправок (эпик N-10): дедупликация и честные статусы.

Против реальной БД намеренно: вся защита от повторной оплаты держится на
УНИКАЛЬНОМ ИНДЕКСЕ по dedup_key, а его на моках не проверить — именно там
ловится гонка двух процессов, ради которой ключ и заведён. Сеть не трогаем.
Своя студия, ручная чистка. Запуск из back/:  python -m tests.test_outbox
"""
import asyncio
import warnings

warnings.filterwarnings("ignore")

from datetime import datetime, timedelta

from sqlalchemy import delete, select

from database import async_session_maker
from models import NotificationLog, Studio
import services.outbox as O


class _Recipient:
    id, email, tg_id, phone, ig_id = 42, "client@test.local", 555, "+79990000000", None


CTX = {"lesson_name": "Йога", "client_id": 42, "hours": 24}


async def _seed() -> int:
    async with async_session_maker() as db:
        studio = Studio(name="TEST-OUTBOX-STUDIO")
        db.add(studio)
        await db.commit()
        return studio.id


async def _cleanup(studio_id: int) -> None:
    async with async_session_maker() as db:
        await db.execute(delete(NotificationLog).where(NotificationLog.studio_id == studio_id))
        await db.execute(delete(Studio).where(Studio.id == studio_id))
        await db.commit()


async def _rows(studio_id: int) -> list[NotificationLog]:
    async with async_session_maker() as db:
        return list((await db.execute(
            select(NotificationLog).where(NotificationLog.studio_id == studio_id)
            .order_by(NotificationLog.id)
        )).scalars().all())


async def _run(studio_id: int) -> None:
    r = _Recipient()

    # 1. Отправка записывается целиком: кому, по какому событию, в какой канал.
    log_id = await O.claim(studio_id, "c2", "whatsapp", r, CTX)
    assert log_id, "claim обязан вернуть id строки на первой отправке"
    await O.finish(log_id, O.SENT)

    rows = await _rows(studio_id)
    assert len(rows) == 1, rows
    row = rows[0]
    assert (row.event_id, row.channel, row.status) == ("c2", "whatsapp", O.SENT)
    assert row.recipient_id == 42 and row.recipient_address == "+79990000000"
    assert row.finished_at is not None and row.error is None

    # 2. Тот же вызов ещё раз — это рестарт daily_notify между отправкой и
    # commit'ом состояния. Второй раз платить нельзя: claim отдаёт None и новой
    # строки не появляется.
    assert await O.claim(studio_id, "c2", "whatsapp", r, CTX) is None
    assert len(await _rows(studio_id)) == 1

    # 3. Напоминание за 2 часа — ДРУГОЕ сообщение про то же занятие, оно должно
    # пройти: дедуп не имеет права глушить второе напоминание.
    two_hours = await O.claim(studio_id, "c2", "whatsapp", r, {**CTX, "hours": 2})
    assert two_hours and two_hours != log_id
    await O.finish(two_hours, O.SENT)
    assert len(await _rows(studio_id)) == 2

    # 4. Отказ провайдера и сетевой сбой — разные статусы, и текст ответа Meta
    # сохранён: в споре о списании это единственное доказательство.
    rejected = await O.claim(studio_id, "c1", "whatsapp", r, {"lesson_name": "Пилатес"})
    await O.finish(rejected, O.REJECTED, "Graph 400: template vlr_c1 is not approved")
    async with async_session_maker() as db:
        row = await db.get(NotificationLog, rejected)
        assert row.status == O.REJECTED
        assert "not approved" in row.error

    # 5. Провалившаяся отправка не запирает сообщение навсегда: следующий заход с
    # тем же ключом переиспользует строку, а не плодит новую и не молчит.
    again = await O.claim(studio_id, "c1", "whatsapp", r, {"lesson_name": "Пилатес"})
    assert again == rejected, "провалившаяся строка должна переиспользоваться"
    await O.finish(again, O.SENT)

    # 6. Строка, застрявшая в pending (процесс умер прямо в отправке), блокирует
    # повтор — но только пока свежая. Состарим её и убедимся, что сообщение
    # разблокировалось: иначе один упавший воркер хоронил бы событие насовсем.
    stuck = await O.claim(studio_id, "t3", "telegram", r, {"lesson_name": "Стретчинг"})
    assert await O.claim(studio_id, "t3", "telegram", r, {"lesson_name": "Стретчинг"}) is None
    async with async_session_maker() as db:
        row = await db.get(NotificationLog, stuck)
        row.created_at = datetime.utcnow() - O._STALE_PENDING - timedelta(minutes=1)
        await db.commit()
    assert await O.claim(studio_id, "t3", "telegram", r, {"lesson_name": "Стретчинг"}) == stuck

    # 7. Разные каналы одного события — разные строки: WhatsApp платный, email
    # нет, и в счёте они должны быть видны по отдельности.
    email_id = await O.claim(studio_id, "c2", "email", r, CTX)
    assert email_id and email_id not in (log_id, two_hours)


async def _main() -> None:
    # Один event loop на весь тест: движок создаётся при импорте и держит
    # соединения привязанными к первой петле — несколько asyncio.run() роняют
    # asyncpg на «another operation is in progress».
    studio_id = await _seed()
    try:
        await _run(studio_id)
    finally:
        await _cleanup(studio_id)


def test_outbox():
    asyncio.run(_main())


if __name__ == "__main__":
    test_outbox()
    print("ALL PASS — журнал отправок: дедуп, статусы, переиспользование строки")
