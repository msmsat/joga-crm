"""Процесс-исполнитель: ходы агента и отправка (P0.3 → P0.4).

Запуск:  python -m workers.main

ЗАЧЕМ ОТДЕЛЬНЫЙ ПРОЦЕСС. До P0.3 ответы агента считались в web-процессе через
BackgroundTasks. Значит: деплой web обрывал ход на полуслове, нагрузка от модели
конкурировала с обслуживанием вебхуков, а масштабировать одно без другого было
нечем. Теперь web заканчивается на коммите приёма, а всё остальное — здесь.

НЕ SINGLETON. Воркеров может быть один, два или десять, и запускаться они могут
одновременно. Координации в памяти нет вовсе: работу раздаёт Postgres через
`FOR UPDATE SKIP LOCKED`, разговор сериализует аренда треда. Отсюда же
безопасность обслуживания: `purge` идемпотентен, и два прохода не мешают друг
другу — отдельный лок не нужен.

НЕ ЗА ФИЧЕФЛАГОМ. Флаг вправе решать, КАКОЙ реализацией агента отвечать, но не
то, разгребается ли очередь вообще. Как только вебхук в бою заводит работы, их
обязаны доигрывать независимо от раскатки экспериментов — иначе выключение
флага превращается в тихую потерю уже принятых сообщений.

ДВЕ ПЕТЛИ В ОДНОМ ПРОЦЕССЕ: ходы агента и отправка. Разделены, потому что
медленный вызов провайдера не должен останавливать обработку входящих; но это
именно петли, а не второй сервис — один код, один образ, один деплой.

ОСТАНОВКА. По SIGTERM перестаём брать новые работы и даём доработать текущей.
Не успела — процесс умрёт, а работа и аренда восстановятся сами: работа станет
брошенной, аренда истечёт. Именно поэтому сложный drain здесь не нужен.
"""
import asyncio
import logging
import os
import signal
import socket
import sys

from database import async_session_maker
from services import agent_jobs, outbound

logger = logging.getLogger("velora.worker")

# Пусто — брать нечего; спим и не жжём БД опросами. Секунда: человек в чате
# ждёт ответа, а запрос по частичному индексу стоит доли миллисекунды.
_IDLE_SLEEP = 1.0
# Откат при недоступной БД. Растёт до потолка, чтобы упавшая база не получила
# вдобавок тысячу переподключений в секунду от каждого воркера.
_ERROR_BACKOFF = (1, 2, 5, 10, 30)
# Чистку гоняем редко: она про срок хранения, а не про скорость ответа.
_PURGE_EVERY_SECONDS = 3600
# Сколько отправок идёт одновременно. Ограничение обязательно: без него на
# всплеске очереди воркер создал бы задачу на каждое сообщение и утопил бы и
# пул соединений, и лимиты провайдера. Число небольшое и намеренно константа —
# подбирать его до первых реальных цифр значит подбирать наугад.
_OUTBOUND_CONCURRENCY = 4
# Сколько ждём завершения текущего хода после SIGTERM. Больше типичного
# grace period контейнера смысла не имеет: там всё равно прилетит SIGKILL.
_SHUTDOWN_GRACE_SECONDS = 25


def worker_name() -> str:
    """Имя владельца аренды: только для разбора инцидентов. Решает не оно, а срок
    аренды, поэтому уникальность здесь удобство, а не требование корректности."""
    return f"{socket.gethostname()}:{os.getpid()}"[:64]


async def _purge_search_state() -> None:
    """Просроченные ссылки на показанные варианты и остывшие условия разговора.

    Тем же проходом, что и остальная уборка: это производные данные переписки,
    и жить вечно они не должны. Брони и платежи это не трогает — там свои сроки
    хранения (services/search_state.forget о том же).
    """
    from datetime import datetime, timezone

    from services import identity, search_state

    async with async_session_maker() as db:
        removed = await search_state.purge(db, now=datetime.now(timezone.utc))
        # Просроченные коды подтверждения — тем же проходом и НЕЗАВИСИМО от
        # флага: код, который некому погасить, живёт вечно, а это код доступа
        # к чужой карточке.
        codes = await identity.purge_codes(db)
        await db.commit()
    if removed:
        logger.info("option_ref_expired removed=%s ttl_minutes=%s",
                    removed, search_state.TTL_MINUTES)
    if codes:
        logger.info("verification_code_expired removed=%s", codes)


