"""Очередь исходящих: durable-намерение вместо прямой отправки (P0.4).

ЧТО ИМЕННО ЗАКРЫВАЕТСЯ. До P0.4 ход агента заканчивался вызовом Telegram/Meta, и
между сетью и коммитом зияло окно двойной записи: упал после отправки — задвоил
ответ; отправил после коммита — потерял его. Теперь ход заканчивается строкой в
БД, и «работа выполнена» значит «ответ надёжно записан», а не «ответ доставлен».

ГАРАНТИИ, СЛОВО В СЛОВО
  - намерение ответить: сохраняется атомарно вместе с закрытием работы агента;
  - попытки отправки: начинаются в durable-порядке внутри разговора, между
    разговорами — параллельно;
  - доставка: best-effort. Ограниченное число попыток, после чего сообщение
    становится terminal failed и НЕ будет доставлено никогда;
  - дубль у человека: ВОЗМОЖЕН. Провайдер принял запрос, а ответ до нас не
    дошёл — исход неизвестен, и повтор отправит сообщение второй раз.
Ни «exactly once», ни «at least once» к этому неприменимо: первое недостижимо
без идемпотентного ключа на стороне провайдера (у sendMessage и Graph messages
его нет), второе неверно, потому что после исчерпания попыток мы сдаёмся.

ПОРЯДОК ВНУТРИ РАЗГОВОРА держат два независимых механизма:
  1. выборка не берёт сообщение, пока в его треде есть более раннее незавершённое;
  2. частичный UNIQUE(thread_id) WHERE status='sending' физически запрещает две
     одновременные отправки в один тред.
Второе — не дублирование первого, а защита от TOCTOU: без него две реплики,
одновременно прошедшие проверку, обе ушли бы в сеть.

ТЕРМИНАЛЬНОЕ НЕ БЛОКИРУЕТ. Сообщение, окончательно провалившееся, перестаёт
задерживать очередь разговора (см. _blocked): иначе одно сломанное сообщение
запирало бы диалог навсегда. Поэтому порядок формулируется точно так:
попытки начинаются в durable-порядке СРЕДИ НЕЗАВЕРШЁННЫХ сообщений.
"""
import logging
from datetime import timedelta
from typing import NamedTuple

from sqlalchemy import and_, exists, func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError

from database import async_session_maker
from models import ChannelThread, CustomerIdentity, OutboundMessage
from services import channels
from services.threads import DB_NOW

logger = logging.getLogger(__name__)

QUEUED, SENDING, ACCEPTED, FAILED = "queued", "sending", "accepted", "failed"

# Попыток на сообщение. Больше — не помощь: провайдер, трижды отказавший, вряд
# ли примет с четвёртого, а ответ в чат к тому времени уже неактуален.
_MAX_ATTEMPTS = 5
# Откат между попытками, когда провайдер сам срока не назвал.
_BACKOFF_SECONDS = (10, 30, 60, 300, 300)
# Попытка, начатая раньше этого, считается брошенной вместе со своим процессом.
# Заведомо больше сетевого таймаута каналов (10 с) с запасом на паузы GC и своп.
_STALE_SENDING_SECONDS = 300
# Неизвестный исход: сеть промолчала. Ровно ОДИН повтор, и только он — политика
# названа в отчёте: мы предпочитаем возможный дубль молчанию, но не бесконечно.
_UNKNOWN_RETRIES = 1
# Срок хранения текста ответа: тот же, что у принятых событий. Это переписка
# клиента чужого бизнеса.
_RETENTION = timedelta(days=30)


class Claimed(NamedTuple):
    """Взятое сообщение. token — номер попытки, он же токен владения."""
    id: int
    token: int
    studio_id: int
    thread_id: int
    channel: str
    recipient: str
    payload: dict
    # Откуда взялось сообщение. «agent» — ответ на СОБСТВЕННОЕ сообщение
    # человека, то есть операционный. Всё остальное считается рекламным, и
    # разрешение на него спрашивается в момент отправки (см. `allowed`).
    origin: str = "agent"


def reply_key(job_id: int) -> str:
    """Причинный ключ, а не хеш текста: повтор хода агента обязан узнаваться и
    тогда, когда модель сформулировала ответ иначе. Суффикс — на будущее, когда
    один ход законно породит несколько сообщений."""
    return f"agent-job:{job_id}:reply"


