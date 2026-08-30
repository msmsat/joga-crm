"""Обработка принятых событий: владение, попытки, восстановление (P0.2 → P0.3).

Здесь живёт то, чего не должно быть в InboundEvent, — состояние обработки.
Разделение не косметическое: строка приёма обязана оставаться неизменяемой
историей «что пришло», а перехват зависшей попытки её бы переписывал.

ДВА ЗАМКА, А НЕ ОДИН
  1. Работа. `claim_next` берёт строку через `FOR UPDATE SKIP LOCKED`: два
     воркера физически не могут взять одну работу, и второй не ждёт первого, а
     сразу идёт за следующей.
  2. Разговор. Взять работу мало — соседняя работа того же треда запустила бы
     второй ход агента параллельно. Аренду разговора выдаёт services/threads.

ПОЧЕМУ ЭТО НЕ ОДНО И ТО ЖЕ. Занятый тред — НЕ неудача обработки. Работа
возвращается в очередь с отступом и БЕЗ списания попытки: иначе три подряд
пришедших сообщения одного человека сожгли бы бюджет попыток друг другу, и
третье было бы объявлено сбойным, ни разу не дойдя до модели.

ЧАСЫ ТОЛЬКО СЕРВЕРНЫЕ (`threads.DB_NOW`). С одним процессом разницы нет, с
десятью расхождение часов означало бы, что один воркер считает попытку
протухшей, а другой — живой.

ВОССТАНОВЛЕНИЕ — ЭТО САМА ВЫБОРКА, а не отдельный проход: `claim_next` берёт и
никем не взятые работы, и брошенные посреди попытки. Отдельного «сборщика
зависших» нет, потому что он был бы вторым способом делать то же самое.

В СЕТЬ С СООБЩЕНИЯМИ ЭТОТ МОДУЛЬ НЕ ХОДИТ (P0.4). Ход заканчивается строкой в
очереди исходящих, записанной той же транзакцией, что закрывает работу.
«Работа выполнена» значит «ответ надёжно записан», а не «ответ доставлен».
"""
import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import NamedTuple

from sqlalchemy import delete, exists, func, select, update
from sqlalchemy.ext.asyncio import async_sessionmaker

from database import async_session_maker
from models import AgentJob, InboundEvent
from services import outbound, threads
from services.threads import DB_NOW

logger = logging.getLogger(__name__)

PENDING, RUNNING, DONE, FAILED = "pending", "running", "done", "failed"

# ─── Времена. Соотношение между ними — не вкусовщина, а требование ───────────
# Замер по коду, а не на глаз: клиентский цикл делает не больше
# _MAX_ITERATIONS=4 обращений к модели (services/client_agent), каждое — до двух
# попыток по 60 с таймаута (services/llm._request_json, _TIMEOUT_SECONDS). Две
# подряд неудачные попытки обрывают запрос целиком, поэтому потолок одной
# итерации — таймаут плюс медленный успех, ~120 с. Потолок хода: 4 × 120 = 480 с.
_AGENT_MAX_SECONDS = 480
# Жёсткий предел хода. Выше замеренного потолка — законный медленный ход не
# должен обрываться; ниже аренды — к моменту, когда тред разрешено перехватить,
# прежний ход гарантированно уже не выполняется. Это и позволяет обойтись без
# heartbeat: срок аренды подпёрт не обещанием, а таймаутом исполнения.
AGENT_DEADLINE_SECONDS = 600
# Аренда разговора: запас в 50% над предельным ходом.
LEASE_TTL_SECONDS = 900
# Работа, взятая раньше этого, считается брошенной вместе со своим процессом.
# Совпадает с арендой намеренно: оба срока отвечают на один вопрос — «этот
# исполнитель уже точно мёртв?».
_STALE_CLAIM_SECONDS = LEASE_TTL_SECONDS
# Столько раз пробуем, прежде чем оставить работу человеку. Ответ в чат, не
# удавшийся трижды, четвёртый раз тоже не удастся, а клиенту он уже не нужен.
_MAX_ATTEMPTS = 3
# Отступ, когда разговор занят соседней работой. Короткий: обычный ход идёт
# секунды, и ждать дольше значит отвечать человеку с задержкой.
_BUSY_RETRY_SECONDS = 5
# Откат после неудачной попытки. Провайдер, ответивший ошибкой, редко чинится
# мгновенно, но и ждать минутами клиенту нечего.
_RETRY_BACKOFF_SECONDS = (30, 60, 60)
# Сколько живёт текст сообщения клиента. Это персональные данные клиента чужого
# бизнеса, и держим мы их ровно ради одного — доделать обработку после сбоя.
_RETENTION = timedelta(days=30)


