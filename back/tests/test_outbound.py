"""Очередь исходящих: durable-намерение вместо прямой отправки (P0.4).

Что здесь на самом деле проверяется: ответ, за который агент отчитался
«выполнено», не может пропасть, и два сообщения одного разговора не могут уйти
в провайдера не в том порядке. Всё это должно следовать из хранилища, а не из
того, кто во сколько успел, — поэтому таймингов нет: состояние подделывается
явно, и проверяется решение БД.

Сеть не трогаем ни разу: транспорт каждого канала подменён и возвращает
заранее заданный исход.

Реальная БД, ручная чистка. Запуск из back/:  python -m tests.test_outbound
"""
import asyncio
import uuid
import warnings

warnings.filterwarnings("ignore")

from sqlalchemy import delete, func, select, update

from database import async_session_maker
from models import (
    AgentJob, ChannelThread, InboundEvent, OutboundMessage, Studio, StudioAISettings,
    StudioBillingPlan,
)
from services import agent_jobs, channels, inbound, outbound, threads
from services.inbound import admit

_NAME_A = "TEST-OUTBOUND-A"
_NAME_B = "TEST-OUTBOUND-B"


class _Provider:
    """Подмена транспорта всех каналов. Отдаёт заготовленные исходы по очереди."""

    def __init__(self, *results):
        self.results = list(results)
        self.sent: list[tuple] = []
        self.gate: asyncio.Event = None
        self._saved = {}

    def install(self):
        from services.channels import instagram, telegram, whatsapp

        for module in (telegram, instagram, whatsapp):
            self._saved[module] = module.send

            async def _fake(transport, recipient, payload, _m=module):
                self.sent.append((_m.__name__.rsplit(".", 1)[-1], recipient, payload["text"]))
                if self.gate is not None:
                    await self.gate.wait()
                return self.results.pop(0) if self.results else \
                    channels.SendResult(channels.ACCEPTED, provider_message_id="pmid-1")
            module.send = _fake
        return self

    def restore(self):
        for module, original in self._saved.items():
            module.send = original


async def _seed() -> dict:
    async with async_session_maker() as db:
        a, b = Studio(name=_NAME_A), Studio(name=_NAME_B)
        db.add_all([a, b])
        await db.commit()
        db.add_all([
            StudioBillingPlan(studio_id=a.id, plan_name="pro"),
            StudioAISettings(studio_id=a.id, tg_enabled=True),
            StudioAISettings(studio_id=b.id, tg_enabled=True),
        ])
        await db.commit()
        return {"a": a.id, "b": b.id}


async def _cleanup(ids: dict) -> None:
    async with async_session_maker() as db:
        for sid in ids.values():
            await db.execute(delete(OutboundMessage).where(OutboundMessage.studio_id == sid))
            await db.execute(delete(InboundEvent).where(InboundEvent.studio_id == sid))
            await db.execute(delete(ChannelThread).where(ChannelThread.studio_id == sid))
            await db.execute(delete(StudioAISettings).where(StudioAISettings.studio_id == sid))
            await db.execute(delete(StudioBillingPlan).where(StudioBillingPlan.studio_id == sid))
            await db.execute(delete(Studio).where(Studio.id == sid))
        await db.commit()


async def _thread(studio_id: int, sender: str) -> int:
    async with async_session_maker() as db:
        tid = await threads.get_or_create(db, studio_id, inbound.TELEGRAM, sender)
        await db.commit()
        return tid


async def _queue(studio_id: int, thread_id: int, text: str, key: str = None) -> int:
    async with async_session_maker() as db:
        row_id = await outbound.enqueue(
            db, studio_id=studio_id, thread_id=thread_id,
            dedup_key=key or f"test:{uuid.uuid4().hex}", payload={"text": text},
        )
        await db.commit()
        return row_id


async def _row(row_id: int) -> OutboundMessage:
    async with async_session_maker() as db:
        return await db.get(OutboundMessage, row_id)


async def _take(ids: list[int], worker: str = "w"):
    async with async_session_maker() as db:
        return await outbound.claim_next(db, worker, ids=ids)


async def _age_lock(row_id: int, seconds: int) -> None:
    async with async_session_maker() as db:
        await db.execute(update(OutboundMessage).where(OutboundMessage.id == row_id)
                         .values(locked_at=func.now() - agent_jobs._interval(seconds)))
        await db.commit()