async def enqueue(db, *, studio_id: int, thread_id: int, dedup_key: str,
                  payload: dict, origin: str = "agent") -> int | None:
    """Поставить намерение в очередь. НЕ коммитит — вызывается внутри финальной
    транзакции хода агента, и отдельный коммит разорвал бы её атомарность.

    Возвращает id или None, если такое намерение уже записано (повтор хода).
    """
    row_id = (await db.execute(
        pg_insert(OutboundMessage)
        .values(studio_id=studio_id, thread_id=thread_id, dedup_key=dedup_key,
                payload=payload, origin=origin, status=QUEUED)
        .on_conflict_do_nothing(index_elements=["dedup_key"])
        .returning(OutboundMessage.id)
    )).scalar_one_or_none()
    if row_id is None:
        logger.info("outbound_duplicate_intent dedup_key=%s", dedup_key)
    else:
        logger.info("outbound_queued outbound_id=%s studio_id=%s thread_id=%s",
                    row_id, studio_id, thread_id)
    return row_id


def _blocked():
    """Есть ли в том же треде более раннее НЕЗАВЕРШЁННОЕ сообщение или уже идущая
    отправка. Терминальные (accepted/failed) не считаются: одно сломанное
    сообщение не должно запирать разговор навсегда."""
    earlier = OutboundMessage.__table__.alias("earlier")
    return exists().where(and_(
        earlier.c.thread_id == OutboundMessage.thread_id,
        earlier.c.status.in_([QUEUED, SENDING]),
        # либо кто-то уже шлёт в этот тред, либо впереди нас есть очередь
        (earlier.c.status == SENDING) | (earlier.c.id < OutboundMessage.id),
    ))


async def claim_next(db, worker: str, ids: list[int] | None = None) -> Claimed | None:
    """Взять следующее сообщение к отправке. None — брать нечего.

    `FOR UPDATE SKIP LOCKED` разводит воркеров по разным строкам, а условие
    _blocked() удерживает порядок внутри разговора. Проверка «а не шлёт ли
    кто-то в этот тред» живёт В ТОМ ЖЕ запросе, а не отдельным SELECT'ом.

    ids ограничивает выборку и нужен ТОЛЬКО тестам: прогон идёт в общей dev-БД,
    и глобальная выборка увела бы живое сообщение соседней сессии.
    """
    condition = (
        (OutboundMessage.status == QUEUED)
        & (OutboundMessage.run_after <= DB_NOW)
        & (OutboundMessage.attempt < _MAX_ATTEMPTS)
        & ~_blocked()
    )
    if ids is not None:
        condition = condition & OutboundMessage.id.in_(ids)

    picked = (await db.execute(
        select(OutboundMessage.id).where(condition)
        .order_by(OutboundMessage.id).limit(1).with_for_update(skip_locked=True)
    )).scalar_one_or_none()
    if picked is None:
        await db.rollback()
        return None

    try:
        row = (await db.execute(
            update(OutboundMessage)
            .where(OutboundMessage.id == picked, OutboundMessage.status == QUEUED)
            .values(status=SENDING, attempt=OutboundMessage.attempt + 1,
                    locked_by=worker[:64], locked_at=DB_NOW)
            .returning(OutboundMessage.id, OutboundMessage.attempt, OutboundMessage.studio_id,
                       OutboundMessage.thread_id, OutboundMessage.payload,
                       OutboundMessage.origin)
        )).one_or_none()
    except IntegrityError:
        # Частичный UNIQUE отбил вторую одновременную отправку в тред. Это не
        # ошибка, а именно та защита, ради которой индекс и заведён.
        await db.rollback()
        logger.info("outbound_thread_busy outbound_id=%s worker=%s", picked, worker)
        return None
    if row is None:
        await db.rollback()
        return None

    thread = (await db.execute(
        select(ChannelThread.channel, ChannelThread.sender_ref)
        .where(ChannelThread.id == row.thread_id)
    )).one()
    await db.commit()
    logger.info("outbound_claimed outbound_id=%s attempt=%s thread_id=%s worker=%s",
                row.id, row.attempt, row.thread_id, worker)
    return Claimed(row.id, row.attempt, row.studio_id, row.thread_id,
                   thread.channel, thread.sender_ref, row.payload, row.origin)


async def _finalize(db, message: Claimed, **values) -> bool:
    """Записать исход попытки. False — попытку уже перехватили, писать нельзя.

    Fencing по номеру попытки: очнувшийся зомби не поставит ни accepted, ни
    failed, ни provider_message_id поверх состояния нового владельца.
    """
    changed = (await db.execute(
        update(OutboundMessage)
        .where(OutboundMessage.id == message.id,
               OutboundMessage.attempt == message.token,
               OutboundMessage.status == SENDING)
        .values(**values)
        .returning(OutboundMessage.id)
    )).scalar_one_or_none()
    await db.commit()
    if changed is None:
        logger.warning("outbound_fencing_rejected outbound_id=%s attempt=%s",
                       message.id, message.token)
        return False
    return True


