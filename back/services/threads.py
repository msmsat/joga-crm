"""Сериализация разговора: аренда треда и fencing (P0.3).

ЗАЧЕМ ОТДЕЛЬНО ОТ РАБОТЫ. Блокировка работы отвечает на «два исполнителя одного
сообщения». Она ничего не говорит про два РАЗНЫХ сообщения одного разговора:
«хочу завтра вечером» и «лучше после 19» — это две законные работы, и без
второго замка они запускают два хода агента одновременно. Каждый видит свою
половину разговора, и человек получает два несогласованных ответа.

ПОЧЕМУ АРЕНДА, А НЕ ЗАМОК БД. Ход агента идёт минутами. `FOR UPDATE`, advisory
xact-лок или просто открытая транзакция на это время означают занятое
соединение и — что хуже — разговор, запертый навсегда, если процесс умрёт с
локом. Аренда со сроком снимается сама: истекла — тред свободен, кто бы его ни
держал, и никакой уборки для этого не нужно.

ЧАСЫ ТОЛЬКО СЕРВЕРНЫЕ. Все сравнения времени идут через `now()` Постгреса, а не
через `datetime.utcnow()` процесса. С одним воркером разницы нет, с десятью
расхождение часов означало бы, что один считает аренду истёкшей, а другой —
живой; арбитром обязан быть один и тот же счётчик.

Именно `now()`, а не `timezone('utc', now())`: все server_default в схеме —
`func.now()`, то есть локальное время сервера БД, и колонки хранят naive-время
БЕЗ зоны. Смешав две формы, получаем сравнение времени в разных зонах: у нас
это стоило работы, которая становилась доступной ровно через смещение зоны
(Europe/Budapest, +2 часа) после приёма. Какая именно зона у сервера, неважно —
важно, что она ОДНА для всех значений в этих сравнениях.

FENCING. Захват возвращает `lease_seq`. Записать результат хода можно ТОЛЬКО с
этим номером: перехват увеличивает его, и очнувшийся прежний владелец получает
0 изменённых строк вместо тихой записи поверх чужой работы.
"""
import logging
from typing import NamedTuple

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert

from models import ChannelThread

logger = logging.getLogger(__name__)

# Единственные часы системы — серверные, той же формы, что server_default колонок.
DB_NOW = func.now()


class Lease(NamedTuple):
    """Владение разговором. seq — токен, которым и только которым можно писать."""
    thread_id: int
    seq: int


async def get_or_create(db, studio_id: int, channel: str, sender_ref: str) -> int:
    """id треда по каноническому ключу. Заводится при первой обработке, а не при
    приёме: вебхук после коммита не делает ничего (P0.3, §2).

    Апсерт, а не «посмотреть и вставить»: два воркера, взявшие два первых
    сообщения одного человека, доходят сюда одновременно.
    """
    stmt = (
        pg_insert(ChannelThread)
        .values(studio_id=studio_id, channel=channel, sender_ref=sender_ref[:128])
        .on_conflict_do_nothing(index_elements=["studio_id", "channel", "sender_ref"])
        .returning(ChannelThread.id)
    )
    thread_id = (await db.execute(stmt)).scalar_one_or_none()
    if thread_id is None:
        thread_id = (await db.execute(select(ChannelThread.id).where(
            ChannelThread.studio_id == studio_id,
            ChannelThread.channel == channel,
            ChannelThread.sender_ref == sender_ref[:128],
        ))).scalar_one()
    return thread_id


async def acquire(db, thread_id: int, owner: str, ttl_seconds: int) -> Lease | None:
    """Занять разговор. None — его ведёт кто-то другой прямо сейчас.

    Условие целиком в WHERE: «посмотреть, свободен ли, и потом занять» пропустило
    бы двух воркеров. Истёкшая аренда считается свободной без всякой уборки.
    """
    seq = (await db.execute(
        update(ChannelThread)
        .where(
            ChannelThread.id == thread_id,
            (ChannelThread.lease_until.is_(None)) | (ChannelThread.lease_until < DB_NOW),
        )
        .values(
            lease_owner=owner[:64],
            lease_until=DB_NOW + func.make_interval(0, 0, 0, 0, 0, 0, ttl_seconds),
            lease_seq=ChannelThread.lease_seq + 1,
        )
        .returning(ChannelThread.lease_seq)
    )).scalar_one_or_none()
    await db.commit()
    if seq is None:
        return None
    return Lease(thread_id, seq)


async def still_owned(db, lease: Lease) -> bool:
    """Проверка внутри финальной транзакции: номер тот же и срок не вышел.

    Обе половины обязательны. Совпавший номер при истёкшем сроке означает, что
    тред просто ещё никто не перехватил, — но право на запись мы уже потеряли,
    и следующий владелец имеет полное основание начать ход заново.
    """
    return (await db.execute(
        select(ChannelThread.id).where(
            ChannelThread.id == lease.thread_id,
            ChannelThread.lease_seq == lease.seq,
            ChannelThread.lease_until > DB_NOW,
        )
    )).scalar_one_or_none() is not None


async def release(db, lease: Lease) -> None:
    """Отпустить разговор досрочно, чтобы следующее сообщение не ждало срока.

    Fenced: перехваченную аренду не отпускаем — она уже не наша, и снятие
    отдало бы разговор третьему процессу посреди чужого хода.
    """
    await db.execute(
        update(ChannelThread)
        .where(ChannelThread.id == lease.thread_id, ChannelThread.lease_seq == lease.seq)
        .values(lease_owner=None, lease_until=None)
    )


if __name__ == "__main__":
    # Самопроверка без БД: NamedTuple и форма запроса. Поведение аренды проверяет
    # tests/test_worker_runtime.py — оно всё в SQL, и без Постгреса смысла не имеет.
    lease = Lease(7, 3)
    assert (lease.thread_id, lease.seq) == (7, 3)
    assert str(DB_NOW) == "now()"
    print("threads self-check ok")
