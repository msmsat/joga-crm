"""Агентный цикл (эпик AI-5, задача 7).

Модель здесь подменена сценарием: настоящие вызовы в pytest запрещены (conftest),
да и проверять надо не качество ответов, а механику вокруг них — что жжёт квоту,
что попадает в промпт, что исполняется и что НЕ исполняется.

Реальная БД, ручная чистка. Запуск из back/:  python -m tests.test_ai_agent
"""
import asyncio
import warnings
from datetime import datetime, time, timedelta

warnings.filterwarnings("ignore")

from sqlalchemy import delete, func, select

from database import async_session_maker
from dependencies import StudioContext
from models import (
    AIChatMessage,
    AIChatSession,
    AIUsage,
    Lesson,
    Reservation,
    Studio,
    StudioAISettings,
    StudioBillingPlan,
    StudioMember,
    User,
)
from services import assistant, llm
from services.assistant import run_agent

_OWNER_EMAIL = "ai-agent-owner@test.local"
_TRAINER_EMAIL = "ai-agent-trainer@test.local"
_STUDIO_PROMPT = "Особая инструкция студии: всегда упоминай кленовый сироп."


class _ScriptedLLM:
    """Очередь ответов модели + запись того, с чем её звали."""

    def __init__(self, *replies):
        self.replies = list(replies)
        self.calls: list[dict] = []

    def install(self):
        async def _chat(messages, tools=None, tier=llm.TIER_FAST, cache_prefix_len=0):
            self.calls.append({
                "messages": messages, "tools": tools or [],
                "tier": tier, "cache_prefix_len": cache_prefix_len,
            })
            return self.replies.pop(0) if self.replies else _text("Готово.")
        llm.chat = _chat
        return self

    @property
    def tool_names(self) -> set[str]:
        return {t["function"]["name"] for t in self.calls[0]["tools"]}


def _usage(model="google/gemini-3-flash", cost=20):
    return llm.LLMUsage(model=model, prompt_tokens=10, cached_tokens=0,
                        completion_tokens=5, cost_micro=cost)


def _text(text: str) -> llm.LLMReply:
    return llm.LLMReply(text=text, tool_calls=[], usage=_usage())


def _calls(*pairs) -> llm.LLMReply:
    return llm.LLMReply(
        text=None,
        tool_calls=[{"id": f"c{i}", "name": n, "arguments": a} for i, (n, a) in enumerate(pairs)],
        usage=_usage(),
    )


async def _seed() -> dict:
    async with async_session_maker() as db:
        studio = Studio(name="TEST-AI-AGENT", timezone="UTC+0", currency="EUR")
        db.add(studio)
        await db.flush()
        sid = studio.id
        db.add_all([
            StudioBillingPlan(studio_id=sid, plan_name="pro"),
            StudioAISettings(studio_id=sid, system_prompt=_STUDIO_PROMPT),
        ])

        owner = User(email=_OWNER_EMAIL, hashed_password="x", name="Ольга")
        trainer = User(email=_TRAINER_EMAIL, hashed_password="x", name="Тимур")
        db.add_all([owner, trainer])
        await db.flush()
        db.add_all([
            StudioMember(studio_id=sid, user_id=owner.id, role="owner", status="active", name="Ольга"),
            StudioMember(studio_id=sid, user_id=trainer.id, role="trainer", status="active", name="Тимур"),
        ])

        start = datetime.combine(datetime.utcnow().date(), time(10, 0)) + timedelta(days=1)
        db.add_all([
            Lesson(studio_id=sid, name="Пилатес", teacher_name="Тимур", teacher_id=trainer.id,
                   start_time=start, price=0, level="", equipment=""),
            Lesson(studio_id=sid, name="Йога", teacher_name="Ольга", teacher_id=owner.id,
                   start_time=start + timedelta(hours=2), price=0, level="", equipment=""),
        ])
        session = AIChatSession(studio_id=sid, user_id=owner.id, title="Новый чат")
        db.add(session)
        await db.commit()
        return {"sid": sid, "owner_id": owner.id, "trainer_id": trainer.id, "session_id": session.id}


