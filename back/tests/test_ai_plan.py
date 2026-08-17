"""План действий ассистента: сборка, ссылки между шагами, частичный отказ.

Здесь проверяется то, ради чего часть A делалась: «заведи Аню и поставь ей
занятие» обязано стать ОДНИМ подтверждением. До этого агентный цикл выходил на
первом изменяющем вызове, и такая задача распадалась на цепочку карточек,
которую модель не дотягивала до конца.

Модель подменена скриптом (_ScriptedLLM): проверяем сборку и исполнение, а не
сообразительность провайдера — за неё отвечает scripts/ai_eval на живой модели.
"""
import asyncio
from datetime import datetime, time, timedelta

import pytest
from sqlalchemy import delete, select

from database import async_session_maker
from dependencies import StudioContext
from models import (
    AIChatSession, Lesson, Service, StaffWorkingHours, Studio, StudioBillingPlan,
    StudioMember, User,
)
from services import llm
from services.ai_plan import (
    decode_plan_token, merge_answers, missing_fields, run_plan, sign_plan, summarize,
)
from services.assistant import get_or_create_ai_settings, run_agent

_OWNER_EMAIL = "test-ai-plan-owner@example.com"
_TRAINER_EMAIL = "test-ai-plan-trainer@example.com"


def _usage():
    return llm.LLMUsage(model="test", prompt_tokens=10, cached_tokens=0,
                        completion_tokens=5, cost_micro=0)


def _calls(*pairs) -> llm.LLMReply:
    return llm.LLMReply(
        text=None,
        tool_calls=[{"id": f"c{i}", "name": n, "arguments": a} for i, (n, a) in enumerate(pairs)],
        usage=_usage(),
    )


class _ScriptedLLM:
    """Очередь ответов модели; кончилась — обычный текст без вызовов."""

    def __init__(self, *replies):
        self.replies = list(replies)

    def install(self):
        async def _chat(messages, tools=None, tier=llm.TIER_FAST, cache_prefix_len=0):
            return self.replies.pop(0) if self.replies else llm.LLMReply(
                text="Готово.", tool_calls=[], usage=_usage())
        llm.chat = _chat
        return self


async def _seed() -> dict:
    async with async_session_maker() as db:
        studio = Studio(name="TEST-AI-PLAN", timezone="UTC+0", currency="CZK")
        db.add(studio)
        await db.flush()
        sid = studio.id
        db.add(StudioBillingPlan(studio_id=sid, plan_name="pro"))

        owner = User(email=_OWNER_EMAIL, hashed_password="x", name="Ольга")
        trainer = User(email=_TRAINER_EMAIL, hashed_password="x", name="Тимур")
        db.add_all([owner, trainer])
        await db.flush()
        db.add_all([
            StudioMember(studio_id=sid, user_id=owner.id, role="owner", status="active", name="Ольга"),
            StudioMember(studio_id=sid, user_id=trainer.id, role="trainer", status="active", name="Тимур"),
        ])
        service = Service(studio_id=sid, name="Стерлинг", price=0, duration_min=60)
        db.add(service)
        db.add_all([
            StaffWorkingHours(studio_id=sid, user_id=trainer.id, day_of_week=d,
                              is_open=True, open_time="09:00", close_time="18:00")
            for d in range(7)
        ])
        session = AIChatSession(studio_id=sid, user_id=owner.id, title="Новый чат")
        db.add(session)
        await db.commit()
        return {"sid": sid, "owner_id": owner.id, "trainer_id": trainer.id,
                "service_id": service.id, "session_id": session.id}


async def _cleanup(sid: int) -> None:
    async with async_session_maker() as db:
        await db.execute(delete(Lesson).where(Lesson.studio_id == sid))
        await db.execute(delete(AIChatSession).where(AIChatSession.studio_id == sid))
        await db.execute(delete(StaffWorkingHours).where(StaffWorkingHours.studio_id == sid))
        await db.execute(delete(Service).where(Service.studio_id == sid))
        await db.execute(delete(StudioMember).where(StudioMember.studio_id == sid))
        await db.execute(delete(StudioBillingPlan).where(StudioBillingPlan.studio_id == sid))
        await db.execute(delete(User).where(User.email.in_([_OWNER_EMAIL, _TRAINER_EMAIL])))
        await db.execute(delete(Studio).where(Studio.id == sid))
        await db.commit()