async def _due(row_id: int) -> None:
    async with async_session_maker() as db:
        await db.execute(update(OutboundMessage).where(OutboundMessage.id == row_id)
                         .values(run_after=func.now() - agent_jobs._interval(1)))
        await db.commit()


async def _deliver(message, transport: str = "token") -> str:
    return await outbound.deliver(message, transport)


async def _run():
    ids = await _seed()
    a, b = ids["a"], ids["b"]
    provider = _Provider().install()
    try:
        ta, tb = await _thread(a, "555"), await _thread(b, "777")

        # ── C. Два воркера на одну строку: владелец один.
        one = await _queue(a, ta, "первое")
        taken = [t for t in await asyncio.gather(
            _take([one], "w1"), _take([one], "w2"), _take([one], "w3")) if t is not None]
        assert len(taken) == 1, f"строку взяли {len(taken)} воркеров"
        assert taken[0].token == 1
        assert await _deliver(taken[0]) == outbound.ACCEPTED
        row = await _row(one)
        assert (row.status, row.provider_message_id) == (outbound.ACCEPTED, "pmid-1")
        assert row.accepted_at is not None

        # ── D. Два сообщения одного треда: раньше уходит только первое.
        first = await _queue(a, ta, "A")
        second = await _queue(a, ta, "B")
        got = await _take([first, second], "w1")
        assert got.id == first, "взяли не самое раннее"
        assert await _take([first, second], "w2") is None, "второе ушло, пока первое в полёте"

        # ── E. Разные треды идут параллельно: глобального мьютекса нет.
        other = await _queue(b, tb, "чужой разговор")
        parallel = await _take([other], "w2")
        assert parallel is not None, "сообщение другого треда заблокировано"
        assert await _deliver(parallel) == outbound.ACCEPTED

        # ── H. Fencing: перехваченный владелец не пишет исход.
        await _age_lock(first, outbound._STALE_SENDING_SECONDS + 60)
        assert await outbound.reclaim_stale() >= 1
        assert (await _row(first)).status == outbound.QUEUED
        retaken = await _take([first, second], "w3")
        assert retaken.id == first and retaken.token == 2
        # Зомби с первой попытки пытается закрыть строку.
        async with async_session_maker() as db:
            assert await outbound._finalize(db, got, status=outbound.ACCEPTED) is False, \
                "устаревший владелец записал исход"
        assert (await _row(first)).status == outbound.SENDING
        assert await _deliver(retaken) == outbound.ACCEPTED

        # ── L. Порядок: после ухода первого второе становится доступно.
        now_second = await _take([first, second], "w1")
        assert now_second is not None and now_second.id == second
        assert await _deliver(now_second) == outbound.ACCEPTED
        assert [t for _, _, t in provider.sent][-2:] == ["A", "B"], provider.sent

        # ── F. Падение после захвата, до сети: строка возвращается в очередь.
        crashed = await _queue(a, ta, "упадём до сети")
        claimed = await _take([crashed], "wDead")
        assert claimed is not None
        assert await outbound.reclaim_stale() == 0, "свежую попытку забрали как брошенную"
        await _age_lock(crashed, outbound._STALE_SENDING_SECONDS + 60)
        assert await outbound.reclaim_stale() >= 1
        assert (await _row(crashed)).status == outbound.QUEUED
        assert await _deliver(await _take([crashed], "wNext")) == outbound.ACCEPTED

        # ── G. Провайдер принял, но процесс умер до записи исхода: строка
        # возвращается и уходит второй раз. Дубль ЯВНО принимается как плата.
        twice = await _queue(a, ta, "может задвоиться")
        ghost = await _take([twice], "wGhost")
        provider.results = [channels.SendResult(channels.ACCEPTED, provider_message_id="pmid-ghost")]
        from services.channels import telegram as TGCH
        await TGCH.send("token", "555", {"text": "может задвоиться"})   # провайдер принял
        # ...и тут процесс умер, не записав исход.
        await _age_lock(twice, outbound._STALE_SENDING_SECONDS + 60)
        await outbound.reclaim_stale()
        again = await _take([twice], "wNew")
        assert again is not None and again.token == 2
        assert await _deliver(again) == outbound.ACCEPTED
        # Зомби всё ещё не имеет права ничего записать.
        async with async_session_maker() as db:
            assert await outbound._finalize(db, ghost, status=outbound.FAILED) is False

        # ── I. 429 с указанным сроком: не провал и не горячая петля.
        limited = await _queue(a, ta, "429")
        provider.results = [channels.SendResult(channels.RETRY, retry_after=77, error="429 rate limit")]
        assert await _deliver(await _take([limited], "w1")) == "retry"
        row = await _row(limited)
        assert row.status == outbound.QUEUED and row.attempt == 1
        assert await _take([limited], "w1") is None, "срок провайдера не соблюдён"
        await _due(limited)
        provider.results = []
        assert await _deliver(await _take([limited], "w1")) == outbound.ACCEPTED

        # ── J. Постоянный отказ 4xx: терминально, без бесконечных попыток.
        broken = await _queue(a, ta, "заблокировали бота")
        provider.results = [channels.SendResult(channels.PERMANENT, error="403 blocked")]
        provider.results = [channels.classify(400, detail="bot was blocked by the user")]
        assert await _deliver(await _take([broken], "w1")) == outbound.FAILED
        row = await _row(broken)
        assert (row.status, row.attempt) == (outbound.FAILED, 1), "постоянный отказ повторяли"
        assert "400" in row.last_error

        # ── §34. Терминально провалившееся НЕ блокирует разговор навсегда.
        after_failure = await _queue(a, ta, "следующее после провала")
        proceeds = await _take([after_failure], "w1")
        assert proceeds is not None, "провалившееся сообщение заперло разговор"
        assert await _deliver(proceeds) == outbound.ACCEPTED

        # ── K. Неизвестный исход: ровно один повтор, потом терминально.
        unknown = await _queue(a, ta, "таймаут")
        provider.results = [channels.SendResult(channels.UNKNOWN, error="TimeoutError"),
                            channels.SendResult(channels.UNKNOWN, error="TimeoutError")]
        assert await _deliver(await _take([unknown], "w1")) == "retry"
        await _due(unknown)
        assert await _deliver(await _take([unknown], "w1")) == outbound.FAILED
        row = await _row(unknown)
        assert (row.status, row.attempt) == (outbound.FAILED, 2), \
            "неизвестный исход повторяли как обычную ошибку"

        # ── Дедуп: повтор хода агента не заводит второе сообщение.
        key = f"agent-job:{uuid.uuid4().hex}:reply"
        assert await _queue(a, ta, "ответ", key) is not None
        assert await _queue(a, ta, "ответ, сформулированный иначе", key) is None
        async with async_session_maker() as db:
            same = (await db.execute(select(func.count()).select_from(OutboundMessage)
                                     .where(OutboundMessage.dedup_key == key))).scalar_one()
        assert same == 1

        # ── P. Чистка не трогает живое, забирает старое терминальное.
        alive = await _queue(a, ta, "ещё не отправлено")
        old = outbound._RETENTION.total_seconds() + 86400
        async with async_session_maker() as db:
            await db.execute(update(OutboundMessage)
                             .where(OutboundMessage.id.in_([alive, unknown]))
                             .values(created_at=func.now() - agent_jobs._interval(int(old))))
            await db.commit()
        await outbound.purge()
        assert await _row(alive) is not None, "чистка снесла неотправленное сообщение"
        assert await _row(unknown) is None, "старое терминальное не удалено"

        # ── Метрики: очередь видна, не поднимая воркера.
        stats = await outbound.pending_stats()
        assert stats["by_status"].get(outbound.QUEUED, 0) >= 1
        assert stats["oldest_queued_at"] is not None

        # ── A/B/M/N. Ход агента: намерение и работа ложатся одной транзакцией,
        # переживают рестарт, и в сеть при этом никто не ходит.
        await _agent_commit_atomicity(a)
    finally:
        provider.restore()
        await _cleanup(ids)