async def _cleanup(sid: int) -> None:
    async with async_session_maker() as db:
        session_ids = (await db.execute(
            select(AIChatSession.id).where(AIChatSession.studio_id == sid)
        )).scalars().all()
        if session_ids:
            await db.execute(delete(AIChatMessage).where(AIChatMessage.session_id.in_(session_ids)))
        await db.execute(delete(AIChatSession).where(AIChatSession.studio_id == sid))
        lesson_ids = (await db.execute(select(Lesson.id).where(Lesson.studio_id == sid))).scalars().all()
        if lesson_ids:
            await db.execute(delete(Reservation).where(Reservation.lesson_id.in_(lesson_ids)))
        await db.execute(delete(Lesson).where(Lesson.studio_id == sid))
        await db.execute(delete(AIUsage).where(AIUsage.studio_id == sid))
        await db.execute(delete(StudioAISettings).where(StudioAISettings.studio_id == sid))
        await db.execute(delete(StudioMember).where(StudioMember.studio_id == sid))
        await db.execute(delete(StudioBillingPlan).where(StudioBillingPlan.studio_id == sid))
        await db.execute(delete(User).where(User.email.in_([_OWNER_EMAIL, _TRAINER_EMAIL])))
        await db.execute(delete(Studio).where(Studio.id == sid))
        await db.commit()


async def _usage_rows(sid: int) -> tuple[int, int]:
    async with async_session_maker() as db:
        total = (await db.execute(
            select(func.count()).select_from(AIUsage).where(AIUsage.studio_id == sid)
        )).scalar() or 0
        billable = (await db.execute(
            select(func.count()).select_from(AIUsage)
            .where(AIUsage.studio_id == sid, AIUsage.billable.is_(True))
        )).scalar() or 0
        return total, billable


async def _ctx(db, user_id: int, sid: int, role: str) -> StudioContext:
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one()
    return StudioContext(user=user, studio_id=sid, role=role)


async def _settings(db, sid: int) -> StudioAISettings:
    return (await db.execute(
        select(StudioAISettings).where(StudioAISettings.studio_id == sid)
    )).scalar_one()


