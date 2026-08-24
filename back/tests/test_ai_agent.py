"""Агентный цикл (эпик AI-5, задача 7).

Модель здесь подменена сценарием: настоящие вызовы в pytest запрещены (conftest),
да и проверять надо не качество ответов, а механику вокруг них — что жжёт квоту,
что попадает в промпт, что исполняется и что НЕ исполняется.

Реальная БД, ручная чистка. Запуск из back/:  python -m tests.test_ai_agent
"""
import asyncio
import dataclasses
import warnings
from contextlib import contextmanager
from datetime import datetime, time, timedelta

warnings.filterwarnings("ignore")

from sqlalchemy import delete, func, select

from database import async_session_maker
from dependencies import StudioContext
from models import (
    AIChatMessage,
    AIChatSession,
    AIUsage,
    Client,
    Lesson,
    Reservation,
    Studio,
    StudioAISettings,
    StudioBillingPlan,
    StudioMember,
    User,
)
from services import ai_tools, assistant, llm
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
        # Клиент нужен настоящий: с задачи 14 сборка предложения разрешает id в
        # имена, и выдуманный client_id даёт текст «не нашёл», а не карточку.
        client = Client(studio_id=sid, name="Анна", last_name="Петрова",
                        phone="+420777000333", city="Прага")
        session = AIChatSession(studio_id=sid, user_id=owner.id, title="Новый чат")
        db.add_all([client, session])
        await db.commit()
        return {
            "sid": sid, "owner_id": owner.id, "trainer_id": trainer.id,
            "client_id": client.id, "session_id": session.id,
        }


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
        await db.execute(delete(Client).where(Client.studio_id == sid))
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
                current_page="/dashboard/journal?tab=day",
                viewport="phone",
            )
        assert result.text == "Завтра два занятия."
        assert result.plan_proposal is None
        assert len(script.calls) == 2
        assert await _usage_rows(sid) == (2, 1)   # платим за обе, квоту жжёт одна

        # Промпт собран в правильном порядке и несёт всё обязательное.
        first = script.calls[0]["messages"]
        # Первым слотом — ИНДЕКС карты, а не карта целиком (эпик AI-6, решение 4):
        # карта v2 весит ~13K токенов, и запись такого префикса в кэш стоила бы
        # дороже месячного потолка тарифа.
        assert first[0]["content"] == ai_tools.UI_INDEX, "индекс карты — первым слотом"
        assert "/dashboard/staff" in first[0]["content"]
        assert len(first[0]["content"]) < len(ai_tools.UI_MAP)
        assert "Velora AI" in first[1]["content"]
        assert _STUDIO_PROMPT in first[2]["content"], "промпт студии потерян — тихая регрессия AI-2"
        assert "EUR" in first[2]["content"] and "/dashboard/journal" in first[2]["content"]
        # Контекст страницы и устройства (эпик AI-6, задача 7): секция карты для
        # текущей страницы уезжает в слот [2] сразу, без вызова ui_section, а
        # телефону нельзя рассказывать про левую колонку.
        assert "## Журнал" in first[2]["content"], "секции текущей страницы нет в контексте"
        assert "<!--" not in first[2]["content"], "служебный комментарий карты уехал в промпт"
        assert "ТЕЛЕФОН" in first[2]["content"], "устройство не попало в контекст"
        # Ширина окна не кэшируется вместе с префиксом: слот [2] свой у каждого.
        assert script.calls[0]["cache_prefix_len"] == 2
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
        _ScriptedLLM(_calls(
            ("book_client", {"lesson_id": lesson_id, "client_id": ids["client_id"]}))).install()
        async with async_session_maker() as db:
            ctx = await _ctx(db, ids["owner_id"], sid, "owner")
            result = await run_agent(
                ctx, db, await _settings(db, sid), [], session_id=ids["session_id"],
            )
        # План на один шаг — окно человек видит всегда одно и то же, и «одно
        # действие» отличается от «двенадцати» только длиной списка внутри.
        plan = result.plan_proposal
        assert plan is not None and plan["token"] and len(plan["steps"]) == 1, plan
        step = plan["steps"][0]
        assert step["tool"] == "book_client" and step["n"] == 1
        # Спрашивать нечего — окно откроется сразу на «Проверьте», а кнопка
        # подтверждения доступна с первого шага: одно касание, а не три.
        assert plan["ready"] and not step["missing"], step
        assert result.text
        # Окно называет людей, а не номера (эпик AI-6, задача 14).
        assert step["entities"]["client_id"] == "Анна Петрова"
        assert "Пилатес" in step["entities"]["lesson_id"]
        assert "client_id" not in step["description"]

        # Тот же вызов после неоднозначного поиска — вопрос вместо карточки.
        _ScriptedLLM(
            _calls(("find_clients", {"query": "Анна"})),
            _calls(("book_client", {"lesson_id": lesson_id, "client_id": ids["client_id"]})),
        ).install()
        async with async_session_maker() as db:
            # Вторая Анна — чтобы поиск вернул больше одной записи.
            db.add(Client(studio_id=sid, name="Анна", last_name="Сидорова",
                          phone="+420777000444", city="Прага"))
            await db.commit()
        async with async_session_maker() as db:
            ctx = await _ctx(db, ids["owner_id"], sid, "owner")
            asked = await run_agent(
                ctx, db, await _settings(db, sid), [], session_id=ids["session_id"],
            )
        assert asked.plan_proposal is None, "окно при двух Аннах — выбор за модель"
        assert "Анна Петрова" in asked.text and "Анна Сидорова" in asked.text, asked.text
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

        # ── Отписка ПЕРВЫМ ходом без единого вопросительного знака — тоже отказ
        # работать. Ровно этот текст (428 знаков, ни одного «?») уехал человеку
        # на прод вместо окна подтверждения: примета «есть вопрос» его не ловила,
        # эскалация не срабатывала, и он читал допрос про пароли и id услуги,
        # которые собирает форма.
        refusal = (
            "Я могу добавить сотрудников, но мне нужен пароль для каждого нового "
            "сотрудника, а также их email и роль. Пароль вы придумываете сами, а я его "
            "передам сотрудникам. Без этих данных создать сотрудников я не смогу. "
            "Также мне понадобится id услуги «стерлинг», чтобы добавить её в расписание."
        )
        assert "?" not in refusal, "проверка потеряла смысл: в тексте появился вопрос"
        script_giveup = _ScriptedLLM(
            _text(refusal),
            _calls(("get_schedule", window)),
            _text("Поставил."),
        ).install()
        async with async_session_maker() as db:
            ctx = await _ctx(db, ids["owner_id"], sid, "owner")
            answered = await run_agent(
                ctx, db, await _settings(db, sid), [], session_id=ids["session_id"])
        assert [c["tier"] for c in script_giveup.calls][:2] == [llm.TIER_FAST, llm.TIER_MAIN],             [c["tier"] for c in script_giveup.calls]
        assert answered.text != refusal, "отписка дешёвой модели уехала человеку"

        # ── Лимит итераций: ответ непустой, а не разрыв диалога.
        script5 = _ScriptedLLM(*[_calls(("get_schedule", window)) for _ in range(8)]).install()
        async with async_session_maker() as db:
            ctx = await _ctx(db, ids["owner_id"], sid, "owner")
            result = await run_agent(ctx, db, await _settings(db, sid), [], session_id=ids["session_id"])
        assert result.text.strip()
        assert len(script5.calls) == assistant._MAX_ITERATIONS

        # ── Метрики цикла (эпик AI-6, задача 18): по ним и видно, что вопрос
        # упёрся в потолок итераций. Текста промптов в ai_usage по-прежнему нет.
        async with async_session_maker() as db:
            rows = (await db.execute(
                select(AIUsage.tools, AIUsage.iterations, AIUsage.escalated)
                .where(AIUsage.studio_id == sid)
                .order_by(AIUsage.id.desc()).limit(1)
            )).all()
            tools_used, iterations, escalated = rows[0]
            assert iterations == assistant._MAX_ITERATIONS, iterations
            assert "get_schedule" in (tools_used or ""), tools_used
            assert escalated is True, escalated
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

        # Инструмент открытия экрана даёт своё событие — без него фронт
        # обрабатывал бы событие, которого сервер не шлёт (эпик AI-6, задача 8).
        _StreamingLLM(
            {"tool_calls": [{"id": "c0", "name": "open_ui", "arguments": {
                "page": "/dashboard/staff", "intent": "staff.create",
            }}]},
            {"chunks": ["Открываю мастер добавления сотрудника."]},
        ).install()
        events = []
        async with async_session_maker() as db:
            ctx = await _ctx(db, ids["owner_id"], sid, "owner")
            async for kind, data in assistant.agent_events(
                ctx, db, await _settings(db, sid), [],
                session_id=ids["session_id"], stream=True,
            ):
                events.append((kind, data))
        assert ("ui_action", {
            "page": "/dashboard/staff", "tab": None,
            "intent": "staff.create", "entity_id": None,
        }) in events, events

        # Тренеру владельческий раздел не открывается: отказ текстом, а не адрес.
        _StreamingLLM(
            {"tool_calls": [{"id": "c0", "name": "open_ui", "arguments": {"page": "/dashboard/finances"}}]},
            {"chunks": ["Финансы доступны только владельцу."]},
        ).install()
        events = []
        async with async_session_maker() as db:
            ctx = await _ctx(db, ids["trainer_id"], sid, "trainer")
            async for kind, data in assistant.agent_events(
                ctx, db, await _settings(db, sid), [],
                session_id=ids["session_id"], stream=True,
            ):
                events.append((kind, data))
        assert not [e for e in events if e[0] == "ui_action"], events
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
            # Считаем именно этого клиента: в студии уже есть посевная Анна.
            count = (await db.execute(
                select(func.count()).select_from(Client).where(
                    Client.studio_id == sid, Client.email == "ai-agent-limit@test.local")
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


def test_gave_up_reads_a_refusal_without_a_question_mark():
    """Примета «модель сдалась» — содержание и вопрос, а не список слов."""
    assert assistant._gave_up("Мне нужен их email и пароль. " * 6)      # длинная отписка
    assert assistant._gave_up("Какой у него id?")                       # короткая, но вопрос
    assert assistant._gave_up("I'll need their emails, a password and the access role "
                              "for each of them before I can create anything at all here.")
    # Любезность дорогую голову не будит: за это платит студия на каждом «спасибо».
    assert not assistant._gave_up("Пожалуйста! Обращайтесь, если что-то ещё понадобится.")
    assert not assistant._gave_up("Готово.")
    assert not assistant._gave_up("")
    assert not assistant._gave_up(None)


def test_gave_up_spares_an_answer_made_of_the_persons_own_numbers():
    """Инструменты не нужны — и это не отказ работать.

    Замерено на стенде: «сравни два числа: 4000 и 20000» Flash отвечает верно и
    без единого инструмента, но ответ длиннее порога — и прежняя примета будила
    дорогую голову, удваивая цену верного ответа (873 -> 1939 мк$).
    """
    ask = "сравни два числа: 4000 и 20000"
    answer = ("20 000 больше 4 000:\n- В 5 раз (или 4 000 в 5 раз меньше 20 000)\n"
              "- На 16 000\n- 4 000 составляет 20% от 20 000")
    assert len(answer) >= assistant._GAVE_UP_LEN       # прежняя примета сработала бы
    assert not assistant._gave_up(answer, ask)

    # Тот же класс: человек принёс свои числа, ассистент посчитал по ним.
    assert not assistant._gave_up(
        "При 3 залах и 2 тренерах в день выходит максимум 24 занятия — по 12 на "
        "каждого тренера, если ставить их подряд без перерыва.",
        "у меня 3 зала и 2 тренера, сколько занятий в день максимум")


def test_gave_up_still_catches_a_refusal_when_the_person_gave_numbers():
    """Поблажка не должна открывать дыру: числа в ответе сами по себе не оправдание."""
    # Человек назвал число, но ответ — перечень недостающего, а не работа.
    assert assistant._gave_up(
        "Чтобы завести 4 сотрудников, мне нужен email и пароль для каждого из "
        "них, а также роль доступа и id услуги, на которую их ставить.",
        "заведи четверых")
    # Числа есть у обоих, но ответ — вопрос человеку, а не ответ ему.
    assert assistant._gave_up("На какие 4 дня ставить занятия?", "поставь 4 занятия")


# ── Наблюдаемость эскалации ───────────────────────────────────────────────────
#
# Голого `escalated` не хватало: веток переключения на дорогую модель четыре, и
# по флагу нельзя отличить «дешёвая отписалась вместо работы» от «вызван
# инструмент, которому положена умная модель». Ниже проверяется, что каждая
# ветка называет СЕБЯ, что причина не течёт в следующий вопрос и что в строке
# видно обе модели — с какой ушли и какая ответила на самом деле.

_CHEAP = "google/gemini-3.7-flash"
_SMART = "anthropic/claude-sonnet-5"


def _text_from(model: str, text: str = "Готово.") -> llm.LLMReply:
    return llm.LLMReply(text=text, tool_calls=[], usage=_usage(model=model))


def _calls_from(model: str, *pairs) -> llm.LLMReply:
    return llm.LLMReply(
        text=None,
        tool_calls=[{"id": f"c{i}", "name": n, "arguments": a} for i, (n, a) in enumerate(pairs)],
        usage=_usage(model=model),
    )


@contextmanager
def _tier_hint(name: str, tier: str):
    """Подсказка уровня на одном инструменте — на время блока.

    Реестр хранит замороженные dataclass-ы, поэтому подменяем целиком через
    replace и возвращаем прежний в finally: соседние тесты работают с тем же
    словарём в том же процессе.
    """
    before = ai_tools.TOOLS[name]
    ai_tools.TOOLS[name] = dataclasses.replace(before, tier_hint=tier)
    try:
        yield
    finally:
        ai_tools.TOOLS[name] = before


async def _escalations(sid: int) -> list[tuple]:
    """Строки расхода с причиной эскалации, по порядку."""
    async with async_session_maker() as db:
        return (await db.execute(
            select(AIUsage.escalation_reason, AIUsage.escalation_from_model,
                   AIUsage.model, AIUsage.escalated)
            .where(AIUsage.studio_id == sid, AIUsage.escalation_reason.is_not(None))
            .order_by(AIUsage.id)
        )).all()


async def _run_escalation_reasons() -> None:
    ids = await _seed()
    sid = ids["sid"]
    real_chat = llm.chat
    window = {"date_from": "2026-01-01", "date_to": "2026-01-07"}

    async def ask(*replies):
        """Прогнать один вопрос по сценарию и вернуть его строки с причиной."""
        async with async_session_maker() as db:
            await db.execute(delete(AIUsage).where(AIUsage.studio_id == sid))
            await db.commit()
        _ScriptedLLM(*replies).install()
        async with async_session_maker() as db:
            ctx = await _ctx(db, ids["owner_id"], sid, "owner")
            await run_agent(ctx, db, await _settings(db, sid), [], session_id=ids["session_id"])
        return await _escalations(sid)

    try:
        # ── Обычный вопрос: эскалации нет, причины нет.
        assert await ask(_text_from(_CHEAP, "Занятий завтра два.")) == []

        # ── Отписка первым ходом.
        refusal = ("Я могу добавить сотрудников, но мне нужен пароль для каждого, "
                   "а также их email и роль доступа. Без этого создать их я не смогу.")
        rows = await ask(_text_from(_CHEAP, refusal),
                         _calls_from(_SMART, ("get_schedule", window)),
                         _text_from(_SMART, "Поставил."))
        assert len(rows) == 1, rows
        reason, from_model, model, escalated = rows[0]
        assert reason == "gave_up_no_tools", reason
        # С какой ушли и какая ответила — разные колонки и разные модели.
        assert from_model == _CHEAP and model == _SMART, (from_model, model)
        assert escalated is True

        # ── Инструмент вернул ошибку.
        rows = await ask(_calls_from(_CHEAP, ("get_lesson", {"lesson_id": 999_000_111})),
                         _text_from(_SMART, "Не нашёл такое занятие."))
        assert [r[0] for r in rows] == ["tool_error"], rows
        assert rows[0][1] == _CHEAP and rows[0][2] == _SMART

        # ── Шаг плана отклонён: занятие в прошлом (precheck), а не сломанный инструмент.
        past = (datetime.utcnow() - timedelta(days=2)).replace(microsecond=0).isoformat()
        rows = await ask(
            _calls_from(_CHEAP, ("create_lesson", {
                "service_id": 1, "teacher_id": ids["trainer_id"], "start_time": past})),
            _text_from(_SMART, "Это время уже прошло."))
        assert [r[0] for r in rows] == ["plan_step_error"], rows

        # ── Аналитическое чтение больше НЕ утаскивает на умную модель.
        # Замер 24.08.2026: те же 7 вопросов стоили $0.3698 через Opus и $0.0180
        # на одном Flash при формальном результате 6/7 против 6/7.
        rows = await ask(_calls_from(_CHEAP, ("get_stats", {"period": "month"})),
                         _text_from(_CHEAP, "Выручка за месяц."))
        assert rows == [], rows

        # ── Но сама ветка жива: подсказку ставит тест, а не реестр.
        # Убрали неверный повод, а не механизм — если завтра найдётся класс
        # задач, которому умная модель действительно нужна, он должен работать.
        with _tier_hint("get_schedule", llm.TIER_SMART):
            rows = await ask(_calls_from(_CHEAP, ("get_schedule", window)),
                             _text_from(_SMART, "Собрал."))
        assert [r[0] for r in rows] == ["explicit_smart_tier"], rows

        # ── Четвёртая итерация без единой ошибки — это про глубину, не про поломку.
        rows = await ask(*[_calls_from(_CHEAP, ("get_schedule", window)) for _ in range(4)],
                         _text_from(_SMART, "Собрал."))
        assert [r[0] for r in rows] == ["iterations_deep"], rows

        # ── Причина не течёт в следующий вопрос: тот же цикл, эскалации нет.
        assert await ask(_text_from(_CHEAP, "Хорошо.")) == []

        # ── Эскалация случается не больше раза за вопрос.
        rows = await ask(_calls_from(_CHEAP, ("get_lesson", {"lesson_id": 999_000_222})),
                         _calls_from(_SMART, ("get_lesson", {"lesson_id": 999_000_333})),
                         _text_from(_SMART, "Не нашёл."))
        assert len(rows) == 1, rows
    finally:
        llm.chat = real_chat
        await _cleanup(sid)


def test_escalation_reason_names_the_branch_that_fired():
    asyncio.run(_run_escalation_reasons())


# ── request_id: вызовы одного вопроса связаны, а не соседствуют ───────────────
#
# До этой колонки строки одного вопроса собирались по соседству: billable плюс
# всё, что за ним по id. Два одновременных вопроса одной студии перемешивают
# цепочки, и «сколько стоил ЭТОТ вопрос» отвечалось догадкой. Тест ставит два
# прогона внахлёст барьером и требует, чтобы они разделялись.


async def _run_request_id_survives_interleaving() -> None:
    ids = await _seed()
    sid = ids["sid"]
    real_chat = llm.chat
    today = datetime.utcnow().date()
    window = {"date_from": today.isoformat(), "date_to": (today + timedelta(days=1)).isoformat()}
    barrier = asyncio.Barrier(2)

    async def _chat(messages, tools=None, tier=llm.TIER_FAST, cache_prefix_len=0):
        """Оба прогона входят в каждый вызов модели одновременно."""
        called = sum(1 for m in messages if m.get("role") == "tool")
        await barrier.wait()
        if called:
            return _text_from(_CHEAP, "Готово.")
        return _calls_from(_CHEAP, ("get_schedule", window))

    llm.chat = _chat
    try:
        async def one():
            async with async_session_maker() as db:
                ctx = await _ctx(db, ids["owner_id"], sid, "owner")
                return await run_agent(
                    ctx, db, await _settings(db, sid), [], session_id=ids["session_id"])

        first, second = await asyncio.wait_for(asyncio.gather(one(), one()), timeout=30)

        # Идентификатор возвращается наружу — чат кладёт его на сообщение.
        assert first.request_id and second.request_id
        assert first.request_id != second.request_id, "два вопроса получили один id"

        async with async_session_maker() as db:
            rows = (await db.execute(
                select(AIUsage.request_id, AIUsage.iterations, AIUsage.billable)
                .where(AIUsage.studio_id == sid).order_by(AIUsage.id)
            )).all()

        assert len(rows) == 4, rows
        by_request: dict[str, list] = {}
        for request_id, iterations, billable in rows:
            assert request_id is not None
            by_request.setdefault(request_id, []).append((iterations, billable))

        assert set(by_request) == {first.request_id, second.request_id}, by_request
        for request_id, calls in by_request.items():
            # Ровно два вызова, порядок читается по iterations, первый billable.
            assert [i for i, _b in calls] == [1, 2], (request_id, calls)
            assert [b for _i, b in calls] == [True, False], (request_id, calls)

        # Главное: строки ЧЕРЕДУЮТСЯ. Значит группировка по соседству дала бы
        # неверный ответ, и тест доказывает не только «id проставлен», а что он
        # вообще был нужен.
        order = [r[0] for r in rows]
        assert order[0] != order[1], f"прогоны не перемешались, тест ничего не проверил: {order}"
        assert order != sorted(order, key=order.index), order
    finally:
        llm.chat = real_chat
        await _cleanup(sid)


async def _run_request_id_survives_escalation() -> None:
    ids = await _seed()
    sid = ids["sid"]
    real_chat = llm.chat
    refusal = ("Я могу добавить сотрудников, но мне нужен пароль для каждого, "
               "а также их email и роль доступа. Без этого создать их я не смогу.")
    try:
        _ScriptedLLM(
            _text_from(_CHEAP, refusal),
            _text_from(_SMART, "Завёл всех четверых."),
        ).install()
        async with async_session_maker() as db:
            ctx = await _ctx(db, ids["owner_id"], sid, "owner")
            result = await run_agent(
                ctx, db, await _settings(db, sid), [], session_id=ids["session_id"])

        async with async_session_maker() as db:
            rows = (await db.execute(
                select(AIUsage.request_id, AIUsage.model, AIUsage.escalated,
                       AIUsage.escalation_reason)
                .where(AIUsage.studio_id == sid).order_by(AIUsage.id)
            )).all()

        assert len(rows) == 2, rows
        # Эскалация меняет модель и ярус, но не вопрос: id один на оба вызова.
        assert rows[0][0] == rows[1][0] == result.request_id, rows
        assert (rows[0][1], rows[1][1]) == (_CHEAP, _SMART), rows
        assert rows[0][2] is False and rows[1][2] is True, rows
        assert rows[1][3] == "gave_up_no_tools", rows
    finally:
        llm.chat = real_chat
        await _cleanup(sid)


def test_request_id_survives_interleaving():
    asyncio.run(_run_request_id_survives_interleaving())


def test_request_id_survives_escalation():
    asyncio.run(_run_request_id_survives_escalation())


async def _run_assistant_message_points_at_the_run() -> None:
    """Мост от расхода к оценке человека: сообщение знает свой прогон.

    Связь лежит на сообщении, а не на строках расхода: те пишутся своей сессией
    по ходу цикла, когда сообщения ещё нет. Так это одно присваивание в уже
    открытой транзакции чата — и висячих ссылок не бывает.
    """
    from routers.ai.chat import send_message
    from schemas.ai import ChatMessageCreate

    ids = await _seed()
    sid = ids["sid"]
    real_chat = llm.chat
    try:
        _ScriptedLLM(_text_from(_CHEAP, "Завтра два занятия.")).install()
        async with async_session_maker() as db:
            ctx = await _ctx(db, ids["owner_id"], sid, "owner")
            answer = await send_message.__wrapped__(
                ids["session_id"], ChatMessageCreate(text="что завтра?"), ctx=ctx, db=db)

        async with async_session_maker() as db:
            said = (await db.execute(
                select(AIChatMessage.request_id)
                .where(AIChatMessage.id == answer.assistant.id))).scalar_one()
            spent = (await db.execute(
                select(AIUsage.request_id).where(AIUsage.studio_id == sid))).scalars().all()

        assert said, "сообщение ассистента не знает, каким прогоном получено"
        assert set(spent) == {said}, (said, spent)
    finally:
        llm.chat = real_chat
        await _cleanup(sid)


def test_assistant_message_points_at_the_run():
    asyncio.run(_run_assistant_message_points_at_the_run())


# ── Уровень модели не выводится из того, какой инструмент позвали ─────────────
#
# Четыре аналитических чтения объявляли tier_hint=TIER_SMART, и любой вопрос,
# который их задевал, дальше отвечал Opus. Замер 24.08.2026 на семи таких
# вопросах: $0.3698 через Opus против $0.0180 на одном Flash, формальный
# результат 6/7 против 6/7. Единственное содержательное расхождение оказалось
# привязано к типу вопроса, а не к инструменту, — get_stats звался в четырёх
# вопросах и в трёх из них Flash справлялся полностью.

_WAS_SMART = ("get_stats", "get_finance_summary", "get_payroll", "get_segments")


def test_analytics_reads_no_longer_demand_the_expensive_model():
    for name in _WAS_SMART:
        assert ai_tools.TOOLS[name].tier_hint == llm.TIER_FAST, name


def test_no_capability_declares_the_smart_tier():
    """Повод исчез целиком, а не у четырёх известных имён: новый инструмент с
    подсказкой SMART обязан приезжать с замером, а не по образцу соседа."""
    declared = [t.name for t in ai_tools.TOOLS.values() if t.tier_hint == llm.TIER_SMART]
    assert declared == [], declared


def test_the_smart_hint_still_exists_as_a_mechanism():
    """Убрали неверный повод, а не механизм."""
    with _tier_hint("get_schedule", llm.TIER_SMART):
        assert ai_tools.TOOLS["get_schedule"].tier_hint == llm.TIER_SMART
    assert ai_tools.TOOLS["get_schedule"].tier_hint == llm.TIER_FAST


def test_removing_the_hint_did_not_touch_what_the_model_sees():
    """Подсказка уровня — свойство сервера. В схеме, которую видит модель, её
    не было и нет, поэтому снятие не могло изменить ни одного описания."""
    ctx = StudioContext(user=None, studio_id=1, role="owner")
    schema = {s["function"]["name"]: s["function"] for s in ai_tools.tools_for(ctx)}
    for name in _WAS_SMART:
        assert name in schema, name
        assert "tier" not in str(schema[name]).lower()