class Claim(NamedTuple):
    """Взятая работа: чем её делать и чем закрывать.

    token — номер попытки, fencing самой работы. Аренда разговора появляется
    позже и имеет свой, независимый токен.
    """
    job_id: int
    token: int
    studio_id: int
    channel: str
    sender: str
    text: str


def _interval(seconds: int):
    """Интервал на серверных часах: make_interval, а не timedelta из процесса."""
    return func.make_interval(0, 0, 0, 0, 0, 0, seconds)


def _available():
    """Работа, которую можно брать: ждущая исполнителя или брошенная посреди
    попытки, с невыбранным бюджетом и наступившим сроком."""
    return (
        (AgentJob.attempt < _MAX_ATTEMPTS)
        & (AgentJob.run_after <= DB_NOW)
        & (
            (AgentJob.status == PENDING)
            | ((AgentJob.status == RUNNING)
               & (AgentJob.claimed_at < DB_NOW - _interval(_STALE_CLAIM_SECONDS)))
        )
    )


async def claim_next(db, owner: str, job_ids: list[int] | None = None) -> Claim | None:
    """Взять следующую доступную работу. None — брать нечего.

    `FOR UPDATE SKIP LOCKED` — арбитр: строка, которую уже держит соседний
    воркер, не блокирует нас, а пропускается. Без SKIP LOCKED десять воркеров
    выстроились бы в очередь к одной строке и работали по одному.

    job_ids ограничивает набор кандидатов и нужен ТОЛЬКО тестам: прогон идёт в
    общей dev-БД, и глобальная выборка забрала бы живую работу соседней сессии,
    выполнив её подставным обработчиком.
    """
    condition = _available() if job_ids is None else _available() & AgentJob.id.in_(job_ids)
    picked = (await db.execute(
        select(AgentJob.id).where(condition).order_by(AgentJob.id)
        .limit(1).with_for_update(skip_locked=True)
    )).scalar_one_or_none()
    if picked is None:
        await db.rollback()
        return None

    token = (await db.execute(
        update(AgentJob).where(AgentJob.id == picked)
        .values(status=RUNNING, attempt=AgentJob.attempt + 1, claimed_at=DB_NOW)
        .returning(AgentJob.attempt)
    )).scalar_one()
    event = (await db.execute(
        select(InboundEvent).join(AgentJob, AgentJob.inbound_event_id == InboundEvent.id)
        .where(AgentJob.id == picked)
    )).scalar_one()
    work = Claim(picked, token, event.studio_id, event.provider, event.sender_ref, event.text)
    await db.commit()
    logger.info("job_claimed job_id=%s attempt=%s studio_id=%s owner=%s",
                work.job_id, work.token, work.studio_id, owner)
    return work


async def finish(db, job_id: int, token: int) -> bool:
    """Закрыть работу успехом. False — токен устарел, работу ведёт уже не мы.

    НЕ коммитит: вызывается внутри финальной транзакции вместе с проверкой
    аренды, и коммит здесь разорвал бы их на две.
    """
    closed = (await db.execute(
        update(AgentJob)
        .where(AgentJob.id == job_id, AgentJob.attempt == token, AgentJob.status == RUNNING)
        .values(status=DONE, finished_at=DB_NOW, last_error=None)
        .returning(AgentJob.id)
    )).scalar_one_or_none()
    if closed is None:
        logger.warning("thread_fencing_rejected job_id=%s attempt=%s reason=stale_job_token",
                       job_id, token)
        return False
    return True


