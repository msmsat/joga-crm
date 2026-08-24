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
from services import agent_jobs

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

    if by_status.get(agent_jobs.FAILED):
        print("ВНИМАНИЕ: есть работы, исчерпавшие попытки, — их никто не переберёт")
    if len(waiting) > threshold:
        print(f"ТРЕВОГА: очередь длиннее {threshold}. Воркер поднят? `docker compose ps worker`")
        return 1
    return 0


def main() -> None:
    threshold = int(sys.argv[1]) if len(sys.argv) > 1 else _DEFAULT_THRESHOLD
    raise SystemExit(asyncio.run(_report(threshold)))


if __name__ == "__main__":
    main()