class Worker:
    def __init__(self, owner: str = None):
        self.owner = owner or worker_name()
        self.stopping = asyncio.Event()

    def stop(self) -> None:
        """Перестать брать новые работы. Текущая доигрывает."""
        if not self.stopping.is_set():
            logger.info("worker_stopping owner=%s", self.owner)
            self.stopping.set()

    async def _one(self) -> bool:
        """Одна работа агента. False — очередь пуста."""
        async with async_session_maker() as db:
            work = await agent_jobs.claim_next(db, self.owner)
        if work is None:
            return False
        await agent_jobs.process(work, self.owner)
        return True

    async def _outbound_loop(self) -> None:
        """Отправка идёт своей петлёй, чтобы медленный вызов провайдера не
        останавливал обработку входящих. Ограничение параллелизма — семафор, а
        не отдельный пул процессов."""
        limit = asyncio.Semaphore(_OUTBOUND_CONCURRENCY)
        running: set[asyncio.Task] = set()
        while not self.stopping.is_set():
            try:
                await limit.acquire()
                if not await self._send_one_guarded(limit, running):
                    await self._sleep(_IDLE_SLEEP)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("outbound_loop_iteration_failed owner=%s", self.owner)
                await self._sleep(_ERROR_BACKOFF[-1])
        if running:
            # Даём начатым отправкам договорить: убить их сейчас значит оставить
            # sending, который придётся перехватывать по сроку.
            await asyncio.wait(running, timeout=_SHUTDOWN_GRACE_SECONDS)

    async def _send_one_guarded(self, limit: asyncio.Semaphore, running: set) -> bool:
        """Взять сообщение и отправить в отдельной задаче. False — очередь пуста
        (семафор при этом сразу отпускается)."""
        async with async_session_maker() as db:
            message = await outbound.claim_next(db, self.owner)
        if message is None:
            limit.release()
            return False

        async def _run_one():
            try:
                async with async_session_maker() as db:
                    transport = await agent_jobs._transport(db, message.studio_id, message.channel)
                await outbound.deliver(message, transport)
            except Exception:
                # Строка останется sending и вернётся в очередь по сроку — это
                # честнее, чем пометить исход, которого мы не знаем.
                logger.exception("outbound_delivery_crashed outbound_id=%s", message.id)
            finally:
                limit.release()

        task = asyncio.create_task(_run_one())
        running.add(task)
        task.add_done_callback(running.discard)
        return True

    async def run(self) -> None:
        logger.info("worker_started owner=%s", self.owner)
        failures = 0
        purge_due = 0.0
        while not self.stopping.is_set():
            try:
                now = asyncio.get_running_loop().time()
                if now >= purge_due:
                    purge_due = now + _PURGE_EVERY_SECONDS
                    await agent_jobs.purge()
                    await outbound.purge()
                    await _purge_search_state()
                    # Попытки, чей процесс умер, возвращаем в очередь. Отдельного
                    # лока не нужно: это один идемпотентный UPDATE по сроку.
                    await outbound.reclaim_stale()

                if not await self._one():
                    await self._sleep(_IDLE_SLEEP)
                failures = 0
            except asyncio.CancelledError:
                raise
            except Exception:
                # Сюда попадает недоступная БД и всё, что не поймал process().
                # Выходить нельзя: перезапуск контейнера ничего не чинит, а
                # очередь тем временем копится (см. §23 задания).
                delay = _ERROR_BACKOFF[min(failures, len(_ERROR_BACKOFF) - 1)]
                failures += 1
                logger.exception("worker_iteration_failed owner=%s retry_in=%ss", self.owner, delay)
                await self._sleep(delay)
        logger.info("worker_stopped owner=%s", self.owner)

    async def _sleep(self, seconds: float) -> None:
        """Спать, но просыпаться на остановку: иначе SIGTERM ждёт полного сна."""
        try:
            await asyncio.wait_for(self.stopping.wait(), timeout=seconds)
        except asyncio.TimeoutError:
            pass


async def _main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
        stream=sys.stdout,
    )
    worker = Worker()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        try:
            loop.add_signal_handler(sig, worker.stop)
        except NotImplementedError:
            # Windows: add_signal_handler не поддержан. Боевой запуск идёт в
            # Linux-контейнере, но процесс обязан подниматься и на машине
            # разработчика.
            signal.signal(sig, lambda *_: worker.stop())

    tasks = [asyncio.create_task(worker.run()), asyncio.create_task(worker._outbound_loop())]
    task = asyncio.gather(*tasks)
    await worker.stopping.wait()
    try:
        await asyncio.wait_for(task, timeout=_SHUTDOWN_GRACE_SECONDS)
    except asyncio.TimeoutError:
        # Ход не уложился в grace period. Ничего не спасаем руками: работа
        # станет брошенной, аренда истечёт, следующий воркер продолжит.
        logger.warning("worker_shutdown_timeout owner=%s — работа будет восстановлена", worker.owner)


if __name__ == "__main__":
    asyncio.run(_main())
