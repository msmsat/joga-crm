"""Журнал отправок (эпик N-10, первая треть): durable-лог каждой отправки.

ЗАЧЕМ. До него на вопрос студии «вы отправляли клиенту напоминание?» ответить
было нечем — только `logger.warning` в общем потоке логов. Каждый спор упирался
в слово против слова, а на платном канале к этому добавлялось «за что списаны
деньги». Теперь у каждой отправки есть строка: кому, когда, по какому событию,
чем кончилось и что именно ответил провайдер.

СВОЯ СЕССИЯ, а не сессия вызывающего — две независимые причины:
  - журнал обязан пережить откат бизнес-транзакции: сообщение уже ушло и деньги
    уже списаны, даже если запись клиента после этого не сохранилась;
  - `commit()` в чужой сессии закоммитил бы заодно всё, что роутер успел в неё
    положить, — тихая порча данных из совершенно постороннего модуля.
Отсюда два коротких коммита на отправку (claim -> finish). Соединение держится
только на время записи, сетевой поход к провайдеру идёт между ними, а не внутри.

ДЕДУПЛИКАЦИЯ — уникальный ключ на строку, и в него входит календарный час.
Это защита от ПОВТОРА (рестарт daily_notify между отправкой и commit'ом
состояния, двойной тик, ретрай), а не запрет когда-либо отправить то же самое:
без часа клиент, отменивший и заново записавшийся на то же занятие, навсегда
остался бы без подтверждения.

ponytail: повтор ровно на границе часа проскочит, exactly-once так не получить —
это работа воркера из оставшихся двух третей N-10. Здесь важна durable-запись и
защита от штатных дублей, а не распределённый консенсус.
"""
import hashlib
import json
import logging
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from database import async_session_maker
from models import NotificationLog

logger = logging.getLogger(__name__)

# Исходы отправки. Разделение rejected/error — не педантизм, а единственное, что
# отвечает на «списались ли деньги»: провайдер ОТВЕТИЛ отказом (не списались) или
# ответа не было вовсе (неизвестно, и это надо видеть в споре как есть).
PENDING = "pending"
SENT = "sent"
REJECTED = "rejected"
ERROR = "error"

# Строка, застрявшая в pending дольше этого, считается брошенной: процесс упал
# прямо в отправке. Без переиспользования такая строка заперла бы своё сообщение
# навсегда. Порог заведомо больше любого нашего таймаута (10с + два бэкоффа).
_STALE_PENDING = timedelta(minutes=15)


def recipient_address(channel: str, recipient) -> str | None:
    """Реквизит, по которому уходит сообщение в этом канале."""
    value = {
        "email": recipient.email,
        "telegram": recipient.tg_id,
        "whatsapp": recipient.phone,
    }.get(channel)
    return None if value is None else str(value)[:255]


def dedup_key(
    studio_id: int, event_id: str | None, channel: str, address: str | None, context: dict | None,
) -> str:
    """Ключ «то же самое сообщение»: студия + событие + канал + получатель +
    содержимое + час.

    Содержимое берём целиком, а не перечнем полей вроде lesson_id: контекст и
    есть то, что делает сообщение уникальным, и он же отличает напоминание за
    24 часа от напоминания за 2 (`hours` в контексте c2). Перечислять поля
    поштучно значило бы вести реестр на 38 событий и ошибиться в нём.

    ВАЖНО для прямых вызовов deliver() мимо notify() (сценарии лояльности): у них
    нет event_id, поэтому различать их сообщения обязан context — иначе два
    разных сценария одному клиенту в один час сольются в один ключ и второй не
    уедет. См. services/scenario_runner.py.
    """
    payload = json.dumps(context or {}, sort_keys=True, ensure_ascii=False, default=str)
    hour = datetime.utcnow().strftime("%Y%m%d%H")
    material = f"{studio_id}|{event_id or ''}|{channel}|{address or ''}|{payload}|{hour}"
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


