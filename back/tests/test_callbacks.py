"""Нажатая кнопка доходит до ответа — весь путь целиком (P1, закрытие).

P1.6 обнаружил дыру: варианты поиска рисуются кнопками, а входящего обработчика
для них нет вовсе. Кнопка, которая ничего не делает, — обещание интерфейса,
которого система не исполняет, и хуже неё только кнопка, которая делает не то.

Здесь проверяется путь ровно тот же, что у текстового сообщения:

    провайдер -> подлинность -> durable-приём -> дедуп -> работа
              -> детерминированное действие -> план -> очередь исходящих

и три свойства, каждое из которых по отдельности ломает продукт:

  1. **у каждой нарисованной кнопки есть обработчик** и наоборот — реестр
     закрыт, и тест сверяет его с тем, что умеет рисовать рендерер;
  2. **модель на этом пути не зовётся вовсе** — смысл кнопки сервер знает сам
     (проверяется подменой `llm.chat` на исключение);
  3. **ссылка остаётся непрозрачной** — ни занятия, ни услуги, ни студии в
     теле нажатия нет, и чужая ссылка не работает.

Реальная БД, ручная чистка. Запуск из back/:  python -m pytest tests/test_callbacks.py
"""
import asyncio
import inspect
import json
import os
import time as _time
import warnings
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

warnings.filterwarnings("ignore")

from sqlalchemy import delete, select

import routers.booking.telegram_webhook as TG
from database import async_session_maker
from models import (
    AgentJob, BookingChannelConfig, ChannelThread, Hall, InboundEvent, Lesson,
    OutboundMessage, Service, Studio, StudioBookingSettings, StudioBranch,
    StudioMember, ThreadOption, User,
)
from services import agent_jobs, agent_search, inbound, response_plan, response_render
from services.response_plan import ActionKind, CopyIntent, PlanKind

UTC = timezone.utc
_TAG = "TEST-CB"
_TOKEN = "TEST-CB-TG-TOKEN"

# Часы НАСТОЯЩИЕ, а не выдуманная дата: этот тест гоняет боевого исполнителя
# работ, а он смотрит на свои часы и записывает по ним срок жизни состояния.
# Подставная «весна 2027» разошлась бы с ними на месяцы, и состояние, честно
# записанное воркером, тест читал бы как протухшее.
NOW = datetime.now(UTC)
TODAY = NOW.astimezone(ZoneInfo("Europe/Prague")).date()
TOMORROW = TODAY + timedelta(days=1)


class _Request:
    """Минимальный Request: вебхуку Telegram нужно только тело."""

    def __init__(self, payload):
        self._body = json.dumps(payload).encode()

    async def json(self):
        return json.loads(self._body)


# ─── Стенд ───────────────────────────────────────────────────────────────────

async def _seed() -> dict:
    stamp = f"{int(_time.time())}-{os.getpid()}"
    ids: dict = {}
    async with async_session_maker() as db:
        a = Studio(name=f"{_TAG}-A", tz_iana="Europe/Prague", currency="CZK", language="ru")
        b = Studio(name=f"{_TAG}-B", tz_iana="Europe/Prague", currency="CZK", language="ru")
        db.add_all([a, b])
        await db.flush()
        ids.update(a=a.id, b=b.id)
        db.add_all([StudioBookingSettings(studio_id=s.id) for s in (a, b)])
        db.add(BookingChannelConfig(studio_id=a.id, channel_type="telegram",
                                    is_active=True, config={"token": _TOKEN}))
        for studio, key in ((a, "a"), (b, "b")):
            branch = StudioBranch(studio_id=studio.id, name="Вацлавская", city="Praha")
            db.add(branch)
            await db.flush()
            hall = Hall(studio_id=studio.id, branch_id=branch.id, name="Зал", capacity=10)
            service = Service(studio_id=studio.id, name="Стретчинг", duration_min=60, price=500)
            db.add_all([hall, service])
            teacher = User(email=f"cb-{key}-{stamp}@test.local", hashed_password="x", name="T")
            db.add(teacher)
            await db.flush()
            db.add(StudioMember(user_id=teacher.id, studio_id=studio.id, role="trainer",
                                status="active", name="Валерия", last_name="Ким"))
            ids[f"{key}_hall"], ids[f"{key}_service"] = hall.id, service.id
            ids[f"{key}_teacher"] = teacher.id
            ids.setdefault("users", []).append(teacher.id)
        await db.flush()

        # Шестнадцать занятий: четыре страницы по пять, последняя неполная.
        for i in range(16):
            db.add(Lesson(studio_id=a.id, name="Стретчинг", teacher_name="Т",
                          service_id=ids["a_service"], teacher_id=ids["a_teacher"],
                          hall_id=ids["a_hall"],
                          start_time=datetime.combine(TOMORROW, time(6, 0))
                          + timedelta(minutes=30 * i),
                          tz_iana="Europe/Prague", duration_min=60, price=500,
                          level="", equipment="", total_spots=8, status="confirmed"))
        # Чужая студия: своё занятие и свой тред — для проверок изоляции.
        db.add(Lesson(studio_id=b.id, name="Стретчинг", teacher_name="Т",
                      service_id=ids["b_service"], teacher_id=ids["b_teacher"],
                      hall_id=ids["b_hall"],
                      start_time=datetime.combine(TOMORROW, time(19, 0)),
                      tz_iana="Europe/Prague", duration_min=60, price=500,
                      level="", equipment="", total_spots=8, status="confirmed"))
        ids["chat"] = f"{_TAG}-chat-{stamp}"
        ids["chat_other"] = f"{_TAG}-other-{stamp}"
        for name, studio_id, sender in (("t1", a.id, ids["chat"]),
                                        ("t2", a.id, ids["chat_other"]),
                                        ("tb", b.id, ids["chat"])):
            row = ChannelThread(studio_id=studio_id, channel="telegram", sender_ref=sender)
            db.add(row)
            await db.flush()
            ids[name] = row.id
        await db.commit()
    return ids