async def _run():
    real_chat = llm.chat
    ids = await _seed()
    sid = ids["sid"]
    today = datetime.utcnow().date()
    window = {"date_from": today.isoformat(), "date_to": (today + timedelta(days=3)).isoformat()}
    try:
        # ── Вопрос с инструментом: две итерации модели, одна billable-строка.
        script = _ScriptedLLM(
            _calls(("get_schedule", window)),
            _text("Завтра два занятия."),
        ).install()
        async with async_session_maker() as db:
            ctx = await _ctx(db, ids["owner_id"], sid, "owner")
            result = await run_agent(
                ctx, db, await _settings(db, sid), [], session_id=ids["session_id"],
                current_page="/dashboard/journal",
            )
        assert result.text == "Завтра два занятия."
        assert result.action_proposal is None
        assert len(script.calls) == 2
        assert await _usage_rows(sid) == (2, 1)   # платим за обе, квоту жжёт одна

        # Промпт собран в правильном порядке и несёт всё обязательное.
        first = script.calls[0]["messages"]
        assert first[0]["content"].startswith("# Карта интерфейса"), "карта интерфейса — первым слотом"
        assert "Velora AI" in first[1]["content"]
        assert _STUDIO_PROMPT in first[2]["content"], "промпт студии потерян — тихая регрессия AI-2"
        assert "EUR" in first[2]["content"] and "/dashboard/journal" in first[2]["content"]
        assert script.calls[0]["cache_prefix_len"] == 2
        assert script.calls[0]["tier"] == llm.TIER_FAST

        # Роль тренера не даёт ему финансовых инструментов даже в списке.
        script2 = _ScriptedLLM(_text("Не могу.")).install()
        async with async_session_maker() as db:
            ctx = await _ctx(db, ids["trainer_id"], sid, "trainer")
            await run_agent(ctx, db, await _settings(db, sid), [], session_id=ids["session_id"])
        assert "get_finance_summary" not in script2.tool_names
        assert "get_schedule" in script2.tool_names

        # ── Справочный вопрос: ни одного инструмента, ровно один вызов модели.
        async with async_session_maker() as db:
            await db.execute(delete(AIUsage).where(AIUsage.studio_id == sid))
            await db.commit()
        script3 = _ScriptedLLM(_text("Каталог → Студии → «+ Зал».")).install()
        async with async_session_maker() as db:
            ctx = await _ctx(db, ids["owner_id"], sid, "owner")
            result = await run_agent(ctx, db, await _settings(db, sid), [], session_id=ids["session_id"])
        assert len(script3.calls) == 1
        assert await _usage_rows(sid) == (1, 1)

        # ── Изменяющий инструмент: предложение, а не исполнение.
        async with async_session_maker() as db:
            lesson_id = (await db.execute(select(Lesson.id).where(Lesson.studio_id == sid))).scalars().first()
        _ScriptedLLM(_calls(("book_client", {"lesson_id": lesson_id, "client_id": 1}))).install()
        async with async_session_maker() as db:
            ctx = await _ctx(db, ids["owner_id"], sid, "owner")
            result = await run_agent(
                ctx, db, await _settings(db, sid), [], session_id=ids["session_id"],
            )
        assert result.action_proposal is not None
        assert result.action_proposal["tool"] == "book_client" and result.action_proposal["token"]
        assert result.text
        async with async_session_maker() as db:
            booked = (await db.execute(
                select(func.count()).select_from(Reservation).where(Reservation.lesson_id == lesson_id)
            )).scalar()
        assert booked == 0, "цикл исполнил изменяющий инструмент — этого делать нельзя"

        # ── Эскалация: инструмент вернул ошибку -> следующий вызов на MAIN, и только один раз.
        script4 = _ScriptedLLM(
            _calls(("get_lesson", {"lesson_id": 999_999_999})),
            _calls(("get_lesson", {"lesson_id": 999_999_998})),
            _text("Не нашёл такое занятие."),
        ).install()
        async with async_session_maker() as db:
            ctx = await _ctx(db, ids["owner_id"], sid, "owner")
            await run_agent(ctx, db, await _settings(db, sid), [], session_id=ids["session_id"])
        tiers = [c["tier"] for c in script4.calls]
        assert tiers == [llm.TIER_FAST, llm.TIER_MAIN, llm.TIER_MAIN], tiers

        # ── Лимит итераций: ответ непустой, а не разрыв диалога.
        script5 = _ScriptedLLM(*[_calls(("get_schedule", window)) for _ in range(8)]).install()
        async with async_session_maker() as db:
            ctx = await _ctx(db, ids["owner_id"], sid, "owner")
            result = await run_agent(ctx, db, await _settings(db, sid), [], session_id=ids["session_id"])
        assert result.text.strip()
        assert len(script5.calls) == assistant._MAX_ITERATIONS
    finally:
        llm.chat = real_chat
        await _cleanup(sid)


def test_ai_agent_loop():
    asyncio.run(_run())




# ─── Стрим (задача 8) ─────────────────────────────────────────────────────────

class _StreamingLLM:
    """chat_stream по сценарию: куски текста и вызовы инструментов."""

    def __init__(self, *turns):
        self.turns = list(turns)
        self.calls = 0

    def install(self):
        async def _chat_stream(messages, tools=None, tier=llm.TIER_FAST, cache_prefix_len=0):
            turn = self.turns[self.calls] if self.calls < len(self.turns) else {"chunks": ["Готово."]}
            self.calls += 1
            for chunk in turn.get("chunks", []):
                yield "token", chunk
            if turn.get("tool_calls"):
                yield "tool_calls", turn["tool_calls"]
            yield "usage", _usage()
        llm.chat_stream = _chat_stream
        return self