async def _ctx(db, user_id: int, sid: int, role: str) -> StudioContext:
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one()
    return StudioContext(user=user, studio_id=sid, role=role)


async def _run():
    ids = await _seed()
    sid = ids["sid"]
    original_chat = llm.chat
    try:
        tomorrow = datetime.combine(datetime.utcnow().date(), time(11, 0)) + timedelta(days=2)

        # ── Несколько изменяющих вызовов за ход — ОДИН план, а не первая карточка.
        _ScriptedLLM(_calls(
            ("create_lesson", {"service_id": ids["service_id"], "teacher_id": ids["trainer_id"],
                               "start_time": tomorrow.isoformat()}),
            ("create_lesson", {"service_id": ids["service_id"], "teacher_id": ids["trainer_id"],
                               "start_time": (tomorrow + timedelta(days=1)).isoformat()}),
        )).install()
        async with async_session_maker() as db:
            ctx = await _ctx(db, ids["owner_id"], sid, "owner")
            result = await run_agent(ctx, db, await get_or_create_ai_settings(sid, db), [],
                                     session_id=ids["session_id"])
        plan = result.plan_proposal
        assert plan is not None and len(plan["steps"]) == 2, plan
        assert [s["n"] for s in plan["steps"]] == [1, 2]
        assert plan["ready"], plan            # спрашивать нечего — окно сразу на «Проверьте»
        # Занятия НЕ созданы: план — это предложение, а не исполнение.
        async with async_session_maker() as db:
            assert (await db.execute(
                select(Lesson).where(Lesson.studio_id == sid))).scalars().all() == []

        # ── Ссылка на предыдущий шаг: сотрудник ещё не создан, id временный.
        # Модель берёт его из расписки ровно так же, как настоящий id из выдачи
        # инструмента, — нового синтаксиса ей учить не приходится.
        _ScriptedLLM(
            _calls(("create_staff", {"name": "Аня", "email": "test-ai-plan-anya@example.com",
                                     "password": "Sup3r-secret-1", "access_role": "trainer",
                                     "salary": 300})),
            _calls(("create_lesson", {"service_id": ids["service_id"], "teacher_id": -1,
                                      "start_time": tomorrow.isoformat()})),
        ).install()
        async with async_session_maker() as db:
            ctx = await _ctx(db, ids["owner_id"], sid, "owner")
            chained = (await run_agent(ctx, db, await get_or_create_ai_settings(sid, db), [],
                                       session_id=ids["session_id"])).plan_proposal
        assert len(chained["steps"]) == 2, chained
        # Второй шаг ссылается на первый, а не на выдуманного тренера.
        assert chained["steps"][1]["refs"] == {"teacher_id": 1}, chained["steps"][1]
        # Пароль в окно не уезжает: оно попадает в историю чата навсегда.
        assert "password" not in str(chained["steps"][0]["args"]), chained["steps"][0]

        # ── Токен плана: свой исполняется, чужой — нет.
        async with async_session_maker() as db:
            ctx = await _ctx(db, ids["owner_id"], sid, "owner")
            payload = decode_plan_token(chained["token"], ctx)
            assert len(payload["steps"]) == 2 and payload["jti"]
            stranger = await _ctx(db, ids["trainer_id"], sid, "trainer")
            with pytest.raises(Exception):
                decode_plan_token(chained["token"], stranger)

        # ── Исполнение: ссылка превращается в настоящий id.
        async with async_session_maker() as db:
            ctx = await _ctx(db, ids["owner_id"], sid, "owner")
            outcome = await run_plan(payload["steps"], ctx, db)
            await db.commit()
        assert len(outcome["created"]) == 2 and not outcome["failed"], outcome
        async with async_session_maker() as db:
            lesson = (await db.execute(
                select(Lesson).where(Lesson.studio_id == sid))).scalars().one()
            staff = (await db.execute(
                select(User).where(User.email == "test-ai-plan-anya@example.com"))).scalar_one()
            # Занятие уехало на СОЗДАННОГО шагом 1 человека, а не на -1 и не на
            # первого попавшегося: подстановка наугад записала бы не того.
            assert lesson.teacher_id == staff.id, (lesson.teacher_id, staff.id)

        # ── Упавший шаг не роняет остальные, а шаг, зависевший от него, —
        # пропускается: подставить сюда что-нибудь значило бы записать не туда.
        async with async_session_maker() as db:
            ctx = await _ctx(db, ids["owner_id"], sid, "owner")
            broken = await run_plan([
                {"tool": "create_lesson", "args": {"service_id": 999_999_999,
                                                   "teacher_id": ids["trainer_id"],
                                                   "start_time": tomorrow.isoformat()}},
                {"tool": "create_lesson", "args": {"service_id": ids["service_id"],
                                                   "teacher_id": -1,
                                                   "start_time": tomorrow.isoformat()}},
                # Третий шаг намеренно НЕ трогает клиентов: тест про план не
                # должен падать из-за чужой таблицы.
                {"tool": "create_service", "args": {"name": "Стретчинг", "price": 500}},
            ], ctx, db)
            await db.commit()
        assert len(broken["failed"]) == 2 and len(broken["created"]) == 1, broken
        assert broken["failed"][1]["n"] == 2 and "шаг 1" in broken["failed"][1]["error"], broken
        # Услуга третьим шагом всё-таки заведена: отказ первого её не отменяет.
        assert broken["created"][0]["n"] == 3, broken
        text = summarize(broken)
        assert text.startswith("Готово: 1 из 3."), text
    finally:
        llm.chat = original_chat
        await _cleanup(sid)