async def _agent_commit_atomicity(studio_id: int) -> None:
    """A, B, M, N: атомарность финальной транзакции хода и durability ответа."""
    sent_during_agent: list = []
    provider = _Provider().install()
    real_handle = agent_jobs._handle
    try:
        # ── A. Падение ДО финального коммита: ни работы done, ни строки в очереди.
        async def _boom(work, *_):
            raise RuntimeError("процесс умер после ответа модели")

        agent_jobs._handle = _boom
        # Свой отправитель, а значит и свой разговор: в треде «555» выше
        # намеренно оставлено неотправленное сообщение, и порядок держал бы
        # новое до него — правильное поведение, но не предмет этой проверки.
        crash = await admit(inbound.TELEGRAM, f"{studio_id}:{uuid.uuid4().hex}", studio_id,
                            inbound.MESSAGE, "999", "вопрос", {})
        async with async_session_maker() as db:
            work = await agent_jobs.claim_next(db, "wA", job_ids=[crash.job_id])
        assert await agent_jobs.process(work, "wA") == "retry"
        async with async_session_maker() as db:
            job = await db.get(AgentJob, crash.job_id)
            queued = (await db.execute(select(func.count()).select_from(OutboundMessage)
                                       .where(OutboundMessage.dedup_key
                                              == outbound.reply_key(crash.job_id)))).scalar_one()
        assert job.status != agent_jobs.DONE, "работа закрыта, хотя ход не дошёл до коммита"
        assert queued == 0, "намерение записано без успешного хода"
        assert provider.sent == [], "воркер агента ходил в сеть"

        # ── B. Повтор доходит до коммита: работа done, ОДНА строка в очереди,
        # и отправки при этом всё ещё не было.
        async def _ok(work, *_):
            return agent_jobs.AgentTurn({"text": "ответ агента"})

        agent_jobs._handle = _ok
        await _due_job(crash.job_id)
        async with async_session_maker() as db:
            work = await agent_jobs.claim_next(db, "wA", job_ids=[crash.job_id])
        assert await agent_jobs.process(work, "wA") == "done"
        async with async_session_maker() as db:
            job = await db.get(AgentJob, crash.job_id)
            row = (await db.execute(select(OutboundMessage).where(
                OutboundMessage.dedup_key == outbound.reply_key(crash.job_id)))).scalar_one()
        assert job.status == agent_jobs.DONE
        assert row.status == outbound.QUEUED and row.payload["text"] == "ответ агента"
        assert provider.sent == [], "ход агента отправил сообщение сам"

        # ── M/N. Строка пережила «рестарт» (новая сессия, новый воркер) и
        # уходит независимо от того, включён ли флаг раскатки: очередь не за
        # флагом, и выключение эксперимента не отменяет уже принятый ответ.
        from services.feature_flags import StudioFeature, is_enabled
        async with async_session_maker() as db:
            assert await is_enabled(db, studio_id, StudioFeature.AGENT_PIPELINE_V2) is False
        message = await _take([row.id], "wOutboundRestarted")
        assert message is not None, "committed-намерение не дошло до очереди"
        assert await _deliver(message) == outbound.ACCEPTED
        assert [t for _, _, t in provider.sent] == ["ответ агента"]
    finally:
        agent_jobs._handle = real_handle
        provider.restore()