async def _run_stream():
    real_stream = llm.chat_stream
    ids = await _seed()
    sid = ids["sid"]
    today = datetime.utcnow().date()
    window = {"date_from": today.isoformat(), "date_to": (today + timedelta(days=3)).isoformat()}
    try:
        _StreamingLLM(
            {"tool_calls": [{"id": "c0", "name": "get_schedule", "arguments": window}]},
            {"chunks": ["Завтра ", "два ", "занятия."]},
        ).install()

        events = []
        async with async_session_maker() as db:
            ctx = await _ctx(db, ids["owner_id"], sid, "owner")
            async for kind, data in assistant.agent_events(
                ctx, db, await _settings(db, sid), [],
                session_id=ids["session_id"], stream=True,
            ):
                events.append((kind, data))

        kinds = [k for k, _ in events]
        assert kinds.count("token") == 3, kinds
        assert "tool_status" in kinds, kinds
        assert kinds[-1] == "result"
        # Текст приходит кусками, а собранный ответ совпадает с тем, что увидели.
        assert "".join(d for k, d in events if k == "token") == events[-1][1].text
        # usage посчитан за обе итерации, квоту жжёт одна.
        assert await _usage_rows(sid) == (2, 1)

        # Инструмент навигации даёт своё событие — без него задача 10 обрабатывала
        # бы событие, которого сервер не шлёт.
        _StreamingLLM(
            {"tool_calls": [{"id": "c0", "name": "navigate", "arguments": {"page": "/dashboard/reports"}}]},
            {"chunks": ["Открыл отчёты."]},
        ).install()
        events = []
        async with async_session_maker() as db:
            ctx = await _ctx(db, ids["owner_id"], sid, "owner")
            async for kind, data in assistant.agent_events(
                ctx, db, await _settings(db, sid), [],
                session_id=ids["session_id"], stream=True,
            ):
                events.append((kind, data))
        assert ("navigate", "/dashboard/reports") in events, events
    finally:
        llm.chat_stream = real_stream
        await _cleanup(sid)


def test_ai_agent_stream():
    asyncio.run(_run_stream())


if __name__ == "__main__":
    test_ai_agent_loop()
    test_ai_agent_stream()
    print("ALL PASS")


# ─── Деньги, права и отказы (задача 14) ──────────────────────────────────────

def test_cost_micro_survives_weird_usage():
    """Отчёт о деньгах не имеет права уронить чат: состав usage у вендоров
    разный, а провайдер присылает ключи со значением null."""
    from services.llm import _cost_micro

    flash, opus = "google/gemini-3-flash", "anthropic/claude-opus-5"
    plain = {"prompt_tokens": 1000, "completion_tokens": 100}
    assert _cost_micro(flash, {**plain, "prompt_tokens_details": None}) > 0
    assert _cost_micro(flash, {"prompt_tokens": 1000}) > 0          # нет completion_tokens
    assert _cost_micro(flash, {}) == 0
    assert _cost_micro(flash, {"prompt_tokens": None, "completion_tokens": None}) == 0
    # Кэш дешевле свежего входа, неизвестная модель — по самой дорогой ставке.
    cached = {**plain, "prompt_tokens_details": {"cached_tokens": 800}}
    assert _cost_micro(flash, cached) < _cost_micro(flash, plain)
    assert _cost_micro("who/knows-1", plain) == _cost_micro(opus, plain)


def test_ai_usage_has_no_message_text():
    """В таблице расхода нет и не должно быть текста промптов: там телефоны и
    даты рождения клиентов чужого бизнеса. Диалоги живут в AIChatMessage."""
    columns = {c.name for c in AIUsage.__table__.columns}
    assert not (columns & {"text", "prompt", "content", "message", "answer", "reply"})
    assert not any(str(c.type).upper().startswith("TEXT") for c in AIUsage.__table__.columns)