def _backoff(attempt: int) -> int:
    return _BACKOFF_SECONDS[min(attempt, len(_BACKOFF_SECONDS)) - 1]


async def record(db, message: Claimed, result: channels.SendResult) -> str:
    """Разложить исход попытки в состояние строки. Возвращает итог для лога."""
    from services.agent_jobs import _interval

    if result.outcome == channels.ACCEPTED:
        ok = await _finalize(db, message, status=ACCEPTED, accepted_at=DB_NOW,
                             provider_message_id=result.provider_message_id,
                             locked_by=None, last_error=None)
        if ok:
            logger.info("outbound_accepted outbound_id=%s provider_message_id=%s",
                        message.id, result.provider_message_id)
        return ACCEPTED if ok else "stale"

    if result.outcome == channels.AUTH:
        # ERROR намеренно: интеграция студии сломана, чинит человек, и alerts.py
        # поднимет это в Telegram платформы.
        logger.error("outbound_failed outbound_id=%s studio_id=%s reason=auth %s",
                     message.id, message.studio_id, result.error)
        await _finalize(db, message, status=FAILED, locked_by=None, last_error=result.error)
        return FAILED

    if result.outcome == channels.PERMANENT:
        logger.warning("outbound_failed outbound_id=%s reason=permanent %s", message.id, result.error)
        await _finalize(db, message, status=FAILED, locked_by=None, last_error=result.error)
        return FAILED

    # RETRY и UNKNOWN. Разница между ними — в бюджете: неизвестный исход мы
    # повторяем ровно _UNKNOWN_RETRIES раз, потому что каждый такой повтор
    # может обернуться вторым сообщением у человека.
    unknown = result.outcome == channels.UNKNOWN
    budget = _UNKNOWN_RETRIES + 1 if unknown else _MAX_ATTEMPTS
    if unknown:
        logger.warning("outbound_unknown_outcome outbound_id=%s attempt=%s %s",
                       message.id, message.token, result.error)
    if message.token >= min(budget, _MAX_ATTEMPTS):
        logger.error("outbound_failed outbound_id=%s attempt=%s reason=exhausted %s",
                     message.id, message.token, result.error)
        await _finalize(db, message, status=FAILED, locked_by=None, last_error=result.error)
        return FAILED

    delay = result.retry_after if result.retry_after is not None else _backoff(message.token)
    await _finalize(db, message, status=QUEUED, locked_by=None, last_error=result.error,
                    run_after=DB_NOW + _interval(int(delay)))
    logger.info("outbound_retry outbound_id=%s attempt=%s after=%ss", message.id, message.token, delay)
    return "retry"


# Origin'ы, которые являются ОТВЕТОМ на собственное сообщение человека. Такое
# сообщение не требует рекламного согласия — оно требуется на то, чего человек
# не просил.
TRANSACTIONAL_ORIGINS = ("agent",)


async def allowed(message: Claimed) -> bool:
    """Можно ли отправить это сообщение ПРЯМО СЕЙЧАС.

    Операционный ответ (человек написал — мы отвечаем) разрешён всегда: молчать
    в ответ на прямой вопрос было бы не защитой приватности, а поломкой. Всё
    остальное — рассылки, напоминания «просто так», акции — спрашивает
    согласие у личности, и спрашивает в момент отправки.

    СЕЙЧАС В ОЧЕРЕДЬ ПОПАДАЕТ ТОЛЬКО ОПЕРАЦИОННОЕ, поэтому лишнего запроса эта
    проверка не делает. Но граница стоит в коде, а не в обещании: первое же
    рекламное сообщение упрётся в неё, а не в чью-то память о том, что тут
    надо было спросить.
    """
    if message.origin in TRANSACTIONAL_ORIGINS:
        return True
    from services import identity

    async with async_session_maker() as db:
        row = (await db.execute(
            select(CustomerIdentity.id).where(
                CustomerIdentity.studio_id == message.studio_id,
                CustomerIdentity.channel == message.channel,
                CustomerIdentity.subject == message.recipient,
            )
        )).scalar_one_or_none()
        if row is None:
            # Личности нет — согласия тоже нет. Рекламу незнакомцу не шлём.
            return False
        return await identity.may_send(db, studio_id=message.studio_id,
                                       identity_id=row, promotional=True)


