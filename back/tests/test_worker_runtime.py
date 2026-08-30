"""Воркер-рантайм и сериализация разговора (P0.3).

Что здесь на самом деле проверяется: два человека, пишущих разным студиям,
обслуживаются параллельно, а два сообщения ОДНОГО человека — строго по очереди,
и результат исполнителя, у которого отобрали разговор, не попадает в базу
никогда. Всё это должно следовать из хранилища, а не из того, кто во сколько
успел, — поэтому таймингов в тестах нет: состояние подделывается явно (аренда
состаривается, попытка помечается протухшей), и проверяется решение БД.

Реальная БД, ручная чистка. Запуск из back/:  python -m tests.test_worker_runtime
"""
import asyncio
import json
import uuid
import warnings
from datetime import datetime, timedelta

warnings.filterwarnings("ignore")

from sqlalchemy import delete, func, select, update

import routers.booking.telegram_webhook as TG
from database import async_session_maker
from models import (
    AgentJob, BookingChannelConfig, ChannelThread, InboundEvent, OutboundMessage,
    Studio, StudioAISettings, StudioBillingPlan,
)
from services import agent_jobs, inbound, threads
from services.inbound import admit
from workers.main import Worker

_NAME_A = "TEST-WORKER-A"
_NAME_B = "TEST-WORKER-B"
# Уникален на прогон: вебхук ищет студию перебором активных telegram-каналов,
# и строка, оставшаяся от прибитого прогона, увела бы событие к чужой студии.
_TG_TOKEN = f"TEST-WORKER-TG-{uuid.uuid4().hex}"


class _Request:
    def __init__(self, body: bytes):
        self._body, self.headers = body, {}

    async def json(self):
        return json.loads(self._body)


class _Background:
    """Записывает запланированное вместо выполнения. Пустой список после вебхука
    и есть доказательство, что web не исполняет работы."""

    def __init__(self):
        self.tasks = []

    def add_task(self, func, *args):
        self.tasks.append((func, args))


class _Handler:
    """Подмена хода агента. Считает запуски, умеет удерживать ход открытым."""

    def __init__(self, gate: asyncio.Event = None, fail: bool = False):
        self.calls, self.active, self.max_active = [], 0, 0
        self.gate, self.fail = gate, fail
        self._original = agent_jobs._handle

    def install(self):
        # Второй аргумент — тред разговора (P1.5): заглушке он не нужен, но
        # подпись обязана его принимать.
        async def _fake(work, *_):
            self.calls.append((work.studio_id, work.channel, work.sender, work.text))
            self.active += 1
            self.max_active = max(self.max_active, self.active)
            try:
                if self.gate is not None:
                    await self.gate.wait()
                if self.fail:
                    raise RuntimeError("ход не удался")
            finally:
                self.active -= 1
            # Пустой ход: отвечать нечего, но контракт тот же.
            return agent_jobs.AgentTurn()
        agent_jobs._handle = _fake
        return self

    def restore(self):
        agent_jobs._handle = self._original


async def _seed() -> dict:
    async with async_session_maker() as db:
        a, b = Studio(name=_NAME_A), Studio(name=_NAME_B)
        db.add_all([a, b])
        await db.commit()
        db.add_all([
            # Тариф нужен: без него квота ИИ равна нулю и ход агента молча
            # заканчивается отказом ещё до модели.
            StudioBillingPlan(studio_id=a.id, plan_name="pro"),
            StudioBillingPlan(studio_id=b.id, plan_name="pro"),
            StudioAISettings(studio_id=a.id, tg_enabled=True),
            StudioAISettings(studio_id=b.id, tg_enabled=True),
            BookingChannelConfig(studio_id=a.id, channel_type="telegram", is_active=True,
                                 config={"token": _TG_TOKEN}),
        ])
        await db.commit()
        return {"a": a.id, "b": b.id}