async def release(db, job_id: int, token: int, error: str) -> None:
    """Вернуть работу после НЕУДАЧИ: снова pending с откатом, на последней — failed.

    НЕ коммитит: снятие аренды и возврат работы обязаны лечь одной транзакцией.
    Разорви их — и падение между коммитами оставит свободный разговор при
    работе, которая всё ещё числится выполняемой.
    """
    backoff = _RETRY_BACKOFF_SECONDS[min(token, len(_RETRY_BACKOFF_SECONDS)) - 1]
    exhausted = token >= _MAX_ATTEMPTS
    row = (await db.execute(
        update(AgentJob)
        .where(AgentJob.id == job_id, AgentJob.attempt == token, AgentJob.status == RUNNING)
        .values(
            status=FAILED if exhausted else PENDING,
            last_error=error[:500],
            finished_at=DB_NOW if exhausted else None,
            run_after=DB_NOW + _interval(backoff),
        )
        .returning(AgentJob.status)
    )).scalar_one_or_none()
    if row == FAILED:
        logger.error("job_failed job_id=%s attempt=%s error=%s", job_id, token, error[:200])
    elif row is not None:
        logger.info("job_retry job_id=%s attempt=%s after=%ss", job_id, token, backoff)


async def requeue_busy(db, job_id: int, token: int) -> None:
    """Вернуть работу, когда разговор занят соседней работой.

    Попытку СНИМАЕМ: ход агента не начинался, и списывать за это бюджет значит
    объявлять сбойным сообщение, которое просто пришло вторым. Fenced по
    attempt — вернуть работу может только её текущий владелец, и он после этого
    немедленно выходит, поэтому вернувшийся номер некому переиспользовать.
    """
    await db.execute(
        update(AgentJob)
        .where(AgentJob.id == job_id, AgentJob.attempt == token, AgentJob.status == RUNNING)
        .values(status=PENDING, attempt=AgentJob.attempt - 1,
                run_after=DB_NOW + _interval(_BUSY_RETRY_SECONDS))
    )
    await db.commit()
    logger.info("thread_lease_busy job_id=%s attempt_returned=%s", job_id, token)


# ─── Исполнение ──────────────────────────────────────────────────────────────

async def _transport(db, studio_id: int, channel: str) -> str:
    """Реквизиты канала для ответа. Выводятся из studio_id, а НЕ хранятся в
    событии: это боевые токены, и в журнале приёма им не место."""
    from models import BookingChannelConfig, StudioIntegration
    from services.inbound import INSTAGRAM, TELEGRAM, WHATSAPP

    if channel == INSTAGRAM:
        return ""   # client_agent._send берёт ig_token из настроек студии сам
    if channel == TELEGRAM:
        row = (await db.execute(select(BookingChannelConfig).where(
            BookingChannelConfig.studio_id == studio_id,
            BookingChannelConfig.channel_type == "telegram",
            BookingChannelConfig.is_active == True,  # noqa: E712
        ))).scalars().first()
        return (row.config or {}).get("token", "") if row else ""
    if channel == WHATSAPP:
        row = (await db.execute(select(StudioIntegration).where(
            StudioIntegration.studio_id == studio_id,
            StudioIntegration.integration_type == "wa_notify",
            StudioIntegration.is_connected == True,  # noqa: E712
        ))).scalar_one_or_none()
        config = (row.config or {}) if row else {}
        return f"{config.get('phone_number_id', '')}|{config.get('token', '')}"
    return ""


async def _handle(work: Claim, thread_id: int) -> "AgentTurn":
    """Провести ход и вернуть НАМЕРЕНИЕ ответить, ничего не отправляя.

    Возвращает канонический смысл ответа и — для пути P1.5 — условия разговора
    со списком показанных вариантов. Всё это ляжет ОДНОЙ транзакцией выше:
    отправка и память обязаны появляться вместе, иначе возможен список,
    которого человек не получал.

    Пустой payload — отвечать не нужно (агент выключен, квота, антиспам).
    Отправкой занимается очередь исходящих: с P0.4 воркер агента в сеть с
    сообщениями не ходит вовсе.

    Импорты локальные: роутеры зовут этот модуль, обратный импорт на уровне
    модуля дал бы цикл.
    """
    from routers.booking.telegram_webhook import _is_start, greeting
    from services.client_agent import produce_reply
    from services.inbound import TELEGRAM

    async with async_session_maker() as db:
        token = await _transport(db, work.studio_id, work.channel)

    if work.channel == TELEGRAM and _is_start(work.text):
        # Приветствие детерминировано и модели не требует — но в очередь идёт
        # тем же путём, что и ответ агента: иначе у нас снова два способа
        # отправить сообщение и одно из них без durable-гарантии.
        async with async_session_maker() as db:
            return AgentTurn(await greeting(db, work.studio_id))

    search_turn = await _search_turn(work, thread_id)
    if search_turn is not None:
        return search_turn

    text = await produce_reply(work.studio_id, work.channel, work.sender, work.text, token)
    return AgentTurn({"text": text} if text else None)


