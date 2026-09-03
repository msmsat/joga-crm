"""Приём входящих событий и durable-обработка (P0.2).

Проверяем границу, а не удобство. Две самые дорогие ошибки здесь противоположны
друг другу, и обе проверяются отдельно:
  - ответить клиенту дважды на одно сообщение (повтор доставки прошёл насквозь);
  - НЕ ответить вовсе, потому что дедуп подавил ретрай провайдера, а обработка
    так и не состоялась.

Главный тест файла — §21: провайдер НИКОГДА не повторяет доставку, процесс убит
сразу после 200, и сообщение всё равно обрабатывается. Если он падает, вся
конструкция бессмысленна.

Обработку подменяем счётчиком: важно, СКОЛЬКО раз она была запущена и с каким
входом, а не что ответила модель.

Реальная БД, ручная чистка. Запуск из back/:  python -m tests.test_inbound_events
"""
import asyncio
import hashlib
import hmac
import json
import warnings
from datetime import datetime, timedelta

warnings.filterwarnings("ignore")

from sqlalchemy import delete, func, select, update

import routers.ai.instagram as IG
import routers.ai.whatsapp as WA
import routers.booking.telegram_webhook as TG
from database import async_session_maker
from models import (
    AgentJob, ChannelThread, BookingChannelConfig, InboundEvent, Studio, StudioAISettings, StudioIntegration,
)
from services import agent_jobs, inbound
from services.inbound import Admission, admit
from services.studio_link import public_ref

_NAME_A = "TEST-INBOUND-A"
_NAME_B = "TEST-INBOUND-B"
_SECRET = "inbound-test-secret"
_IG_ACCOUNT = "TEST-INBOUND-IG-ACCOUNT"
_WA_NUMBER = "TEST-INBOUND-WA-NUMBER"
_TG_TOKEN = "TEST-INBOUND-TG-TOKEN"


# ─── Заглушки ────────────────────────────────────────────────────────────────

class _Request:
    """Минимальный Request: вебхукам нужны только тело и заголовок подписи."""

    def __init__(self, body: bytes, signature: str | None = None):
        self._body = body
        self.headers = {} if signature is None else {"x-hub-signature-256": signature}

    async def body(self) -> bytes:
        return self._body

    async def json(self):
        # Вебхук Telegram читает тело через .json() (подписи у него нет —
        # секретом служит токен в URL), Meta — через .body() ради подписи.
        return json.loads(self._body)


class _Background:
    """BackgroundTasks, который НЕ выполняет задачи, а записывает их.

    Это и есть барьер «процесс умер сразу после 200»: вебхук отработал, ответ
    провайдеру ушёл, а быстрый путь так и не стартовал.
    """

    def __init__(self):
        self.tasks: list[tuple] = []

    def add_task(self, func, *args):
        self.tasks.append((func, args))



class _Handler:
    """Подмена обработки. Считает запуски и запоминает вход."""

    def __init__(self, fail_times: int = 0):
        self.calls: list[tuple] = []
        self.fail_times = fail_times
        self._original = agent_jobs._handle

    def install(self):
        async def _fake(work, *_):
            self.calls.append((work.studio_id, work.channel, work.sender, work.text))
            if len(self.calls) <= self.fail_times:
                raise RuntimeError("обработка не удалась")
            return agent_jobs.AgentTurn()
        agent_jobs._handle = _fake
        return self

    def restore(self):
        agent_jobs._handle = self._original


def _signed(payload: dict) -> tuple[bytes, str]:
    raw = json.dumps(payload).encode()
    return raw, "sha256=" + hmac.new(_SECRET.encode(), raw, hashlib.sha256).hexdigest()


def _ig_envelope(*mids: str) -> dict:
    """Конверт Meta с несколькими сообщениями в одном HTTP-запросе."""
    return {"entry": [{"messaging": [
        {"sender": {"id": "igsid-client"}, "recipient": {"id": _IG_ACCOUNT},
         "message": {"mid": mid, "text": f"вопрос {mid}"}}
        for mid in mids
    ]}]}


# ─── Данные ──────────────────────────────────────────────────────────────────