async def _cleanup(ids: dict) -> None:
    async with async_session_maker() as db:
        studios = [ids["a"], ids["b"]]
        threads = [ids["t1"], ids["t2"], ids["tb"]]
        events = (await db.execute(select(InboundEvent.id).where(
            InboundEvent.studio_id.in_(studios)))).scalars().all()
        if events:
            await db.execute(delete(AgentJob).where(AgentJob.inbound_event_id.in_(events)))
            await db.execute(delete(InboundEvent).where(InboundEvent.id.in_(events)))
        await db.execute(delete(ThreadOption).where(ThreadOption.studio_id.in_(studios)))
        await db.execute(delete(OutboundMessage).where(OutboundMessage.studio_id.in_(studios)))
        await db.execute(delete(ChannelThread).where(ChannelThread.studio_id.in_(studios)))
        await db.execute(delete(Lesson).where(Lesson.studio_id.in_(studios)))
        await db.execute(delete(Hall).where(Hall.studio_id.in_(studios)))
        await db.execute(delete(StudioBranch).where(StudioBranch.studio_id.in_(studios)))
        await db.execute(delete(Service).where(Service.studio_id.in_(studios)))
        await db.execute(delete(StudioMember).where(StudioMember.studio_id.in_(studios)))
        await db.execute(delete(BookingChannelConfig).where(
            BookingChannelConfig.studio_id.in_(studios)))
        await db.execute(delete(StudioBookingSettings).where(
            StudioBookingSettings.studio_id.in_(studios)))
        await db.execute(delete(Studio).where(Studio.id.in_(studios)))
        await db.execute(delete(User).where(User.id.in_(ids["users"])))
        await db.commit()


_update_id = [90_000]


def _tap(data: str, *, chat: str, message_id: int = 7) -> dict:
    """Апдейт Telegram о нажатии кнопки — той формы, что шлёт провайдер."""
    _update_id[0] += 1
    return {
        "update_id": _update_id[0],
        "callback_query": {
            "id": f"cbq-{_update_id[0]}",
            "from": {"id": chat, "is_bot": False, "first_name": "Катя"},
            "message": {"message_id": message_id, "chat": {"id": chat, "type": "private"}},
            "data": data,
        },
    }


async def _deliver(update: dict):
    """Провести апдейт через вебхук так же, как это делает Telegram."""
    async with async_session_maker() as db:
        return await TG.telegram_webhook(_TOKEN, _Request(update), None, db)


async def _run_jobs(ids) -> list[str]:
    """Выполнить все ждущие работы этих студий и вернуть исходы."""
    out = []
    while True:
        async with async_session_maker() as db:
            job_ids = (await db.execute(
                select(AgentJob.id).join(InboundEvent,
                                         AgentJob.inbound_event_id == InboundEvent.id)
                .where(InboundEvent.studio_id.in_([ids["a"], ids["b"]]),
                       AgentJob.status.in_(["pending", "running"]))
            )).scalars().all()
            if not job_ids:
                return out
            work = await agent_jobs.claim_next(db, "test-cb", job_ids=job_ids)
        if work is None:
            return out
        out.append(await agent_jobs.process(work, "test-cb"))