async def _cleanup(ids: dict) -> None:
    async with async_session_maker() as db:
        for sid in ids.values():
            await db.execute(delete(OutboundMessage).where(OutboundMessage.studio_id == sid))
            await db.execute(delete(InboundEvent).where(InboundEvent.studio_id == sid))
            await db.execute(delete(ChannelThread).where(ChannelThread.studio_id == sid))
            await db.execute(delete(StudioBillingPlan).where(StudioBillingPlan.studio_id == sid))
            await db.execute(delete(StudioAISettings).where(StudioAISettings.studio_id == sid))
            await db.execute(delete(BookingChannelConfig).where(BookingChannelConfig.studio_id == sid))
            await db.execute(delete(Studio).where(Studio.id == sid))
        await db.commit()


async def _put(studio_id: int, sender: str, text: str, key: str) -> int:
    """Принять событие как это делает вебхук, вернуть id работы."""
    result = await admit(inbound.TELEGRAM, key, studio_id, inbound.MESSAGE, sender, text, {"k": key})
    assert result.accepted, key
    return result.job_id


async def _job(job_id: int) -> AgentJob:
    async with async_session_maker() as db:
        return await db.get(AgentJob, job_id)


async def _take(job_ids: list[int], owner: str):
    async with async_session_maker() as db:
        return await agent_jobs.claim_next(db, owner, job_ids=job_ids)


async def _expire_lease(thread_id: int) -> None:
    """Аренда истекла — так выглядит тред владельца, чей процесс умер."""
    async with async_session_maker() as db:
        await db.execute(update(ChannelThread).where(ChannelThread.id == thread_id)
                         .values(lease_until=func.now() - agent_jobs._interval(60)))
        await db.commit()


async def _age_claim(job_id: int, seconds: int) -> None:
    async with async_session_maker() as db:
        await db.execute(update(AgentJob).where(AgentJob.id == job_id).values(
            claimed_at=func.now() - agent_jobs._interval(seconds),
            run_after=func.now() - agent_jobs._interval(1)))
        await db.commit()


async def _thread_of(studio_id: int, sender: str) -> ChannelThread:
    async with async_session_maker() as db:
        return (await db.execute(select(ChannelThread).where(
            ChannelThread.studio_id == studio_id,
            ChannelThread.channel == inbound.TELEGRAM,
            ChannelThread.sender_ref == sender,
        ))).scalar_one()


async def _until(condition, what: str, limit: float = 5.0) -> None:
    """Ждать события в другой задаче — но не вечно: зависший busy-wait в тесте
    выглядит как повисший прогон, а не как понятное падение."""
    deadline = asyncio.get_running_loop().time() + limit
    while not condition():
        assert asyncio.get_running_loop().time() < deadline, f"не дождались: {what}"
        await asyncio.sleep(0.01)