async def _seed() -> dict:
    async with async_session_maker() as db:
        a, b = Studio(name=_NAME_A), Studio(name=_NAME_B)
        db.add_all([a, b])
        await db.commit()
        db.add_all([
            StudioAISettings(studio_id=a.id, ig_enabled=True, ig_token="ig-token",
                             ig_user_id=_IG_ACCOUNT, wa_enabled=True, tg_enabled=True),
            StudioAISettings(studio_id=b.id),
            StudioIntegration(studio_id=a.id, integration_type="wa_notify", is_connected=True,
                              config={"phone_number_id": _WA_NUMBER, "token": "wa-token"}),
            BookingChannelConfig(studio_id=a.id, channel_type="telegram", is_active=True,
                                 config={"token": _TG_TOKEN}),
        ])
        await db.commit()
        return {"a": a.id, "b": b.id}


async def _cleanup(ids: dict) -> None:
    async with async_session_maker() as db:
        for sid in ids.values():
            await db.execute(delete(InboundEvent).where(InboundEvent.studio_id == sid))
            await db.execute(delete(ChannelThread).where(ChannelThread.studio_id == sid))
            await db.execute(delete(StudioAISettings).where(StudioAISettings.studio_id == sid))
            await db.execute(delete(StudioIntegration).where(StudioIntegration.studio_id == sid))
            await db.execute(delete(BookingChannelConfig).where(BookingChannelConfig.studio_id == sid))
            await db.execute(delete(Studio).where(Studio.id == sid))
        await db.commit()


async def _events(provider: str, key: str) -> int:
    async with async_session_maker() as db:
        return (await db.execute(
            select(func.count()).select_from(InboundEvent).where(
                InboundEvent.provider == provider, InboundEvent.provider_event_id == key)
        )).scalar_one()


async def _event(provider: str, key: str) -> InboundEvent:
    async with async_session_maker() as db:
        return (await db.execute(select(InboundEvent).where(
            InboundEvent.provider == provider, InboundEvent.provider_event_id == key,
        ))).scalar_one()


async def _jobs_for(provider: str, key: str) -> list[AgentJob]:
    async with async_session_maker() as db:
        return list((await db.execute(
            select(AgentJob).join(InboundEvent, AgentJob.inbound_event_id == InboundEvent.id)
            .where(InboundEvent.provider == provider, InboundEvent.provider_event_id == key)
        )).scalars().all())


async def _job(job_id: int) -> AgentJob:
    async with async_session_maker() as db:
        return await db.get(AgentJob, job_id)


async def _age_claim(job_id: int, minutes: int) -> None:
    """Состарить попытку — так выглядит работа, чей процесс умер, не доработав.
    Часы серверные: колонки и сравнения в agent_jobs живут по ним же."""
    async with async_session_maker() as db:
        await db.execute(update(AgentJob).where(AgentJob.id == job_id).values(
            claimed_at=func.now() - agent_jobs._interval(minutes * 60),
            run_after=func.now() - agent_jobs._interval(1)))
        await db.commit()


async def _total_events() -> int:
    async with async_session_maker() as db:
        return (await db.execute(select(func.count()).select_from(InboundEvent))).scalar_one()


async def _claim(job_id: int, owner: str = "test"):
    async with async_session_maker() as db:
        return await agent_jobs.claim_next(db, owner, job_ids=[job_id])


async def _do(job_id: int) -> str:
    """Выполнить конкретную работу так, как это делает воркер.

    job_ids ограничивает выборку своим id: прогон идёт в общей dev-БД, и
    глобальный claim_next забрал бы живую работу соседней сессии.
    """
    work = await _claim(job_id)
    assert work is not None, f"работа {job_id} недоступна очереди"
    return await agent_jobs.process(work, "test")


# ─── Проверки ────────────────────────────────────────────────────────────────