async def deliver(message: Claimed, transport: str) -> str:
    """Одна попытка: сеть, затем короткая транзакция с исходом.

    Между ними открытой транзакции нет — это и есть весь смысл разделения.
    """
    from services.channels import instagram, telegram, whatsapp
    from services.inbound import INSTAGRAM, TELEGRAM, WHATSAPP

    if not await allowed(message):
        # Согласие спрашивается ЗДЕСЬ, а не при постановке в очередь: между тем
        # и другим проходит время, и отозванное «пишите мне» обязано
        # остановить сообщение, которое ещё не ушло.
        async with async_session_maker() as db:
            await _finalize(db, message, status=FAILED, error="согласие отозвано")
            await db.commit()
        logger.info("outbound_consent_blocked outbound_id=%s studio_id=%s",
                    message.id, message.studio_id)
        return FAILED

    sender = {TELEGRAM: telegram.send, INSTAGRAM: instagram.send, WHATSAPP: whatsapp.send}
    send = sender.get(message.channel)
    if send is None:
        result = channels.SendResult(channels.PERMANENT, error=f"нет транспорта для {message.channel}")
    else:
        result = await send(transport, message.recipient, message.payload)

    async with async_session_maker() as db:
        return await record(db, message, result)


async def reclaim_stale(session_maker=None) -> int:
    """Вернуть в очередь попытки, чей процесс умер.

    ЧЕСТНО О СЕМАНТИКЕ: `sending` означает только «попытку кто-то взял», а не
    «сетевой вызов точно начался». Различить «умер до вызова» и «умер после
    того, как провайдер принял» локально нечем — ответа мы не увидели. Поэтому
    возврат в очередь может обернуться вторым сообщением у человека, и это
    сознательная плата за то, чтобы ответ не пропал совсем.
    """
    from services.agent_jobs import _interval

    maker = session_maker or async_session_maker
    async with maker() as db:
        rows = (await db.execute(
            update(OutboundMessage)
            .where(OutboundMessage.status == SENDING,
                   OutboundMessage.locked_at < DB_NOW - _interval(_STALE_SENDING_SECONDS))
            .values(status=QUEUED, locked_by=None, run_after=DB_NOW)
            .returning(OutboundMessage.id)
        )).scalars().all()
        await db.commit()
    for row_id in rows:
        logger.warning("outbound_reclaimed outbound_id=%s", row_id)
    return len(rows)


async def purge(session_maker=None) -> int:
    """Удалить текст завершённых сообщений старше срока хранения.

    Живое (queued/sending) не трогаем никогда, каким бы старым ни было: это
    работа, которую ещё собираются сделать.
    """
    from sqlalchemy import delete

    from services.agent_jobs import _interval

    maker = session_maker or async_session_maker
    async with maker() as db:
        removed = (await db.execute(
            delete(OutboundMessage).where(
                OutboundMessage.status.in_([ACCEPTED, FAILED]),
                OutboundMessage.created_at < DB_NOW - _interval(int(_RETENTION.total_seconds())),
            )
        )).rowcount
        await db.commit()
    if removed:
        logger.info("outbound_purged removed=%s retention_days=%s", removed, _RETENTION.days)
    return removed


async def pending_stats(session_maker=None) -> dict:
    """Метрики очереди: сколько ждёт, сколько зависло, возраст самого старого."""
    maker = session_maker or async_session_maker
    async with maker() as db:
        by_status = dict((await db.execute(
            select(OutboundMessage.status, func.count()).group_by(OutboundMessage.status)
        )).all())
        oldest = (await db.execute(
            select(func.min(OutboundMessage.created_at)).where(OutboundMessage.status == QUEUED)
        )).scalar_one_or_none()
        stale = (await db.execute(
            select(func.count()).select_from(OutboundMessage).where(
                OutboundMessage.status == SENDING,
                OutboundMessage.locked_at < DB_NOW - func.make_interval(
                    0, 0, 0, 0, 0, 0, _STALE_SENDING_SECONDS),
            )
        )).scalar_one()
        await db.rollback()
    return {"by_status": by_status, "oldest_queued_at": oldest, "stale_sending": stale}


if __name__ == "__main__":
    # Самопроверка без БД: ключ и откат — единственная чистая логика модуля.
    assert reply_key(42) == "agent-job:42:reply"
    assert reply_key(42) != reply_key(43)
    assert _backoff(1) == 10 and _backoff(2) == 30
    assert _backoff(99) == _BACKOFF_SECONDS[-1]              # за пределом — потолок
    assert len(_BACKOFF_SECONDS) >= _MAX_ATTEMPTS
    assert _STALE_SENDING_SECONDS > 10, "порог ниже сетевого таймаута канала"
    assert _UNKNOWN_RETRIES < _MAX_ATTEMPTS, "неизвестный исход не должен повторяться как обычный"
    print("outbound self-check ok")