async def _run():
    ids = await _seed()
    a, b = ids["a"], ids["b"]
    handler = _Handler().install()
    try:
        # ── A. Два воркера на одну работу: исполняет один.
        # Арбитр — FOR UPDATE SKIP LOCKED, а не расторопность процессов.
        job = await _put(a, "555", "первое", f"{a}:w1")
        taken = [t for t in await asyncio.gather(
            _take([job], "w1"), _take([job], "w2"), _take([job], "w3")
        ) if t is not None]
        assert len(taken) == 1, f"работу взяли {len(taken)} воркеров"
        assert taken[0].token == 1
        assert await agent_jobs.process(taken[0], "w1") == "done"
        assert handler.calls == [(a, inbound.TELEGRAM, "555", "первое")]

        # ── B. Две работы ОДНОГО разговора: второй не запускает ход параллельно.
        gate = asyncio.Event()
        handler.restore()
        holding = _Handler(gate=gate).install()
        try:
            j1 = await _put(a, "555", "хочу завтра вечером", f"{a}:w2")
            j2 = await _put(a, "555", "лучше после 19", f"{a}:w3")
            w1, w2 = await _take([j1], "wA"), await _take([j2], "wB")
            assert w1 is not None and w2 is not None, "работы разные — обе должны взяться"

            first = asyncio.create_task(agent_jobs.process(w1, "wA"))
            await _until(lambda: holding.active > 0, "первый ход начался")
            assert await agent_jobs.process(w2, "wB") == "busy", "второй ход пошёл параллельно"
            assert holding.max_active == 1, f"одновременных ходов: {holding.max_active}"

            gate.set()
            assert await first == "done"

            # ── J. Занятый разговор НЕ жжёт бюджет попыток.
            second = await _job(j2)
            assert (second.status, second.attempt) == (agent_jobs.PENDING, 0), \
                "отступ по занятому треду списан как неудачная попытка"
        finally:
            holding.restore()
        handler.install()

        # Сто подряд отступов по занятому разговору. Аренду держим явно чужим
        # владельцем, а run_after каждый раз отматываем: проверяем бюджет
        # попыток, а не длину паузы.
        busy_thread = await _thread_of(a, "555")
        async with async_session_maker() as db:
            squatter = await threads.acquire(db, busy_thread.id, "wSquat", agent_jobs.LEASE_TTL_SECONDS)
        assert squatter is not None
        for _ in range(100):
            async with async_session_maker() as db:
                await db.execute(update(AgentJob).where(AgentJob.id == j2)
                                 .values(run_after=func.now() - agent_jobs._interval(1)))
                await db.commit()
            w = await _take([j2], "wB")
            assert w is not None, "работа не вернулась в очередь после отступа"
            assert await agent_jobs.process(w, "wB") == "busy"
        assert (await _job(j2)).attempt == 0, "сто отступов сожгли бюджет попыток"

        # Разговор освободился — работа проходит обычным порядком.
        async with async_session_maker() as db:
            await threads.release(db, squatter)
            await db.execute(update(AgentJob).where(AgentJob.id == j2)
                             .values(run_after=func.now() - agent_jobs._interval(1)))
            await db.commit()
        w = await _take([j2], "wB")
        assert await agent_jobs.process(w, "wB") == "done"

        # ── C. Разные разговоры идут параллельно: глобального мьютекса нет.
        gate2 = asyncio.Event()
        handler.restore()
        parallel = _Handler(gate=gate2).install()
        try:
            jx = await _put(a, "111", "вопрос", f"{a}:w4")       # другой человек
            jy = await _put(b, "222", "вопрос", f"{b}:w5")       # другая студия
            wx, wy = await _take([jx], "wA"), await _take([jy], "wB")
            tasks = [asyncio.create_task(agent_jobs.process(wx, "wA")),
                     asyncio.create_task(agent_jobs.process(wy, "wB"))]
            await _until(lambda: parallel.active >= 2, "оба хода начались")
            assert parallel.max_active == 2, "разные разговоры сериализовались"
            gate2.set()
            assert await asyncio.gather(*tasks) == ["done", "done"]
        finally:
            parallel.restore()
        handler.install()

        # ── D. Fencing. A держит lease_seq=1, зависает, аренда истекает, B берёт
        # lease_seq=2, после чего A пытается записать результат.
        jf = await _put(a, "555", "fencing", f"{a}:w6")
        thread = await _thread_of(a, "555")
        async with async_session_maker() as db:
            lease_a = await threads.acquire(db, thread.id, "wA", agent_jobs.LEASE_TTL_SECONDS)
        assert lease_a is not None
        async with async_session_maker() as db:
            assert await threads.acquire(db, thread.id, "wB", agent_jobs.LEASE_TTL_SECONDS) is None
        await _expire_lease(thread.id)
        async with async_session_maker() as db:
            lease_b = await threads.acquire(db, thread.id, "wB", agent_jobs.LEASE_TTL_SECONDS)
        assert lease_b is not None and lease_b.seq == lease_a.seq + 1
        async with async_session_maker() as db:
            assert await threads.still_owned(db, lease_a) is False, "устаревший владелец считает себя живым"
            assert await threads.still_owned(db, lease_b) is True
        # И снять чужую аренду он тоже не может.
        async with async_session_maker() as db:
            await threads.release(db, lease_a)
            await db.commit()
        async with async_session_maker() as db:
            assert await threads.still_owned(db, lease_b) is True, "устаревший владелец снял чужую аренду"

        # Полный ход устаревшего владельца: результат в БД не попадает.
        # Сначала отпускаем аренду, которую держит wB, — иначе работа не дойдёт
        # до хода и вернётся как busy.
        async with async_session_maker() as db:
            await threads.release(db, lease_b)
            await db.commit()
        wf = await _take([jf], "wA")
        assert wf is not None
        gate3 = asyncio.Event()
        handler.restore()
        stale = _Handler(gate=gate3).install()
        try:
            task = asyncio.create_task(agent_jobs.process(wf, "wA"))
            await _until(lambda: stale.active > 0, "ход устаревшего владельца начался")
            thread_now = await _thread_of(a, "555")           # аренду отбирают посреди хода
            await _expire_lease(thread_now.id)
            async with async_session_maker() as db:
                stolen = await threads.acquire(db, thread_now.id, "wC", agent_jobs.LEASE_TTL_SECONDS)
            assert stolen is not None
            gate3.set()
            assert await task == "stale", "устаревший владелец закрыл работу"
        finally:
            stale.restore()
        handler.install()
        assert (await _job(jf)).status != agent_jobs.DONE, "результат устаревшего владельца записан"

        # ── E. Воркер убит после взятия работы: она возвращается в оборот.
        je = await _put(a, "333", "убьют исполнителя", f"{a}:w7")
        killed = await _take([je], "wDead")
        assert killed is not None
        assert await _take([je], "wOther") is None, "брошенную работу отдали, не дождавшись срока"
        await _age_claim(je, agent_jobs.LEASE_TTL_SECONDS + 60)
        revived = await _take([je], "wOther")
        assert revived is not None and revived.token == 2, "работа не восстановлена"
        assert await agent_jobs.process(revived, "wOther") == "done"

        # ── F. Убит во время хода: аренда истекает независимо от работы, и
        # следующий воркер продолжает с чистого листа.
        jg = await _put(a, "444", "убьют посреди хода", f"{a}:w8")
        hung = await _take([jg], "wHung")
        async with async_session_maker() as db:
            tid = await threads.get_or_create(db, a, inbound.TELEGRAM, "444")
            await db.commit()
            hung_lease = await threads.acquire(db, tid, "wHung", agent_jobs.LEASE_TTL_SECONDS)
        await _age_claim(jg, agent_jobs.LEASE_TTL_SECONDS + 60)
        await _expire_lease(tid)
        after = await _take([jg], "wNext")
        assert after is not None
        assert await agent_jobs.process(after, "wNext") == "done"
        async with async_session_maker() as db:
            assert await threads.still_owned(db, hung_lease) is False

        # ── G. Инвариант P0.2 жив: web получил 200 и умер, провайдер не повторяет,
        # событие всё равно обрабатывается — теперь отдельным процессом.
        update_body = {"update_id": 8801, "message": {
            "chat": {"id": 777}, "from": {"id": 777}, "text": "запишите меня"}}
        dead = _Background()
        async with async_session_maker() as db:
            assert await TG.telegram_webhook(
                _TG_TOKEN, _Request(json.dumps(update_body).encode()), dead, db) == {"ok": True}
        # ── H. Архитектура: web НИЧЕГО не запускает.
        assert dead.tasks == [], "web запланировал исполнение агента"
        async with async_session_maker() as db:
            jid = (await db.execute(
                select(AgentJob.id).join(InboundEvent, AgentJob.inbound_event_id == InboundEvent.id)
                .where(InboundEvent.provider_event_id == f"{a}:8801"))).scalar_one()
        assert jid in await agent_jobs.stuck_ids(), "очередь не видит принятое событие"
        handler.calls.clear()
        w = await _take([jid], "wWorker")
        assert await agent_jobs.process(w, "wWorker") == "done"
        assert handler.calls == [(a, inbound.TELEGRAM, "777", "запишите меня")]

        # ── I. Два восстановления одновременно: одна брошенная работа — один владелец.
        ji = await _put(a, "888", "восстановление", f"{a}:w9")
        await _take([ji], "wDead")
        await _age_claim(ji, agent_jobs.LEASE_TTL_SECONDS + 60)
        grabbed = [t for t in await asyncio.gather(*[_take([ji], f"w{n}") for n in range(4)])
                   if t is not None]
        assert len(grabbed) == 1, f"брошенную работу подобрали {len(grabbed)} воркеров"
        await agent_jobs.process(grabbed[0], "w0")

        # ── K. Чистка не трогает живую работу, даже если событию месяц.
        alive_job = await _put(a, "999", "старое, но не доделанное", f"{a}:w10")
        done_job = await _put(a, "999", "старое и закрытое", f"{a}:w11")
        w = await _take([done_job], "wK")
        await agent_jobs.process(w, "wK")
        old = func.now() - agent_jobs._interval(int(agent_jobs._RETENTION.total_seconds()) + 86400)
        async with async_session_maker() as db:
            await db.execute(update(InboundEvent)
                             .where(InboundEvent.provider_event_id.in_([f"{a}:w10", f"{a}:w11"]))
                             .values(received_at=old))
            await db.commit()
        await agent_jobs.purge()
        assert await _job(alive_job) is not None, "чистка снесла невыполненную работу"
        assert await _job(done_job) is None, "чистка не удалила завершённое старое событие"

        # ── L. Остановка: после запроса на стоп новые работы не берутся.
        jl = await _put(a, "1010", "после стопа", f"{a}:w12")
        worker = Worker(owner="wStop")
        worker.stop()
        task = asyncio.create_task(worker.run())
        await asyncio.wait_for(task, timeout=5)
        assert (await _job(jl)).status == agent_jobs.PENDING, "остановленный воркер взял работу"

        # ── M. Ни одной открытой транзакции во время сетевого вызова.
        await _no_transaction_during_network(a)
    finally:
        handler.restore()
        await _cleanup(ids)