async def _run_quota_blocks_before_model():
    """Исчерпанная квота — 429 ДО обращения к модели: мок не вызван ни разу."""
    from fastapi import HTTPException

    from routers.ai.chat import send_message
    from schemas.ai import ChatMessageCreate

    real_chat = llm.chat
    ids = await _seed()
    sid = ids["sid"]
    called = []

    async def _boom(*_a, **_kw):
        called.append(1)
        raise AssertionError("модель вызвана при исчерпанной квоте")
    llm.chat = _boom
    try:
        async with async_session_maker() as db:
            # Тариф Pro: 1500 обращений. Дешевле упереться в денежный потолок.
            db.add(AIUsage(
                studio_id=sid, surface="crm", model="anthropic/claude-opus-5",
                cost_micro=13_000_000, billable=False,
            ))
            await db.commit()

        async with async_session_maker() as db:
            ctx = await _ctx(db, ids["owner_id"], sid, "owner")
            try:
                await send_message.__wrapped__(
                    ids["session_id"], ChatMessageCreate(text="Сколько записей завтра?"),
                    ctx=ctx, db=db,
                )
                raise AssertionError("запрос прошёл при исчерпанном потолке")
            except HTTPException as exc:
                assert exc.status_code == 429
                assert exc.detail["code"] == "ai_cost_cap", exc.detail
        assert not called
    finally:
        llm.chat = real_chat
        await _cleanup(sid)


async def _run_provider_down():
    """Провайдер настроен, но не отвечает — 503 assistant_unavailable, а не 500."""
    from fastapi import HTTPException

    real_chat = llm.chat

    async def _down(*_a, **_kw):
        raise HTTPException(status_code=503, detail="assistant_unavailable")
    llm.chat = _down

    ids = await _seed()
    sid = ids["sid"]
    try:
        async with async_session_maker() as db:
            ctx = await _ctx(db, ids["owner_id"], sid, "owner")
            try:
                await run_agent(ctx, db, await _settings(db, sid), [], session_id=ids["session_id"])
                raise AssertionError("ожидали 503")
            except HTTPException as exc:
                assert exc.status_code == 503 and exc.detail == "assistant_unavailable"
    finally:
        llm.chat = real_chat
        await _cleanup(sid)


async def _run_create_client_respects_plan_limit():
    """create_client через ИИ идёт ЧЕРЕЗ роутер, значит упирается в лимит тарифа.
    Свой INSERT обошёл бы check_plan_limit, и потолок перестал бы быть потолком."""
    from fastapi import HTTPException
    from sqlalchemy import func

    import routers.clients.profiles as profiles
    from models import Client
    from services.ai_tools import call_tool

    ids = await _seed()
    sid = ids["sid"]
    real_guard = profiles.check_plan_limit

    async def _limit_reached(*_a, **_kw):
        raise HTTPException(status_code=403, detail={
            "code": "limit_exceeded", "message": "Достигнут лимит тарифа: не более 100 клиентов.",
        })
    profiles.check_plan_limit = _limit_reached
    try:
        async with async_session_maker() as db:
            ctx = await _ctx(db, ids["owner_id"], sid, "owner")
            result = await call_tool("create_client", {
                "name": "Пётр", "phone": "+420777000999",
                "email": "ai-agent-limit@test.local", "city": "Прага",
            }, ctx, db)
            assert "error" in result and "лимит" in result["error"].lower(), result

        async with async_session_maker() as db:
            count = (await db.execute(
                select(func.count()).select_from(Client).where(Client.studio_id == sid)
            )).scalar()
        assert count == 0, "клиент создан в обход лимита тарифа"
    finally:
        profiles.check_plan_limit = real_guard
        await _cleanup(sid)


def test_ai_quota_blocks_before_model():
    asyncio.run(_run_quota_blocks_before_model())


def test_ai_provider_down():
    asyncio.run(_run_provider_down())


def test_ai_create_client_respects_plan_limit():
    asyncio.run(_run_create_client_respects_plan_limit())