@dataclass(frozen=True)
class AgentTurn:
    """Что записать по итогам хода: ответ и, для пути P1.5, память разговора."""
    payload: dict | None = None
    state: object = None
    shown: tuple = ()
    new_search: bool = False
    # Момент, от которого ход считал даты. Один на весь ход: срок ссылок и
    # границы «завтра» обязаны быть посчитаны по одним часам.
    now: datetime | None = None


async def _search_turn(work: Claim, thread_id: int):
    """Путь P1.5: расписание через типизированный поиск. None — путь выключен
    или модель не дала разбора, и ход идёт прежней дорогой.

    Флаг решает ровно одно: заводить ли НОВЫЕ разговоры этим путём. Уже
    записанные состояния, ссылки и очередь исходящих обслуживаются всегда —
    выключение не должно ломать кнопки, которые человек уже видит.
    """
    from services import agent_search, feature_flags

    async with async_session_maker() as db:
        if not await feature_flags.is_enabled(
                db, work.studio_id, feature_flags.StudioFeature.AGENT_SEARCH_V2):
            return None

    raw = await agent_search.parse(work.text)
    if raw is None:
        return None

    async with async_session_maker() as db:
        turn = await agent_search.turn(
            db, studio_id=work.studio_id, thread_id=thread_id,
            channel=work.channel, text=work.text, raw=raw)
        await db.rollback()
    return AgentTurn(turn.payload, turn.state, tuple(turn.shown), turn.new_search,
                     turn.reference_now)


async def process(work: Claim, owner: str) -> str:
    """Провести одну взятую работу: аренда разговора → ход → закрытие.

    Возвращает исход — done / busy / retry / failed / stale. Границы транзакций
    расставлены так, что ни один сетевой вызов не оказывается внутри открытой:

        TX1  завести тред, занять аренду                (короткая, коммит)
        --   ход агента и отправка ответа               (транзакций нет вовсе)
        TX2  проверить fencing, закрыть работу,
             снять аренду                               (короткая, один коммит)
    """
    async with async_session_maker() as db:
        thread_id = await threads.get_or_create(db, work.studio_id, work.channel, work.sender)
        await db.commit()
        lease = await threads.acquire(db, thread_id, owner, LEASE_TTL_SECONDS)

    if lease is None:
        # Разговор ведёт соседняя работа. Не крутимся в ожидании: возвращаем
        # работу в очередь с отступом и идём за следующей.
        async with async_session_maker() as db:
            await requeue_busy(db, work.job_id, work.token)
        return "busy"
    logger.info("thread_lease_acquired job_id=%s thread_id=%s lease_seq=%s owner=%s",
                work.job_id, thread_id, lease.seq, owner)

    try:
        async with asyncio.timeout(AGENT_DEADLINE_SECONDS):
            turn = await _handle(work, thread_id)
    except Exception as exc:
        async with async_session_maker() as db:
            await threads.release(db, lease)
            await release(db, work.job_id, work.token, f"{type(exc).__name__}: {exc}")
            await db.commit()
        logger.exception("job_retry job_id=%s attempt=%s — ход не удался", work.job_id, work.token)
        return "failed" if work.token >= _MAX_ATTEMPTS else "retry"

    # Финал ОДНОЙ транзакцией: намерение ответить, закрытие работы и снятие
    # аренды либо ложатся вместе, либо не ложатся вовсе. Это и есть замена
    # двойной записи «сеть + БД»: упасть до коммита — ход повторится с нуля,
    # упасть после — ответ уже durable и уйдёт без нас.
    async with async_session_maker() as db:
        if not await threads.still_owned(db, lease):
            # Нас перехватили, пока шёл ход. Ответ никуда не ушёл — в сеть мы
            # больше не ходим, — и записывать за нового владельца мы не вправе.
            await db.rollback()
            logger.warning("thread_fencing_rejected job_id=%s thread_id=%s lease_seq=%s",
                           work.job_id, thread_id, lease.seq)
            return "stale"
        if turn.payload:
            await outbound.enqueue(
                db, studio_id=work.studio_id, thread_id=thread_id,
                dedup_key=outbound.reply_key(work.job_id), payload=turn.payload,
            )
        if turn.state is not None:
            # Память разговора ложится ТОЙ ЖЕ транзакцией, что и ответ. Порознь
            # они дали бы состояние «сервер считает варианты показанными, а
            # человек их не получил» — ровно то, чего быть не должно.
            from services import search_state
            await search_state.commit(
                db, studio_id=work.studio_id, thread_id=thread_id, state=turn.state,
                shown=turn.shown, now=turn.now, new_search=turn.new_search,
            )
        closed = await finish(db, work.job_id, work.token)
        await threads.release(db, lease)
        await db.commit()
    if closed:
        logger.info("job_done job_id=%s attempt=%s thread_id=%s", work.job_id, work.token, thread_id)
    return "done" if closed else "stale"