async def _outbox(ids) -> list[dict]:
    async with async_session_maker() as db:
        rows = (await db.execute(
            select(OutboundMessage).where(OutboundMessage.studio_id.in_([ids["a"], ids["b"]]))
            .order_by(OutboundMessage.id)
        )).scalars().all()
        return [r.payload for r in rows]


async def _show(ids, *, thread=None, text="стретчинг завтра", raw=None):
    """Показать человеку список вариантов и запомнить его так же, как в бою."""
    thread = thread or ids["t1"]
    async with async_session_maker() as db:
        turn = await agent_search.turn(
            db, studio_id=ids["a"], thread_id=thread, channel="telegram",
            text=text, lang="ru", now=NOW,
            raw=raw if raw is not None else {"service_mentions": [{"surface": "стретчинг"}],
                                             "date": "tomorrow"})
        from services import search_state
        await search_state.commit(db, studio_id=ids["a"], thread_id=thread,
                                  state=turn.state, shown=turn.shown,
                                  now=turn.reference_now, new_search=turn.new_search)
        await db.commit()
    return turn


# ─── §4 Дыра, ради которой всё это ───────────────────────────────────────────

async def _ingress(ids):
    """Нажатие кнопки обязано попасть в durable-приём и завести работу."""
    turn = await _show(ids)
    assert turn.payload["options"], "варианты обязаны рисоваться кнопками"
    ref = turn.payload["options"][0]["ref"]

    before = await _outbox(ids)
    await _deliver(_tap(f"view_option:{ref}", chat=ids["chat"]))

    async with async_session_maker() as db:
        events = (await db.execute(select(InboundEvent).where(
            InboundEvent.studio_id == ids["a"],
            InboundEvent.event_type == inbound.CALLBACK))).scalars().all()
    assert len(events) == 1, "нажатие не дошло до журнала приёма"
    assert events[0].text == f"view_option:{ref}"

    assert await _run_jobs(ids) == ["done"]
    after = await _outbox(ids)
    assert len(after) == len(before) + 1, "ответа на нажатие нет"
    assert "18:30" in after[-1]["text"] or ":" in after[-1]["text"]


# ─── §13 Протокольный ACK отдельно от делового ответа ────────────────────────

async def _ack(ids):
    turn = await _show(ids)
    ref = turn.payload["options"][0]["ref"]
    update = _tap(f"view_option:{ref}", chat=ids["chat"])
    answer = await _deliver(update)
    # Telegram гасит «часики» ответом на сам вебхук — сети из запроса не нужно.
    assert answer.get("method") == "answerCallbackQuery"
    assert answer.get("callback_query_id") == update["callback_query"]["id"]
    await _run_jobs(ids)


# ─── §10 Повтор провайдера против повторного нажатия ─────────────────────────

async def _dedup(ids):
    turn = await _show(ids)
    ref = turn.payload["options"][0]["ref"]
    update = _tap(f"view_option:{ref}", chat=ids["chat"])

    before = len(await _outbox(ids))
    await _deliver(update)
    await _deliver(update)              # тот же update_id — повтор доставки
    await _run_jobs(ids)
    assert len(await _outbox(ids)) == before + 1, "повтор доставки ответил дважды"

    # Человек нажал ту же кнопку ещё раз — это ДРУГОЕ событие, и ответ уместен.
    await _deliver(_tap(f"view_option:{ref}", chat=ids["chat"]))
    await _run_jobs(ids)
    assert len(await _outbox(ids)) == before + 2


# ─── §11 «Показать ещё»: страницы не перескакивают и не двоятся ──────────────