async def _due_job(job_id: int) -> None:
    async with async_session_maker() as db:
        await db.execute(update(AgentJob).where(AgentJob.id == job_id)
                         .values(run_after=func.now() - agent_jobs._interval(1)))
        await db.commit()


def test_no_provider_send_outside_outbound():
    """§30. Отправка провайдеру разрешена ровно одному слою.

    Проверка по исходникам, а не по поведению: поведенческий тест ловит только
    те пути, которые кто-то догадался вызвать, а регрессия сюда приезжает
    ровно тогда, когда кто-то «просто быстренько» позовёт send из агента или
    роутера. Индикатор набора (sendChatAction) — не сообщение и разрешён:
    смысл он имеет только во время хода и доставлять его надёжно незачем.
    """
    import pathlib

    root = pathlib.Path(__file__).resolve().parent.parent
    allowed = {"services/outbound.py", "services/channels"}
    offenders = []
    for path in sorted(root.rglob("*.py")):
        rel = path.relative_to(root).as_posix()
        if rel.startswith(("venv/", "tests/", "workers/")) or any(rel.startswith(a) for a in allowed):
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        for marker in ("channels.telegram.send(", "channels.instagram.send(",
                       "channels.whatsapp.send(", "from services.channels import"):
            if marker in text and "send_typing" not in text.split(marker)[1][:80]:
                offenders.append(f"{rel}: {marker}")
    assert not offenders, "отправка провайдеру вне слоя доставки: " + "; ".join(offenders)


def test_outbound():
    asyncio.run(_run())


if __name__ == "__main__":
    test_outbound()
    print("ALL PASS")