# ─── Обслуживание ────────────────────────────────────────────────────────────

async def stuck_ids(session_maker: async_sessionmaker = None, limit: int = 100) -> list[int]:
    """Работы, ждущие исполнителя. Отдельно от исполнения — чтобы «что видит
    очередь» можно было посмотреть, ничего не запуская, и чтобы было чем мерить
    отставание, когда воркер не поднят."""
    maker = session_maker or async_session_maker
    async with maker() as db:
        rows = list((await db.execute(
            select(AgentJob.id).where(_available()).order_by(AgentJob.id).limit(limit)
        )).scalars().all())
        await db.rollback()
        return rows


async def purge(session_maker: async_sessionmaker = None) -> int:
    """Удалить старые принятые события вместе с их завершёнными работами.

    ЖИВУЮ РАБОТУ НЕ ТРОГАЕМ, даже если событию месяц. Каскад по внешнему ключу
    снёс бы её молча вместе с текстом, без которого её уже не восстановить.
    Условие проверяет не возраст работы, а её терминальность: это свойство
    хранилища, а не предположение о том, что работы столько не живут.

    Идемпотентна и безопасна при нескольких воркерах: два одновременных прохода
    удаляют одно и то же множество, второй просто не находит строк. Отдельный
    лок ради этого не нужен.
    """
    maker = session_maker or async_session_maker
    alive = exists().where(
        (AgentJob.inbound_event_id == InboundEvent.id) & (AgentJob.status.notin_([DONE, FAILED]))
    )
    async with maker() as db:
        removed = (await db.execute(
            delete(InboundEvent).where(
                InboundEvent.received_at < DB_NOW - _interval(int(_RETENTION.total_seconds())),
                ~alive,
            )
        )).rowcount
        await db.commit()
    if removed:
        logger.info("purge_done removed=%s retention_days=%s", removed, _RETENTION.days)
    return removed


if __name__ == "__main__":
    # Самопроверка без БД: соотношения времён, на которых держится аренда без
    # heartbeat. Разъедутся — перехват станет возможен посреди живого хода.
    assert AGENT_DEADLINE_SECONDS > _AGENT_MAX_SECONDS, "предел хода ниже замеренного потолка"
    assert LEASE_TTL_SECONDS > AGENT_DEADLINE_SECONDS, "аренда истекает раньше предела хода"
    assert LEASE_TTL_SECONDS >= AGENT_DEADLINE_SECONDS * 1.5, "запас аренды меньше половины хода"
    assert _STALE_CLAIM_SECONDS == LEASE_TTL_SECONDS
    assert len(_RETRY_BACKOFF_SECONDS) >= _MAX_ATTEMPTS
    assert _BUSY_RETRY_SECONDS < 60, "занятый тред не повод ждать минуту"
    print("agent_jobs self-check ok")