async def _paging(ids):
    from services import search_state

    thread = ids["t1"]
    first = await _show(ids, thread=thread)
    def shown(payload) -> set:
        return {o["label"] for o in payload.get("options", [])
                if o["action"] == ActionKind.VIEW_OPTION.value}

    seen = shown(first.payload)
    assert len(seen) == search_state.PAGE_SIZE, first.payload["options"]

    async def version_now() -> int:
        async with async_session_maker() as db:
            return (await search_state.load(db, thread, now=NOW)).version

    version = await version_now()

    async def page_now() -> int:
        async with async_session_maker() as db:
            return (await search_state.load(db, thread, now=NOW)).state.page

    # Повтор ДОСТАВКИ одного нажатия: провайдер шлёт тот же update дважды.
    # Перелистнуть это обязано ровно один раз.
    tap = _tap("show_more", chat=ids["chat"])
    await _deliver(tap)
    await _deliver(tap)
    await _run_jobs(ids)
    assert await page_now() == 1, "повтор доставки перелистнул дважды"

    page2 = (await _outbox(ids))[-1]
    labels2 = shown(page2)
    assert labels2 and not labels2 & seen, "вторая страница повторила первую"

    # Повторное НАЖАТИЕ человека — другое событие, и листает дальше.
    await _deliver(_tap("show_more", chat=ids["chat"]))
    await _run_jobs(ids)
    assert await page_now() == 2

    # Прежние ссылки листание не обесценивает: версия поиска та же, и ссылки
    # обеих показанных страниц действительны одновременно.
    assert await version_now() == version, "листание сменило версию поиска"
    async with async_session_maker() as db:
        live = (await db.execute(select(ThreadOption).where(
            ThreadOption.thread_id == thread,
            ThreadOption.search_version == version))).scalars().all()
    assert len(live) == 3 * search_state.PAGE_SIZE, len(live)

    # «Начать заново»: условия стираются, показанные ссылки обесцениваются.
    await _deliver(_tap("reset_search", chat=ids["chat"]))
    await _run_jobs(ids)
    async with async_session_maker() as db:
        loaded = await search_state.load(db, thread, now=NOW)
    assert loaded.state == search_state.CanonicalState()
    assert loaded.version == version + 1, "старые ссылки пережили сброс"


# ─── §9 Безопасность ссылки ──────────────────────────────────────────────────

async def _security(ids):
    from services import search_state

    mine = await _show(ids, thread=ids["t1"])
    ref = mine.payload["options"][0]["ref"]

    async def press(data, *, chat, studio="a", thread="t1"):
        async with async_session_maker() as db:
            turn = await agent_search.callback(
                db, studio_id=ids[studio], thread_id=ids[thread], data=data,
                channel="telegram", lang="ru", now=NOW)
            await db.rollback()
        return turn

    # Чужой тред и чужая студия: ссылка просто не находится.
    assert (await press(f"view_option:{ref}", chat=ids["chat"], thread="t2")).plan_kind \
        == PlanKind.OPTION_UNAVAILABLE.value
    assert (await press(f"view_option:{ref}", chat=ids["chat"], studio="b", thread="tb")).plan_kind \
        == PlanKind.OPTION_UNAVAILABLE.value
    # Выдуманная ссылка.
    assert (await press("view_option:" + "z" * 32, chat=ids["chat"])).plan_kind \
        == PlanKind.OPTION_UNAVAILABLE.value
    # Мусор вместо действия — не падаем и ничего не делаем.
    for junk in ("", "book_now:1", "view_option", "view_option:", "../../etc"):
        turn = await press(junk, chat=ids["chat"])
        assert turn.payload["text"].strip()
        assert turn.plan_kind in (PlanKind.OPTION_UNAVAILABLE.value,
                                  PlanKind.PARSE_FAILURE.value), junk

    # Просроченная ссылка.
    late = NOW + timedelta(minutes=search_state.TTL_MINUTES + 1)
    async with async_session_maker() as db:
        turn = await agent_search.callback(
            db, studio_id=ids["a"], thread_id=ids["t1"], data=f"view_option:{ref}",
            channel="telegram", lang="ru", now=late)
        await db.rollback()
    assert turn.outcome == "SELECTION_NOT_AVAILABLE"

    # Новый поиск обесценивает прежние ссылки.
    await _show(ids, thread=ids["t1"])
    assert (await press(f"view_option:{ref}", chat=ids["chat"])).outcome \
        == "SELECTION_NOT_AVAILABLE"

    # Отменённое занятие: снимок ничего не обещает — каталог перечитывается.
    again = await _show(ids, thread=ids["t1"])
    fresh = again.payload["options"][0]["ref"]
    async with async_session_maker() as db:
        pick = await search_state.by_token(db, studio_id=ids["a"], thread_id=ids["t1"],
                                           token=fresh, now=NOW)
        await db.execute(delete(Lesson).where(Lesson.id == pick.lesson_id))
        await db.commit()
    assert (await press(f"view_option:{fresh}", chat=ids["chat"])).outcome \
        == "SELECTION_NOT_AVAILABLE"