async def claim(
    studio_id: int,
    event_id: str | None,
    channel: str,
    recipient,
    context: dict | None,
) -> int | None:
    """Занимает строку журнала под отправку.

    -> id строки, если отправлять НАДО (её потом закрывает finish);
    -> None, если это сообщение уже ушло или уходит прямо сейчас в соседнем
       процессе — тогда вызывающий молча не платит второй раз.

    Ошибка самого журнала НЕ останавливает отправку: не доставить уведомление
    хуже, чем не записать его, а типичная причина здесь — не накатанная миграция,
    и она видна по `logger.exception`. Сознательный fail-open.
    """
    address = recipient_address(channel, recipient)
    key = dedup_key(studio_id, event_id, channel, address, context)
    try:
        async with async_session_maker() as db:
            inserted = (await db.execute(
                pg_insert(NotificationLog)
                .values(
                    studio_id=studio_id, event_id=event_id, channel=channel,
                    recipient_id=getattr(recipient, "id", None), recipient_address=address,
                    dedup_key=key, status=PENDING,
                )
                .on_conflict_do_nothing(index_elements=["dedup_key"])
                .returning(NotificationLog.id)
            )).scalar_one_or_none()
            if inserted is not None:
                await db.commit()
                return inserted

            # Ключ занят — решает исход прошлой попытки.
            row = (await db.execute(
                select(NotificationLog).where(NotificationLog.dedup_key == key)
            )).scalar_one_or_none()
            if row is None or row.status == SENT:
                logger.info("outbox: дубль отброшен, studio=%s event=%s channel=%s",
                            studio_id, event_id, channel)
                return None
            if row.status == PENDING and datetime.utcnow() - row.created_at < _STALE_PENDING:
                return None  # шлёт кто-то другой прямо сейчас
            # Прошлая попытка провалилась (или процесс умер в ней) — пробуем снова
            # этой же строкой, чтобы история не размножалась на каждую попытку.
            row.status = PENDING
            row.error = None
            row.finished_at = None
            await db.commit()
            return row.id
    except Exception:
        logger.exception("outbox: не удалось занять строку, studio=%s event=%s channel=%s",
                         studio_id, event_id, channel)
        return 0  # 0 — «журнала нет, но слать надо»: finish по нему ничего не пишет


async def finish(log_id: int | None, status: str, error: str | None = None) -> None:
    """Закрывает строку журнала исходом отправки. log_id 0/None — писать некуда."""
    if not log_id:
        return
    try:
        async with async_session_maker() as db:
            row = await db.get(NotificationLog, log_id)
            if row is None:
                return
            row.status = status
            row.error = error[:500] if error else None
            row.finished_at = datetime.utcnow()
            await db.commit()
    except Exception:
        logger.exception("outbox: не удалось закрыть строку %s статусом %s", log_id, status)


if __name__ == "__main__":
    # Самопроверка без БД: ключ — единственная чистая логика в модуле, и именно
    # от него зависит, не заплатим ли мы дважды.
    class _R:
        id, email, tg_id, phone = 7, "a@x.com", 555, "+79990000000"

    r = _R()
    assert recipient_address("email", r) == "a@x.com"
    assert recipient_address("telegram", r) == "555"      # tg_id число -> строка
    assert recipient_address("whatsapp", r) == "+79990000000"
    assert recipient_address("sms", r) is None            # канал вне журнала
    assert recipient_address("instagram", r) is None      # больше не канал уведомлений

    base = dict(studio_id=1, event_id="c2", channel="whatsapp", address="+79990000000")
    ctx = {"lesson_name": "Йога", "client_id": 7, "hours": 24}

    # Одно и то же сообщение -> один ключ, даже если поля контекста пришли
    # в другом порядке (dict сохраняет порядок вставки, ключ не должен).
    assert dedup_key(**base, context=ctx) == dedup_key(
        **base, context={"hours": 24, "client_id": 7, "lesson_name": "Йога"})

    # Напоминание за 24 часа и за 2 — РАЗНЫЕ сообщения об одном занятии.
    assert dedup_key(**base, context=ctx) != dedup_key(**base, context={**ctx, "hours": 2})
    # Другой получатель, другой канал, другая студия, другое событие — тоже разные.
    assert dedup_key(**base, context=ctx) != dedup_key(**{**base, "address": "+79991111111"}, context=ctx)
    assert dedup_key(**base, context=ctx) != dedup_key(**{**base, "channel": "email"}, context=ctx)
    assert dedup_key(**base, context=ctx) != dedup_key(**{**base, "studio_id": 2}, context=ctx)
    assert dedup_key(**base, context=ctx) != dedup_key(**{**base, "event_id": "c1"}, context=ctx)
    # Контекст с несериализуемым значением не должен ронять отправку (default=str).
    assert len(dedup_key(**base, context={"when": datetime(2026, 8, 7, 10, 0)})) == 64

    print("outbox self-check ok")
