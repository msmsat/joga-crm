"""Память ассистента о студии (эпик AI-6, задача 16).

Проверяем ровно то, чем память отличается от «модель что-то там помнит»:
факт переживает диалог и попадает в промпт СЛЕДУЮЩЕГО, потолок в 40 фактов
объясняется человеком, а не срабатывает молча, и удаление действительно удаляет.

Отдельно — запрет, который держится не кодом, а описанием инструмента: ПДн
клиентов в этой таблице означали бы срок хранения, экспорт и удаление по
требованию. Проверяем, что запрет хотя бы написан и не пропадёт при правке.

Реальная БД, ручная чистка. Запуск из back/:  python -m tests.test_ai_memory
"""
import asyncio
import warnings

warnings.filterwarnings("ignore")

from fastapi import HTTPException
from sqlalchemy import delete, select

from database import async_session_maker
from dependencies import StudioContext
from models import AIStudioFact, Studio, StudioAISettings, StudioBillingPlan, StudioMember, User
from routers.ai.facts import create_fact, delete_fact, list_facts, studio_facts
from schemas.ai import FACTS_PER_STUDIO, StudioFactCreate
from services.ai_tools import TOOLS, call_tool
from services.assistant import build_messages, get_or_create_ai_settings

_OWNER_EMAIL = "ai-memory-owner@test.local"
_TRAINER_EMAIL = "ai-memory-trainer@test.local"


async def _seed() -> dict:
    async with async_session_maker() as db:
        studio = Studio(name="TEST-AI-MEMORY", timezone="UTC+0", currency="EUR")
        db.add(studio)
        await db.flush()
        sid = studio.id
        db.add_all([
            StudioBillingPlan(studio_id=sid, plan_name="pro"),
            StudioAISettings(studio_id=sid, system_prompt="Ты ассистент."),
        ])

        owner = User(email=_OWNER_EMAIL, hashed_password="x", name="Ольга")
        trainer = User(email=_TRAINER_EMAIL, hashed_password="x", name="Тимур")
        db.add_all([owner, trainer])
        await db.flush()
        db.add_all([
            StudioMember(studio_id=sid, user_id=owner.id, role="owner", status="active", name="Ольга"),
            StudioMember(studio_id=sid, user_id=trainer.id, role="trainer", status="active", name="Тимур"),
        ])
        await db.commit()
        return {"sid": sid, "owner_id": owner.id, "trainer_id": trainer.id}


async def _cleanup(sid: int) -> None:
    async with async_session_maker() as db:
        await db.execute(delete(AIStudioFact).where(AIStudioFact.studio_id == sid))
        await db.execute(delete(StudioAISettings).where(StudioAISettings.studio_id == sid))
        await db.execute(delete(StudioMember).where(StudioMember.studio_id == sid))
        await db.execute(delete(StudioBillingPlan).where(StudioBillingPlan.studio_id == sid))
        await db.execute(delete(User).where(User.email.in_([_OWNER_EMAIL, _TRAINER_EMAIL])))
        await db.execute(delete(Studio).where(Studio.id == sid))
        await db.commit()


def test_no_personal_data_warning_in_tool():
    """Запрет на ПДн живёт в описании инструмента — единственном месте, которое
    читает модель. Пропадёт формулировка — память станет второй карточкой
    клиента, со сроком хранения и экспортом."""
    text = TOOLS["remember_fact"].description
    for word in ("телефоны", "даты рождения", "КЛИЕНТОВ"):
        assert word in text, word
    # Карточки подтверждения у памяти нет: она не трогает данные студии.
    assert not TOOLS["remember_fact"].mutating and not TOOLS["forget_fact"].mutating


async def _run():
    ids = await _seed()
    sid = ids["sid"]
    try:
        async with async_session_maker() as db:
            owner = (await db.execute(select(User).where(User.id == ids["owner_id"]))).scalar_one()
            trainer = (await db.execute(select(User).where(User.id == ids["trainer_id"]))).scalar_one()
            as_owner = StudioContext(user=owner, studio_id=sid, role="owner")
            as_trainer = StudioContext(user=trainer, studio_id=sid, role="trainer")

            # Ассистент записывает факт сам — своим инструментом, без карточки.
            saved = await call_tool(
                "remember_fact", {"text": "По воскресеньям студия не работает"}, as_owner, db)
            assert saved["remembered"]["id"], saved
            fact_id = saved["remembered"]["id"]

            # Тот же факт второй раз — не вторая строка: список читает человек.
            again = await call_tool(
                "remember_fact", {"text": "По воскресеньям студия не работает"}, as_owner, db)
            assert again["remembered"]["id"] == fact_id, again

            # Тренер память не правит, но видит — ассистент строит на ней ответы
            # и ему тоже.
            assert "error" in await call_tool("remember_fact", {"text": "Что-то ещё"}, as_trainer, db)
            seen = await call_tool("get_studio_facts", {}, as_trainer, db)
            assert seen["count"] == 1, seen

        # Главное свойство памяти: факт попадает в промпт СЛЕДУЮЩЕГО диалога,
        # а не живёт в истории одного чата.
        async with async_session_maker() as db:
            owner = (await db.execute(select(User).where(User.id == ids["owner_id"]))).scalar_one()
            as_owner = StudioContext(user=owner, studio_id=sid, role="owner")
            messages = await build_messages(
                as_owner, db, await get_or_create_ai_settings(sid, db), [])
            # Слот [2] — некэшируемый: память своя у каждой студии.
            assert "По воскресеньям студия не работает" in messages[2]["content"]
            assert "По воскресеньям" not in messages[0]["content"] + messages[1]["content"]

        # Потолок объясняется человеку, а не выкидывает старый факт молча.
        async with async_session_maker() as db:
            owner = (await db.execute(select(User).where(User.id == ids["owner_id"]))).scalar_one()
            as_owner = StudioContext(user=owner, studio_id=sid, role="owner")
            for i in range(FACTS_PER_STUDIO - 1):
                await create_fact(body=StudioFactCreate(text=f"Факт номер {i}"), ctx=as_owner, db=db)
            assert len(await studio_facts(db, sid)) == FACTS_PER_STUDIO

            try:
                await create_fact(body=StudioFactCreate(text="Лишний факт"), ctx=as_owner, db=db)
                raise AssertionError("41-й факт записался")
            except HTTPException as exc:
                assert exc.status_code == 400
                assert exc.detail["code"] == "facts.limit_reached"
                # В сообщении должно быть, ЧТО делать, а не просто «нельзя».
                assert "Удалите" in exc.detail["message"], exc.detail

            # Удаление работает и освобождает место.
            await delete_fact(fact_id=fact_id, ctx=as_owner, db=db)
            assert len(await studio_facts(db, sid)) == FACTS_PER_STUDIO - 1
            rows = await list_facts(ctx=as_owner, db=db)
            assert all(r.id != fact_id for r in rows)
            # Чужой факт не удаляется — 404, а не тихий успех.
            try:
                await delete_fact(fact_id=999_999_999, ctx=as_owner, db=db)
                raise AssertionError("удалился несуществующий факт")
            except HTTPException as exc:
                assert exc.status_code == 404
    finally:
        await _cleanup(sid)


def test_ai_memory():
    asyncio.run(_run())


if __name__ == "__main__":
    test_no_personal_data_warning_in_tool()
    asyncio.run(_run())
    print("ALL PASS")