def test_ai_plan():
    asyncio.run(_run())


def test_plan_form_is_derived_from_schemas():
    """Вопросы формы считает сервер по схеме, а не придумывает модель.

    Без БД: это чистая функция, и держать её проверку в асинхронном тесте с
    посевом студии значило бы платить секундами за арифметику по model_fields.
    """
    asked = {f["name"]: f for f in missing_fields("create_lesson", {"service_id": 1})}
    assert set(asked) == {"teacher_id", "start_time"}, asked
    # Тип контрола — из типа поля, которое примет API: справочник для id,
    # календарь для даты. Ошибиться формой, собранной из той же схемы, негде.
    assert asked["teacher_id"]["control"] == "select"
    assert asked["teacher_id"]["source"] == "staff"
    assert asked["start_time"]["control"] == "datetime"
    # Необязательное вопросом не становится: цену и зал подставит карточка
    # услуги, и требовать их у человека запрещено правилами ассистента.
    assert "price" not in asked and "hall_id" not in asked

    # Ответы формы вливаются по НОМЕРУ шага — тому же, что человек видит в окне.
    steps = [{"tool": "create_lesson", "args": {"service_id": 1}}]
    assert merge_answers(steps, {"1": {"teacher_id": 4}})[0]["args"]["teacher_id"] == 4
    # Чужие номера и пустые значения молча отбрасываются: форму рисует наш фронт,
    # но подписан план сервером, и телу запроса доверия меньше, чем токену.
    assert merge_answers(steps, {"7": {"teacher_id": 4}})[0]["args"] == {"service_id": 1}


def test_plan_token_is_bound_to_studio_and_user():
    """Подпись плана — не формальность: токен из чужого чата не исполняется."""
    class _User:
        id = 1

    class _Ctx:
        role, studio_id, user = "owner", 10, _User()

    mine = _Ctx()
    token = sign_plan([{"tool": "create_client", "args": {"name": "Аня"}}], mine, 42)
    assert decode_plan_token(token, mine)["studio_id"] == 10

    other = _Ctx()
    other.studio_id = 11
    with pytest.raises(Exception):
        decode_plan_token(token, other)
    with pytest.raises(Exception):
        decode_plan_token("не токен вовсе", mine)