async def _no_transaction_during_network(studio_id: int) -> None:
    """Инструментальная проверка §19/§O: в момент обращения к модели и к
    мессенджеру ни одна живая сессия не держит транзакцию.

    Не «написано в комментарии», а измерено: подменяем фабрику сессий на
    считающую обёртку, а llm.chat и индикатор набора — на проверку. Сообщений
    воркер агента больше не шлёт вовсе (P0.4), поэтому здесь остались ровно два
    сетевых вызова, которые он делает.
    """
    import services.client_agent as CA
    from services import llm
    from services.channels import telegram as TGCH

    live: list = []
    real_maker = CA.async_session_maker

    def _tracking_maker(*args, **kwargs):
        session = real_maker(*args, **kwargs)
        live.append(session)
        return session

    open_at_network: list[str] = []

    def _check(where: str) -> None:
        if any(s.in_transaction() for s in live):
            open_at_network.append(where)

    async def _fake_chat(messages, tools=None, tier=None, cache_prefix_len=0, think=True):
        _check("llm.chat")
        return llm.LLMReply("Готово.", [], llm.LLMUsage(
            model="test", prompt_tokens=1, cached_tokens=0, completion_tokens=1, cost_micro=0))

    async def _fake_typing(token, chat_id):
        _check("telegram.sendChatAction")

    real_chat, real_typing, real_conf = llm.chat, TGCH.send_typing, llm.is_configured
    CA.async_session_maker = _tracking_maker
    llm.chat = _fake_chat
    TGCH.send_typing = _fake_typing
    # Ключа модели в прогоне нет, а без него reply() выходит сразу и мерить
    # было бы нечего (conftest глушит саму chat, но не признак настроенности).
    llm.is_configured = lambda: True
    try:
        answer = await CA.produce_reply(studio_id, inbound.TELEGRAM, "555", "во сколько занятие?", _TG_TOKEN)
    finally:
        CA.async_session_maker = real_maker
        llm.chat, TGCH.send_typing, llm.is_configured = real_chat, real_typing, real_conf

    assert answer == "Готово.", "ход агента не вернул намерение"
    assert not open_at_network, f"транзакция открыта во время сетевых вызовов: {open_at_network}"
    assert live, "сессии не отслеживались — проверка ничего не измерила"


def test_worker_runtime():
    asyncio.run(_run())


if __name__ == "__main__":
    test_worker_runtime()
    print("ALL PASS")