async def _run():
    ids = await _seed()
    a, b = ids["a"], ids["b"]
    ig_secret, wa_secret = IG.IG_APP_SECRET, WA.WA_APP_SECRET
    IG.IG_APP_SECRET = WA.WA_APP_SECRET = _SECRET
    handler = _Handler().install()
    try:
        body = {"mid": "wamid.001", "text": "Привет"}

        # ── 1. Первый приём: одно событие и РОВНО ОДНА работа под него.
        first = await admit(inbound.WHATSAPP, "wamid.001", a, inbound.MESSAGE, "7999", "Привет", body)
        assert first.accepted is True and first.job_id is not None
        assert await _events(inbound.WHATSAPP, "wamid.001") == 1
        assert len(await _jobs_for(inbound.WHATSAPP, "wamid.001")) == 1

        # ── 2. Повтор доставки: ни второго события, ни второй работы.
        assert await admit(inbound.WHATSAPP, "wamid.001", a, inbound.MESSAGE, "7999", "Привет", body) \
            == Admission(False, None)
        assert await _events(inbound.WHATSAPP, "wamid.001") == 1
        assert len(await _jobs_for(inbound.WHATSAPP, "wamid.001")) == 1

        # ── 3. Две реплики одновременно (обязательный тест 5): одно событие,
        # одна работа. Арбитр — UNIQUE в БД, а не проверка перед вставкой.
        results = await asyncio.gather(*[
            admit(inbound.WHATSAPP, "wamid.race", a, inbound.MESSAGE, "7999", "Привет", body)
            for _ in range(4)
        ])
        assert sum(r.accepted for r in results) == 1, results
        assert await _events(inbound.WHATSAPP, "wamid.race") == 1
        assert len(await _jobs_for(inbound.WHATSAPP, "wamid.race")) == 1

        # ── 4. Один идентификатор у разных провайдеров не конфликтует.
        for provider in (inbound.TELEGRAM, inbound.WHATSAPP, inbound.INSTAGRAM):
            assert (await admit(provider, "123", a, inbound.MESSAGE, "7999", "Привет", body)).accepted is True

        # ── 5. Разные идентификаторы одного провайдера — разные события.
        assert (await admit(inbound.WHATSAPP, "wamid.002", a, inbound.MESSAGE, "7999", "Ещё", body)).accepted
        assert await _events(inbound.WHATSAPP, "wamid.002") == 1

        # ── 6. Повтор с ДРУГИМ телом: оригинал не перезаписан, работы не прибыло.
        original = await _event(inbound.WHATSAPP, "wamid.001")
        assert await admit(inbound.WHATSAPP, "wamid.001", a, inbound.MESSAGE, "7999", "подменили",
                           {"mid": "wamid.001", "text": "подменили"}) == Admission(False, None)
        again = await _event(inbound.WHATSAPP, "wamid.001")
        assert (again.id, again.payload_sha256, again.text) == \
               (original.id, original.payload_sha256, original.text)
        assert len(await _jobs_for(inbound.WHATSAPP, "wamid.001")) == 1

        # ── 7. Одно событие провайдера не может достаться двум студиям.
        assert await admit(inbound.WHATSAPP, "wamid.001", b, inbound.MESSAGE, "7999", "Привет", body) \
            == Admission(False, None)
        assert (await _event(inbound.WHATSAPP, "wamid.001")).studio_id == a

        # ── 8. Telegram: update_id уникален в пределах БОТА — один номер у двух
        # студий это два разных события.
        assert (await admit(inbound.TELEGRAM, f"{a}:77", a, inbound.MESSAGE, "555", "Привет", {})).accepted
        assert (await admit(inbound.TELEGRAM, f"{b}:77", b, inbound.MESSAGE, "556", "Привет", {})).accepted

        # ── 9. Событие без доверенного идентификатора: ключ не выдумываем,
        # события не заводим, работу тоже — обрабатывается на месте, как раньше.
        before = await _total_events()
        assert await admit(inbound.INSTAGRAM, None, a, inbound.MESSAGE, "x", "y", {}) == Admission(True, None)
        assert await admit(inbound.INSTAGRAM, "", a, inbound.MESSAGE, "x", "y", {}) == Admission(True, None)
        assert await _total_events() == before

        # ── 10. ОБЯЗАТЕЛЬНЫЙ ТЕСТ 1. Падение после приёма, до обработки.
        # Работа обязана остаться в состоянии, из которого её кто-то доделает.
        crash = await admit(inbound.WHATSAPP, "wamid.crash", a, inbound.MESSAGE, "7999", "спасите", body)
        job = await _job(crash.job_id)
        assert (job.status, job.attempt, job.claimed_at) == (agent_jobs.PENDING, 0, None)

        # ── 11. ОБЯЗАТЕЛЬНЫЙ ТЕСТ 2. Провайдер ретраит через 5 секунд после
        # такого падения. Дубль подавляется — и это НЕ должно похоронить
        # событие: работа по оригиналу как лежала pending, так и лежит.
        assert (await admit(inbound.WHATSAPP, "wamid.crash", a, inbound.MESSAGE, "7999", "спасите", body)) \
            == Admission(False, None)
        assert (await _job(crash.job_id)).status == agent_jobs.PENDING
        # Восстановление видит её и доделывает без участия провайдера.
        # Берём ровно свою работу: recover() пошёл бы по всей БД и подставным
        # обработчиком закрыл бы чужие живые работы соседней сессии.
        handler.calls.clear()
        assert crash.job_id in await agent_jobs.stuck_ids()
        assert await _do(crash.job_id) == "done"
        assert handler.calls == [(a, inbound.WHATSAPP, "7999", "спасите")]
        assert (await _job(crash.job_id)).status == agent_jobs.DONE

        # ── 12. Закрытую работу восстановление больше не трогает, сколько бы
        # времени ни прошло: обработка состоялась, повтор — это второй ответ.
        await _age_claim(crash.job_id, minutes=10_000)
        handler.calls.clear()
        assert crash.job_id not in await agent_jobs.stuck_ids(limit=10_000)
        assert handler.calls == []

        # ── 13. ОБЯЗАТЕЛЬНЫЙ ТЕСТ 4 (fencing). Прежний владелец очнулся после
        # того, как работу перехватили, и пытается объявить успех.
        fenced = await admit(inbound.WHATSAPP, "wamid.fence", a, inbound.MESSAGE, "7999", "текст", body)
        old_owner = await _claim(fenced.job_id, "wOld")
        assert old_owner.token == 1
        await _age_claim(fenced.job_id, minutes=16)          # A завис, попытка протухла
        new_owner = await _claim(fenced.job_id, "wNew")
        assert new_owner is not None and new_owner.token == 2, "перехват не состоялся"
        async with async_session_maker() as db:
            assert await agent_jobs.finish(db, fenced.job_id, old_owner.token) is False, \
                "устаревший владелец записал чужой успех"
        assert (await _job(fenced.job_id)).status == agent_jobs.RUNNING
        async with async_session_maker() as db:
            assert await agent_jobs.finish(db, fenced.job_id, new_owner.token) is True
            await db.commit()
        assert (await _job(fenced.job_id)).status == agent_jobs.DONE

        # ── 14. Перехват одной протухшей работы двумя процессами: владелец один.
        both = await admit(inbound.WHATSAPP, "wamid.two", a, inbound.MESSAGE, "7999", "текст", body)
        await _claim(both.job_id, "wDead")
        await _age_claim(both.job_id, minutes=16)

        async def _grab():
            return await _claim(both.job_id, "wRace")

        grabbed = [g for g in await asyncio.gather(*[_grab() for _ in range(4)]) if g is not None]
        assert len(grabbed) == 1, f"работу взяли {len(grabbed)} процессов"

        # ── 15. Неудача возвращает работу в очередь, а исчерпав попытки —
        # помечает failed, чтобы не долбить провайдера вечно.
        failing = await admit(inbound.WHATSAPP, "wamid.fail", a, inbound.MESSAGE, "7999", "текст", body)
        handler.restore()
        broken = _Handler(fail_times=99).install()
        try:
            for expected in (agent_jobs.PENDING, agent_jobs.PENDING, agent_jobs.FAILED):
                async with async_session_maker() as db:
                    await db.execute(update(AgentJob).where(AgentJob.id == failing.job_id)
                                     .values(run_after=func.now()))
                    await db.commit()
                await _do(failing.job_id)
                assert (await _job(failing.job_id)).status == expected
            assert len(broken.calls) == agent_jobs._MAX_ATTEMPTS
            # Исчерпанную восстановление больше не подбирает.
            assert failing.job_id not in await agent_jobs.stuck_ids(limit=10_000)
        finally:
            broken.restore()
        handler.install()

        # ── 16. Подделка не может занять ключ заранее: подпись проверяется ДО
        # приёма, поэтому настоящее событие приходит первым, а не «дублем».
        raw, _sig = _signed(_ig_envelope("mid.spoof"))
        spoofed = await IG.instagram_webhook(_Request(raw, "sha256=" + "0" * 64), _Background(), None)
        assert spoofed.status_code == 403
        assert await _events(inbound.INSTAGRAM, "mid.spoof") == 0
        assert (await admit(inbound.INSTAGRAM, "mid.spoof", a, inbound.MESSAGE, "igsid", "т", {})).accepted

        # ── 17. ОБЯЗАТЕЛЬНЫЙ ТЕСТ 7. Пачка Meta A/B/C, B уже принят.
        # Дедуп на событие, а не на запрос: у A и C появляются свои работы.
        assert (await admit(inbound.INSTAGRAM, "mid.B", a, inbound.MESSAGE, "igsid", "старое", {})).accepted
        raw, sig = _signed(_ig_envelope("mid.A", "mid.B", "mid.C"))
        background = _Background()
        async with async_session_maker() as db:
            assert await IG.instagram_webhook(_Request(raw, sig), background, db) == {"ok": True}
        assert background.tasks == [], "web запланировал исполнение — с P0.3 это делает воркер"
        assert len(await _jobs_for(inbound.INSTAGRAM, "mid.A")) == 1
        assert len(await _jobs_for(inbound.INSTAGRAM, "mid.C")) == 1
        assert len(await _jobs_for(inbound.INSTAGRAM, "mid.B")) == 1   # второй не появился
        handler.calls.clear()
        for key in ("mid.A", "mid.C"):
            assert await _do((await _jobs_for(inbound.INSTAGRAM, key))[0].id) == "done"
        assert sorted(c[3] for c in handler.calls) == ["вопрос mid.A", "вопрос mid.C"]

        # ── 18. Повтор ВСЕГО запроса: обычный успешный ответ (иначе Meta уйдёт в
        # бесконечный ретрай) и ни одной новой работы.
        background = _Background()
        async with async_session_maker() as db:
            assert await IG.instagram_webhook(_Request(raw, sig), background, db) == {"ok": True}
        assert background.tasks == []

        # ── 19. ОБЯЗАТЕЛЬНЫЙ ТЕСТ 6. Рестарт без провайдера: вход обработки
        # целиком восстанавливается из БД, ничего не приходит извне.
        restored = await admit(inbound.TELEGRAM, f"{a}:9001", a, inbound.MESSAGE, "555",
                               "во сколько занятие?", {})
        work = await _claim(restored.job_id, "wRestore")
        assert (work.studio_id, work.channel, work.sender, work.text) == \
               (a, inbound.TELEGRAM, "555", "во сколько занятие?")
        # И реквизиты канала выводятся из БД, а не из запроса: секретов в
        # журнале приёма нет ни одного.
        async with async_session_maker() as db:
            assert await agent_jobs._transport(db, a, inbound.TELEGRAM) == _TG_TOKEN
            assert await agent_jobs._transport(db, a, inbound.WHATSAPP) == f"{_WA_NUMBER}|wa-token"

        # ── 20. WhatsApp сквозь вебхук: событие, работа, запуск.
        wa_body = {"entry": [{"changes": [{"value": {
            "metadata": {"phone_number_id": _WA_NUMBER},
            "messages": [{"id": "wamid.hook", "from": "79990000000",
                          "type": "text", "text": {"body": "Привет"}}],
        }}]}]}
        raw3, sig3 = _signed(wa_body)
        background = _Background()
        async with async_session_maker() as db:
            assert await WA.whatsapp_webhook(_Request(raw3, sig3), background, db) == {"ok": True}
        assert background.tasks == []
        background2 = _Background()
        async with async_session_maker() as db:
            assert await WA.whatsapp_webhook(_Request(raw3, sig3), background2, db) == {"ok": True}
        assert background2.tasks == [], "повтор доставки завёл вторую работу"

        # ── 21. ГЛАВНЫЙ ТЕСТ (обязательный 3). Провайдер получил 200 и НИКОГДА
        # не повторит доставку; процесс убит до того, как быстрый путь стартовал.
        # Сообщение обязано быть обработано из БД.
        tg_update = {"update_id": 7777, "message": {
            "chat": {"id": 555}, "from": {"id": 555}, "text": "запишите меня на завтра"}}
        dead = _Background()
        async with async_session_maker() as db:
            assert await TG.telegram_webhook(
                _TG_TOKEN, _Request(json.dumps(tg_update).encode()), dead, db) == {"ok": True}
        # Web не планирует исполнение вовсе — с P0.3 это делает воркер.
        assert dead.tasks == [], "web запланировал исполнение агента"
        del dead   # kill -9: web-процесса больше нет, ретрая от Telegram не будет
        handler.calls.clear()
        tg_job = (await _jobs_for(inbound.TELEGRAM, f"{a}:7777"))[0].id
        assert tg_job in await agent_jobs.stuck_ids(),             "очередь не видит работу: сообщение потеряно навсегда"
        assert await _do(tg_job) == "done"
        assert handler.calls == [(a, inbound.TELEGRAM, "555", "запишите меня на завтра")],             "сообщение потеряно: провайдер не повторит, а исполнителя не нашлось"
        assert (await _jobs_for(inbound.TELEGRAM, f"{a}:7777"))[0].status == agent_jobs.DONE

        # ── 22. Срок хранения. Старое событие уходит вместе со своей работой —
        # но только если работа завершена: невыполненную чистка не трогает,
        # иначе каскад унёс бы текст, без которого её уже не восстановить.
        old = await admit(inbound.WHATSAPP, "wamid.old", a, inbound.MESSAGE, "7999", "давнее", body)
        async with async_session_maker() as db:
            await db.execute(update(InboundEvent)
                             .where(InboundEvent.provider_event_id == "wamid.old")
                             .values(received_at=func.now()
                                     - agent_jobs._interval(int(agent_jobs._RETENTION.total_seconds()) + 86400)))
            await db.commit()
        await agent_jobs.purge()
        assert await _events(inbound.WHATSAPP, "wamid.old") == 1, "чистка снесла невыполненную работу"
        assert await _do(old.job_id) == "done"
        assert await agent_jobs.purge() >= 1
        assert await _events(inbound.WHATSAPP, "wamid.old") == 0
        assert await _job(old.job_id) is None, "работа осталась без своего события"

        # ── 23. Маршрутизация внутри работы: /start даёт приветствие с
        # кнопкой, остальное — ответ ассистента. Обе ветки возвращают НАМЕРЕНИЕ:
        # в сеть воркер агента с сообщениями больше не ходит (P0.4).
        import services.client_agent as CA
        handler.restore()
        real_produce = CA.produce_reply

        async def _fake_produce(studio_id, channel, sender, text, token=""):
            return f"ответ на {text}"

        CA.produce_reply = _fake_produce
        try:
            greet = await admit(inbound.TELEGRAM, f"{a}:9100", a, inbound.MESSAGE, "555", "/start", {})
            work = await _claim(greet.job_id)
            intent = (await agent_jobs._handle(work, 0)).payload
            # Кнопка ведёт по публичному коду студии, а не по её id
            # (back/services/studio_link.py).
            async with async_session_maker() as db:
                studio_ref = await public_ref(db, a)
            assert intent["button"]["url"].endswith(f"/s/{studio_ref}"), intent
            assert "text" in intent and intent["text"]

            ask = await admit(inbound.TELEGRAM, f"{a}:9101", a, inbound.MESSAGE, "555", "цены?", {})
            work = await _claim(ask.job_id)
            assert (await agent_jobs._handle(work, 0)).payload == {"text": "ответ на цены?"}
        finally:
            CA.produce_reply = real_produce
            handler.install()

        # ── 24. Каскад: удаление студии не оставляет ни событий, ни работ.
        async with async_session_maker() as db:
            await db.execute(delete(Studio).where(Studio.id == b))
            await db.commit()
        async with async_session_maker() as db:
            assert (await db.execute(select(func.count()).select_from(InboundEvent)
                                     .where(InboundEvent.studio_id == b))).scalar_one() == 0
    finally:
        handler.restore()
        IG.IG_APP_SECRET, WA.WA_APP_SECRET = ig_secret, wa_secret
        await _cleanup(ids)


def test_inbound_events():
    asyncio.run(_run())


if __name__ == "__main__":
    test_inbound_events()
    print("ALL PASS")