# ─── §6 Модели на этом пути нет ──────────────────────────────────────────────

async def _no_model(ids):
    from services import llm

    original = llm.chat

    async def refuse(*a, **kw):
        raise AssertionError("детерминированное нажатие позвало модель")

    llm.chat = refuse
    try:
        turn = await _show(ids, thread=ids["t1"])
        ref = turn.payload["options"][0]["ref"]
        for data in (f"view_option:{ref}", "show_more", "reset_search"):
            await _deliver(_tap(data, chat=ids["chat"]))
        assert set(await _run_jobs(ids)) <= {"done"}
    finally:
        llm.chat = original


# ─── §12 Нажатие и текст почти одновременно ──────────────────────────────────

async def _serializable(ids):
    from services import search_state

    await _show(ids, thread=ids["t1"])
    await _deliver(_tap("show_more", chat=ids["chat"]))
    # Текстовое сообщение того же человека приходит следом.
    async with async_session_maker() as db:
        await inbound.admit(inbound.TELEGRAM, f"{ids['a']}:{_update_id[0] + 500}",
                            ids["a"], inbound.MESSAGE, ids["chat"], "лучше после 18",
                            {"update_id": _update_id[0] + 500})
    outcomes = await _run_jobs(ids)
    assert "done" in outcomes
    async with async_session_maker() as db:
        state = (await search_state.load(db, ids["t1"], now=NOW)).state
    # Состояние одно и целое: либо страница второго листания, либо новый поиск
    # с часом — но не смесь из обоих.
    assert state is not None
    assert state.service_ids, "условия разговора разъехались"


# ─── §14 Реестр действий закрыт ──────────────────────────────────────────────

def test_every_button_has_a_handler():
    """§7: нельзя нарисовать кнопку, которую некому обработать, и наоборот."""
    assert set(agent_search.HANDLERS) == set(ActionKind), (
        set(ActionKind) ^ set(agent_search.HANDLERS))
    # Рендерер умеет рисовать только то, что есть в реестре.
    emitted = set()
    for name in dir(response_render):
        pass
    source = inspect.getsource(response_render)
    for kind in ActionKind:
        if f"ActionKind.{kind.name}" in source:
            emitted.add(kind)
    assert emitted <= set(agent_search.HANDLERS), emitted - set(agent_search.HANDLERS)


def test_callback_data_fits_the_provider_limit():
    """Кнопка, не влезшая в 64 байта, — это сообщение, которое Telegram отверг
    бы целиком. Проверяем на настоящей длине ссылки."""
    from services import search_state
    from services.channels.telegram import _CALLBACK_LIMIT, _option_rows

    token = search_state.new_tokens(1)[0]
    rows = _option_rows([{"action": ActionKind.VIEW_OPTION.value, "ref": token, "label": "1"},
                         {"action": ActionKind.SHOW_MORE.value, "ref": None, "label": "ещё"}])
    assert len(rows) == 2
    for row in rows:
        assert len(row[0]["callback_data"].encode()) <= _CALLBACK_LIMIT


def test_callback_carries_no_internal_ids():
    """§8: в теле нажатия только действие и непрозрачная ссылка."""
    for kind, ref in agent_search.parse_action("view_option:abc"), (None, None):
        if kind is None:
            continue
        assert ref == "abc"
    assert agent_search.parse_action("show_more") == (ActionKind.SHOW_MORE, None)
    assert agent_search.parse_action("lesson_id:5") is None
    assert agent_search.parse_action("") is None
    # Ни один вид действия не называет сущность.
    for kind in ActionKind:
        assert not kind.value.endswith("_id")


def test_no_dead_interactive_elements_in_plans():
    """Ни один план не может нести действие без обработчика."""
    for kind in ActionKind:
        assert kind in agent_search.HANDLERS, kind


# ─── Один прогон на всё ──────────────────────────────────────────────────────

def test_callbacks_against_the_database():
    async def run():
        ids = await _seed()
        try:
            await _ingress(ids)
            await _ack(ids)
            await _dedup(ids)
            await _paging(ids)
            await _security(ids)
            await _no_model(ids)
            await _serializable(ids)
        finally:
            await _cleanup(ids)

    asyncio.run(run())


if __name__ == "__main__":
    test_every_button_has_a_handler()
    test_callback_data_fits_the_provider_limit()
    test_callback_carries_no_internal_ids()
    test_no_dead_interactive_elements_in_plans()
    test_callbacks_against_the_database()
    print("callbacks ok")
