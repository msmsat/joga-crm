"""Отставание очереди работ агента.  Запуск из back/:  python -m scripts.queue_lag

ЗАЧЕМ. Если web выкачен, а воркер — нет, сообщения не теряются: работы копятся
в pending. Но копятся молча, потому что логи пишет тот, кого не запустили.
Единственный наблюдатель, не зависящий от живого воркера, — внешняя проверка,
и вот она.

Код возврата 1, когда очередь длиннее порога, — чтобы cron или мониторинг
подняли тревогу без разбора вывода.

    python -m scripts.queue_lag            # порог по умолчанию
    python -m scripts.queue_lag 50         # свой порог
"""
import asyncio
import sys

from sqlalchemy import func, select

from database import async_session_maker
from models import AgentJob
from services import agent_jobs, outbound

_DEFAULT_THRESHOLD = 20


async def _report(threshold: int) -> int:
    async with async_session_maker() as db:
        by_status = dict((await db.execute(
            select(AgentJob.status, func.count()).group_by(AgentJob.status)
        )).all())
    waiting = await agent_jobs.stuck_ids(limit=threshold + 1)

    print("Работы агента по статусам:")
    for status in (agent_jobs.PENDING, agent_jobs.RUNNING, agent_jobs.DONE, agent_jobs.FAILED):
        print(f"  {status:<8} {by_status.get(status, 0)}")
    print(f"Ждут исполнителя: {'>' if len(waiting) > threshold else ''}{min(len(waiting), threshold)}")

    stats = await outbound.pending_stats()
    print()
    print("Исходящие по статусам:")
    for status in (outbound.QUEUED, outbound.SENDING, outbound.ACCEPTED, outbound.FAILED):
        print(f"  {status:<9} {stats['by_status'].get(status, 0)}")
    oldest = stats["oldest_queued_at"]
    if oldest is not None:
        print(f"Самое старое неотправленное: {oldest:%Y-%m-%d %H:%M}")
    print(f"Зависших отправок: {stats['stale_sending']}")

    alarm = 0
    if by_status.get(agent_jobs.FAILED):
        print("ВНИМАНИЕ: есть работы, исчерпавшие попытки, — их никто не переберёт")
    if stats["by_status"].get(outbound.FAILED):
        # accepted значит «провайдер принял запрос», а не «человек прочитал»;
        # failed — что ответ не уйдёт никогда, и об этом должен узнать человек.
        print("ВНИМАНИЕ: есть ответы, которые не будут доставлены (failed)")
    if stats["stale_sending"]:
        print("ВНИМАНИЕ: отправки зависли — воркер жив? они вернутся в очередь сами")
    if len(waiting) > threshold:
        print(f"ТРЕВОГА: очередь работ длиннее {threshold}. Воркер поднят? `docker compose ps worker`")
        alarm = 1
    if stats["by_status"].get(outbound.QUEUED, 0) > threshold:
        print(f"ТРЕВОГА: очередь исходящих длиннее {threshold}")
        alarm = 1
    return alarm


def main() -> None:
    threshold = int(sys.argv[1]) if len(sys.argv) > 1 else _DEFAULT_THRESHOLD
    raise SystemExit(asyncio.run(_report(threshold)))


if __name__ == "__main__":
    main()
